import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Thin metric tile used in glance metric rows on Dashboard, Verdicts,
 * Portfolio, and Alerts surfaces in the M1.x+ refactor mockups.
 *
 *   ┌────────────────────────┐
 *   │ TOTAL VERDICTS         │ ← mono 10px uppercase muted
 *   │ 12 all time            │ ← 22px Geist medium + mono unit
 *   │ +3 vs Mar              │ ← optional delta
 *   └────────────────────────┘
 */

export type GlanceSignal = "buy" | "watch" | "pass";
export type GlanceDeltaTone = "positive" | "negative" | "neutral";

export interface GlanceTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  /** Small mono unit baseline-aligned with the value, e.g. "all time". */
  unit?: string;
  /** Delta line below the value, e.g. "+3 vs Mar". */
  delta?: string;
  deltaTone?: GlanceDeltaTone;
  /** Renders a 3px terracotta left-border accent. */
  accent?: boolean;
  /** When set, paints the value in the corresponding signal color. */
  signal?: GlanceSignal;
}

const DELTA_TONE: Record<GlanceDeltaTone, string> = {
  positive: "text-buy",
  negative: "text-pass",
  neutral: "text-ink-muted",
};

const SIGNAL_TONE: Record<GlanceSignal, string> = {
  buy: "text-buy",
  watch: "text-watch",
  pass: "text-pass",
};

export function GlanceTile({
  label,
  value,
  unit,
  delta,
  deltaTone = "neutral",
  accent = false,
  signal,
  className,
  ...rest
}: GlanceTileProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-hairline bg-card-ink px-4 py-[14px]",
        accent && "border-l-[3px] border-l-terracotta",
        className,
      )}
      {...rest}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-[22px] font-medium leading-none tracking-[-0.02em] text-ink",
            signal && SIGNAL_TONE[signal],
          )}
        >
          {value}
        </span>
        {unit ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
            {unit}
          </span>
        ) : null}
      </div>
      {delta ? (
        <div
          className={cn(
            "mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em]",
            DELTA_TONE[deltaTone],
          )}
        >
          {delta}
        </div>
      ) : null}
    </div>
  );
}
