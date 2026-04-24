import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropicClient } from "../anthropic";
import { computeCostCents } from "../pricing";
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
};

export type VerdictNarrativeSuccess = {
  ok: true;
  output: VerdictNarrativeOutput;
  observability: {
    modelVersion: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
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
        modelVersion: VERDICT_NARRATIVE_MODEL,
        promptVersion: VERDICT_NARRATIVE_PROMPT_VERSION,
      },
    };
  }

  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    response = await client.messages.create(
      {
        model: VERDICT_NARRATIVE_MODEL,
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
    });
    return {
      ok: false,
      error: message,
      observability: {
        modelVersion: VERDICT_NARRATIVE_MODEL,
        promptVersion: VERDICT_NARRATIVE_PROMPT_VERSION,
      },
    };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  console.log("[verdict-narrative] call complete", {
    addressFull: input.addressFull,
    elapsedMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    stopReason: response.stop_reason,
  });

  const observability = {
    modelVersion: VERDICT_NARRATIVE_MODEL,
    promptVersion: VERDICT_NARRATIVE_PROMPT_VERSION,
    inputTokens,
    outputTokens,
    costCents: computeCostCents({
      model: VERDICT_NARRATIVE_MODEL,
      inputTokens,
      outputTokens,
    }),
  };

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
