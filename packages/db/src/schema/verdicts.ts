import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { properties } from "./properties";
import { users } from "./users";

/**
 * Verdict signal — the BUY / WATCH / PASS call that defines DwellVerdict.
 *
 * Kept as a text column with a CHECK constraint (not a pg enum) so new
 * signals can be added without a migration. UI maps signal → color:
 * buy → emerald, watch → amber, pass → red.
 */
export const VERDICT_SIGNALS = ["buy", "watch", "pass"] as const;
export type VerdictSignal = (typeof VERDICT_SIGNALS)[number];

/**
 * Verdict status — lifecycle of a single generation.
 *
 *   pending   — row created, Anthropic call in flight (or queued)
 *   ready     — generation succeeded, payload populated
 *   failed    — generation errored; `error_message` has the reason
 *
 * `pending` rows exist so the UI can render a loading skeleton tied to a
 * real DB id (the client polls by id). Failed rows are kept for
 * observability and to let users retry without losing the attempt log.
 */
export const VERDICT_STATUSES = ["pending", "ready", "failed"] as const;
export type VerdictStatus = (typeof VERDICT_STATUSES)[number];

/**
 * verdicts — immutable per-property AI analysis events.
 *
 * CLAUDE.md rule: "Every forecast is immutable. Re-running produces a
 * new row. Never edit in place." Verdicts follow the same pattern — a
 * property can accumulate many verdicts over time (monthly re-runs,
 * market-shift reruns, user-requested reruns), and actuals-vs-forecast
 * reconciliation depends on each snapshot being frozen.
 *
 * `data_points` and `sources` are jsonb because their shape evolves
 * faster than migrations; validation lives in the application layer
 * (Zod schemas in packages/ai).
 */
export const verdicts = pgTable(
  "verdicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Redundant FK to org for cheap org-scoped queries and RLS-style
    // checks at the query-builder level. Matches the pattern used by
    // properties.org_id.
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),

    // Who asked for this verdict. Set null on user delete so history
    // survives actor removal (same pattern as property_stages).
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // Lifecycle — pending rows exist while generation is in flight so
    // the UI can render a loading skeleton bound to a real DB id.
    status: text("status").notNull().default("pending"),

    // Core verdict payload. Nullable while status = 'pending'.
    signal: text("signal"),
    confidence: integer("confidence"),
    summary: text("summary"),
    narrative: text("narrative"),
    dataPoints: jsonb("data_points"),
    sources: jsonb("sources"),

    // Observability — every AI output logs model + prompt version + token
    // counts + cost per CLAUDE.md "AI non-negotiables". `task_type` lets
    // one table serve multiple AI flows later (offer analysis, regulatory
    // interpretation, etc.); today it's always 'verdict_generation'.
    taskType: text("task_type").notNull().default("verdict_generation"),
    modelVersion: text("model_version"),
    promptVersion: text("prompt_version"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costCents: integer("cost_cents"),

    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    // Primary access: "latest verdicts for this property, newest first."
    // Covers property-detail page and monthly re-run UI.
    propertyRecencyIdx: index("verdicts_property_recency_idx").on(
      table.propertyId,
      sql`${table.createdAt} DESC`,
    ),
    orgRecencyIdx: index("verdicts_org_recency_idx").on(
      table.orgId,
      sql`${table.createdAt} DESC`,
    ),
    statusIdx: index("verdicts_status_idx").on(table.status),

    signalCheck: check(
      "verdicts_signal_check",
      sql`${table.signal} IS NULL OR ${table.signal} IN ('buy', 'watch', 'pass')`,
    ),
    statusCheck: check(
      "verdicts_status_check",
      sql`${table.status} IN ('pending', 'ready', 'failed')`,
    ),
    confidenceCheck: check(
      "verdicts_confidence_check",
      sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 100)`,
    ),
  }),
);

export type Verdict = typeof verdicts.$inferSelect;
export type NewVerdict = typeof verdicts.$inferInsert;
