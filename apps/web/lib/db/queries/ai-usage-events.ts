import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";

import { getDb } from "@/lib/db";

const { aiUsageEvents } = schema;

/**
 * Sum AI spend in cents for a user across the current calendar
 * month (UTC). Powers the M3.0 cost-cap framework — surfaces call
 * `decideCostCap(spend)` to decide whether to allow / degrade /
 * block the request.
 *
 * Cheap query (indexed on `(user_id, created_at desc)` per the
 * migration) and idempotent. Fires on every verdict-generation
 * kick-off plus every Scout message after M6.1 wires it in.
 */
export async function getUserMonthlySpendCents(
  userId: string,
): Promise<number> {
  const db = getDb();
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${aiUsageEvents.costCents}), 0)::int`,
    })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.userId, userId),
        gte(aiUsageEvents.createdAt, startOfMonth),
      ),
    );

  return row?.total ?? 0;
}
