"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { pollVerdictUntilDone } from "@/lib/verdict/sse-client";

/**
 * VerdictLoader — compact button used by the regenerate (ready
 * verdict) and retry (failed verdict) flows.
 *
 * Hits POST /api/verdicts/[id]/generate to start orchestration,
 * then polls /api/verdicts/[id]/status until the row reaches a
 * terminal state. Doesn't render mockup-04's streaming UI — that's
 * StreamingVerdict's job for the pending-verdict primary flow.
 *
 * COST CONTROL (preserved from the M3.0-era VerdictLoader):
 * generation is user-initiated via the button below — every page
 * load to a pending verdict does NOT trigger a fresh Anthropic
 * call. This stays until in-flight dedupe (Inngest event-key,
 * server-side claim column, etc.) lands as a v1.1 follow-up.
 */
export function VerdictLoader({
  verdictId,
  label = "Generate verdict",
  force = false,
}: {
  verdictId: string;
  label?: string;
  /**
   * When true, send `{ force: true }` so the server bypasses the
   * ready short-circuit and re-runs the orchestrator. Used by the
   * "Regenerate verdict" button on an already-ready row.
   */
  force?: boolean;
}) {
  const router = useRouter();
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const runGeneration = useCallback(async () => {
    if (inFlight && startedRef.current) return;
    startedRef.current = true;
    setInFlight(true);
    setError(null);

    try {
      // Fire and forget — the SSE stream goes unread; we don't need
      // its events for this surface. The server-side orchestrator
      // still runs to completion and writes markVerdictReady /
      // markVerdictFailed regardless of whether we consume the
      // stream here. We then poll /status until the row settles.
      const res = await fetch(`/api/verdicts/${verdictId}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          (body as { message?: string })?.message ??
            `Generation failed (${res.status})`,
        );
        router.refresh();
        return;
      }

      // For a ready short-circuit (status===ready, !force) the
      // server returns plain JSON. Don't poll — just refresh.
      if (res.headers.get("content-type")?.includes("application/json")) {
        router.refresh();
        return;
      }

      // Otherwise the body is an SSE stream we don't read here.
      // Polling is sturdier than parsing the stream just to know
      // "is it done yet" — single endpoint, idempotent, no SSE
      // wire-format edge cases.
      const result = await pollVerdictUntilDone({
        verdictId,
        intervalMs: 2000,
      });

      if (result.status === "failed") {
        setError(
          result.errorMessage ??
            "Generation failed. Try again — failures don't count against your quota.",
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setInFlight(false);
      startedRef.current = false;
    }
  }, [verdictId, inFlight, router, force]);

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        onClick={() => runGeneration()}
        disabled={inFlight}
        className="gap-2"
      >
        {inFlight ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {inFlight ? "Working…" : label}
      </Button>
      {error ? (
        <span className="font-mono text-xs text-ink-muted">{error}</span>
      ) : null}
    </div>
  );
}
