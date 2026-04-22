"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

/**
 * VerdictDial — the signature visual element of a DwellVerdict.
 *
 * Intentional styling choices (per Verdict Ledger direction):
 *   - Thin 2.2px stroke — reads as engraved detail on a certificate,
 *     not a Fitbit progress ring.
 *   - Muted color levels — the arc uses the signal color at ~75-80%
 *     opacity, not the full saturated signal. The dial is a
 *     typographic accent, not a status indicator that screams.
 *   - Caption sits ABOVE the ring, not inside it. The ring is the
 *     indicator; the label is the context. Inside the ring stays
 *     empty by default so the ring itself carries the meaning.
 *   - Optional inner label for real property reports where you want
 *     a verdict word ("BUY") or percentage ("82%") centered in the
 *     ring. Never used in neutral/placeholder state.
 *   - Scroll-into-view animation draws the arc from 0 → target fill
 *     over ~900ms, fires once. Respects prefers-reduced-motion.
 */

type VerdictState = "buy" | "watch" | "pass" | "neutral";

type Props = {
  /** 0-100; percentage of the ring the arc fills. */
  fill: number;
  /** Semantic verdict state — drives the arc color. */
  state?: VerdictState;
  /** Outer diameter of the ring in pixels. Default 64. */
  size?: number;
  /** Small text rendered above the ring. Default "VERDICT". */
  caption?: string;
  /**
   * Optional text rendered inside the ring. Leave undefined for
   * neutral/placeholder states — the empty ring speaks more cleanly.
   * For real property reports, pass the verdict word ("BUY") or a
   * percentage ("82%").
   */
  innerLabel?: string;
};

const ARC_COLOR: Record<VerdictState, string> = {
  buy: "hsl(var(--signal-buy) / 0.78)",
  watch: "hsl(var(--signal-watch) / 0.82)",
  pass: "hsl(var(--signal-pass) / 0.80)",
  neutral: "hsl(var(--ink-muted) / 0.40)",
};

export function VerdictDial({
  fill,
  state = "neutral",
  size = 64,
  caption = "VERDICT",
  innerLabel,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduceMotion = useReducedMotion();
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (inView && !hasAnimated) {
      setHasAnimated(true);
    }
  }, [inView, hasAnimated]);

  const viewBoxSize = 100;
  const strokeWidth = 2.2;
  const radius = (viewBoxSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetDash =
    circumference * (Math.max(0, Math.min(100, fill)) / 100);

  const shouldAnimate = !reduceMotion && hasAnimated;
  const finalDash = shouldAnimate ? targetDash : reduceMotion ? targetDash : 0;

  const displayFill = Math.round(Math.max(0, Math.min(100, fill)));

  return (
    <div
      className="inline-flex flex-col items-center gap-2.5"
      aria-label={`${caption.toLowerCase()} dial at ${displayFill} percent, state: ${state}`}
    >
      {/* Caption above the ring — uppercase mono, small, tracked-open.
          Reads as the label on a certificate, not a widget title. */}
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
        {caption}
      </span>

      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className="block"
      >
        {/* Reference track — the full 360° ring in a near-hairline
            color. Provides context against which the filled arc reads
            as a measurement. */}
        <circle
          cx={viewBoxSize / 2}
          cy={viewBoxSize / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--ink) / 0.08)"
          strokeWidth={strokeWidth}
        />

        {/* Filled arc. Starts at 12 o'clock via -90° rotation. */}
        <motion.circle
          cx={viewBoxSize / 2}
          cy={viewBoxSize / 2}
          r={radius}
          fill="none"
          stroke={ARC_COLOR[state]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - finalDash }}
          transition={{
            duration: 0.9,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "center",
          }}
        />

        {/* Inner label — only rendered when caller provides one.
            Neutral/placeholder rings intentionally stay empty. */}
        {innerLabel ? (
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-ink"
            style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: "14px",
              letterSpacing: "0.04em",
              fontWeight: 600,
            }}
          >
            {innerLabel}
          </text>
        ) : null}
      </svg>
    </div>
  );
}
