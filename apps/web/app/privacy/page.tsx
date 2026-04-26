import type { Metadata } from "next";
import Link from "next/link";

import {
  LegalLayout,
  LegalList,
  LegalSection,
  LegalSubheading,
} from "@/components/legal/legal-layout";
import { articleSchema, SITE_URL } from "@/lib/seo/schema";
import { StructuredData } from "@/lib/seo/structured-data";

const TITLE = "Privacy Policy — DwellVerdict";
const DESCRIPTION =
  "How DwellVerdict collects, uses, and protects your data. Third-party processors, data retention, and your privacy rights including CCPA and GDPR.";
const LAST_UPDATED = "April 25, 2026";
const PUBLISHED = "2026-04-25";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/privacy` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/privacy`,
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

export default function PrivacyPage() {
  return (
    <>
      <StructuredData
        data={articleSchema({
          headline: "Privacy Policy",
          datePublished: PUBLISHED,
          dateModified: PUBLISHED,
          url: `${SITE_URL}/privacy`,
        })}
      />
      <LegalLayout
        title="Privacy Policy"
        lastUpdated={LAST_UPDATED}
        intro="What we collect, how we use it, who we share it with, and the rights you have over your data. Plain language where we can manage it; the necessary specifics where we can't."
      >
      <LegalSection number={1} title="Information we collect">
        <LegalSubheading>Account information</LegalSubheading>
        <LegalList
          items={[
            "Email address (via Clerk authentication)",
            "Name (optional, via Clerk)",
            "Profile information you choose to provide",
          ]}
        />

        <LegalSubheading>Payment information</LegalSubheading>
        <p>
          All credit-card details are processed and stored by Stripe.{" "}
          <strong className="font-medium text-ink">
            DwellVerdict does not store credit-card numbers.
          </strong>{" "}
          We retain only the subscription status, billing cycle, and the last
          four digits of the card (for display in the billing settings).
        </p>

        <LegalSubheading>Usage data</LegalSubheading>
        <LegalList
          items={[
            "Property addresses you submit",
            "Verdicts generated for your account",
            "Scout chat conversations (Pro only)",
            "Feature-usage patterns within the app",
          ]}
        />

        <LegalSubheading>Technical data</LegalSubheading>
        <LegalList
          items={[
            "IP address",
            "Browser type and device type",
            "Pages visited and time on site (analytics, when enabled)",
            "Error logs (Sentry)",
          ]}
        />
      </LegalSection>

      <LegalSection number={2} title="How we use information">
        <LegalList
          items={[
            "Operate the verdict-generation service",
            "Process payments via Stripe",
            "Send transactional email (account confirmations, billing receipts, alerts)",
            "Improve the service through aggregated analytics",
            "Detect and prevent abuse",
            "Comply with legal obligations",
          ]}
        />
      </LegalSection>

      <LegalSection number={3} title="Data NOT used for AI training">
        <p>
          DwellVerdict does not train AI models on your verdict content,
          property data, or Scout conversations. We do not sell or share user
          data with AI training organizations.
        </p>
        <p>
          Anthropic — the AI provider that generates verdicts and Scout
          responses — processes your content according to its own data-handling
          policies. See Anthropic&rsquo;s{" "}
          <a
            href="https://www.anthropic.com/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-terracotta underline-offset-2 hover:underline"
          >
            privacy policy
          </a>{" "}
          for details on how they handle data submitted via their API.
        </p>
      </LegalSection>

      <LegalSection number={4} title="How we share information">
        <p>
          We share data only with the third-party services we need to operate
          the product:
        </p>
        <LegalList
          items={[
            <>
              <strong className="font-medium text-ink">Stripe</strong> —
              payment processing
            </>,
            <>
              <strong className="font-medium text-ink">Clerk</strong> —
              authentication
            </>,
            <>
              <strong className="font-medium text-ink">Anthropic</strong> — AI
              verdict generation and Scout chat
            </>,
            <>
              <strong className="font-medium text-ink">Apify</strong> — public
              data sourcing (Zillow, Redfin)
            </>,
            <>
              <strong className="font-medium text-ink">Google Places</strong>{" "}
              — address autocomplete and verification
            </>,
            <>
              <strong className="font-medium text-ink">Vercel</strong> —
              hosting
            </>,
            <>
              <strong className="font-medium text-ink">Neon</strong> —
              database hosting
            </>,
            <>
              <strong className="font-medium text-ink">Resend</strong> —
              transactional email
            </>,
            <>
              <strong className="font-medium text-ink">Sentry</strong> — error
              monitoring
            </>,
            <>
              <strong className="font-medium text-ink">
                Google Analytics 4
              </strong>{" "}
              (operated by Google LLC) — traffic analytics on public pages
            </>,
          ]}
        />
        <p>We do not:</p>
        <LegalList
          items={[
            "Sell user data to advertisers",
            "Share data with marketing partners",
            "Use data for any purpose beyond operating the service",
          ]}
        />
      </LegalSection>

      <LegalSection number={5} title="Cookies and tracking">
        <p>
          See our{" "}
          <Link
            href="/cookies"
            className="text-terracotta underline-offset-2 hover:underline"
          >
            Cookie Policy
          </Link>{" "}
          for the full list. Brief summary: authentication cookies (Clerk),
          payment cookies during checkout (Stripe), CSRF protection, and
          Google Analytics 4 traffic-measurement cookies on public pages.
          Google may correlate Analytics activity with other Google services
          for users who are signed into a Google account; we don&rsquo;t
          control that correlation. We do not run third-party advertising
          cookies and do not enable GA4&rsquo;s advertising-features
          integration.
        </p>
      </LegalSection>

      <LegalSection number={6} title="Your rights">
        <p>You may:</p>
        <LegalList
          items={[
            "Request all data we have about you",
            "Correct inaccurate data",
            "Request deletion of your account and associated data",
            "Request export of your data in a portable format",
            "Object to processing for purposes beyond operating the service",
          ]}
        />
        <p>
          Self-serve controls (Settings → Account → Export, Settings → Account
          → Delete) ship with a later release. Until then, email{" "}
          <a
            href="mailto:privacy@dwellverdict.com"
            className="text-terracotta underline-offset-2 hover:underline"
          >
            privacy@dwellverdict.com
          </a>{" "}
          and we&rsquo;ll process the request manually.
        </p>

        <LegalSubheading>California residents (CCPA)</LegalSubheading>
        <LegalList
          items={[
            "Right to know what personal information is collected",
            "Right to delete personal information",
            "Right to opt out of sale (we don't sell data; the right exists nonetheless)",
            "Right to non-discrimination for exercising privacy rights",
          ]}
        />

        <LegalSubheading>EU residents (GDPR)</LegalSubheading>
        <LegalList
          items={[
            "Right of access",
            "Right to rectification",
            "Right to erasure",
            "Right to data portability",
            "Right to object",
            "Right not to be subject to automated decision-making",
          ]}
        />
      </LegalSection>

      <LegalSection number={7} title="Data retention">
        <LegalList
          items={[
            "Active accounts: data retained while the account is active",
            "Cancelled subscriptions: account remains; verdicts and properties retained for read-only access",
            "Account-deletion requests: data deleted within 30 days; backups purged within an additional 90 days",
            "Legal and financial records (e.g., tax-compliance records): retained as required by law (typically 7 years)",
          ]}
        />
      </LegalSection>

      <LegalSection number={8} title="Children's privacy">
        <p>
          DwellVerdict is not intended for users under 18. We do not knowingly
          collect data from children. If we learn that we have data from a
          user under 18, we will delete it promptly.
        </p>
      </LegalSection>

      <LegalSection number={9} title="Security">
        <LegalList
          items={[
            "Industry-standard encryption (TLS 1.3) for data in transit",
            "Data at rest encrypted by our cloud provider (Neon)",
            "Authentication delegated to Clerk; payment data isolated to Stripe",
            "Sentry-monitored error reporting with PII scrubbing",
            "We will notify affected users of any security breach within 72 hours of confirmation",
          ]}
        />
      </LegalSection>

      <LegalSection number={10} title="International users">
        <p>
          DwellVerdict is operated from the United States, and your data is
          stored on US-based infrastructure. By using the service, you consent
          to the transfer of your data to the United States.
        </p>
      </LegalSection>

      <LegalSection number={11} title="Changes to this policy">
        <p>
          We may update this policy over time. Material changes will be
          communicated by email before they take effect. The &ldquo;Last
          updated&rdquo; date at the top reflects the most recent revision.
        </p>
      </LegalSection>

      <LegalSection number={12} title="Contact">
        <p>
          Privacy questions:{" "}
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
