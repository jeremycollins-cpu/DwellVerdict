import type { Metadata } from "next";

import { PublicNav } from "@/components/public-nav";
import { LandingFooter } from "@/components/landing/footer";
import { TierCards } from "@/components/pricing/tier-cards";
import { ComparisonTable } from "@/components/pricing/comparison-table";
import { FAQ, PRICING_FAQS } from "@/components/pricing/faq";
import { PricingFinalCTA } from "@/components/pricing/final-cta";
import {
  faqPageSchema,
  productSchema,
  SITE_URL,
} from "@/lib/seo/schema";
import { StructuredData } from "@/lib/seo/structured-data";

const TITLE = "Pricing — DwellVerdict";
const DESCRIPTION =
  "Simple pricing for property verdict analysis. First verdict free, then $20/mo (50 verdicts) or $40/mo (200 verdicts + Scout AI). Flat per-account, cancel anytime.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/pricing`,
    siteName: "DwellVerdict",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

/**
 * /pricing — public pricing surface. Composes four section
 * components plus the shared public nav and landing footer.
 *
 * Server-rendered. The Stripe `CheckoutButton` inside `TierCards`
 * is the only client island, and it inherits the existing
 * checkout flow (POST /api/stripe/checkout) without modification.
 *
 * Two structured-data scripts: Product (with both Stripe-priced
 * offers) and FAQPage (the pricing FAQs imported from the FAQ
 * component, single source of truth).
 */
export default function PricingPage() {
  const faqEntries = PRICING_FAQS.map((f) => ({ question: f.q, answer: f.a }));

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <StructuredData data={productSchema()} />
      <StructuredData data={faqPageSchema(faqEntries)} />
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
