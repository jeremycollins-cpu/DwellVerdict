import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import type { ExpenseCategory } from "@dwellverdict/db";

import { getPropertyForOrg } from "@/lib/db/queries/properties";
import { resolveAppUser } from "@/lib/db/queries/users";
import {
  listReservations,
  listExpenses,
  getActualsSummary,
  getScheduleESummary,
} from "@/lib/db/queries/managing";

import { PropertyStageNav } from "@/components/property-stage-nav";
import { ImportCard } from "./import-card";
import { ExpensesCard } from "./expenses-card";

/**
 * Managing-stage page per ADR-7. Signature feature for the 1-5
 * property persona — where $20 flat pricing beats per-listing
 * PMS tools. Four surfaces:
 *
 *   1. Actuals stats bar (30-day + YTD + 6-month trend)
 *   2. Reservations list + CSV import
 *   3. Expenses list + add form (categorized by Schedule E)
 *   4. Schedule E annual summary (tax-ready)
 *
 * Live PMS integrations (webhook-based) deferred until a design
 * partner specifically needs them per ADR-7's user-demand gate.
 */

const CATEGORY_LABELS: Record<string, string> = {
  advertising: "Advertising",
  auto_travel: "Auto / travel",
  cleaning_maintenance: "Cleaning / maintenance",
  commissions: "Commissions",
  insurance: "Insurance",
  legal_professional: "Legal / professional",
  management_fees: "Management fees",
  mortgage_interest: "Mortgage interest (bank)",
  other_interest: "Other interest",
  repairs: "Repairs",
  supplies: "Supplies",
  taxes: "Taxes",
  utilities: "Utilities",
  depreciation: "Depreciation",
  other: "Other",
};

export default async function ManagingPage({
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

  const currentYear = new Date().getUTCFullYear();

  const [reservations, expenses, actuals, schedule] = await Promise.all([
    listReservations({ propertyId, orgId: appUser.orgId }),
    listExpenses({ propertyId, orgId: appUser.orgId }),
    getActualsSummary({ propertyId, orgId: appUser.orgId }),
    getScheduleESummary({
      propertyId,
      orgId: appUser.orgId,
      year: currentYear,
    }),
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

        <PropertyStageNav propertyId={propertyId} active="managing" />

        {/* Stats bar */}
        <div className="grid grid-cols-2 gap-3 rounded-[14px] bg-card p-6 shadow-card md:grid-cols-4">
          <Stat
            label="Last 30 days"
            value={actuals.last30Days.netCents}
            subtitle={`${actuals.last30Days.bookings} booking${actuals.last30Days.bookings === 1 ? "" : "s"}`}
          />
          <Stat
            label={`${currentYear} YTD`}
            value={actuals.ytd.netCents}
            subtitle={`${actuals.ytd.bookings} booking${actuals.ytd.bookings === 1 ? "" : "s"}`}
          />
          <Stat
            label={`${currentYear} gross (Sched. E)`}
            value={schedule.grossRentalIncomeCents}
            subtitle="rents received net of taxes"
          />
          <Stat
            label={`${currentYear} net profit`}
            value={schedule.netProfitCents}
            subtitle="gross − expenses"
            tone={schedule.netProfitCents < 0 ? "over" : "ok"}
          />
        </div>

        {/* 6-month trend */}
        <div className="rounded-[14px] bg-card p-6 shadow-card">
          <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Last 6 months
          </h2>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {actuals.monthly.map((m) => (
              <div
                key={m.month}
                className="flex flex-col rounded-md border border-hairline bg-paper px-3 py-2"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                  {m.month}
                </span>
                <span className="font-mono text-sm text-ink">
                  {formatCents(m.netCents)}
                </span>
                <span className="font-mono text-[10px] text-ink-muted">
                  {m.bookings} bkg{m.bookings === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Reservations (CSV import + list) */}
        <ImportCard propertyId={propertyId} reservations={reservations} />

        {/* Expenses */}
        <ExpensesCard propertyId={propertyId} expenses={expenses} />

        {/* Schedule E summary */}
        <div className="rounded-[14px] bg-card p-6 shadow-card">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              Schedule E summary · {currentYear}
            </h2>
            <span className="font-mono text-[11px] text-ink-muted">
              Tax-ready totals. For your CPA to review.
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Stat
              label="Rents received"
              value={schedule.grossRentalIncomeCents}
              subtitle="gross − pass-through taxes"
            />
            <Stat
              label="Total expenses"
              value={schedule.totalExpensesCents}
              subtitle={`${schedule.byCategory.length} categor${schedule.byCategory.length === 1 ? "y" : "ies"}`}
            />
            <Stat
              label="Net profit"
              value={schedule.netProfitCents}
              tone={schedule.netProfitCents < 0 ? "over" : "ok"}
            />
          </div>

          {schedule.byCategory.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-hairline font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                    <th className="py-1 pr-3">Category</th>
                    <th className="py-1 pr-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.byCategory.map((c) => (
                    <tr key={c.category} className="border-b border-hairline">
                      <td className="py-2 pr-3 text-sm">
                        {CATEGORY_LABELS[c.category as ExpenseCategory] ??
                          c.category}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {formatCents(c.totalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <p className="mt-4 font-mono text-[11px] text-ink-muted">
            DwellVerdict provides research summaries, not tax advice. Verify
            all totals + classifications with your CPA before filing.
          </p>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  subtitle,
  tone = "ok",
}: {
  label: string;
  value: number;
  subtitle?: string;
  tone?: "ok" | "over";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </span>
      <span
        className={`font-mono text-lg ${tone === "over" ? "text-signal-pass" : "text-ink"}`}
      >
        {formatCents(value)}
      </span>
      {subtitle ? (
        <span className="font-mono text-[10px] text-ink-muted">{subtitle}</span>
      ) : null}
    </div>
  );
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
