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
 * Buying-stage CRUD tables per ADR-7 scope ladder.
 *
 * Four entities scoped to (org_id, property_id):
 *   - deal_milestones    — key deadlines (inspection, financing, etc.)
 *   - deal_contacts      — people involved (agent, lender, inspector…)
 *   - deal_notes         — append-only timeline entries
 *   - deal_budget_items  — closing-cost line items
 *
 * File upload (document vault) is deferred until R2 is wired.
 * v0 dogfooding path: users paste Drive/DocuSign links in notes.
 */

// ---- Milestones -------------------------------------------------

export const DEAL_MILESTONE_TYPES = [
  "inspection",
  "financing",
  "appraisal",
  "closing",
  "earnest_money",
  "custom",
] as const;
export type DealMilestoneType = (typeof DEAL_MILESTONE_TYPES)[number];

export const dealMilestones = pgTable(
  "deal_milestones",
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

    milestoneType: text("milestone_type").notNull(),
    // Custom title overrides the default human-readable label for the
    // `custom` type. For standard types we derive the label in UI.
    title: text("title"),
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
    propertyIdx: index("deal_milestones_property_idx").on(
      table.propertyId,
      sql`${table.dueDate} ASC NULLS LAST`,
    ),
    orgIdx: index("deal_milestones_org_idx").on(table.orgId),
    typeCheck: check(
      "deal_milestones_type_check",
      sql`${table.milestoneType} IN ('inspection', 'financing', 'appraisal', 'closing', 'earnest_money', 'custom')`,
    ),
  }),
);

// ---- Contacts ---------------------------------------------------

export const DEAL_CONTACT_ROLES = [
  "agent",
  "buyers_agent",
  "lender",
  "inspector",
  "title",
  "attorney",
  "appraiser",
  "other",
] as const;
export type DealContactRole = (typeof DEAL_CONTACT_ROLES)[number];

export const dealContacts = pgTable(
  "deal_contacts",
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

    role: text("role").notNull(),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    propertyIdx: index("deal_contacts_property_idx").on(table.propertyId),
    orgIdx: index("deal_contacts_org_idx").on(table.orgId),
    roleCheck: check(
      "deal_contacts_role_check",
      sql`${table.role} IN ('agent', 'buyers_agent', 'lender', 'inspector', 'title', 'attorney', 'appraiser', 'other')`,
    ),
  }),
);

// ---- Notes ------------------------------------------------------

export const dealNotes = pgTable(
  "deal_notes",
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

    // Append-only — no updated_at. Correction path is delete + re-add.
    body: text("body").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    propertyRecencyIdx: index("deal_notes_property_recency_idx").on(
      table.propertyId,
      sql`${table.createdAt} DESC`,
    ),
    orgIdx: index("deal_notes_org_idx").on(table.orgId),
  }),
);

// ---- Budget -----------------------------------------------------

export const DEAL_BUDGET_CATEGORIES = [
  "earnest_money",
  "inspection",
  "appraisal",
  "title",
  "escrow",
  "transfer_tax",
  "loan_origination",
  "recording",
  "survey",
  "insurance",
  "hoa_transfer",
  "other",
] as const;
export type DealBudgetCategory = (typeof DEAL_BUDGET_CATEGORIES)[number];

export const DEAL_BUDGET_STATUSES = ["estimated", "committed", "paid"] as const;
export type DealBudgetStatus = (typeof DEAL_BUDGET_STATUSES)[number];

export const dealBudgetItems = pgTable(
  "deal_budget_items",
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
    // Money in cents to avoid float quirks. UI formats to USD.
    amountCents: integer("amount_cents").notNull().default(0),
    status: text("status").notNull().default("estimated"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    propertyIdx: index("deal_budget_items_property_idx").on(table.propertyId),
    orgIdx: index("deal_budget_items_org_idx").on(table.orgId),
    categoryCheck: check(
      "deal_budget_items_category_check",
      sql`${table.category} IN ('earnest_money', 'inspection', 'appraisal', 'title', 'escrow', 'transfer_tax', 'loan_origination', 'recording', 'survey', 'insurance', 'hoa_transfer', 'other')`,
    ),
    statusCheck: check(
      "deal_budget_items_status_check",
      sql`${table.status} IN ('estimated', 'committed', 'paid')`,
    ),
  }),
);

export type DealMilestone = typeof dealMilestones.$inferSelect;
export type NewDealMilestone = typeof dealMilestones.$inferInsert;
export type DealContact = typeof dealContacts.$inferSelect;
export type NewDealContact = typeof dealContacts.$inferInsert;
export type DealNote = typeof dealNotes.$inferSelect;
export type NewDealNote = typeof dealNotes.$inferInsert;
export type DealBudgetItem = typeof dealBudgetItems.$inferSelect;
export type NewDealBudgetItem = typeof dealBudgetItems.$inferInsert;
