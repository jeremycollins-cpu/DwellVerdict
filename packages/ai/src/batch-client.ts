import Anthropic from "@anthropic-ai/sdk";

import { getAnthropicClient } from "./anthropic";

/**
 * Wrapper around Anthropic's Batch API for non-real-time AI work.
 *
 * Why batch: 50% discount on input + output tokens.
 * Tradeoff: results delivered asynchronously (≤24h SLA).
 *
 * Use cases (later milestones, not consumed in M3.0):
 *   - M7.1 brief generation — user clicks "Generate brief", in-app
 *     notification fires when ready
 *   - M7.3 alert rule evaluation — cron evaluates many properties
 *     at once
 *   - M9.2 cost analytics aggregation — overnight rollups
 *
 * Not for: verdict generation (real-time stream), Scout chat
 * (real-time conversational).
 *
 * Note: cost accounting for batch responses still flows through
 * computeCostCents in pricing.ts; the batch discount is applied by
 * Anthropic at billing time, not in our cost math. The batch_id is
 * persisted on ai_usage_events rows so we can reconcile against
 * Anthropic's invoice if needed.
 */

export interface BatchRequest {
  /** Caller-provided id used to correlate batch results with the
   *  originating row (e.g. brief id, alert rule evaluation id). */
  customId: string;
  model: string;
  systemPrompt?: string;
  messages: Array<Anthropic.Messages.MessageParam>;
  maxTokens: number;
}

export interface BatchSubmissionResult {
  batchId: string;
  /** When the batch is expected to complete by, per Anthropic's
   *  SLA. ISO-8601 string. Null if Anthropic doesn't return one. */
  expiresAt: string | null;
}

export async function submitBatch(
  requests: ReadonlyArray<BatchRequest>,
): Promise<BatchSubmissionResult> {
  if (requests.length === 0) {
    throw new Error("submitBatch called with empty request list");
  }
  const client = getAnthropicClient();

  const batch = await client.messages.batches.create({
    requests: requests.map((req) => ({
      custom_id: req.customId,
      params: {
        model: req.model,
        max_tokens: req.maxTokens,
        ...(req.systemPrompt
          ? {
              system: [
                {
                  type: "text" as const,
                  text: req.systemPrompt,
                  cache_control: { type: "ephemeral" as const },
                },
              ],
            }
          : {}),
        messages: req.messages,
      },
    })),
  });

  return {
    batchId: batch.id,
    expiresAt: batch.expires_at ?? null,
  };
}

export type BatchStatus = "in_progress" | "ended" | "failed" | "canceled";

export interface BatchStatusSnapshot {
  batchId: string;
  status: BatchStatus;
  processedCount: number;
  totalCount: number;
}

export async function pollBatchStatus(
  batchId: string,
): Promise<BatchStatusSnapshot> {
  const client = getAnthropicClient();
  const batch = await client.messages.batches.retrieve(batchId);

  const counts = batch.request_counts;
  const processedCount = counts.succeeded + counts.errored + counts.canceled + counts.expired;
  const totalCount = processedCount + counts.processing;

  let status: BatchStatus;
  switch (batch.processing_status) {
    case "ended":
      status = "ended";
      break;
    case "in_progress":
      status = "in_progress";
      break;
    case "canceling":
      status = "canceled";
      break;
    default:
      status = "failed";
  }

  return { batchId, status, processedCount, totalCount };
}

/**
 * Stream results for a finished batch. Each yielded entry has the
 * `custom_id` the submitter passed plus either a `result` (if the
 * sub-request succeeded) or an `error`.
 */
export async function* iterBatchResults(
  batchId: string,
): AsyncGenerator<Anthropic.Messages.Batches.MessageBatchIndividualResponse> {
  const client = getAnthropicClient();
  for await (const item of await client.messages.batches.results(batchId)) {
    yield item;
  }
}
