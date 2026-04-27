-- M3.5 keystone — property intake schema additions.
--
-- Adds 23 new columns to `properties` capturing the user-input data
-- architecture introduced in v1.8 of the master plan: thesis,
-- pricing, costs, thesis-specific assumptions, and intake state.
--
-- Columns that already exist on `properties` (bedrooms, bathrooms,
-- sqft, lot_sqft, year_built) are reused — the wizard hydrates
-- them. `purchase_price` (numeric 12,2) stays for the actual close
-- price; the new `listing_price_cents` captures the pre-close
-- asking price as integer cents (matching the cost / usage column
-- conventions elsewhere in the schema).
--
-- Backfill for the 3 known production properties (Roseville,
-- Lincoln, Kings Beach) happens at the bottom of this migration so
-- intake stays optional for them — they get a softer "add property
-- details" banner rather than the hard "complete intake" gate.

-- ─── Thesis classification ───────────────────────────────────────
ALTER TABLE "properties" ADD COLUMN "thesis_type" text;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "goal_type" text;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "thesis_other_description" text;
--> statement-breakpoint

-- ─── Pricing (cents-based integer; replaces broken Zillow scrape) ─
ALTER TABLE "properties" ADD COLUMN "listing_price_cents" integer;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "user_offer_price_cents" integer;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "estimated_value_cents" integer;
--> statement-breakpoint

-- ─── Annual carrying costs ───────────────────────────────────────
ALTER TABLE "properties" ADD COLUMN "annual_property_tax_cents" integer;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "annual_insurance_estimate_cents" integer;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "monthly_hoa_fee_cents" integer;
--> statement-breakpoint

-- ─── STR-specific (NULL for non-STR theses) ──────────────────────
ALTER TABLE "properties" ADD COLUMN "str_expected_nightly_rate_cents" integer;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "str_expected_occupancy" numeric(3,2);
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "str_cleaning_fee_cents" integer;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "str_avg_length_of_stay_days" integer;
--> statement-breakpoint

-- ─── LTR-specific (NULL for non-LTR theses) ──────────────────────
ALTER TABLE "properties" ADD COLUMN "ltr_expected_monthly_rent_cents" integer;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "ltr_vacancy_rate" numeric(3,2);
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "ltr_expected_appreciation_rate" numeric(4,3);
--> statement-breakpoint

-- ─── Financing / owner-occupied / flipping ───────────────────────
ALTER TABLE "properties" ADD COLUMN "down_payment_percent" numeric(3,2);
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "mortgage_rate" numeric(4,3);
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "mortgage_term_years" integer;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "renovation_budget_cents" integer;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "flipping_arv_estimate_cents" integer;
--> statement-breakpoint

-- ─── Intake state tracking ───────────────────────────────────────
ALTER TABLE "properties" ADD COLUMN "intake_completed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "intake_step_completed" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "intake_last_saved_at" timestamp with time zone;
--> statement-breakpoint

-- ─── Constraints ─────────────────────────────────────────────────
ALTER TABLE "properties" ADD CONSTRAINT "properties_thesis_type_check"
  CHECK ("thesis_type" IS NULL OR "thesis_type" IN (
    'str', 'ltr', 'owner_occupied', 'house_hacking', 'flipping', 'other'
  ));
--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_goal_type_check"
  CHECK ("goal_type" IS NULL OR "goal_type" IN (
    'cap_rate', 'appreciation', 'both', 'lifestyle', 'flip_profit'
  ));
--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_intake_step_check"
  CHECK ("intake_step_completed" >= 0 AND "intake_step_completed" <= 7);
--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_str_occupancy_check"
  CHECK ("str_expected_occupancy" IS NULL OR
         ("str_expected_occupancy" >= 0 AND "str_expected_occupancy" <= 1));
--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_ltr_vacancy_check"
  CHECK ("ltr_vacancy_rate" IS NULL OR
         ("ltr_vacancy_rate" >= 0 AND "ltr_vacancy_rate" <= 1));
--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_down_payment_check"
  CHECK ("down_payment_percent" IS NULL OR
         ("down_payment_percent" >= 0 AND "down_payment_percent" <= 1));
--> statement-breakpoint

-- ─── Backfill: 3 known production properties ────────────────────
-- Roseville: LTR with hybrid cap rate + appreciation goal.
UPDATE "properties"
SET "thesis_type" = 'ltr', "goal_type" = 'both'
WHERE "address_line1" ILIKE '%41 Maywood%'
  AND "city" ILIKE '%Roseville%'
  AND "thesis_type" IS NULL
  AND "deleted_at" IS NULL;
--> statement-breakpoint

-- Lincoln: owner-occupied with appreciation goal.
UPDATE "properties"
SET "thesis_type" = 'owner_occupied', "goal_type" = 'appreciation'
WHERE "address_line1" ILIKE '%207 Corte Sendero%'
  AND "city" ILIKE '%Lincoln%'
  AND "thesis_type" IS NULL
  AND "deleted_at" IS NULL;
--> statement-breakpoint

-- Kings Beach: STR with cap rate + appreciation goal.
UPDATE "properties"
SET "thesis_type" = 'str', "goal_type" = 'both'
WHERE "address_line1" ILIKE '%295 Bend%'
  AND "city" ILIKE '%Kings Beach%'
  AND "thesis_type" IS NULL
  AND "deleted_at" IS NULL;
--> statement-breakpoint

-- Mid-milestone checkpoint additions (Jeremy's call on the 2
-- previously-unknown Roseville properties): both LTR. 2112 Heritage
-- gets thesis-only; the "Add property details" soft banner will
-- prompt the goal + assumptions on next visit. 9505 Pinehurst gets
-- thesis + appreciation goal.
UPDATE "properties"
SET "thesis_type" = 'ltr'
WHERE "address_line1" ILIKE '%2112 Heritage%'
  AND "city" ILIKE '%Roseville%'
  AND "thesis_type" IS NULL
  AND "deleted_at" IS NULL;
--> statement-breakpoint

UPDATE "properties"
SET "thesis_type" = 'ltr', "goal_type" = 'appreciation'
WHERE "address_line1" ILIKE '%9505 Pinehurst%'
  AND "city" ILIKE '%Roseville%'
  AND "thesis_type" IS NULL
  AND "deleted_at" IS NULL;
