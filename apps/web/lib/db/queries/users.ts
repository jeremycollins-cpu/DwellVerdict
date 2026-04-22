import "server-only";

import { eq, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";

import { getDb } from "@/lib/db";
import { personalOrgClerkId } from "@/lib/clerk/sync";

const { users, organizationMembers, organizations } = schema;

/**
 * Resolve the authenticated Clerk user to our internal user + org row.
 *
 * Every authed request inside /app goes through this. The webhook
 * handler (lib/clerk/sync.ts) creates these rows on user.created, but
 * there's a small window between sign-up and webhook delivery where a
 * user can land in /app without a row yet. This function has a
 * read-your-write fallback: if the user exists in Clerk's session but
 * not in our DB, it creates the row inline so the request doesn't
 * 500.
 *
 * Returns null when the Clerk user has been soft-deleted.
 */
export async function resolveAppUser(
  clerkUserId: string,
  clerkEmail: string,
  clerkName: string | null,
): Promise<{ userId: string; orgId: string } | null> {
  const db = getDb();

  const existing = await db
    .select({
      userId: users.id,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  const userId = existing[0]?.userId;

  if (existing[0]?.deletedAt) return null;

  if (!userId) {
    // Webhook race — user signed up but the Clerk webhook hasn't
    // landed in our DB yet. Create the row inline so the user
    // doesn't hit a blank screen on their first login.
    const created = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ clerkId: clerkUserId, email: clerkEmail, name: clerkName })
        .onConflictDoNothing({ target: users.clerkId })
        .returning({ id: users.id });

      const uid =
        u?.id ??
        (
          await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.clerkId, clerkUserId))
            .limit(1)
        )[0]?.id;

      if (!uid) throw new Error("inline user create failed");

      const [o] = await tx
        .insert(organizations)
        .values({
          clerkOrgId: personalOrgClerkId(clerkUserId),
          name: clerkName ? `${clerkName}'s workspace` : "Personal workspace",
        })
        .onConflictDoNothing({ target: organizations.clerkOrgId })
        .returning({ id: organizations.id });

      const oid =
        o?.id ??
        (
          await tx
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.clerkOrgId, personalOrgClerkId(clerkUserId)))
            .limit(1)
        )[0]?.id;

      if (!oid) throw new Error("inline org create failed");

      await tx
        .insert(organizationMembers)
        .values({ userId: uid, orgId: oid, role: "owner" })
        .onConflictDoNothing();

      return { userId: uid, orgId: oid };
    });
    return created;
  }

  // Existing user — look up their primary org (first membership).
  const [membership] = await db
    .select({ orgId: organizationMembers.orgId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId))
    .limit(1);

  if (!membership) {
    // User row exists but has no org membership. Rare — likely a
    // migration artifact or partial delete. Recreate the personal org.
    const [o] = await db
      .insert(organizations)
      .values({
        clerkOrgId: personalOrgClerkId(clerkUserId),
        name: clerkName ? `${clerkName}'s workspace` : "Personal workspace",
      })
      .onConflictDoNothing({ target: organizations.clerkOrgId })
      .returning({ id: organizations.id });

    const orgId =
      o?.id ??
      (
        await db
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.clerkOrgId, personalOrgClerkId(clerkUserId)))
          .limit(1)
      )[0]?.id;

    if (!orgId) throw new Error("org recovery failed");

    await db
      .insert(organizationMembers)
      .values({ userId, orgId, role: "owner" })
      .onConflictDoNothing();

    return { userId, orgId };
  }

  // Keep email/name in sync opportunistically — Clerk is source of
  // truth and the webhook might have lagged.
  await db
    .update(users)
    .set({ email: clerkEmail, name: clerkName, updatedAt: sql`now()` })
    .where(eq(users.id, userId));

  return { userId, orgId: membership.orgId };
}
