import { auth, currentUser } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

import { resolveAppUser } from "@/lib/db/queries/users";
import { getPropertyForOrg } from "@/lib/db/queries/properties";
import {
  getVerdictForOrg,
  listVerdictsForProperty,
} from "@/lib/db/queries/verdicts";
import { getVerdictFeedbackForUser } from "@/lib/db/queries/verdict-feedback";

import { StreamingVerdict } from "@/components/verdict-generating/streaming-verdict";
import { VerdictDetailView } from "@/components/verdict-detail/verdict-detail-view";
import { VerdictFailedCard } from "@/components/verdict-detail/verdict-failed-card";

/**
 * /app/properties/[propertyId]/verdicts/[verdictId] — canonical
 * URL for a single verdict (M3.3). Each generation gets its own
 * permalink; users land here via the run-history rail or the
 * /app/properties/[propertyId] redirect to latest.
 */
export default async function VerdictDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string; verdictId: string }>;
}) {
  const { propertyId, verdictId } = await params;
  await auth.protect();

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("unreachable");
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    "";
  const name =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() ||
    null;
  const appUser = await resolveAppUser(clerkUserId, email, name);
  if (!appUser) throw new Error("User soft-deleted");

  const property = await getPropertyForOrg({
    propertyId,
    orgId: appUser.orgId,
  });
  if (!property) notFound();

  const verdict = await getVerdictForOrg({ verdictId, orgId: appUser.orgId });
  if (!verdict || verdict.propertyId !== propertyId) notFound();

  const addressFull =
    property.addressFull ??
    `${property.addressLine1}, ${property.city}, ${property.state} ${property.zip}`;

  const propertyForView = { id: propertyId, addressFull };

  // Pending: render the M3.2 streaming UI in place.
  if (verdict.status === "pending") {
    return (
      <div className="flex flex-1 flex-col bg-paper">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-8 md:px-12 md:py-12">
          <StreamingVerdict
            verdictId={verdict.id}
            addressFull={addressFull}
          />
        </div>
      </div>
    );
  }

  // Failed: render the friendlier failed-card with FHA-aware
  // messaging.
  if (verdict.status === "failed") {
    return (
      <div className="flex flex-1 flex-col bg-paper">
        <div className="mx-auto w-full max-w-[900px] px-6 py-12 md:px-12">
          <VerdictFailedCard
            verdictId={verdict.id}
            propertyId={propertyId}
            addressFull={addressFull}
            errorMessage={verdict.errorMessage}
          />
        </div>
      </div>
    );
  }

  // Ready: full detail view + run history + feedback.
  const [runHistory, myFeedback] = await Promise.all([
    listVerdictsForProperty({
      propertyId,
      orgId: appUser.orgId,
      limit: 10,
    }),
    getVerdictFeedbackForUser({
      verdictId: verdict.id,
      userId: appUser.userId,
    }),
  ]);

  return (
    <VerdictDetailView
      property={propertyForView}
      verdict={verdict}
      runHistory={runHistory}
      myFeedback={myFeedback}
    />
  );
}

export const dynamic = "force-dynamic";

void redirect; // imported for type-completeness; future "no verdicts" branch may use it
