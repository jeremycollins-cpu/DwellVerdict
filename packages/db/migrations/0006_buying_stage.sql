-- 0006_buying_stage.sql
--
-- Buying-stage CRUD tables per ADR-7 scope ladder. Four entities
-- scoped to (org_id, property_id): milestones, contacts, notes,
-- budget items. Document vault is deferred until R2 is wired.
--
-- Breakpoint markers between each statement are required by
-- Drizzle's neon-http migrator (see 0002 for the full explanation).

CREATE TABLE "deal_milestones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "milestone_type" text NOT NULL,
  "title" text,
  "due_date" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "deal_milestones_type_check"
    CHECK ("milestone_type" IN ('inspection', 'financing', 'appraisal', 'closing', 'earnest_money', 'custom'))
);
--> statement-breakpoint

CREATE INDEX "deal_milestones_property_idx"
  ON "deal_milestones" ("property_id", "due_date" ASC NULLS LAST);
--> statement-breakpoint

CREATE INDEX "deal_milestones_org_idx"
  ON "deal_milestones" ("org_id");
--> statement-breakpoint

CREATE TABLE "deal_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "role" text NOT NULL,
  "name" text NOT NULL,
  "company" text,
  "email" text,
  "phone" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "deal_contacts_role_check"
    CHECK ("role" IN ('agent', 'buyers_agent', 'lender', 'inspector', 'title', 'attorney', 'appraiser', 'other'))
);
--> statement-breakpoint

CREATE INDEX "deal_contacts_property_idx"
  ON "deal_contacts" ("property_id");
--> statement-breakpoint

CREATE INDEX "deal_contacts_org_idx"
  ON "deal_contacts" ("org_id");
--> statement-breakpoint

CREATE TABLE "deal_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX "deal_notes_property_recency_idx"
  ON "deal_notes" ("property_id", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX "deal_notes_org_idx"
  ON "deal_notes" ("org_id");
--> statement-breakpoint

CREATE TABLE "deal_budget_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "category" text NOT NULL,
  "label" text NOT NULL,
  "amount_cents" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'estimated' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "deal_budget_items_category_check"
    CHECK ("category" IN ('earnest_money', 'inspection', 'appraisal', 'title', 'escrow', 'transfer_tax', 'loan_origination', 'recording', 'survey', 'insurance', 'hoa_transfer', 'other')),
  CONSTRAINT "deal_budget_items_status_check"
    CHECK ("status" IN ('estimated', 'committed', 'paid'))
);
--> statement-breakpoint

CREATE INDEX "deal_budget_items_property_idx"
  ON "deal_budget_items" ("property_id");
--> statement-breakpoint

CREATE INDEX "deal_budget_items_org_idx"
  ON "deal_budget_items" ("org_id");
