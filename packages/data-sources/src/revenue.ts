import {
  RevenueEstimateSchema,
  type AirbnbComp,
  type RevenueEstimate,
} from "./types";

/**
 * Deterministic STR revenue formula per ADR-6.
 *
 * Input: a set of Airbnb comps (from airbnb.ts). Output: annual
 * gross + net revenue ranges + the exact inputs used.
 *
 * Formula:
 *   gross_annual = ADR × occupancy × days
 *   net_annual   = gross_annual × (1 − expense_ratio)
 *
 * We don't have per-listing occupancy from the Airbnb StaysSearch
 * path — their search response doesn't include booking density.
 * v0 uses a default occupancy assumption of 0.65 (65% — roughly
 * the US STR average per AirDNA's public benchmarks). Once we
 * have a design partner's historical booking data we can tune per
 * market. Review count is a weak proxy and we don't use it for
 * occupancy in v0 to avoid false precision.
 *
 * Low/median/high range comes from the low/median/high percentiles
 * of the nightly rates across the comps — a wider range = more
 * volatile market = the user sees that range visually.
 *
 * Expense ratio defaults to 0.30 (30%). STR expense ratios for
 * owner-managed small portfolios typically run 25-35% (cleaning,
 * supplies, utilities, management software, insurance, PM fees if
 * applicable). User can tune this in the Evaluating-stage scenario
 * slider once that UI ships.
 */

const DEFAULT_OCCUPANCY = 0.65;
const DEFAULT_DAYS = 365;
const DEFAULT_EXPENSE_RATIO = 0.3;

export type RevenueFormulaInputs = {
  comps: AirbnbComp[];
  /** Override defaults if the caller knows better. */
  occupancy?: number;
  days?: number;
  expenseRatio?: number;
};

export function computeRevenueEstimate(
  inputs: RevenueFormulaInputs,
): RevenueEstimate {
  const rates = inputs.comps
    .map((c) => c.nightlyRate)
    .filter((r): r is number => typeof r === "number" && r > 0)
    .sort((a, b) => a - b);

  if (rates.length === 0) {
    throw new Error("Cannot compute revenue — no comps with nightly rates");
  }

  const occupancy = inputs.occupancy ?? DEFAULT_OCCUPANCY;
  const days = inputs.days ?? DEFAULT_DAYS;
  const expenseRatio = inputs.expenseRatio ?? DEFAULT_EXPENSE_RATIO;

  const adrLow = percentile(rates, 0.25);
  const adrMedian = percentile(rates, 0.5);
  const adrHigh = percentile(rates, 0.75);

  const annualLow = Math.round(adrLow * occupancy * days);
  const annualMedian = Math.round(adrMedian * occupancy * days);
  const annualHigh = Math.round(adrHigh * occupancy * days);
  const netAnnualMedian = Math.round(annualMedian * (1 - expenseRatio));

  const summary = buildRevenueSummary({
    annualLow,
    annualMedian,
    annualHigh,
    netAnnualMedian,
    compsUsed: rates.length,
    occupancy,
    expenseRatio,
  });

  return RevenueEstimateSchema.parse({
    annualLow,
    annualMedian,
    annualHigh,
    inputs: {
      adrLow: Math.round(adrLow),
      adrMedian: Math.round(adrMedian),
      adrHigh: Math.round(adrHigh),
      occupancyAssumed: occupancy,
      daysAssumed: days,
      expenseRatioAssumed: expenseRatio,
      compsUsed: rates.length,
    },
    netAnnualMedian,
    summary,
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new Error("empty percentile input");
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const weight = idx - lo;
  return sorted[lo]! * (1 - weight) + sorted[hi]! * weight;
}

function buildRevenueSummary(p: {
  annualLow: number;
  annualMedian: number;
  annualHigh: number;
  netAnnualMedian: number;
  compsUsed: number;
  occupancy: number;
  expenseRatio: number;
}): string {
  const gross = `$${p.annualLow.toLocaleString()}–$${p.annualHigh.toLocaleString()}`;
  const median = `$${p.annualMedian.toLocaleString()}`;
  const net = `$${p.netAnnualMedian.toLocaleString()}`;
  const occ = `${Math.round(p.occupancy * 100)}%`;
  const exp = `${Math.round(p.expenseRatio * 100)}%`;
  return (
    `STR gross ${gross} (median ${median}); ` +
    `net ~${net}/yr after ${exp} expenses. ` +
    `${p.compsUsed} comps, ${occ} occupancy assumed.`
  );
}
