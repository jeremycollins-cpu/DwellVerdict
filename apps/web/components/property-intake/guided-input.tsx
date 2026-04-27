import { Info } from "lucide-react";

/**
 * GuidedInput — wraps any field with a label, an optional guidance
 * note (the "where to find this" tooltip-style text), and an
 * optional regional callout (used by Step 5 to flag fire/flood-zone
 * insurance markups). Pure layout — children render the actual
 * input, so this composes with `CurrencyInput`, plain `<input>`,
 * or `<select>`.
 */
export function GuidedInput({
  label,
  htmlFor,
  guidance,
  callout,
  optional,
  children,
}: {
  label: string;
  htmlFor?: string;
  guidance?: string;
  /** Region-specific risk callout (e.g. wildfire / hurricane). */
  callout?: string;
  /** Render an "optional" tag next to the label. */
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="text-[14px] font-medium text-ink"
        >
          {label}
          {optional ? (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
              Optional
            </span>
          ) : null}
        </label>
      </div>
      {children}
      {guidance ? (
        <p className="flex items-start gap-1.5 text-[12px] leading-[1.5] text-ink-muted">
          <Info className="mt-0.5 size-3 shrink-0" />
          <span>{guidance}</span>
        </p>
      ) : null}
      {callout ? (
        <p className="rounded-md border border-watch-border bg-watch-soft px-3 py-2 text-[12px] leading-[1.5] text-ink">
          <strong className="font-medium">Note:</strong> {callout}
        </p>
      ) : null}
    </div>
  );
}
