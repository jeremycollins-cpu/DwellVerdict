"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * VerdictLoader — client component that drives verdict generation for
 * a pending or failed verdict row.
 *
 * COST CONTROL (important — do not re-enable without thinking):
 * `autoStart` now defaults to FALSE. Previously the component fired
 * a POST on every mount, which meant every page visit to a pending
 * verdict kicked off a fresh ~$0.30 Anthropic call — reloads, tab
 * duplicates, and the post-failure refresh all silently re-spent.
 * Generation must be user-initiated via the "Generate verdict"
 * button until we have (a) server-side dedupe, (b) a daily spend
 * cap, and (c) Inngest-backed background generation.
 *
 * The button is always visible — disabled with a spinner while a
 * fetch is in-flight, clickable otherwise.
 *
 * We don't poll — the POST blocks until Anthropic returns (60-180s
 * typical) or the 300s route maxDuration fires. Either way, the
 * response carries the final state.
 */
export function VerdictLoader({
  verdictId,
  autoStart = false,
  label = "Generate verdict",
  force = false,
}: {
  verdictId: string;
  autoStart?: boolean;
  label?: string;
  /**
   * When true, send `{ force: true }` in the body so the server
   * bypasses the ready short-circuit and re-runs the orchestrator.
   * Used by the "Retry verdict" button on an already-ready row so
   * the user can refresh the narrative after a data-source fix.
   */
  force?: boolean;
}) {
  const router = useRouter();
  const [inFlight, setInFlight] = useState(autoStart);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const runGeneration = useCallback(async () => {
    if (inFlight && startedRef.current) return;
    startedRef.current = true;
    setInFlight(true);
    setError(null);

    try {
      const res = await fetch(`/api/verdicts/${verdictId}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force }),
        // Match the route handler's 300s maxDuration with a small
        // cushion so the browser doesn't abort before the server
        // has a chance to write the final row + respond.
        signal: AbortSignal.timeout(310_000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.message ?? `Generation failed (${res.status})`);
        setInFlight(false);
        startedRef.current = false;
        router.refresh();
        return;
      }
      // Server component reads the updated row on refresh and swaps
      // in the ready VerdictCertificate.
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.includes("timed out") || err.message.includes("timeout")
            ? "Generation took too long — try again."
            : err.message
          : "Unexpected error",
      );
      setInFlight(false);
      startedRef.current = false;
    }
  }, [verdictId, inFlight, router, force]);

  useEffect(() => {
    if (!autoStart) return;
    if (startedRef.current) return;
    runGeneration();
    // `runGeneration` is stable enough — we intentionally fire once
    // per mount; refetch-on-retry goes through onClick below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

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
