import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SignedIn, SignedOut } from "@clerk/nextjs";

/**
 * Closing CTA on dark ink ground with terracotta italic accent in
 * the headline. Single primary action — no secondary CTA, no link
 * to pricing. The point is to reduce decision surface to "yes I'll
 * try this" or scroll past.
 */
export function FinalCTA() {
  return (
    <section className="bg-ink px-6 py-24 text-center text-paper md:py-28">
      <div className="mx-auto max-w-[720px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-terracotta">
          The whole journey
        </div>
        <h2 className="mt-4 font-serif text-[40px] font-normal leading-[1.1] tracking-[-0.025em] sm:text-[48px] md:text-[56px]">
          Start with a verdict. Stay for the{" "}
          <em className="italic text-terracotta">platform</em>.
        </h2>
        <p className="mx-auto mt-5 max-w-[560px] text-[16px] leading-[1.6] text-paper/70 md:text-[17px]">
          Your first verdict is free. From there, DwellVerdict guides you
          through buying, renovating, managing, and the tax strategies most
          investors miss.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <SignedOut>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-md bg-terracotta px-7 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-terracotta-deep"
            >
              Get your first verdict
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
