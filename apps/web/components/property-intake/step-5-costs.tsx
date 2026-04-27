"use client";

import { CurrencyInput } from "./currency-input";
import { GuidedInput } from "./guided-input";
import type { IntakeStep5Payload } from "@/lib/onboarding/schema";

type Costs = {
  annualPropertyTaxCents: number | null;
  annualInsuranceEstimateCents: number | null;
  monthlyHoaFeeCents: number | null;
};

/**
 * Step 5 — annual carrying costs. Insurance gets a regional risk
 * callout when the property's state matches a high-risk zone (CA
 * wildfire, FL hurricane, Gulf Coast flood). Lookup is intentionally
 * coarse — we'll refine to county-level after M3.7 fixes the FEMA
 * fetcher.
 */

const HIGH_RISK_STATES: Record<
  string,
  { hazard: "wildfire" | "hurricane" | "flood"; markup: string }
> = {
  CA: { hazard: "wildfire", markup: "$3K–8K/yr in fire-prone zones, $1K–3K elsewhere" },
  OR: { hazard: "wildfire", markup: "rising in fire corridors, $1.5K–4K/yr" },
  WA: { hazard: "wildfire", markup: "rising east of the Cascades" },
  CO: { hazard: "wildfire", markup: "rising in Front Range / mountain zones" },
  MT: { hazard: "wildfire", markup: "rising in fire corridors" },
  ID: { hazard: "wildfire", markup: "rising in fire corridors" },
  FL: { hazard: "hurricane", markup: "$3K–10K/yr; many carriers won't write coastal" },
  TX: { hazard: "hurricane", markup: "Gulf coast $3K–8K/yr; inland much lower" },
  LA: { hazard: "hurricane", markup: "$4K–12K/yr coastal; very tight market" },
  MS: { hazard: "hurricane", markup: "$3K–8K/yr coastal" },
  AL: { hazard: "hurricane", markup: "$2K–6K/yr coastal" },
  SC: { hazard: "hurricane", markup: "$2K–6K/yr coastal" },
  NC: { hazard: "hurricane", markup: "$2K–5K/yr coastal" },
};

export function Step5Costs({
  values,
  state,
  onChange,
}: {
  values: Costs;
  state: string | null;
  onChange: (next: Partial<IntakeStep5Payload>) => void;
}) {
  const risk = state ? HIGH_RISK_STATES[state.toUpperCase()] : undefined;
  const insuranceCallout = risk
    ? `Insurance in ${state} has been increasing due to ${risk.hazard} risk — typical: ${risk.markup}. Get a current quote (Lemonade, Geico, GEICO, or local broker) to be accurate.`
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="font-serif text-[28px] leading-[1.2] tracking-[-0.02em] text-ink md:text-[34px]">
          Annual carrying costs.
        </h2>
        <p className="text-[15px] leading-[1.55] text-ink-muted">
          The non-mortgage costs that hit you every year. These quietly eat
          cap rate — getting them right matters.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <GuidedInput
          label="Annual property tax"
          guidance="Find on Zillow listing → 'Tax history' section, or the county assessor's website."
          optional
        >
          <CurrencyInput
            valueCents={values.annualPropertyTaxCents}
            onValueChange={(cents) =>
              onChange({ annualPropertyTaxCents: cents })
            }
            placeholder="5,400"
          />
        </GuidedInput>

        <GuidedInput
          label="Annual insurance estimate"
          guidance="Get a quick quote from Lemonade or Geico (60 seconds). We're not a referral source — verify with your own quotes."
          callout={insuranceCallout}
          optional
        >
          <CurrencyInput
            valueCents={values.annualInsuranceEstimateCents}
            onValueChange={(cents) =>
              onChange({ annualInsuranceEstimateCents: cents })
            }
            placeholder="1,800"
          />
        </GuidedInput>

        <GuidedInput
          label="Monthly HOA fees"
          guidance="Listed on Zillow if applicable, otherwise from HOA documents."
          optional
        >
          <CurrencyInput
            valueCents={values.monthlyHoaFeeCents}
            onValueChange={(cents) => onChange({ monthlyHoaFeeCents: cents })}
            placeholder="0"
          />
        </GuidedInput>
      </div>
    </div>
  );
}
