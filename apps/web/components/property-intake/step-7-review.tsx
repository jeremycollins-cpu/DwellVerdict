"use client";

import { Pencil } from "lucide-react";

import {
  type PropertyGoalType,
  type PropertyThesisType,
} from "@/lib/onboarding/schema";

const THESIS_LABELS: Record<PropertyThesisType, string> = {
  str: "STR (Vacation Rental)",
  ltr: "LTR (Long-term Rental)",
  owner_occupied: "Owner-occupied",
  house_hacking: "House Hacking",
  flipping: "Flipping",
  other: "Other",
};

const GOAL_LABELS: Record<PropertyGoalType, string> = {
  cap_rate: "Cap rate",
  appreciation: "Appreciation",
  both: "Both",
  lifestyle: "Lifestyle",
  flip_profit: "Flip profit",
};

export type IntakeReviewData = {
  thesisType: PropertyThesisType | null;
  thesisOtherDescription: string | null;
  goalType: PropertyGoalType | null;
  yearBuilt: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  lotSqft: number | null;
  listingPriceCents: number | null;
  userOfferPriceCents: number | null;
  estimatedValueCents: number | null;
  annualPropertyTaxCents: number | null;
  annualInsuranceEstimateCents: number | null;
  monthlyHoaFeeCents: number | null;
  strExpectedNightlyRateCents: number | null;
  strExpectedOccupancy: number | null;
  strCleaningFeeCents: number | null;
  strAvgLengthOfStayDays: number | null;
  ltrExpectedMonthlyRentCents: number | null;
  ltrVacancyRate: number | null;
  ltrExpectedAppreciationRate: number | null;
  downPaymentPercent: number | null;
  mortgageRate: number | null;
  mortgageTermYears: number | null;
  renovationBudgetCents: number | null;
  flippingArvEstimateCents: number | null;
};

export function Step7Review({
  data,
  onEdit,
}: {
  data: IntakeReviewData;
  onEdit: (step: number) => void;
}) {
  type Row = [string, string | null];
  const thesisRows: Row[] = [
    ["Investment thesis", data.thesisType ? THESIS_LABELS[data.thesisType] : null],
  ];
  if (data.thesisType === "other") {
    thesisRows.push(["Description", data.thesisOtherDescription || null]);
  }

  const sections: Array<{
    title: string;
    step: number;
    rows: Row[];
  }> = [
    { title: "Thesis", step: 1, rows: thesisRows },
    {
      title: "Goal",
      step: 2,
      rows: [["Primary goal", data.goalType ? GOAL_LABELS[data.goalType] : null]],
    },
    {
      title: "Property fundamentals",
      step: 3,
      rows: [
        ["Year built", num(data.yearBuilt)],
        ["Bedrooms", num(data.bedrooms)],
        ["Bathrooms", num(data.bathrooms)],
        ["Square footage", num(data.sqft, "sqft")],
        ["Lot size", num(data.lotSqft, "sqft")],
      ],
    },
    {
      title: "Pricing",
      step: 4,
      rows: [
        ["Listing price", money(data.listingPriceCents)],
        ["Your offer price", money(data.userOfferPriceCents)],
        ["Estimated value", money(data.estimatedValueCents)],
      ],
    },
    {
      title: "Costs",
      step: 5,
      rows: [
        ["Annual property tax", money(data.annualPropertyTaxCents)],
        ["Annual insurance estimate", money(data.annualInsuranceEstimateCents)],
        ["Monthly HOA fees", money(data.monthlyHoaFeeCents)],
      ],
    },
    {
      title: "Thesis-specific",
      step: 6,
      rows: (
        [
          ["STR nightly rate", money(data.strExpectedNightlyRateCents)],
          ["STR occupancy", percent(data.strExpectedOccupancy)],
          ["STR cleaning fee", money(data.strCleaningFeeCents)],
          ["STR avg length of stay", num(data.strAvgLengthOfStayDays, "nights")],
          ["LTR monthly rent", money(data.ltrExpectedMonthlyRentCents)],
          ["LTR vacancy rate", percent(data.ltrVacancyRate)],
          ["LTR appreciation rate", percent(data.ltrExpectedAppreciationRate)],
          ["Down payment %", percent(data.downPaymentPercent)],
          ["Mortgage rate", percent(data.mortgageRate)],
          ["Mortgage term", num(data.mortgageTermYears, "years")],
          ["Renovation budget", money(data.renovationBudgetCents)],
          ["ARV estimate", money(data.flippingArvEstimateCents)],
        ] satisfies Row[]
      ).filter((r): r is Row => r[1] !== null),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="font-serif text-[28px] leading-[1.2] tracking-[-0.02em] text-ink md:text-[34px]">
          Review.
        </h2>
        <p className="text-[15px] leading-[1.55] text-ink-muted">
          Confirm your inputs. Submit to generate the verdict — every field is
          adjustable later in the what-if calculator.
        </p>
      </header>

      <div className="flex flex-col gap-5">
        {sections.map((section) => (
          <section
            key={section.title}
            className="rounded-[10px] border border-hairline bg-card-ink p-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-terracotta">
                {section.title}
              </h3>
              <button
                type="button"
                onClick={() => onEdit(section.step)}
                className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:text-ink"
              >
                <Pencil className="size-3" />
                Edit
              </button>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {section.rows.length === 0 ? (
                <p className="text-[13px] italic text-ink-muted">No data entered.</p>
              ) : (
                section.rows.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-baseline justify-between gap-3 border-b border-hairline pb-2"
                  >
                    <dt className="text-[13px] text-ink-muted">{k}</dt>
                    <dd className="text-[13.5px] font-medium text-ink">
                      {v ?? <span className="text-ink-faint">Not provided</span>}
                    </dd>
                  </div>
                ))
              )}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}

function money(cents: number | null): string | null {
  if (cents === null || cents === undefined) return null;
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function num(n: number | null, unit?: string): string | null {
  if (n === null || n === undefined) return null;
  const fmt = n.toLocaleString("en-US");
  return unit ? `${fmt} ${unit}` : fmt;
}

function percent(n: number | null): string | null {
  if (n === null || n === undefined) return null;
  return `${(n * 100).toFixed(1)}%`;
}
