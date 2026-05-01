import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropicClient } from "../anthropic";
import { computeCostCents } from "../pricing";
import { logAiUsageEvent } from "../usage-events";

/**
 * sales-comps-lookup — Haiku-cached sales comp + ARV signal per
 * M3.12. The LLM uses its training-data recall of Zillow/Redfin
 * recent-sold listings + general knowledge of comparable sales to
 * produce a 5-10 comp set, an ARV estimate with confidence, and
 * aggregate market context (median price, market velocity, DOM).
 *
 * Wires up two M3.8 scoring rules that previously had degraded
 * inputs: `appreciation_potential` (LTR appreciation, OO, HH) and
 * `arv_margin` (Flipping). The placeholder "ARV signal pending —
 * M3.12" note in arv_margin gets replaced with real margin math
 * once the cache populates for a property.
 *
 * Output cached 30 days in `data_source_cache` (source =
 * `sales-comps`, cacheKey =
 * `${state}:${city}:${beds}-${baths}-${sqftBucket}-${yearBucket}`).
 *
 * No web_search — paid ATTOM Data integration is deferred to v1.1
 * (revenue-gated). The LLM is instructed to set `data_quality:
 * "unavailable"` rather than fabricate comps for areas it doesn't
 * know.
 */

export const SALES_COMPS_LOOKUP_TASK_TYPE = "sales_comps_lookup";
export const SALES_COMPS_LOOKUP_PROMPT_VERSION = "v1";
export const SALES_COMPS_LOOKUP_MODEL = "claude-haiku-4-5";

/**
 * Tool-output schema. Snake_case keys matching what the model
 * finds easier to populate; the caller maps to camelCase before
 * persisting via SalesCompsSignalSchema in @dwellverdict/data-sources.
 */
const SalesCompEntryToolSchema = z.object({
  address_approximate: z.string().min(1).max(200),
  sale_price_cents: z.number().int().positive().max(50_000_000_00),
  sale_date_month: z.string().regex(/^\d{4}-\d{2}$/),
  beds: z.number().int().min(0).max(20),
  baths: z.number().min(0).max(20),
  sqft: z.number().int().min(100).max(50_000),
  year_built: z.number().int().min(1700).max(2030),
  days_on_market: z.number().int().min(0).max(365),
  sale_type: z.enum(["standard", "distressed", "off_market", "auction"]),
  adjustments_summary: z.string().min(1).max(280),
});

export const SalesCompsLookupOutputSchema = z
  .object({
    comps: z.array(SalesCompEntryToolSchema).max(10).default([]),
    estimated_arv_cents: z.number().int().positive().max(50_000_000_00),
    arv_confidence: z.enum(["high", "moderate", "low"]),
    arv_rationale: z.string().min(1).max(800),
    median_comp_price_cents: z
      .number()
      .int()
      .positive()
      .max(50_000_000_00),
    comp_price_range_low_cents: z
      .number()
      .int()
      .positive()
      .max(50_000_000_00),
    comp_price_range_high_cents: z
      .number()
      .int()
      .positive()
      .max(50_000_000_00),
    median_days_on_market: z.number().int().min(0).max(365),
    market_velocity: z.enum(["fast", "moderate", "slow"]),
    market_summary: z.string().min(1).max(800),
    comp_count: z.number().int().min(0).max(20),
    data_quality: z.enum(["rich", "partial", "unavailable"]).default("partial"),
  })
  .superRefine((v, ctx) => {
    if (v.comp_price_range_low_cents > v.median_comp_price_cents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comp_price_range_low_cents"],
        message:
          "comp_price_range_low_cents must be <= median_comp_price_cents",
      });
    }
    if (v.median_comp_price_cents > v.comp_price_range_high_cents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comp_price_range_high_cents"],
        message:
          "comp_price_range_high_cents must be >= median_comp_price_cents",
      });
    }
  });
export type SalesCompsLookupOutput = z.infer<
  typeof SalesCompsLookupOutputSchema
>;

const COMP_ENTRY_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    address_approximate: {
      type: "string" as const,
      description:
        "Block-level identifier only ('100 block of Oak Street'). Never emit exact house numbers.",
    },
    sale_price_cents: {
      type: "integer" as const,
      description: "Sale price in cents.",
    },
    sale_date_month: {
      type: "string" as const,
      description: "YYYY-MM only. Prefer last 6 months; up to 12 acceptable.",
    },
    beds: { type: "integer" as const },
    baths: { type: "number" as const },
    sqft: { type: "integer" as const },
    year_built: { type: "integer" as const },
    days_on_market: { type: "integer" as const },
    sale_type: {
      type: "string" as const,
      enum: ["standard", "distressed", "off_market", "auction"],
    },
    adjustments_summary: {
      type: "string" as const,
      description:
        "One sentence on why this comp is more or less valuable than the subject.",
    },
  },
  required: [
    "address_approximate",
    "sale_price_cents",
    "sale_date_month",
    "beds",
    "baths",
    "sqft",
    "year_built",
    "days_on_market",
    "sale_type",
    "adjustments_summary",
  ],
};

const RENDER_SALES_COMPS_TOOL: Anthropic.Messages.Tool = {
  name: "render_sales_comps",
  description:
    "Emit the structured sales comp + ARV record for this property/city. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      comps: {
        type: "array",
        items: COMP_ENTRY_TOOL_SCHEMA,
        description: "5-10 recent comparable sales.",
      },
      estimated_arv_cents: {
        type: "integer",
        description:
          "After-Repair Value (or current market value when no renovation) estimate in cents.",
      },
      arv_confidence: {
        type: "string",
        enum: ["high", "moderate", "low"],
        description:
          "Self-assessment of ARV confidence based on comp set quality + recency.",
      },
      arv_rationale: {
        type: "string",
        description:
          "2-3 sentences explaining the ARV reasoning, citing comp characteristics that drove it.",
      },
      median_comp_price_cents: {
        type: "integer",
        description: "Median sale price across the comp set, in cents.",
      },
      comp_price_range_low_cents: {
        type: "integer",
        description: "25th percentile of comp prices in cents.",
      },
      comp_price_range_high_cents: {
        type: "integer",
        description: "75th percentile of comp prices in cents.",
      },
      median_days_on_market: {
        type: "integer",
        description: "Median DOM across comps.",
      },
      market_velocity: {
        type: "string",
        enum: ["fast", "moderate", "slow"],
        description:
          "Velocity classification — fast (<14d median DOM), moderate (15-45d), slow (>45d).",
      },
      market_summary: {
        type: "string",
        description:
          "1-2 plain-prose sentences on what's driving the local sales market.",
      },
      comp_count: {
        type: "integer",
        description: "Equals the length of the comps array.",
      },
      data_quality: {
        type: "string",
        enum: ["rich", "partial", "unavailable"],
        description:
          "Self-assessment of recall confidence. Use 'unavailable' rather than fabricating comps.",
      },
    },
    required: [
      "comps",
      "estimated_arv_cents",
      "arv_confidence",
      "arv_rationale",
      "median_comp_price_cents",
      "comp_price_range_low_cents",
      "comp_price_range_high_cents",
      "median_days_on_market",
      "market_velocity",
      "market_summary",
      "comp_count",
      "data_quality",
    ],
  },
};

function loadPromptTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const filename = `sales-comps-lookup.${SALES_COMPS_LOOKUP_PROMPT_VERSION}.md`;
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
    `sales-comps-lookup prompt template not found. Tried: ${candidates.join(", ")}. ` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

function renderPrompt(vars: {
  city: string;
  state: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  userOfferPriceCents: number | null;
  userEstimatedValueCents: number | null;
  userRenovationBudgetCents: number | null;
}): { system: string; user: string } {
  const template = loadPromptTemplate();
  const [, afterSystem] = template.split(/^## System\s*$/m);
  if (!afterSystem) throw new Error("prompt missing '## System' heading");
  const [systemText, userText] = afterSystem.split(/^## User\s*$/m);
  if (!systemText || !userText)
    throw new Error("prompt missing '## User' heading");

  const today = new Date().toISOString().slice(0, 10);
  const fmtNum = (n: number | null): string =>
    n == null ? "(not provided)" : String(n);
  const fmtCents = (n: number | null): string =>
    n == null
      ? "(not provided)"
      : `$${Math.round(n / 100).toLocaleString("en-US")}`;

  const interpolate = (s: string) =>
    s
      .replaceAll("{{CITY}}", vars.city)
      .replaceAll("{{STATE}}", vars.state)
      .replaceAll("{{BEDROOMS}}", fmtNum(vars.bedrooms))
      .replaceAll("{{BATHROOMS}}", fmtNum(vars.bathrooms))
      .replaceAll("{{SQFT}}", fmtNum(vars.sqft))
      .replaceAll("{{YEAR_BUILT}}", fmtNum(vars.yearBuilt))
      .replaceAll("{{USER_OFFER_PRICE}}", fmtCents(vars.userOfferPriceCents))
      .replaceAll(
        "{{USER_ESTIMATED_VALUE}}",
        fmtCents(vars.userEstimatedValueCents),
      )
      .replaceAll(
        "{{USER_RENOVATION_BUDGET}}",
        fmtCents(vars.userRenovationBudgetCents),
      )
      .replaceAll("{{TODAY}}", today);

  return {
    system: interpolate(systemText).trim(),
    user: interpolate(userText).trim(),
  };
}

export type SalesCompsLookupInput = {
  city: string;
  state: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  userOfferPriceCents?: number | null;
  userEstimatedValueCents?: number | null;
  userRenovationBudgetCents?: number | null;
  userId?: string;
  orgId?: string;
  verdictId?: string;
};

export type SalesCompsLookupSuccess = {
  ok: true;
  output: SalesCompsLookupOutput;
  observability: {
    modelVersion: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    costCents: number;
  };
};

export type SalesCompsLookupFailure = {
  ok: false;
  error: string;
  observability: Partial<SalesCompsLookupSuccess["observability"]>;
};

export async function lookupSalesComps(
  input: SalesCompsLookupInput,
): Promise<SalesCompsLookupSuccess | SalesCompsLookupFailure> {
  let client: Anthropic;
  let prompt: { system: string; user: string };
  try {
    client = getAnthropicClient();
    prompt = renderPrompt({
      city: input.city,
      state: input.state,
      bedrooms: input.bedrooms ?? null,
      bathrooms: input.bathrooms ?? null,
      sqft: input.sqft ?? null,
      yearBuilt: input.yearBuilt ?? null,
      userOfferPriceCents: input.userOfferPriceCents ?? null,
      userEstimatedValueCents: input.userEstimatedValueCents ?? null,
      userRenovationBudgetCents: input.userRenovationBudgetCents ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `sales_comps_setup_failed: ${message}`,
      observability: {
        modelVersion: SALES_COMPS_LOOKUP_MODEL,
        promptVersion: SALES_COMPS_LOOKUP_PROMPT_VERSION,
      },
    };
  }

  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    // Sales comps tool output is heavier than rental comps (10
    // entries × ~120 tokens each + ARV rationale + market summary).
    // 3000 tokens gives healthy headroom; the realism canary in
    // tests pins worst-case shapes against this.
    response = await client.messages.create(
      {
        model: SALES_COMPS_LOOKUP_MODEL,
        max_tokens: 3000,
        system: [
          {
            type: "text",
            text: prompt.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: prompt.user }],
        tools: [RENDER_SALES_COMPS_TOOL],
        tool_choice: { type: "tool", name: "render_sales_comps" },
      },
      { timeout: 45_000, maxRetries: 0 },
    );
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `anthropic_${err.status ?? "error"}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("[sales-comps-lookup] Anthropic call failed", {
      message,
      elapsedMs: Date.now() - startedAt,
      city: input.city,
      state: input.state,
    });
    if (input.userId) {
      await logAiUsageEvent({
        userId: input.userId,
        orgId: input.orgId,
        task: "sales-comps-lookup",
        model: SALES_COMPS_LOOKUP_MODEL,
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
        modelVersion: SALES_COMPS_LOOKUP_MODEL,
        promptVersion: SALES_COMPS_LOOKUP_PROMPT_VERSION,
      },
    };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadInputTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheCreationInputTokens =
    response.usage.cache_creation_input_tokens ?? 0;

  console.log("[sales-comps-lookup] call complete", {
    city: input.city,
    state: input.state,
    elapsedMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    stopReason: response.stop_reason,
  });

  const costCents = computeCostCents({
    model: SALES_COMPS_LOOKUP_MODEL,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
  });

  const observability = {
    modelVersion: SALES_COMPS_LOOKUP_MODEL,
    promptVersion: SALES_COMPS_LOOKUP_PROMPT_VERSION,
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
      task: "sales-comps-lookup",
      model: SALES_COMPS_LOOKUP_MODEL,
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
      b.type === "tool_use" && b.name === "render_sales_comps",
  );
  if (!renderCall) {
    return {
      ok: false,
      error:
        "Model did not call render_sales_comps. " +
        `stop_reason=${response.stop_reason}.`,
      observability,
    };
  }

  const parsed = SalesCompsLookupOutputSchema.safeParse(renderCall.input);
  if (!parsed.success) {
    console.error(
      "[sales-comps-lookup] schema validation failed — raw model output:",
      JSON.stringify(renderCall.input, null, 2),
    );
    console.error(
      "[sales-comps-lookup] validation error:",
      JSON.stringify(parsed.error.format(), null, 2),
    );
    return {
      ok: false,
      error:
        "render_sales_comps output failed schema validation: " +
        parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      observability,
    };
  }

  return { ok: true, output: parsed.data, observability };
}
