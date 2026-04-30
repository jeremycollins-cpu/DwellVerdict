import "server-only";

/**
 * Intake-vs-market variance computation for M3.11 LTR + STR rental
 * comps.
 *
 * The orchestrator runs an LLM-backed comp lookup for the property's
 * thesis (LTR or STR) and gets back a market median; the property
 * intake captures the user's expectation (monthly rent or nightly
 * rate + occupancy). This helper compares the two and emits a flag
 * the narrative model uses to decide how loudly to surface the
 * variance.
 *
 * Bands:
 *   < 0.7   significantly_low    — user expects <70% of market median
 *   0.7..0.9  low                 — 70-90% of median
 *   0.9..1.1  aligned             — within ±10%, no concern
 *   1.1..1.4  high                — 110-140% of median
 *   > 1.4   significantly_high   — user expects >140% of median
 *
 * The `aligned` band intentionally allows ±10% drift; rental markets
 * are noisy and a verdict that nags about a 5% variance would erode
 * trust.
 */

export type VarianceFlag =
  | "aligned"
  | "low"
  | "high"
  | "significantly_low"
  | "significantly_high";

export type VarianceResult = {
  varianceRatio: number;
  flag: VarianceFlag;
};

export function computeIntakeVarianceFlag(
  userValue: number,
  marketMedian: number,
): VarianceResult {
  if (
    !Number.isFinite(userValue) ||
    !Number.isFinite(marketMedian) ||
    marketMedian <= 0
  ) {
    // Caller should not invoke when either value is missing; return
    // a neutral 'aligned' so a buggy call site never produces a
    // misleading flag. Console-log so the caller bug surfaces.
    console.warn("[intake-variance] invalid inputs", {
      userValue,
      marketMedian,
    });
    return { varianceRatio: 1, flag: "aligned" };
  }

  const ratio = userValue / marketMedian;

  let flag: VarianceFlag;
  if (ratio < 0.7) flag = "significantly_low";
  else if (ratio < 0.9) flag = "low";
  else if (ratio > 1.4) flag = "significantly_high";
  else if (ratio > 1.1) flag = "high";
  else flag = "aligned";

  return { varianceRatio: ratio, flag };
}
