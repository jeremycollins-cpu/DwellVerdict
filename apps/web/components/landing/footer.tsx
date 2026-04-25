import Link from "next/link";

import { Logo } from "@/components/logo";

const PRODUCT_LINKS = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Sign in", href: "/sign-in" },
];

const COMPANY_LINKS = [
  { label: "Help", href: "/help" },
  { label: "Contact", href: "mailto:hello@dwellverdict.com" },
];

const LEGAL_LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Cookies", href: "/cookies" },
];

/**
 * Rich footer for the public landing surface. Links to legal +
 * help routes that ship in M2.3 — those will 404 in the gap
 * between this PR and M2.3 merging, which is acceptable pre-launch
 * per the master plan. Speculative columns (About, Blog, Careers,
 * Changelog, Integrations) from the mockup were trimmed because
 * none of them are planned in the master plan and stubbing them
 * with placeholders would invent product surface that doesn't
 * exist.
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-hairline bg-paper">
      <div className="mx-auto max-w-[1280px] px-6 pb-8 pt-12 md:px-12">
        <div className="grid gap-10 border-b border-hairline pb-8 md:grid-cols-[2fr_1fr_1fr_1fr] md:gap-12">
          <div>
            <Link
              href="/"
              className="inline-block transition-opacity hover:opacity-80"
              aria-label="DwellVerdict home"
            >
              <Logo variant="full" size="md" />
            </Link>
            <p className="mt-4 max-w-[300px] text-[13px] leading-[1.55] text-ink-muted">
              The verdict platform for real estate decisions. Carfax for
              homes.
            </p>
          </div>

          <FooterColumn heading="Product" links={PRODUCT_LINKS} />
          <FooterColumn heading="Company" links={COMPANY_LINKS} />
          <FooterColumn heading="Legal" links={LEGAL_LINKS} />
        </div>

        <div className="flex flex-col items-start justify-between gap-2 pt-6 font-mono text-[11px] tracking-[0.08em] text-ink-subtle md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} DwellVerdict</span>
          <span>Made in Oregon · Portland, USA</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: ReadonlyArray<{ label: string; href: string }>;
}) {
  return (
    <div>
      <h5 className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
        {heading}
      </h5>
      <div className="flex flex-col gap-1.5">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-[13px] text-ink-70 transition-colors hover:text-terracotta"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
