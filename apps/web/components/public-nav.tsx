import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

/**
 * Public marketing header. Used on `/`, `/pricing`, and any other
 * unauthenticated surfaces we ship. Keeps the Logo on the left,
 * a small link cluster in the middle, and auth CTAs on the right.
 *
 * SignedIn / SignedOut flip the right-hand slot between Sign in +
 * Get started vs. Open dashboard so returning users don't get
 * nagged to sign in again.
 */
export function PublicNav() {
  return (
    <header className="border-b border-hairline">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="transition-opacity hover:opacity-80"
            aria-label="DwellVerdict home"
          >
            <Logo variant="full" size="md" />
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link
              href="/pricing"
              className="text-ink-muted transition-colors hover:text-ink"
            >
              Pricing
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <SignedOut>
            <Link
              href="/sign-in"
              className="text-ink-muted transition-colors hover:text-ink"
            >
              Sign in
            </Link>
            <Button
              asChild
              size="sm"
              className="bg-terracotta text-white shadow-sm transition-colors hover:bg-terracotta/90"
            >
              <Link href="/sign-up">Get started</Link>
            </Button>
          </SignedOut>
          <SignedIn>
            <Button asChild size="sm" variant="outline">
              <Link href="/app/properties">Open dashboard</Link>
            </Button>
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
