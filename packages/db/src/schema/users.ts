import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * users — mirrored from Clerk.
 *
 * Source of truth for identity is Clerk; this table exists so other tables
 * (forecasts.created_by, audit rows, etc.) can foreign-key to a stable uuid
 * without round-tripping to Clerk on every query.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    clerkIdUnique: uniqueIndex("users_clerk_id_unique").on(table.clerkId),
    emailIdx: index("users_email_idx").on(table.email),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
