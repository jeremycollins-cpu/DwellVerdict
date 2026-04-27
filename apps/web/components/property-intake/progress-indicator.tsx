import { Check } from "lucide-react";

const STEP_LABELS = [
  "Thesis",
  "Goal",
  "Property",
  "Pricing",
  "Costs",
  "Details",
  "Review",
] as const;

/**
 * 7-step progress indicator. Above md, renders a labeled dot row
 * with connecting lines. On small screens collapses to "Step X of 7"
 * + the current step's label so it doesn't crowd the form.
 *
 * `current` is 1-indexed (matches `intake_step_completed + 1` for
 * resume). `furthestReached` lets us style steps the user has
 * already advanced past as `complete` (the green check dot) while
 * keeping the active one ringed.
 */
export function ProgressIndicator({
  current,
  furthestReached,
}: {
  current: number;
  furthestReached: number;
}) {
  return (
    <div>
      <div className="hidden md:flex md:items-center md:gap-2">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1;
          const isCurrent = stepNum === current;
          const isComplete = stepNum < current || stepNum <= furthestReached;
          const isLast = stepNum === STEP_LABELS.length;
          return (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex size-8 items-center justify-center rounded-full border text-[12px] font-medium transition-colors ${
                    isCurrent
                      ? "border-terracotta bg-terracotta text-white"
                      : isComplete
                        ? "border-buy-border bg-buy-soft text-buy"
                        : "border-hairline bg-card-ink text-ink-muted"
                  }`}
                >
                  {isComplete && !isCurrent ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : (
                    stepNum
                  )}
                </div>
                <span
                  className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
                    isCurrent ? "text-ink" : "text-ink-muted"
                  }`}
                >
                  {label}
                </span>
              </div>
              {!isLast ? (
                <div
                  className={`-mt-5 h-px flex-1 ${
                    isComplete ? "bg-buy-border" : "bg-hairline"
                  }`}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex items-baseline justify-between md:hidden">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          Step {current} of {STEP_LABELS.length}
        </div>
        <div className="text-[14px] font-medium text-ink">
          {STEP_LABELS[current - 1]}
        </div>
      </div>
    </div>
  );
}
