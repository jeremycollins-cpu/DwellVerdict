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
 * regulatory_cache — per-city, per-thesis regulation records
 * populated by Haiku + web_search per ADR-6 (M3.13: thesis-aware).
 *
 * One row per (city, state, thesis_dimension) — reused across every
 * property in that city evaluated under that thesis. TTL is 30
 * days; rows past expires_at should be refreshed via an Inngest
 * background job so user-facing verdicts never block on the LLM
 * call.
 *
 * Pre-M3.13 the table was STR-only and held one row per (city,
 * state). M3.13 widened it: a Roseville LTR verdict pulls a
 * different row than a Roseville STR verdict, because rent
 * control / tenant-rights questions are completely different from
 * STR-permit questions. Five thesis_dimension values map 1:1 to
 * the five investment theses with regulatory differentiation:
 * str / ltr / owner_occupied / house_hacking / flipping. (The
 * "other" thesis maps to 'str' at the orchestrator boundary —
 * STR rules are the most-comprehensive baseline.)
 *
 * Fields reflect the structured output the LLM is asked to return
 * in render_regulatory_<thesis>. STR-typed columns (str_legal,
 * permit_required, owner_occupied_only, cap_on_non_oo,
 * renewal_frequency, minimum_stay_days) are populated for
 * thesis_dimension='str' rows and NULL for the other four.
 * Thesis-specific structured fields (rent control limits for LTR,
 * HOA implications for owner_occupied, etc.) live in the flexible
 * thesis_specific_fields jsonb column — keeping the schema stable
 * while letting each thesis evolve independently.
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

    // M3.13: which investment thesis this row's research targets.
    // Drives prompt selection + which structured fields are filled.
    // Default 'str' is correct for legacy rows (table was STR-only
    // until M3.13).
    thesisDimension: text("thesis_dimension").notNull().default("str"),

    // STR-specific structured fields — populated only when
    // thesis_dimension='str'. NULL for other dimensions.
    strLegal: text("str_legal"), // 'yes' | 'restricted' | 'no' | 'unclear'
    permitRequired: text("permit_required"), // 'yes' | 'no' | 'unclear'
    ownerOccupiedOnly: text("owner_occupied_only"), // 'yes' | 'no' | 'depends' | 'unclear'
    capOnNonOwnerOccupied: text("cap_on_non_oo"), // descriptive, e.g. "3% of housing units" or null
    renewalFrequency: text("renewal_frequency"), // 'annual' | 'biennial' | 'none' | null
    minimumStayDays: integer("minimum_stay_days"), // e.g. 30 means "rentals under 30 nights prohibited"

    // M3.13: thesis-specific structured fields. Shape varies by
    // thesis_dimension — e.g., for 'ltr' includes rent_control,
    // tenant_rights_summary, eviction_friendliness, etc. The
    // application-layer Zod schemas in lookupRegulatory enforce
    // shape per dimension; the DB stores it as flexible jsonb to
    // avoid a migration each time a thesis adds a new structured
    // dimension.
    thesisSpecificFields: jsonb("thesis_specific_fields"),

    // M3.13: notable factors / wrinkles surfaced by the LLM (e.g.
    // "Roseville requires HOA written consent for any rental
    // arrangement"). String array up to 5 entries.
    notableFactors: jsonb("notable_factors")
      .notNull()
      .default(sql`'[]'::jsonb`),

    // LLM-generated prose summary (1-2 sentences) for UI display.
    summary: text("summary"),

    // Source URLs the LLM actually cited. jsonb array of strings.
    sourceUrls: jsonb("source_urls")
      .notNull()
      .default(sql`'[]'::jsonb`),

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
    cityStateDimUnique: uniqueIndex(
      "regulatory_cache_city_state_dim_unique",
    ).on(table.city, table.state, table.thesisDimension),
    expiresIdx: index("regulatory_cache_expires_idx").on(table.expiresAt),
    strLegalCheck: check(
      "regulatory_cache_str_legal_check",
      sql`${table.strLegal} IS NULL OR ${table.strLegal} IN ('yes', 'restricted', 'no', 'unclear')`,
    ),
    thesisDimensionCheck: check(
      "regulatory_cache_thesis_dimension_check",
      sql`${table.thesisDimension} IN ('str', 'ltr', 'owner_occupied', 'house_hacking', 'flipping')`,
    ),
  }),
);

/**
 * The five regulatory thesis dimensions, mirrored from
 * PROPERTY_THESIS_TYPES minus 'other' (which orchestrator code
 * maps to 'str' before calling the regulatory subsystem).
 */
export const REGULATORY_THESIS_DIMENSIONS = [
  "str",
  "ltr",
  "owner_occupied",
  "house_hacking",
  "flipping",
] as const;
export type RegulatoryThesisDimension =
  (typeof REGULATORY_THESIS_DIMENSIONS)[number];

export type RegulatoryCacheRow = typeof regulatoryCache.$inferSelect;
export type NewRegulatoryCacheRow = typeof regulatoryCache.$inferInsert;
