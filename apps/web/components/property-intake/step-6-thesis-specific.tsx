"use client";

import { CurrencyInput } from "./currency-input";
import { GuidedInput } from "./guided-input";
import type {
  IntakeStep6Payload,
  PropertyThesisType,
} from "@/lib/onboarding/schema";

type Step6 = IntakeStep6Payload;

const inputClass =
  "w-full rounded-md border border-hairline bg-card-ink px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/20";

/**
 * Step 6 — thesis-specific assumptions. Renders only the field
 * groups relevant to the user's thesis from step 1. House-hacking
 * shows STR + financing (the rented portion); flipping shows
 * financing + renovation budget + ARV; "other" shows everything so
 * users with non-standard strategies can fill what fits.
 */
export function Step6ThesisSpecific({
  thesisType,
  values,
  onChange,
}: {
  thesisType: PropertyThesisType;
  values: Step6;
  onChange: (next: Partial<Step6>) => void;
}) {
  const showStr =
    thesisType === "str" ||
    thesisType === "house_hacking" ||
    thesisType === "other";
  const showLtr = thesisType === "ltr" || thesisType === "other";
  // STR-only investors often pay cash, so we hide financing for
  // pure STR. Every other thesis (LTR / owner-occupied / flipping
  // / house-hacking / other) gets the financing block.
  const showFinancing = thesisType !== "str";
  const showFlipping = thesisType === "flipping" || thesisType === "other";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h2 className="font-serif text-[28px] leading-[1.2] tracking-[-0.02em] text-ink md:text-[34px]">
          Thesis assumptions.
        </h2>
        <p className="text-[15px] leading-[1.55] text-ink-muted">
          The specific numbers that drive your forecast. Every field here is
          adjustable later in the what-if calculator.
        </p>
      </header>

      {showStr ? (
        <Section title="Short-term rental assumptions">
          <GuidedInput
            label="Expected nightly rate"
            guidance="Check existing Airbnb/VRBO listings nearby. Find 3–5 comparable properties (same beds/baths, similar location/amenities) and take the median. Note ADR varies by season — use a yearly average."
            optional
          >
            <CurrencyInput
              valueCents={values.strExpectedNightlyRateCents ?? null}
              onValueChange={(cents) =>
                onChange({ strExpectedNightlyRateCents: cents })
              }
              placeholder="220"
            />
          </GuidedInput>

          <GuidedInput
            label="Expected occupancy"
            guidance="Vacation markets typically 50–70%. Year-round destinations higher; seasonal markets lower. Be realistic — most beginners overestimate."
            optional
          >
            <PercentInput
              value={values.strExpectedOccupancy ?? null}
              onChange={(v) => onChange({ strExpectedOccupancy: v })}
              placeholder="0.65"
            />
          </GuidedInput>

          <GuidedInput
            label="Cleaning fee per stay"
            guidance="Typical range $75–200 depending on size. This is paid separately by guests."
            optional
          >
            <CurrencyInput
              valueCents={values.strCleaningFeeCents ?? null}
              onValueChange={(cents) =>
                onChange({ strCleaningFeeCents: cents })
              }
              placeholder="125"
            />
          </GuidedInput>

          <GuidedInput
            label="Average length of stay (nights)"
            guidance="Vacation rentals typically 3–5 nights. Affects tax treatment — under 7 days average matters for the STR loophole."
            optional
          >
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              placeholder="4"
              value={values.strAvgLengthOfStayDays ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                onChange({
                  strAvgLengthOfStayDays:
                    raw === "" ? null : parseInt(raw, 10) || null,
                });
              }}
              className={inputClass}
            />
          </GuidedInput>
        </Section>
      ) : null}

      {showLtr ? (
        <Section title="Long-term rental assumptions">
          <GuidedInput
            label="Expected monthly rent"
            guidance="Check Rentometer.com (free), Zillow rentals, or Craigslist for comparable units. Take the median of 3 comps."
            optional
          >
            <CurrencyInput
              valueCents={values.ltrExpectedMonthlyRentCents ?? null}
              onValueChange={(cents) =>
                onChange({ ltrExpectedMonthlyRentCents: cents })
              }
              placeholder="2,400"
            />
          </GuidedInput>

          <GuidedInput
            label="Vacancy rate"
            guidance="5–8% is typical for stable markets. Higher in transitional neighborhoods or roommate situations."
            optional
          >
            <PercentInput
              value={values.ltrVacancyRate ?? null}
              onChange={(v) => onChange({ ltrVacancyRate: v })}
              placeholder="0.07"
            />
          </GuidedInput>

          <GuidedInput
            label="Expected appreciation rate (annual)"
            guidance="Check FRED Case-Shiller for your metro area. National average ~3–5%/yr but varies dramatically by market. Be conservative."
            optional
          >
            <PercentInput
              value={values.ltrExpectedAppreciationRate ?? null}
              onChange={(v) => onChange({ ltrExpectedAppreciationRate: v })}
              placeholder="0.04"
              min={-0.1}
              max={0.5}
            />
          </GuidedInput>
        </Section>
      ) : null}

      {showFinancing ? (
        <Section title="Financing">
          <GuidedInput
            label="Down payment %"
            guidance="Conventional loans typically 20%; FHA can be 3.5%. Enter as a decimal (e.g. 0.20 for 20%)."
            optional
          >
            <PercentInput
              value={values.downPaymentPercent ?? null}
              onChange={(v) => onChange({ downPaymentPercent: v })}
              placeholder="0.20"
            />
          </GuidedInput>

          <GuidedInput
            label="Mortgage rate"
            guidance="Check current rates at bankrate.com for your loan type. Enter as decimal (e.g. 0.065 for 6.5%)."
            optional
          >
            <PercentInput
              value={values.mortgageRate ?? null}
              onChange={(v) => onChange({ mortgageRate: v })}
              placeholder="0.065"
              min={0}
              max={0.3}
            />
          </GuidedInput>

          <GuidedInput
            label="Mortgage term (years)"
            guidance="Default 30. Other common: 15."
            optional
          >
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={40}
              placeholder="30"
              value={values.mortgageTermYears ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                onChange({
                  mortgageTermYears:
                    raw === "" ? null : parseInt(raw, 10) || null,
                });
              }}
              className={inputClass}
            />
          </GuidedInput>

          <GuidedInput
            label="Renovation budget"
            guidance={
              thesisType === "flipping"
                ? "Total renovation budget — this IS the investment for a flip."
                : "If you plan to renovate, total budget."
            }
            optional={thesisType !== "flipping"}
          >
            <CurrencyInput
              valueCents={values.renovationBudgetCents ?? null}
              onValueChange={(cents) =>
                onChange({ renovationBudgetCents: cents })
              }
              placeholder="45,000"
            />
          </GuidedInput>
        </Section>
      ) : null}

      {showFlipping ? (
        <Section title="Flip-specific">
          <GuidedInput
            label="After-Repair Value (ARV) estimate"
            guidance="What the property will sell for once renovated. Pull comps for the as-renovated condition; use the median of 3 sold comps in the last 90 days."
          >
            <CurrencyInput
              valueCents={values.flippingArvEstimateCents ?? null}
              onValueChange={(cents) =>
                onChange({ flippingArvEstimateCents: cents })
              }
              placeholder="585,000"
            />
          </GuidedInput>
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-terracotta">
        {title}
      </h3>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function PercentInput({
  value,
  onChange,
  placeholder,
  min = 0,
  max = 1,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step="0.01"
      min={min}
      max={max}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onChange(null);
          return;
        }
        const num = parseFloat(raw);
        onChange(Number.isNaN(num) ? null : num);
      }}
      className={inputClass}
    />
  );
}
