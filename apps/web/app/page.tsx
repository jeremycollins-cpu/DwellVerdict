import type { Metadata } from "next";

import { PublicNav } from "@/components/public-nav";
import { Hero } from "@/components/landing/hero";
import { ThreeStepExplainer } from "@/components/landing/three-step-explainer";
import { AnatomyOfVerdict } from "@/components/landing/anatomy-of-verdict";
import { FounderQuote } from "@/components/landing/founder-quote";
import { PricingPreview } from "@/components/landing/pricing-preview";
import { FinalCTA } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/footer";
import { organizationSchema, SITE_URL } from "@/lib/seo/schema";
import { StructuredData } from "@/lib/seo/structured-data";

const TITLE = "DwellVerdict — Carfax for homes";
const DESCRIPTION =
  "Paste any address. Get an AI-powered verdict on regulatory risk, location quality, comparable sales, and revenue potential. Built for real estate investors.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
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

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <StructuredData data={organizationSchema()} />
      <PublicNav />
      <main className="flex-1">
        <Hero />
        <ThreeStepExplainer />
        <AnatomyOfVerdict />
        <FounderQuote />
        <PricingPreview />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
