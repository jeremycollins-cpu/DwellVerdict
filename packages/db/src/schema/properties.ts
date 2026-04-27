import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Property types — aligned with Zillow/Redfin listing vocabularies.
 *
 * TECHNICAL_SPEC.md §4 enumerates the four Phase 1 values. Kept as text in
 * the database so new types (e.g. `manufactured`, `land`) can be added
 * without a migration.
 */
export const PROPERTY_TYPES = [
  "single_family",
  "townhouse",
  "condo",
  "multi_family",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/**
 * Property status — the fine-grained state machine.
 *
 * TECHNICAL_SPEC.md §4 lists an abbreviated four-value set
 * (prospect | under_contract | owned | sold). CLAUDE.md defines the
 * canonical eight-state machine that drives business logic and feature
 * gating; this is the superset and the value actually enforced.
 * Transitions are logged in property_stages.
 */
export const PROPERTY_STATUSES = [
  "prospect",
  "shortlisted",
  "underwriting",
  "under_contract",
  "closing",
  "owned_pre_launch",
  "owned_operating",
  "sold",
] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

/**
 * Lifecycle stage — the coarse five-bucket grouping from CLAUDE.md.
 *
 * UI routes by current_stage (which tab/dashboard to show). Business
 * logic reads status (exactly which step within the stage). Keeping
 * both denormalized avoids scattering status→stage mappings across
 * every route handler and navigation component.
 *
 * Status → stage mapping (enforced at write time in application code):
 *   prospect, shortlisted          → finding
 *   underwriting                   → evaluating
 *   under_contract, closing        → buying
 *   owned_pre_launch               → renovating
 *   owned_operating, sold          → managing
 */
export const PROPERTY_LIFECYCLE_STAGES = [
  "finding",
  "evaluating",
  "buying",
  "renovating",
  "managing",
] as const;
export type PropertyLifecycleStage = (typeof PROPERTY_LIFECYCLE_STAGES)[number];

/**
 * Thesis classification — what the user plans to do with the property.
 * Drives thesis-aware scoring in M3.8 and the conditional intake fields
 * captured in step 6 of the M3.5 wizard. Source of truth for both the
 * Zod validator in `apps/web/lib/onboarding/schema.ts` and the CHECK
 * constraint enforced below.
 */
export const PROPERTY_THESIS_TYPES = [
  "str",
  "ltr",
  "owner_occupied",
  "house_hacking",
  "flipping",
  "other",
] as const;
export type PropertyThesisType = (typeof PROPERTY_THESIS_TYPES)[number];

/**
 * Goal classification — what the user is optimizing for. Allowed
 * combinations with thesis are enforced in the application layer
 * (VALID_GOALS_PER_THESIS in onboarding/schema.ts) rather than the
 * database, because cross-column CHECK constraints get noisy fast.
 */
export const PROPERTY_GOAL_TYPES = [
  "cap_rate",
  "appreciation",
  "both",
  "lifestyle",
  "flip_profit",
] as const;
export type PropertyGoalType = (typeof PROPERTY_GOAL_TYPES)[number];

/**
 * properties — the atomic unit of the product.
 *
 * One row per real-world property, persistent across all five lifecycle
 * stages (finding → evaluating → buying → renovating → managing). This
 * row is never replaced: the user's first free report becomes their
 * underwrite becomes their operating dashboard. Stage-specific data
 * lives in sibling tables (offers, deal_milestones, renovation_projects,
 * property_actuals).
 *
 * Columns mirror TECHNICAL_SPEC.md §4. Several are unused in Phase 0
 * (close_date, purchase_price, parcel_id) but are locked in now because
 * M2's purpose is to freeze the schema across all five stages.
 */
export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Audit — which team member pasted the address. Set null on user
    // deletion so the property row survives; the org still owns it.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // Address — line1/city/state/zip required to identify a US property.
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    zip: text("zip").notNull(),
    county: text("county"),

    // Canonical address key for dedupe. Populated at write time by a
    // normalizer (lowercased, whitespace-collapsed, abbreviations
    // expanded, unit format unified). The (org_id, normalized_address)
    // unique index below prevents silent duplicate creation when users
    // paste the same property with inconsistent formatting.
    normalizedAddress: text("normalized_address").notNull(),

    // Google Place ID — stable, globally unique identifier from Google
    // Places API. When the user selects an address from the autocomplete
    // dropdown we capture this and use it as the preferred dedupe key
    // (more reliable than string normalization). Nullable because manual
    // property creation without Google autocomplete is still supported.
    googlePlaceId: text("google_place_id"),

    // Full formatted address as returned by Google (e.g. "123 Main St,
    // Nashville, TN 37201, USA"). Keeps the display string canonical
    // even if our line1/city/state parsing drops nuance.
    addressFull: text("address_full"),

    // Coordinates — numeric(10,7) gives ~11mm precision, matches spec.
    lat: numeric("lat", { precision: 10, scale: 7 }),
    lng: numeric("lng", { precision: 10, scale: 7 }),

    // Public records + listing attributes.
    parcelId: text("parcel_id"),
    propertyType: text("property_type"),
    bedrooms: integer("bedrooms"),
    bathrooms: numeric("bathrooms", { precision: 3, scale: 1 }),
    sqft: integer("sqft"),
    lotSqft: integer("lot_sqft"),
    yearBuilt: integer("year_built"),

    // Lifecycle + transaction state. `status` is the fine-grained 8-state
    // machine; `current_stage` is the 5-bucket UI grouping. Both default
    // to the entry state every new prospect enters.
    status: text("status").notNull().default("prospect"),
    currentStage: text("current_stage").notNull().default("finding"),
    purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
    closeDate: date("close_date"),

    // Provenance — where the listing data came from, and the raw payload.
    sourceUrl: text("source_url"),
    listingData: jsonb("listing_data"),

    // ─── M3.5 property intake — user-input data architecture ───
    // The columns below are the v1.8 keystone: replacing broken
    // Zillow/Redfin/FEMA fetchers with user-verified inputs. All
    // populated through the 7-step wizard at /app/properties/[id]/
    // intake. M3.6 wires these into verdict generation; M3.8 makes
    // scoring thesis-aware; M3.9 lets users adjust them in what-ifs.
    thesisType: text("thesis_type"),
    goalType: text("goal_type"),
    thesisOtherDescription: text("thesis_other_description"),

    // Pricing. `purchase_price` (above) is what the user actually paid
    // at close; these three are pre-close inputs the user enters from
    // listings and Zestimates. Stored in cents to match the
    // user_report_usage and ai_usage_events conventions.
    listingPriceCents: integer("listing_price_cents"),
    userOfferPriceCents: integer("user_offer_price_cents"),
    estimatedValueCents: integer("estimated_value_cents"),

    // Annual carrying costs.
    annualPropertyTaxCents: integer("annual_property_tax_cents"),
    annualInsuranceEstimateCents: integer("annual_insurance_estimate_cents"),
    monthlyHoaFeeCents: integer("monthly_hoa_fee_cents"),

    // STR-specific (populated when thesis_type = 'str').
    strExpectedNightlyRateCents: integer("str_expected_nightly_rate_cents"),
    strExpectedOccupancy: numeric("str_expected_occupancy", {
      precision: 3,
      scale: 2,
    }),
    strCleaningFeeCents: integer("str_cleaning_fee_cents"),
    strAvgLengthOfStayDays: integer("str_avg_length_of_stay_days"),

    // LTR-specific (populated when thesis_type = 'ltr').
    ltrExpectedMonthlyRentCents: integer("ltr_expected_monthly_rent_cents"),
    ltrVacancyRate: numeric("ltr_vacancy_rate", { precision: 3, scale: 2 }),
    ltrExpectedAppreciationRate: numeric("ltr_expected_appreciation_rate", {
      precision: 4,
      scale: 3,
    }),

    // Financing / owner-occupied / flipping fields.
    downPaymentPercent: numeric("down_payment_percent", {
      precision: 3,
      scale: 2,
    }),
    mortgageRate: numeric("mortgage_rate", { precision: 4, scale: 3 }),
    mortgageTermYears: integer("mortgage_term_years"),
    renovationBudgetCents: integer("renovation_budget_cents"),
    flippingArvEstimateCents: integer("flipping_arv_estimate_cents"),

    // Intake state tracking. `intake_completed_at` is the canonical
    // "intake done" flag — non-null means the user finished step 7.
    // `intake_step_completed` tracks furthest step reached (0..7) so
    // the wizard can resume. `intake_last_saved_at` exists so the UI
    // can show "saved 3m ago" without a separate audit table.
    intakeCompletedAt: timestamp("intake_completed_at", {
      withTimezone: true,
    }),
    intakeStepCompleted: integer("intake_step_completed").notNull().default(0),
    intakeLastSavedAt: timestamp("intake_last_saved_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgIdIdx: index("properties_org_id_idx").on(table.orgId),
    createdByUserIdx: index("properties_created_by_user_idx").on(table.createdByUserId),
    // Dedupe guard: an org can't have two properties with the same
    // normalized address. App layer computes normalized_address before
    // insert; this index catches races and buggy callers.
    orgNormalizedAddressUnique: uniqueIndex("properties_org_normalized_address_unique").on(
      table.orgId,
      table.normalizedAddress,
    ),
    // TECHNICAL_SPEC.md §4 calls for a gist index on (lat, lng) for
    // radius queries. That requires a PostGIS geography column, which
    // we don't set up until regulatory_jurisdictions lands. Using a
    // btree compound index for now; upgrade when location filters ship.
    latLngIdx: index("properties_lat_lng_idx").on(table.lat, table.lng),
    cityStateIdx: index("properties_city_state_idx").on(table.city, table.state),
    parcelIdIdx: index("properties_parcel_id_idx").on(table.parcelId),
    // Per-org dedupe on Google Place ID (two orgs can independently
    // research the same house). Partial index so manual rows without a
    // Place ID don't collide with each other.
    orgGooglePlaceIdUnique: uniqueIndex("properties_org_google_place_id_unique")
      .on(table.orgId, table.googlePlaceId)
      .where(sql`${table.googlePlaceId} IS NOT NULL`),
    propertyTypeIdx: index("properties_property_type_idx").on(table.propertyType),
    statusIdx: index("properties_status_idx").on(table.status),
    currentStageIdx: index("properties_current_stage_idx").on(table.currentStage),
    statusCheck: check(
      "properties_status_check",
      sql`${table.status} IN (
        'prospect',
        'shortlisted',
        'underwriting',
        'under_contract',
        'closing',
        'owned_pre_launch',
        'owned_operating',
        'sold'
      )`,
    ),
    currentStageCheck: check(
      "properties_current_stage_check",
      sql`${table.currentStage} IN (
        'finding',
        'evaluating',
        'buying',
        'renovating',
        'managing'
      )`,
    ),
    thesisTypeCheck: check(
      "properties_thesis_type_check",
      sql`${table.thesisType} IS NULL OR ${table.thesisType} IN (
        'str',
        'ltr',
        'owner_occupied',
        'house_hacking',
        'flipping',
        'other'
      )`,
    ),
    goalTypeCheck: check(
      "properties_goal_type_check",
      sql`${table.goalType} IS NULL OR ${table.goalType} IN (
        'cap_rate',
        'appreciation',
        'both',
        'lifestyle',
        'flip_profit'
      )`,
    ),
    intakeStepCheck: check(
      "properties_intake_step_check",
      sql`${table.intakeStepCompleted} >= 0 AND ${table.intakeStepCompleted} <= 7`,
    ),
    strOccupancyCheck: check(
      "properties_str_occupancy_check",
      sql`${table.strExpectedOccupancy} IS NULL OR (${table.strExpectedOccupancy} >= 0 AND ${table.strExpectedOccupancy} <= 1)`,
    ),
    ltrVacancyCheck: check(
      "properties_ltr_vacancy_check",
      sql`${table.ltrVacancyRate} IS NULL OR (${table.ltrVacancyRate} >= 0 AND ${table.ltrVacancyRate} <= 1)`,
    ),
    downPaymentCheck: check(
      "properties_down_payment_check",
      sql`${table.downPaymentPercent} IS NULL OR (${table.downPaymentPercent} >= 0 AND ${table.downPaymentPercent} <= 1)`,
    ),
  }),
);

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
