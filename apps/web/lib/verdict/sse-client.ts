"use client";

import type { VerdictProgressEvent } from "@/lib/verdict/orchestrator";

/**
 * Open a streaming POST connection to /api/verdicts/[id]/generate
 * and dispatch each Server-Sent Event to the supplied callback.
 *
 * Why a hand-rolled SSE reader instead of `EventSource`: the native
 * EventSource API only does GET requests. The verdict route needs
 * POST (to carry the `force` flag and match Next.js's POST
 * convention). The fetch + ReadableStream parser below mirrors
 * EventSource's wire format.
 *
 * Returns an `abort()` callback. Calling it cancels the underlying
 * fetch — the orchestrator on the server keeps running to
 * completion (the verdict still gets persisted) but the client
 * stops receiving events.
 */
export interface OpenVerdictStreamArgs {
  verdictId: string;
  force?: boolean;
  onEvent: (event: VerdictProgressEvent) => void;
  onConnectError: (err: unknown) => void;
}

export interface VerdictStreamHandle {
  abort: () => void;
}

export function openVerdictStream({
  verdictId,
  force,
  onEvent,
  onConnectError,
}: OpenVerdictStreamArgs): VerdictStreamHandle {
  const controller = new AbortController();

  void (async () => {
    try {
      const res = await fetch(`/api/verdicts/${verdictId}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force: force === true }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        // Either an error response (Response.json with status code)
        // or no readable body. Surface as a connect error; caller
        // falls back to polling.
        const text = await res.text().catch(() => "");
        onConnectError(
          new Error(
            `verdict stream ${res.status}: ${text.slice(0, 200) || res.statusText}`,
          ),
        );
        return;
      }

      // SSE wire-format parser. Buffers across chunk boundaries
      // because TCP doesn't respect message framing — a single
      // `event:`/`data:`/blank-line message can span several
      // ReadableStream reads on slow connections.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent: string | null = null;
      let currentData = "";

      const flush = () => {
        if (!currentEvent || !currentData) {
          currentEvent = null;
          currentData = "";
          return;
        }
        try {
          const payload = JSON.parse(currentData) as VerdictProgressEvent;
          onEvent(payload);
        } catch {
          // Malformed JSON — drop the event silently. Keeps the
          // stream healthy if a payload gets truncated mid-flight.
        }
        currentEvent = null;
        currentData = "";
      };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          flush();
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        // Each SSE message ends with a blank line ("\n\n").
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);

          if (line === "") {
            flush();
            continue;
          }
          if (line.startsWith(":")) {
            // Comment/heartbeat — ignore.
            continue;
          }
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            // Data lines accumulate (multi-line data is concatenated
            // with newlines per the SSE spec; we collapse to one
            // payload here since our server emits single-line data).
            currentData += line.slice(5).trim();
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return; // user-initiated cancel
      onConnectError(err);
    }
  })();

  return {
    abort: () => controller.abort(),
  };
}

/**
 * Polling fallback for clients that lost the SSE connection. Hits
 * /api/verdicts/[id]/status every `intervalMs` and resolves once
 * the verdict transitions to a terminal state (ready or failed).
 */
export interface PollVerdictArgs {
  verdictId: string;
  intervalMs?: number;
  signal?: AbortSignal;
}

export interface PollVerdictResult {
  status: "ready" | "failed";
  errorMessage?: string | null;
}

export async function pollVerdictUntilDone({
  verdictId,
  intervalMs = 2000,
  signal,
}: PollVerdictArgs): Promise<PollVerdictResult> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) {
      throw new Error("polling aborted");
    }
    const res = await fetch(`/api/verdicts/${verdictId}/status`, {
      cache: "no-store",
      signal,
    });
    if (res.ok) {
      const body = (await res.json()) as {
        ok: boolean;
        status: "pending" | "ready" | "failed";
        errorMessage?: string | null;
      };
      if (body.ok && body.status === "ready") {
        return { status: "ready" };
      }
      if (body.ok && body.status === "failed") {
        return { status: "failed", errorMessage: body.errorMessage };
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
