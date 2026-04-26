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
export const VERDICT_NARRATIVE_PROMPT_VERSION = "v1";

/**
 * Default model for verdict-narrative. Kept exported for backward
 * compatibility — callers that import VERDICT_NARRATIVE_MODEL still
 * work, but the actual model on a given call is decided at runtime
 * by routeVerdictNarrative(confidence) (see model-router.ts).
 */
export const VERDICT_NARRATIVE_MODEL = "claude-haiku-4-5";

export const VerdictNarrativeOutputSchema = z.object({
  narrative: z.string().min(50).max(2000),
  summary: z.string().min(1).max(400),
  data_points: z.object({
    comps: z.string().min(1).max(300),
    revenue: z.string().min(1).max(300),
    regulatory: z.string().min(1).max(300),
    location: z.string().min(1).max(300),
  }),
});
export type VerdictNarrativeOutput = z.infer<typeof VerdictNarrativeOutputSchema>;

const RENDER_VERDICT_NARRATIVE_TOOL: Anthropic.Messages.Tool = {
  name: "render_verdict_narrative",
  description:
    "Emit the verdict narrative + summary + four data-point sentences. Call exactly once.",
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
            type: "string",
            description: "One sentence describing the comp situation.",
          },
          revenue: {
            type: "string",
            description: "One sentence describing the revenue estimate.",
          },
          regulatory: {
            type: "string",
            description: "One sentence describing regulatory status.",
          },
          location: {
            type: "string",
            description:
              "One sentence of objective location signals (fair-housing compliant).",
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
  const candidates = [
    join(process.cwd(), "prompts", "verdict-narrative.v1.md"),
    join(here, "..", "..", "..", "..", "prompts", "verdict-narrative.v1.md"),
    join(process.cwd(), "..", "..", "prompts", "verdict-narrative.v1.md"),
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

function renderPrompt(vars: {
  addressFull: string;
  signal: string;
  score: number;
  confidence: number;
  inputJson: string;
  breakdownJson: string;
}): { system: string; user: string } {
  const template = loadPromptTemplate();
  const [, afterSystem] = template.split(/^## System\s*$/m);
  if (!afterSystem) throw new Error("prompt missing '## System' heading");
  const [systemText, userText] = afterSystem.split(/^## User\s*$/m);
  if (!systemText || !userText) throw new Error("prompt missing '## User' heading");

  const interpolate = (s: string) =>
    s
      .replaceAll("{{ADDRESS_FULL}}", vars.addressFull)
      .replaceAll("{{SIGNAL}}", vars.signal.toUpperCase())
      .replaceAll("{{SCORE}}", String(vars.score))
      .replaceAll("{{CONFIDENCE}}", String(vars.confidence))
      .replaceAll("{{INPUT_JSON}}", vars.inputJson)
      .replaceAll("{{BREAKDOWN_JSON}}", vars.breakdownJson);

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
        max_tokens: 1000,
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
