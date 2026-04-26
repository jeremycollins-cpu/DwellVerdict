import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropicClient } from "../anthropic";
import { computeCostCents } from "../pricing";
import { logAiUsageEvent } from "../usage-events";

/**
 * regulatory-lookup — Haiku + web_search sub-task that researches
 * STR regulations for a US (city, state) pair per ADR-6.
 *
 * Results are cached 30 days in the regulatory_cache table and
 * reused across every property in that city. The Inngest-backed
 * background refresh is deferred — for v0 cache misses (or TTL
 * expiry) block the caller while we fetch.
 *
 * Fair-housing guardrails live in the prompt file; this module
 * just wires the API call + output validation.
 */

export const REGULATORY_LOOKUP_TASK_TYPE = "regulatory_lookup";
export const REGULATORY_LOOKUP_PROMPT_VERSION = "v1";
export const REGULATORY_LOOKUP_MODEL = "claude-haiku-4-5";

/**
 * Structured regulatory record. Every field nullable — the LLM is
 * instructed to return null rather than guess.
 */
export const RegulatoryLookupOutputSchema = z.object({
  str_legal: z.enum(["yes", "restricted", "no", "unclear"]).nullable(),
  permit_required: z.enum(["yes", "no", "unclear"]).nullable(),
  owner_occupied_only: z.enum(["yes", "no", "depends", "unclear"]).nullable(),
  cap_on_non_oo: z.string().nullable(),
  renewal_frequency: z.enum(["annual", "biennial", "none"]).nullable(),
  minimum_stay_days: z.number().int().nullable(),
  // Narrative-length summary. Real municipal STR code is messy —
  // Placer County's program alone has six categories with different
  // caps and permit rules. 1500 chars lets the model be precise
  // without truncating; the UI clamps for display anyway.
  summary: z.string().min(1).max(1500),
  // At least one source. Some small jurisdictions have exactly one
  // primary document (a municipal code section); previous minimum
  // of 2 was rejecting otherwise-valid lookups.
  sources: z.array(z.string().url()).min(1).max(6),
});
export type RegulatoryLookupOutput = z.infer<typeof RegulatoryLookupOutputSchema>;

/**
 * render_regulatory — the tool Haiku is required to call once.
 * Mirrors RegulatoryLookupOutputSchema as JSON Schema.
 */
const RENDER_REGULATORY_TOOL: Anthropic.Messages.Tool = {
  name: "render_regulatory",
  description:
    "Emit the structured STR regulation record. Call this exactly once after you've read 2-4 authoritative sources.",
  input_schema: {
    type: "object",
    properties: {
      str_legal: {
        type: ["string", "null"],
        enum: ["yes", "restricted", "no", "unclear", null],
        description: "Whether STRs are legally allowed in residential zones.",
      },
      permit_required: {
        type: ["string", "null"],
        enum: ["yes", "no", "unclear", null],
        description: "Whether an STR permit/license is required.",
      },
      owner_occupied_only: {
        type: ["string", "null"],
        enum: ["yes", "no", "depends", "unclear", null],
        description: "Whether STRs are restricted to owner-occupied primary residences.",
      },
      cap_on_non_oo: {
        type: ["string", "null"],
        description:
          "One-sentence description of any cap on non-owner-occupied STRs, or null if none.",
      },
      renewal_frequency: {
        type: ["string", "null"],
        enum: ["annual", "biennial", "none", null],
        description: "Cadence of permit renewal.",
      },
      minimum_stay_days: {
        type: ["integer", "null"],
        description:
          "Minimum rental duration in nights. e.g., 30 means under-30-night stays are banned.",
      },
      summary: {
        type: "string",
        description:
          "2-4 plain-prose sentences summarizing the regulatory posture. Capture nuance (permit categories, caps, zones) — do not oversimplify.",
      },
      sources: {
        type: "array",
        items: { type: "string" },
        description:
          "1-6 URLs the model actually read. Prefer primary sources (municipal code, county STR page).",
      },
    },
    required: [
      "str_legal",
      "permit_required",
      "owner_occupied_only",
      "cap_on_non_oo",
      "renewal_frequency",
      "minimum_stay_days",
      "summary",
      "sources",
    ],
  },
};

function loadPromptTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "prompts", "regulatory-lookup.v1.md"),
    join(here, "..", "..", "..", "..", "prompts", "regulatory-lookup.v1.md"),
    join(process.cwd(), "..", "..", "prompts", "regulatory-lookup.v1.md"),
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
    `regulatory-lookup prompt template not found. Tried: ${candidates.join(", ")}. ` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

function renderPrompt(vars: {
  city: string;
  state: string;
}): { system: string; user: string } {
  const template = loadPromptTemplate();
  const [, afterSystem] = template.split(/^## System\s*$/m);
  if (!afterSystem) throw new Error("prompt missing '## System' heading");
  const [systemText, userText] = afterSystem.split(/^## User\s*$/m);
  if (!systemText || !userText) throw new Error("prompt missing '## User' heading");

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

export type RegulatoryLookupInput = {
  city: string;
  state: string;
  /** Optional override; default 4 per ADR-6. */
  maxWebSearches?: number;
  /** Optional userId. When set, the call logs to ai_usage_events.
   *  Cache hits don't reach this task at all, so logging here only
   *  fires on cache miss. */
  userId?: string;
  /** Optional orgId for org-scoped cost analytics. */
  orgId?: string;
};

export type RegulatoryLookupSuccess = {
  ok: true;
  output: RegulatoryLookupOutput;
  observability: {
    modelVersion: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    costCents: number;
    webSearchCount: number;
  };
};

export type RegulatoryLookupFailure = {
  ok: false;
  error: string;
  observability: Partial<RegulatoryLookupSuccess["observability"]>;
};

/**
 * Run the regulatory lookup. Caller is responsible for caching the
 * output in regulatory_cache.
 */
export async function lookupRegulatory(
  input: RegulatoryLookupInput,
): Promise<RegulatoryLookupSuccess | RegulatoryLookupFailure> {
  const maxSearches = input.maxWebSearches ?? 4;

  let client: Anthropic;
  let prompt: { system: string; user: string };
  try {
    client = getAnthropicClient();
    prompt = renderPrompt(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `regulatory_setup_failed: ${message}`,
      observability: {
        modelVersion: REGULATORY_LOOKUP_MODEL,
        promptVersion: REGULATORY_LOOKUP_PROMPT_VERSION,
      },
    };
  }

  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    // Stream path to keep the connection alive while Haiku does its
    // web_search rounds. 120s ceiling — a regulatory lookup should
    // complete in <60s normally; anything longer is a sign the
    // search tool is thrashing and we should fail rather than cook.
    const stream = client.messages.stream(
      {
        model: REGULATORY_LOOKUP_MODEL,
        max_tokens: 1500,
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
            // Haiku 4.5 can't nest tool calls, so web_search must be
            // invoked directly by the model turn rather than from
            // inside another tool's execution. Anthropic requires
            // allowed_callers=["direct"] on Haiku models to reflect
            // that — without it the API returns 400 invalid_request.
            allowed_callers: ["direct"],
          } as Anthropic.Messages.ToolUnion,
          RENDER_REGULATORY_TOOL,
        ],
      },
      {
        timeout: 120_000,
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
    console.error("[regulatory] Anthropic call failed", {
      message,
      elapsedMs: Date.now() - startedAt,
      city: input.city,
      state: input.state,
    });
    return {
      ok: false,
      error: message,
      observability: {
        modelVersion: REGULATORY_LOOKUP_MODEL,
        promptVersion: REGULATORY_LOOKUP_PROMPT_VERSION,
      },
    };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadInputTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheCreationInputTokens =
    response.usage.cache_creation_input_tokens ?? 0;
  const webSearchCount = response.content.filter(
    (b) => b.type === "server_tool_use" && b.name === "web_search",
  ).length;

  console.log("[regulatory] call complete", {
    city: input.city,
    state: input.state,
    elapsedMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    webSearchCount,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    stopReason: response.stop_reason,
  });

  const costCents = computeCostCents({
    model: REGULATORY_LOOKUP_MODEL,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    webSearchCount,
  });

  if (input.userId) {
    await logAiUsageEvent({
      userId: input.userId,
      orgId: input.orgId,
      task: "regulatory-lookup",
      model: REGULATORY_LOOKUP_MODEL,
      inputTokens,
      outputTokens,
      cacheReadInputTokens,
      cacheCreationInputTokens,
      webSearchCount,
      costCents,
      durationMs: Date.now() - startedAt,
    });
  }

  const observability = {
    modelVersion: REGULATORY_LOOKUP_MODEL,
    promptVersion: REGULATORY_LOOKUP_PROMPT_VERSION,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    costCents,
    webSearchCount,
  };

  const renderCall = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock =>
      b.type === "tool_use" && b.name === "render_regulatory",
  );

  if (!renderCall) {
    return {
      ok: false,
      error:
        "Model did not call render_regulatory. " +
        `stop_reason=${response.stop_reason}. Regulatory lookup aborted.`,
      observability,
    };
  }

  const parsed = RegulatoryLookupOutputSchema.safeParse(renderCall.input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "render_regulatory output failed schema validation: " +
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
