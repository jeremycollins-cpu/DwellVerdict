import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        DwellVerdict
      </p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Property-specific lifecycle intelligence.
      </h1>
      <p className="max-w-xl text-balance text-muted-foreground">
        Paste any US address, get a CarFax-style report, then follow the
        property through evaluation, buying, renovating, and managing.
      </p>

      <div className="flex gap-3">
        <SignedOut>
          <Button asChild>
            <Link href="/sign-up">Sign up</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </SignedOut>
        <SignedIn>
          <Button asChild>
            <Link href="/app/properties">Go to dashboard</Link>
          </Button>
        </SignedIn>
      </div>
    </main>
  );
}
