"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Loader2, Save } from "lucide-react";

import {
  saveIntakeStepAction,
  submitIntakeAction,
} from "@/app/app/properties/[propertyId]/intake/actions";
import {
  type IntakeStepNumber,
  INTAKE_TOTAL_STEPS,
  type PropertyGoalType,
  type PropertyThesisType,
  VALID_GOALS_PER_THESIS,
} from "@/lib/onboarding/schema";

import { ProgressIndicator } from "./progress-indicator";
import { Step1Thesis } from "./step-1-thesis";
import { Step2Goal } from "./step-2-goal";
import { Step3Fundamentals } from "./step-3-fundamentals";
import { Step4Pricing } from "./step-4-pricing";
import { Step5Costs } from "./step-5-costs";
import { Step6ThesisSpecific } from "./step-6-thesis-specific";
import { Step7Review, type IntakeReviewData } from "./step-7-review";

/**
 * WizardShell — client component holding the cross-step state and
 * coordinating the per-step "Save and continue" + final submit.
 *
 * State model:
 *   - All field values live in `formState`, hydrated from the
 *     server's snapshot of the property row.
 *   - Each "Next" calls `saveIntakeStepAction(step, partial)` which
 *     validates the step's payload, persists it, and bumps
 *     `intake_step_completed`.
 *   - Final submit (step 7) calls `submitIntakeAction(full payload)`
 *     which validates the whole thing, consumes a report slot, marks
 *     intake complete, creates a pending verdict, and redirects to
 *     the streaming verdict page.
 *
 * The "Save and finish later" button does the same write as Next
 * but routes back to the property detail page instead of advancing.
 */

export type WizardInitial = IntakeReviewData & {
  intakeStepCompleted: number;
  state: string | null;
};

export function WizardShell({
  propertyId,
  initial,
  startStep,
}: {
  propertyId: string;
  initial: WizardInitial;
  startStep: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<number>(startStep);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] =
    useState<{ kind: "rate_limited" | "other"; message: string; resetAt?: string } | null>(null);

  const [formState, setFormState] = useState<IntakeReviewData>(initial);

  const update = (patch: Partial<IntakeReviewData>) => {
    setFormState((prev) => ({ ...prev, ...patch }));
  };

  const furthestReached = Math.max(
    initial.intakeStepCompleted,
    step - 1,
  );

  const handleStepSubmit = (
    nextStep: number,
    persistOnly = false,
  ) => {
    setError(null);
    if (step === 1) {
      if (!formState.thesisType) {
        setError("Pick a thesis to continue.");
        return;
      }
    }
    if (step === 2) {
      if (!formState.thesisType || !formState.goalType) {
        setError("Pick a goal to continue.");
        return;
      }
      const allowed = VALID_GOALS_PER_THESIS[formState.thesisType];
      if (!allowed.includes(formState.goalType)) {
        setError("That goal isn't valid for the selected thesis.");
        return;
      }
    }

    const stepPayload = stepPayloadFromState(step as IntakeStepNumber, formState);
    if (!stepPayload) return;

    startTransition(async () => {
      const res = await saveIntakeStepAction({
        propertyId,
        step: step as IntakeStepNumber,
        payload: stepPayload,
      });
      if (!res.ok) {
        setError(res.message ?? "Couldn't save. Try again.");
        return;
      }
      if (persistOnly) {
        router.push(`/app/properties/${propertyId}`);
        router.refresh();
        return;
      }
      setStep(nextStep);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const handleSubmit = () => {
    setSubmitError(null);
    const payload = buildSubmitPayload(formState);
    startTransition(async () => {
      const res = await submitIntakeAction({
        propertyId,
        payload,
      });
      // submitIntakeAction redirects on success; we only get a
      // returned value on error.
      if (res && !res.ok) {
        if (res.error === "rate_limited" || res.error === "free_trial_used" || res.error === "monthly_cap_reached" || res.error === "subscription_canceled") {
          setSubmitError({
            kind: "rate_limited",
            message:
              res.error === "free_trial_used"
                ? "You've used your free trial verdict. Upgrade to generate more."
                : res.error === "monthly_cap_reached"
                  ? "You've hit your monthly verdict cap. Resets at the start of next month."
                  : res.error === "subscription_canceled"
                    ? "Your subscription is canceled. Re-subscribe to generate verdicts."
                    : res.message ?? "Rate limited.",
            resetAt: res.resetAt,
          });
        } else {
          setSubmitError({
            kind: "other",
            message: res.message ?? "Submit failed. Try again.",
          });
        }
      }
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <ProgressIndicator current={step} furthestReached={furthestReached} />

      <div className="rounded-xl border border-hairline bg-paper p-6 md:p-10">
        {step === 1 ? (
          <Step1Thesis
            thesisType={formState.thesisType}
            thesisOtherDescription={formState.thesisOtherDescription ?? ""}
            onChange={({ thesisType, thesisOtherDescription }) => {
              const allowed = VALID_GOALS_PER_THESIS[thesisType];
              const goalStillValid =
                formState.goalType && allowed.includes(formState.goalType);
              update({
                thesisType,
                thesisOtherDescription,
                goalType: goalStillValid ? formState.goalType : null,
              });
            }}
          />
        ) : null}

        {step === 2 && formState.thesisType ? (
          <Step2Goal
            thesisType={formState.thesisType as PropertyThesisType}
            goalType={formState.goalType as PropertyGoalType | null}
            onChange={(goalType) => update({ goalType })}
          />
        ) : null}

        {step === 3 ? (
          <Step3Fundamentals
            values={{
              yearBuilt: formState.yearBuilt,
              bedrooms: formState.bedrooms,
              bathrooms: formState.bathrooms,
              sqft: formState.sqft,
              lotSqft: formState.lotSqft,
            }}
            onChange={(patch) => update(patch)}
          />
        ) : null}

        {step === 4 ? (
          <Step4Pricing
            values={{
              listingPriceCents: formState.listingPriceCents,
              userOfferPriceCents: formState.userOfferPriceCents,
              estimatedValueCents: formState.estimatedValueCents,
            }}
            onChange={(patch) => update(patch)}
          />
        ) : null}

        {step === 5 ? (
          <Step5Costs
            values={{
              annualPropertyTaxCents: formState.annualPropertyTaxCents,
              annualInsuranceEstimateCents: formState.annualInsuranceEstimateCents,
              monthlyHoaFeeCents: formState.monthlyHoaFeeCents,
            }}
            state={initial.state}
            onChange={(patch) => update(patch)}
          />
        ) : null}

        {step === 6 && formState.thesisType ? (
          <Step6ThesisSpecific
            thesisType={formState.thesisType}
            values={{
              strExpectedNightlyRateCents: formState.strExpectedNightlyRateCents,
              strExpectedOccupancy: formState.strExpectedOccupancy,
              strCleaningFeeCents: formState.strCleaningFeeCents,
              strAvgLengthOfStayDays: formState.strAvgLengthOfStayDays,
              ltrExpectedMonthlyRentCents: formState.ltrExpectedMonthlyRentCents,
              ltrVacancyRate: formState.ltrVacancyRate,
              ltrExpectedAppreciationRate: formState.ltrExpectedAppreciationRate,
              downPaymentPercent: formState.downPaymentPercent,
              mortgageRate: formState.mortgageRate,
              mortgageTermYears: formState.mortgageTermYears,
              renovationBudgetCents: formState.renovationBudgetCents,
              flippingArvEstimateCents: formState.flippingArvEstimateCents,
            }}
            onChange={(patch) => update(patch)}
          />
        ) : null}

        {step === 7 ? (
          <Step7Review data={formState} onEdit={(s) => setStep(s)} />
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-pass-border bg-pass-soft px-3 py-2 text-sm text-pass">
          {error}
        </div>
      ) : null}

      {submitError ? (
        <div
          className={`rounded-md border px-3 py-2.5 text-sm ${
            submitError.kind === "rate_limited"
              ? "border-watch-border bg-watch-soft text-ink"
              : "border-pass-border bg-pass-soft text-pass"
          }`}
        >
          <p className="font-medium">{submitError.message}</p>
          {submitError.resetAt ? (
            <p className="mt-1 text-ink-muted">
              Resets {new Date(submitError.resetAt).toLocaleDateString()}.
            </p>
          ) : null}
        </div>
      ) : null}

      <NavBar
        step={step}
        pending={pending}
        canSaveLater={step >= 1}
        onBack={() => {
          setError(null);
          setStep((s) => Math.max(1, s - 1));
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onNext={() => handleStepSubmit(Math.min(step + 1, INTAKE_TOTAL_STEPS))}
        onSaveLater={() => handleStepSubmit(step, true)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function NavBar({
  step,
  pending,
  canSaveLater,
  onBack,
  onNext,
  onSaveLater,
  onSubmit,
}: {
  step: number;
  pending: boolean;
  canSaveLater: boolean;
  onBack: () => void;
  onNext: () => void;
  onSaveLater: () => void;
  onSubmit: () => void;
}) {
  const isFinal = step === INTAKE_TOTAL_STEPS;
  return (
    <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-hairline bg-paper/95 px-4 py-4 backdrop-blur md:relative md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
      <button
        type="button"
        onClick={onBack}
        disabled={pending || step === 1}
        className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ArrowLeft className="size-3.5" />
        Back
      </button>

      <div className="flex items-center gap-2">
        {canSaveLater && !isFinal ? (
          <button
            type="button"
            onClick={onSaveLater}
            disabled={pending}
            className="hidden items-center gap-1.5 rounded-md border border-hairline-strong px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 sm:inline-flex"
          >
            <Save className="size-3.5" />
            Save and finish later
          </button>
        ) : null}

        {isFinal ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-terracotta px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-terracotta-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ArrowRight className="size-3.5" />
            )}
            Submit and generate verdict
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <>
                Next
                <ArrowRight className="size-3.5" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function stepPayloadFromState(
  step: IntakeStepNumber,
  s: IntakeReviewData,
): Record<string, unknown> | null {
  switch (step) {
    case 1:
      return {
        thesisType: s.thesisType,
        thesisOtherDescription: s.thesisOtherDescription,
      };
    case 2:
      return { goalType: s.goalType };
    case 3:
      return {
        yearBuilt: s.yearBuilt,
        bedrooms: s.bedrooms,
        bathrooms: s.bathrooms,
        sqft: s.sqft,
        lotSqft: s.lotSqft,
      };
    case 4:
      return {
        listingPriceCents: s.listingPriceCents,
        userOfferPriceCents: s.userOfferPriceCents,
        estimatedValueCents: s.estimatedValueCents,
      };
    case 5:
      return {
        annualPropertyTaxCents: s.annualPropertyTaxCents,
        annualInsuranceEstimateCents: s.annualInsuranceEstimateCents,
        monthlyHoaFeeCents: s.monthlyHoaFeeCents,
      };
    case 6:
      return {
        strExpectedNightlyRateCents: s.strExpectedNightlyRateCents,
        strExpectedOccupancy: s.strExpectedOccupancy,
        strCleaningFeeCents: s.strCleaningFeeCents,
        strAvgLengthOfStayDays: s.strAvgLengthOfStayDays,
        ltrExpectedMonthlyRentCents: s.ltrExpectedMonthlyRentCents,
        ltrVacancyRate: s.ltrVacancyRate,
        ltrExpectedAppreciationRate: s.ltrExpectedAppreciationRate,
        downPaymentPercent: s.downPaymentPercent,
        mortgageRate: s.mortgageRate,
        mortgageTermYears: s.mortgageTermYears,
        renovationBudgetCents: s.renovationBudgetCents,
        flippingArvEstimateCents: s.flippingArvEstimateCents,
      };
    default:
      return null;
  }
}

function buildSubmitPayload(s: IntakeReviewData): Record<string, unknown> {
  return {
    thesisType: s.thesisType,
    thesisOtherDescription: s.thesisOtherDescription || null,
    goalType: s.goalType,
    yearBuilt: s.yearBuilt,
    bedrooms: s.bedrooms,
    bathrooms: s.bathrooms,
    sqft: s.sqft,
    lotSqft: s.lotSqft,
    listingPriceCents: s.listingPriceCents,
    userOfferPriceCents: s.userOfferPriceCents,
    estimatedValueCents: s.estimatedValueCents,
    annualPropertyTaxCents: s.annualPropertyTaxCents,
    annualInsuranceEstimateCents: s.annualInsuranceEstimateCents,
    monthlyHoaFeeCents: s.monthlyHoaFeeCents,
    strExpectedNightlyRateCents: s.strExpectedNightlyRateCents,
    strExpectedOccupancy: s.strExpectedOccupancy,
    strCleaningFeeCents: s.strCleaningFeeCents,
    strAvgLengthOfStayDays: s.strAvgLengthOfStayDays,
    ltrExpectedMonthlyRentCents: s.ltrExpectedMonthlyRentCents,
    ltrVacancyRate: s.ltrVacancyRate,
    ltrExpectedAppreciationRate: s.ltrExpectedAppreciationRate,
    downPaymentPercent: s.downPaymentPercent,
    mortgageRate: s.mortgageRate,
    mortgageTermYears: s.mortgageTermYears,
    renovationBudgetCents: s.renovationBudgetCents,
    flippingArvEstimateCents: s.flippingArvEstimateCents,
  };
}
