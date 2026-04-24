import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getPropertyForOrg } from "@/lib/db/queries/properties";
import { resolveAppUser } from "@/lib/db/queries/users";
import {
  listScopeItems,
  listRenovationTasks,
  listContractors,
  listQuotes,
  getRenovationBudgetTotals,
} from "@/lib/db/queries/renovating";

import { PropertyStageNav } from "@/components/property-stage-nav";
import { ScopeCard } from "./scope-card";
import { TasksCard } from "./tasks-card";
import { ContractorsCard } from "./contractors-card";

/**
 * Renovating-stage page per ADR-7 dogfooding commitment. Three
 * cards: scope + budget tracker, task checklist, contractors +
 * quotes.
 *
 * Receipt / photo upload (document vault) deferred with R2.
 */
export default async function RenovatingPage({
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

  const [scopeItems, tasks, contractors, quotes, totals] = await Promise.all([
    listScopeItems({ propertyId, orgId: appUser.orgId }),
    listRenovationTasks({ propertyId, orgId: appUser.orgId }),
    listContractors({ propertyId, orgId: appUser.orgId }),
    listQuotes({ propertyId, orgId: appUser.orgId }),
    getRenovationBudgetTotals({ propertyId, orgId: appUser.orgId }),
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

        <PropertyStageNav propertyId={propertyId} active="renovating" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <ScopeCard
              propertyId={propertyId}
              items={scopeItems}
              totals={totals}
            />
          </div>
          <TasksCard
            propertyId={propertyId}
            tasks={tasks}
            scopeItems={scopeItems}
          />
          <ContractorsCard
            propertyId={propertyId}
            contractors={contractors}
            quotes={quotes}
            scopeItems={scopeItems}
          />
        </div>
      </section>
    </div>
  );
}
