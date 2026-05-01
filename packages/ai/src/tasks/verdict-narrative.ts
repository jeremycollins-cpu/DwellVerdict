import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropicClient } from "../anthropic";
import { routeVerdictNarrative, type RoutingReason } from "../model-router";
import { computeCostCents } from "../pricing";
import { logAiUsageEvent } from "../usage-events";
import type { VerdictScore } from "../scoring";

/**
 * verdict-narrative — Haiku synthesis that writes the 2-3 paragraph
 * narrative for a verdict given pre-computed signals + score per
 * ADR-6.
 *
 * Does NOT decide the BUY/WATCH/PASS. That's set by scoreVerdict()
 * upstream. This task only writes the prose.
 */

export const VERDICT_NARRATIVE_TASK_TYPE = "verdict_narrative";
/**
 * v3 (M3.6) — adds thesis context (thesis_type, goal_type, pricing,
 * expense fields) so the narrative can frame around the user's
 * actual investment plan rather than a generic STR view. The tool
 * schema is unchanged from v2; only the prompt template gained
 * `{{THESIS_*}}`, `{{GOAL_*}}`, and pricing/expense placeholders.
 *
 * v2 (M3.3) — added structured `metrics` + `citations` per evidence
 * domain. Existing v1/v2 verdict rows in production are preserved
 * verbatim; the frontend type-guards on render and falls back to
 * the legacy 4-card layout when the shape predates the structured
 * fields.
 */
export const VERDICT_NARRATIVE_PROMPT_VERSION = "v3";

/**
 * Default model for verdict-narrative. Kept exported for backward
 * compatibility — callers that import VERDICT_NARRATIVE_MODEL still
 * work, but the actual model on a given call is decided at runtime
 * by routeVerdictNarrative(confidence) (see model-router.ts).
 */
export const VERDICT_NARRATIVE_MODEL = "claude-haiku-4-5";

/**
 * Per-domain evidence. The narrative summary is required; metrics
 * and citations are optional because not every property has every
 * metric (e.g. no HOA → no hoa_status). The model is instructed to
 * emit fields it has data for and omit the rest.
 */
/**
 * M3.10 fix-forward — citation `url` accepts either a real URL OR
 * one of two non-URL sentinels (`"user-provided"` /
 * `"intake-data"`). Rationale: when the model cites the user's
 * intake answers as a source ("rent assumption per intake"), there
 * is no clickable URL to point at — the prior `.url()` validator
 * was rejecting otherwise-valid tool calls. The UI checks for
 * these sentinels and renders a non-clickable "From your intake"
 * chip instead of an `<a>`. See evidence-card.tsx.
 *
 * Future sentinels can be added as new literal values without
 * loosening the URL validation for the actual-URL case.
 */
export const CITATION_URL_SENTINELS = ["user-provided", "intake-data"] as const;
export type CitationUrlSentinel = (typeof CITATION_URL_SENTINELS)[number];

const CitationUrlSchema = z.union([
  z.string().url(),
  z.literal("user-provided"),
  z.literal("intake-data"),
]);

const CitationSchema = z.object({
  url: CitationUrlSchema,
  label: z.string().min(1).max(120),
});

const VARIANCE_FLAG_VALUES = [
  "aligned",
  "low",
  "high",
  "significantly_low",
  "significantly_high",
] as const;

const CompsEvidenceSchema = z.object({
  // M3.8 fix-forward: bumped 500 → 800 chars after Roseville LTR
  // verdict regeneration produced summaries that legitimately
  // needed more room. With M3.7 (FEMA/USGS/Census) + M3.10 (schools)
  // + M3.13 (thesis-aware regulatory) + M3.11 (rental comps) all
  // flowing into v3 narrative simultaneously, summaries on real
  // verdicts genuinely run 600-800 chars. The 500 ceiling was
  // calibrated when summaries were sparse-data placeholders.
  summary: z.string().min(1).max(800),
  metrics: z
    .object({
      count: z.number().int().nonnegative().optional(),
      // Legacy STR fields (USD float) — kept for backwards-compat with
      // pre-M3.11 verdicts. New STR verdicts prefer the *_cents fields.
      median_adr: z.number().nonnegative().optional(),
      occupancy: z.number().min(0).max(1).optional(),
      // M3.11 — LTR rental comp metrics (cents to align with intake).
      median_monthly_rent_cents: z.number().int().nonnegative().optional(),
      rent_range_low_cents: z.number().int().nonnegative().optional(),
      rent_range_high_cents: z.number().int().nonnegative().optional(),
      // M3.11 — STR rental comp metrics (cents).
      median_adr_cents: z.number().int().nonnegative().optional(),
      adr_range_low_cents: z.number().int().nonnegative().optional(),
      adr_range_high_cents: z.number().int().nonnegative().optional(),
      median_occupancy: z.number().min(0).max(1).optional(),
      seasonality: z.enum(["high", "moderate", "low"]).optional(),
      // M3.11 — variance flags. The orchestrator computes these from
      // user intake vs market median; the model surfaces them in the
      // narrative when materially off-market.
      intake_variance_flag: z.enum(VARIANCE_FLAG_VALUES).optional(),
      intake_variance_ratio: z.number().nonnegative().optional(),
    })
    .optional(),
  citations: z.array(CitationSchema).max(6).optional(),
});

const RevenueEvidenceSchema = z.object({
  // M3.8 fix-forward: 500 → 800 (see CompsEvidenceSchema comment).
  summary: z.string().min(1).max(800),
  metrics: z
    .object({
      annual_estimate: z.number().nonnegative().optional(),
      seasonality: z.enum(["high", "moderate", "low"]).optional(),
      cap_rate: z.number().min(0).max(1).optional(),
    })
    .optional(),
  citations: z.array(CitationSchema).max(6).optional(),
});

const RegulatoryEvidenceSchema = z.object({
  // M3.8 fix-forward: 500 → 800. Roseville LTR rejected at 565
  // chars (AB 1482 + Chapter 202 + SB 329 + deposits + eviction).
  summary: z.string().min(1).max(800),
  metrics: z
    .object({
      str_status: z
        .enum(["permitted", "restricted", "prohibited", "unclear"])
        .optional(),
      hoa_status: z
        .enum(["no_hoa", "hoa_neutral", "hoa_restrictive", "unverified"])
        .optional(),
      registration_required: z.boolean().optional(),
    })
    .optional(),
  citations: z.array(CitationSchema).max(6).optional(),
});

const LocationEvidenceSchema = z.object({
  // M3.8 fix-forward: 500 → 800. Roseville LTR rejected at 580
  // chars (walk + amenities + 4 school ratings + notable schools +
  // flood zone + wildfire history all flowing in post-M3.10).
  summary: z.string().min(1).max(800),
  metrics: z
    .object({
      walk_score: z.number().int().min(0).max(100).optional(),
      flood_zone: z.string().min(1).max(20).optional(),
      crime_rate_rank: z.enum(["low", "moderate", "high"]).optional(),
      nearby_rating: z.number().min(0).max(5).optional(),
      // M3.10 — school quality metrics. Optional throughout so the
      // model can surface them only when (a) thesis cares about
      // schools (LTR / owner-occupied / house-hacking / flipping)
      // and (b) the schools lookup returned data_quality != "unavailable".
      // Median ratings are 1–10 on the GreatSchools scale.
      elementary_school_rating_median: z.number().min(1).max(10).optional(),
      middle_school_rating_median: z.number().min(1).max(10).optional(),
      high_school_rating_median: z.number().min(1).max(10).optional(),
      notable_schools: z.array(z.string().min(1).max(120)).max(3).optional(),
    })
    .optional(),
  citations: z.array(CitationSchema).max(6).optional(),
});

export const VerdictNarrativeOutputSchema = z.object({
  narrative: z.string().min(50).max(2000),
  summary: z.string().min(1).max(400),
  data_points: z.object({
    comps: CompsEvidenceSchema,
    revenue: RevenueEvidenceSchema,
    regulatory: RegulatoryEvidenceSchema,
    location: LocationEvidenceSchema,
  }),
});
export type VerdictNarrativeOutput = z.infer<typeof VerdictNarrativeOutputSchema>;
export type CompsEvidence = z.infer<typeof CompsEvidenceSchema>;
export type RevenueEvidence = z.infer<typeof RevenueEvidenceSchema>;
export type RegulatoryEvidence = z.infer<typeof RegulatoryEvidenceSchema>;
export type LocationEvidence = z.infer<typeof LocationEvidenceSchema>;

const CITATION_SCHEMA = {
  type: "object" as const,
  properties: {
    url: { type: "string" as const, description: "Source URL." },
    label: {
      type: "string" as const,
      description: "Short human-readable label (e.g. 'FEMA flood map').",
    },
  },
  required: ["url", "label"],
};

const RENDER_VERDICT_NARRATIVE_TOOL: Anthropic.Messages.Tool = {
  name: "render_verdict_narrative",
  description:
    "Emit the verdict narrative + summary + structured per-domain evidence. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      narrative: {
        type: "string",
        description: "2-3 paragraphs, ~140-180 words, separated by '\\n\\n'.",
      },
      summary: {
        type: "string",
        description: "One-sentence headline ≤140 chars for card previews.",
      },
      data_points: {
        type: "object",
        properties: {
          comps: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description: "One sentence summarizing the comp situation.",
              },
              metrics: {
                type: "object",
                description:
                  "Structured comp metrics. Omit any fields you don't have data for. New verdicts prefer *_cents fields; legacy median_adr (USD float) and occupancy (0..1) stay valid for backwards-compat.",
                properties: {
                  count: {
                    type: "integer",
                    description: "Total comp count (e.g. 15).",
                  },
                  median_adr: {
                    type: "number",
                    description:
                      "Legacy: median Average Daily Rate (USD float). Prefer median_adr_cents.",
                  },
                  occupancy: {
                    type: "number",
                    description:
                      "Legacy: median occupancy 0..1. Prefer median_occupancy.",
                  },
                  median_monthly_rent_cents: {
                    type: "integer",
                    description:
                      "M3.11 LTR: median monthly rent in cents (e.g. 240000 = $2,400). Emit only for LTR/house_hacking thesis when ltr_comps signal present.",
                  },
                  rent_range_low_cents: {
                    type: "integer",
                    description:
                      "M3.11 LTR: low end of typical rent range in cents (~25th percentile).",
                  },
                  rent_range_high_cents: {
                    type: "integer",
                    description:
                      "M3.11 LTR: high end of typical rent range in cents (~75th percentile).",
                  },
                  median_adr_cents: {
                    type: "integer",
                    description:
                      "M3.11 STR: median nightly rate in cents (e.g. 35000 = $350). Emit only for STR thesis when str_comps signal present.",
                  },
                  adr_range_low_cents: {
                    type: "integer",
                    description:
                      "M3.11 STR: low end of typical ADR range in cents.",
                  },
                  adr_range_high_cents: {
                    type: "integer",
                    description:
                      "M3.11 STR: high end of typical ADR range in cents.",
                  },
                  median_occupancy: {
                    type: "number",
                    description:
                      "M3.11 STR: median annual occupancy as 0..1 ratio.",
                  },
                  seasonality: {
                    type: "string",
                    enum: ["high", "moderate", "low"],
                    description:
                      "M3.11 STR: peak/off-peak swing classification from str_comps signal.",
                  },
                  intake_variance_flag: {
                    type: "string",
                    enum: [
                      "aligned",
                      "low",
                      "high",
                      "significantly_low",
                      "significantly_high",
                    ],
                    description:
                      "M3.11: how the user's intake (rent or ADR) compares to market median. Pass through whatever flag the orchestrator computed; surface significant variance in the narrative.",
                  },
                  intake_variance_ratio: {
                    type: "number",
                    description:
                      "M3.11: numeric ratio (user value / market median). Useful when surfacing exact variance in narrative.",
                  },
                },
              },
              citations: {
                type: "array",
                items: CITATION_SCHEMA,
                description:
                  "0-6 citations specific to comp data (Airbnb, AirDNA, etc.).",
              },
            },
            required: ["summary"],
          },
          revenue: {
            type: "object",
            properties: {
              summary: { type: "string" },
              metrics: {
                type: "object",
                description:
                  "Structured revenue metrics. Omit any field you don't have data for.",
                properties: {
                  annual_estimate: {
                    type: "number",
                    description:
                      "Comp-weighted annual revenue estimate (USD).",
                  },
                  seasonality: {
                    type: "string",
                    enum: ["high", "moderate", "low"],
                    description: "Seasonality concentration.",
                  },
                  cap_rate: {
                    type: "number",
                    description:
                      "Cap rate as a 0..1 ratio (e.g. 0.082 for 8.2%).",
                  },
                },
              },
              citations: { type: "array", items: CITATION_SCHEMA },
            },
            required: ["summary"],
          },
          regulatory: {
            type: "object",
            properties: {
              summary: { type: "string" },
              metrics: {
                type: "object",
                properties: {
                  str_status: {
                    type: "string",
                    enum: ["permitted", "restricted", "prohibited", "unclear"],
                  },
                  hoa_status: {
                    type: "string",
                    enum: [
                      "no_hoa",
                      "hoa_neutral",
                      "hoa_restrictive",
                      "unverified",
                    ],
                  },
                  registration_required: {
                    type: "boolean",
                  },
                },
              },
              citations: { type: "array", items: CITATION_SCHEMA },
            },
            required: ["summary"],
          },
          location: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description:
                  "One sentence of objective location signals (fair-housing compliant).",
              },
              metrics: {
                type: "object",
                description:
                  "Objective metrics only. Never include demographic or characterization fields.",
                properties: {
                  walk_score: { type: "integer", description: "0-100." },
                  flood_zone: {
                    type: "string",
                    description: "FEMA designation (e.g. 'X', 'AE').",
                  },
                  crime_rate_rank: {
                    type: "string",
                    enum: ["low", "moderate", "high"],
                  },
                  nearby_rating: {
                    type: "number",
                    description: "Average nearby business rating, 0-5.",
                  },
                  elementary_school_rating_median: {
                    type: "number",
                    description:
                      "Median GreatSchools-scale rating (1-10) across nearby elementary schools. Emit only when the user's thesis is occupant- or resale-driven (LTR / owner-occupied / house-hacking / flipping) AND the schools signal's dataQuality is 'partial' or 'rich'.",
                  },
                  middle_school_rating_median: {
                    type: "number",
                    description:
                      "Median GreatSchools-scale rating (1-10) across nearby middle schools. Same emit conditions as elementary.",
                  },
                  high_school_rating_median: {
                    type: "number",
                    description:
                      "Median GreatSchools-scale rating (1-10) across nearby high schools. Same emit conditions.",
                  },
                  notable_schools: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "Up to 3 exceptional schools by name (top performers, magnet/specialty programs, recent ranking shifts worth flagging). Names only; no commentary.",
                  },
                },
              },
              citations: { type: "array", items: CITATION_SCHEMA },
            },
            required: ["summary"],
          },
        },
        required: ["comps", "revenue", "regulatory", "location"],
      },
    },
    required: ["narrative", "summary", "data_points"],
  },
};

function loadPromptTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const filename = `verdict-narrative.${VERDICT_NARRATIVE_PROMPT_VERSION}.md`;
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
    `verdict-narrative prompt template not found. Tried: ${candidates.join(", ")}. ` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

/**
 * Property context for the v3 narrative prompt. The orchestrator
 * pulls these straight off the loaded `properties` row (post-M3.5
 * intake) and passes them in. Pricing/expense fields are nullable
 * because intake makes them optional even when complete.
 */
export type VerdictNarrativePropertyContext = {
  addressFull: string;
  thesisType:
    | "str"
    | "ltr"
    | "owner_occupied"
    | "house_hacking"
    | "flipping"
    | "other"
    | null;
  goalType:
    | "cap_rate"
    | "appreciation"
    | "both"
    | "lifestyle"
    | "flip_profit"
    | null;
  thesisOtherDescription: string | null;
  listingPriceCents: number | null;
  userOfferPriceCents: number | null;
  estimatedValueCents: number | null;
  annualPropertyTaxCents: number | null;
  annualInsuranceEstimateCents: number | null;
  monthlyHoaFeeCents: number | null;
};

const THESIS_LABEL: Record<
  NonNullable<VerdictNarrativePropertyContext["thesisType"]>,
  string
> = {
  str: "STR (short-term vacation rental, Airbnb/VRBO style)",
  ltr: "LTR (long-term rental on annual leases)",
  owner_occupied: "Owner-occupied (primary residence or second home)",
  house_hacking: "House hacking (live-in-part, rent the rest)",
  flipping: "Flipping (buy / renovate / sell within 12 months)",
  other: "Other (see thesis_other_description)",
};

const GOAL_LABEL: Record<
  NonNullable<VerdictNarrativePropertyContext["goalType"]>,
  string
> = {
  cap_rate: "Cap rate (cash flow now; monthly profit primary)",
  appreciation: "Appreciation (long-term value growth; can carry costs)",
  both: "Both (balanced cap rate + appreciation)",
  lifestyle: "Lifestyle (personal use primary; investment secondary)",
  flip_profit: "Flip profit (renovation IS the investment)",
};

function formatMoney(cents: number | null): string {
  if (cents == null) return "(not provided)";
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function renderPrompt(vars: {
  addressFull: string;
  signal: string;
  score: number;
  confidence: number;
  inputJson: string;
  breakdownJson: string;
  property: VerdictNarrativePropertyContext | null;
}): { system: string; user: string } {
  const template = loadPromptTemplate();
  const [, afterSystem] = template.split(/^## System\s*$/m);
  if (!afterSystem) throw new Error("prompt missing '## System' heading");
  const [systemText, userText] = afterSystem.split(/^## User\s*$/m);
  if (!systemText || !userText) throw new Error("prompt missing '## User' heading");

  const property = vars.property;
  const thesisType = property?.thesisType
    ? THESIS_LABEL[property.thesisType]
    : "(not provided)";
  const goalType = property?.goalType
    ? GOAL_LABEL[property.goalType]
    : "(not provided)";
  const thesisOther =
    property?.thesisType === "other"
      ? property.thesisOtherDescription ?? "(no description)"
      : "n/a";

  const interpolate = (s: string) =>
    s
      .replaceAll("{{ADDRESS_FULL}}", vars.addressFull)
      .replaceAll("{{SIGNAL}}", vars.signal.toUpperCase())
      .replaceAll("{{SCORE}}", String(vars.score))
      .replaceAll("{{CONFIDENCE}}", String(vars.confidence))
      .replaceAll("{{INPUT_JSON}}", vars.inputJson)
      .replaceAll("{{BREAKDOWN_JSON}}", vars.breakdownJson)
      .replaceAll("{{THESIS_TYPE}}", thesisType)
      .replaceAll("{{THESIS_OTHER_DESCRIPTION}}", thesisOther)
      .replaceAll("{{GOAL_TYPE}}", goalType)
      .replaceAll(
        "{{LISTING_PRICE}}",
        formatMoney(property?.listingPriceCents ?? null),
      )
      .replaceAll(
        "{{USER_OFFER_PRICE}}",
        formatMoney(property?.userOfferPriceCents ?? null),
      )
      .replaceAll(
        "{{ESTIMATED_VALUE}}",
        formatMoney(property?.estimatedValueCents ?? null),
      )
      .replaceAll(
        "{{ANNUAL_PROPERTY_TAX}}",
        formatMoney(property?.annualPropertyTaxCents ?? null),
      )
      .replaceAll(
        "{{ANNUAL_INSURANCE}}",
        formatMoney(property?.annualInsuranceEstimateCents ?? null),
      )
      .replaceAll(
        "{{MONTHLY_HOA}}",
        formatMoney(property?.monthlyHoaFeeCents ?? null),
      );

  return {
    system: interpolate(systemText).trim(),
    user: interpolate(userText).trim(),
  };
}

export type VerdictNarrativeInput = {
  addressFull: string;
  score: VerdictScore;
  /** Already-computed structured signals the narrative should cite. */
  signals: Record<string, unknown>;
  /** M3.6: thesis + pricing context for the v3 prompt. Optional so
   *  unit tests can render with a minimal fixture; production
   *  callers (the orchestrator) always populate it from the
   *  intake-completed property row. */
  property?: VerdictNarrativePropertyContext;
  /** Optional userId so the call can be logged to ai_usage_events.
   *  When omitted (e.g. unit tests) usage logging silently no-ops. */
  userId?: string;
  /** Optional orgId. Threaded into ai_usage_events for org-scoped
   *  cost analytics. */
  orgId?: string;
  /** Optional verdictId so the usage event can be correlated to the
   *  verdict that triggered it. */
  verdictId?: string;
};

export type VerdictNarrativeSuccess = {
  ok: true;
  output: VerdictNarrativeOutput;
  observability: {
    modelVersion: string;
    promptVersion: string;
    routingReason: RoutingReason;
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    costCents: number;
  };
};

export type VerdictNarrativeFailure = {
  ok: false;
  error: string;
  observability: Partial<VerdictNarrativeSuccess["observability"]>;
};

export async function writeVerdictNarrative(
  input: VerdictNarrativeInput,
): Promise<VerdictNarrativeSuccess | VerdictNarrativeFailure> {
  // Route based on confidence: low-confidence verdicts get Sonnet
  // for nuanced interpretation; everything else stays on Haiku.
  const routing = routeVerdictNarrative(input.score.confidence);

  let client: Anthropic;
  let prompt: { system: string; user: string };
  try {
    client = getAnthropicClient();
    prompt = renderPrompt({
      addressFull: input.addressFull,
      signal: input.score.signal,
      score: input.score.score,
      confidence: input.score.confidence,
      inputJson: JSON.stringify(input.signals, null, 2),
      breakdownJson: JSON.stringify(input.score.breakdown, null, 2),
      property: input.property ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `verdict_narrative_setup_failed: ${message}`,
      observability: {
        modelVersion: routing.model,
        promptVersion: VERDICT_NARRATIVE_PROMPT_VERSION,
      },
    };
  }

  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    response = await client.messages.create(
      {
        model: routing.model,
        // Realistic worst-case output is ~2000 tokens: narrative
        // ≤2000 chars + summary ≤400 chars + 4 × data_points
        // summary ≤800 chars each (M3.8 fix-forward) + optional
        // metrics + ≤6 citations × 4 domains + JSON envelope
        // overhead. The
        // pre-fix 1000 cap saturated as inputs grew (post-M3.5
        // intake context + M3.6 fix-forward CRITICAL paragraph
        // + M3.7 fetchers actually returning data) — Haiku was
        // truncating the tool call mid-write before emitting
        // `data_points`, producing a misleading `data_points:
        // Required` Zod error. 4000 gives ~2.5x headroom; output
        // tokens are billed only when actually generated, so the
        // ceiling change is essentially free at typical usage.
        max_tokens: 4000,
        system: [
          {
            type: "text",
            text: prompt.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: prompt.user }],
        tools: [RENDER_VERDICT_NARRATIVE_TOOL],
        tool_choice: { type: "tool", name: "render_verdict_narrative" },
      },
      { timeout: 60_000, maxRetries: 0 },
    );
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `anthropic_${err.status ?? "error"}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("[verdict-narrative] Anthropic call failed", {
      message,
      elapsedMs: Date.now() - startedAt,
      addressFull: input.addressFull,
      model: routing.model,
      routingReason: routing.reason,
    });
    if (input.userId) {
      await logAiUsageEvent({
        userId: input.userId,
        orgId: input.orgId,
        task: "verdict-narrative",
        model: routing.model,
        routingReason: routing.reason,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
        verdictId: input.verdictId,
        durationMs: Date.now() - startedAt,
        error: message,
      });
    }
    return {
      ok: false,
      error: message,
      observability: {
        modelVersion: routing.model,
        promptVersion: VERDICT_NARRATIVE_PROMPT_VERSION,
      },
    };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadInputTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheCreationInputTokens =
    response.usage.cache_creation_input_tokens ?? 0;

  console.log("[verdict-narrative] call complete", {
    addressFull: input.addressFull,
    elapsedMs: Date.now() - startedAt,
    model: routing.model,
    routingReason: routing.reason,
    confidence: input.score.confidence,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    stopReason: response.stop_reason,
  });

  const costCents = computeCostCents({
    model: routing.model,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
  });

  const observability = {
    modelVersion: routing.model,
    promptVersion: VERDICT_NARRATIVE_PROMPT_VERSION,
    routingReason: routing.reason,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    costCents,
  };

  if (input.userId) {
    await logAiUsageEvent({
      userId: input.userId,
      orgId: input.orgId,
      task: "verdict-narrative",
      model: routing.model,
      routingReason: routing.reason,
      inputTokens,
      outputTokens,
      cacheReadInputTokens,
      cacheCreationInputTokens,
      costCents,
      verdictId: input.verdictId,
      durationMs: Date.now() - startedAt,
    });
  }

  const renderCall = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock =>
      b.type === "tool_use" && b.name === "render_verdict_narrative",
  );
  if (!renderCall) {
    return {
      ok: false,
      error:
        "Model did not call render_verdict_narrative. " +
        `stop_reason=${response.stop_reason}.`,
      observability,
    };
  }

  const parsed = VerdictNarrativeOutputSchema.safeParse(renderCall.input);
  if (!parsed.success) {
    // Diagnostic logging (added in M3.6 fix-forward). When Haiku
    // returns a tool call that fails schema validation, the failure
    // path used to drop the raw model input on the floor — making
    // it impossible to diagnose without local repro. We can't
    // reproduce locally because production secrets aren't exported
    // via `vercel env pull`. Logging the raw input + the formatted
    // Zod error here lets us paste a Vercel log line straight into
    // a fix PR.
    console.error(
      "[verdict-narrative] schema validation failed — raw model output:",
      JSON.stringify(renderCall.input, null, 2),
    );
    console.error(
      "[verdict-narrative] validation error:",
      JSON.stringify(parsed.error.format(), null, 2),
    );
    return {
      ok: false,
      error:
        "render_verdict_narrative output failed schema validation: " +
        parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      observability,
    };
  }

  return { ok: true, output: parsed.data, observability };
}
