"use client";

import { forwardRef, useEffect, useState } from "react";

/**
 * CurrencyInput — formats user typing as `$1,234,567`, exposes the
 * canonical integer-cents value via `onValueChange`. Internal state
 * is the formatted string the user sees; the parent stays in cents.
 *
 * `valueCents={null}` renders empty (used for "not yet entered" vs
 * `valueCents={0}` for "explicitly $0"). Mobile users get the decimal
 * keypad via `inputMode="decimal"`.
 */
type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  valueCents: number | null;
  onValueChange: (cents: number | null) => void;
};

export const CurrencyInput = forwardRef<HTMLInputElement, Props>(
  function CurrencyInput({ valueCents, onValueChange, className, ...rest }, ref) {
    const [display, setDisplay] = useState(() => formatFromCents(valueCents));

    useEffect(() => {
      setDisplay(formatFromCents(valueCents));
    }, [valueCents]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const cents = parseToCents(raw);
      setDisplay(formatTyping(raw));
      onValueChange(cents);
    };

    return (
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-ink-muted"
        >
          $
        </span>
        <input
          {...rest}
          ref={ref}
          type="text"
          inputMode="decimal"
          value={display}
          onChange={handleChange}
          className={`w-full rounded-md border border-hairline bg-card-ink py-2.5 pl-7 pr-3 text-[15px] text-ink shadow-sm transition-colors placeholder:text-ink-faint focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/20 ${className ?? ""}`}
        />
      </div>
    );
  },
);

function formatFromCents(cents: number | null): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "";
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatTyping(raw: string): string {
  // Allow the user to keep typing decimals; only reformat the integer part.
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [intPart, decPart] = cleaned.split(".");
  const intFmt = intPart ? Number(intPart).toLocaleString("en-US") : "";
  if (decPart === undefined) return intFmt;
  return `${intFmt}.${decPart.slice(0, 2)}`;
}

function parseToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const dollars = Number(cleaned);
  if (Number.isNaN(dollars)) return null;
  return Math.round(dollars * 100);
}
