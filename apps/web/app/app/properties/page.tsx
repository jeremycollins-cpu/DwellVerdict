import { auth, currentUser } from "@clerk/nextjs/server";

import { AddressEntry } from "@/app/app/properties/address-entry";
import { PropertyList } from "@/app/app/properties/property-list";
import { resolveAppUser } from "@/lib/db/queries/users";
import { listPropertiesForOrg } from "@/lib/db/queries/properties";
import { checkHealth } from "@/lib/modeling-client";

/**
 * /app/properties — the authed home screen.
 *
 * Two surfaces sharing the page:
 *   1. AddressEntry: the paste-an-address front door (always on top).
 *   2. PropertyList: either an empty state or the list of saved
 *      properties with their latest verdict signal.
 *
 * Server-rendered. The address input is the only interactive piece
 * and lives in its own client component to keep the rest of the tree
 * on the server.
 */
export default async function PropertiesPage() {
  await auth.protect();

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    // auth.protect() should have redirected; this is a type-narrow.
    throw new Error("unreachable: auth.protect returned without a user id");
  }
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    "";
  const name =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() || null;

  const appUser = await resolveAppUser(clerkUserId, email, name);
  if (!appUser) throw new Error("User has been soft-deleted");

  const [properties, health] = await Promise.all([
    listPropertiesForOrg({ orgId: appUser.orgId }),
    checkHealth(),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-paper">
      <section className="container flex flex-col gap-8 py-12">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] text-ink">
            Your properties
          </h1>
          <p className="text-sm text-ink-muted">
            Paste any US address. Scout researches the property and returns a
            verdict you can track through the lifecycle.
          </p>
        </div>

        <AddressEntry />

        <PropertyList properties={properties} />
      </section>

      <footer className="mt-auto border-t border-hairline bg-card/50">
        <div className="container flex h-10 items-center justify-end gap-2 text-xs text-ink-muted">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${
              health.ok ? "bg-green-500" : "bg-amber-500"
            }`}
          />
          <span className="font-mono">
            {health.ok ? `modeling v${health.version}` : "modeling: unavailable"}
          </span>
        </div>
      </footer>
    </div>
  );
}
