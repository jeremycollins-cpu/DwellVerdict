import { eq, sql } from "drizzle-orm";

import type { Db } from "@dwellverdict/db";
import { schema } from "@dwellverdict/db";

import {
  composeDisplayName,
  composePersonalOrgName,
  resolvePrimaryEmail,
  type UserCreatedEvent,
  type UserDeletedEvent,
  type UserUpdatedEvent,
} from "./events";

const { users, organizations, organizationMembers } = schema;

/**
 * The clerk_org_id we stamp on auto-created personal orgs. DwellVerdict
 * doesn't use Clerk Organizations for personal accounts — this synthetic
 * value satisfies the NOT NULL + unique constraint and makes it obvious in
 * SQL dumps which rows are personal vs. real Clerk-backed orgs.
 */
export function personalOrgClerkId(clerkUserId: string): string {
  return `personal_${clerkUserId}`;
}

export type SyncResult =
  | { kind: "created"; userId: string; orgId: string }
  | { kind: "already_synced"; userId: string }
  | { kind: "updated"; userId: string }
  | { kind: "deleted"; userId: string }
  | { kind: "unknown_user" }
  | { kind: "skipped_no_email" };

/**
 * user.created — create users + personal organization + owner membership in
 * a single transaction.
 *
 * Idempotency:
 *   - A pre-check bails out without writing if the clerk_id already exists.
 *     This is the common retry path.
 *   - The transaction itself uses onConflictDoNothing on all three inserts
 *     as a race-safety net in case two simultaneous retries slip past the
 *     pre-check. If that race happens, the losing tx no-ops cleanly.
 *
 * Correctness relies on the unique indexes on users.clerk_id and
 * organizations.clerk_org_id plus the composite PK on organization_members.
 */
export async function handleUserCreated(
  db: Db,
  event: UserCreatedEvent,
): Promise<SyncResult> {
  const { data } = event;
  const email = resolvePrimaryEmail(data);
  if (!email) {
    // Return 200 skipped instead of throwing — Clerk retries 500s
    // indefinitely and a user genuinely missing an email isn't recoverable
    // by replaying the same payload. Log so we can investigate.
    console.warn(`[clerk sync] user.created for clerk_id ${data.id} has no email address — skipping`);
    return { kind: "skipped_no_email" };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, data.id))
    .limit(1);

  if (existing) {
    return { kind: "already_synced", userId: existing.id };
  }

  return db.transaction(async (tx) => {
    const [userRow] = await tx
      .insert(users)
      .values({
        clerkId: data.id,
        email,
        name: composeDisplayName(data),
      })
      .onConflictDoNothing({ target: users.clerkId })
      .returning({ id: users.id });

    // Lost the race to a parallel retry — read the winner's id.
    const userId =
      userRow?.id ??
      (
        await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkId, data.id))
          .limit(1)
      )[0]?.id;

    if (!userId) {
      throw new Error(`Failed to materialize user row for clerk_id ${data.id}`);
    }

    const [orgRow] = await tx
      .insert(organizations)
      .values({
        clerkOrgId: personalOrgClerkId(data.id),
        name: composePersonalOrgName(data),
      })
      .onConflictDoNothing({ target: organizations.clerkOrgId })
      .returning({ id: organizations.id });

    const orgId =
      orgRow?.id ??
      (
        await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.clerkOrgId, personalOrgClerkId(data.id)))
          .limit(1)
      )[0]?.id;

    if (!orgId) {
      throw new Error(`Failed to materialize org row for clerk_id ${data.id}`);
    }

    await tx
      .insert(organizationMembers)
      .values({ orgId, userId, role: "owner" })
      .onConflictDoNothing();

    return { kind: "created", userId, orgId };
  });
}

/**
 * user.updated — refresh email + name on the users row.
 *
 * Updates updated_at via `sql\`now()\`` so the column stays accurate even
 * when the caller doesn't pass it in. Doesn't touch the personal org — if
 * the user changes their first name we deliberately keep the original org
 * name to avoid surprising rename behavior. Renaming orgs is a future UX.
 */
export async function handleUserUpdated(
  db: Db,
  event: UserUpdatedEvent,
): Promise<SyncResult> {
  const { data } = event;
  const email = resolvePrimaryEmail(data);
  if (!email) {
    console.warn(`[clerk sync] user.updated for clerk_id ${data.id} has no email address — skipping`);
    return { kind: "skipped_no_email" };
  }

  const updated = await db
    .update(users)
    .set({
      email,
      name: composeDisplayName(data),
      updatedAt: sql`now()`,
    })
    .where(eq(users.clerkId, data.id))
    .returning({ id: users.id });

  if (updated.length === 0) {
    // Clerk sent an update for a user we've never seen — upsert it so we
    // don't drop data. Surface the gap in logs so missed user.created
    // events are visible in PostHog/Sentry once those are wired in M5.
    console.warn(`[clerk sync] user.updated for unknown clerk_id ${data.id}, falling through to create`);
    return handleUserCreated(db, {
      type: "user.created",
      data,
    });
  }

  return { kind: "updated", userId: updated[0]!.id };
}

/**
 * user.deleted — soft-delete the users row. We preserve the row so
 * foreign-key references (forecasts.created_by, audit rows) stay intact.
 * Second-run is a no-op because of the deletedAt IS NULL guard.
 */
export async function handleUserDeleted(
  db: Db,
  event: UserDeletedEvent,
): Promise<SyncResult> {
  const deleted = await db
    .update(users)
    .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      sql`${users.clerkId} = ${event.data.id} AND ${users.deletedAt} IS NULL`,
    )
    .returning({ id: users.id });

  if (deleted.length === 0) {
    return { kind: "unknown_user" };
  }
  return { kind: "deleted", userId: deleted[0]!.id };
}
