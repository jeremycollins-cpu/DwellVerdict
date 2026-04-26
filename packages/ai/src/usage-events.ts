import { schema } from "@dwellverdict/db";
import type { AiUsageTask } from "@dwellverdict/db";

const { aiUsageEvents } = schema;

/**
 * Drizzle DB client interface that logAiUsageEvent needs. Defined
 * structurally so we don't have to drag the full @dwellverdict/db
 * client type into packages/ai — a thin shape that matches what the
 * neon-serverless-backed drizzle client exposes.
 *
 * Stays decoupled: apps/web wires the real client up via
 * setUsageLoggerDb() at request time. When unset (unit tests, eject
 * paths), logAiUsageEvent silently no-ops.
 */
export interface UsageLoggerDb {
  insert(table: typeof aiUsageEvents): {
    values(values: Record<string, unknown>): Promise<unknown>;
  };
}

export interface LogUsageParams {
  userId: string;
  orgId?: string | null;
  task: AiUsageTask;
  model: string;
  routingReason?: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  webSearchCount?: number;
  costCents: number;
  verdictId?: string | null;
  scoutMessageId?: string | null;
  durationMs?: number | null;
  batchId?: string | null;
  error?: string | null;
}

let dbClient: UsageLoggerDb | null = null;

export function setUsageLoggerDb(db: UsageLoggerDb | null): void {
  dbClient = db;
}

export function getUsageLoggerDb(): UsageLoggerDb | null {
  return dbClient;
}

/**
 * Log a single AI call to ai_usage_events.
 *
 * Failure-tolerant: if the insert throws (DB hiccup, malformed
 * field, etc.) we log to console + Sentry and return. Cost tracking
 * is important but not worth crashing the user request — the
 * surface-specific cost columns (verdicts.cost_cents,
 * scout_messages.cost_cents, regulatory_cache.cost_cents,
 * place_sentiment_cache.cost_cents) still get populated by the
 * existing flow, so we don't lose accounting entirely.
 */
export async function logAiUsageEvent(params: LogUsageParams): Promise<void> {
  if (!dbClient) {
    return;
  }
  try {
    await dbClient.insert(aiUsageEvents).values({
      userId: params.userId,
      orgId: params.orgId ?? null,
      task: params.task,
      model: params.model,
      routingReason: params.routingReason ?? null,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cacheReadInputTokens: params.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: params.cacheCreationInputTokens ?? 0,
      webSearchCount: params.webSearchCount ?? 0,
      costCents: params.costCents,
      verdictId: params.verdictId ?? null,
      scoutMessageId: params.scoutMessageId ?? null,
      durationMs: params.durationMs ?? null,
      batchId: params.batchId ?? null,
      error: params.error ?? null,
    });
  } catch (err) {
    console.error("[ai usage-events] failed to log usage event", {
      err: err instanceof Error ? err.message : String(err),
      task: params.task,
      model: params.model,
    });
    // Sentry isn't a packages/ai dependency, but it's loaded by
    // apps/web at request time. Try to capture if available so we
    // don't lose visibility on logging failures.
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      const dynamicRequire = new Function("m", "return require(m)");
      const sentry = dynamicRequire("@sentry/nextjs") as {
        captureException?: (err: unknown, ctx?: unknown) => void;
      };
      sentry.captureException?.(err, {
        tags: { operation: "log_ai_usage_event", task: params.task },
      });
    } catch {
      // Sentry unavailable (test runner, dev without Sentry). Fine.
    }
  }
}
