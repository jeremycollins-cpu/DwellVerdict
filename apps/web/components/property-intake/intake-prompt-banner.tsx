import Link from "next/link";
import { ArrowRight, ClipboardList, Sparkles } from "lucide-react";

import type { IntakeBannerState } from "@/lib/db/queries/properties";

/**
 * Banner shown above the verdict / property surface when intake is
 * incomplete. Two flavors:
 *
 *   - `hard`: nothing set (new property OR one of the 2 unknown
 *     legacy properties). Verdict regenerate is blocked until this
 *     is dismissed by completing the wizard. Strong terracotta
 *     treatment.
 *
 *   - `soft`: thesis backfilled but other fields blank (the 3 known
 *     legacy properties). Existing verdict is still useful; the
 *     intake just sharpens future regenerations. Calmer treatment.
 *
 * Banner doesn't render at all when `state === 'none'`.
 */
export function IntakePromptBanner({
  state,
  propertyId,
  resumeStep,
}: {
  state: IntakeBannerState;
  propertyId: string;
  /** 0 if never started; otherwise the highest step the user reached. */
  resumeStep: number;
}) {
  if (state === "none") return null;

  const isHard = state === "hard";
  const Icon = isHard ? ClipboardList : Sparkles;
  const headline = isHard
    ? "Complete property intake to unlock thesis-aware verdicts."
    : "Add property details for more accurate verdicts.";
  const body = isHard
    ? "We need your thesis, pricing, and a few cost inputs before we can regenerate this verdict with full thesis-aware analysis."
    : "Your thesis is set; filling in pricing and assumptions sharpens future verdict regenerations and unlocks the what-if calculator.";
  const cta = resumeStep > 0 ? `Resume intake (step ${resumeStep + 1} of 7)` : "Complete intake (5 minutes)";

  return (
    <div
      className={`flex flex-col gap-3 rounded-[10px] border p-5 sm:flex-row sm:items-start sm:gap-4 ${
        isHard
          ? "border-terracotta-border bg-terracotta-soft"
          : "border-watch-border bg-watch-soft"
      }`}
    >
      <span
        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${
          isHard ? "bg-terracotta text-white" : "bg-card-ink text-ink-70"
        }`}
      >
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </span>
      <div className="flex flex-1 flex-col gap-1.5">
        <h3 className="text-[15px] font-medium leading-[1.3] text-ink">
          {headline}
        </h3>
        <p className="text-[13.5px] leading-[1.5] text-ink-muted">{body}</p>
      </div>
      <Link
        href={`/app/properties/${propertyId}/intake`}
        className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          isHard
            ? "bg-ink text-paper hover:bg-ink-70"
            : "border border-hairline-strong bg-card-ink text-ink hover:border-ink"
        }`}
      >
        {cta}
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
