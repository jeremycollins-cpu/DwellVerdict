import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";

import { VerdictCertificate } from "@/components/verdict-certificate";
import { PropertyStageNav } from "@/components/property-stage-nav";
import { IntakePromptBanner } from "@/components/property-intake/intake-prompt-banner";
import {
  classifyIntakeBanner,
  getPropertyForOrg,
  isIntakeComplete,
} from "@/lib/db/queries/properties";
import { getLatestVerdictForProperty } from "@/lib/db/queries/verdicts";
import { resolveAppUser } from "@/lib/db/queries/users";

/**
 * Property detail page — post-paste destination AND verdict
 * gateway.
 *
 * Routing logic (in order):
 *   1. If a verdict exists, redirect to it. The verdict-detail page
 *      handles the banner for incomplete intake.
 *   2. If intake is incomplete (new property or partial wizard),
 *      redirect to /intake. The user finishes intake there, which
 *      kicks off verdict generation.
 *   3. Else (intake complete but verdict missing — rare edge case
 *      where a verdict was deleted), render a "no verdict" surface
 *      so the user can re-trigger generation.
 */
export default async function PropertyDetailPage({
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

  const verdict = await getLatestVerdictForProperty({
    propertyId,
    orgId: appUser.orgId,
  });

  // 1. Verdict exists → its detail page handles intake banner + UI.
  if (verdict) {
    redirect(`/app/properties/${propertyId}/verdicts/${verdict.id}`);
  }

  // 2. Intake incomplete → wizard.
  if (!isIntakeComplete(property)) {
    redirect(`/app/properties/${propertyId}/intake`);
  }

  const addressFull =
    property.addressFull ??
    `${property.addressLine1}, ${property.city}, ${property.state} ${property.zip}`;

  const bannerState = classifyIntakeBanner(property);

  // 3. Intake complete but verdict deleted — show a placeholder card
  //    so the user can manually re-trigger generation. This branch is
  //    rare in production.
  return (
    <div className="flex flex-1 flex-col bg-paper">
      <section className="container flex flex-col gap-6 py-10">
        <Link
          href="/app/properties"
          className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All properties
        </Link>

        <div className="flex flex-col gap-1">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Property
          </p>
          <h1 className="font-mono text-xl text-ink">{addressFull}</h1>
        </div>

        {bannerState !== "none" ? (
          <IntakePromptBanner
            state={bannerState}
            propertyId={propertyId}
            resumeStep={property.intakeStepCompleted ?? 0}
          />
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <PropertyStageNav propertyId={propertyId} active="finding" />
          <Link
            href={`/app/properties/${propertyId}/scout`}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-card px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink transition-colors hover:bg-paper"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ask Scout
          </Link>
        </div>

        <VerdictCertificate mode="placeholder" />
      </section>
    </div>
  );
}
