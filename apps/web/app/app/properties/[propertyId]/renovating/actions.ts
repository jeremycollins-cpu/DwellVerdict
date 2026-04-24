"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  RENOVATION_SCOPE_CATEGORIES,
  RENOVATION_SCOPE_STATUSES,
  RENOVATION_TRADES,
  RENOVATION_QUOTE_STATUSES,
} from "@dwellverdict/db";

import { resolveAppUser } from "@/lib/db/queries/users";
import { getPropertyForOrg } from "@/lib/db/queries/properties";
import {
  createScopeItem,
  updateScopeItem,
  deleteScopeItem,
  createRenovationTask,
  updateRenovationTask,
  deleteRenovationTask,
  createContractor,
  deleteContractor,
  createQuote,
  updateQuote,
  deleteQuote,
} from "@/lib/db/queries/renovating";

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
  revalidatePath(`/app/properties/${propertyId}/renovating`);
}

// ---- Scope items ------------------------------------------------

const ScopeCreateSchema = z.object({
  propertyId: z.string().uuid(),
  category: z.enum(RENOVATION_SCOPE_CATEGORIES),
  label: z.string().min(1).max(200),
  budgetedCents: z.number().int().min(0),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createScopeItemAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ScopeCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  await createScopeItem({
    orgId: c.orgId,
    propertyId: parsed.data.propertyId,
    createdByUserId: c.userId,
    category: parsed.data.category,
    label: parsed.data.label,
    budgetedCents: parsed.data.budgetedCents,
    notes: parsed.data.notes ?? null,
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const ScopeUpdateSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  patch: z.object({
    category: z.enum(RENOVATION_SCOPE_CATEGORIES).optional(),
    label: z.string().min(1).max(200).optional(),
    budgetedCents: z.number().int().min(0).optional(),
    committedCents: z.number().int().min(0).optional(),
    spentCents: z.number().int().min(0).optional(),
    status: z.enum(RENOVATION_SCOPE_STATUSES).optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
});

export async function updateScopeItemAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ScopeUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  await updateScopeItem({
    id: parsed.data.id,
    orgId: c.orgId,
    patch: parsed.data.patch,
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const ScopeDeleteSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
});

export async function deleteScopeItemAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ScopeDeleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  await deleteScopeItem({ id: parsed.data.id, orgId: c.orgId });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

// ---- Tasks ------------------------------------------------------

const TaskCreateSchema = z.object({
  propertyId: z.string().uuid(),
  scopeItemId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(300),
  dueDate: z.string().datetime().nullable().optional(),
});

export async function createRenovationTaskAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = TaskCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  await createRenovationTask({
    orgId: c.orgId,
    propertyId: parsed.data.propertyId,
    createdByUserId: c.userId,
    scopeItemId: parsed.data.scopeItemId ?? null,
    title: parsed.data.title,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    notes: null,
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const TaskUpdateSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  patch: z.object({
    title: z.string().min(1).max(300).optional(),
    scopeItemId: z.string().uuid().nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    completedAt: z.string().datetime().nullable().optional(),
  }),
});

export async function updateRenovationTaskAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = TaskUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  const { dueDate, completedAt, scopeItemId, ...rest } = parsed.data.patch;
  await updateRenovationTask({
    id: parsed.data.id,
    orgId: c.orgId,
    patch: {
      ...rest,
      ...(scopeItemId !== undefined ? { scopeItemId } : {}),
      ...(dueDate !== undefined
        ? { dueDate: dueDate === null ? null : new Date(dueDate) }
        : {}),
      ...(completedAt !== undefined
        ? { completedAt: completedAt === null ? null : new Date(completedAt) }
        : {}),
    },
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const TaskDeleteSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
});

export async function deleteRenovationTaskAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = TaskDeleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  await deleteRenovationTask({ id: parsed.data.id, orgId: c.orgId });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

// ---- Contractors ------------------------------------------------

const ContractorCreateSchema = z.object({
  propertyId: z.string().uuid(),
  trade: z.enum(RENOVATION_TRADES),
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(50).optional().nullable(),
  licenseNumber: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createContractorAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ContractorCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  await createContractor({
    orgId: c.orgId,
    propertyId: parsed.data.propertyId,
    createdByUserId: c.userId,
    trade: parsed.data.trade,
    name: parsed.data.name,
    company: parsed.data.company ?? null,
    email: parsed.data.email ? parsed.data.email : null,
    phone: parsed.data.phone ?? null,
    licenseNumber: parsed.data.licenseNumber ?? null,
    notes: parsed.data.notes ?? null,
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const ContractorDeleteSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
});

export async function deleteContractorAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ContractorDeleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  await deleteContractor({ id: parsed.data.id, orgId: c.orgId });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

// ---- Quotes -----------------------------------------------------

const QuoteCreateSchema = z.object({
  propertyId: z.string().uuid(),
  contractorId: z.string().uuid().nullable().optional(),
  scopeItemId: z.string().uuid().nullable().optional(),
  label: z.string().min(1).max(200),
  amountCents: z.number().int().min(0),
  status: z.enum(RENOVATION_QUOTE_STATUSES).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createQuoteAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = QuoteCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  await createQuote({
    orgId: c.orgId,
    propertyId: parsed.data.propertyId,
    createdByUserId: c.userId,
    contractorId: parsed.data.contractorId ?? null,
    scopeItemId: parsed.data.scopeItemId ?? null,
    label: parsed.data.label,
    amountCents: parsed.data.amountCents,
    status: parsed.data.status ?? "pending",
    notes: parsed.data.notes ?? null,
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const QuoteUpdateSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  patch: z.object({
    status: z.enum(RENOVATION_QUOTE_STATUSES).optional(),
    amountCents: z.number().int().min(0).optional(),
    label: z.string().min(1).max(200).optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
});

export async function updateQuoteAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = QuoteUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  await updateQuote({
    id: parsed.data.id,
    orgId: c.orgId,
    patch: parsed.data.patch,
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const QuoteDeleteSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
});

export async function deleteQuoteAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = QuoteDeleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = await ctx(parsed.data.propertyId);
  if (!c.ok) return c;
  await deleteQuote({ id: parsed.data.id, orgId: c.orgId });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}
