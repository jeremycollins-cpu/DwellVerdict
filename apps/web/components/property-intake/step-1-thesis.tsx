"use client";

import {
  Home,
  MoreHorizontal,
  Sun,
  User,
  Users,
  Wrench,
} from "lucide-react";

import type { PropertyThesisType } from "@/lib/onboarding/schema";

const OPTIONS: ReadonlyArray<{
  id: PropertyThesisType;
  icon: typeof Sun;
  title: string;
  desc: string;
}> = [
  {
    id: "str",
    icon: Sun,
    title: "STR (Vacation Rental)",
    desc: "Short-term rentals like Airbnb or VRBO. Designed for travelers.",
  },
  {
    id: "ltr",
    icon: Home,
    title: "LTR (Long-term Rental)",
    desc: "Rented to tenants on annual leases. Steady income.",
  },
  {
    id: "owner_occupied",
    icon: User,
    title: "Owner-occupied",
    desc: "Your primary residence or second home.",
  },
  {
    id: "house_hacking",
    icon: Users,
    title: "House Hacking",
    desc: "Live in part, rent the rest. ADU, duplex, or roommate setup.",
  },
  {
    id: "flipping",
    icon: Wrench,
    title: "Flipping",
    desc: "Buy, renovate, sell within 12 months.",
  },
  {
    id: "other",
    icon: MoreHorizontal,
    title: "Other",
    desc: "Something else (we'll ask you to describe it).",
  },
];

export function Step1Thesis({
  thesisType,
  thesisOtherDescription,
  onChange,
}: {
  thesisType: PropertyThesisType | null;
  thesisOtherDescription: string;
  onChange: (next: {
    thesisType: PropertyThesisType;
    thesisOtherDescription: string;
  }) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="font-serif text-[28px] leading-[1.2] tracking-[-0.02em] text-ink md:text-[34px]">
          What&rsquo;s your investment thesis for this property?
        </h2>
        <p className="text-[15px] leading-[1.55] text-ink-muted">
          We tailor the verdict and downstream guidance to what you&rsquo;re
          actually trying to do — short-term rental economics differ wildly
          from a primary residence.
        </p>
      </header>

      <div
        role="radiogroup"
        aria-label="Investment thesis"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = thesisType === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() =>
                onChange({
                  thesisType: opt.id,
                  thesisOtherDescription:
                    opt.id === "other" ? thesisOtherDescription : "",
                })
              }
              className={`flex flex-col gap-2.5 rounded-[10px] border bg-card-ink p-5 text-left transition-all ${
                selected
                  ? "border-terracotta shadow-[0_0_0_3px_rgba(197,90,63,0.12)]"
                  : "border-hairline hover:border-hairline-strong"
              }`}
            >
              <span
                className={`inline-flex size-9 items-center justify-center rounded-lg ${
                  selected
                    ? "bg-terracotta-soft text-terracotta"
                    : "bg-paper-warm text-ink-70"
                }`}
              >
                <Icon className="size-[18px]" strokeWidth={1.75} />
              </span>
              <h3 className="text-[15px] font-medium leading-[1.3] text-ink">
                {opt.title}
              </h3>
              <p className="text-[13px] leading-[1.5] text-ink-muted">
                {opt.desc}
              </p>
            </button>
          );
        })}
      </div>

      {thesisType === "other" ? (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="thesis-other"
            className="text-[14px] font-medium text-ink"
          >
            Describe your investment thesis
          </label>
          <textarea
            id="thesis-other"
            value={thesisOtherDescription}
            onChange={(e) =>
              onChange({
                thesisType: "other",
                thesisOtherDescription: e.target.value,
              })
            }
            placeholder="e.g. land banking, mid-term corporate rental, sober-living facility..."
            rows={3}
            maxLength={2000}
            className="w-full rounded-md border border-hairline bg-card-ink px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/20"
          />
        </div>
      ) : null}
    </div>
  );
}
