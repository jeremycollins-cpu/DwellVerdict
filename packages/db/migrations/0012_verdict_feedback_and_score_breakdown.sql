-- M3.3 schema additions:
--   1. verdict_feedback — user thumbs up/down with optional comment.
--      Powers the M3.3 inline feedback control + the M9.3 admin AI
--      quality dashboard.
--   2. verdicts.score_breakdown — persists scoring.breakdown so the
--      "what moved the verdict" UI doesn't require re-running the
--      rubric at render time.

CREATE TABLE "verdict_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "verdict_id" uuid NOT NULL REFERENCES "verdicts"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "org_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,

  "rating" text NOT NULL,
  "comment" text,
  "issue_categories" text[],

  -- Snapshot fields so feedback analytics survive verdict updates /
  -- regenerates / schema migrations. Each carries the verdict's
  -- state at the moment the user rated it.
  "verdict_signal" text NOT NULL,
  "verdict_confidence" integer NOT NULL,
  "verdict_model" text NOT NULL,

  "created_at" timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT "verdict_feedback_rating_check"
    CHECK ("rating" IN ('thumbs_up', 'thumbs_down')),
  CONSTRAINT "verdict_feedback_signal_check"
    CHECK ("verdict_signal" IN ('buy', 'watch', 'pass')),
  CONSTRAINT "verdict_feedback_confidence_check"
    CHECK ("verdict_confidence" >= 0 AND "verdict_confidence" <= 100)
);
--> statement-breakpoint

CREATE INDEX "verdict_feedback_verdict_id_idx"
  ON "verdict_feedback" ("verdict_id");
--> statement-breakpoint

CREATE INDEX "verdict_feedback_created_at_idx"
  ON "verdict_feedback" ("created_at" DESC);
--> statement-breakpoint

-- One feedback row per (user, verdict). Re-rating overwrites via
-- ON CONFLICT in the application layer.
CREATE UNIQUE INDEX "verdict_feedback_user_verdict_unique"
  ON "verdict_feedback" ("user_id", "verdict_id");
--> statement-breakpoint

-- score_breakdown is the per-rule contribution log produced by
-- scoring.ts:scoreVerdict(). Persisted so the verdict detail page
-- can render "what moved the verdict" without re-deriving from
-- signals (which may have already cycled out of cache).
ALTER TABLE "verdicts"
  ADD COLUMN "score_breakdown" jsonb;
