import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { VerdictCertificate } from "@/components/verdict-certificate";
import { VerdictLoader } from "@/app/app/properties/[propertyId]/verdict-loader";
import { PropertyStageNav } from "@/components/property-stage-nav";
import { getPropertyForOrg } from "@/lib/db/queries/properties";
import { getLatestVerdictForProperty } from "@/lib/db/queries/verdicts";
import { resolveAppUser } from "@/lib/db/queries/users";

/**
 * Property detail page — the post-paste destination.
 *
 * Three render states driven by latest verdict row:
 *   - ready   → render VerdictCertificate with real data
 *   - pending → render a placeholder skeleton, VerdictLoader (client)
 *               POSTs to /api/verdicts/[id]/generate to complete
 *   - failed  → render a retry affordance, same VerdictLoader handles
 *               it (POST is idempotent)
 *
 * No verdict at all is theoretically possible (property row exists
 * without any verdicts) — in that case we render the no-verdict
 * state and let the user manually trigger generation. Sprint 2
 * shouldn't hit this path normally because createPropertyAction
 * creates a pending row for every new property.
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

  const addressFull =
    property.addressFull ??
    `${property.addressLine1}, ${property.city}, ${property.state} ${property.zip}`;

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

        <PropertyStageNav propertyId={propertyId} active="finding" />

        {verdict && verdict.status === "ready" ? (
          <VerdictCertificate
            mode="ready"
            data={{
              addressFull,
              signal: verdict.signal as "buy" | "watch" | "pass",
              confidence: verdict.confidence ?? 0,
              summary: verdict.summary ?? "",
              narrative: verdict.narrative ?? "",
              dataPoints: (verdict.dataPoints as {
                comps: string;
                revenue: string;
                regulatory: string;
                location: string;
              }) ?? {
                comps: "",
                revenue: "",
                regulatory: "",
                location: "",
              },
              sources: Array.isArray(verdict.sources)
                ? (verdict.sources as string[])
                : [],
            }}
          />
        ) : verdict && verdict.status === "pending" ? (
          <>
            <VerdictCertificate mode="pending" addressFull={addressFull} />
            <VerdictLoader verdictId={verdict.id} />
          </>
        ) : verdict && verdict.status === "failed" ? (
          <VerdictFailedCard
            verdictId={verdict.id}
            addressFull={addressFull}
            errorMessage={verdict.errorMessage}
          />
        ) : (
          <VerdictCertificate mode="placeholder" />
        )}
      </section>
    </div>
  );
}

function VerdictFailedCard({
  verdictId,
  addressFull,
  errorMessage,
}: {
  verdictId: string;
  addressFull: string;
  errorMessage: string | null;
}) {
  return (
    <>
      <div className="relative overflow-hidden rounded-[14px] bg-card shadow-card">
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] bg-signal-pass"
        />
        <div className="flex flex-col gap-4 p-8 pl-10">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-signal-pass">
              Generation failed
            </p>
            <h3 className="mt-1 text-lg font-medium tracking-[-0.01em] text-ink">
              Scout couldn&apos;t render a verdict for {addressFull}
            </h3>
          </div>
          {errorMessage ? (
            <p className="font-mono text-xs text-ink-muted">{errorMessage}</p>
          ) : null}
          <p className="text-sm text-ink-muted">
            You can retry — failures don&apos;t count against your quota.
          </p>
        </div>
      </div>
      <VerdictLoader verdictId={verdictId} label="Retry verdict" />
    </>
  );
}
