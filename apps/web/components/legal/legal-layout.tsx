import type { ReactNode } from "react";

import { PublicNav } from "@/components/public-nav";
import { LandingFooter } from "@/components/landing/footer";

interface LegalLayoutProps {
  title: string;
  /** Display string like "April 25, 2026" — already humanized. */
  lastUpdated: string;
  /** Optional one-line context shown under the H1. */
  intro?: string;
  children: ReactNode;
}

/**
 * Shared shell for /terms, /privacy, /cookies, /help. Long-form
 * content column with manually styled prose — no
 * @tailwindcss/typography dependency added in this milestone, just
 * the base classes the children need.
 *
 * Children should compose `<LegalSection>` and the Tailwind prose
 * helpers exported from this file so spacing and typography stay
 * consistent across the four pages.
 */
export function LegalLayout({
  title,
  lastUpdated,
  intro,
  children,
}: LegalLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <PublicNav />
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-6 py-16 md:py-20 lg:py-24">
          <header className="border-b border-hairline pb-8">
            <h1 className="font-serif text-[40px] font-normal leading-[1.1] tracking-[-0.025em] text-ink md:text-[52px]">
              {title}
            </h1>
            {intro ? (
              <p className="mt-5 text-[17px] leading-[1.6] text-ink-70">
                {intro}
              </p>
            ) : null}
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-muted">
              Last updated · {lastUpdated}
            </p>
          </header>

          <div className="mt-10 space-y-10 text-[15.5px] leading-[1.7] text-ink-70">
            {children}
          </div>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}

/**
 * Numbered top-level section with a serif heading. Child paragraphs
 * inherit the column's text styling.
 */
export function LegalSection({
  number,
  title,
  children,
}: {
  number?: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-[24px] font-medium leading-[1.25] tracking-[-0.015em] text-ink">
        {number !== undefined ? (
          <span className="mr-3 font-mono text-[13px] font-medium uppercase tracking-[0.14em] text-terracotta">
            {String(number).padStart(2, "0")}
          </span>
        ) : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Sub-heading inside a section. Lighter weight than h2 so the
 * scan still reads main → sub.
 */
export function LegalSubheading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-2 text-[16px] font-medium tracking-[-0.01em] text-ink">
      {children}
    </h3>
  );
}

/**
 * Bulleted list with comfortable spacing.
 */
export function LegalList({ items }: { items: ReadonlyArray<ReactNode> }) {
  return (
    <ul className="ml-5 list-disc space-y-2 marker:text-ink-faint">
      {items.map((item, i) => (
        <li key={i} className="pl-1">
          {item}
        </li>
      ))}
    </ul>
  );
}
