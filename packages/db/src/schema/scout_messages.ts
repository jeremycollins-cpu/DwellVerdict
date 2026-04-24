import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { properties } from "./properties";
import { users } from "./users";

/**
 * scout_messages — per-property Scout chat transcripts per ADR-8.
 *
 * Pro-tier only. Rate limit (30/day, 300/month) enforced upstream
 * via consumeScoutMessage in user_report_usage.
 *
 * One row per message. User and assistant turns both persist so
 * the conversation survives page reloads and so we have an audit
 * trail per CLAUDE.md's AI non-negotiables ("every AI output logs
 * model_version, input/output tokens, cost_cents").
 *
 * Observability fields are null on user-role rows (nothing was
 * inferred); populated on assistant rows.
 *
 * Fair-housing discipline: the system prompt (prompts/scout-chat.
 * v1.md) carries the same allow/deny lists as place-sentiment.
 * The place-sentiment lint regex is also run on every assistant
 * reply before it's persisted, fail-closed.
 */
export const scoutMessages = pgTable(
  "scout_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    role: text("role").notNull(),
    content: text("content").notNull(),

    modelVersion: text("model_version"),
    promptVersion: text("prompt_version"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costCents: integer("cost_cents"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    propertyRecencyIdx: index("scout_messages_property_recency_idx").on(
      table.propertyId,
      sql`${table.createdAt} ASC`,
    ),
    orgIdx: index("scout_messages_org_idx").on(table.orgId),
    roleCheck: check(
      "scout_messages_role_check",
      sql`${table.role} IN ('user', 'assistant')`,
    ),
  }),
);

export type ScoutMessage = typeof scoutMessages.$inferSelect;
export type NewScoutMessage = typeof scoutMessages.$inferInsert;
