import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

import { Logo } from "@/components/logo";

/**
 * Public marketing header. Used on `/`, `/pricing`, and any other
 * unauthenticated surfaces we ship. Sticky with a translucent
 * paper background so the hero glow can bleed through but the nav
 * still reads on scroll.
 *
 * SignedIn / SignedOut flip the right-hand slot between Sign in +
 * Get started vs. Open dashboard so returning users don't get
 * nagged to sign in again.
 *
 * "How it works" anchors `/#how-it-works`, which is the section
 * id on the landing page. From `/pricing` it routes home and
 * scrolls. From `/`, the hash anchor scrolls within the page.
 */
export function PublicNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-transparent bg-paper/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6 md:px-12">
        <Link
          href="/"
          className="transition-opacity hover:opacity-80"
          aria-label="DwellVerdict home"
        >
          <Logo variant="full" size="md" />
        </Link>

        <nav className="flex items-center gap-6 text-sm md:gap-8">
          <Link
            href="/#how-it-works"
            className="hidden text-ink-70 transition-colors hover:text-ink sm:inline"
          >
            How it works
          </Link>
          <Link
            href="/pricing"
            className="text-ink-70 transition-colors hover:text-ink"
          >
            Pricing
          </Link>
          <SignedOut>
            <Link
              href="/sign-in"
              className="hidden rounded-md px-3 py-2 text-ink-70 transition-colors hover:text-ink sm:inline-block"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-70"
            >
              Get your first verdict
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/app/properties"
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-70"
            >
              Open dashboard
            </Link>
          </SignedIn>
        </nav>
      </div>
    </header>
  );
}
