import type { Metadata } from "next";

import { PublicNav } from "@/components/public-nav";
import { LandingFooter } from "@/components/landing/footer";
import { TierCards } from "@/components/pricing/tier-cards";
import { ComparisonTable } from "@/components/pricing/comparison-table";
import { FAQ } from "@/components/pricing/faq";
import { PricingFinalCTA } from "@/components/pricing/final-cta";

export const metadata: Metadata = {
  title: "Pricing — DwellVerdict",
  description:
    "Simple pricing for property verdict analysis. Free first verdict, then $20/mo or $40/mo for unlimited access. No annual commitment, cancel anytime.",
};

/**
 * /pricing — public pricing surface. Composes four section
 * components plus the shared public nav and landing footer.
 *
 * Server-rendered. The Stripe `CheckoutButton` inside `TierCards`
 * is the only client island, and it inherits the existing
 * checkout flow (POST /api/stripe/checkout) without modification.
 */
export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <PublicNav />
      <main className="flex-1">
        <TierCards />
        <ComparisonTable />
        <FAQ />
        <PricingFinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
