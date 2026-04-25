import { z } from "zod";

/**
 * Onboarding payload validators (M1.2).
 *
 * The M3.4 onboarding flow submits an `OnboardingPayload` to a server
 * action which writes the four enum-style fields onto the
 * authenticated user's row and stamps `onboarding_completed_at`. These
 * Zod schemas are the trust boundary — any string the form sends has
 * to match one of the literal values below before it touches the DB.
 *
 * The literal lists are duplicated in `packages/db/src/schema/users.ts`
 * (as `INTENT_SEGMENTS`, `STRATEGY_FOCUSES`, `DEAL_RANGES`) where they
 * back the CHECK constraints on the `users` table. Keep both lists in
 * sync; the schema package is the source of truth and changes there
 * propagate via migration.
 */

export const intentSegmentSchema = z.enum([
  "investor",
  "shopper",
  "agent",
  "exploring",
]);
export type IntentSegment = z.infer<typeof intentSegmentSchema>;

export const strategyFocusSchema = z.enum([
  "str", // Short-term rental
  "ltr", // Long-term rental
  "house_hacking", // Multi-unit owner-occupied
  "flip", // Fix and flip
  "brrrr", // Buy, Rehab, Rent, Refinance, Repeat
  "vacation_home", // Personal use vacation property
]);
export type StrategyFocus = z.infer<typeof strategyFocusSchema>;

export const dealRangeSchema = z.enum([
  "under_500k",
  "500k_1m",
  "1m_3m",
  "3m_5m",
  "over_5m",
]);
export type DealRange = z.infer<typeof dealRangeSchema>;

export const onboardingPayloadSchema = z.object({
  intentSegment: intentSegmentSchema,
  strategyFocus: z.array(strategyFocusSchema).min(1).max(6),
  targetMarkets: z.array(z.string().min(1).max(100)).min(0).max(10),
  dealRange: dealRangeSchema,
});
export type OnboardingPayload = z.infer<typeof onboardingPayloadSchema>;
