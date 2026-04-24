import "server-only";

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";
import type {
  PropertyReservation,
  ReservationSource,
  ReservationStatus,
  PropertyExpense,
  ExpenseCategory,
} from "@dwellverdict/db";

import { getDb } from "@/lib/db";

const { propertyReservations, propertyExpenses } = schema;

// ---- Reservations -----------------------------------------------

export async function listReservations(params: {
  propertyId: string;
  orgId: string;
  limit?: number;
}): Promise<PropertyReservation[]> {
  const db = getDb();
  return db
    .select()
    .from(propertyReservations)
    .where(
      and(
        eq(propertyReservations.propertyId, params.propertyId),
        eq(propertyReservations.orgId, params.orgId),
      ),
    )
    .orderBy(desc(propertyReservations.checkIn))
    .limit(params.limit ?? 200);
}

export async function upsertReservation(params: {
  orgId: string;
  propertyId: string;
  createdByUserId: string;
  source: ReservationSource;
  externalId: string | null;
  guestName: string | null;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  grossRevenueCents: number;
  cleaningFeeCents: number;
  serviceFeeCents: number;
  taxesCents: number;
  netCents: number;
  status: ReservationStatus;
  notes: string | null;
}): Promise<void> {
  const db = getDb();
  // Upsert on (property_id, source, external_id) when external_id
  // is present — that's the dedupe key for CSV re-imports.
  if (params.externalId) {
    await db
      .insert(propertyReservations)
      .values({
        orgId: params.orgId,
        propertyId: params.propertyId,
        createdByUserId: params.createdByUserId,
        source: params.source,
        externalId: params.externalId,
        guestName: params.guestName,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        nights: params.nights,
        grossRevenueCents: params.grossRevenueCents,
        cleaningFeeCents: params.cleaningFeeCents,
        serviceFeeCents: params.serviceFeeCents,
        taxesCents: params.taxesCents,
        netCents: params.netCents,
        status: params.status,
        notes: params.notes,
      })
      .onConflictDoUpdate({
        target: [
          propertyReservations.propertyId,
          propertyReservations.source,
          propertyReservations.externalId,
        ],
        set: {
          guestName: params.guestName,
          checkIn: params.checkIn,
          checkOut: params.checkOut,
          nights: params.nights,
          grossRevenueCents: params.grossRevenueCents,
          cleaningFeeCents: params.cleaningFeeCents,
          serviceFeeCents: params.serviceFeeCents,
          taxesCents: params.taxesCents,
          netCents: params.netCents,
          status: params.status,
          notes: params.notes,
          updatedAt: sql`NOW()`,
        },
      });
  } else {
    await db.insert(propertyReservations).values({
      orgId: params.orgId,
      propertyId: params.propertyId,
      createdByUserId: params.createdByUserId,
      source: params.source,
      externalId: null,
      guestName: params.guestName,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      nights: params.nights,
      grossRevenueCents: params.grossRevenueCents,
      cleaningFeeCents: params.cleaningFeeCents,
      serviceFeeCents: params.serviceFeeCents,
      taxesCents: params.taxesCents,
      netCents: params.netCents,
      status: params.status,
      notes: params.notes,
    });
  }
}

export async function deleteReservation(params: {
  id: string;
  orgId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .delete(propertyReservations)
    .where(
      and(
        eq(propertyReservations.id, params.id),
        eq(propertyReservations.orgId, params.orgId),
      ),
    );
}

// ---- Expenses ---------------------------------------------------

export async function listExpenses(params: {
  propertyId: string;
  orgId: string;
  yearStart?: Date;
  yearEnd?: Date;
  limit?: number;
}): Promise<PropertyExpense[]> {
  const db = getDb();
  const where = and(
    eq(propertyExpenses.propertyId, params.propertyId),
    eq(propertyExpenses.orgId, params.orgId),
    ...(params.yearStart
      ? [gte(propertyExpenses.incurredAt, params.yearStart)]
      : []),
    ...(params.yearEnd ? [lte(propertyExpenses.incurredAt, params.yearEnd)] : []),
  );
  return db
    .select()
    .from(propertyExpenses)
    .where(where)
    .orderBy(desc(propertyExpenses.incurredAt))
    .limit(params.limit ?? 200);
}

export async function createExpense(params: {
  orgId: string;
  propertyId: string;
  createdByUserId: string;
  incurredAt: Date;
  category: ExpenseCategory;
  label: string;
  amountCents: number;
  vendor: string | null;
  notes: string | null;
}): Promise<PropertyExpense> {
  const db = getDb();
  const [row] = await db
    .insert(propertyExpenses)
    .values({
      orgId: params.orgId,
      propertyId: params.propertyId,
      createdByUserId: params.createdByUserId,
      incurredAt: params.incurredAt,
      category: params.category,
      label: params.label,
      amountCents: params.amountCents,
      vendor: params.vendor,
      notes: params.notes,
    })
    .returning();
  if (!row) throw new Error("property_expense insert returned no row");
  return row;
}

export async function updateExpense(params: {
  id: string;
  orgId: string;
  patch: Partial<{
    incurredAt: Date;
    category: ExpenseCategory;
    label: string;
    amountCents: number;
    vendor: string | null;
    notes: string | null;
  }>;
}): Promise<void> {
  const db = getDb();
  await db
    .update(propertyExpenses)
    .set({ ...params.patch, updatedAt: sql`NOW()` })
    .where(
      and(
        eq(propertyExpenses.id, params.id),
        eq(propertyExpenses.orgId, params.orgId),
      ),
    );
}

export async function deleteExpense(params: {
  id: string;
  orgId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .delete(propertyExpenses)
    .where(
      and(
        eq(propertyExpenses.id, params.id),
        eq(propertyExpenses.orgId, params.orgId),
      ),
    );
}

// ---- Aggregates --------------------------------------------------

export type ActualsSummary = {
  /** Trailing 30 days (inclusive of today). */
  last30Days: { grossCents: number; netCents: number; bookings: number };
  /** Calendar year to date. */
  ytd: { grossCents: number; netCents: number; bookings: number };
  /** Last 6 complete calendar months, oldest first. */
  monthly: Array<{
    month: string; // "2026-03"
    grossCents: number;
    netCents: number;
    bookings: number;
  }>;
};

export async function getActualsSummary(params: {
  propertyId: string;
  orgId: string;
}): Promise<ActualsSummary> {
  // Pull the reservations we care about in one query (last 2 years
  // covers ytd + 6-month trailing + some padding).
  const twoYearsAgo = new Date();
  twoYearsAgo.setUTCFullYear(twoYearsAgo.getUTCFullYear() - 2);

  const db = getDb();
  const rows = await db
    .select({
      checkIn: propertyReservations.checkIn,
      grossCents: propertyReservations.grossRevenueCents,
      netCents: propertyReservations.netCents,
      status: propertyReservations.status,
    })
    .from(propertyReservations)
    .where(
      and(
        eq(propertyReservations.propertyId, params.propertyId),
        eq(propertyReservations.orgId, params.orgId),
        gte(propertyReservations.checkIn, twoYearsAgo),
      ),
    );

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ytdStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const last30 = { grossCents: 0, netCents: 0, bookings: 0 };
  const ytd = { grossCents: 0, netCents: 0, bookings: 0 };
  const monthTally = new Map<
    string,
    { grossCents: number; netCents: number; bookings: number }
  >();

  for (const r of rows) {
    if (r.status === "canceled" || r.status === "blocked") continue;
    const t = r.checkIn.getTime();
    if (t >= thirtyDaysAgo.getTime() && t <= now.getTime()) {
      last30.grossCents += r.grossCents;
      last30.netCents += r.netCents;
      last30.bookings += 1;
    }
    if (r.checkIn >= ytdStart) {
      ytd.grossCents += r.grossCents;
      ytd.netCents += r.netCents;
      ytd.bookings += 1;
    }
    const monthKey = `${r.checkIn.getUTCFullYear()}-${String(r.checkIn.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = monthTally.get(monthKey) ?? {
      grossCents: 0,
      netCents: 0,
      bookings: 0,
    };
    bucket.grossCents += r.grossCents;
    bucket.netCents += r.netCents;
    bucket.bookings += 1;
    monthTally.set(monthKey, bucket);
  }

  // Last 6 complete months, including current.
  const monthly: ActualsSummary["monthly"] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthly.push({
      month: key,
      ...(monthTally.get(key) ?? {
        grossCents: 0,
        netCents: 0,
        bookings: 0,
      }),
    });
  }

  return { last30Days: last30, ytd, monthly };
}

export type ScheduleESummary = {
  year: number;
  grossRentalIncomeCents: number;
  byCategory: Array<{ category: ExpenseCategory; totalCents: number }>;
  totalExpensesCents: number;
  netProfitCents: number;
};

export async function getScheduleESummary(params: {
  propertyId: string;
  orgId: string;
  year: number;
}): Promise<ScheduleESummary> {
  const yearStart = new Date(Date.UTC(params.year, 0, 1));
  const yearEnd = new Date(Date.UTC(params.year + 1, 0, 1));

  // Reservations that started in the target year.
  const db = getDb();
  const reservationRows = await db
    .select({
      grossCents: propertyReservations.grossRevenueCents,
      taxesCents: propertyReservations.taxesCents,
      status: propertyReservations.status,
    })
    .from(propertyReservations)
    .where(
      and(
        eq(propertyReservations.propertyId, params.propertyId),
        eq(propertyReservations.orgId, params.orgId),
        gte(propertyReservations.checkIn, yearStart),
        lte(propertyReservations.checkIn, yearEnd),
      ),
    );

  let grossRentalIncomeCents = 0;
  for (const r of reservationRows) {
    if (r.status === "canceled" || r.status === "blocked") continue;
    // Schedule E "Rents received" line excludes taxes-in-trust
    // (transient occupancy taxes pass through to the government).
    grossRentalIncomeCents += r.grossCents - r.taxesCents;
  }

  const expenseRows = await listExpenses({
    propertyId: params.propertyId,
    orgId: params.orgId,
    yearStart,
    yearEnd,
  });

  const byCategoryMap = new Map<ExpenseCategory, number>();
  for (const e of expenseRows) {
    byCategoryMap.set(
      e.category as ExpenseCategory,
      (byCategoryMap.get(e.category as ExpenseCategory) ?? 0) + e.amountCents,
    );
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([category, totalCents]) => ({ category, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents);

  const totalExpensesCents = byCategory.reduce(
    (sum, r) => sum + r.totalCents,
    0,
  );
  const netProfitCents = grossRentalIncomeCents - totalExpensesCents;

  return {
    year: params.year,
    grossRentalIncomeCents,
    byCategory,
    totalExpensesCents,
    netProfitCents,
  };
}
