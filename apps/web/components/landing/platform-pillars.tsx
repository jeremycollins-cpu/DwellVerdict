import {
  BarChart3,
  Bell,
  Calculator,
  FileSearch,
  FileText,
  Hammer,
  Handshake,
  LayoutDashboard,
  MessageCircle,
} from "lucide-react";

/**
 * Beyond-the-verdict platform pillars (M2.5). Sits between the
 * three-step explainer (HOW verdicts work) and the Anatomy section
 * (WHAT'S in a verdict). At this point the reader knows the verdict
 * mechanic — this section tells them the verdict is one piece of a
 * larger platform that follows them through the property lifecycle.
 *
 * Visual treatment intentionally reuses M2.1 card primitives
 * (`bg-card-ink` + `border-hairline`) so M2.5 stays copy-only.
 */

type Tier = "All plans" | "DwellVerdict / Pro" | "Pro";

const PILLARS: ReadonlyArray<{
  icon: typeof FileSearch;
  title: string;
  desc: string;
  tier: Tier;
}> = [
  {
    icon: FileSearch,
    title: "Property evaluation",
    desc: "AI-powered verdicts on any property in seconds. Buy, watch, or pass — backed by data you verify yourself.",
    tier: "All plans",
  },
  {
    icon: Handshake,
    title: "Buying guidance",
    desc: "Offer planning, due diligence checklists, contract guidance, and closing prep — designed for your investment thesis.",
    tier: "DwellVerdict / Pro",
  },
  {
    icon: Hammer,
    title: "Renovating guidance",
    desc: "Track scope, budget, contractors, and timeline. Activate cost segregation when it's worth it.",
    tier: "DwellVerdict / Pro",
  },
  {
    icon: BarChart3,
    title: "Managing guidance",
    desc: "Operational tracking, revenue management, and Schedule E-ready P&L — for STR or LTR.",
    tier: "DwellVerdict / Pro",
  },
  {
    icon: Calculator,
    title: "Tax strategy",
    desc: "Cost segregation, the STR loophole, depreciation schedules, 1031 exchanges. The strategies most investors miss.",
    tier: "DwellVerdict / Pro",
  },
  {
    icon: MessageCircle,
    title: "Scout AI",
    desc: "Conversational advisor available everywhere. Ask anything about your properties, your strategy, or the next decision.",
    tier: "Pro",
  },
  {
    icon: FileText,
    title: "Briefs",
    desc: "Shareable PDFs for partners, lenders, and agents. Make your case professionally.",
    tier: "Pro",
  },
  {
    icon: Bell,
    title: "Alerts",
    desc: "Regulatory changes, market shifts, and opportunities — pushed to you when they matter.",
    tier: "Pro",
  },
  {
    icon: LayoutDashboard,
    title: "Portfolio dashboard",
    desc: "Cross-property insights and strategy. See the whole picture.",
    tier: "Pro",
  },
];

export function PlatformPillars() {
  return (
    <section
      id="platform"
      className="mx-auto max-w-[1280px] scroll-mt-20 px-6 py-20 md:px-12 md:py-24"
    >
      <div className="mx-auto mb-12 max-w-[760px] text-center md:mb-14">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-terracotta">
          The platform
        </div>
        <h2 className="mt-4 font-serif text-[36px] font-normal leading-[1.15] tracking-[-0.02em] text-ink md:text-[44px]">
          Beyond the verdict — your complete real estate co-pilot.
        </h2>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-muted md:text-[17px]">
          DwellVerdict is more than evaluation. We guide you through every
          stage of property ownership.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PILLARS.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.title}
              className="flex flex-col gap-3 rounded-[10px] border border-hairline bg-card-ink p-6 transition-colors hover:border-hairline-strong md:p-7"
            >
              <span className="inline-flex size-10 items-center justify-center rounded-lg bg-paper-warm text-ink-70">
                <Icon className="size-[18px]" strokeWidth={1.75} />
              </span>
              <h3 className="text-[17px] font-medium leading-[1.3] tracking-[-0.01em] text-ink">
                {p.title}
              </h3>
              <p className="text-[14px] leading-[1.55] text-ink-muted">
                {p.desc}
              </p>
              <div className="mt-auto pt-2">
                <span className="inline-flex items-center rounded-full border border-hairline px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                  Available in: {p.tier}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
