import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { resolveAppUser } from "@/lib/db/queries/users";
import {
  getPropertyForOrg,
  isIntakeComplete,
} from "@/lib/db/queries/properties";
import { getLatestVerdictForProperty } from "@/lib/db/queries/verdicts";

import { WizardShell } from "@/components/property-intake/wizard-shell";

/**
 * Intake wizard host route — `/app/properties/[propertyId]/intake`.
 *
 * Server component that fetches the property, hydrates the wizard's
 * initial state from the DB row, and computes the resume step from
 * `intake_step_completed`. If intake is already complete, redirects
 * to the latest verdict (so the URL doesn't accidentally resurrect
 * a finished wizard).
 *
 * Pre-fill from user-level onboarding (M3.4) is intentionally
 * deferred — the read-side hooks live in `WizardShell` but treat
 * `users.strategy_focus` as always-null until M3.4 ships and starts
 * populating it.
 */
export default async function IntakePage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  await auth.protect();

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("unreachable");
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    "";
  const name =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() || null;

  const appUser = await resolveAppUser(clerkUserId, email, name);
  if (!appUser) throw new Error("User soft-deleted");

  const property = await getPropertyForOrg({ propertyId, orgId: appUser.orgId });
  if (!property) notFound();

  // Already onboarded? Send the user back to the verdict (or to the
  // property detail page if no verdict has been generated yet, which
  // shouldn't happen post-submit but is defended against).
  if (isIntakeComplete(property)) {
    const latest = await getLatestVerdictForProperty({
      propertyId,
      orgId: appUser.orgId,
    });
    if (latest) {
      redirect(`/app/properties/${propertyId}/verdicts/${latest.id}`);
    }
    redirect(`/app/properties/${propertyId}`);
  }

  const addressFull =
    property.addressFull ??
    `${property.addressLine1}, ${property.city}, ${property.state} ${property.zip}`;

  const startStep = Math.min(7, Math.max(1, property.intakeStepCompleted + 1));

  return (
    <div className="flex flex-1 flex-col bg-paper">
      <section className="container flex flex-col gap-8 py-10">
        <Link
          href={`/app/properties/${propertyId}`}
          className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to property
        </Link>

        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-terracotta">
            Property intake
          </p>
          <h1 className="font-serif text-[34px] leading-[1.1] tracking-[-0.02em] text-ink md:text-[42px]">
            Tell us about this property.
          </h1>
          <p className="text-[15px] text-ink-muted">
            {addressFull} · 5 minutes · save and finish later anytime
          </p>
        </div>

        <WizardShell
          propertyId={propertyId}
          startStep={startStep}
          initial={{
            thesisType:
              (property.thesisType as
                | "str"
                | "ltr"
                | "owner_occupied"
                | "house_hacking"
                | "flipping"
                | "other"
                | null) ?? null,
            thesisOtherDescription: property.thesisOtherDescription ?? null,
            goalType:
              (property.goalType as
                | "cap_rate"
                | "appreciation"
                | "both"
                | "lifestyle"
                | "flip_profit"
                | null) ?? null,
            yearBuilt: property.yearBuilt ?? null,
            bedrooms: property.bedrooms ?? null,
            bathrooms: property.bathrooms ? Number(property.bathrooms) : null,
            sqft: property.sqft ?? null,
            lotSqft: property.lotSqft ?? null,
            listingPriceCents: property.listingPriceCents ?? null,
            userOfferPriceCents: property.userOfferPriceCents ?? null,
            estimatedValueCents: property.estimatedValueCents ?? null,
            annualPropertyTaxCents: property.annualPropertyTaxCents ?? null,
            annualInsuranceEstimateCents:
              property.annualInsuranceEstimateCents ?? null,
            monthlyHoaFeeCents: property.monthlyHoaFeeCents ?? null,
            strExpectedNightlyRateCents:
              property.strExpectedNightlyRateCents ?? null,
            strExpectedOccupancy: property.strExpectedOccupancy
              ? Number(property.strExpectedOccupancy)
              : null,
            strCleaningFeeCents: property.strCleaningFeeCents ?? null,
            strAvgLengthOfStayDays: property.strAvgLengthOfStayDays ?? null,
            ltrExpectedMonthlyRentCents:
              property.ltrExpectedMonthlyRentCents ?? null,
            ltrVacancyRate: property.ltrVacancyRate
              ? Number(property.ltrVacancyRate)
              : null,
            ltrExpectedAppreciationRate: property.ltrExpectedAppreciationRate
              ? Number(property.ltrExpectedAppreciationRate)
              : null,
            downPaymentPercent: property.downPaymentPercent
              ? Number(property.downPaymentPercent)
              : null,
            mortgageRate: property.mortgageRate
              ? Number(property.mortgageRate)
              : null,
            mortgageTermYears: property.mortgageTermYears ?? null,
            renovationBudgetCents: property.renovationBudgetCents ?? null,
            flippingArvEstimateCents:
              property.flippingArvEstimateCents ?? null,
            intakeStepCompleted: property.intakeStepCompleted ?? 0,
            state: property.state ?? null,
          }}
        />
      </section>
    </div>
  );
}
