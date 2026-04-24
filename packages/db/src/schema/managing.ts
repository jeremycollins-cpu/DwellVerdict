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
import { properties } from "./properties";
import { users } from "./users";

/**
 * Managing-stage tables per ADR-7. Two entities scoped to
 * (org_id, property_id):
 *
 *   - property_reservations — normalized bookings from CSV
 *     imports (Airbnb / Hospitable / Guesty / Hostaway / manual).
 *   - property_expenses     — categorized by Schedule E lines
 *     for tax-ready annual summary.
 *
 * Reservations + expenses together power the actuals dashboard,
 * actuals-vs-forecast reconciliation, and the Schedule E tax
 * summary — the three core jobs of the Managing surface per
 * ADR-7's solo-to-small-operator persona.
 */

// ---- Reservations -----------------------------------------------

export const RESERVATION_SOURCES = [
  "airbnb",
  "hospitable",
  "guesty",
  "hostaway",
  "vrbo",
  "manual",
] as const;
export type ReservationSource = (typeof RESERVATION_SOURCES)[number];

export const RESERVATION_STATUSES = [
  "confirmed",
  "canceled",
  "blocked",
  "completed",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const propertyReservations = pgTable(
  "property_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    source: text("source").notNull(),
    /** External reservation code from the PMS (e.g., Airbnb
     * "HMJDXYZ..."). Lets us dedupe on re-import without losing
     * local edits. Nullable for manual entries. */
    externalId: text("external_id"),

    guestName: text("guest_name"),
    checkIn: timestamp("check_in", { withTimezone: true, mode: "date" }).notNull(),
    checkOut: timestamp("check_out", { withTimezone: true, mode: "date" }).notNull(),
    nights: integer("nights").notNull(),

    // Money in cents. Gross = what the guest paid total; the next
    // four are deductions / costs. Net = what landed in the host's
    // account after the PMS took its cut.
    grossRevenueCents: integer("gross_revenue_cents").notNull().default(0),
    cleaningFeeCents: integer("cleaning_fee_cents").notNull().default(0),
    serviceFeeCents: integer("service_fee_cents").notNull().default(0),
    taxesCents: integer("taxes_cents").notNull().default(0),
    netCents: integer("net_cents").notNull().default(0),

    status: text("status").notNull().default("confirmed"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    propertyCheckInIdx: index("property_reservations_property_checkin_idx").on(
      table.propertyId,
      sql`${table.checkIn} DESC`,
    ),
    orgIdx: index("property_reservations_org_idx").on(table.orgId),
    // Dedupe key for CSV re-imports: (property_id, source, external_id).
    // external_id is nullable so we can't make this a full unique
    // constraint, but we can enforce it where external_id IS NOT NULL.
    externalDedupeIdx: uniqueIndex(
      "property_reservations_external_dedupe_idx",
    )
      .on(table.propertyId, table.source, table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),

    sourceCheck: check(
      "property_reservations_source_check",
      sql`${table.source} IN ('airbnb', 'hospitable', 'guesty', 'hostaway', 'vrbo', 'manual')`,
    ),
    statusCheck: check(
      "property_reservations_status_check",
      sql`${table.status} IN ('confirmed', 'canceled', 'blocked', 'completed')`,
    ),
    nightsPositive: check(
      "property_reservations_nights_positive",
      sql`${table.nights} >= 1`,
    ),
    dateOrder: check(
      "property_reservations_date_order",
      sql`${table.checkOut} > ${table.checkIn}`,
    ),
  }),
);

// ---- Expenses ---------------------------------------------------

/**
 * Schedule E (Form 1040) line categories for rental property
 * expenses. Names match the IRS terminology; the UI shows user-
 * friendly labels.
 */
export const EXPENSE_CATEGORIES = [
  "advertising",
  "auto_travel",
  "cleaning_maintenance",
  "commissions",
  "insurance",
  "legal_professional",
  "management_fees",
  "mortgage_interest",
  "other_interest",
  "repairs",
  "supplies",
  "taxes",
  "utilities",
  "depreciation",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const propertyExpenses = pgTable(
  "property_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    incurredAt: timestamp("incurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    category: text("category").notNull(),
    label: text("label").notNull(),
    amountCents: integer("amount_cents").notNull(),
    vendor: text("vendor"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    propertyIncurredIdx: index("property_expenses_property_incurred_idx").on(
      table.propertyId,
      sql`${table.incurredAt} DESC`,
    ),
    orgIdx: index("property_expenses_org_idx").on(table.orgId),
    categoryCheck: check(
      "property_expenses_category_check",
      sql`${table.category} IN ('advertising', 'auto_travel', 'cleaning_maintenance', 'commissions', 'insurance', 'legal_professional', 'management_fees', 'mortgage_interest', 'other_interest', 'repairs', 'supplies', 'taxes', 'utilities', 'depreciation', 'other')`,
    ),
  }),
);

export type PropertyReservation = typeof propertyReservations.$inferSelect;
export type NewPropertyReservation = typeof propertyReservations.$inferInsert;
export type PropertyExpense = typeof propertyExpenses.$inferSelect;
export type NewPropertyExpense = typeof propertyExpenses.$inferInsert;
