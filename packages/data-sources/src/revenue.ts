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

/**
 * M3.6 — intake-driven revenue. The user's intake-form inputs
 * (nightly rate × occupancy for STR; monthly rent × (1 - vacancy)
 * for LTR) take precedence over comp-derived numbers because the
 * user's understanding of their own market is usually sharper than
 * a generic STR-comps median. Owner-occupied / flipping return
 * null because there's no rental income to project — the verdict
 * narrative handles those theses with a different framing.
 *
 * Returns a `RevenueEstimate` shaped exactly like the comps formula
 * so the rest of the pipeline (scoreVerdict, narrative metrics)
 * doesn't branch on data source. The `inputs` object's
 * `compsUsed=0` is the tell that this came from intake, not comps.
 */
export type IntakeRevenueInput = {
  thesisType:
    | "str"
    | "ltr"
    | "owner_occupied"
    | "house_hacking"
    | "flipping"
    | "other";
  // STR (and house-hacking using the rented portion)
  strExpectedNightlyRateCents?: number | null;
  strExpectedOccupancy?: number | null;
  strCleaningFeeCents?: number | null;
  strAvgLengthOfStayDays?: number | null;
  // LTR
  ltrExpectedMonthlyRentCents?: number | null;
  ltrVacancyRate?: number | null;
  // Used for net-of-expenses rather than a flat ratio when present
  annualPropertyTaxCents?: number | null;
  annualInsuranceEstimateCents?: number | null;
  monthlyHoaFeeCents?: number | null;
};

export function computeIntakeRevenue(
  input: IntakeRevenueInput,
): RevenueEstimate | null {
  // STR: user provided both nightly rate and occupancy.
  if (
    (input.thesisType === "str" || input.thesisType === "house_hacking") &&
    input.strExpectedNightlyRateCents != null &&
    input.strExpectedOccupancy != null
  ) {
    const adr = input.strExpectedNightlyRateCents / 100;
    const occupancy = input.strExpectedOccupancy;
    const days = DEFAULT_DAYS;
    const annualMedian = Math.round(adr * occupancy * days);
    const expensesAnnual = sumIntakeExpenses(input);
    const netAnnualMedian = expensesAnnual
      ? Math.max(0, Math.round(annualMedian - expensesAnnual))
      : Math.round(annualMedian * (1 - DEFAULT_EXPENSE_RATIO));
    const annualLow = Math.round(annualMedian * 0.85);
    const annualHigh = Math.round(annualMedian * 1.15);
    return RevenueEstimateSchema.parse({
      annualLow,
      annualMedian,
      annualHigh,
      inputs: {
        adrLow: Math.round(adr * 0.85),
        adrMedian: Math.round(adr),
        adrHigh: Math.round(adr * 1.15),
        occupancyAssumed: occupancy,
        daysAssumed: days,
        expenseRatioAssumed: expensesAnnual
          ? Math.max(0, 1 - netAnnualMedian / annualMedian)
          : DEFAULT_EXPENSE_RATIO,
        compsUsed: 0,
      },
      netAnnualMedian,
      summary:
        `STR: $${Math.round(adr).toLocaleString()}/night × ${(occupancy * 100).toFixed(0)}% occupancy ≈ ` +
        `$${annualMedian.toLocaleString()}/yr gross, $${netAnnualMedian.toLocaleString()}/yr net (user inputs).`,
    });
  }

  // LTR: user provided monthly rent (vacancy optional, defaults 5%).
  if (
    input.thesisType === "ltr" &&
    input.ltrExpectedMonthlyRentCents != null
  ) {
    const monthly = input.ltrExpectedMonthlyRentCents / 100;
    const vacancy = input.ltrVacancyRate ?? 0.05;
    const annualMedian = Math.round(monthly * 12 * (1 - vacancy));
    const expensesAnnual = sumIntakeExpenses(input);
    const netAnnualMedian = expensesAnnual
      ? Math.max(0, Math.round(annualMedian - expensesAnnual))
      : Math.round(annualMedian * (1 - DEFAULT_EXPENSE_RATIO));
    const annualLow = Math.round(annualMedian * 0.95);
    const annualHigh = Math.round(annualMedian * 1.05);
    return RevenueEstimateSchema.parse({
      annualLow,
      annualMedian,
      annualHigh,
      inputs: {
        adrLow: Math.round(monthly / 30),
        adrMedian: Math.round(monthly / 30),
        adrHigh: Math.round(monthly / 30),
        occupancyAssumed: 1 - vacancy,
        daysAssumed: 365,
        expenseRatioAssumed: expensesAnnual
          ? Math.max(0, 1 - netAnnualMedian / annualMedian)
          : DEFAULT_EXPENSE_RATIO,
        compsUsed: 0,
      },
      netAnnualMedian,
      summary:
        `LTR: $${Math.round(monthly).toLocaleString()}/mo × 12 × (1 − ${(vacancy * 100).toFixed(0)}% vacancy) ≈ ` +
        `$${annualMedian.toLocaleString()}/yr gross, $${netAnnualMedian.toLocaleString()}/yr net (user inputs).`,
    });
  }

  // owner-occupied / flipping / other-without-revenue-fields → no
  // rental income to project. The verdict narrative reframes these
  // around livability, ARV, etc. instead.
  return null;
}

function sumIntakeExpenses(input: IntakeRevenueInput): number {
  const tax = (input.annualPropertyTaxCents ?? 0) / 100;
  const insurance = (input.annualInsuranceEstimateCents ?? 0) / 100;
  const hoaAnnual = ((input.monthlyHoaFeeCents ?? 0) / 100) * 12;
  return tax + insurance + hoaAnnual;
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
