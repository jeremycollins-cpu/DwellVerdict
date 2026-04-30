import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropicClient } from "../anthropic";
import { computeCostCents } from "../pricing";
import { logAiUsageEvent } from "../usage-events";

/**
 * regulatory-lookup — Haiku + web_search sub-task that researches
 * jurisdiction-level regulations relevant to a specific investment
 * thesis (M3.13).
 *
 * Pre-M3.13 this task always asked the STR-regulations question.
 * After M3.13 the prompt + tool + output schema branch on
 * `thesis_dimension`:
 *   - str            → STR permitting / OO-only carveouts / caps
 *   - ltr            → rent control / tenant rights / eviction
 *   - owner_occupied → homestead exemption / property tax / HOA
 *   - house_hacking  → ADU / room rental / OO STR carveouts
 *   - flipping       → permit timeline / transfer tax / flipper surtax
 *
 * Common fields across all theses: summary, notable_factors, sources.
 * Thesis-specific structured fields live under the discriminated
 * union arm and are persisted to regulatory_cache.thesis_specific_fields.
 *
 * Results are cached 30 days in regulatory_cache, scoped by
 * (city, state, thesis_dimension). Each (city, dimension) is one
 * cache row. Fair-housing guardrails live in the prompt files.
 */

export const REGULATORY_LOOKUP_TASK_TYPE = "regulatory_lookup";
export const REGULATORY_LOOKUP_PROMPT_VERSION = "v1";
export const REGULATORY_LOOKUP_MODEL = "claude-haiku-4-5";

export const REGULATORY_THESIS_DIMENSIONS = [
  "str",
  "ltr",
  "owner_occupied",
  "house_hacking",
  "flipping",
] as const;
export type RegulatoryThesisDimension =
  (typeof REGULATORY_THESIS_DIMENSIONS)[number];

// ---- Common per-arm trailing fields ------------------------------
// Every thesis arm shares `summary`, `notable_factors`, `sources`.
// Surfaces have their own validated structured shape per arm.

const summarySchema = z.string().min(1).max(1500);
const sourcesSchema = z.array(z.string().url()).min(1).max(6);
const notableFactorsSchema = z
  .array(z.string().min(1).max(280))
  .max(5)
  .default([]);

// ---- STR arm ----------------------------------------------------

export const RegulatoryStrFieldsSchema = z.object({
  str_legal: z.enum(["yes", "restricted", "no", "unclear"]).nullable(),
  permit_required: z.enum(["yes", "no", "unclear"]).nullable(),
  owner_occupied_only: z.enum(["yes", "no", "depends", "unclear"]).nullable(),
  cap_on_non_oo: z.string().max(500).nullable(),
  renewal_frequency: z.enum(["annual", "biennial", "none"]).nullable(),
  minimum_stay_days: z.number().int().nullable(),
});
export type RegulatoryStrFields = z.infer<typeof RegulatoryStrFieldsSchema>;

export const RegulatoryStrOutputSchema = RegulatoryStrFieldsSchema.extend({
  thesis_dimension: z.literal("str"),
  notable_factors: notableFactorsSchema,
  summary: summarySchema,
  sources: sourcesSchema,
});

// ---- LTR arm ----------------------------------------------------

export const RegulatoryLtrFieldsSchema = z.object({
  rent_control: z
    .enum(["none", "state_cap", "local_strict", "unclear"])
    .nullable(),
  rent_increase_cap: z.string().max(500).nullable(),
  just_cause_eviction: z.enum(["yes", "no", "unclear"]).nullable(),
  security_deposit_cap: z.string().max(500).nullable(),
  rental_registration_required: z.enum(["yes", "no", "unclear"]).nullable(),
  source_of_income_protection: z.enum(["yes", "no", "unclear"]).nullable(),
  eviction_friendliness: z
    .enum(["landlord_favorable", "balanced", "tenant_favorable", "unclear"])
    .nullable(),
});
export type RegulatoryLtrFields = z.infer<typeof RegulatoryLtrFieldsSchema>;

export const RegulatoryLtrOutputSchema = RegulatoryLtrFieldsSchema.extend({
  thesis_dimension: z.literal("ltr"),
  notable_factors: notableFactorsSchema,
  summary: summarySchema,
  sources: sourcesSchema,
});

// ---- Owner-occupied arm -----------------------------------------

export const RegulatoryOwnerOccupiedFieldsSchema = z.object({
  homestead_exemption: z.enum(["yes", "no", "unclear"]).nullable(),
  homestead_exemption_summary: z.string().max(500).nullable(),
  property_tax_rate_summary: z.string().max(500).nullable(),
  transfer_tax: z.string().max(500).nullable(),
  hoa_disclosure_required: z.enum(["yes", "no", "unclear"]).nullable(),
  hoa_approval_required: z.enum(["yes", "no", "depends", "unclear"]).nullable(),
  special_assessments_common: z.enum(["yes", "no", "unclear"]).nullable(),
});
export type RegulatoryOwnerOccupiedFields = z.infer<
  typeof RegulatoryOwnerOccupiedFieldsSchema
>;

export const RegulatoryOwnerOccupiedOutputSchema =
  RegulatoryOwnerOccupiedFieldsSchema.extend({
    thesis_dimension: z.literal("owner_occupied"),
    notable_factors: notableFactorsSchema,
    summary: summarySchema,
    sources: sourcesSchema,
  });

// ---- House-hacking arm -------------------------------------------

export const RegulatoryHouseHackingFieldsSchema = z.object({
  adu_legal: z.enum(["yes", "restricted", "no", "unclear"]).nullable(),
  jadu_legal: z.enum(["yes", "no", "unclear"]).nullable(),
  room_rental_legal: z.enum(["yes", "no", "unclear"]).nullable(),
  max_unrelated_occupants: z.number().int().nullable(),
  owner_occupied_str_carveout: z.enum(["yes", "no", "unclear"]).nullable(),
  owner_occupied_str_summary: z.string().max(500).nullable(),
  parking_requirement_per_unit: z.string().max(500).nullable(),
});
export type RegulatoryHouseHackingFields = z.infer<
  typeof RegulatoryHouseHackingFieldsSchema
>;

export const RegulatoryHouseHackingOutputSchema =
  RegulatoryHouseHackingFieldsSchema.extend({
    thesis_dimension: z.literal("house_hacking"),
    notable_factors: notableFactorsSchema,
    summary: summarySchema,
    sources: sourcesSchema,
  });

// ---- Flipping arm ------------------------------------------------

export const RegulatoryFlippingFieldsSchema = z.object({
  permit_timeline_summary: z.string().max(500).nullable(),
  gc_license_threshold_summary: z.string().max(500).nullable(),
  historic_district_risk: z.enum(["yes", "none", "unclear"]).nullable(),
  historic_district_summary: z.string().max(500).nullable(),
  flipper_surtax: z.enum(["yes", "no", "unclear"]).nullable(),
  flipper_surtax_summary: z.string().max(500).nullable(),
  transfer_tax_at_sale: z.string().max(500).nullable(),
  disclosure_requirements_summary: z.string().max(500).nullable(),
});
export type RegulatoryFlippingFields = z.infer<
  typeof RegulatoryFlippingFieldsSchema
>;

export const RegulatoryFlippingOutputSchema =
  RegulatoryFlippingFieldsSchema.extend({
    thesis_dimension: z.literal("flipping"),
    notable_factors: notableFactorsSchema,
    summary: summarySchema,
    sources: sourcesSchema,
  });

// ---- Discriminated union over all five arms ---------------------

export const RegulatoryLookupOutputSchema = z.discriminatedUnion(
  "thesis_dimension",
  [
    RegulatoryStrOutputSchema,
    RegulatoryLtrOutputSchema,
    RegulatoryOwnerOccupiedOutputSchema,
    RegulatoryHouseHackingOutputSchema,
    RegulatoryFlippingOutputSchema,
  ],
);
export type RegulatoryLookupOutput = z.infer<
  typeof RegulatoryLookupOutputSchema
>;

// Per-arm tool definitions. Each tool is exposed only when the
// matching prompt is loaded — Haiku gets one render tool per call.
type ToolDef = Anthropic.Messages.Tool;

const SHARED_TOOL_TRAILER = {
  notable_factors: {
    type: "array",
    items: { type: "string" },
    maxItems: 5,
    description:
      "Up to 5 short strings (≤280 chars each) capturing wrinkles a small operator should know — e.g. recent enforcement, HOA gotchas, special-district assessments. Empty array if nothing notable.",
  },
  summary: {
    type: "string",
    description:
      "2-4 plain-prose sentences describing the regulatory posture for this thesis. Lead with the most-binding rule.",
  },
  sources: {
    type: "array",
    items: { type: "string" },
    description:
      "1-6 URLs the model actually read. Prefer primary government / municipal sources.",
  },
} as const;

const STR_TOOL: ToolDef = {
  name: "render_regulatory_str",
  description:
    "Emit the structured STR regulation record. Call this exactly once after reading 2-4 authoritative sources.",
  input_schema: {
    type: "object",
    properties: {
      str_legal: {
        type: ["string", "null"],
        enum: ["yes", "restricted", "no", "unclear", null],
        description: "Whether STRs are legally allowed in residential zones.",
      },
      permit_required: {
        type: ["string", "null"],
        enum: ["yes", "no", "unclear", null],
        description: "Whether an STR permit/license is required.",
      },
      owner_occupied_only: {
        type: ["string", "null"],
        enum: ["yes", "no", "depends", "unclear", null],
        description:
          "Whether STRs are restricted to owner-occupied primary residences.",
      },
      cap_on_non_oo: {
        type: ["string", "null"],
        description:
          "One-sentence description of any cap on non-owner-occupied STRs, or null if none.",
      },
      renewal_frequency: {
        type: ["string", "null"],
        enum: ["annual", "biennial", "none", null],
        description: "Cadence of permit renewal.",
      },
      minimum_stay_days: {
        type: ["integer", "null"],
        description:
          "Minimum rental duration in nights. e.g., 30 means under-30-night stays are banned.",
      },
      ...SHARED_TOOL_TRAILER,
    },
    required: [
      "str_legal",
      "permit_required",
      "owner_occupied_only",
      "cap_on_non_oo",
      "renewal_frequency",
      "minimum_stay_days",
      "notable_factors",
      "summary",
      "sources",
    ],
  },
};

const LTR_TOOL: ToolDef = {
  name: "render_regulatory_ltr",
  description:
    "Emit the structured LTR landlord-tenant regulation record for this jurisdiction.",
  input_schema: {
    type: "object",
    properties: {
      rent_control: {
        type: ["string", "null"],
        enum: ["none", "state_cap", "local_strict", "unclear", null],
        description:
          "Whether rent control / rent stabilization applies — none, state-level cap, local strict ordinance, or unclear.",
      },
      rent_increase_cap: {
        type: ["string", "null"],
        description:
          "One-sentence description of the numeric cap if any. Else null.",
      },
      just_cause_eviction: {
        type: ["string", "null"],
        enum: ["yes", "no", "unclear", null],
        description:
          "Whether the jurisdiction requires a just cause for eviction beyond non-renewal.",
      },
      security_deposit_cap: {
        type: ["string", "null"],
        description:
          "Legal max security deposit. e.g., '2 months unfurnished'. Else null.",
      },
      rental_registration_required: {
        type: ["string", "null"],
        enum: ["yes", "no", "unclear", null],
        description:
          "Whether the city/county requires landlord rental registration / inspection.",
      },
      source_of_income_protection: {
        type: ["string", "null"],
        enum: ["yes", "no", "unclear", null],
        description:
          "Whether refusing Section 8 / housing-voucher tenants is prohibited.",
      },
      eviction_friendliness: {
        type: ["string", "null"],
        enum: [
          "landlord_favorable",
          "balanced",
          "tenant_favorable",
          "unclear",
          null,
        ],
        description:
          "Overall posture of the eviction process for this jurisdiction.",
      },
      ...SHARED_TOOL_TRAILER,
    },
    required: [
      "rent_control",
      "rent_increase_cap",
      "just_cause_eviction",
      "security_deposit_cap",
      "rental_registration_required",
      "source_of_income_protection",
      "eviction_friendliness",
      "notable_factors",
      "summary",
      "sources",
    ],
  },
};

const OWNER_OCCUPIED_TOOL: ToolDef = {
  name: "render_regulatory_owner_occupied",
  description:
    "Emit the structured owner-occupant regulation record (homestead, property tax, HOA, transfer tax).",
  input_schema: {
    type: "object",
    properties: {
      homestead_exemption: {
        type: ["string", "null"],
        enum: ["yes", "no", "unclear", null],
        description:
          "Whether the state offers a homestead exemption that reduces assessed value.",
      },
      homestead_exemption_summary: {
        type: ["string", "null"],
        description: "One-sentence specifics of the homestead exemption.",
      },
      property_tax_rate_summary: {
        type: ["string", "null"],
        description:
          "Effective property tax rate range with specifics (e.g., '~2.0% effective').",
      },
      transfer_tax: {
        type: ["string", "null"],
        description:
          "Real estate transfer tax rate at purchase or null if none.",
      },
      hoa_disclosure_required: {
        type: ["string", "null"],
        enum: ["yes", "no", "unclear", null],
        description:
          "Whether sellers must provide HOA documents / financials before closing.",
      },
      hoa_approval_required: {
        type: ["string", "null"],
        enum: ["yes", "no", "depends", "unclear", null],
        description:
          "Whether HOAs in this jurisdiction commonly require buyer-approval / right-of-first-refusal.",
      },
      special_assessments_common: {
        type: ["string", "null"],
        enum: ["yes", "no", "unclear", null],
        description:
          "Whether special-district assessments (Mello-Roos, CDD, school bonds) are common.",
      },
      ...SHARED_TOOL_TRAILER,
    },
    required: [
      "homestead_exemption",
      "homestead_exemption_summary",
      "property_tax_rate_summary",
      "transfer_tax",
      "hoa_disclosure_required",
      "hoa_approval_required",
      "special_assessments_common",
      "notable_factors",
      "summary",
      "sources",
    ],
  },
};

const HOUSE_HACKING_TOOL: ToolDef = {
  name: "render_regulatory_house_hacking",
  description:
    "Emit the structured house-hacking regulation record (ADU/JADU, room rental, OO STR carveouts).",
  input_schema: {
    type: "object",
    properties: {
      adu_legal: {
        type: ["string", "null"],
        enum: ["yes", "restricted", "no", "unclear", null],
        description:
          "Whether ADUs are permitted by-right on the relevant lot type.",
      },
      jadu_legal: {
        type: ["string", "null"],
        enum: ["yes", "no", "unclear", null],
        description: "Whether Junior ADUs (interior conversions) are allowed.",
      },
      room_rental_legal: {
        type: ["string", "null"],
        enum: ["yes", "no", "unclear", null],
        description:
          "Whether renting bedrooms in an owner-occupied home is explicitly allowed.",
      },
      max_unrelated_occupants: {
        type: ["integer", "null"],
        description:
          "Local cap on unrelated occupants per dwelling unit (U+2 / U+3), or null if none.",
      },
      owner_occupied_str_carveout: {
        type: ["string", "null"],
        enum: ["yes", "no", "unclear", null],
        description:
          "Whether the STR ordinance treats owner-occupied STRs differently from non-owner-occupied.",
      },
      owner_occupied_str_summary: {
        type: ["string", "null"],
        description:
          "One-sentence summary of the OO STR rules if a carveout exists.",
      },
      parking_requirement_per_unit: {
        type: ["string", "null"],
        description:
          "Off-street parking requirement when adding a unit, or null if none.",
      },
      ...SHARED_TOOL_TRAILER,
    },
    required: [
      "adu_legal",
      "jadu_legal",
      "room_rental_legal",
      "max_unrelated_occupants",
      "owner_occupied_str_carveout",
      "owner_occupied_str_summary",
      "parking_requirement_per_unit",
      "notable_factors",
      "summary",
      "sources",
    ],
  },
};

const FLIPPING_TOOL: ToolDef = {
  name: "render_regulatory_flipping",
  description:
    "Emit the structured flipping regulation record (permit timeline, transfer tax, surtax, historic overlay).",
  input_schema: {
    type: "object",
    properties: {
      permit_timeline_summary: {
        type: ["string", "null"],
        description:
          "Plain-prose summary of typical permit turnaround for residential renovation.",
      },
      gc_license_threshold_summary: {
        type: ["string", "null"],
        description:
          "Whether a GC license is required above a project-value threshold.",
      },
      historic_district_risk: {
        type: ["string", "null"],
        enum: ["yes", "none", "unclear", null],
        description:
          "Whether the city has historic / preservation overlays that constrain exterior changes.",
      },
      historic_district_summary: {
        type: ["string", "null"],
        description:
          "One-sentence summary of how historic-district rules typically affect renovation.",
      },
      flipper_surtax: {
        type: ["string", "null"],
        enum: ["yes", "no", "unclear", null],
        description:
          "Whether the jurisdiction levies a 'flip surtax' on short-hold resales.",
      },
      flipper_surtax_summary: {
        type: ["string", "null"],
        description: "Specifics of the flipper surtax if one applies.",
      },
      transfer_tax_at_sale: {
        type: ["string", "null"],
        description: "Real estate transfer tax the seller pays at closing.",
      },
      disclosure_requirements_summary: {
        type: ["string", "null"],
        description:
          "Material disclosure obligations on the seller (lead, asbestos, prior permits).",
      },
      ...SHARED_TOOL_TRAILER,
    },
    required: [
      "permit_timeline_summary",
      "gc_license_threshold_summary",
      "historic_district_risk",
      "historic_district_summary",
      "flipper_surtax",
      "flipper_surtax_summary",
      "transfer_tax_at_sale",
      "disclosure_requirements_summary",
      "notable_factors",
      "summary",
      "sources",
    ],
  },
};

const TOOL_BY_DIMENSION: Record<RegulatoryThesisDimension, ToolDef> = {
  str: STR_TOOL,
  ltr: LTR_TOOL,
  owner_occupied: OWNER_OCCUPIED_TOOL,
  house_hacking: HOUSE_HACKING_TOOL,
  flipping: FLIPPING_TOOL,
};

const PROMPT_FILE_BY_DIMENSION: Record<RegulatoryThesisDimension, string> = {
  str: "regulatory-lookup-str.v1.md",
  ltr: "regulatory-lookup-ltr.v1.md",
  owner_occupied: "regulatory-lookup-owner-occupied.v1.md",
  house_hacking: "regulatory-lookup-house-hacking.v1.md",
  flipping: "regulatory-lookup-flipping.v1.md",
};

function loadPromptTemplate(dimension: RegulatoryThesisDimension): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const filename = PROMPT_FILE_BY_DIMENSION[dimension];
  const candidates = [
    join(process.cwd(), "prompts", filename),
    join(here, "..", "..", "..", "..", "prompts", filename),
    join(process.cwd(), "..", "..", "prompts", filename),
  ];
  let lastErr: unknown;
  for (const p of candidates) {
    try {
      return readFileSync(p, "utf8");
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `regulatory-lookup prompt template '${filename}' not found. Tried: ${candidates.join(", ")}. ` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

function renderPrompt(vars: {
  city: string;
  state: string;
  dimension: RegulatoryThesisDimension;
}): { system: string; user: string } {
  const template = loadPromptTemplate(vars.dimension);
  const [, afterSystem] = template.split(/^## System\s*$/m);
  if (!afterSystem) throw new Error("prompt missing '## System' heading");
  const [systemText, userText] = afterSystem.split(/^## User\s*$/m);
  if (!systemText || !userText)
    throw new Error("prompt missing '## User' heading");

  const today = new Date().toISOString().slice(0, 10);
  const interpolate = (s: string) =>
    s
      .replaceAll("{{CITY}}", vars.city)
      .replaceAll("{{STATE}}", vars.state)
      .replaceAll("{{TODAY}}", today);

  return {
    system: interpolate(systemText).trim(),
    user: interpolate(userText).trim(),
  };
}

export type RegulatoryLookupInput = {
  city: string;
  state: string;
  thesisDimension: RegulatoryThesisDimension;
  /** Optional override; default 4 per ADR-6. */
  maxWebSearches?: number;
  /** Optional userId. When set, the call logs to ai_usage_events.
   *  Cache hits don't reach this task at all, so logging here only
   *  fires on cache miss. */
  userId?: string;
  /** Optional orgId for org-scoped cost analytics. */
  orgId?: string;
};

export type RegulatoryLookupSuccess = {
  ok: true;
  output: RegulatoryLookupOutput;
  observability: {
    modelVersion: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    costCents: number;
    webSearchCount: number;
  };
};

export type RegulatoryLookupFailure = {
  ok: false;
  error: string;
  observability: Partial<RegulatoryLookupSuccess["observability"]>;
};

/**
 * Run the thesis-aware regulatory lookup. Caller is responsible for
 * caching the output in regulatory_cache scoped by
 * (city, state, thesis_dimension).
 */
export async function lookupRegulatory(
  input: RegulatoryLookupInput,
): Promise<RegulatoryLookupSuccess | RegulatoryLookupFailure> {
  const maxSearches = input.maxWebSearches ?? 4;
  const dimension = input.thesisDimension;
  const renderTool = TOOL_BY_DIMENSION[dimension];

  let client: Anthropic;
  let prompt: { system: string; user: string };
  try {
    client = getAnthropicClient();
    prompt = renderPrompt({
      city: input.city,
      state: input.state,
      dimension,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `regulatory_setup_failed: ${message}`,
      observability: {
        modelVersion: REGULATORY_LOOKUP_MODEL,
        promptVersion: REGULATORY_LOOKUP_PROMPT_VERSION,
      },
    };
  }

  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    const stream = client.messages.stream(
      {
        model: REGULATORY_LOOKUP_MODEL,
        max_tokens: 1500,
        system: [
          {
            type: "text",
            text: prompt.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: prompt.user }],
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: maxSearches,
            allowed_callers: ["direct"],
          } as Anthropic.Messages.ToolUnion,
          renderTool,
        ],
      },
      {
        timeout: 120_000,
        maxRetries: 0,
      },
    );
    response = await stream.finalMessage();
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `anthropic_${err.status ?? "error"}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("[regulatory] Anthropic call failed", {
      message,
      elapsedMs: Date.now() - startedAt,
      city: input.city,
      state: input.state,
      thesisDimension: dimension,
    });
    return {
      ok: false,
      error: message,
      observability: {
        modelVersion: REGULATORY_LOOKUP_MODEL,
        promptVersion: REGULATORY_LOOKUP_PROMPT_VERSION,
      },
    };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadInputTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheCreationInputTokens =
    response.usage.cache_creation_input_tokens ?? 0;
  const webSearchCount = response.content.filter(
    (b) => b.type === "server_tool_use" && b.name === "web_search",
  ).length;

  console.log("[regulatory] call complete", {
    city: input.city,
    state: input.state,
    thesisDimension: dimension,
    elapsedMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    webSearchCount,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    stopReason: response.stop_reason,
  });

  const costCents = computeCostCents({
    model: REGULATORY_LOOKUP_MODEL,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    webSearchCount,
  });

  if (input.userId) {
    await logAiUsageEvent({
      userId: input.userId,
      orgId: input.orgId,
      task: "regulatory-lookup",
      model: REGULATORY_LOOKUP_MODEL,
      inputTokens,
      outputTokens,
      cacheReadInputTokens,
      cacheCreationInputTokens,
      webSearchCount,
      costCents,
      durationMs: Date.now() - startedAt,
    });
  }

  const observability = {
    modelVersion: REGULATORY_LOOKUP_MODEL,
    promptVersion: REGULATORY_LOOKUP_PROMPT_VERSION,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    costCents,
    webSearchCount,
  };

  const renderCall = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock =>
      b.type === "tool_use" && b.name === renderTool.name,
  );

  if (!renderCall) {
    return {
      ok: false,
      error:
        `Model did not call ${renderTool.name}. ` +
        `stop_reason=${response.stop_reason}. Regulatory lookup aborted.`,
      observability,
    };
  }

  // The discriminated-union schema needs `thesis_dimension` on the
  // payload to know which arm to validate against. The model's
  // tool input doesn't carry that field — we attach it server-side
  // based on which tool actually fired.
  const payload = {
    ...(renderCall.input as Record<string, unknown>),
    thesis_dimension: dimension,
  };

  const parsed = RegulatoryLookupOutputSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "render_regulatory output failed schema validation: " +
        parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      observability,
    };
  }

  return {
    ok: true,
    output: parsed.data,
    observability,
  };
}
