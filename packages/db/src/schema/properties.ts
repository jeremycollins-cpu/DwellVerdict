import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

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
 * Property status — the lifecycle state machine.
 *
 * TECHNICAL_SPEC.md §4 lists an abbreviated four-value set
 * (prospect | under_contract | owned | sold). CLAUDE.md defines the
 * canonical eight-state machine that drives UI routing and feature
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
 * properties — the atomic unit of the product.
 *
 * One row per real-world property, persistent across all five lifecycle
 * stages (finding → evaluating → buying → renovating → managing). This
 * row is never replaced: the user's first free report becomes their
 * underwrite becomes their operating dashboard. Stage-specific data
 * lives in sibling tables (offers, deal_milestones, renovation_projects,
 * property_actuals).
 *
 * Columns mirror TECHNICAL_SPEC.md §4 verbatim. Several are unused in
 * Phase 0 (close_date, purchase_price, parcel_id) but are locked in now
 * because M2's purpose is to freeze the schema across all five stages.
 */
export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Address — line1/city/state/zip required to identify a US property.
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    zip: text("zip").notNull(),
    county: text("county"),

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

    // Lifecycle + transaction state. Defaults to `prospect` — the state
    // every property enters when first pasted into a report.
    status: text("status").notNull().default("prospect"),
    purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
    closeDate: date("close_date"),

    // Provenance — where the listing data came from, and the raw payload.
    sourceUrl: text("source_url"),
    listingData: jsonb("listing_data"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgIdIdx: index("properties_org_id_idx").on(table.orgId),
    // TECHNICAL_SPEC.md §4 calls for a gist index on (lat, lng) for
    // radius queries. That requires a PostGIS geography column, which
    // we don't set up until regulatory_jurisdictions lands. Using a
    // btree compound index for now; upgrade when location filters ship.
    latLngIdx: index("properties_lat_lng_idx").on(table.lat, table.lng),
    cityStateIdx: index("properties_city_state_idx").on(table.city, table.state),
    parcelIdIdx: index("properties_parcel_id_idx").on(table.parcelId),
    statusIdx: index("properties_status_idx").on(table.status),
  }),
);

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
