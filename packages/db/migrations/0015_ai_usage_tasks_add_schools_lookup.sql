-- M3.10: extend the ai_usage_events.task CHECK constraint to allow
-- the new `schools-lookup` task. Without this, the schools fetcher's
-- usage event INSERTs would be rejected at the DB layer even though
-- the TypeScript AI_USAGE_TASKS union accepts the value.
--
-- DROP + ADD is the standard idiom for extending a CHECK constraint
-- in Postgres. Idempotent: the IF EXISTS on the DROP makes a re-run
-- safe.

ALTER TABLE "ai_usage_events"
  DROP CONSTRAINT IF EXISTS "ai_usage_events_task_check";
--> statement-breakpoint

ALTER TABLE "ai_usage_events"
  ADD CONSTRAINT "ai_usage_events_task_check"
  CHECK ("task" IN (
    'regulatory-lookup',
    'place-sentiment',
    'scout-chat',
    'verdict-narrative',
    'briefs',
    'alerts',
    'compare',
    'portfolio',
    'schools-lookup'
  ));
