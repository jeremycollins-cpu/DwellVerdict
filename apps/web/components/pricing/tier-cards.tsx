import Link from "next/link";
import { Check } from "lucide-react";
import { auth } from "@clerk/nextjs/server";

import { CheckoutButton } from "@/app/pricing/checkout-button";

const FREE_FEATURES = [
  "1 full verdict (no degraded preview)",
  "Regulatory + Location evidence",
  "Comparable sales (ADR)",
  "No credit card required",
];

const STARTER_FEATURES = [
  "50 verdicts per calendar month",
  "Lifecycle stages (Buying / Renovating / Managing)",
  "Tax strategy guidance",
  "Full Regulatory + Location evidence",
  "Full Comps with ADR + revenue",
  "CSV import + Schedule E summary",
  "PDF report export",
];

const PRO_FEATURES = [
  "Everything in DwellVerdict",
  "200 verdicts per calendar month",
  "Scout AI conversations (30/day · 300/month)",
  "Advanced tax strategy",
  "Compare · Briefs · Alerts",
  "Portfolio dashboard",
];

/**
 * The hero of the pricing page — three side-by-side tier cards
 * with a paragraph of context above. Pro is highlighted as the
 * recommended option per the mockup pattern.
 *
 * Server component; the two paid CTAs render the existing
 * `<CheckoutButton>` client component, which already handles the
 * signed-out → /sign-in?redirect_url=/pricing fallback. The free
 * card just links to /sign-up because no Stripe session is
 * involved.
 */
export async function TierCards() {
  const { userId } = await auth();
  const isSignedIn = !!userId;

  return (
    <section className="mx-auto max-w-[1280px] px-6 pb-16 pt-20 md:px-12 md:pt-24">
      <div className="mx-auto mb-12 max-w-[680px] text-center md:mb-14">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-terracotta">
          Pricing
        </div>
        <h1 className="mt-4 font-serif text-[40px] font-normal leading-[1.15] tracking-[-0.02em] text-ink md:text-[48px]">
          Simple pricing for everything you need as a real estate investor.
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-muted md:text-[17px]">
          Two paid tiers and a one-verdict free trial. Flat per-account, no
          per-listing surcharges, no overage billing.
        </p>
      </div>

      <div className="mx-auto grid max-w-[1080px] gap-5 md:grid-cols-3">
        <TierCard
          tier="Try Free"
          price="$0"
          period="/ forever"
          desc="1 verdict to try the platform. No credit card required."
          features={FREE_FEATURES}
          cta={
            <Link
              href="/sign-up"
              className="inline-flex w-full items-center justify-center rounded-md border border-hairline-strong px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-ink"
            >
              Get started
            </Link>
          }
        />
        <TierCard
          tier="DwellVerdict"
          price="$20"
          period="/ month"
          desc="For evaluating individual properties end-to-end. Generate verdicts, plan your buying, track renovations, manage operations, and learn tax strategies."
          features={STARTER_FEATURES}
          cta={
            <CheckoutButton
              plan="starter"
              label="Start with DwellVerdict"
              variant="outline"
              isSignedIn={isSignedIn}
            />
          }
        />
        <TierCard
          tier="Pro"
          price="$40"
          period="/ month"
          desc="For active investors with portfolios. Everything in DwellVerdict plus Scout AI conversations, advanced tax strategy, briefs for sharing, alerts, and portfolio insights."
          features={PRO_FEATURES}
          cta={
            <CheckoutButton
              plan="pro"
              label="Go Pro"
              variant="default"
              isSignedIn={isSignedIn}
            />
          }
          featured
        />
      </div>
    </section>
  );
}

function TierCard({
  tier,
  price,
  period,
  desc,
  features,
  cta,
  featured,
}: {
  tier: string;
  price: string;
  period: string;
  desc: string;
  features: ReadonlyArray<string>;
  cta: React.ReactNode;
  featured?: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col gap-4 rounded-xl border bg-card-ink p-7 md:p-8 ${
        featured
          ? "border-terracotta shadow-[0_0_0_3px_rgba(197,90,63,0.08)]"
          : "border-hairline"
      }`}
    >
      {featured ? (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-terracotta px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-white">
          Recommended
        </span>
      ) : null}

      <div className="font-mono text-[13px] font-medium uppercase tracking-[0.14em] text-ink-muted">
        {tier}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[44px] font-medium leading-none tracking-[-0.03em] text-ink">
          {price}
        </span>
        <span className="text-sm text-ink-muted">{period}</span>
      </div>
      <p className="text-sm leading-[1.5] text-ink-muted">{desc}</p>

      <ul className="my-2 flex flex-1 flex-col gap-2.5 border-t border-hairline pt-5">
        {features.map((f) => (
          <li
            key={f}
            className="grid grid-cols-[16px_1fr] items-start gap-2.5 text-[13.5px] leading-[1.4] text-ink-70"
          >
            <Check className="mt-[3px] size-3 text-buy" strokeWidth={3} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-2">{cta}</div>
    </div>
  );
}
