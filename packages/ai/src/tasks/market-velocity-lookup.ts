import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropicClient } from "../anthropic";
import { computeCostCents } from "../pricing";
import { logAiUsageEvent } from "../usage-events";

/**
 * market-velocity-lookup — Haiku-cached aggregate market velocity
 * signal per M3.12. Pairs with sales-comps-lookup but operates at
 * a coarser, market-wide level (current DOM, year-ago DOM, trend
 * classification, list-to-sale ratio, inventory months).
 *
 * Output cached 14 days in `data_source_cache` (source =
 * `market-velocity`, cacheKey = `${state}:${city}`). Shorter TTL
 * than per-comp data because market-pace signals shift faster
 * than per-property comps.
 *
 * Consumed by the M3.8 `appreciation_potential` rule and surfaced
 * as narrative context for OO/LTR-with-appreciation/HH/Flipping
 * verdicts.
 */

export const MARKET_VELOCITY_LOOKUP_TASK_TYPE = "market_velocity_lookup";
export const MARKET_VELOCITY_LOOKUP_PROMPT_VERSION = "v1";
export const MARKET_VELOCITY_LOOKUP_MODEL = "claude-haiku-4-5";

export const MarketVelocityLookupOutputSchema = z
  .object({
    median_days_on_market_current: z.number().int().min(0).max(365),
    median_days_on_market_year_ago: z.number().int().min(0).max(365),
    trend: z.enum(["accelerating", "stable", "decelerating"]),
    list_to_sale_ratio: z.number().min(0.7).max(1.3),
    inventory_months: z.number().min(0).max(24),
    demand_summary: z.string().min(1).max(500),
    seasonality_note: z.string().max(280).optional().nullable(),
    data_quality: z
      .enum(["rich", "partial", "unavailable"])
      .default("partial"),
  })
  .superRefine((v, ctx) => {
    // Cross-field check: trend must be consistent with the DOM
    // ratio. The prompt instructs the model to compute trend from
    // current/year_ago; we enforce the math server-side.
    if (v.median_days_on_market_year_ago > 0) {
      const ratio =
        v.median_days_on_market_current / v.median_days_on_market_year_ago;
      if (ratio < 0.8 && v.trend !== "accelerating") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["trend"],
          message: `DOM ratio ${ratio.toFixed(2)} (current/year_ago < 0.8) requires trend='accelerating'`,
        });
      } else if (ratio > 1.2 && v.trend !== "decelerating") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["trend"],
          message: `DOM ratio ${ratio.toFixed(2)} (current/year_ago > 1.2) requires trend='decelerating'`,
        });
      }
    }
  });
export type MarketVelocityLookupOutput = z.infer<
  typeof MarketVelocityLookupOutputSchema
>;

const RENDER_MARKET_VELOCITY_TOOL: Anthropic.Messages.Tool = {
  name: "render_market_velocity",
  description:
    "Emit the structured market velocity record for this city. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      median_days_on_market_current: {
        type: "integer",
        description: "Current/recent-month median DOM for residential listings.",
      },
      median_days_on_market_year_ago: {
        type: "integer",
        description: "Same metric a year ago (best-effort recall).",
      },
      trend: {
        type: "string",
        enum: ["accelerating", "stable", "decelerating"],
        description:
          "DOM trend classification. Must be consistent with the current/year_ago ratio.",
      },
      list_to_sale_ratio: {
        type: "number",
        description:
          "0.7-1.3 range. 1.0 = sold at list; 0.97 = 3% under list; 1.02 = 2% over list.",
      },
      inventory_months: {
        type: "number",
        description:
          "Months of supply. <2 = sellers' market, 2-4 = balanced, 4-6 = buyers' market, >6 = deep buyers'.",
      },
      demand_summary: {
        type: "string",
        description:
          "1-2 plain-prose sentences on what's driving current demand.",
      },
      seasonality_note: {
        type: "string",
        description:
          "Optional 1-sentence note on seasonal patterns. Omit when not material.",
      },
      data_quality: {
        type: "string",
        enum: ["rich", "partial", "unavailable"],
        description:
          "Self-assessment of recall confidence. Use 'unavailable' rather than fabricating numbers.",
      },
    },
    required: [
      "median_days_on_market_current",
      "median_days_on_market_year_ago",
      "trend",
      "list_to_sale_ratio",
      "inventory_months",
      "demand_summary",
      "data_quality",
    ],
  },
};

function loadPromptTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const filename = `market-velocity-lookup.${MARKET_VELOCITY_LOOKUP_PROMPT_VERSION}.md`;
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
    `market-velocity-lookup prompt template not found. Tried: ${candidates.join(", ")}. ` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

function renderPrompt(vars: { city: string; state: string }): {
  system: string;
  user: string;
} {
  const template = loadPromptTemplate();
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

export type MarketVelocityLookupInput = {
  city: string;
  state: string;
  userId?: string;
  orgId?: string;
  verdictId?: string;
};

export type MarketVelocityLookupSuccess = {
  ok: true;
  output: MarketVelocityLookupOutput;
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

export type MarketVelocityLookupFailure = {
  ok: false;
  error: string;
  observability: Partial<MarketVelocityLookupSuccess["observability"]>;
};

export async function lookupMarketVelocity(
  input: MarketVelocityLookupInput,
): Promise<MarketVelocityLookupSuccess | MarketVelocityLookupFailure> {
  let client: Anthropic;
  let prompt: { system: string; user: string };
  try {
    client = getAnthropicClient();
    prompt = renderPrompt({ city: input.city, state: input.state });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `market_velocity_setup_failed: ${message}`,
      observability: {
        modelVersion: MARKET_VELOCITY_LOOKUP_MODEL,
        promptVersion: MARKET_VELOCITY_LOOKUP_PROMPT_VERSION,
      },
    };
  }

  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    response = await client.messages.create(
      {
        model: MARKET_VELOCITY_LOOKUP_MODEL,
        max_tokens: 1000,
        system: [
          {
            type: "text",
            text: prompt.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: prompt.user }],
        tools: [RENDER_MARKET_VELOCITY_TOOL],
        tool_choice: { type: "tool", name: "render_market_velocity" },
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
    console.error("[market-velocity-lookup] Anthropic call failed", {
      message,
      elapsedMs: Date.now() - startedAt,
      city: input.city,
      state: input.state,
    });
    if (input.userId) {
      await logAiUsageEvent({
        userId: input.userId,
        orgId: input.orgId,
        task: "market-velocity-lookup",
        model: MARKET_VELOCITY_LOOKUP_MODEL,
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
        modelVersion: MARKET_VELOCITY_LOOKUP_MODEL,
        promptVersion: MARKET_VELOCITY_LOOKUP_PROMPT_VERSION,
      },
    };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadInputTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheCreationInputTokens =
    response.usage.cache_creation_input_tokens ?? 0;

  console.log("[market-velocity-lookup] call complete", {
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
    model: MARKET_VELOCITY_LOOKUP_MODEL,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
  });

  const observability = {
    modelVersion: MARKET_VELOCITY_LOOKUP_MODEL,
    promptVersion: MARKET_VELOCITY_LOOKUP_PROMPT_VERSION,
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
      task: "market-velocity-lookup",
      model: MARKET_VELOCITY_LOOKUP_MODEL,
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
      b.type === "tool_use" && b.name === "render_market_velocity",
  );
  if (!renderCall) {
    return {
      ok: false,
      error:
        "Model did not call render_market_velocity. " +
        `stop_reason=${response.stop_reason}.`,
      observability,
    };
  }

  const parsed = MarketVelocityLookupOutputSchema.safeParse(renderCall.input);
  if (!parsed.success) {
    console.error(
      "[market-velocity-lookup] schema validation failed — raw model output:",
      JSON.stringify(renderCall.input, null, 2),
    );
    console.error(
      "[market-velocity-lookup] validation error:",
      JSON.stringify(parsed.error.format(), null, 2),
    );
    return {
      ok: false,
      error:
        "render_market_velocity output failed schema validation: " +
        parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      observability,
    };
  }

  return { ok: true, output: parsed.data, observability };
}
