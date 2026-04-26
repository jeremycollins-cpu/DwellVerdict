import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropicClient } from "../anthropic";
import { computeCostCents } from "../pricing";
import { logAiUsageEvent } from "../usage-events";

/**
 * place-sentiment — Haiku synthesis of pre-fetched Yelp + Google
 * Places review data into 2-4 fair-housing-compliant bullets per
 * ADR-6.
 *
 * Fair-housing discipline is enforced in the prompt (strict allow/
 * deny lists) and in a golden-file test suite that blocks deploy
 * on regression per CLAUDE.md.
 *
 * This task does NOT call web_search. Input is purely the
 * structured data our free-data clients already fetched.
 */

export const PLACE_SENTIMENT_TASK_TYPE = "place_sentiment";
export const PLACE_SENTIMENT_PROMPT_VERSION = "v1";
export const PLACE_SENTIMENT_MODEL = "claude-haiku-4-5";

export const PlaceSentimentOutputSchema = z.object({
  bullets: z.array(z.string().min(1).max(300)).min(1).max(4),
  summary: z.string().min(1).max(500),
  source_refs: z
    .array(
      z.object({
        source: z.enum(["yelp", "google_places"]),
        name: z.string().min(1).max(200),
      }),
    )
    .max(12),
});
export type PlaceSentimentOutput = z.infer<typeof PlaceSentimentOutputSchema>;

const RENDER_PLACE_SENTIMENT_TOOL: Anthropic.Messages.Tool = {
  name: "render_place_sentiment",
  description:
    "Emit the structured place-sentiment record. Call this exactly once after reviewing the input data.",
  input_schema: {
    type: "object",
    properties: {
      bullets: {
        type: "array",
        items: { type: "string" },
        description: "2-4 one-sentence factual bullets about places and environment.",
      },
      summary: {
        type: "string",
        description: "1-2 sentence summary suitable for verdict narrative inline display.",
      },
      source_refs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source: { type: "string", enum: ["yelp", "google_places"] },
            name: { type: "string" },
          },
          required: ["source", "name"],
        },
        description: "References to the specific places cited.",
      },
    },
    required: ["bullets", "summary", "source_refs"],
  },
};

function loadPromptTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "prompts", "place-sentiment.v1.md"),
    join(here, "..", "..", "..", "..", "prompts", "place-sentiment.v1.md"),
    join(process.cwd(), "..", "..", "prompts", "place-sentiment.v1.md"),
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
    `place-sentiment prompt template not found. Tried: ${candidates.join(", ")}. ` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

function renderPrompt(vars: {
  lat: number;
  lng: number;
  inputJson: string;
}): { system: string; user: string } {
  const template = loadPromptTemplate();
  const [, afterSystem] = template.split(/^## System\s*$/m);
  if (!afterSystem) throw new Error("prompt missing '## System' heading");
  const [systemText, userText] = afterSystem.split(/^## User\s*$/m);
  if (!systemText || !userText) throw new Error("prompt missing '## User' heading");

  const interpolate = (s: string) =>
    s
      .replaceAll("{{LAT}}", vars.lat.toFixed(6))
      .replaceAll("{{LNG}}", vars.lng.toFixed(6))
      .replaceAll("{{INPUT_JSON}}", vars.inputJson);

  return {
    system: interpolate(systemText).trim(),
    user: interpolate(userText).trim(),
  };
}

export type PlaceSentimentInputData = {
  yelp: {
    businessCount: number;
    averageRating: number | null;
    topCategories: string[];
    sampleReviewSnippets: Array<{
      businessName: string;
      rating: number;
      text: string;
    }>;
  };
  googlePlaces: {
    placeCount: number;
    averageRating: number | null;
    reviewSnippets: Array<{
      placeName: string;
      rating: number;
      text: string;
    }>;
  };
};

export type PlaceSentimentInput = {
  lat: number;
  lng: number;
  data: PlaceSentimentInputData;
  /** Optional userId. When set, the call logs to ai_usage_events.
   *  Cache hits don't reach this task so logging only fires on miss. */
  userId?: string;
  /** Optional orgId for org-scoped cost analytics. */
  orgId?: string;
};

export type PlaceSentimentSuccess = {
  ok: true;
  output: PlaceSentimentOutput;
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

export type PlaceSentimentFailure = {
  ok: false;
  error: string;
  observability: Partial<PlaceSentimentSuccess["observability"]>;
};

export async function synthesizePlaceSentiment(
  input: PlaceSentimentInput,
): Promise<PlaceSentimentSuccess | PlaceSentimentFailure> {
  let client: Anthropic;
  let prompt: { system: string; user: string };
  try {
    client = getAnthropicClient();
    prompt = renderPrompt({
      lat: input.lat,
      lng: input.lng,
      inputJson: JSON.stringify(input.data, null, 2),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `place_sentiment_setup_failed: ${message}`,
      observability: {
        modelVersion: PLACE_SENTIMENT_MODEL,
        promptVersion: PLACE_SENTIMENT_PROMPT_VERSION,
      },
    };
  }

  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    // No web_search tool — synthesis only.
    response = await client.messages.create(
      {
        model: PLACE_SENTIMENT_MODEL,
        max_tokens: 800,
        system: [
          {
            type: "text",
            text: prompt.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: prompt.user }],
        tools: [RENDER_PLACE_SENTIMENT_TOOL],
        tool_choice: { type: "tool", name: "render_place_sentiment" },
      },
      {
        timeout: 60_000,
        maxRetries: 0,
      },
    );
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `anthropic_${err.status ?? "error"}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("[place-sentiment] Anthropic call failed", {
      message,
      elapsedMs: Date.now() - startedAt,
      lat: input.lat,
      lng: input.lng,
    });
    return {
      ok: false,
      error: message,
      observability: {
        modelVersion: PLACE_SENTIMENT_MODEL,
        promptVersion: PLACE_SENTIMENT_PROMPT_VERSION,
      },
    };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadInputTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheCreationInputTokens =
    response.usage.cache_creation_input_tokens ?? 0;

  console.log("[place-sentiment] call complete", {
    lat: input.lat,
    lng: input.lng,
    elapsedMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    stopReason: response.stop_reason,
  });

  const costCents = computeCostCents({
    model: PLACE_SENTIMENT_MODEL,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
  });

  if (input.userId) {
    await logAiUsageEvent({
      userId: input.userId,
      orgId: input.orgId,
      task: "place-sentiment",
      model: PLACE_SENTIMENT_MODEL,
      inputTokens,
      outputTokens,
      cacheReadInputTokens,
      cacheCreationInputTokens,
      costCents,
      durationMs: Date.now() - startedAt,
    });
  }

  const observability = {
    modelVersion: PLACE_SENTIMENT_MODEL,
    promptVersion: PLACE_SENTIMENT_PROMPT_VERSION,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    costCents,
  };

  const renderCall = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock =>
      b.type === "tool_use" && b.name === "render_place_sentiment",
  );
  if (!renderCall) {
    return {
      ok: false,
      error:
        "Model did not call render_place_sentiment. " +
        `stop_reason=${response.stop_reason}. Place sentiment aborted.`,
      observability,
    };
  }

  const parsed = PlaceSentimentOutputSchema.safeParse(renderCall.input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "render_place_sentiment output failed schema validation: " +
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
