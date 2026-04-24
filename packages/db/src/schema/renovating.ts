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
 * Renovating-stage CRUD per ADR-7 scope ladder.
 *
 * Four entities scoped to (org_id, property_id):
 *   - renovation_scope_items  — the list of things being renovated
 *                               with budgeted / committed / spent
 *                               amounts per item.
 *   - renovation_tasks        — checklist items (optionally tied
 *                               to a scope item).
 *   - renovation_contractors  — people on the project.
 *   - renovation_quotes       — dollar commitments (optionally
 *                               tied to a contractor + scope item).
 *
 * Receipt / photo upload deferred until R2 is wired (same blocker
 * as Buying's document vault).
 */

// ---- Scope items ------------------------------------------------

export const RENOVATION_SCOPE_CATEGORIES = [
  "kitchen",
  "bathroom",
  "exterior",
  "flooring",
  "electrical",
  "plumbing",
  "hvac",
  "painting",
  "landscaping",
  "roofing",
  "structural",
  "appliances",
  "furnishings",
  "other",
] as const;
export type RenovationScopeCategory =
  (typeof RENOVATION_SCOPE_CATEGORIES)[number];

export const RENOVATION_SCOPE_STATUSES = [
  "planning",
  "in_progress",
  "complete",
  "deferred",
] as const;
export type RenovationScopeStatus = (typeof RENOVATION_SCOPE_STATUSES)[number];

export const renovationScopeItems = pgTable(
  "renovation_scope_items",
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

    category: text("category").notNull(),
    label: text("label").notNull(),
    // Three money buckets per scope item — always cents to avoid
    // float quirks.
    budgetedCents: integer("budgeted_cents").notNull().default(0),
    committedCents: integer("committed_cents").notNull().default(0),
    spentCents: integer("spent_cents").notNull().default(0),
    status: text("status").notNull().default("planning"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    propertyIdx: index("renovation_scope_items_property_idx").on(
      table.propertyId,
    ),
    orgIdx: index("renovation_scope_items_org_idx").on(table.orgId),
    categoryCheck: check(
      "renovation_scope_items_category_check",
      sql`${table.category} IN ('kitchen', 'bathroom', 'exterior', 'flooring', 'electrical', 'plumbing', 'hvac', 'painting', 'landscaping', 'roofing', 'structural', 'appliances', 'furnishings', 'other')`,
    ),
    statusCheck: check(
      "renovation_scope_items_status_check",
      sql`${table.status} IN ('planning', 'in_progress', 'complete', 'deferred')`,
    ),
    amountsNonNegative: check(
      "renovation_scope_items_amounts_non_negative",
      sql`${table.budgetedCents} >= 0 AND ${table.committedCents} >= 0 AND ${table.spentCents} >= 0`,
    ),
  }),
);

// ---- Tasks ------------------------------------------------------

export const renovationTasks = pgTable(
  "renovation_tasks",
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
    scopeItemId: uuid("scope_item_id").references(
      () => renovationScopeItems.id,
      { onDelete: "set null" },
    ),

    title: text("title").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    propertyIdx: index("renovation_tasks_property_idx").on(
      table.propertyId,
      sql`${table.dueDate} ASC NULLS LAST`,
    ),
    orgIdx: index("renovation_tasks_org_idx").on(table.orgId),
    scopeItemIdx: index("renovation_tasks_scope_item_idx").on(
      table.scopeItemId,
    ),
  }),
);

// ---- Contractors ------------------------------------------------

export const RENOVATION_TRADES = [
  "general",
  "electrical",
  "plumbing",
  "hvac",
  "framing",
  "roofing",
  "painting",
  "flooring",
  "landscaping",
  "tile",
  "drywall",
  "cabinets",
  "appliances",
  "pool",
  "other",
] as const;
export type RenovationTrade = (typeof RENOVATION_TRADES)[number];

export const renovationContractors = pgTable(
  "renovation_contractors",
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

    trade: text("trade").notNull(),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    licenseNumber: text("license_number"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    propertyIdx: index("renovation_contractors_property_idx").on(
      table.propertyId,
    ),
    orgIdx: index("renovation_contractors_org_idx").on(table.orgId),
    tradeCheck: check(
      "renovation_contractors_trade_check",
      sql`${table.trade} IN ('general', 'electrical', 'plumbing', 'hvac', 'framing', 'roofing', 'painting', 'flooring', 'landscaping', 'tile', 'drywall', 'cabinets', 'appliances', 'pool', 'other')`,
    ),
  }),
);

// ---- Quotes -----------------------------------------------------

export const RENOVATION_QUOTE_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "expired",
] as const;
export type RenovationQuoteStatus = (typeof RENOVATION_QUOTE_STATUSES)[number];

export const renovationQuotes = pgTable(
  "renovation_quotes",
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
    contractorId: uuid("contractor_id").references(
      () => renovationContractors.id,
      { onDelete: "set null" },
    ),
    scopeItemId: uuid("scope_item_id").references(
      () => renovationScopeItems.id,
      { onDelete: "set null" },
    ),

    label: text("label").notNull(),
    amountCents: integer("amount_cents").notNull().default(0),
    status: text("status").notNull().default("pending"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    propertyIdx: index("renovation_quotes_property_idx").on(table.propertyId),
    orgIdx: index("renovation_quotes_org_idx").on(table.orgId),
    contractorIdx: index("renovation_quotes_contractor_idx").on(
      table.contractorId,
    ),
    scopeItemIdx: index("renovation_quotes_scope_item_idx").on(
      table.scopeItemId,
    ),
    statusCheck: check(
      "renovation_quotes_status_check",
      sql`${table.status} IN ('pending', 'accepted', 'rejected', 'expired')`,
    ),
    amountNonNegative: check(
      "renovation_quotes_amount_non_negative",
      sql`${table.amountCents} >= 0`,
    ),
  }),
);

export type RenovationScopeItem = typeof renovationScopeItems.$inferSelect;
export type NewRenovationScopeItem = typeof renovationScopeItems.$inferInsert;
export type RenovationTask = typeof renovationTasks.$inferSelect;
export type NewRenovationTask = typeof renovationTasks.$inferInsert;
export type RenovationContractor = typeof renovationContractors.$inferSelect;
export type NewRenovationContractor =
  typeof renovationContractors.$inferInsert;
export type RenovationQuote = typeof renovationQuotes.$inferSelect;
export type NewRenovationQuote = typeof renovationQuotes.$inferInsert;
