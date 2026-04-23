-- 0002_pricing_pivot.sql
--
-- Pricing pivot per ADR-5 / ADR-7 / ADR-8:
--   * Collapse plans to free | starter | pro | canceled
--   * Organizations default to 'free' (was 'starter')
--   * Add Stripe subscription tracking columns
--   * Rename user_verdict_limits -> user_report_usage and broaden
--     its scope to cover lifetime free-trial + report counter +
--     Scout chat rate limits (per ADR-8)
--
-- Hand-written migration (not drizzle-kit generated) so the table
-- rename is an explicit RENAME rather than a DROP+CREATE. Existing
-- dev rows (4 verdicts + ~1 user_verdict_limits row) survive.

-- ----------------------------------------------------------------
-- organizations: plan enum update
-- ----------------------------------------------------------------

-- Backfill any legacy 'portfolio' values (shouldn't exist in dev,
-- safe no-op in that case).
UPDATE "organizations" SET "plan" = 'canceled' WHERE "plan" = 'portfolio';

ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_plan_check";
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_plan_check"
  CHECK ("plan" IN ('free', 'starter', 'pro', 'canceled'));

ALTER TABLE "organizations" ALTER COLUMN "plan" SET DEFAULT 'free';

-- ----------------------------------------------------------------
-- organizations: Stripe subscription tracking columns
-- ----------------------------------------------------------------

ALTER TABLE "organizations" ADD COLUMN "stripe_subscription_id" text;
ALTER TABLE "organizations" ADD COLUMN "stripe_period_start" timestamp with time zone;
ALTER TABLE "organizations" ADD COLUMN "stripe_period_end" timestamp with time zone;

CREATE UNIQUE INDEX "organizations_stripe_subscription_id_unique"
  ON "organizations" ("stripe_subscription_id");

-- ----------------------------------------------------------------
-- user_verdict_limits -> user_report_usage rename + broaden
-- ----------------------------------------------------------------

ALTER TABLE "user_verdict_limits" RENAME TO "user_report_usage";

ALTER TABLE "user_report_usage"
  RENAME CONSTRAINT "user_verdict_limits_count_non_negative"
  TO "user_report_usage_reports_non_negative";

-- Drizzle's generated FK constraint name carries the old table
-- prefix; rename for clarity. If the constraint name differs in
-- your database (Drizzle sometimes uses hash suffixes), adjust
-- this line before applying.
ALTER TABLE "user_report_usage"
  RENAME CONSTRAINT "user_verdict_limits_user_id_users_id_fk"
  TO "user_report_usage_user_id_users_id_fk";

ALTER TABLE "user_report_usage"
  RENAME COLUMN "verdicts_this_month" TO "reports_this_period";

ALTER TABLE "user_report_usage"
  RENAME COLUMN "reset_at" TO "period_reset_at";

-- period_reset_at becomes nullable: free-plan users don't have a
-- billing period, and rows are created lazily before we know when
-- to reset. consumeReport fills it in on first use.
ALTER TABLE "user_report_usage"
  ALTER COLUMN "period_reset_at" DROP NOT NULL;

-- Lifetime free-trial flag. Null until the user consumes their
-- one-and-only free report. Once set, never cleared.
ALTER TABLE "user_report_usage"
  ADD COLUMN "free_report_used_at" timestamp with time zone;

-- Scout chat rate-limiting columns (pro-tier only — enforced in
-- application code before touching these). Counters roll at their
-- own cadences: `scout_day_reset_at` daily, monthly counter shares
-- `period_reset_at` with the report counter so both roll together.
ALTER TABLE "user_report_usage"
  ADD COLUMN "scout_messages_today" integer NOT NULL DEFAULT 0;
ALTER TABLE "user_report_usage"
  ADD COLUMN "scout_day_reset_at" timestamp with time zone;
ALTER TABLE "user_report_usage"
  ADD COLUMN "scout_messages_this_period" integer NOT NULL DEFAULT 0;

ALTER TABLE "user_report_usage"
  ADD CONSTRAINT "user_report_usage_scout_today_non_negative"
  CHECK ("scout_messages_today" >= 0);
ALTER TABLE "user_report_usage"
  ADD CONSTRAINT "user_report_usage_scout_period_non_negative"
  CHECK ("scout_messages_this_period" >= 0);
