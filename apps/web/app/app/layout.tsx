import { auth, currentUser } from "@clerk/nextjs/server";

import { Sidebar } from "@/components/ui/sidebar";
import { resolveAppUser } from "@/lib/db/queries/users";
import { getOrgById } from "@/lib/db/queries/organizations";
import { getInitials, getDisplayName } from "@/lib/user/initials";
import { getPlanString } from "@/lib/plan/display";
import type { OrganizationPlan } from "@dwellverdict/db";

/**
 * The authenticated app shell. Every `/app/*` route inherits this:
 * a 232px sidebar on the left, the page content on the right. The
 * sidebar component is itself a client component (it reads pathname
 * for the active-state highlight) but the layout is server-rendered
 * so we can pass the Clerk user + plan straight through without an
 * extra round-trip.
 *
 * Auth is enforced by Clerk middleware (apps/web/middleware.ts), so
 * the layout can assume a session. If the inline app-user resolution
 * fails (e.g. the row was soft-deleted), we render the shell with a
 * fallback identity rather than throwing — the page underneath will
 * still call `auth.protect()` and surface its own error.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { userId: clerkUserId } = await auth();
  const clerkUser = await currentUser();

  let plan: OrganizationPlan | null = null;
  if (clerkUserId && clerkUser) {
    const email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      "";
    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
      null;
    const appUser = await resolveAppUser(clerkUserId, email, name);
    if (appUser) {
      const org = await getOrgById(appUser.orgId);
      plan = (org?.plan as OrganizationPlan | undefined) ?? null;
    }
  }

  const sidebarUser = {
    name: getDisplayName(clerkUser),
    initials: getInitials(clerkUser),
    plan: getPlanString(plan),
  };

  return (
    <div className="grid min-h-screen grid-cols-1 bg-paper md:grid-cols-[232px_1fr]">
      <Sidebar user={sidebarUser} />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
