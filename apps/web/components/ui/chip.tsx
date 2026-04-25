import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Multi-variant chip used for filters, signals, statuses, and tags
 * across the M1.x+ refactor surfaces.
 *
 *   variant="filter"  → filter bar pill (active/inactive states)
 *   variant="signal"  → verdict signal pill (buy/watch/pass)
 *   variant="status"  → neutral state pill (estimated/committed/etc.)
 *   variant="tag"     → small taxonomy tag, no border
 *
 * Renders as a `<button>` when `onClick` is supplied, otherwise as a `<span>`.
 */

const chipVariants = cva(
  "inline-flex select-none items-center gap-1.5 whitespace-nowrap rounded-full border transition-colors",
  {
    variants: {
      variant: {
        filter:
          "border-hairline-strong bg-card-ink text-ink-70 hover:border-ink/30 hover:text-ink data-[active=true]:border-ink data-[active=true]:bg-ink data-[active=true]:text-paper",
        signal: "font-mono uppercase tracking-[0.16em]",
        status:
          "font-mono uppercase tracking-[0.14em] border-hairline-strong bg-paper-warm text-ink-70",
        tag: "font-mono uppercase tracking-[0.12em] border-transparent bg-paper-warm text-ink-muted",
      },
      size: {
        sm: "h-6 px-2 text-[10px]",
        md: "h-7 px-2.5 text-[11px]",
      },
      interactive: {
        true: "cursor-pointer",
        false: "cursor-default",
      },
    },
    compoundVariants: [
      { variant: "tag", size: "sm", className: "px-1.5" },
      { variant: "tag", size: "md", className: "px-2" },
    ],
    defaultVariants: {
      variant: "filter",
      size: "sm",
      interactive: false,
    },
  },
);

type ChipVariant = "filter" | "signal" | "status" | "tag";
type ChipSize = "sm" | "md";
export type ChipSignal = "buy" | "watch" | "pass";

const SIGNAL_CLASSES: Record<ChipSignal, string> = {
  buy: "border-buy-border bg-buy-soft text-buy",
  watch: "border-watch-border bg-watch-soft text-watch",
  pass: "border-pass-border bg-pass-soft text-pass",
};

const SIGNAL_DOT: Record<ChipSignal, string> = {
  buy: "bg-buy",
  watch: "bg-watch",
  pass: "bg-pass",
};

export interface ChipProps
  extends Pick<VariantProps<typeof chipVariants>, never> {
  variant?: ChipVariant;
  size?: ChipSize;
  signal?: ChipSignal;
  active?: boolean;
  leadingIcon?: React.ReactNode;
  /** Optional count chip rendered to the right (filter variant). */
  count?: number;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  children: React.ReactNode;
}

export function Chip({
  variant = "filter",
  size = "sm",
  signal,
  active = false,
  leadingIcon,
  count,
  onClick,
  disabled,
  className,
  children,
  ...aria
}: ChipProps) {
  const interactive = typeof onClick === "function";

  const signalClasses =
    variant === "signal" && signal ? SIGNAL_CLASSES[signal] : undefined;

  const classes = cn(
    chipVariants({ variant, size, interactive }),
    signalClasses,
    disabled && "opacity-50 cursor-not-allowed",
    className,
  );

  const content = (
    <>
      {variant === "signal" && signal ? (
        <span
          aria-hidden
          className={cn("inline-block size-1.5 rounded-full", SIGNAL_DOT[signal])}
        />
      ) : null}
      {leadingIcon ? (
        <span className="inline-flex size-3.5 items-center justify-center text-current [&_svg]:size-3.5">
          {leadingIcon}
        </span>
      ) : null}
      <span className="leading-none">{children}</span>
      {typeof count === "number" ? (
        <span
          className={cn(
            "ml-1 inline-flex min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] tabular-nums",
            active ? "bg-paper/20 text-paper" : "bg-paper-warm text-ink-muted",
          )}
        >
          {count}
        </span>
      ) : null}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        data-active={active || undefined}
        className={classes}
        {...aria}
      >
        {content}
      </button>
    );
  }

  return (
    <span data-active={active || undefined} className={classes} {...aria}>
      {content}
    </span>
  );
}
