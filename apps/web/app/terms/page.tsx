import type { Metadata } from "next";

import {
  LegalLayout,
  LegalList,
  LegalSection,
} from "@/components/legal/legal-layout";

export const metadata: Metadata = {
  title: "Terms of Service — DwellVerdict",
  description:
    "Terms governing use of DwellVerdict's property verdict service. Subscription billing, AI content disclaimer, refund policy, and your rights as a user.",
};

const LAST_UPDATED = "April 25, 2026";

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      lastUpdated={LAST_UPDATED}
      intro="By using DwellVerdict, you agree to these terms. Please read them carefully — they cover billing, the AI content disclaimer, refund policy, and your rights as a user."
    >
      <LegalSection number={1} title="Acceptance of terms">
        <p>
          By creating an account or using DwellVerdict (the &ldquo;Service&rdquo;),
          you agree to these Terms of Service. If you don&rsquo;t agree, do not
          use the Service.
        </p>
        <p>You must be 18 or older to use DwellVerdict.</p>
        <p>
          You are responsible for keeping your account credentials secure. We
          authenticate accounts via Clerk; loss of access is your responsibility
          to recover.
        </p>
      </LegalSection>

      <LegalSection number={2} title="Account and subscription">
        <p>
          Account creation requires a valid email address. Paid subscriptions
          are processed by Stripe and billed monthly on the date you subscribed.
          Subscriptions automatically renew until cancelled.
        </p>
        <p>
          You may cancel anytime via Settings → Billing. Cancellation takes
          effect at the end of your current billing period — you keep paid-tier
          access through that date. After cancellation, you retain read-only
          access to historical verdicts and properties; new verdict generation
          is paused until you re-subscribe.
        </p>
      </LegalSection>

      <LegalSection number={3} title="Refund policy">
        <p>
          We do not currently offer refunds on subscription payments. Cancel
          anytime to prevent the next charge.
        </p>
        <p>
          If something specific went wrong and you believe a refund is
          warranted, email{" "}
          <a
            href="mailto:support@dwellverdict.com"
            className="text-terracotta underline-offset-2 hover:underline"
          >
            support@dwellverdict.com
          </a>{" "}
          — we&rsquo;ll review case by case.
        </p>
      </LegalSection>

      <LegalSection number={4} title="AI-generated content disclaimer">
        <p>
          DwellVerdict generates property verdicts using AI analysis of public
          data. <strong className="font-medium text-ink">Verdicts are
          informational only</strong> — they are not financial advice, not
          legal counsel, and not a substitute for professional real estate
          advice.
        </p>
        <p>
          AI outputs may contain errors, omissions, or out-of-date information.
          Always verify critical decisions with qualified professionals
          (licensed real estate agents, attorneys, financial advisors, building
          inspectors) before acting.
        </p>
        <p>
          DwellVerdict is not a licensed real estate brokerage, law firm,
          financial advisor, or tax preparer. You are solely responsible for
          any decisions you make based on verdict outputs.
        </p>
      </LegalSection>

      <LegalSection number={5} title="Data sources and accuracy">
        <p>
          Verdicts incorporate data from third-party sources, which include
          (but may not be limited to):
        </p>
        <LegalList
          items={[
            "Zillow and Redfin (listing data)",
            "AirDNA / Airbnb (short-term rental comparables)",
            "US Census (demographics)",
            "FEMA flood maps (hazard zones)",
            "Google Places (POIs and address verification)",
            "Municipal regulatory databases (STR ordinances, zoning)",
          ]}
        />
        <p>
          Third-party data may contain errors, outdated information, or
          omissions. DwellVerdict makes no warranty as to the accuracy,
          completeness, or timeliness of any data or verdict.
        </p>
        <p>
          Property regulations change frequently. Always verify current
          regulations directly with the relevant authority before relying on
          them.
        </p>
      </LegalSection>

      <LegalSection number={6} title="Acceptable use">
        <p>You may not use DwellVerdict to:</p>
        <LegalList
          items={[
            "Violate any law or third-party right",
            "Infringe on intellectual property",
            "Reverse-engineer the Service or its AI methodology",
            "Generate verdicts using automated tools or scraping",
            "Resell verdict outputs as your own service",
            "Submit false information about properties or yourself",
            "Use the Service to harass, defame, or harm others",
          ]}
        />
      </LegalSection>

      <LegalSection number={7} title="Intellectual property">
        <p>
          You retain ownership of property data you submit. By submitting it,
          you grant DwellVerdict a non-exclusive license to use that data to
          generate verdicts and operate the Service for your account.
        </p>
        <p>
          DwellVerdict retains rights to verdict outputs, the platform, design,
          and AI methodology. You may use verdicts for your personal or
          business decisions and share them with clients, advisors, lenders,
          or partners. You may not republish verdicts as a competing service or
          use them to train competing AI models.
        </p>
      </LegalSection>

      <LegalSection number={8} title="Limitation of liability">
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; WITHOUT WARRANTIES OF ANY
          KIND, EXPRESS OR IMPLIED. DWELLVERDICT IS NOT LIABLE FOR ANY DECISION
          MADE BASED ON VERDICT CONTENT.
        </p>
        <p>
          To the maximum extent permitted by law, DwellVerdict&rsquo;s total
          liability for any claim is limited to the amount you paid in the 12
          months preceding the claim. DwellVerdict is not liable for indirect,
          consequential, incidental, or punitive damages, including lost
          profits or lost data.
        </p>
      </LegalSection>

      <LegalSection number={9} title="Termination">
        <p>
          We may suspend or terminate accounts that violate these terms,
          subject to reasonable notice except in cases of severe violation
          (fraud, security breach, abuse).
        </p>
        <p>
          You may close your account anytime by emailing{" "}
          <a
            href="mailto:support@dwellverdict.com"
            className="text-terracotta underline-offset-2 hover:underline"
          >
            support@dwellverdict.com
          </a>
          . Self-serve account deletion ships with the Settings → Account
          surface (planned for a later release). Upon closure, your data is
          retained for 90 days then deleted, except where law requires longer
          retention (e.g., financial records for tax compliance).
        </p>
      </LegalSection>

      <LegalSection number={10} title="Changes to these terms">
        <p>
          We may update these terms over time. Material changes will be
          communicated by email to your account address before they take
          effect. Continued use of the Service after changes take effect
          constitutes acceptance of the updated terms.
        </p>
      </LegalSection>

      <LegalSection number={11} title="Governing law and disputes">
        <p>
          These terms are governed by the laws of the State of California,
          without regard to its conflict-of-law principles. Disputes shall be
          resolved in the state or federal courts located in San Francisco
          County, California.
        </p>
        <p>
          For disputes under $10,000 (excluding small-claims actions), you and
          DwellVerdict agree to binding individual arbitration. Class actions
          and class arbitration are waived.
        </p>
      </LegalSection>

      <LegalSection number={12} title="Contact">
        <p>
          Questions about these terms:{" "}
          <a
            href="mailto:legal@dwellverdict.com"
            className="text-terracotta underline-offset-2 hover:underline"
          >
            legal@dwellverdict.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
