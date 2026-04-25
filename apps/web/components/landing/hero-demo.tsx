/**
 * Stylized verdict preview rendered below the hero copy. Static —
 * not interactive, not wired to real data. Sole purpose is to
 * communicate "this is what your verdict will look like" before
 * the user signs up. Uses the actual brand colors and signal
 * conventions so the preview is accurate at the visual level even
 * if the data is fabricated.
 */
export function HeroDemo() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-hairline bg-card-ink shadow-[0_40px_80px_-40px_rgba(28,25,23,0.25)]">
      {/* Soft terracotta glow bleeding in from the top. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-10 h-[280px]"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(197, 90, 63, 0.08) 0%, transparent 60%)",
        }}
      />

      {/* Faux browser bar so the eye reads the demo as a real product
          screenshot, not a marketing block. */}
      <div className="relative flex items-center gap-2 border-b border-hairline bg-paper px-4 py-3">
        <span className="size-2.5 rounded-full bg-ink-faint" />
        <span className="size-2.5 rounded-full bg-ink-faint" />
        <span className="size-2.5 rounded-full bg-ink-faint" />
        <span className="ml-3 flex-1 truncate rounded bg-paper-warm px-3 py-1.5 font-mono text-[11px] text-ink-muted">
          dwellverdict.com/app/properties/295-bend-ave-kings-beach-ca
        </span>
      </div>

      <div className="relative bg-paper p-6 md:p-9">
        <div className="mx-auto flex max-w-[800px] flex-col items-stretch gap-6 rounded-[10px] border border-hairline border-l-[3px] border-l-buy bg-card-ink p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-7">
          {/* Confidence dial. */}
          <div className="relative size-[100px] shrink-0 self-center">
            <svg viewBox="0 0 120 120" className="size-full -rotate-90">
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="rgba(28,25,23,0.08)"
                strokeWidth="4"
              />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="hsl(var(--buy))"
                strokeWidth="4"
                strokeDasharray="261 326"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[28px] font-medium leading-none tracking-[-0.03em] text-ink">
                80
              </span>
              <span className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-ink-muted">
                Confidence
              </span>
            </div>
          </div>

          <div className="flex-1 text-left">
            <div className="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-buy">
              <span className="size-[5px] rounded-full bg-buy" />
              <span>Verdict · Buy</span>
            </div>
            <div className="mt-1.5 text-[28px] font-medium leading-[1.05] tracking-[-0.03em] text-ink sm:text-[34px]">
              Move forward.
            </div>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-ink-muted">
              Permitted STR, strong comps at $525 median ADR, walkable
              waterfront. Watch HOA overlay.
            </p>
          </div>
        </div>

        <div className="mx-auto mt-5 grid max-w-[800px] grid-cols-2 gap-3 sm:grid-cols-4">
          <DemoMetric label="Revenue" value="$68.2K" tone="buy" />
          <DemoMetric label="Occupancy" value="67%" tone="buy" />
          <DemoMetric label="Regulatory" value="Permitted" tone="buy" />
          <DemoMetric label="Location" value="62/100" tone="watch" />
        </div>
      </div>
    </div>
  );
}

function DemoMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "buy" | "watch";
}) {
  return (
    <div className="rounded-lg border border-hairline bg-card-ink px-4 py-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </div>
      <div
        className={`mt-1.5 text-xl font-medium tracking-[-0.02em] ${
          tone === "buy" ? "text-buy" : "text-watch"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
