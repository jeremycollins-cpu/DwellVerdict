import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropicClient } from "../anthropic";
import { computeCostCents } from "../pricing";
import { logAiUsageEvent } from "../usage-events";

/**
 * str-comps-lookup — Haiku-cached city-level STR (vacation rental)
 * comp data per M3.11. Replaces the Apify Airbnb scraper as the
 * *primary* STR comp source for the verdict; Apify continues as
 * optional enrichment when it works (the scraper consistently
 * returned 0 listings for many smaller markets, so STR verdicts
 * needed a more reliable backstop).
 *
 * The LLM uses its training-data recall of AirDNA / AllTheRooms /
 * Airbnb / VRBO patterns plus tourism-anchor knowledge to produce
 * a structured ADR + occupancy + seasonality summary for the city.
 *
 * Output is cached 14 days in `data_source_cache` (source =
 * `str-comps`, cacheKey = `${state}:${city}:${beds}-${baths}`) by
 * the caller in `apps/web/lib/str-comps/lookup.ts`. STR ADR shifts
 * faster than LTR rents (peak-season swings, event spikes) so the
 * TTL is shorter.
 */

export const STR_COMPS_LOOKUP_TASK_TYPE = "str_comps_lookup";
export const STR_COMPS_LOOKUP_PROMPT_VERSION = "v1";
export const STR_COMPS_LOOKUP_MODEL = "claude-haiku-4-5";

export const StrCompsLookupOutputSchema = z
  .object({
    median_adr_cents: z.number().int().min(0).max(500_000),
    adr_range_low_cents: z.number().int().min(0).max(500_000),
    adr_range_high_cents: z.number().int().min(0).max(500_000),
    median_occupancy: z.number().min(0).max(1),
    occupancy_range_low: z.number().min(0).max(1),
    occupancy_range_high: z.number().min(0).max(1),
    estimated_comp_count: z.number().int().min(0).max(100),
    market_summary: z.string().min(1).max(500),
    seasonality: z.enum(["high", "moderate", "low"]),
    peak_season_months: z
      .array(z.string().min(1).max(20))
      .max(6)
      .default([]),
    demand_drivers: z.array(z.string().min(1).max(280)).max(5).default([]),
    data_quality: z.enum(["rich", "partial", "unavailable"]).default("partial"),
  })
  .superRefine((v, ctx) => {
    if (v.adr_range_low_cents > v.median_adr_cents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adr_range_low_cents"],
        message: "adr_range_low_cents must be <= median_adr_cents",
      });
    }
    if (v.median_adr_cents > v.adr_range_high_cents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adr_range_high_cents"],
        message: "adr_range_high_cents must be >= median_adr_cents",
      });
    }
    if (v.occupancy_range_low > v.median_occupancy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["occupancy_range_low"],
        message: "occupancy_range_low must be <= median_occupancy",
      });
    }
    if (v.median_occupancy > v.occupancy_range_high) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["occupancy_range_high"],
        message: "occupancy_range_high must be >= median_occupancy",
      });
    }
  });
export type StrCompsLookupOutput = z.infer<typeof StrCompsLookupOutputSchema>;

const RENDER_STR_COMPS_TOOL: Anthropic.Messages.Tool = {
  name: "render_str_comps",
  description:
    "Emit the structured STR (vacation rental) comp record for this city/configuration. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      median_adr_cents: {
        type: "integer",
        description:
          "Median Average Daily Rate (nightly rate, blended across the year) in cents.",
      },
      adr_range_low_cents: {
        type: "integer",
        description: "Typical low end (~25th percentile) of nightly rate in cents.",
      },
      adr_range_high_cents: {
        type: "integer",
        description: "Typical high end (~75th percentile) of nightly rate in cents.",
      },
      median_occupancy: {
        type: "number",
        description:
          "Median annual occupancy as 0..1 ratio (e.g., 0.62 for 62%).",
      },
      occupancy_range_low: {
        type: "number",
        description: "Typical low-end occupancy as 0..1 ratio.",
      },
      occupancy_range_high: {
        type: "number",
        description: "Typical high-end occupancy as 0..1 ratio.",
      },
      estimated_comp_count: {
        type: "integer",
        description:
          "Rough count of comparable STR listings active in this market (0-100).",
      },
      market_summary: {
        type: "string",
        description:
          "1-2 plain-prose sentences on what drives bookings in this market.",
      },
      seasonality: {
        type: "string",
        enum: ["high", "moderate", "low"],
        description:
          "Peak/off-peak swing classification — high (>40%), moderate (20-40%), or low (<20%).",
      },
      peak_season_months: {
        type: "array",
        items: { type: "string" },
        description:
          "0-6 month names that drive disproportionate revenue. Empty when seasonality is 'low'.",
      },
      demand_drivers: {
        type: "array",
        items: { type: "string" },
        description:
          "0-5 short bullets capturing concrete demand drivers (tourism anchors, events). Each ≤280 chars.",
      },
      data_quality: {
        type: "string",
        enum: ["rich", "partial", "unavailable"],
        description:
          "Self-assessment: confident recall ('rich'), approximate ('partial'), or insufficient ('unavailable').",
      },
    },
    required: [
      "median_adr_cents",
      "adr_range_low_cents",
      "adr_range_high_cents",
      "median_occupancy",
      "occupancy_range_low",
      "occupancy_range_high",
      "estimated_comp_count",
      "market_summary",
      "seasonality",
      "data_quality",
    ],
  },
};

function loadPromptTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const filename = `str-comps-lookup.${STR_COMPS_LOOKUP_PROMPT_VERSION}.md`;
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
    `str-comps-lookup prompt template not found. Tried: ${candidates.join(", ")}. ` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

function renderPrompt(vars: {
  city: string;
  state: string;
  bedrooms: number | null;
  bathrooms: number | null;
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
      .replaceAll("{{TODAY}}", today);

  return {
    system: interpolate(systemText).trim(),
    user: interpolate(userText).trim(),
  };
}

export type StrCompsLookupInput = {
  city: string;
  state: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  userId?: string;
  orgId?: string;
  verdictId?: string;
};

export type StrCompsLookupSuccess = {
  ok: true;
  output: StrCompsLookupOutput;
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

export type StrCompsLookupFailure = {
  ok: false;
  error: string;
  observability: Partial<StrCompsLookupSuccess["observability"]>;
};

export async function lookupStrComps(
  input: StrCompsLookupInput,
): Promise<StrCompsLookupSuccess | StrCompsLookupFailure> {
  let client: Anthropic;
  let prompt: { system: string; user: string };
  try {
    client = getAnthropicClient();
    prompt = renderPrompt({
      city: input.city,
      state: input.state,
      bedrooms: input.bedrooms ?? null,
      bathrooms: input.bathrooms ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `str_comps_setup_failed: ${message}`,
      observability: {
        modelVersion: STR_COMPS_LOOKUP_MODEL,
        promptVersion: STR_COMPS_LOOKUP_PROMPT_VERSION,
      },
    };
  }

  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    response = await client.messages.create(
      {
        model: STR_COMPS_LOOKUP_MODEL,
        max_tokens: 1500,
        system: [
          {
            type: "text",
            text: prompt.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: prompt.user }],
        tools: [RENDER_STR_COMPS_TOOL],
        tool_choice: { type: "tool", name: "render_str_comps" },
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
    console.error("[str-comps-lookup] Anthropic call failed", {
      message,
      elapsedMs: Date.now() - startedAt,
      city: input.city,
      state: input.state,
    });
    if (input.userId) {
      await logAiUsageEvent({
        userId: input.userId,
        orgId: input.orgId,
        task: "str-comps-lookup",
        model: STR_COMPS_LOOKUP_MODEL,
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
        modelVersion: STR_COMPS_LOOKUP_MODEL,
        promptVersion: STR_COMPS_LOOKUP_PROMPT_VERSION,
      },
    };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadInputTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheCreationInputTokens =
    response.usage.cache_creation_input_tokens ?? 0;

  console.log("[str-comps-lookup] call complete", {
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
    model: STR_COMPS_LOOKUP_MODEL,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
  });

  const observability = {
    modelVersion: STR_COMPS_LOOKUP_MODEL,
    promptVersion: STR_COMPS_LOOKUP_PROMPT_VERSION,
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
      task: "str-comps-lookup",
      model: STR_COMPS_LOOKUP_MODEL,
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
      b.type === "tool_use" && b.name === "render_str_comps",
  );
  if (!renderCall) {
    return {
      ok: false,
      error:
        "Model did not call render_str_comps. " +
        `stop_reason=${response.stop_reason}.`,
      observability,
    };
  }

  const parsed = StrCompsLookupOutputSchema.safeParse(renderCall.input);
  if (!parsed.success) {
    console.error(
      "[str-comps-lookup] schema validation failed — raw model output:",
      JSON.stringify(renderCall.input, null, 2),
    );
    console.error(
      "[str-comps-lookup] validation error:",
      JSON.stringify(parsed.error.format(), null, 2),
    );
    return {
      ok: false,
      error:
        "render_str_comps output failed schema validation: " +
        parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      observability,
    };
  }

  return { ok: true, output: parsed.data, observability };
}
