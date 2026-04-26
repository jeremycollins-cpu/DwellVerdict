import type { Metadata } from "next";

import {
  LegalLayout,
  LegalList,
  LegalSection,
} from "@/components/legal/legal-layout";

export const metadata: Metadata = {
  title: "Cookie Policy — DwellVerdict",
  description:
    "Cookies used by DwellVerdict for authentication and payments. No advertising cookies and no cross-site tracking.",
};

const LAST_UPDATED = "April 25, 2026";

export default function CookiesPage() {
  return (
    <LegalLayout
      title="Cookie Policy"
      lastUpdated={LAST_UPDATED}
      intro="We keep cookies to the minimum needed to operate the product. No advertising, no cross-site tracking."
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
          We do <strong className="font-medium text-ink">not</strong> currently
          set advertising cookies, cross-site tracking cookies, social-media
          tracking pixels, or product-analytics cookies.
        </p>
        <p>
          A privacy-friendly analytics tool (Plausible) may be added in a
          future release. If it is, this policy will be updated to reflect it.
          Plausible doesn&rsquo;t set tracking cookies, doesn&rsquo;t collect
          personal data, and doesn&rsquo;t track users across sites — but
          we&rsquo;d still document it here when it ships.
        </p>
      </LegalSection>

      <LegalSection number={3} title="How to control cookies">
        <p>
          Most browsers let you block cookies via settings. If you block
          essential cookies, sign-in and payments will stop working. We
          don&rsquo;t set any non-essential cookies today, so cookie-blocking
          extensions have no impact on the rest of the experience.
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
  );
}
