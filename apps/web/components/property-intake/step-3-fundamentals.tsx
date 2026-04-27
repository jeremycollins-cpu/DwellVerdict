"use client";

import { GuidedInput } from "./guided-input";
import type { IntakeStep3Payload } from "@/lib/onboarding/schema";

type Fundamentals = {
  yearBuilt: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  lotSqft: number | null;
};

const inputClass =
  "w-full rounded-md border border-hairline bg-card-ink px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/20";

export function Step3Fundamentals({
  values,
  onChange,
}: {
  values: Fundamentals;
  onChange: (next: Partial<IntakeStep3Payload>) => void;
}) {
  const setNum =
    (key: keyof Fundamentals, isFloat = false) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === "") {
        onChange({ [key]: null });
        return;
      }
      const num = isFloat ? parseFloat(raw) : parseInt(raw, 10);
      onChange({ [key]: Number.isNaN(num) ? null : num });
    };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="font-serif text-[28px] leading-[1.2] tracking-[-0.02em] text-ink md:text-[34px]">
          Property fundamentals.
        </h2>
        <p className="text-[15px] leading-[1.55] text-ink-muted">
          We hydrate these from listings when we can, but user-verified
          numbers always win — the more you fill in, the sharper the verdict.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <GuidedInput
          label="Year built"
          htmlFor="year-built"
          guidance="Find this on the Zillow listing → 'Facts & features' section."
          optional
        >
          <input
            id="year-built"
            type="number"
            inputMode="numeric"
            min={1800}
            max={2030}
            placeholder="2005"
            value={values.yearBuilt ?? ""}
            onChange={setNum("yearBuilt")}
            className={inputClass}
          />
        </GuidedInput>

        <GuidedInput
          label="Bedrooms"
          htmlFor="bedrooms"
          guidance="Standard bedroom count from listing."
          optional
        >
          <input
            id="bedrooms"
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
            placeholder="3"
            value={values.bedrooms ?? ""}
            onChange={setNum("bedrooms")}
            className={inputClass}
          />
        </GuidedInput>

        <GuidedInput
          label="Bathrooms"
          htmlFor="bathrooms"
          guidance="Full + half baths combined (e.g. 2.5)."
          optional
        >
          <input
            id="bathrooms"
            type="number"
            inputMode="decimal"
            step="0.5"
            min={0}
            max={20}
            placeholder="2.5"
            value={values.bathrooms ?? ""}
            onChange={setNum("bathrooms", true)}
            className={inputClass}
          />
        </GuidedInput>

        <GuidedInput
          label="Square footage"
          htmlFor="sqft"
          guidance="Heated/finished square footage."
          optional
        >
          <input
            id="sqft"
            type="number"
            inputMode="numeric"
            min={100}
            max={50000}
            placeholder="1850"
            value={values.sqft ?? ""}
            onChange={setNum("sqft")}
            className={inputClass}
          />
        </GuidedInput>

        <GuidedInput
          label="Lot size (sqft)"
          htmlFor="lot-sqft"
          guidance="Total lot in square feet. Most listings show this."
          optional
        >
          <input
            id="lot-sqft"
            type="number"
            inputMode="numeric"
            min={0}
            max={10_000_000}
            placeholder="6500"
            value={values.lotSqft ?? ""}
            onChange={setNum("lotSqft")}
            className={inputClass}
          />
        </GuidedInput>
      </div>
    </div>
  );
}
