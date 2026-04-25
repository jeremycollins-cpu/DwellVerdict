import { BarChart3, Check, Grid3X3, MapPin, Shield } from "lucide-react";

const CHECKLIST = [
  "Every source cited. Click through to verify.",
  "Confidence scored per domain. Know when to trust it.",
  "Re-run any verdict. The record follows the home.",
  "Share verdicts with advisors, lenders, or partners.",
];

const DOMAINS: Array<{
  icon: typeof Shield;
  title: string;
  desc: string;
  chip: string;
  tone: "buy" | "watch";
}> = [
  {
    icon: Shield,
    title: "Regulatory",
    desc: "STR permits, zoning, HOA overlays, ordinance tracking",
    chip: "Permitted",
    tone: "buy",
  },
  {
    icon: Grid3X3,
    title: "Comparable Properties",
    desc: "Real comps within 1 mile · ADR · occupancy · revenue",
    chip: "15 comps",
    tone: "buy",
  },
  {
    icon: BarChart3,
    title: "Revenue Projection",
    desc: "Comp-weighted annual revenue · seasonality · uplift",
    chip: "$68.2K",
    tone: "buy",
  },
  {
    icon: MapPin,
    title: "Location Signal",
    desc: "Walk score · amenities · nearby listings · seasonality",
    chip: "Mixed",
    tone: "watch",
  },
];

/**
 * Anatomy section — editorial moment between the explainer and the
 * pricing pitch. Left column carries the long-form pitch in serif;
 * right column shows the four evidence domains as concrete blocks
 * so the abstract claim ("we show our work") has visual evidence.
 */
export function AnatomyOfVerdict() {
  return (
    <section className="bg-paper-warm px-6 py-20 md:px-12 md:py-24">
      <div className="mx-auto grid max-w-[1280px] items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="font-serif text-[36px] font-normal leading-[1.15] tracking-[-0.02em] text-ink md:text-[44px]">
            Anatomy of a verdict.
          </h2>
          <p className="mt-5 text-[16px] leading-[1.65] text-ink-70">
            Every DwellVerdict is built on{" "}
            <strong className="font-medium text-ink">
              four evidence domains
            </strong>
            . We don&rsquo;t just spit out a number — we show our work.
          </p>
          <p className="mt-4 text-[16px] leading-[1.65] text-ink-70">
            Each verdict cites its sources, flags its confidence level, and
            tells you explicitly what would move the rating. If the data is
            weak in one domain, we say so. If it&rsquo;s strong, we show you
            why.
          </p>

          <ul className="mt-6 space-y-0">
            {CHECKLIST.map((item, i) => (
              <li
                key={item}
                className={`grid grid-cols-[20px_1fr] items-start gap-3.5 py-3 text-[15px] leading-[1.5] text-ink-70 ${
                  i < CHECKLIST.length - 1
                    ? "border-b border-hairline"
                    : ""
                }`}
              >
                <Check
                  className="mt-[3px] size-3.5 text-buy"
                  strokeWidth={3}
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-[10px] border border-hairline bg-card-ink p-6 md:p-7">
          {DOMAINS.map((d, i) => {
            const Icon = d.icon;
            return (
              <div
                key={d.title}
                className={`flex items-center gap-4 py-4 ${
                  i < DOMAINS.length - 1 ? "border-b border-hairline" : ""
                }`}
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-paper-warm text-ink-70">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">{d.title}</div>
                  <div className="mt-0.5 text-[12.5px] leading-[1.45] text-ink-muted">
                    {d.desc}
                  </div>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded-[10px] border px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.14em] ${
                    d.tone === "buy"
                      ? "border-buy-border bg-buy-soft text-buy"
                      : "border-watch-border bg-watch-soft text-watch"
                  }`}
                >
                  {d.chip}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
