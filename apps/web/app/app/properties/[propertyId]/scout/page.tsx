import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getPropertyForOrg } from "@/lib/db/queries/properties";
import { resolveAppUser } from "@/lib/db/queries/users";
import { getPlanForUser } from "@/lib/db/queries/report-usage";
import { listScoutMessages } from "@/lib/db/queries/scout";

import { PropertyStageNav } from "@/components/property-stage-nav";
import { ScoutChatPanel } from "./chat-panel";

/**
 * Scout chat page per ADR-8. Pro-tier only. Free/starter users
 * see an upgrade prompt instead of the chat UI.
 */
export default async function ScoutPage({
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
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() ||
    null;

  const appUser = await resolveAppUser(clerkUserId, email, name);
  if (!appUser) throw new Error("User soft-deleted");

  const property = await getPropertyForOrg({
    propertyId,
    orgId: appUser.orgId,
  });
  if (!property) notFound();

  const addressFull =
    property.addressFull ??
    `${property.addressLine1}, ${property.city}, ${property.state} ${property.zip}`;

  const plan = await getPlanForUser(appUser.userId);
  const messages = await listScoutMessages({
    propertyId,
    orgId: appUser.orgId,
    limit: 100,
  });

  return (
    <div className="flex flex-1 flex-col bg-paper">
      <section className="container flex flex-col gap-6 py-10">
        <Link
          href={`/app/properties/${propertyId}`}
          className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to property
        </Link>

        <div className="flex flex-col gap-1">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Scout · Property
          </p>
          <h1 className="font-mono text-xl text-ink">{addressFull}</h1>
        </div>

        <PropertyStageNav propertyId={propertyId} active="finding" />

        {plan === "pro" ? (
          <ScoutChatPanel
            propertyId={propertyId}
            initialMessages={messages.map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              createdAt: m.createdAt.toISOString(),
            }))}
          />
        ) : (
          <UpgradePrompt />
        )}
      </section>
    </div>
  );
}

function UpgradePrompt() {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] bg-card p-8 shadow-card">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-signal-buy">
        DwellVerdict Pro
      </h2>
      <h3 className="text-lg font-medium text-ink">
        Scout chat is a Pro-tier feature.
      </h3>
      <p className="text-sm text-ink-muted">
        Ask Scout property-specific questions — deal math, regulatory wrinkles,
        renovation sequencing, tax strategy at the high level. Every reply is
        grounded in the verdict signals we&apos;ve already pulled for this address.
      </p>
      <p className="font-mono text-[11px] text-ink-muted">
        Included in Pro ($40/mo): 30 chat messages per day, 300 per month.
        Full verdict report cap goes from 50/mo to 200/mo. Priority queue.
      </p>
      <Link
        href="/pricing"
        className="mt-2 inline-flex items-center self-start rounded-md bg-ink px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-ink-muted"
      >
        See pricing →
      </Link>
    </div>
  );
}
