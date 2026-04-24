import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";

import { Button } from "@/components/ui/button";
import { resolveAppUser } from "@/lib/db/queries/users";
import { getOrgById } from "@/lib/db/queries/organizations";
import {
  PLAN_MONTHLY_LIMITS,
  SCOUT_MONTHLY_LIMIT,
  getUsageForUser,
} from "@/lib/db/queries/report-usage";

import { ManageBillingButton } from "./manage-billing-button";

/**
 * /app/settings/billing — plan + usage snapshot.
 *
 * Everything mutating (upgrade, downgrade, payment method, cancel)
 * lives in the Stripe-hosted Billing Portal to keep PCI scope off
 * our server. This page is the landing/return_url for that portal
 * and the primary place a signed-in user sees their current plan.
 *
 * Layout:
 *   - Plan card: which tier + monthly caps
 *   - Usage card: reports used this period + Scout messages (pro)
 *   - Actions: "Manage billing" (paid) or "Upgrade" (free)
 */
export default async function BillingPage() {
  await auth.protect();

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("unreachable: protected route");
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    "";
  const name =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() || null;

  const appUser = await resolveAppUser(clerkUserId, email, name);
  if (!appUser) throw new Error("User has been soft-deleted");

  const org = await getOrgById(appUser.orgId);
  if (!org) throw new Error("Org not found");

  const usage = await getUsageForUser(appUser.userId);
  const plan = org.plan as keyof typeof PLAN_MONTHLY_LIMITS;
  const hasStripeCustomer = !!org.stripeCustomerId;

  const PLAN_LABELS: Record<typeof plan, string> = {
    free: "Free trial",
    starter: "DwellVerdict",
    pro: "DwellVerdict Pro",
    canceled: "Canceled",
  };
  const PLAN_PRICES: Record<typeof plan, string> = {
    free: "$0",
    starter: "$20 / month",
    pro: "$40 / month",
    canceled: "—",
  };

  const monthlyLimit = PLAN_MONTHLY_LIMITS[plan];
  const reportsUsed = usage?.reportsThisPeriod ?? 0;
  const freeUsed = !!usage?.freeReportUsedAt;
  const scoutUsed = usage?.scoutMessagesThisPeriod ?? 0;

  return (
    <div className="flex flex-1 flex-col bg-paper">
      <section className="container flex flex-col gap-8 py-12">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Settings
          </p>
          <h1 className="text-[28px] font-medium tracking-[-0.02em] text-ink">
            Billing
          </h1>
          <p className="text-sm text-ink-muted">
            Manage your plan, payment method, and invoices.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Plan card */}
          <div className="rounded-2xl border border-hairline bg-card p-6 shadow-card">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              Current plan
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <h2 className="text-2xl tracking-[-0.02em] text-ink">
                {PLAN_LABELS[plan]}
              </h2>
              <span className="text-sm text-ink-muted">
                {PLAN_PRICES[plan]}
              </span>
            </div>
            {org.stripePeriodEnd ? (
              <p className="mt-2 text-sm text-ink-muted">
                {plan === "canceled"
                  ? "Access ends "
                  : "Renews on "}
                {org.stripePeriodEnd.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-2">
              {hasStripeCustomer ? (
                <ManageBillingButton />
              ) : (
                <Button
                  asChild
                  className="w-full bg-terracotta text-white shadow-sm transition-colors hover:bg-terracotta/90"
                >
                  <Link href="/pricing">Upgrade to a paid plan</Link>
                </Button>
              )}
              {plan !== "pro" ? (
                <Button asChild variant="outline" className="w-full">
                  <Link href="/pricing">Compare plans</Link>
                </Button>
              ) : null}
            </div>
          </div>

          {/* Usage card */}
          <div className="rounded-2xl border border-hairline bg-card p-6 shadow-card">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              Usage this period
            </p>

            {plan === "free" ? (
              <div className="mt-4 flex flex-col gap-1">
                <p className="text-sm text-ink">
                  {freeUsed
                    ? "Lifetime free report used"
                    : "1 free report available"}
                </p>
                <p className="text-xs text-ink-muted">
                  Upgrade to DwellVerdict for 50 reports per month.
                </p>
              </div>
            ) : plan === "canceled" ? (
              <div className="mt-4 flex flex-col gap-1">
                <p className="text-sm text-ink">
                  Subscription canceled. Historical reports remain
                  accessible read-only.
                </p>
                <p className="text-xs text-ink-muted">
                  Re-subscribe to generate new reports.
                </p>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                <UsageRow
                  label="Reports"
                  used={reportsUsed}
                  limit={monthlyLimit}
                  resetAt={usage?.periodResetAt ?? org.stripePeriodEnd ?? null}
                />
                {plan === "pro" ? (
                  <UsageRow
                    label="Scout messages"
                    used={scoutUsed}
                    limit={SCOUT_MONTHLY_LIMIT}
                    resetAt={
                      usage?.periodResetAt ?? org.stripePeriodEnd ?? null
                    }
                  />
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="text-xs text-ink-muted">
          Invoices, payment method updates, and cancellation all happen in
          the Stripe-hosted billing portal. No card data touches our
          servers.
        </div>
      </section>
    </div>
  );
}

function UsageRow({
  label,
  used,
  limit,
  resetAt,
}: {
  label: string;
  used: number;
  limit: number;
  resetAt: Date | null;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className="font-mono text-xs text-ink-muted">
          {used} / {limit}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
        <div
          className="h-full bg-signal-buy transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {resetAt ? (
        <p className="font-mono text-[11px] text-ink-muted">
          Resets{" "}
          {resetAt.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </p>
      ) : null}
    </div>
  );
}
