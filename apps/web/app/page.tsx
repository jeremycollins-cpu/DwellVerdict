import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { HeroReveal } from "@/components/hero-reveal";
import { PublicNav } from "@/components/public-nav";
import { VerdictCertificate } from "@/components/verdict-certificate";
import { Wordmark } from "@/components/wordmark";

const STEPS = [
  {
    num: "01",
    title: "Paste an address",
    body: "Any US address. Free basic report, no card required.",
  },
  {
    num: "02",
    title: "Know the verdict",
    body:
      "STR/LTR revenue forecast, regulatory risk, and location signals — all property-specific.",
  },
  {
    num: "03",
    title: "Track the lifecycle",
    body: "Finding, buying, renovating, managing. One record, five stages.",
  },
];

const TRUST_PILLS = [
  "Built by real-estate investors",
  "Nashville · Scottsdale · Gatlinburg",
  "Updated weekly",
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <PublicNav />

      <main className="flex flex-1 flex-col">
        {/* ─── Hero ─────────────────────────────────────────────────
            Subtle terracotta glow at the top fades into paper ground
            before the eye reaches the headline. Atmospheric, not
            decorative — signals "warmth" without shouting for
            attention.
        */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[480px]"
            style={{
              background:
                "radial-gradient(ellipse 70% 50% at 50% 0%, hsl(var(--terracotta) / 0.06), transparent 70%)",
            }}
          />
          <div className="container relative flex flex-col items-center gap-6 py-20 text-center md:py-28">
            <HeroReveal>
              <h1 className="text-balance text-5xl font-medium tracking-[-0.025em] text-ink sm:text-6xl lg:text-7xl">
                Paste any address.
                <br />
                Know the verdict.
              </h1>
              <p className="mx-auto max-w-xl text-balance text-lg text-ink-muted">
                One report, from finding to managing. The property record that
                follows the investment.
              </p>
              <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row">
                <SignedOut>
                  <Button
                    asChild
                    size="lg"
                    className="bg-terracotta text-white shadow-sm transition-colors hover:bg-terracotta/90"
                  >
                    <Link href="/sign-up">Get started</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link href="/sign-in">Sign in</Link>
                  </Button>
                </SignedOut>
                <SignedIn>
                  <Button
                    asChild
                    size="lg"
                    className="bg-terracotta text-white shadow-sm transition-colors hover:bg-terracotta/90"
                  >
                    <Link href="/app/properties">Open dashboard</Link>
                  </Button>
                </SignedIn>
              </div>
            </HeroReveal>
          </div>
        </section>

        {/* ─── Trust band ───────────────────────────────────────────
            Three quiet credibility pills. Not testimonials — just
            structural facts presented warmly. They anchor the product
            in reality before the reader evaluates the pitch.
        */}
        <section className="container pb-6">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {TRUST_PILLS.map((pill) => (
              <span
                key={pill}
                className="inline-flex items-center rounded-full border border-hairline bg-card px-4 py-1.5 font-mono text-xs text-ink-muted"
              >
                {pill}
              </span>
            ))}
          </div>
        </section>

        {/* ─── How it works ───────────────────────────────────────── */}
        <section className="container py-20 md:py-28">
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((step) => (
              <div
                key={step.num}
                className="group relative rounded-[14px] bg-card p-8 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
              >
                {/* Step badge — terracotta-bordered circle with mono
                    number inside. Subtle brand moment that repeats
                    across the three cards. */}
                <div className="mb-6 inline-flex h-9 w-9 items-center justify-center rounded-full border border-terracotta/40 bg-terracotta/5 font-mono text-xs font-medium text-terracotta">
                  {step.num}
                </div>
                <h3 className="text-lg font-medium tracking-[-0.01em] text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Anatomy of a verdict — THE signature ──────────────── */}
        <section className="container pb-24 md:pb-32">
          <div className="mx-auto max-w-2xl">
            <VerdictCertificate mode="placeholder" />
            <p className="mt-5 text-center text-sm text-ink-muted">
              What every verdict looks like. Paste an address to see yours.
            </p>
          </div>
        </section>

        {/* ─── CTA band ─────────────────────────────────────────── */}
        <section className="border-t border-hairline">
          <div className="container flex flex-col items-center gap-5 py-20 text-center md:py-24">
            <h2 className="text-3xl font-medium tracking-[-0.02em] text-ink sm:text-4xl">
              Ready to see your verdict?
            </h2>
            <p className="max-w-md text-base text-ink-muted">
              Start with one address. No card required.
            </p>
            <SignedOut>
              <Button
                asChild
                size="lg"
                className="bg-terracotta text-white shadow-sm transition-colors hover:bg-terracotta/90"
              >
                <Link href="/sign-up">Get started</Link>
              </Button>
            </SignedOut>
            <SignedIn>
              <Button
                asChild
                size="lg"
                className="bg-terracotta text-white shadow-sm transition-colors hover:bg-terracotta/90"
              >
                <Link href="/app/properties">Open dashboard</Link>
              </Button>
            </SignedIn>
          </div>
        </section>
      </main>

      {/* ─── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-hairline bg-card">
        <div className="container flex flex-col items-center justify-between gap-3 py-8 text-sm text-ink-muted md:flex-row">
          <div className="flex items-center gap-3">
            <Wordmark fontSize={14} />
            <span className="text-ink-muted/60">·</span>
            <span>Property-specific lifecycle intelligence</span>
          </div>
          <span className="font-mono text-xs">© 2026</span>
        </div>
      </footer>
    </div>
  );
}

