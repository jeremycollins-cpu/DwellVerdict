import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

import { Wordmark } from "@/components/wordmark";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-hairline">
        <div className="container flex h-14 items-center justify-between">
          {/*
            Wordmark matches the public landing's treatment. Clicking
            stays inside the app — this goes to the dashboard home, not
            the public landing.
          */}
          <Link
            href="/app/properties"
            className="transition-opacity hover:opacity-80"
            aria-label="DwellVerdict dashboard"
          >
            <Wordmark fontSize={18} />
          </Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
