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

/**
 * Property intake validators (M3.5 keystone).
 *
 * Mirrors the new columns added by `0013_property_intake_fields.sql`.
 * The wizard at `/app/properties/[id]/intake` collects these in 7
 * steps; each step's `Save and continue` posts a partial payload
 * (validated by `propertyIntakeStepSchema`), the final submit
 * validates the whole thing against `propertyIntakeSubmitSchema`,
 * which adds the thesis-goal compatibility refinement.
 *
 * The literal lists are duplicated in
 * `packages/db/src/schema/properties.ts` (PROPERTY_THESIS_TYPES,
 * PROPERTY_GOAL_TYPES) where they back the CHECK constraints. Keep
 * both lists in sync; the schema package is the source of truth and
 * changes there propagate via migration.
 */

export const propertyThesisTypeSchema = z.enum([
  "str",
  "ltr",
  "owner_occupied",
  "house_hacking",
  "flipping",
  "other",
]);
export type PropertyThesisType = z.infer<typeof propertyThesisTypeSchema>;

export const propertyGoalTypeSchema = z.enum([
  "cap_rate",
  "appreciation",
  "both",
  "lifestyle",
  "flip_profit",
]);
export type PropertyGoalType = z.infer<typeof propertyGoalTypeSchema>;

/**
 * Which goals make sense per thesis. Enforced both in the wizard
 * (Step 2 hides invalid combos) and the server (final-submit
 * refinement). Flipping locks to flip_profit; owner-occupied to
 * lifestyle/appreciation/both; STR/LTR/house-hacking to investor
 * goals; "other" allows anything because we don't know what they're
 * doing.
 */
export const VALID_GOALS_PER_THESIS: Record<
  PropertyThesisType,
  ReadonlyArray<PropertyGoalType>
> = {
  str: ["cap_rate", "appreciation", "both"],
  ltr: ["cap_rate", "appreciation", "both"],
  owner_occupied: ["lifestyle", "appreciation", "both"],
  house_hacking: ["cap_rate", "appreciation", "both"],
  flipping: ["flip_profit"],
  other: ["cap_rate", "appreciation", "both", "lifestyle", "flip_profit"],
};

/**
 * Per-step partial schemas. Each `Save and continue` posts only the
 * fields owned by the current step; missing fields stay NULL in the
 * database. The wizard increments `intake_step_completed` after a
 * successful save so resume picks up the right step.
 */

const positiveCents = z.number().int().min(0).max(2_000_000_000);
const optionalCents = positiveCents.optional().nullable();
const optionalRatio = z
  .number()
  .min(0)
  .max(1)
  .optional()
  .nullable();
const optionalAppreciation = z
  .number()
  .min(-0.1)
  .max(0.5)
  .optional()
  .nullable();

export const intakeStep1Schema = z.object({
  thesisType: propertyThesisTypeSchema,
  thesisOtherDescription: z.string().max(2000).optional().nullable(),
});
export type IntakeStep1Payload = z.infer<typeof intakeStep1Schema>;

export const intakeStep2Schema = z.object({
  goalType: propertyGoalTypeSchema,
});
export type IntakeStep2Payload = z.infer<typeof intakeStep2Schema>;

export const intakeStep3Schema = z.object({
  yearBuilt: z.number().int().min(1800).max(2030).optional().nullable(),
  bedrooms: z.number().int().min(0).max(20).optional().nullable(),
  bathrooms: z.number().min(0).max(20).optional().nullable(),
  sqft: z.number().int().min(100).max(50_000).optional().nullable(),
  lotSqft: z.number().int().min(0).max(10_000_000).optional().nullable(),
});
export type IntakeStep3Payload = z.infer<typeof intakeStep3Schema>;

export const intakeStep4Schema = z.object({
  listingPriceCents: optionalCents,
  userOfferPriceCents: optionalCents,
  estimatedValueCents: optionalCents,
});
export type IntakeStep4Payload = z.infer<typeof intakeStep4Schema>;

export const intakeStep5Schema = z.object({
  annualPropertyTaxCents: optionalCents,
  annualInsuranceEstimateCents: optionalCents,
  monthlyHoaFeeCents: optionalCents,
});
export type IntakeStep5Payload = z.infer<typeof intakeStep5Schema>;

/**
 * Step 6 carries the union of all thesis-specific fields. Each
 * thesis only renders / writes its own subset, but the server
 * accepts any subset because the previous step may have changed
 * thesis (and the user is now editing step 6 again).
 */
export const intakeStep6Schema = z.object({
  // STR
  strExpectedNightlyRateCents: optionalCents,
  strExpectedOccupancy: optionalRatio,
  strCleaningFeeCents: optionalCents,
  strAvgLengthOfStayDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .nullable(),
  // LTR
  ltrExpectedMonthlyRentCents: optionalCents,
  ltrVacancyRate: optionalRatio,
  ltrExpectedAppreciationRate: optionalAppreciation,
  // Financing
  downPaymentPercent: optionalRatio,
  mortgageRate: z.number().min(0).max(0.3).optional().nullable(),
  mortgageTermYears: z.number().int().min(0).max(40).optional().nullable(),
  renovationBudgetCents: optionalCents,
  flippingArvEstimateCents: optionalCents,
});
export type IntakeStep6Payload = z.infer<typeof intakeStep6Schema>;

/**
 * Final submit — accepts the union of all step payloads plus the
 * thesis-goal compatibility refinement. The DB row already holds
 * partial saves at this point; this is the trust boundary that
 * stamps `intake_completed_at = now()`.
 */
export const propertyIntakeSubmitSchema = z
  .object({
    ...intakeStep1Schema.shape,
    ...intakeStep2Schema.shape,
    ...intakeStep3Schema.shape,
    ...intakeStep4Schema.shape,
    ...intakeStep5Schema.shape,
    ...intakeStep6Schema.shape,
  })
  .refine(
    (data) =>
      VALID_GOALS_PER_THESIS[data.thesisType].includes(data.goalType),
    {
      message: "Selected goal is not valid for selected thesis",
      path: ["goalType"],
    },
  );
export type PropertyIntakeSubmitPayload = z.infer<
  typeof propertyIntakeSubmitSchema
>;

/**
 * Step number → schema lookup for the per-step `Save and continue`
 * server action. Step 7 is review-only — it has no fields of its
 * own, so it reuses the final submit schema.
 */
export const INTAKE_STEP_SCHEMAS = {
  1: intakeStep1Schema,
  2: intakeStep2Schema,
  3: intakeStep3Schema,
  4: intakeStep4Schema,
  5: intakeStep5Schema,
  6: intakeStep6Schema,
} as const;
export type IntakeStepNumber = keyof typeof INTAKE_STEP_SCHEMAS;
export const INTAKE_TOTAL_STEPS = 7 as const;
