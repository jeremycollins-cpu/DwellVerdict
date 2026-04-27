import { Check, Minus } from "lucide-react";

/**
 * Granular feature breakdown across the three tiers. Numbers
 * verified against `apps/web/lib/db/queries/report-usage.ts`:
 *   - free verdicts: 1 lifetime (consumeReport, free branch)
 *   - starter verdicts: 50/month (PLAN_MONTHLY_LIMITS.starter)
 *   - pro verdicts: 200/month (PLAN_MONTHLY_LIMITS.pro)
 *   - scout: 30/day, 300/month, pro-only (route returns
 *     pro_required for free + starter; SCOUT_DAILY_LIMIT/
 *     SCOUT_MONTHLY_LIMIT)
 *
 * Compare/Briefs/Alerts/Portfolio appear in the Pro column with
 * "Coming soon" treatment because the actual functionality ships
 * in M4.4 / M7.1-M7.5. The Pro tier owns those features by spec
 * — the marketing claim is correct; only the shipping window
 * gates them.
 */

type Cell = boolean | string;

interface Row {
  feature: string;
  free: Cell;
  starter: Cell;
  pro: Cell;
  /** Soft note shown under the feature name. */
  note?: string;
}

const ROWS: ReadonlyArray<Row> = [
  {
    feature: "Verdict generation",
    free: "1 lifetime",
    starter: "50 / month",
    pro: "200 / month",
  },
  { feature: "Regulatory evidence", free: true, starter: true, pro: true },
  { feature: "Location evidence", free: true, starter: true, pro: true },
  { feature: "Comparable sales (ADR)", free: true, starter: true, pro: true },
  {
    feature: "Comparable sales (revenue)",
    free: false,
    starter: true,
    pro: true,
  },
  { feature: "Revenue projection", free: false, starter: true, pro: true },
  {
    feature: "Lifecycle stages",
    note: "Buying / Renovating / Managing",
    free: false,
    starter: true,
    pro: true,
  },
  {
    feature: "Tax strategy guidance (per-property)",
    note: "Cost seg, STR loophole, depreciation, 1031",
    free: false,
    starter: true,
    pro: true,
  },
  {
    feature: "Tax strategy (portfolio-wide)",
    note: "Cross-property optimization",
    free: false,
    starter: false,
    pro: true,
  },
  { feature: "CSV import + Schedule E", free: false, starter: true, pro: true },
  { feature: "PDF report export", free: false, starter: true, pro: true },
  {
    feature: "Scout AI conversations",
    note: "Pro-only · 30/day · 300/month",
    free: false,
    starter: false,
    pro: "30 / day",
  },
  {
    feature: "Compare properties",
    note: "Ships in M4.4",
    free: false,
    starter: false,
    pro: "Coming",
  },
  {
    feature: "Briefs (PDFs for clients/lenders)",
    note: "Ships in M7.1–M7.2",
    free: false,
    starter: false,
    pro: "Coming",
  },
  {
    feature: "Alerts (regulatory + market)",
    note: "Ships in M7.3–M7.4",
    free: false,
    starter: false,
    pro: "Coming",
  },
  {
    feature: "Portfolio dashboard",
    note: "Ships in M7.5",
    free: false,
    starter: false,
    pro: "Coming",
  },
  { feature: "Email support", free: true, starter: true, pro: true },
  { feature: "Cancel anytime", free: true, starter: true, pro: true },
];

const TIERS: ReadonlyArray<{
  key: "free" | "starter" | "pro";
  label: string;
  price: string;
}> = [
  { key: "free", label: "Try Free", price: "$0" },
  { key: "starter", label: "DwellVerdict", price: "$20" },
  { key: "pro", label: "Pro", price: "$40" },
];

export function ComparisonTable() {
  return (
    <section
      id="compare"
      className="bg-paper-warm px-6 py-20 md:px-12 md:py-24"
    >
      <div className="mx-auto max-w-[1080px]">
        <div className="mx-auto mb-10 max-w-[680px] text-center md:mb-12">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-terracotta">
            Compare
          </div>
          <h2 className="mt-4 font-serif text-[32px] font-normal leading-[1.15] tracking-[-0.02em] text-ink md:text-[40px]">
            Feature by feature.
          </h2>
        </div>

        {/* Desktop / tablet table — at md+ shows one row per feature
            with three cells. Below md the table is hidden and the
            stacked view below renders instead. */}
        <div className="hidden md:block">
          <DesktopTable />
        </div>

        {/* Mobile vertical transform — one section per tier with the
            full feature list under it. Easier to scan than a 3-column
            table at 380px. */}
        <div className="flex flex-col gap-8 md:hidden">
          {TIERS.map((tier) => (
            <MobileTierBlock key={tier.key} tier={tier} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DesktopTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-card-ink">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            <th className="px-5 py-4 text-left font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              Feature
            </th>
            {TIERS.map((tier) => (
              <th
                key={tier.key}
                className="w-[180px] px-5 py-4 text-left font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted"
              >
                <div className="text-ink">{tier.label}</div>
                <div className="mt-1 font-sans text-xs normal-case tracking-normal text-ink-muted">
                  {tier.price}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, i) => (
            <tr
              key={row.feature}
              className={i < ROWS.length - 1 ? "border-b border-hairline" : ""}
            >
              <td className="px-5 py-3.5 align-top">
                <div className="text-ink">{row.feature}</div>
                {row.note ? (
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
                    {row.note}
                  </div>
                ) : null}
              </td>
              <CellTd value={row.free} />
              <CellTd value={row.starter} />
              <CellTd value={row.pro} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellTd({ value }: { value: Cell }) {
  return (
    <td className="px-5 py-3.5 align-top">
      <CellValue value={value} />
    </td>
  );
}

function CellValue({ value }: { value: Cell }) {
  if (value === true) {
    return <Check className="size-4 text-buy" strokeWidth={3} />;
  }
  if (value === false) {
    return <Minus className="size-4 text-ink-faint" strokeWidth={2} />;
  }
  return <span className="text-[13.5px] text-ink-70">{value}</span>;
}

function MobileTierBlock({
  tier,
}: {
  tier: { key: "free" | "starter" | "pro"; label: string; price: string };
}) {
  return (
    <div className="rounded-xl border border-hairline bg-card-ink p-6">
      <div className="flex items-baseline justify-between border-b border-hairline pb-3">
        <div className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink">
          {tier.label}
        </div>
        <div className="text-base font-medium text-ink">{tier.price}</div>
      </div>
      <ul className="mt-3 flex flex-col gap-2.5">
        {ROWS.map((row) => {
          const value = row[tier.key];
          if (value === false) return null;
          return (
            <li
              key={row.feature}
              className="grid grid-cols-[16px_1fr_auto] items-start gap-2.5 text-[13.5px] leading-[1.4]"
            >
              <Check
                className="mt-[3px] size-3 shrink-0 text-buy"
                strokeWidth={3}
              />
              <span className="text-ink-70">
                {row.feature}
                {row.note ? (
                  <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
                    {row.note}
                  </span>
                ) : null}
              </span>
              {typeof value === "string" ? (
                <span className="font-mono text-[11px] text-ink-muted">
                  {value}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
