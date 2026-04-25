-- 0010_onboarding_fields.sql
--
-- M1.2 — Add onboarding intent fields to the `users` table so the
-- M3.4 onboarding flow can persist what kind of investor a user is,
-- their strategy focus, target markets, deal range, and a completion
-- timestamp.
--
-- All five columns are nullable. Existing users get backfilled with
-- `onboarding_completed_at = NOW()` so they don't get force-routed
-- through the onboarding flow when M3.4 ships. New users land here
-- with `onboarding_completed_at = NULL` until they finish.
--
-- Hand-written migration (not drizzle-kit generated) to keep the
-- backfill UPDATE in the same file as the schema change.
--
-- Breakpoint markers between each statement are required by Drizzle's
-- neon-http migrator — it splits the file on those markers and runs
-- each chunk as a single prepared statement. Without them, Neon's
-- HTTP driver rejects multi-statement payloads with error 42601.

ALTER TABLE "users" ADD COLUMN "intent_segment" text;
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "strategy_focus" text[];
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "target_markets" text[];
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "deal_range" text;
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "users"
  ADD CONSTRAINT "users_intent_segment_check"
  CHECK ("intent_segment" IS NULL OR "intent_segment" IN ('investor', 'shopper', 'agent', 'exploring'));
--> statement-breakpoint

ALTER TABLE "users"
  ADD CONSTRAINT "users_deal_range_check"
  CHECK ("deal_range" IS NULL OR "deal_range" IN ('under_500k', '500k_1m', '1m_3m', '3m_5m', 'over_5m'));
--> statement-breakpoint

-- Backfill existing users so they skip the onboarding flow that
-- ships in M3.4. We can't infer intent_segment / strategy_focus /
-- target_markets / deal_range for them, so those stay NULL —
-- application code must treat NULL as "user pre-dates onboarding"
-- and not as "user has not finished onboarding".
UPDATE "users"
  SET "onboarding_completed_at" = NOW()
  WHERE "onboarding_completed_at" IS NULL;
