import Link from "next/link";
import { Check } from "lucide-react";

const STARTER_FEATURES = [
  "50 full reports per month",
  "Finding, Evaluating, Buying, Renovating, Managing",
  "CSV import (Airbnb, Hospitable, Guesty, Hostaway)",
  "Schedule E tax summary",
  "PDF report export",
];

const PRO_FEATURES = [
  "200 full reports per month",
  "Everything in DwellVerdict",
  "Scout AI chat (30 / day · 300 / month)",
  "Priority verdict queue",
  "Best for active investors",
];

/**
 * Two-tier pricing preview. The mockup proposed three tiers
 * ($0 / $79 / $199), but the locked pricing per the master plan
 * and CLAUDE.md is two tiers ($20 / $40). Visual treatment
 * (featured card with terracotta border + "Most popular" pill)
 * still follows the mockup.
 *
 * Both CTAs route to /pricing, where the existing CheckoutButton
 * mints a Stripe session — keeps M2.1 from touching the billing
 * flow.
 */
export function PricingPreview() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-20 md:px-12 md:py-24">
      <div className="mx-auto mb-12 max-w-[680px] text-center md:mb-14">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-terracotta">
          Pricing
        </div>
        <h2 className="mt-4 font-serif text-[36px] font-normal leading-[1.15] tracking-[-0.02em] text-ink md:text-[44px]">
          Flat price. Per account, not per property.
        </h2>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-muted md:text-[17px]">
          Two tiers. Your first full report is free — sign up, paste an
          address, see whether the product&rsquo;s worth $20 to you before you
          pay anything.
        </p>
      </div>

      <div className="mx-auto grid max-w-[840px] gap-5 md:grid-cols-2">
        <PricingCard
          tier="DwellVerdict"
          price="$20"
          period="/ month"
          desc="Most small operators. 1–5 properties, the full lifecycle, no AI chat."
          features={STARTER_FEATURES}
          ctaLabel="See full pricing"
        />
        <PricingCard
          tier="DwellVerdict Pro"
          price="$40"
          period="/ month"
          desc="Adds Scout AI chat for property-specific questions and a higher cap."
          features={PRO_FEATURES}
          ctaLabel="Go Pro"
          featured
        />
      </div>
    </section>
  );
}

function PricingCard({
  tier,
  price,
  period,
  desc,
  features,
  ctaLabel,
  featured,
}: {
  tier: string;
  price: string;
  period: string;
  desc: string;
  features: string[];
  ctaLabel: string;
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
          Most popular
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

      <Link
        href="/pricing"
        className={`mt-2 inline-flex items-center justify-center rounded-md px-4 py-3 text-sm font-medium transition-colors ${
          featured
            ? "bg-ink text-paper hover:bg-ink-70"
            : "border border-hairline-strong text-ink hover:border-ink"
        }`}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
