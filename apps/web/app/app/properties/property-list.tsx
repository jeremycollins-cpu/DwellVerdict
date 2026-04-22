import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";

/**
 * PropertyList — saved properties for the current org. Empty state
 * encourages the user to paste their first address; list state shows
 * address + latest verdict signal chip.
 */

type PropertyRow = {
  id: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  addressFull: string | null;
  latestVerdictSignal: "buy" | "watch" | "pass" | null;
  latestVerdictId: string | null;
  createdAt: Date;
};

const SIGNAL_STYLES: Record<
  "buy" | "watch" | "pass",
  { label: string; className: string }
> = {
  buy: {
    label: "BUY",
    className: "border-signal-buy/40 bg-signal-buy/10 text-signal-buy",
  },
  watch: {
    label: "WATCH",
    className: "border-signal-watch/40 bg-signal-watch/10 text-signal-watch",
  },
  pass: {
    label: "PASS",
    className: "border-signal-pass/40 bg-signal-pass/10 text-signal-pass",
  },
};

export function PropertyList({
  properties,
}: {
  properties: PropertyRow[];
}) {
  if (properties.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-hairline bg-card/50 px-8 py-16 text-center">
        <MapPin className="h-5 w-5 text-terracotta/70" aria-hidden />
        <h3 className="text-base font-medium tracking-[-0.01em] text-ink">
          Your first address lives here
        </h3>
        <p className="max-w-sm text-sm text-ink-muted">
          Paste any US address above to see its verdict. Every property you
          research stays here — one record, five lifecycle stages.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 overflow-hidden rounded-[14px] bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-hairline px-6 py-3">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Portfolio
        </p>
        <p className="font-mono text-[11px] text-ink-muted">
          {properties.length} {properties.length === 1 ? "property" : "properties"}
        </p>
      </div>

      <ul className="divide-y divide-hairline">
        {properties.map((p) => {
          const signalStyle = p.latestVerdictSignal
            ? SIGNAL_STYLES[p.latestVerdictSignal]
            : null;
          return (
            <li key={p.id}>
              <Link
                href={`/app/properties/${p.id}`}
                className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-paper/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate font-mono text-sm text-ink">
                    {p.addressFull ?? `${p.addressLine1}, ${p.city}, ${p.state} ${p.zip}`}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
                    Saved {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {signalStyle ? (
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.14em] ${signalStyle.className}`}
                  >
                    {signalStyle.label}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-hairline bg-paper px-2.5 py-0.5 font-mono text-[10px] text-ink-muted">
                    PENDING
                  </span>
                )}
                <ArrowRight
                  className="h-4 w-4 text-ink-muted transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
