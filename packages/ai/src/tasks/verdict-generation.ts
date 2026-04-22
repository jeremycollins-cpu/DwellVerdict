import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropicClient } from "../anthropic.js";
import { computeCostCents } from "../pricing.js";

/**
 * verdict-generation — the core Scout task that renders a BUY/WATCH/
 * PASS verdict for a single US property address.
 *
 * CLAUDE.md task registry rules:
 *   - Every AI use case is a registered task.
 *   - Each task has a trigger, a prompt, a retrieval spec, and an
 *     output schema. All four are exported from this module.
 *   - Prompts live in prompts/ as versioned markdown. We load them
 *     from disk so the source of truth matches git history.
 *   - Every AI output logs model_version, prompt_version, input /
 *     output tokens, task_type, source_document_ids.
 */

export const VERDICT_TASK_TYPE = "verdict_generation";
export const VERDICT_PROMPT_VERSION = "v1";
export const VERDICT_MODEL = "claude-sonnet-4-6";

/**
 * Output schema — what the model must return via the render_verdict
 * tool. Enforced twice:
 *   1. As a JSON Schema on the Anthropic tool input_schema (the
 *      model is steered to produce this shape).
 *   2. As a Zod schema on the application side (we validate before
 *      writing to DB so bad shapes don't corrupt our data).
 */
export const VerdictOutputSchema = z.object({
  verdict: z.enum(["buy", "watch", "pass"]),
  confidence: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(400),
  data_points: z.object({
    comps: z.string().min(1).max(400),
    revenue: z.string().min(1).max(400),
    regulatory: z.string().min(1).max(400),
    location: z.string().min(1).max(400),
  }),
  narrative: z.string().min(1).max(2000),
  sources: z.array(z.string().url()).min(2).max(12),
});

export type VerdictOutput = z.infer<typeof VerdictOutputSchema>;

/**
 * The render_verdict tool schema Claude is required to call exactly
 * once. JSON Schema shape mirrors VerdictOutputSchema; the two are
 * hand-kept in sync and cross-validated by unit tests.
 */
const RENDER_VERDICT_TOOL: Anthropic.Messages.Tool = {
  name: "render_verdict",
  description:
    "Render the final DwellVerdict output. Call this exactly once, after you've completed your research. The UI reads these fields directly.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["buy", "watch", "pass"],
        description: "The signal — BUY, WATCH, or PASS.",
      },
      confidence: {
        type: "integer",
        description: "Confidence level, 0-100.",
      },
      summary: {
        type: "string",
        description: "1-2 sentence headline explaining the verdict.",
      },
      data_points: {
        type: "object",
        properties: {
          comps: {
            type: "string",
            description: "One-line summary of the comps you found.",
          },
          revenue: {
            type: "string",
            description: "One-line summary of revenue estimate with range.",
          },
          regulatory: {
            type: "string",
            description: "One-line summary of regulatory status.",
          },
          location: {
            type: "string",
            description: "One-line summary of location signals (objective data only).",
          },
        },
        required: ["comps", "revenue", "regulatory", "location"],
      },
      narrative: {
        type: "string",
        description:
          "2-4 short paragraphs (max ~180 words total) explaining why this verdict.",
      },
      sources: {
        type: "array",
        items: { type: "string" },
        description:
          "URLs you actually used. At least 2. Prefer primary sources.",
      },
    },
    required: [
      "verdict",
      "confidence",
      "summary",
      "data_points",
      "narrative",
      "sources",
    ],
  },
};

/**
 * Load the prompt markdown from disk. Kept as a function (not a
 * module-level const) so tests can reassign the module path via
 * mocking if needed, and so bundlers don't attempt to inline the
 * file at build time.
 */
function loadPromptTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // packages/ai/src/tasks/ → ../../prompts isn't right since we
  // store at repo-root /prompts/. Walk up from src/tasks.
  const promptPath = join(here, "..", "..", "..", "..", "prompts", "verdict-generation.v1.md");
  return readFileSync(promptPath, "utf8");
}

/**
 * Split the markdown template into a system block and a user block.
 * The source file uses `## System` and `## User` headings for the
 * split, and `{{TOKEN}}` placeholders for runtime interpolation.
 */
function renderPrompt(vars: {
  addressFull: string;
  lat: number;
  lng: number;
}): { system: string; user: string } {
  const template = loadPromptTemplate();
  const [, afterSystem] = template.split(/^## System\s*$/m);
  if (!afterSystem) throw new Error("prompt missing '## System' heading");
  const [systemText, userText] = afterSystem.split(/^## User\s*$/m);
  if (!systemText || !userText) throw new Error("prompt missing '## User' heading");

  const interpolate = (s: string) =>
    s
      .replaceAll("{{ADDRESS_FULL}}", vars.addressFull)
      .replaceAll("{{LAT}}", vars.lat.toFixed(6))
      .replaceAll("{{LNG}}", vars.lng.toFixed(6));

  return {
    system: interpolate(systemText).trim(),
    user: interpolate(userText).trim(),
  };
}

export type VerdictInput = {
  addressFull: string;
  lat: number;
  lng: number;
  /** Maximum web_search calls the model is allowed. Default 8. */
  maxWebSearches?: number;
};

export type VerdictSuccess = {
  ok: true;
  output: VerdictOutput;
  observability: {
    modelVersion: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    webSearchCount: number;
  };
};

export type VerdictFailure = {
  ok: false;
  error: string;
  observability: Partial<VerdictSuccess["observability"]>;
};

/**
 * Generate a verdict by invoking Anthropic, letting the model do up
 * to N web searches, and returning the validated JSON shape from
 * the render_verdict tool call.
 *
 * Error handling strategy:
 *   - Any Anthropic 4xx / 5xx surfaces as a failure with observability
 *     partially filled (we don't know the final tokens).
 *   - A missing / malformed render_verdict call surfaces as a failure
 *     with the error message describing what was missing.
 *   - Zod validation failures on the tool input also surface as a
 *     failure, keeping us from writing bad rows to the DB.
 *
 * The caller (route handler) is responsible for flipping the verdict
 * row to ready / failed using this return value.
 */
export async function generateVerdict(
  input: VerdictInput,
): Promise<VerdictSuccess | VerdictFailure> {
  const client = getAnthropicClient();
  const prompt = renderPrompt(input);
  const maxSearches = input.maxWebSearches ?? 8;

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: VERDICT_MODEL,
      max_tokens: 16000,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: maxSearches,
        } as Anthropic.Messages.ToolUnion,
        RENDER_VERDICT_TOOL,
      ],
      // Don't force tool_choice — the model needs to interleave
      // web_search calls with reasoning before the final render.
    });
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `anthropic_${err.status ?? "error"}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      ok: false,
      error: message,
      observability: {
        modelVersion: VERDICT_MODEL,
        promptVersion: VERDICT_PROMPT_VERSION,
      },
    };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const webSearchCount = response.content.filter(
    (b) => b.type === "server_tool_use" && b.name === "web_search",
  ).length;

  const observability = {
    modelVersion: VERDICT_MODEL,
    promptVersion: VERDICT_PROMPT_VERSION,
    inputTokens,
    outputTokens,
    costCents: computeCostCents({
      model: VERDICT_MODEL,
      inputTokens,
      outputTokens,
      webSearchCount,
    }),
    webSearchCount,
  };

  const renderCall = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock =>
      b.type === "tool_use" && b.name === "render_verdict",
  );

  if (!renderCall) {
    return {
      ok: false,
      error:
        "Model did not call render_verdict. " +
        `stop_reason=${response.stop_reason}. Verdict generation aborted.`,
      observability,
    };
  }

  const parsed = VerdictOutputSchema.safeParse(renderCall.input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "render_verdict output failed schema validation: " +
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
