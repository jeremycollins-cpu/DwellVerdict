import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SignedIn, SignedOut } from "@clerk/nextjs";

import { HeroDemo } from "@/components/landing/hero-demo";

/**
 * Hero — eyebrow chip, serif headline with terracotta italic, sub,
 * primary + secondary CTAs, then the trust row. The demo frame
 * follows below in its own block for narrative reasons (the eye
 * lands on the headline first, then absorbs the supporting CTAs +
 * trust row, then proves it with the product preview underneath).
 */
export function Hero() {
  return (
    <>
      <section className="mx-auto max-w-[1280px] px-6 pb-20 pt-16 text-center md:px-12 md:pt-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-terracotta-border bg-terracotta-soft px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-terracotta">
          <span className="size-[5px] rounded-full bg-terracotta" />
          <span>Carfax for homes</span>
        </div>

        <h1 className="mx-auto mt-6 max-w-[940px] font-serif text-[44px] font-normal leading-[1.05] tracking-[-0.025em] text-ink sm:text-6xl md:text-7xl">
          Every home you look at deserves a{" "}
          <em className="italic text-terracotta">verdict</em>.
        </h1>

        <p className="mx-auto mt-6 max-w-[620px] text-[17px] leading-relaxed text-ink-muted md:text-[19px]">
          Paste any address. Get an AI-generated report on whether to buy,
          watch, or pass — grounded in regulatory rules, comparable properties,
          revenue estimates, and location signals. The record follows the home.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-3">
          <SignedOut>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-md bg-ink px-7 py-3.5 text-[15px] font-medium text-paper transition-colors hover:bg-ink-70"
            >
              Get your first verdict free
              <ArrowRight className="size-[15px]" strokeWidth={2} />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/app/properties"
              className="inline-flex items-center gap-2 rounded-md bg-ink px-7 py-3.5 text-[15px] font-medium text-paper transition-colors hover:bg-ink-70"
            >
              Open dashboard
              <ArrowRight className="size-[15px]" strokeWidth={2} />
            </Link>
          </SignedIn>
          <a
            href="#how-it-works"
            className="inline-flex items-center rounded-md border border-hairline-strong bg-transparent px-6 py-3.5 text-[15px] font-medium text-ink transition-colors hover:border-ink"
          >
            See how it works
          </a>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
          <span>No credit card</span>
          <span aria-hidden className="size-1 rounded-full bg-ink-faint" />
          <span>First verdict free</span>
          <span aria-hidden className="size-1 rounded-full bg-ink-faint" />
          <span>Takes 30 seconds</span>
        </div>
      </section>

      <div className="mx-auto mt-12 max-w-[1120px] px-6 md:mt-20 md:px-12">
        <HeroDemo />
      </div>
    </>
  );
}
