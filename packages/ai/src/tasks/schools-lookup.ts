import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropicClient } from "../anthropic";
import { computeCostCents } from "../pricing";
import { logAiUsageEvent } from "../usage-events";

/**
 * schools-lookup — Haiku-cached city-level school quality lookup
 * per M3.10. The LLM uses its own training-data knowledge of
 * GreatSchools ratings, district reputation, and notable
 * institutions to produce a structured per-level (elementary /
 * middle / high) summary plus a district overview.
 *
 * No web_search — paid GreatSchools API integration is deferred to
 * v1.1; v1 uses Haiku's recall as the data source. The LLM is
 * instructed to return `data_quality: "unavailable"` and empty
 * arrays rather than fabricate ratings for areas it doesn't know.
 *
 * Output is cached 90 days in `data_source_cache` (source =
 * `schools`, cacheKey = `${state}:${city}`) by the caller in
 * `apps/web/lib/schools/lookup.ts`. School ratings shift slowly,
 * so the long TTL is appropriate.
 */

export const SCHOOLS_LOOKUP_TASK_TYPE = "schools_lookup";
export const SCHOOLS_LOOKUP_PROMPT_VERSION = "v1";
export const SCHOOLS_LOOKUP_MODEL = "claude-haiku-4-5";

/**
 * Tool-output schema. Mirrors `SchoolsSignalSchema` in
 * `@dwellverdict/data-sources` but uses the snake_case field names
 * the model finds easier to populate. The caller maps to camelCase
 * before persisting.
 */
const SchoolEntryToolSchema = z.object({
  name: z.string().min(1).max(120),
  rating: z.number().min(1).max(10).optional(),
  type: z.enum(["public", "private", "charter"]).optional(),
  // M3.10 fix-forward — see SchoolEntrySchema in
  // packages/data-sources/src/types.ts. Limits must stay in sync
  // between the LLM tool output schema (here) and the persisted
  // signal schema (there) or the cache write fails after a tool
  // call that the data-sources layer would have accepted.
  notes: z.string().max(280).optional(),
});

export const SchoolsLookupOutputSchema = z.object({
  elementary_schools: z.array(SchoolEntryToolSchema).max(5).default([]),
  middle_schools: z.array(SchoolEntryToolSchema).max(5).default([]),
  high_schools: z.array(SchoolEntryToolSchema).max(5).default([]),
  district_summary: z.string().max(500).optional().nullable(),
  notable_factors: z
    .array(z.string().min(1).max(280))
    .max(5)
    .default([]),
  data_quality: z.enum(["rich", "partial", "unavailable"]).default("partial"),
});
export type SchoolsLookupOutput = z.infer<typeof SchoolsLookupOutputSchema>;

const SCHOOL_ENTRY_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    name: { type: "string" as const, description: "School name." },
    rating: {
      type: "number" as const,
      description:
        "1-10 rating on the GreatSchools scale (or comparable). Omit when unknown.",
    },
    type: {
      type: "string" as const,
      enum: ["public", "private", "charter"],
    },
    notes: {
      type: "string" as const,
      description:
        "1-sentence context about specialty, language program, recent ranking shift, etc. Optional.",
    },
  },
  required: ["name"],
};

const RENDER_SCHOOLS_TOOL: Anthropic.Messages.Tool = {
  name: "render_schools",
  description:
    "Emit the structured city-level school quality assessment. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      elementary_schools: {
        type: "array",
        items: SCHOOL_ENTRY_TOOL_SCHEMA,
        description: "Up to 5 notable elementary schools.",
      },
      middle_schools: {
        type: "array",
        items: SCHOOL_ENTRY_TOOL_SCHEMA,
        description: "Up to 5 notable middle schools.",
      },
      high_schools: {
        type: "array",
        items: SCHOOL_ENTRY_TOOL_SCHEMA,
        description: "Up to 5 notable high schools.",
      },
      district_summary: {
        type: "string",
        description:
          "1-2 sentences on the district's overall reputation. Omit when unknown.",
      },
      notable_factors: {
        type: "array",
        items: { type: "string" },
        description:
          "Up to 5 short notes on factors driving school quality (e.g. 'rapid enrollment growth', 'state-recognized STEM program').",
      },
      data_quality: {
        type: "string",
        enum: ["rich", "partial", "unavailable"],
        description:
          "Self-assessment of recall confidence. Use 'unavailable' rather than fabricating ratings.",
      },
    },
    required: ["data_quality"],
  },
};

function loadPromptTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const filename = `schools-lookup.${SCHOOLS_LOOKUP_PROMPT_VERSION}.md`;
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
    `schools-lookup prompt template not found. Tried: ${candidates.join(", ")}. ` +
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

  const interpolate = (s: string) =>
    s.replaceAll("{{CITY}}", vars.city).replaceAll("{{STATE}}", vars.state);

  return {
    system: interpolate(systemText).trim(),
    user: interpolate(userText).trim(),
  };
}

export type SchoolsLookupInput = {
  city: string;
  state: string;
  /** Optional userId. When set, the call logs to ai_usage_events.
   *  Cache hits don't reach this task at all, so logging here only
   *  fires on cache miss. */
  userId?: string;
  orgId?: string;
  /** Optional verdictId for usage-event correlation. */
  verdictId?: string;
};

export type SchoolsLookupSuccess = {
  ok: true;
  output: SchoolsLookupOutput;
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

export type SchoolsLookupFailure = {
  ok: false;
  error: string;
  observability: Partial<SchoolsLookupSuccess["observability"]>;
};

/**
 * Run the schools lookup. Caller is responsible for caching the
 * output via the shared `data_source_cache` table (key:
 * `${state}:${city}`, TTL 90d).
 */
export async function lookupSchools(
  input: SchoolsLookupInput,
): Promise<SchoolsLookupSuccess | SchoolsLookupFailure> {
  let client: Anthropic;
  let prompt: { system: string; user: string };
  try {
    client = getAnthropicClient();
    prompt = renderPrompt(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `schools_setup_failed: ${message}`,
      observability: {
        modelVersion: SCHOOLS_LOOKUP_MODEL,
        promptVersion: SCHOOLS_LOOKUP_PROMPT_VERSION,
      },
    };
  }

  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    response = await client.messages.create(
      {
        model: SCHOOLS_LOOKUP_MODEL,
        max_tokens: 1500,
        system: [
          {
            type: "text",
            text: prompt.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: prompt.user }],
        tools: [RENDER_SCHOOLS_TOOL],
        tool_choice: { type: "tool", name: "render_schools" },
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
    console.error("[schools-lookup] Anthropic call failed", {
      message,
      elapsedMs: Date.now() - startedAt,
      city: input.city,
      state: input.state,
    });
    if (input.userId) {
      await logAiUsageEvent({
        userId: input.userId,
        orgId: input.orgId,
        task: "schools-lookup",
        model: SCHOOLS_LOOKUP_MODEL,
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
        modelVersion: SCHOOLS_LOOKUP_MODEL,
        promptVersion: SCHOOLS_LOOKUP_PROMPT_VERSION,
      },
    };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadInputTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheCreationInputTokens =
    response.usage.cache_creation_input_tokens ?? 0;

  console.log("[schools-lookup] call complete", {
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
    model: SCHOOLS_LOOKUP_MODEL,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
  });

  const observability = {
    modelVersion: SCHOOLS_LOOKUP_MODEL,
    promptVersion: SCHOOLS_LOOKUP_PROMPT_VERSION,
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
      task: "schools-lookup",
      model: SCHOOLS_LOOKUP_MODEL,
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
      b.type === "tool_use" && b.name === "render_schools",
  );
  if (!renderCall) {
    return {
      ok: false,
      error:
        "Model did not call render_schools. " +
        `stop_reason=${response.stop_reason}.`,
      observability,
    };
  }

  const parsed = SchoolsLookupOutputSchema.safeParse(renderCall.input);
  if (!parsed.success) {
    console.error(
      "[schools-lookup] schema validation failed — raw model output:",
      JSON.stringify(renderCall.input, null, 2),
    );
    console.error(
      "[schools-lookup] validation error:",
      JSON.stringify(parsed.error.format(), null, 2),
    );
    return {
      ok: false,
      error:
        "render_schools output failed schema validation: " +
        parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      observability,
    };
  }

  return { ok: true, output: parsed.data, observability };
}
