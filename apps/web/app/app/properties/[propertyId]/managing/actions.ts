"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  RESERVATION_SOURCES,
  RESERVATION_STATUSES,
  EXPENSE_CATEGORIES,
} from "@dwellverdict/db";

import { resolveAppUser } from "@/lib/db/queries/users";
import { getPropertyForOrg } from "@/lib/db/queries/properties";
import {
  upsertReservation,
  deleteReservation,
  createExpense,
  updateExpense,
  deleteExpense,
} from "@/lib/db/queries/managing";
import { normalizeAirbnbCsv } from "@/lib/csv/parsers";

async function ctx(propertyId: string): Promise<
  | { ok: true; userId: string; orgId: string }
  | { ok: false; error: string }
> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return { ok: false, error: "unauthorized" };
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) return { ok: false, error: "no_email" };
  const name =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() ||
    null;
  const appUser = await resolveAppUser(clerkUserId, email, name);
  if (!appUser) return { ok: false, error: "user_deleted" };
  const property = await getPropertyForOrg({
    propertyId,
    orgId: appUser.orgId,
  });
  if (!property) return { ok: false, error: "not_found" };
  return { ok: true, userId: appUser.userId, orgId: appUser.orgId };
}

function revalidate(propertyId: string): void {
  revalidatePath(`/app/properties/${propertyId}/managing`);
}

// ---- CSV import -------------------------------------------------

const CsvImportSchema = z.object({
  propertyId: z.string().uuid(),
  source: z.enum(RESERVATION_SOURCES),
  csvText: z.string().min(1).max(5_000_000), // 5MB cap
});

export async function importReservationsCsvAction(
  raw: unknown,
): Promise<
  | { ok: true; imported: number; skipped: number }
  | { ok: false; error: string }
> {
  const parsed = CsvImportSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;

  // v0 only supports the Airbnb "Reservations" export format. Other
  // sources are accepted in the source picker but fall back to the
  // same normalizer — works reasonably for CSVs that share the
  // core column set. When we hit pathological formats we'll add
  // dedicated normalizers per PMS.
  const result = normalizeAirbnbCsv(parsed.data.csvText);
  if (!result.ok) {
    return { ok: false, error: `csv_parse_failed: ${result.error}` };
  }

  let imported = 0;
  for (const r of result.reservations) {
    try {
      await upsertReservation({
        orgId: c.orgId,
        propertyId: parsed.data.propertyId,
        createdByUserId: c.userId,
        source: parsed.data.source,
        externalId: r.externalId,
        guestName: r.guestName,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        nights: r.nights,
        grossRevenueCents: r.grossRevenueCents,
        cleaningFeeCents: r.cleaningFeeCents,
        serviceFeeCents: r.serviceFeeCents,
        taxesCents: r.taxesCents,
        netCents: r.netCents,
        status: r.status,
        notes: r.notes,
      });
      imported += 1;
    } catch (err) {
      console.error("[managing] reservation upsert failed", {
        externalId: r.externalId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  revalidate(parsed.data.propertyId);
  return { ok: true, imported, skipped: result.skipped };
}

// ---- Manual reservation ------------------------------------------

const ReservationManualSchema = z.object({
  propertyId: z.string().uuid(),
  guestName: z.string().max(200).optional().nullable(),
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime(),
  grossRevenueCents: z.number().int().min(0),
  cleaningFeeCents: z.number().int().min(0).default(0),
  serviceFeeCents: z.number().int().min(0).default(0),
  taxesCents: z.number().int().min(0).default(0),
  netCents: z.number().int().min(0),
  status: z.enum(RESERVATION_STATUSES).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createReservationAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ReservationManualSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;

  const checkIn = new Date(parsed.data.checkIn);
  const checkOut = new Date(parsed.data.checkOut);
  if (!(checkOut > checkIn)) {
    return { ok: false, error: "invalid_dates" };
  }
  const nights = Math.round(
    (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (nights < 1) {
    return { ok: false, error: "invalid_dates" };
  }

  await upsertReservation({
    orgId: c.orgId,
    propertyId: parsed.data.propertyId,
    createdByUserId: c.userId,
    source: "manual",
    externalId: null,
    guestName: parsed.data.guestName ?? null,
    checkIn,
    checkOut,
    nights,
    grossRevenueCents: parsed.data.grossRevenueCents,
    cleaningFeeCents: parsed.data.cleaningFeeCents,
    serviceFeeCents: parsed.data.serviceFeeCents,
    taxesCents: parsed.data.taxesCents,
    netCents: parsed.data.netCents,
    status: parsed.data.status ?? "confirmed",
    notes: parsed.data.notes ?? null,
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const ReservationDeleteSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
});

export async function deleteReservationAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ReservationDeleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  await deleteReservation({ id: parsed.data.id, orgId: c.orgId });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

// ---- Expenses ---------------------------------------------------

const ExpenseCreateSchema = z.object({
  propertyId: z.string().uuid(),
  incurredAt: z.string().datetime(),
  category: z.enum(EXPENSE_CATEGORIES),
  label: z.string().min(1).max(200),
  amountCents: z.number().int().min(0),
  vendor: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createExpenseAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ExpenseCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  await createExpense({
    orgId: c.orgId,
    propertyId: parsed.data.propertyId,
    createdByUserId: c.userId,
    incurredAt: new Date(parsed.data.incurredAt),
    category: parsed.data.category,
    label: parsed.data.label,
    amountCents: parsed.data.amountCents,
    vendor: parsed.data.vendor ?? null,
    notes: parsed.data.notes ?? null,
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const ExpenseUpdateSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  patch: z.object({
    incurredAt: z.string().datetime().optional(),
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    label: z.string().min(1).max(200).optional(),
    amountCents: z.number().int().min(0).optional(),
    vendor: z.string().max(200).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
});

export async function updateExpenseAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ExpenseUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  const { incurredAt, ...rest } = parsed.data.patch;
  await updateExpense({
    id: parsed.data.id,
    orgId: c.orgId,
    patch: {
      ...rest,
      ...(incurredAt !== undefined ? { incurredAt: new Date(incurredAt) } : {}),
    },
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const ExpenseDeleteSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
});

export async function deleteExpenseAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ExpenseDeleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  await deleteExpense({ id: parsed.data.id, orgId: c.orgId });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}
