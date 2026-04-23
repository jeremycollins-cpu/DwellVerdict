import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropicClient } from "../anthropic";
import { computeCostCents } from "../pricing";

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
 *
 * We try several candidate paths because runtime layout differs
 * between environments:
 *   - local dev / vitest: `import.meta.url` resolves to the source
 *     file; walking four levels up hits the repo root.
 *   - Next.js on Vercel: the route handler bundle lands in a
 *     different location, and `import.meta.url` may point inside
 *     `.next/` outputs. `process.cwd()` points at the traced root
 *     (the monorepo root, per `outputFileTracingRoot`), so a
 *     `<cwd>/prompts/...` lookup works as long as the file is
 *     included in the deployment (see `outputFileTracingIncludes`
 *     in `apps/web/next.config.ts`).
 */
function loadPromptTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "prompts", "verdict-generation.v1.md"),
    join(here, "..", "..", "..", "..", "prompts", "verdict-generation.v1.md"),
    join(process.cwd(), "..", "..", "prompts", "verdict-generation.v1.md"),
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
    `verdict prompt template not found. Tried: ${candidates.join(", ")}. ` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
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
  /**
   * Maximum web_search calls the model is allowed. Default 3 for the
   * serverless path — every extra search adds ~15-30s and we have a
   * hard 300s envelope from Vercel. Callers running on Inngest (or
   * any background queue) can raise this without the latency worry.
   */
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
  const maxSearches = input.maxWebSearches ?? 3;

  // Resolve the client + render the prompt inside the try/catch so
  // deployment-level issues (missing API key, prompt file not bundled)
  // surface as structured failures instead of bubbling up as 500s.
  let client: Anthropic;
  let prompt: { system: string; user: string };
  try {
    client = getAnthropicClient();
    prompt = renderPrompt(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `verdict_setup_failed: ${message}`,
      observability: {
        modelVersion: VERDICT_MODEL,
        promptVersion: VERDICT_PROMPT_VERSION,
      },
    };
  }

  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    // Use streaming (messages.stream) rather than non-streaming
    // create(). Vercel observability showed non-streaming tool-use
    // calls dying at ~51-59s — Anthropic (or an intermediate proxy)
    // closes idle connections when the model is mid-web_search with
    // no bytes flowing. Streaming keeps the connection alive via SSE
    // events for the full run (model reasoning + tool rounds + final
    // render). `.finalMessage()` returns the same `Message` shape as
    // a non-streaming response, so downstream code is unchanged.
    //
    // WORK ENVELOPE (temporary — restore once Inngest migration lands):
    // `max_tokens: 2000` and 3 web searches keep the p95 comfortably
    // inside the route's 300s maxDuration. Full-quality verdicts use
    // 16k tokens + up to 8 searches + adaptive thinking, which runs
    // 4+ minutes for some addresses — unworkable on a serverless
    // request. Once generation moves to a background Inngest job we
    // can restore the higher budgets here.
    //
    // PROMPT CACHING: the system block carries cache_control so the
    // ~3.5K-token prefix (tools + system) is cached for 5 min after
    // the first request. Subsequent calls within that window pay
    // ~0.1x the input cost for the cached tokens. Only the user
    // message (the varying address) falls outside the cache. Watch
    // response.usage.cache_read_input_tokens to verify hit rate.
    const stream = client.messages.stream(
      {
        model: VERDICT_MODEL,
        max_tokens: 2000,
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
          } as Anthropic.Messages.ToolUnion,
          RENDER_VERDICT_TOOL,
        ],
        // Don't force tool_choice — the model needs to interleave
        // web_search calls with reasoning before the final render.
      },
      {
        // 4-minute ceiling — leaves ~60s buffer before the 300s route
        // maxDuration fires. The stream keepalive means we shouldn't
        // need anywhere near this long, but it's a defence against a
        // pathologically slow model / search path.
        timeout: 240_000,
        // Don't retry — we're running inside a tight request envelope
        // and a retry would push us past the route's maxDuration. The
        // client has a manual "Retry verdict" affordance.
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
    console.error("[verdict] Anthropic call failed", {
      message,
      elapsedMs: Date.now() - startedAt,
      addressFull: input.addressFull,
    });
    return {
      ok: false,
      error: message,
      observability: {
        modelVersion: VERDICT_MODEL,
        promptVersion: VERDICT_PROMPT_VERSION,
      },
    };
  }
  // Cache stats on the response tell us whether the prompt-caching
  // strategy on the system block is actually hitting. If
  // cacheReadInputTokens stays at 0 across repeated requests inside
  // the 5-minute TTL window, a silent invalidator is at play (e.g.
  // a timestamp or request ID making the prefix vary).
  const cacheRead = response.usage.cache_read_input_tokens ?? 0;
  const cacheWrite = response.usage.cache_creation_input_tokens ?? 0;
  console.log("[verdict] Anthropic call complete", {
    elapsedMs: Date.now() - startedAt,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadInputTokens: cacheRead,
    cacheCreationInputTokens: cacheWrite,
    stopReason: response.stop_reason,
  });

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
