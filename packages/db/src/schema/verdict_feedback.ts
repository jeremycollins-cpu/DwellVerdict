import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { users } from "./users";
import { verdicts } from "./verdicts";

/**
 * verdict_feedback — user thumbs up/down with optional comment per
 * M3.3. Per-user, per-verdict uniqueness is enforced by a unique
 * index; re-rating uses INSERT ... ON CONFLICT in the API layer.
 *
 * The snapshot fields (`verdict_signal`, `verdict_confidence`,
 * `verdict_model`) carry the verdict's state at rating time so
 * downstream analytics (M9.3 admin AI-quality dashboard) survive
 * verdict updates and regenerates.
 */
export const VERDICT_FEEDBACK_RATINGS = ["thumbs_up", "thumbs_down"] as const;
export type VerdictFeedbackRating = (typeof VERDICT_FEEDBACK_RATINGS)[number];

export const VERDICT_FEEDBACK_ISSUE_CATEGORIES = [
  "inaccurate_data",
  "missing_context",
  "wrong_verdict",
  "other",
] as const;
export type VerdictFeedbackIssueCategory =
  (typeof VERDICT_FEEDBACK_ISSUE_CATEGORIES)[number];

export const verdictFeedback = pgTable(
  "verdict_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    verdictId: uuid("verdict_id")
      .notNull()
      .references(() => verdicts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => organizations.id, {
      onDelete: "set null",
    }),

    rating: text("rating").notNull(),
    comment: text("comment"),
    issueCategories: text("issue_categories").array(),

    verdictSignal: text("verdict_signal").notNull(),
    verdictConfidence: integer("verdict_confidence").notNull(),
    verdictModel: text("verdict_model").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    verdictIdIdx: index("verdict_feedback_verdict_id_idx").on(table.verdictId),
    createdAtIdx: index("verdict_feedback_created_at_idx").on(
      sql`${table.createdAt} DESC`,
    ),
    userVerdictUnique: uniqueIndex("verdict_feedback_user_verdict_unique").on(
      table.userId,
      table.verdictId,
    ),
    ratingCheck: check(
      "verdict_feedback_rating_check",
      sql`${table.rating} IN ('thumbs_up', 'thumbs_down')`,
    ),
    signalCheck: check(
      "verdict_feedback_signal_check",
      sql`${table.verdictSignal} IN ('buy', 'watch', 'pass')`,
    ),
    confidenceCheck: check(
      "verdict_feedback_confidence_check",
      sql`${table.verdictConfidence} >= 0 AND ${table.verdictConfidence} <= 100`,
    ),
  }),
);

export type VerdictFeedback = typeof verdictFeedback.$inferSelect;
export type NewVerdictFeedback = typeof verdictFeedback.$inferInsert;
