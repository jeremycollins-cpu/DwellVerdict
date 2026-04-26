/**
 * Schema.org JSON-LD generators. Used on public pages so search
 * engines and AI engines (ChatGPT / Perplexity / Claude / Gemini)
 * can parse structured page metadata.
 *
 * Pure data — pages embed the result via `<StructuredData>` (see
 * `structured-data.tsx`) which renders the `<script>` tag.
 */

export const SITE_URL = "https://dwellverdict.com";
export const SITE_NAME = "DwellVerdict";

export interface FaqEntry {
  question: string;
  answer: string;
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/brand/logo-mark.svg`,
    description:
      "AI-powered property verdict service for real estate investors. Get a verdict on any address in seconds — buy, watch, or pass — backed by data on regulations, location, comps, and revenue potential.",
    sameAs: [],
  };
}

export function productSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: SITE_NAME,
    description:
      "AI-powered property verdict service for real estate investors",
    brand: { "@type": "Brand", name: SITE_NAME },
    offers: [
      {
        "@type": "Offer",
        name: "DwellVerdict",
        price: "20.00",
        priceCurrency: "USD",
        priceValidUntil: "2026-12-31",
        availability: "https://schema.org/InStock",
        description:
          "50 verdicts/month, full Regulatory + Location evidence, lifecycle stages",
      },
      {
        "@type": "Offer",
        name: "Pro",
        price: "40.00",
        priceCurrency: "USD",
        priceValidUntil: "2026-12-31",
        availability: "https://schema.org/InStock",
        description:
          "200 verdicts/month, everything in DwellVerdict + Scout AI, Compare, Briefs, Alerts, Portfolio",
      },
    ],
  };
}

export function faqPageSchema(faqs: ReadonlyArray<FaqEntry>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}

export function articleSchema(opts: {
  headline: string;
  datePublished: string;
  dateModified: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.headline,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified,
    mainEntityOfPage: { "@type": "WebPage", "@id": opts.url },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/brand/logo-mark.svg`,
      },
    },
  };
}
