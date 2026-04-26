import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SignedIn, SignedOut } from "@clerk/nextjs";

/**
 * Closing CTA on the pricing page. Same dark-ink + terracotta
 * accent treatment as the landing's FinalCTA, but with copy
 * specific to a user who has just walked through the comparison
 * — they're closer to converting, so the language is more
 * direct.
 */
export function PricingFinalCTA() {
  return (
    <section className="bg-ink px-6 py-24 text-center text-paper md:py-28">
      <div className="mx-auto max-w-[720px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-terracotta">
          Ready when you are
        </div>
        <h2 className="mt-4 font-serif text-[40px] font-normal leading-[1.1] tracking-[-0.025em] sm:text-[48px] md:text-[56px]">
          Run your <em className="italic text-terracotta">first verdict</em>{" "}
          free.
        </h2>
        <p className="mx-auto mt-5 max-w-[520px] text-[16px] leading-[1.6] text-paper/70 md:text-[17px]">
          Sign up, paste an address, see the product. No credit card. Decide
          whether $20 or $40 a month is worth it after you&rsquo;ve seen one
          real verdict on a property you actually care about.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <SignedOut>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-md bg-terracotta px-7 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-terracotta-deep"
            >
              Get started
              <ArrowRight className="size-[15px]" strokeWidth={2} />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/app/properties"
              className="inline-flex items-center gap-2 rounded-md bg-terracotta px-7 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-terracotta-deep"
            >
              Open dashboard
              <ArrowRight className="size-[15px]" strokeWidth={2} />
            </Link>
          </SignedIn>
        </div>
      </div>
    </section>
  );
}
