import type { Metadata } from "next";

import {
  LegalLayout,
  LegalSection,
} from "@/components/legal/legal-layout";
import { faqPageSchema, SITE_URL } from "@/lib/seo/schema";
import { StructuredData } from "@/lib/seo/structured-data";

const TITLE = "Help — DwellVerdict";
const DESCRIPTION =
  "Common questions about DwellVerdict's property verdict service. How verdicts work, plans and billing, using the product.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/help` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/help`,
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

const LAST_UPDATED = "April 25, 2026";

interface HelpItem {
  q: string;
  /** Each entry is a paragraph. */
  a: ReadonlyArray<string>;
}

const GETTING_STARTED: ReadonlyArray<HelpItem> = [
  {
    q: "How do verdicts work?",
    a: [
      "You paste an address. DwellVerdict's AI analyzes the property across four evidence domains — regulatory environment (zoning, STR rules, HOA), location quality (walkability, market trends, place sentiment), comparable properties (recent comps, ADR for short-term rentals), and revenue potential (projected revenue grounded in real comps).",
      "You get a verdict — Buy, Watch, or Pass — with a confidence score and the underlying evidence. Most verdicts complete in under a minute.",
    ],
  },
  {
    q: "What does Buy / Watch / Pass mean?",
    a: [
      "Buy: strong fundamentals across most domains. Worth pursuing.",
      "Watch: mixed signals. May be worth tracking for price changes or further research.",
      "Pass: significant concerns in one or more domains. Better opportunities likely exist.",
      "The signal is informed by AI analysis — it is not financial advice. Verify critical decisions with qualified professionals.",
    ],
  },
  {
    q: "How accurate are verdicts?",
    a: [
      "Verdicts are AI-generated using public data and current best-effort analysis. They are informational tools, not predictions. Accuracy depends heavily on data availability — properties in regions with rich public records get more reliable analysis than data-sparse areas.",
      "We continually improve verdict quality. If you find an error, use the verdict feedback control on the page (rolling out across the app) or email support@dwellverdict.com.",
    ],
  },
];

const PLANS_AND_BILLING: ReadonlyArray<HelpItem> = [
  {
    q: "What's included in each plan?",
    a: [
      "Free (1 verdict, lifetime): full-quality verdict on your one allotted run, no payment required, no expiration.",
      "DwellVerdict ($20/month): 50 verdicts per calendar month, full Regulatory + Location + Comps evidence, lifecycle stages (Buying / Renovating / Managing), CSV import, Schedule E summary, PDF export.",
      "Pro ($40/month): 200 verdicts per calendar month, everything in DwellVerdict plus Scout AI chat (30/day, 300/month) and the upcoming Compare, Briefs, Alerts, and Portfolio surfaces (rolling out in subsequent releases).",
    ],
  },
  {
    q: "How do I cancel?",
    a: [
      "Settings → Billing → Manage Subscription. Cancellation takes effect at the end of your current billing period; you keep paid-tier access until that date.",
    ],
  },
  {
    q: "Can I get a refund?",
    a: [
      "We don't currently offer refunds on subscription payments. You can cancel anytime to prevent the next charge. For specific concerns, email support@dwellverdict.com — we'll review case by case.",
    ],
  },
  {
    q: "Can I switch between DwellVerdict and Pro?",
    a: [
      "Yes. Settings → Billing → Manage Subscription. Upgrades take effect immediately and prorate to give you instant access. Downgrades take effect at the end of the current billing period.",
    ],
  },
  {
    q: "What happens when I hit my monthly verdict cap?",
    a: [
      "You'll see a clear \"cap reached, resets on the 1st\" message. Caps are hard — we don't auto-charge overages. Upgrade to a higher tier or wait for the next billing period. All of your existing verdicts remain accessible.",
    ],
  },
];

const USING_THE_PRODUCT: ReadonlyArray<HelpItem> = [
  {
    q: "Can I export my data?",
    a: [
      "Self-serve data export ships with the Settings → Account surface in a future release. Until then, email privacy@dwellverdict.com and we'll send your full export (properties, verdicts, settings) in a portable JSON format.",
    ],
  },
  {
    q: "What data sources does DwellVerdict use?",
    a: [
      "Public data from Zillow, Redfin, AirDNA / Airbnb, US Census, FEMA flood maps, Google Places, and various municipal regulatory databases. Specific sources are cited in each verdict so you can trace claims back to their origin.",
    ],
  },
  {
    q: "Will my property data be used to train AI?",
    a: [
      "No. DwellVerdict does not train AI models on your verdict content or Scout conversations. Anthropic — our AI provider — processes content per their own data-handling policies; see Anthropic's privacy policy for details.",
    ],
  },
  {
    q: "Is my financial data secure?",
    a: [
      "Payments are processed by Stripe. We never store credit-card numbers — only your subscription status and the last 4 digits for display. Stripe is PCI-DSS Level 1 certified.",
    ],
  },
  {
    q: "What if a verdict is wrong?",
    a: [
      "Verdict feedback controls are rolling out across the app — when you see one, use the thumbs-down button and tell us what was wrong. We track feedback to improve the AI. For urgent corrections, email support@dwellverdict.com.",
    ],
  },
];

export default function HelpPage() {
  // Flatten the three help sections into a single FAQPage schema.
  // Each Q+A item carries a multi-paragraph answer; we join the
  // paragraphs with two newlines so the answer text reads naturally
  // when AI engines surface it.
  const faqEntries = [...GETTING_STARTED, ...PLANS_AND_BILLING, ...USING_THE_PRODUCT].map(
    (item) => ({ question: item.q, answer: item.a.join("\n\n") }),
  );

  return (
    <>
      <StructuredData data={faqPageSchema(faqEntries)} />
      <LegalLayout
        title="Help"
        lastUpdated={LAST_UPDATED}
        intro={
          "Common questions about DwellVerdict. Don't see your question? Email support@dwellverdict.com — replies within 1 business day."
        }
      >
      <LegalSection title="Getting started">
        <HelpList items={GETTING_STARTED} />
      </LegalSection>

      <LegalSection title="Plans and billing">
        <HelpList items={PLANS_AND_BILLING} />
      </LegalSection>

      <LegalSection title="Using the product">
        <HelpList items={USING_THE_PRODUCT} />
      </LegalSection>

      <LegalSection title="Still have questions?">
        <p>
          Email{" "}
          <a
            href="mailto:support@dwellverdict.com"
            className="text-terracotta underline-offset-2 hover:underline"
          >
            support@dwellverdict.com
          </a>{" "}
          — we reply within 1 business day.
        </p>
      </LegalSection>
      </LegalLayout>
    </>
  );
}

function HelpList({ items }: { items: ReadonlyArray<HelpItem> }) {
  return (
    <div className="space-y-7">
      {items.map((item) => (
        <div key={item.q} className="space-y-2">
          <h3 className="text-[16px] font-medium tracking-[-0.01em] text-ink">
            {item.q}
          </h3>
          {item.a.map((para, i) => (
            <p key={i} className="text-[14.5px] leading-[1.65] text-ink-70">
              {para}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
