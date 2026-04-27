"use client";

import { CurrencyInput } from "./currency-input";
import { GuidedInput } from "./guided-input";
import type { IntakeStep4Payload } from "@/lib/onboarding/schema";

type Pricing = {
  listingPriceCents: number | null;
  userOfferPriceCents: number | null;
  estimatedValueCents: number | null;
};

export function Step4Pricing({
  values,
  onChange,
}: {
  values: Pricing;
  onChange: (next: Partial<IntakeStep4Payload>) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="font-serif text-[28px] leading-[1.2] tracking-[-0.02em] text-ink md:text-[34px]">
          Pricing.
        </h2>
        <p className="text-[15px] leading-[1.55] text-ink-muted">
          Listing price is the single most important input — without it, the
          verdict can&rsquo;t reason about whether the deal works at the asking
          number.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <GuidedInput
          label="Listing price"
          guidance="Open the property's Zillow or Redfin listing → copy the asking price. If unlisted, leave blank."
        >
          <CurrencyInput
            valueCents={values.listingPriceCents}
            onValueChange={(cents) => onChange({ listingPriceCents: cents })}
            placeholder="450,000"
          />
        </GuidedInput>

        <GuidedInput
          label="Your offer price"
          guidance="If you have a target offer in mind, enter it here. Affects what-if scenarios later."
          optional
        >
          <CurrencyInput
            valueCents={values.userOfferPriceCents}
            onValueChange={(cents) => onChange({ userOfferPriceCents: cents })}
            placeholder="430,000"
          />
        </GuidedInput>

        <GuidedInput
          label="Estimated value"
          guidance="From Zestimate (Zillow), Redfin estimate, or recent appraisal. Used for comparison against the listing price."
          optional
        >
          <CurrencyInput
            valueCents={values.estimatedValueCents}
            onValueChange={(cents) => onChange({ estimatedValueCents: cents })}
            placeholder="465,000"
          />
        </GuidedInput>
      </div>
    </div>
  );
}
