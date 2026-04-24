import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Check, Minus } from "lucide-react";

import { Wordmark } from "@/components/wordmark";
import { CheckoutButton } from "./checkout-button";

/**
 * Pricing page per ADR-5 / ADR-7 / ADR-8.
 *
 * Two paid tiers + a lifetime free trial. Flat pricing, not
 * per-listing — that's the positioning we want to emphasize
 * visually (one price, not a calculator).
 *
 * Server component; the CheckoutButton is the only client piece.
 */
export default async function PricingPage() {
  const { userId } = await auth();
  const isSignedIn = !!userId;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/* Top bar */}
      <header className="border-b border-hairline">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-4">
            {isSignedIn ? (
              <Link
                href="/app/properties"
                className="text-sm text-ink transition-colors hover:text-ink-muted"
              >
                Open app →
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="text-sm text-ink-muted transition-colors hover:text-ink"
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="text-sm font-medium text-ink transition-colors hover:text-ink-muted"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container flex flex-col items-center gap-3 py-16 text-center">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Pricing
        </p>
        <h1 className="max-w-2xl text-4xl tracking-[-0.02em] text-ink">
          Flat price. Per account, not per property.
        </h1>
        <p className="max-w-xl text-base text-ink-muted">
          Everything you need to find, buy, renovate, and run small
          short-term rentals. One report free so you can kick the
          tires before you pay anything.
        </p>
      </section>

      {/* Tier cards */}
      <section className="container grid grid-cols-1 gap-6 pb-16 md:grid-cols-2">
        <PlanCard
          name="DwellVerdict"
          price="$20"
          cadence="/month"
          tagline="For most small operators. 1-5 properties."
          cta={
            <CheckoutButton
              plan="starter"
              label="Start with DwellVerdict"
              variant="outline"
              isSignedIn={isSignedIn}
            />
          }
          features={[
            { label: "50 full reports per month", included: true },
            { label: "Save unlimited properties", included: true },
            { label: "Finding, Evaluating, Buying, Renovating, Managing", included: true },
            { label: "CSV import from Airbnb, Hospitable, Guesty, Hostaway", included: true },
            { label: "Actuals dashboard + Schedule E tax summary", included: true },
            { label: "PDF export of reports", included: true },
            { label: "Scout AI chat", included: false },
            { label: "Priority verdict queue", included: false },
          ]}
        />
        <PlanCard
          name="DwellVerdict Pro"
          price="$40"
          cadence="/month"
          tagline="Adds Scout AI chat for property-specific questions."
          featured
          cta={
            <CheckoutButton
              plan="pro"
              label="Go Pro"
              variant="default"
              isSignedIn={isSignedIn}
            />
          }
          features={[
            { label: "200 full reports per month", included: true },
            { label: "Save unlimited properties", included: true },
            { label: "Finding, Evaluating, Buying, Renovating, Managing", included: true },
            { label: "CSV import from Airbnb, Hospitable, Guesty, Hostaway", included: true },
            { label: "Actuals dashboard + Schedule E tax summary", included: true },
            { label: "PDF export of reports", included: true },
            { label: "Scout AI chat — 30 / day, 300 / month", included: true },
            { label: "Priority verdict queue", included: true },
          ]}
        />
      </section>

      {/* Free trial callout */}
      <section className="container flex flex-col items-center gap-2 pb-20 text-center">
        <div className="rounded-xl border border-hairline bg-card px-6 py-5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Before you pay
          </p>
          <p className="mt-1 text-sm text-ink">
            Your first full report is free. No card required. Sign up, paste
            an address, see whether the product&apos;s worth $20 to you.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="container flex flex-col gap-8 pb-24">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Answers
        </p>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <Faq
            q="Why flat pricing, not per-property?"
            a="Our users own 1-5 properties, not 50. Per-listing pricing (Guesty, Hostaway, Lodgify) is built for portfolio operators and inflates quickly at small scale. A flat $20 / $40 per month stays predictable whether you own one property or five."
          />
          <Faq
            q="What does 'report' mean?"
            a="A full property verdict — location signals (flood, wildfire, crime, walkability, place sentiment), comp-based STR revenue estimate, regulatory status for the city, and a written narrative. Scout generates one each time you paste an address or rerun an existing property."
          />
          <Faq
            q="Do I need Pro to use the app?"
            a="No. DwellVerdict at $20 includes every product surface — Finding, Evaluating, Buying, Renovating, Managing. Pro adds Scout AI chat and a higher monthly report cap. Most users will be happy on DwellVerdict."
          />
          <Faq
            q="What happens if I hit the monthly cap?"
            a="You'll see a clear 'cap reached, resets on the 1st' message. We don't auto-charge overages. If you consistently hit the cap, upgrade to Pro (200 / month) or contact us."
          />
          <Faq
            q="Cancel anytime?"
            a="Yes. Cancellation takes effect at the end of your current billing period via the Stripe-hosted billing portal. Your historical reports stay accessible."
          />
          <Faq
            q="Is this investment advice?"
            a="No. DwellVerdict provides research summaries and data — not investment, legal, or tax advice. Verify regulatory status, insurance requirements, and market specifics with the relevant professionals before making decisions."
          />
          <Faq
            q="Have a promo code?"
            a="Enter it on the Stripe checkout page — there's an 'Add promotion code' field right above the payment details. Codes apply automatically to the subscription price."
          />
        </div>
      </section>

      <footer className="border-t border-hairline py-8">
        <div className="container flex items-center justify-between text-xs text-ink-muted">
          <span>© {new Date().getFullYear()} DwellVerdict</span>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-ink">
              Home
            </Link>
            <Link href="/pricing" className="hover:text-ink">
              Pricing
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

type PlanCardProps = {
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  featured?: boolean;
  features: { label: string; included: boolean }[];
  cta: React.ReactNode;
};

function PlanCard({ name, price, cadence, tagline, featured, features, cta }: PlanCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-card shadow-card ${
        featured ? "ring-1 ring-signal-buy" : ""
      }`}
    >
      {featured ? (
        <div className="absolute right-4 top-4 rounded-full bg-signal-buy px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-paper">
          Most features
        </div>
      ) : null}
      <div className="flex flex-col gap-6 p-8">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            {name}
          </p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-4xl tracking-[-0.02em] text-ink">{price}</span>
            <span className="text-sm text-ink-muted">{cadence}</span>
          </div>
          <p className="mt-2 text-sm text-ink-muted">{tagline}</p>
        </div>

        <ul className="flex flex-col gap-2">
          {features.map((f) => (
            <li key={f.label} className="flex items-start gap-2 text-sm">
              {f.included ? (
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-signal-buy" />
              ) : (
                <Minus className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-muted" />
              )}
              <span className={f.included ? "text-ink" : "text-ink-muted"}>
                {f.label}
              </span>
            </li>
          ))}
        </ul>

        <div>{cta}</div>
      </div>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base font-medium tracking-[-0.01em] text-ink">{q}</h3>
      <p className="text-sm text-ink-muted">{a}</p>
    </div>
  );
}
