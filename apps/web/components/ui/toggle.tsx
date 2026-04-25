"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Custom toggle switch matching the M1.x+ refactor mockup style.
 *
 * Default size: 32×18 track, 14×14 thumb. Terracotta when on, ink-faint when off.
 * Smooth 150ms transition. Keyboard-accessible (Space / Enter).
 */

const SIZES = {
  sm: { track: "h-4 w-7", thumb: "size-3", translate: "translate-x-3" },
  md: { track: "h-[18px] w-8", thumb: "size-3.5", translate: "translate-x-[14px]" },
} as const;

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  id?: string;
  name?: string;
}

export function Toggle({
  checked,
  onChange,
  disabled = false,
  size = "md",
  className,
  id,
  name,
  ...aria
}: ToggleProps) {
  const dims = SIZES[size];
  return (
    <button
      type="button"
      role="switch"
      id={id}
      name={name}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-[2px] transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        dims.track,
        checked ? "bg-terracotta" : "bg-ink-faint",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      {...aria}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block rounded-full bg-card-ink shadow-sm transition-transform duration-150",
          dims.thumb,
          checked ? dims.translate : "translate-x-0",
        )}
      />
    </button>
  );
}
