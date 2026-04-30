import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropicClient } from "../anthropic";
import { computeCostCents } from "../pricing";
import { logAiUsageEvent } from "../usage-events";

/**
 * ltr-comps-lookup — Haiku-cached city-level LTR rental comp data
 * per M3.11. The LLM uses its training-data recall of Rentometer /
 * Zillow Rentals / Craigslist coverage plus general knowledge of
 * the local rental market to produce a structured median + range
 * + market-context summary for comparable units in the city.
 *
 * No web_search — paid Rentometer / RentBerry integration is
 * deferred to v1.1; v1 uses Haiku's recall as the primary source.
 * The LLM is instructed to set `data_quality: "unavailable"`
 * rather than fabricate medians for areas it doesn't know.
 *
 * Output is cached 30 days in `data_source_cache` (source =
 * `ltr-comps`, cacheKey = `${state}:${city}:${beds}-${baths}-
 * ${sqftBucket}`) by the caller in `apps/web/lib/ltr-comps/lookup.ts`.
 */

export const LTR_COMPS_LOOKUP_TASK_TYPE = "ltr_comps_lookup";
export const LTR_COMPS_LOOKUP_PROMPT_VERSION = "v1";
export const LTR_COMPS_LOOKUP_MODEL = "claude-haiku-4-5";

/**
 * Tool-output schema. Snake_case keys matching what the model finds
 * easier to populate; the caller maps to camelCase before persisting
 * via LtrCompsSignalSchema in @dwellverdict/data-sources.
 */
export const LtrCompsLookupOutputSchema = z
  .object({
    median_monthly_rent_cents: z.number().int().min(0).max(5_000_000),
    rent_range_low_cents: z.number().int().min(0).max(5_000_000),
    rent_range_high_cents: z.number().int().min(0).max(5_000_000),
    comp_count_estimated: z.number().int().min(0).max(50),
    market_summary: z.string().min(1).max(500),
    demand_indicators: z.array(z.string().min(1).max(280)).max(5).default([]),
    vacancy_estimate: z.number().min(0).max(0.3),
    data_quality: z.enum(["rich", "partial", "unavailable"]).default("partial"),
  })
  .superRefine((v, ctx) => {
    // Inversion check — Zod doesn't catch cross-field constraints
    // by default. The prompt instructs the model to honor this; we
    // enforce it server-side as belt-and-suspenders. Failed checks
    // surface as schema validation errors per the standard task
    // pattern.
    if (v.rent_range_low_cents > v.median_monthly_rent_cents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rent_range_low_cents"],
        message: "rent_range_low_cents must be <= median_monthly_rent_cents",
      });
    }
    if (v.median_monthly_rent_cents > v.rent_range_high_cents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rent_range_high_cents"],
        message: "rent_range_high_cents must be >= median_monthly_rent_cents",
      });
    }
  });
export type LtrCompsLookupOutput = z.infer<typeof LtrCompsLookupOutputSchema>;

const RENDER_LTR_COMPS_TOOL: Anthropic.Messages.Tool = {
  name: "render_ltr_comps",
  description:
    "Emit the structured LTR rental comp record for this city/configuration. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      median_monthly_rent_cents: {
        type: "integer",
        description:
          "Median monthly rent for comparable units in cents (e.g. 240000 for $2,400).",
      },
      rent_range_low_cents: {
        type: "integer",
        description:
          "Typical low end (~25th percentile) of monthly rent in cents.",
      },
      rent_range_high_cents: {
        type: "integer",
        description:
          "Typical high end (~75th percentile) of monthly rent in cents.",
      },
      comp_count_estimated: {
        type: "integer",
        description:
          "Rough count of comparable rental listings active in this market at any given time (0-50).",
      },
      market_summary: {
        type: "string",
        description:
          "1-2 plain-prose sentences on what drives rent levels in this market.",
      },
      demand_indicators: {
        type: "array",
        items: { type: "string" },
        description:
          "0-5 short bullets capturing concrete demand drivers. Each ≤280 chars.",
      },
      vacancy_estimate: {
        type: "number",
        description:
          "Typical landlord vacancy assumption as 0..0.30 ratio (e.g., 0.07 = 7%).",
      },
      data_quality: {
        type: "string",
        enum: ["rich", "partial", "unavailable"],
        description:
          "Self-assessment: confident recall ('rich'), approximate ('partial'), or insufficient ('unavailable').",
      },
    },
    required: [
      "median_monthly_rent_cents",
      "rent_range_low_cents",
      "rent_range_high_cents",
      "comp_count_estimated",
      "market_summary",
      "vacancy_estimate",
      "data_quality",
    ],
  },
};

function loadPromptTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const filename = `ltr-comps-lookup.${LTR_COMPS_LOOKUP_PROMPT_VERSION}.md`;
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
    `ltr-comps-lookup prompt template not found. Tried: ${candidates.join(", ")}. ` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

function renderPrompt(vars: {
  city: string;
  state: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
}): { system: string; user: string } {
  const template = loadPromptTemplate();
  const [, afterSystem] = template.split(/^## System\s*$/m);
  if (!afterSystem) throw new Error("prompt missing '## System' heading");
  const [systemText, userText] = afterSystem.split(/^## User\s*$/m);
  if (!systemText || !userText)
    throw new Error("prompt missing '## User' heading");

  const today = new Date().toISOString().slice(0, 10);
  const fmt = (n: number | null): string =>
    n == null ? "(not provided)" : String(n);
  const interpolate = (s: string) =>
    s
      .replaceAll("{{CITY}}", vars.city)
      .replaceAll("{{STATE}}", vars.state)
      .replaceAll("{{BEDROOMS}}", fmt(vars.bedrooms))
      .replaceAll("{{BATHROOMS}}", fmt(vars.bathrooms))
      .replaceAll("{{SQFT}}", fmt(vars.sqft))
      .replaceAll("{{TODAY}}", today);

  return {
    system: interpolate(systemText).trim(),
    user: interpolate(userText).trim(),
  };
}

export type LtrCompsLookupInput = {
  city: string;
  state: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  userId?: string;
  orgId?: string;
  verdictId?: string;
};

export type LtrCompsLookupSuccess = {
  ok: true;
  output: LtrCompsLookupOutput;
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

export type LtrCompsLookupFailure = {
  ok: false;
  error: string;
  observability: Partial<LtrCompsLookupSuccess["observability"]>;
};

export async function lookupLtrComps(
  input: LtrCompsLookupInput,
): Promise<LtrCompsLookupSuccess | LtrCompsLookupFailure> {
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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `ltr_comps_setup_failed: ${message}`,
      observability: {
        modelVersion: LTR_COMPS_LOOKUP_MODEL,
        promptVersion: LTR_COMPS_LOOKUP_PROMPT_VERSION,
      },
    };
  }

  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    response = await client.messages.create(
      {
        model: LTR_COMPS_LOOKUP_MODEL,
        max_tokens: 1500,
        system: [
          {
            type: "text",
            text: prompt.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: prompt.user }],
        tools: [RENDER_LTR_COMPS_TOOL],
        tool_choice: { type: "tool", name: "render_ltr_comps" },
      },
      { timeout: 30_000, maxRetries: 0 },
    );
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `anthropic_${err.status ?? "error"}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("[ltr-comps-lookup] Anthropic call failed", {
      message,
      elapsedMs: Date.now() - startedAt,
      city: input.city,
      state: input.state,
    });
    if (input.userId) {
      await logAiUsageEvent({
        userId: input.userId,
        orgId: input.orgId,
        task: "ltr-comps-lookup",
        model: LTR_COMPS_LOOKUP_MODEL,
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
        modelVersion: LTR_COMPS_LOOKUP_MODEL,
        promptVersion: LTR_COMPS_LOOKUP_PROMPT_VERSION,
      },
    };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadInputTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheCreationInputTokens =
    response.usage.cache_creation_input_tokens ?? 0;

  console.log("[ltr-comps-lookup] call complete", {
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
    model: LTR_COMPS_LOOKUP_MODEL,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
  });

  const observability = {
    modelVersion: LTR_COMPS_LOOKUP_MODEL,
    promptVersion: LTR_COMPS_LOOKUP_PROMPT_VERSION,
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
      task: "ltr-comps-lookup",
      model: LTR_COMPS_LOOKUP_MODEL,
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
      b.type === "tool_use" && b.name === "render_ltr_comps",
  );
  if (!renderCall) {
    return {
      ok: false,
      error:
        "Model did not call render_ltr_comps. " +
        `stop_reason=${response.stop_reason}.`,
      observability,
    };
  }

  const parsed = LtrCompsLookupOutputSchema.safeParse(renderCall.input);
  if (!parsed.success) {
    console.error(
      "[ltr-comps-lookup] schema validation failed — raw model output:",
      JSON.stringify(renderCall.input, null, 2),
    );
    console.error(
      "[ltr-comps-lookup] validation error:",
      JSON.stringify(parsed.error.format(), null, 2),
    );
    return {
      ok: false,
      error:
        "render_ltr_comps output failed schema validation: " +
        parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      observability,
    };
  }

  return { ok: true, output: parsed.data, observability };
}
