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
import { properties as _properties } from "./properties";
import { scoutMessages } from "./scout_messages";
import { users } from "./users";
import { verdicts } from "./verdicts";

void _properties;

/**
 * Allowed task identifiers for ai_usage_events.task. Add new entries
 * here when a new AI surface starts logging — the DB CHECK constraint
 * enforces the same set, so additions need both code + migration
 * changes.
 *
 * Some entries (briefs, alerts, compare, portfolio) are reserved for
 * milestones not yet shipped (M7, M4.4) — included now so future
 * milestones don't need a CHECK-constraint migration just to start
 * logging.
 */
export const AI_USAGE_TASKS = [
  "regulatory-lookup",
  "place-sentiment",
  "scout-chat",
  "verdict-narrative",
  "briefs",
  "alerts",
  "compare",
  "portfolio",
] as const;
export type AiUsageTask = (typeof AI_USAGE_TASKS)[number];

/**
 * ai_usage_events — central log of every AI call, regardless of which
 * surface initiated it.
 *
 * Surface-specific cost columns (verdicts.cost_cents,
 * scout_messages.cost_cents, regulatory_cache.cost_cents,
 * place_sentiment_cache.cost_cents) keep their current behavior — they
 * stay the fast path for surface UIs. This table is the source of
 * truth for cost analytics and aggregation.
 *
 * cost_cents already accounts for the prompt-cache discount math
 * applied by computeCostCents (see packages/ai/src/pricing.ts):
 * cache_read_input_tokens are billed at 10% of the base input rate,
 * cache_creation_input_tokens at 125% (5-min TTL).
 */
export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => organizations.id, {
      onDelete: "set null",
    }),

    task: text("task").notNull(),
    model: text("model").notNull(),
    routingReason: text("routing_reason"),

    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadInputTokens: integer("cache_read_input_tokens").notNull().default(0),
    cacheCreationInputTokens: integer("cache_creation_input_tokens")
      .notNull()
      .default(0),
    webSearchCount: integer("web_search_count").notNull().default(0),
    costCents: integer("cost_cents").notNull(),

    verdictId: uuid("verdict_id").references(() => verdicts.id, {
      onDelete: "set null",
    }),
    scoutMessageId: uuid("scout_message_id").references(() => scoutMessages.id, {
      onDelete: "set null",
    }),

    durationMs: integer("duration_ms"),
    batchId: text("batch_id"),
    error: text("error"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userRecencyIdx: index("ai_usage_events_user_id_created_at_idx").on(
      table.userId,
      sql`${table.createdAt} DESC`,
    ),
    taskRecencyIdx: index("ai_usage_events_task_created_at_idx").on(
      table.task,
      sql`${table.createdAt} DESC`,
    ),
    orgRecencyIdx: index("ai_usage_events_org_id_created_at_idx").on(
      table.orgId,
      sql`${table.createdAt} DESC`,
    ),
    taskCheck: check(
      "ai_usage_events_task_check",
      sql`${table.task} IN ('regulatory-lookup', 'place-sentiment', 'scout-chat', 'verdict-narrative', 'briefs', 'alerts', 'compare', 'portfolio')`,
    ),
  }),
);

export type AiUsageEvent = typeof aiUsageEvents.$inferSelect;
export type NewAiUsageEvent = typeof aiUsageEvents.$inferInsert;
