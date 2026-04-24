import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getPropertyForOrg } from "@/lib/db/queries/properties";
import { resolveAppUser } from "@/lib/db/queries/users";
import {
  listDealMilestones,
  listDealContacts,
  listDealNotes,
  listDealBudgetItems,
  getDealBudgetTotals,
} from "@/lib/db/queries/buying";

import { PropertyStageNav } from "@/components/property-stage-nav";
import { MilestonesCard } from "./milestones-card";
import { ContactsCard } from "./contacts-card";
import { NotesCard } from "./notes-card";
import { BudgetCard } from "./budget-card";

/**
 * Buying-stage page per ADR-7. Four cards: deadlines, contacts,
 * notes, budget. All fetched in parallel.
 *
 * The founder dogfoods this flow on a live purchase — usability
 * friction captured here feeds back into the scope as v0 ships.
 */
export default async function BuyingPage({
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

  const [milestones, contacts, notes, budgetItems, budgetTotals] =
    await Promise.all([
      listDealMilestones({ propertyId, orgId: appUser.orgId }),
      listDealContacts({ propertyId, orgId: appUser.orgId }),
      listDealNotes({ propertyId, orgId: appUser.orgId }),
      listDealBudgetItems({ propertyId, orgId: appUser.orgId }),
      getDealBudgetTotals({ propertyId, orgId: appUser.orgId }),
    ]);

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

        <PropertyStageNav propertyId={propertyId} active="buying" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <MilestonesCard propertyId={propertyId} milestones={milestones} />
          <ContactsCard propertyId={propertyId} contacts={contacts} />
          <div className="lg:col-span-2">
            <BudgetCard
              propertyId={propertyId}
              items={budgetItems}
              totals={budgetTotals}
            />
          </div>
          <div className="lg:col-span-2">
            <NotesCard propertyId={propertyId} notes={notes} />
          </div>
        </div>
      </section>
    </div>
  );
}
