"use client";

import {
  Coins,
  Heart,
  Scale,
  Sprout,
  TrendingUp,
} from "lucide-react";

import {
  type PropertyGoalType,
  type PropertyThesisType,
  VALID_GOALS_PER_THESIS,
} from "@/lib/onboarding/schema";

const GOAL_LABELS: Record<
  PropertyGoalType,
  { icon: typeof Coins; title: string; desc: string }
> = {
  cap_rate: {
    icon: Coins,
    title: "Cap rate",
    desc: "Cash flow now. Monthly profit matters more than future value.",
  },
  appreciation: {
    icon: TrendingUp,
    title: "Appreciation",
    desc: "Long-term value growth. I can carry costs to ride the market.",
  },
  both: {
    icon: Scale,
    title: "Both",
    desc: "Balanced. I want both cash flow and appreciation.",
  },
  lifestyle: {
    icon: Heart,
    title: "Lifestyle",
    desc: "I'm buying for where I want to live. Investment is secondary.",
  },
  flip_profit: {
    icon: Sprout,
    title: "Flip profit",
    desc: "Buy, improve, sell for profit. The renovation IS the investment.",
  },
};

export function Step2Goal({
  thesisType,
  goalType,
  onChange,
}: {
  thesisType: PropertyThesisType;
  goalType: PropertyGoalType | null;
  onChange: (next: PropertyGoalType) => void;
}) {
  const allowed = VALID_GOALS_PER_THESIS[thesisType];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="font-serif text-[28px] leading-[1.2] tracking-[-0.02em] text-ink md:text-[34px]">
          What&rsquo;s your primary goal?
        </h2>
        <p className="text-[15px] leading-[1.55] text-ink-muted">
          Used to weight the verdict. A &ldquo;cap rate&rdquo; investor and an
          &ldquo;appreciation&rdquo; investor will see different signals on the
          same property.
        </p>
      </header>

      <div
        role="radiogroup"
        aria-label="Primary goal"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {allowed.map((id) => {
          const opt = GOAL_LABELS[id];
          const Icon = opt.icon;
          const selected = goalType === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(id)}
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
    </div>
  );
}
