"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

import { Logo } from "@/components/logo";

/**
 * Persistent top nav for the authenticated app shell. Lives in
 * apps/web/app/app/layout.tsx so every /app/* route inherits it.
 *
 * Sections:
 *   - Properties — dashboard home, list of the user's saved rows
 *   - Pricing    — public pricing page, so signed-in users can
 *                  find upgrade paths without leaving the app
 *   - Billing    — /app/settings/billing, which shows current plan
 *                  and links into the Stripe portal
 *
 * Active highlighting uses the first path segment under /app/* so
 * deep links like /app/properties/:id/buying still mark "Properties"
 * as current.
 */

const LINKS = [
  { href: "/app/properties", label: "Properties", match: /^\/app\/properties(\/|$)/ },
  { href: "/pricing", label: "Pricing", match: /^\/pricing(\/|$)/ },
  {
    href: "/app/settings/billing",
    label: "Billing",
    match: /^\/app\/settings(\/|$)/,
  },
] as const;

export function AppNav() {
  const pathname = usePathname() ?? "";

  return (
    <header className="border-b border-hairline">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/app/properties"
            className="transition-opacity hover:opacity-80"
            aria-label="DwellVerdict dashboard"
          >
            <Logo variant="full" size="sm" />
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            {LINKS.map((link) => {
              const active = link.match.test(pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    active
                      ? "font-medium text-ink"
                      : "text-ink-muted transition-colors hover:text-ink"
                  }
                  aria-current={active ? "page" : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <UserButton afterSignOutUrl="/" />
      </div>
    </header>
  );
}
