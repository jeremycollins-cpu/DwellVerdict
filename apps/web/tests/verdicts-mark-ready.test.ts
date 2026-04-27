import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";

import { createDb, schema } from "@dwellverdict/db";

import { markVerdictReady } from "@/lib/db/queries/verdicts";

const { users, organizations, organizationMembers, properties, verdicts } = schema;

/**
 * M3.6 fix-forward — verifies markVerdictReady clears the row's
 * `error_message` when flipping status to 'ready'. Regression test
 * for the bug where a failed verdict that succeeded on retry kept
 * its prior attempt's error text in the row, causing the status
 * endpoint and any downstream UI to surface stale failure copy.
 */

let db: ReturnType<typeof createDb>;
let prefix: string;

beforeAll(() => {
  db = createDb(process.env.DATABASE_URL!);
});

beforeEach(() => {
  prefix = `vmrt_${randomUUID().replace(/-/g, "")}_`;
});

afterEach(async () => {
  // Best-effort cleanup. FK cascades from organizations → properties →
  // verdicts (and organization_members), so deleting the org cleans
  // transitive rows. Users get soft-deleted by clerk webhook in
  // production; here we hard-delete after the org cascade.
  await db
    .delete(organizations)
    .where(like(organizations.name, `${prefix}%`))
    .catch(() => undefined);
  await db
    .delete(users)
    .where(like(users.clerkId, `${prefix}%`))
    .catch(() => undefined);
});

afterAll(async () => {
  // No cleanup needed — driver pool is per-test-run.
});

async function seedFailedVerdict(): Promise<{ verdictId: string; orgId: string }> {
  const [user] = await db
    .insert(users)
    .values({
      clerkId: `${prefix}user`,
      email: `${prefix}user@test.example`,
    })
    .returning({ id: users.id });
  if (!user) throw new Error("seed failed: user");

  const [org] = await db
    .insert(organizations)
    .values({
      clerkOrgId: `${prefix}clerkorg`,
      name: `${prefix}org`,
    })
    .returning({ id: organizations.id });
  if (!org) throw new Error("seed failed: org");

  await db.insert(organizationMembers).values({
    orgId: org.id,
    userId: user.id,
    role: "owner",
  });

  const [property] = await db
    .insert(properties)
    .values({
      orgId: org.id,
      createdByUserId: user.id,
      addressLine1: "123 Test St",
      city: "Testville",
      state: "CA",
      zip: "94000",
      // Per-test prefix on normalized_address gives the cleanup
      // hook a stable handle without leaking into the dedupe path.
      normalizedAddress: `${prefix}123-test-st-testville-ca-94000`,
      // Required for orchestrator to be runnable, but irrelevant here.
      intakeCompletedAt: new Date(),
    })
    .returning({ id: properties.id });
  if (!property) throw new Error("seed failed: property");

  const [verdict] = await db
    .insert(verdicts)
    .values({
      orgId: org.id,
      propertyId: property.id,
      createdByUserId: user.id,
      status: "failed",
      errorMessage:
        "narrative_failed: render_verdict_narrative output failed schema validation: data_points: Required",
      taskType: "verdict_generation",
      promptVersion: "v3",
    })
    .returning({ id: verdicts.id });
  if (!verdict) throw new Error("seed failed: verdict");

  return { verdictId: verdict.id, orgId: org.id };
}

describe("markVerdictReady (M3.6 fix-forward)", () => {
  test("clears error_message when flipping a failed verdict to ready", async () => {
    if (!process.env.DATABASE_URL) {
      // Skip when the test DB isn't configured (e.g. CI shards that
      // don't seed Neon). Don't fail — this test is opt-in.
      return;
    }
    const { verdictId } = await seedFailedVerdict();

    // Sanity: the seed left a non-null error_message.
    const [pre] = await db
      .select({ status: verdicts.status, errorMessage: verdicts.errorMessage })
      .from(verdicts)
      .where(eq(verdicts.id, verdictId));
    expect(pre?.status).toBe("failed");
    expect(pre?.errorMessage).toContain("narrative_failed");

    await markVerdictReady({
      verdictId,
      signal: "watch",
      confidence: 60,
      summary: "Test summary.",
      narrative: "Test narrative paragraph one.\n\nTest narrative paragraph two.",
      dataPoints: {
        comps: { summary: "No comp data." },
        revenue: { summary: "No revenue data." },
        regulatory: { summary: "No regulatory data." },
        location: { summary: "No location data." },
      },
      sources: [],
      modelVersion: "claude-haiku-4-5",
      promptVersion: "v3",
      inputTokens: 100,
      outputTokens: 200,
      costCents: 1,
    });

    const [post] = await db
      .select({
        status: verdicts.status,
        errorMessage: verdicts.errorMessage,
        signal: verdicts.signal,
      })
      .from(verdicts)
      .where(eq(verdicts.id, verdictId));

    expect(post?.status).toBe("ready");
    expect(post?.signal).toBe("watch");
    expect(post?.errorMessage).toBeNull();
  });
});
