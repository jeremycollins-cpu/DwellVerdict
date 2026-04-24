import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * regulatory_cache — per-city STR regulation records populated by
 * Haiku + web_search per ADR-6.
 *
 * One row per (city, state) — reused across every property in that
 * city. TTL is 30 days; rows past expires_at should be refreshed
 * via an Inngest background job so user-facing verdicts never
 * block on the LLM call.
 *
 * Fields reflect the structured output the LLM is asked to return
 * in render_regulatory. Each field is nullable because the LLM
 * may not be able to confidently answer every question for every
 * city — e.g., smaller jurisdictions don't publish cap rules.
 *
 * Source transparency per CLAUDE.md principle #7 ("every
 * regulatory claim has a source"): source_urls is a jsonb array
 * of the URLs the LLM actually read. UI surfaces each one as a
 * clickable link plus `last_verified_at` date and the "check
 * with city before committing" disclaimer.
 *
 * R2 snapshot of the source pages is a TODO for v0 — we'd snapshot
 * at fetch-time so the source survives even if the city takes
 * the page down. Deferred until R2 is wired for any purpose.
 */
export const regulatoryCache = pgTable(
  "regulatory_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    city: text("city").notNull(),
    state: text("state").notNull(), // 2-letter postal code

    // Structured STR rules. All nullable — the LLM may not know.
    strLegal: text("str_legal"), // 'yes' | 'restricted' | 'no' | 'unclear'
    permitRequired: text("permit_required"), // 'yes' | 'no' | 'unclear'
    ownerOccupiedOnly: text("owner_occupied_only"), // 'yes' | 'no' | 'depends' | 'unclear'
    capOnNonOwnerOccupied: text("cap_on_non_oo"), // descriptive, e.g. "3% of housing units" or null
    renewalFrequency: text("renewal_frequency"), // 'annual' | 'biennial' | 'none' | null
    minimumStayDays: integer("minimum_stay_days"), // e.g. 30 means "rentals under 30 nights prohibited"

    // LLM-generated prose summary (1-2 sentences) for UI display.
    summary: text("summary"),

    // Source URLs the LLM actually cited. jsonb array of strings.
    sourceUrls: jsonb("source_urls").notNull().default(sql`'[]'::jsonb`),

    // R2 snapshot keys per source URL, same ordering as source_urls.
    // Empty in v0 until R2 is wired.
    r2SnapshotKeys: jsonb("r2_snapshot_keys")
      .notNull()
      .default(sql`'[]'::jsonb`),

    // LLM observability — per CLAUDE.md AI non-negotiables.
    modelVersion: text("model_version"),
    promptVersion: text("prompt_version"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costCents: integer("cost_cents"),

    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    cityStateUnique: uniqueIndex("regulatory_cache_city_state_unique").on(
      table.city,
      table.state,
    ),
    expiresIdx: index("regulatory_cache_expires_idx").on(table.expiresAt),
    strLegalCheck: check(
      "regulatory_cache_str_legal_check",
      sql`${table.strLegal} IS NULL OR ${table.strLegal} IN ('yes', 'restricted', 'no', 'unclear')`,
    ),
  }),
);

export type RegulatoryCacheRow = typeof regulatoryCache.$inferSelect;
export type NewRegulatoryCacheRow = typeof regulatoryCache.$inferInsert;
