"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * VerdictLoader — client component that drives verdict generation for
 * a pending or failed verdict row.
 *
 * Behaviour:
 *   - autoStart=true (default): POST /api/verdicts/[id]/generate on
 *     mount. If it succeeds, refresh the page so the server component
 *     re-renders the 'ready' state.
 *   - autoStart=false: wait for the user to click "Retry". Used by
 *     the failed state so we don't silently re-spend on page load.
 *
 * We don't poll — the POST blocks until Anthropic returns (20-40s
 * typical) or the 60s route maxDuration fires. Either way, the
 * response carries the final state.
 */
export function VerdictLoader({
  verdictId,
  autoStart = true,
}: {
  verdictId: string;
  autoStart?: boolean;
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
        // Give the route handler headroom — the default 30s fetch
        // timeout some browsers apply would cut us off early.
        signal: AbortSignal.timeout(70_000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.message ?? `Generation failed (${res.status})`);
        setInFlight(false);
        router.refresh();
        return;
      }
      // Server component reads the updated row on refresh and swaps
      // in the ready VerdictCertificate.
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.includes("timeout")
            ? "Generation took too long — try again."
            : err.message
          : "Unexpected error",
      );
      setInFlight(false);
    }
  }, [verdictId, inFlight, router]);

  useEffect(() => {
    if (!autoStart) return;
    if (startedRef.current) return;
    runGeneration();
    // `runGeneration` is stable enough — we intentionally fire once
    // per mount; refetch-on-retry goes through onClick below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  if (inFlight) {
    // Pending microcopy lives inside VerdictCertificate during the
    // in-flight generation. This component stays silent unless the
    // call errors.
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        onClick={() => runGeneration()}
        className="gap-2"
      >
        <RefreshCw className="h-4 w-4" />
        Retry verdict
      </Button>
      {error ? (
        <span className="font-mono text-xs text-ink-muted">{error}</span>
      ) : null}
      {inFlight ? (
        <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
      ) : null}
    </div>
  );
}
