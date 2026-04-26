import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import { getAnthropicClient } from "../anthropic";
import { computeCostCents } from "../pricing";
import { logAiUsageEvent } from "../usage-events";

/**
 * Scout chat — property-scoped conversational AI per ADR-8 (Pro
 * tier only).
 *
 * Multi-turn chat. Each call receives the full conversation history
 * (capped to last N turns for context-window efficiency) plus the
 * latest user message, and returns a plain assistant reply string.
 *
 * The Pro-tier gate + 30/day + 300/month rate limits are enforced
 * in the caller (consumeScoutMessage query) before this task runs.
 * Fair-housing discipline enforced in the prompt; the
 * place-sentiment lint function (lintPlaceSentiment /
 * containsFairHousingFlag) can be applied to the reply by callers
 * as defense-in-depth.
 */

export const SCOUT_CHAT_TASK_TYPE = "scout_chat";
export const SCOUT_CHAT_PROMPT_VERSION = "v1";
export const SCOUT_CHAT_MODEL = "claude-haiku-4-5";

/** Cap how many prior turns we send to the model. Older turns
 * remain in the persisted transcript but aren't re-prompted. */
export const SCOUT_CHAT_HISTORY_CAP = 20;

export type ScoutChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ScoutChatInput = {
  /** Arbitrary structured property context (verdict signals,
   * address, etc.) serialized into the system prompt. The caller
   * assembles this from whatever's available in the DB. */
  propertyContext: unknown;
  /** Prior conversation. Oldest-first. Latest user message is
   * part of `userMessage`, NOT included in history. */
  history: ScoutChatTurn[];
  userMessage: string;
  /** Optional userId so the call can be logged to ai_usage_events.
   *  Omit in unit tests; logging silently no-ops. */
  userId?: string;
  /** Optional orgId. Threaded into ai_usage_events for org-scoped
   *  cost analytics. */
  orgId?: string;
};

export type ScoutChatSuccess = {
  ok: true;
  reply: string;
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

export type ScoutChatFailure = {
  ok: false;
  error: string;
  observability: Partial<ScoutChatSuccess["observability"]>;
};

function loadPromptTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "prompts", "scout-chat.v1.md"),
    join(here, "..", "..", "..", "..", "prompts", "scout-chat.v1.md"),
    join(process.cwd(), "..", "..", "prompts", "scout-chat.v1.md"),
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
    `scout-chat prompt template not found. Tried: ${candidates.join(", ")}. ` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

function renderSystemPrompt(propertyContext: unknown): string {
  const template = loadPromptTemplate();
  const [, afterSystem] = template.split(/^## System\s*$/m);
  if (!afterSystem) throw new Error("prompt missing '## System' heading");
  const [systemText] = afterSystem.split(/^## User\s*$/m);
  if (!systemText) throw new Error("prompt missing system body");

  return systemText
    .replaceAll("{{PROPERTY_CONTEXT}}", JSON.stringify(propertyContext, null, 2))
    .trim();
}

export async function sendScoutMessage(
  input: ScoutChatInput,
): Promise<ScoutChatSuccess | ScoutChatFailure> {
  let client: Anthropic;
  let systemPrompt: string;
  try {
    client = getAnthropicClient();
    systemPrompt = renderSystemPrompt(input.propertyContext);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `scout_chat_setup_failed: ${message}`,
      observability: {
        modelVersion: SCOUT_CHAT_MODEL,
        promptVersion: SCOUT_CHAT_PROMPT_VERSION,
      },
    };
  }

  // Trim history to the last N turns.
  const recent = input.history.slice(-SCOUT_CHAT_HISTORY_CAP);

  // Anthropic's Messages API requires strict role alternation.
  // Coalesce consecutive same-role turns (shouldn't normally
  // happen but guard against it).
  const messages: Anthropic.Messages.MessageParam[] = [];
  for (const turn of recent) {
    const last = messages[messages.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${asString(last.content)}\n\n${turn.content}`;
    } else {
      messages.push({ role: turn.role, content: turn.content });
    }
  }
  // Append the new user message. If the last entry was also "user",
  // coalesce; otherwise push a new turn.
  const tail = messages[messages.length - 1];
  if (tail && tail.role === "user") {
    tail.content = `${asString(tail.content)}\n\n${input.userMessage}`;
  } else {
    messages.push({ role: "user", content: input.userMessage });
  }

  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    response = await client.messages.create(
      {
        model: SCOUT_CHAT_MODEL,
        max_tokens: 800,
        system: [
          {
            type: "text",
            text: systemPrompt,
            // Cache the system prompt + property context. Within
            // a single session the same property context is
            // identical on every turn, so this pays ~90% of the
            // per-turn input cost back.
            cache_control: { type: "ephemeral" },
          },
        ],
        messages,
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
    console.error("[scout-chat] Anthropic call failed", {
      message,
      elapsedMs: Date.now() - startedAt,
    });
    if (input.userId) {
      await logAiUsageEvent({
        userId: input.userId,
        orgId: input.orgId,
        task: "scout-chat",
        model: SCOUT_CHAT_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
        durationMs: Date.now() - startedAt,
        error: message,
      });
    }
    return {
      ok: false,
      error: message,
      observability: {
        modelVersion: SCOUT_CHAT_MODEL,
        promptVersion: SCOUT_CHAT_PROMPT_VERSION,
      },
    };
  }

  // Collect text from the response. There should be exactly one
  // text block in the output for v0 (no tool use, no thinking).
  const reply = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim();

  if (!reply) {
    return {
      ok: false,
      error: `scout returned empty reply; stop_reason=${response.stop_reason}`,
      observability: {
        modelVersion: SCOUT_CHAT_MODEL,
        promptVersion: SCOUT_CHAT_PROMPT_VERSION,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens:
          response.usage.cache_creation_input_tokens ?? 0,
        costCents: computeCostCents({
          model: SCOUT_CHAT_MODEL,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens:
            response.usage.cache_creation_input_tokens ?? 0,
        }),
      },
    };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadInputTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheCreationInputTokens =
    response.usage.cache_creation_input_tokens ?? 0;

  console.log("[scout-chat] call complete", {
    elapsedMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    stopReason: response.stop_reason,
  });

  const costCents = computeCostCents({
    model: SCOUT_CHAT_MODEL,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
  });

  if (input.userId) {
    await logAiUsageEvent({
      userId: input.userId,
      orgId: input.orgId,
      task: "scout-chat",
      model: SCOUT_CHAT_MODEL,
      inputTokens,
      outputTokens,
      cacheReadInputTokens,
      cacheCreationInputTokens,
      costCents,
      durationMs: Date.now() - startedAt,
    });
  }

  return {
    ok: true,
    reply,
    observability: {
      modelVersion: SCOUT_CHAT_MODEL,
      promptVersion: SCOUT_CHAT_PROMPT_VERSION,
      inputTokens,
      outputTokens,
      cacheReadInputTokens,
      cacheCreationInputTokens,
      costCents,
    },
  };
}

function asString(content: Anthropic.Messages.MessageParam["content"]): string {
  if (typeof content === "string") return content;
  // Block array — shouldn't happen in our construction path, but
  // handle defensively.
  return content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
}
