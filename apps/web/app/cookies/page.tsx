import type { Metadata } from "next";

import {
  LegalLayout,
  LegalList,
  LegalSection,
} from "@/components/legal/legal-layout";
import { articleSchema, SITE_URL } from "@/lib/seo/schema";
import { StructuredData } from "@/lib/seo/structured-data";

const TITLE = "Cookie Policy — DwellVerdict";
const DESCRIPTION =
  "Cookies used by DwellVerdict for authentication, payments, and Google Analytics 4 traffic measurement. No third-party advertising cookies.";
const LAST_UPDATED = "April 25, 2026";
const PUBLISHED = "2026-04-25";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/cookies` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/cookies`,
    siteName: "DwellVerdict",
    locale: "en_US",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function CookiesPage() {
  return (
    <>
      <StructuredData
        data={articleSchema({
          headline: "Cookie Policy",
          datePublished: PUBLISHED,
          dateModified: PUBLISHED,
          url: `${SITE_URL}/cookies`,
        })}
      />
      <LegalLayout
        title="Cookie Policy"
        lastUpdated={LAST_UPDATED}
        intro="The cookies we set, why we set them, and how to control them."
      >
      <LegalSection number={1} title="What cookies are">
        <p>
          Cookies are small text files that websites store in your browser to
          remember information between requests. They&rsquo;re what keep you
          signed in across page loads, and they&rsquo;re also commonly used
          for advertising and tracking — though we don&rsquo;t use them for
          either of those.
        </p>
      </LegalSection>

      <LegalSection number={2} title="Cookies we use">
        <p>
          <strong className="font-medium text-ink">
            Essential cookies (required for the product to work):
          </strong>
        </p>
        <LegalList
          items={[
            <>
              <strong className="font-medium text-ink">Clerk session</strong>{" "}
              — keeps you signed in across page loads
            </>,
            <>
              <strong className="font-medium text-ink">Stripe checkout</strong>{" "}
              — used during the payment flow when you upgrade or manage
              billing
            </>,
            <>
              <strong className="font-medium text-ink">CSRF token</strong> —
              prevents cross-site request forgery on form submissions
            </>,
          ]}
        />
        <p>
          <strong className="font-medium text-ink">
            Analytics cookies (Google Analytics 4):
          </strong>
        </p>
        <LegalList
          items={[
            <>
              <code className="font-mono text-[13px]">_ga</code>,{" "}
              <code className="font-mono text-[13px]">_ga_*</code> — Google
              Analytics tracking cookies
            </>,
            "Used to measure site traffic and understand how visitors use the public pages",
            "Operated by Google LLC, governed by Google's privacy policy",
            <>
              You can opt out using Google&rsquo;s Analytics Opt-out browser
              extension:{" "}
              <a
                href="https://tools.google.com/dlpage/gaoptout"
                target="_blank"
                rel="noopener noreferrer"
                className="text-terracotta underline-offset-2 hover:underline"
              >
                tools.google.com/dlpage/gaoptout
              </a>
            </>,
          ]}
        />
        <p>
          GA4 runs only on public pages (landing, pricing, legal, help). It
          does not run inside the authenticated app. We do not enable
          GA4&rsquo;s advertising-features integration, do not run third-party
          advertising cookies, and do not run social-media tracking pixels.
        </p>
        <p>
          Note that as part of Google&rsquo;s broader ecosystem, GA4 cookies
          may be correlated with other Google services for users who are
          signed into a Google account — we don&rsquo;t control that
          correlation. If you prefer not to be tracked, the opt-out extension
          above blocks GA4 across all sites.
        </p>
      </LegalSection>

      <LegalSection number={3} title="How to control cookies">
        <p>
          Most browsers let you block cookies via settings. If you block
          essential cookies (Clerk, Stripe, CSRF), sign-in and payments will
          stop working. Blocking GA4 cookies has no impact on the rest of the
          experience — the product works the same; we just lose the traffic
          measurement signal.
        </p>
      </LegalSection>

      <LegalSection number={4} title="Changes to this policy">
        <p>
          As infrastructure changes, we may update this policy to reflect the
          current cookie footprint. The &ldquo;Last updated&rdquo; date at the
          top reflects the most recent revision.
        </p>
      </LegalSection>

      <LegalSection number={5} title="Contact">
        <p>
          Questions:{" "}
          <a
            href="mailto:privacy@dwellverdict.com"
            className="text-terracotta underline-offset-2 hover:underline"
          >
            privacy@dwellverdict.com
          </a>
          .
        </p>
      </LegalSection>
      </LegalLayout>
    </>
  );
}
