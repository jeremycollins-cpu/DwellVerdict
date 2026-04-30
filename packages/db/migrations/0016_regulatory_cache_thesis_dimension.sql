-- M3.13: extend regulatory_cache to be thesis-aware. The pre-M3.13
-- table held one row per (city, state) and assumed STR. After M3.13
-- a city can have up to five rows — one per thesis_dimension —
-- because LTR cares about rent control / tenant rights, owner-occ
-- cares about HOA + property tax, flipping cares about permitting +
-- transfer taxes, etc. Each thesis runs a different LLM prompt and
-- stores different structured fields.
--
-- Backwards compat: existing rows are STR-typed, so the new column
-- defaults to 'str'. The unique index is dropped + recreated on
-- (city, state, thesis_dimension) so the same city can hold one
-- row per dimension.
--
-- The pre-existing typed STR columns (str_legal, permit_required,
-- owner_occupied_only, cap_on_non_oo, renewal_frequency,
-- minimum_stay_days) are kept as-is — they're populated for
-- thesis_dimension='str' rows and NULL for the other four. The
-- thesis-specific structured fields for ltr/owner_occupied/
-- house_hacking/flipping live in the new thesis_specific_fields
-- jsonb column, which lets each thesis evolve its schema without
-- requiring a migration per change.

ALTER TABLE "regulatory_cache"
  ADD COLUMN IF NOT EXISTS "thesis_dimension" text NOT NULL DEFAULT 'str';
--> statement-breakpoint

ALTER TABLE "regulatory_cache"
  ADD COLUMN IF NOT EXISTS "thesis_specific_fields" jsonb;
--> statement-breakpoint

ALTER TABLE "regulatory_cache"
  ADD COLUMN IF NOT EXISTS "notable_factors" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint

-- DROP + ADD CHECK is the standard idiom; idempotent via IF EXISTS.
ALTER TABLE "regulatory_cache"
  DROP CONSTRAINT IF EXISTS "regulatory_cache_thesis_dimension_check";
--> statement-breakpoint

ALTER TABLE "regulatory_cache"
  ADD CONSTRAINT "regulatory_cache_thesis_dimension_check"
  CHECK ("thesis_dimension" IN (
    'str',
    'ltr',
    'owner_occupied',
    'house_hacking',
    'flipping'
  ));
--> statement-breakpoint

-- Replace the (city, state) unique index with (city, state,
-- thesis_dimension). Drop is conditional so re-runs are safe; the
-- create uses IF NOT EXISTS for the same reason.
DROP INDEX IF EXISTS "regulatory_cache_city_state_unique";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "regulatory_cache_city_state_dim_unique"
  ON "regulatory_cache" ("city", "state", "thesis_dimension");
