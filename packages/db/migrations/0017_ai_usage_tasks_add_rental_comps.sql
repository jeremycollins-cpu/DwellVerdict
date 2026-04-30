-- M3.11: extend the ai_usage_events.task CHECK constraint to allow
-- the two new rental-comp tasks (`ltr-comps-lookup` for long-term
-- rental comp lookups and `str-comps-lookup` for short-term /
-- vacation rental comp lookups). Without this, the new fetcher
-- usage event INSERTs would be rejected at the DB layer even though
-- the TypeScript AI_USAGE_TASKS union accepts the values.
--
-- Same DROP + ADD idiom used by the M3.10 (0015) extension. The
-- constraint name is reused; IF EXISTS makes a re-run safe.

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
    'schools-lookup',
    'ltr-comps-lookup',
    'str-comps-lookup'
  ));
