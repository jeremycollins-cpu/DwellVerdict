"use client";

import { useEffect, useState } from "react";

/**
 * PendingMicrocopy — the rotating "what is Scout doing?" caption shown
 * inside the VerdictCertificate while the Anthropic call is in flight.
 *
 * Micro-copy rotates every 2.8s through the realistic stages of the
 * generation pipeline. Keeps the user oriented during the 20-40s
 * typical verdict latency. Each line ends at a natural stopping point
 * so the rotation feels considered, not jittery.
 */

const STAGES = [
  "Scout is pulling comparable listings…",
  "Checking short-term-rental regulations…",
  "Modeling revenue and occupancy…",
  "Reading the neighborhood…",
  "Drafting the verdict…",
];

const CADENCE_MS = 2800;

export function PendingMicrocopy() {
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStageIdx((i) => (i + 1) % STAGES.length);
    }, CADENCE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="mt-2 flex items-center gap-3">
      <span
        aria-hidden
        className="relative flex h-2 w-2"
      >
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-terracotta opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-terracotta" />
      </span>
      <span
        key={stageIdx}
        className="animate-in fade-in text-sm text-ink-muted"
      >
        {STAGES[stageIdx]}
      </span>
    </div>
  );
}
