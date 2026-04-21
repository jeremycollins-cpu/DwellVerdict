import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, like } from "drizzle-orm";
import { Webhook } from "svix";

import { createDb, schema } from "@dwellverdict/db";

import { personalOrgClerkId } from "@/lib/clerk/sync";
import { POST } from "@/app/api/webhooks/clerk/route";

const { users, organizations, organizationMembers } = schema;

// Single DB connection for the whole test run. Next's route handler has its
// own singleton via getDb(); we create a parallel client purely for
// assertions and cleanup. Both point at the same DATABASE_URL.
let db: ReturnType<typeof createDb>;

// Per-test prefix so parallel runs don't collide on clerk_id uniqueness.
// afterEach cleans up everything matching this prefix.
let prefix: string;

beforeAll(() => {
  db = createDb(process.env.DATABASE_URL!);
});

beforeEach(() => {
  prefix = `test_${randomUUID().replace(/-/g, "")}_`;
});

afterEach(async () => {
  // Clean users by prefix (cascades delete org_members via FK). Then clean
  // orgs — personal orgs have clerk_org_id = `personal_<clerk_id>`.
  await db.delete(users).where(like(users.clerkId, `${prefix}%`));
  await db.delete(organizations).where(like(organizations.clerkOrgId, `personal_${prefix}%`));
});

afterAll(async () => {
  // Drizzle's neon-serverless doesn't expose a graceful pool end on the
  // typed client wrapper; letting Vitest tear the process down is fine for
  // a short test suite.
});

function buildEvent(type: "user.created" | "user.updated" | "user.deleted", clerkId: string) {
  if (type === "user.deleted") {
    return { type, data: { id: clerkId, deleted: true } };
  }
  return {
    type,
    data: {
      id: clerkId,
      first_name: "Ada",
      last_name: "Lovelace",
      primary_email_address_id: "ema_primary",
      email_addresses: [{ id: "ema_primary", email_address: `${clerkId}@example.com` }],
    },
  };
}

/**
 * Sign a payload with the test signing secret so the route's svix verifier
 * accepts it. Mirrors exactly what Clerk does when it calls our endpoint.
 */
function sign(payload: string) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET!;
  const wh = new Webhook(secret);
  const svixId = `msg_${randomUUID()}`;
  const timestamp = new Date();
  const signature = wh.sign(svixId, timestamp, payload);
  return {
    "svix-id": svixId,
    "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
    "svix-signature": signature,
  };
}

async function postToWebhook(event: unknown) {
  const body = JSON.stringify(event);
  const headers = sign(body);
  const req = new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body,
  });
  return POST(req);
}

describe("clerk webhook → DB sync", () => {
  test("user.created creates users row, personal org, and owner membership", async () => {
    const clerkId = `${prefix}alpha`;
    const res = await postToWebhook(buildEvent("user.created", clerkId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; sync: { kind: string } };
    expect(body.sync.kind).toBe("created");

    const userRows = await db.select().from(users).where(eq(users.clerkId, clerkId));
    expect(userRows).toHaveLength(1);
    const user = userRows[0]!;
    expect(user.email).toBe(`${clerkId}@example.com`);
    expect(user.name).toBe("Ada Lovelace");
    expect(user.deletedAt).toBeNull();

    const orgRows = await db
      .select()
      .from(organizations)
      .where(eq(organizations.clerkOrgId, personalOrgClerkId(clerkId)));
    expect(orgRows).toHaveLength(1);
    const org = orgRows[0]!;
    expect(org.name).toBe("Ada's organization");
    expect(org.plan).toBe("starter");

    const memberRows = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, user.id));
    expect(memberRows).toHaveLength(1);
    const member = memberRows[0]!;
    expect(member.orgId).toBe(org.id);
    expect(member.role).toBe("owner");
  });

  test("replaying user.created for same clerk_id is a no-op (idempotent)", async () => {
    const clerkId = `${prefix}beta`;
    const event = buildEvent("user.created", clerkId);

    const first = await postToWebhook(event);
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { sync: { kind: string } };
    expect(firstBody.sync.kind).toBe("created");

    // Capture DB state after the first successful sync.
    const [userAfterFirst] = await db.select().from(users).where(eq(users.clerkId, clerkId));
    const [orgAfterFirst] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.clerkOrgId, personalOrgClerkId(clerkId)));

    // Replay — simulates svix's retry behavior.
    const second = await postToWebhook(event);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { sync: { kind: string } };
    expect(secondBody.sync.kind).toBe("already_synced");

    // Same row, same ids — no duplicates.
    const userRows = await db.select().from(users).where(eq(users.clerkId, clerkId));
    expect(userRows).toHaveLength(1);
    expect(userRows[0]!.id).toBe(userAfterFirst!.id);

    const orgRows = await db
      .select()
      .from(organizations)
      .where(eq(organizations.clerkOrgId, personalOrgClerkId(clerkId)));
    expect(orgRows).toHaveLength(1);
    expect(orgRows[0]!.id).toBe(orgAfterFirst!.id);

    const memberRows = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userAfterFirst!.id));
    expect(memberRows).toHaveLength(1);
  });

  test("user.deleted sets deleted_at, preserves row, and second delete is a no-op", async () => {
    const clerkId = `${prefix}gamma`;

    // Seed the user via the create webhook.
    const created = await postToWebhook(buildEvent("user.created", clerkId));
    expect(created.status).toBe(200);

    // Delete.
    const del = await postToWebhook(buildEvent("user.deleted", clerkId));
    expect(del.status).toBe(200);
    const delBody = (await del.json()) as { sync: { kind: string } };
    expect(delBody.sync.kind).toBe("deleted");

    // Row still exists, deleted_at populated, no hard delete.
    const userRows = await db.select().from(users).where(eq(users.clerkId, clerkId));
    expect(userRows).toHaveLength(1);
    expect(userRows[0]!.deletedAt).not.toBeNull();

    // The personal org and membership are deliberately untouched — row
    // preservation includes the tenant the user owned.
    const orgRows = await db
      .select()
      .from(organizations)
      .where(eq(organizations.clerkOrgId, personalOrgClerkId(clerkId)));
    expect(orgRows).toHaveLength(1);

    // Re-delete — second call must be a no-op, not an error.
    const redel = await postToWebhook(buildEvent("user.deleted", clerkId));
    expect(redel.status).toBe(200);
    const redelBody = (await redel.json()) as { sync: { kind: string } };
    expect(redelBody.sync.kind).toBe("unknown_user");

    // deleted_at hasn't been overwritten by a second soft-delete.
    const stillDeleted = await db
      .select()
      .from(users)
      .where(and(eq(users.clerkId, clerkId), isNull(users.deletedAt)));
    expect(stillDeleted).toHaveLength(0);
  });
});
