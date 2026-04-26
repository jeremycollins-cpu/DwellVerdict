/**
 * Per-user monthly AI cost cap framework.
 *
 * Built in M3.0 but not consumed by any surface yet. Scout (M6.1) and
 * brief generation (M7.1) are the planned first consumers — when a
 * user's tracked monthly Anthropic spend approaches the cap, those
 * surfaces should degrade (force Haiku, throttle, or block) rather
 * than continue billing past margin.
 *
 * Contract: callers pass the user's current month-to-date spend in
 * cents (looked up via ai_usage_events). The check is pure — we
 * don't reach back into the DB here so this module stays trivially
 * testable.
 */

export const MONTHLY_COST_CAP_CENTS: number = (() => {
  const raw = process.env.AI_MONTHLY_COST_CAP_CENTS;
  if (!raw) return 3000; // $30 default per master plan v1.6
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 3000;
  return parsed;
})();

/**
 * Multiplier applied to MONTHLY_COST_CAP_CENTS for hard-block.
 * Between 100% and (cap × multiplier) the user is in "degrade"
 * territory — surfaces should switch to cheaper models / Haiku-only
 * but still serve the request. Above that, hard block.
 */
export const HARD_BLOCK_MULTIPLIER = 1.33;

export type CostCapState =
  | "under_cap"
  | "over_cap_degrade"
  | "over_cap_block";

export interface CostCapDecision {
  state: CostCapState;
  /** Whether the request should proceed (degraded or full quality). */
  allowed: boolean;
  monthlySpendCents: number;
  capCents: number;
}

/**
 * Decide a cost-cap state given a user's month-to-date spend.
 *
 * - under_cap: full quality, full routing
 * - over_cap_degrade: serve, but consumers should force cheaper models
 * - over_cap_block: refuse — caller should surface a friendly limit
 *   message and direct the user to wait for the next billing period
 */
export function decideCostCap(monthlySpendCents: number): CostCapDecision {
  const cap = MONTHLY_COST_CAP_CENTS;

  if (monthlySpendCents < cap) {
    return {
      state: "under_cap",
      allowed: true,
      monthlySpendCents,
      capCents: cap,
    };
  }

  if (monthlySpendCents < cap * HARD_BLOCK_MULTIPLIER) {
    return {
      state: "over_cap_degrade",
      allowed: true,
      monthlySpendCents,
      capCents: cap,
    };
  }

  return {
    state: "over_cap_block",
    allowed: false,
    monthlySpendCents,
    capCents: cap,
  };
}
