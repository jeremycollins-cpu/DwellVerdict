import { desc } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { properties } from "./properties";
import { users } from "./users";

/**
 * property_stages — append-only audit log of property state transitions.
 *
 * One row per status change. `from_status` / `from_stage` are null for
 * the first transition (creation into `prospect` / `finding`). Every
 * subsequent row documents the exact transition that moved the property
 * forward (or, rarely, backward) through the lifecycle.
 *
 * Immutable by design: no `updated_at`, no `deleted_at`. If a transition
 * was logged in error, fix it by writing a new corrective transition —
 * never mutate history. This mirrors the "every forecast is immutable"
 * rule in CLAUDE.md and keeps the audit trail defensible.
 */
export const propertyStages = pgTable(
  "property_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),

    // Nullable for the creation transition; notNull after.
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    fromStage: text("from_stage"),
    toStage: text("to_stage").notNull(),

    // Who triggered the change. Set null on user deletion so history
    // survives the actor being removed.
    changedByUserId: uuid("changed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // Optional free-text note (e.g. "Offer accepted", "Buyer backed out").
    reason: text("reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Primary access pattern: latest-first transition history for a
    // given property. Covers the "WHERE property_id = ?" query too, so
    // a standalone property_id index would be redundant.
    propertyHistoryIdx: index("property_stages_property_history_idx").on(
      table.propertyId,
      desc(table.createdAt),
    ),
    changedByUserIdx: index("property_stages_changed_by_user_idx").on(table.changedByUserId),
  }),
);

export type PropertyStage = typeof propertyStages.$inferSelect;
export type NewPropertyStage = typeof propertyStages.$inferInsert;
