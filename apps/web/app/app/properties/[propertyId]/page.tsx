import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";

import { VerdictCertificate } from "@/components/verdict-certificate";
import { PropertyStageNav } from "@/components/property-stage-nav";
import { getPropertyForOrg } from "@/lib/db/queries/properties";
import { getLatestVerdictForProperty } from "@/lib/db/queries/verdicts";
import { resolveAppUser } from "@/lib/db/queries/users";

/**
 * Property detail page — post-paste destination AND verdict
 * gateway. After M3.3, when a verdict exists (in any status) we
 * redirect to its canonical URL at
 * `/app/properties/[propertyId]/verdicts/[verdictId]`.
 *
 * The only state that renders here is "no verdict yet" — a clean
 * landing where the user can manually trigger generation. In the
 * common path (createPropertyAction insert + redirect), this page
 * never renders to the user.
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

  // If a verdict exists, redirect to its canonical URL. Pending
  // verdicts redirect too — the verdict-detail route renders the
  // streaming UI for that state.
  if (verdict) {
    redirect(`/app/properties/${propertyId}/verdicts/${verdict.id}`);
  }

  const addressFull =
    property.addressFull ??
    `${property.addressLine1}, ${property.city}, ${property.state} ${property.zip}`;

  // No-verdict state — rare in production (createPropertyAction
  // pre-creates a pending row) but possible if the row was deleted.
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
