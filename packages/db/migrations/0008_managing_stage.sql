-- 0008_managing_stage.sql
--
-- Managing-stage tables per ADR-7: reservations + expenses.
-- Powers the actuals dashboard + Schedule E tax summary for
-- the "I already own this property" entry point.
--
-- Breakpoint markers between each statement required by Drizzle's
-- neon-http migrator (see 0002 for the explanation).

CREATE TABLE "property_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "source" text NOT NULL,
  "external_id" text,
  "guest_name" text,
  "check_in" timestamp with time zone NOT NULL,
  "check_out" timestamp with time zone NOT NULL,
  "nights" integer NOT NULL,
  "gross_revenue_cents" integer DEFAULT 0 NOT NULL,
  "cleaning_fee_cents" integer DEFAULT 0 NOT NULL,
  "service_fee_cents" integer DEFAULT 0 NOT NULL,
  "taxes_cents" integer DEFAULT 0 NOT NULL,
  "net_cents" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'confirmed' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "property_reservations_source_check"
    CHECK ("source" IN ('airbnb', 'hospitable', 'guesty', 'hostaway', 'vrbo', 'manual')),
  CONSTRAINT "property_reservations_status_check"
    CHECK ("status" IN ('confirmed', 'canceled', 'blocked', 'completed')),
  CONSTRAINT "property_reservations_nights_positive"
    CHECK ("nights" >= 1),
  CONSTRAINT "property_reservations_date_order"
    CHECK ("check_out" > "check_in")
);
--> statement-breakpoint

CREATE INDEX "property_reservations_property_checkin_idx"
  ON "property_reservations" ("property_id", "check_in" DESC);
--> statement-breakpoint

CREATE INDEX "property_reservations_org_idx"
  ON "property_reservations" ("org_id");
--> statement-breakpoint

-- Partial unique index: only enforced when external_id is not null,
-- so CSV re-imports dedupe on (property, source, external_id).
CREATE UNIQUE INDEX "property_reservations_external_dedupe_idx"
  ON "property_reservations" ("property_id", "source", "external_id")
  WHERE "external_id" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE "property_expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "incurred_at" timestamp with time zone NOT NULL,
  "category" text NOT NULL,
  "label" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "vendor" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "property_expenses_category_check"
    CHECK ("category" IN ('advertising', 'auto_travel', 'cleaning_maintenance', 'commissions', 'insurance', 'legal_professional', 'management_fees', 'mortgage_interest', 'other_interest', 'repairs', 'supplies', 'taxes', 'utilities', 'depreciation', 'other'))
);
--> statement-breakpoint

CREATE INDEX "property_expenses_property_incurred_idx"
  ON "property_expenses" ("property_id", "incurred_at" DESC);
--> statement-breakpoint

CREATE INDEX "property_expenses_org_idx"
  ON "property_expenses" ("org_id");
