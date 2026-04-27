import type { SignalResult } from "./types";

/**
 * Reject a promise with a timeout error if it hasn't settled within
 * `ms` milliseconds. Used by the verdict orchestrator (M3.6) to put
 * a strict ceiling on each external fetcher — a slow or hung
 * upstream API can no longer drag the entire verdict generation
 * out past the function-runtime envelope.
 *
 * Note: the original promise keeps running in the background after
 * a timeout — JavaScript can't actually cancel it. Callers that
 * pass a fetch() should plumb an AbortSignal in addition to wrapping
 * with this so the network resource gets reclaimed.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label?: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const tag = label ? `${label}: ` : "";
      reject(new Error(`${tag}timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/**
 * Wrap a `Promise<SignalResult<T>>` so timeouts and unexpected
 * throws degrade to `{ ok: false }` — the orchestrator can use
 * this as the universal "soft-fail this signal" wrapper without
 * caring whether the underlying client throws or returns an
 * envelope.
 *
 * `source` is propagated into the failure result so observability
 * logs still know which fetcher this was even when the underlying
 * error envelope is replaced by a synthetic timeout error.
 */
export async function settledSignal<T>(
  promise: Promise<SignalResult<T>>,
  ms: number,
  source: string,
): Promise<SignalResult<T>> {
  try {
    return await withTimeout(promise, ms, source);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source,
    };
  }
}
