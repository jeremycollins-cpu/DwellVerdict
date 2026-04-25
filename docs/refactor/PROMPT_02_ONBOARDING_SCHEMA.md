# PROMPT 02 · Milestone 1.2 — Database Schema: Onboarding Fields

**Reference:** `docs/refactor/REFACTOR_MASTER_PLAN.md` § Phase 1 · M1.2

**Branch:** `refactor/M1.2-onboarding-schema`
**PR title:** `M1.2 — Database schema: onboarding fields`

---

## What this milestone does

Adds five new columns to the existing `users` table to support the onboarding flow that ships in M3.4 (Onboarding intent). This is a pure schema migration — no UI changes, no API changes, no behavior changes. It just lays the data foundation.

The columns added:
- `intent_segment` — what kind of user this is (investor / shopper / agent / exploring)
- `strategy_focus` — multi-select tags for investment strategy (str / ltr / house_hacking / etc.)
- `target_markets` — array of geographic regions the user is interested in
- `deal_range` — typical purchase price range
- `onboarding_completed_at` — timestamp marking when onboarding was finished

## Detailed scope

### Part 1: The migration

Add a Drizzle migration at `packages/db/src/migrations/<next_number>_onboarding_fields.ts` (or whatever Drizzle's standard file naming is in this repo — match existing patterns).

Migration content:

```sql
-- Up migration
ALTER TABLE users
  ADD COLUMN intent_segment text,
  ADD COLUMN strategy_focus text[],
  ADD COLUMN target_markets text[],
  ADD COLUMN deal_range text,
  ADD COLUMN onboarding_completed_at timestamp;

-- Backfill existing users so they skip onboarding
UPDATE users
SET onboarding_completed_at = NOW()
WHERE onboarding_completed_at IS NULL;
```

```sql
-- Down migration (reverse)
ALTER TABLE users
  DROP COLUMN intent_segment,
  DROP COLUMN strategy_focus,
  DROP COLUMN target_markets,
  DROP COLUMN deal_range,
  DROP COLUMN onboarding_completed_at;
```

**Important:** All 5 columns are nullable. Existing users get backfilled with `onboarding_completed_at = NOW()` so they don't get forced through onboarding when M3.4 ships. New users (post-migration) will have `onboarding_completed_at = NULL` until they complete onboarding.

### Part 2: Update Drizzle schema definition

Update `packages/db/src/schema/users.ts` (or wherever the `users` table is defined) to include the new columns:

```typescript
import { pgTable, text, timestamp, /* existing imports */ } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  // ... existing columns ...
  
  // Onboarding fields (M1.2)
  intentSegment: text('intent_segment'),
  strategyFocus: text('strategy_focus').array(),
  targetMarkets: text('target_markets').array(),
  dealRange: text('deal_range'),
  onboardingCompletedAt: timestamp('onboarding_completed_at'),
});
```

Match the existing naming conventions in the file (camelCase in TS, snake_case in DB column names, etc.).

### Part 3: Add Zod validators for onboarding values

Create `apps/web/lib/onboarding/schema.ts` (or a similar location matching the codebase's organization patterns):

```typescript
import { z } from 'zod';

export const intentSegmentSchema = z.enum(['investor', 'shopper', 'agent', 'exploring']);
export type IntentSegment = z.infer<typeof intentSegmentSchema>;

export const strategyFocusSchema = z.enum([
  'str',                  // Short-term rental
  'ltr',                  // Long-term rental
  'house_hacking',        // Multi-unit owner-occupied
  'flip',                 // Fix and flip
  'brrrr',                // Buy, Rehab, Rent, Refinance, Repeat
  'vacation_home',        // Personal use vacation property
]);
export type StrategyFocus = z.infer<typeof strategyFocusSchema>;

export const dealRangeSchema = z.enum([
  'under_500k',
  '500k_1m',
  '1m_3m',
  '3m_5m',
  'over_5m',
]);
export type DealRange = z.infer<typeof dealRangeSchema>;

export const onboardingPayloadSchema = z.object({
  intentSegment: intentSegmentSchema,
  strategyFocus: z.array(strategyFocusSchema).min(1).max(6),
  targetMarkets: z.array(z.string().min(1).max(100)).min(0).max(10),
  dealRange: dealRangeSchema,
});
export type OnboardingPayload = z.infer<typeof onboardingPayloadSchema>;
```

These are used in M3.4 when the onboarding form is submitted. Building them now means M3.4 just consumes them.

### Part 4: Verify the migration runs cleanly

After writing the migration:

1. Run `pnpm db:generate` (or whatever the repo's Drizzle generation command is)
2. Run `pnpm db:migrate` against your local dev database
3. Confirm the migration applies without errors
4. Confirm the columns appear in the `users` table with correct types
5. Confirm existing users have `onboarding_completed_at` populated

Document in the PR description any commands that need to be run during deploy (e.g., "this migration runs automatically on Vercel deploy via the `predeploy` script" or similar — match the existing pattern).

## Files you'll touch

- `packages/db/src/migrations/<NNNN>_onboarding_fields.{ts|sql}` (NEW migration file)
- `packages/db/src/schema/users.ts` (UPDATE to add columns)
- `apps/web/lib/onboarding/schema.ts` (NEW Zod validators)

Probably 3 files total. Small PR (~100-200 lines).

## What this milestone does NOT do

- ❌ Does NOT build the onboarding UI (that's M3.4)
- ❌ Does NOT add an API endpoint for onboarding submission (that's M3.4)
- ❌ Does NOT redirect new users to /onboarding/intent (that's M3.4)
- ❌ Does NOT update existing user records with intent_segment values (we have no way to know what they'd choose)
- ❌ Does NOT add the AI cost optimization tables (that's M3.0)

## Smoke test plan (run before merge)

Before you merge:

1. Run the migration locally against a fresh database. Verify all 5 columns exist with correct types.
2. Run the migration against a database with existing user records. Verify `onboarding_completed_at` is populated for those users.
3. Run `pnpm typecheck`. Verify no TypeScript errors from the schema changes.
4. Verify the down migration works (`pnpm db:migrate down` or equivalent). All 5 columns should drop cleanly.
5. Apply the migration up again.
6. Confirm production deploy doesn't break — visit dwellverdict.com after deploy and verify normal user flows still work.

If any step fails, fix before merging. If a fix is non-trivial, document the issue in the PR and merge anyway per the autonomous merge policy in PROMPT_00.

## Done definition

- Migration file created with up + down
- Drizzle schema updated to reflect new columns
- Zod validators created for onboarding payloads
- Migration applies cleanly to local + production databases
- Existing users backfilled with `onboarding_completed_at = NOW()`
- No regression in existing tests
- PR opened, CI green (or 3 fix attempts made), merged to main
- Production deploy confirmed
- PR description includes smoke test results and rollback command

---

When you're done and the PR is merged + deployed, reply here with the merge commit SHA and a brief summary. Then I'll send PROMPT_03 (M1.3 — sidebar shell wired into authenticated layout).

Ready to start. Go.
