-- 0007_renovating_stage.sql
--
-- Renovating-stage CRUD tables per ADR-7 scope ladder. Four
-- entities scoped to (org_id, property_id): scope_items, tasks,
-- contractors, quotes.
--
-- Breakpoint markers between each statement required by Drizzle's
-- neon-http migrator (see 0002 for the explanation).

CREATE TABLE "renovation_scope_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "category" text NOT NULL,
  "label" text NOT NULL,
  "budgeted_cents" integer DEFAULT 0 NOT NULL,
  "committed_cents" integer DEFAULT 0 NOT NULL,
  "spent_cents" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'planning' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "renovation_scope_items_category_check"
    CHECK ("category" IN ('kitchen', 'bathroom', 'exterior', 'flooring', 'electrical', 'plumbing', 'hvac', 'painting', 'landscaping', 'roofing', 'structural', 'appliances', 'furnishings', 'other')),
  CONSTRAINT "renovation_scope_items_status_check"
    CHECK ("status" IN ('planning', 'in_progress', 'complete', 'deferred')),
  CONSTRAINT "renovation_scope_items_amounts_non_negative"
    CHECK ("budgeted_cents" >= 0 AND "committed_cents" >= 0 AND "spent_cents" >= 0)
);
--> statement-breakpoint

CREATE INDEX "renovation_scope_items_property_idx"
  ON "renovation_scope_items" ("property_id");
--> statement-breakpoint

CREATE INDEX "renovation_scope_items_org_idx"
  ON "renovation_scope_items" ("org_id");
--> statement-breakpoint

CREATE TABLE "renovation_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "scope_item_id" uuid REFERENCES "renovation_scope_items"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "due_date" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX "renovation_tasks_property_idx"
  ON "renovation_tasks" ("property_id", "due_date" ASC NULLS LAST);
--> statement-breakpoint

CREATE INDEX "renovation_tasks_org_idx"
  ON "renovation_tasks" ("org_id");
--> statement-breakpoint

CREATE INDEX "renovation_tasks_scope_item_idx"
  ON "renovation_tasks" ("scope_item_id");
--> statement-breakpoint

CREATE TABLE "renovation_contractors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "trade" text NOT NULL,
  "name" text NOT NULL,
  "company" text,
  "email" text,
  "phone" text,
  "license_number" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "renovation_contractors_trade_check"
    CHECK ("trade" IN ('general', 'electrical', 'plumbing', 'hvac', 'framing', 'roofing', 'painting', 'flooring', 'landscaping', 'tile', 'drywall', 'cabinets', 'appliances', 'pool', 'other'))
);
--> statement-breakpoint

CREATE INDEX "renovation_contractors_property_idx"
  ON "renovation_contractors" ("property_id");
--> statement-breakpoint

CREATE INDEX "renovation_contractors_org_idx"
  ON "renovation_contractors" ("org_id");
--> statement-breakpoint

CREATE TABLE "renovation_quotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "contractor_id" uuid REFERENCES "renovation_contractors"("id") ON DELETE SET NULL,
  "scope_item_id" uuid REFERENCES "renovation_scope_items"("id") ON DELETE SET NULL,
  "label" text NOT NULL,
  "amount_cents" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "renovation_quotes_status_check"
    CHECK ("status" IN ('pending', 'accepted', 'rejected', 'expired')),
  CONSTRAINT "renovation_quotes_amount_non_negative"
    CHECK ("amount_cents" >= 0)
);
--> statement-breakpoint

CREATE INDEX "renovation_quotes_property_idx"
  ON "renovation_quotes" ("property_id");
--> statement-breakpoint

CREATE INDEX "renovation_quotes_org_idx"
  ON "renovation_quotes" ("org_id");
--> statement-breakpoint

CREATE INDEX "renovation_quotes_contractor_idx"
  ON "renovation_quotes" ("contractor_id");
--> statement-breakpoint

CREATE INDEX "renovation_quotes_scope_item_idx"
  ON "renovation_quotes" ("scope_item_id");
