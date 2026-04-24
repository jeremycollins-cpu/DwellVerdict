"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  DEAL_MILESTONE_TYPES,
  DEAL_CONTACT_ROLES,
  DEAL_BUDGET_CATEGORIES,
  DEAL_BUDGET_STATUSES,
} from "@dwellverdict/db";

import { resolveAppUser } from "@/lib/db/queries/users";
import { getPropertyForOrg } from "@/lib/db/queries/properties";
import {
  createDealMilestone,
  updateDealMilestone,
  deleteDealMilestone,
  createDealContact,
  updateDealContact,
  deleteDealContact,
  createDealNote,
  deleteDealNote,
  createDealBudgetItem,
  updateDealBudgetItem,
  deleteDealBudgetItem,
} from "@/lib/db/queries/buying";

/**
 * Server actions for the Buying stage — milestones, contacts, notes,
 * budget. Every action resolves the caller's org + verifies the
 * property belongs to that org before mutating. Revalidates the
 * property detail path so the UI picks up the change.
 */

async function resolveUserAndProperty(propertyId: string): Promise<
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
  revalidatePath(`/app/properties/${propertyId}`);
  revalidatePath(`/app/properties/${propertyId}/buying`);
}

// ---- Milestones -------------------------------------------------

const MilestoneCreateSchema = z.object({
  propertyId: z.string().uuid(),
  milestoneType: z.enum(DEAL_MILESTONE_TYPES),
  title: z.string().max(200).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createMilestoneAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = MilestoneCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await resolveUserAndProperty(parsed.data.propertyId);
  if (!ctx.ok) return ctx;

  await createDealMilestone({
    orgId: ctx.orgId,
    propertyId: parsed.data.propertyId,
    createdByUserId: ctx.userId,
    milestoneType: parsed.data.milestoneType,
    title: parsed.data.title ?? null,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    notes: parsed.data.notes ?? null,
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const MilestoneUpdateSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  patch: z.object({
    title: z.string().max(200).nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    completedAt: z.string().datetime().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
});

export async function updateMilestoneAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = MilestoneUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await resolveUserAndProperty(parsed.data.propertyId);
  if (!ctx.ok) return ctx;

  const { dueDate, completedAt, ...rest } = parsed.data.patch;
  await updateDealMilestone({
    id: parsed.data.id,
    orgId: ctx.orgId,
    patch: {
      ...rest,
      ...(dueDate !== undefined
        ? { dueDate: dueDate === null ? null : new Date(dueDate) }
        : {}),
      ...(completedAt !== undefined
        ? {
            completedAt: completedAt === null ? null : new Date(completedAt),
          }
        : {}),
    },
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const MilestoneDeleteSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
});

export async function deleteMilestoneAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = MilestoneDeleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await resolveUserAndProperty(parsed.data.propertyId);
  if (!ctx.ok) return ctx;
  await deleteDealMilestone({ id: parsed.data.id, orgId: ctx.orgId });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

// ---- Contacts ---------------------------------------------------

const ContactCreateSchema = z.object({
  propertyId: z.string().uuid(),
  role: z.enum(DEAL_CONTACT_ROLES),
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(50).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createContactAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ContactCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await resolveUserAndProperty(parsed.data.propertyId);
  if (!ctx.ok) return ctx;

  await createDealContact({
    orgId: ctx.orgId,
    propertyId: parsed.data.propertyId,
    createdByUserId: ctx.userId,
    role: parsed.data.role,
    name: parsed.data.name,
    company: parsed.data.company ?? null,
    email: parsed.data.email ? parsed.data.email : null,
    phone: parsed.data.phone ?? null,
    notes: parsed.data.notes ?? null,
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const ContactUpdateSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  patch: z.object({
    role: z.enum(DEAL_CONTACT_ROLES).optional(),
    name: z.string().min(1).max(200).optional(),
    company: z.string().max(200).nullable().optional(),
    email: z.string().email().nullable().optional().or(z.literal("")),
    phone: z.string().max(50).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
});

export async function updateContactAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ContactUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await resolveUserAndProperty(parsed.data.propertyId);
  if (!ctx.ok) return ctx;
  await updateDealContact({
    id: parsed.data.id,
    orgId: ctx.orgId,
    patch: parsed.data.patch,
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const ContactDeleteSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
});

export async function deleteContactAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ContactDeleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await resolveUserAndProperty(parsed.data.propertyId);
  if (!ctx.ok) return ctx;
  await deleteDealContact({ id: parsed.data.id, orgId: ctx.orgId });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

// ---- Notes ------------------------------------------------------

const NoteCreateSchema = z.object({
  propertyId: z.string().uuid(),
  body: z.string().min(1).max(4000),
});

export async function createNoteAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = NoteCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await resolveUserAndProperty(parsed.data.propertyId);
  if (!ctx.ok) return ctx;
  await createDealNote({
    orgId: ctx.orgId,
    propertyId: parsed.data.propertyId,
    createdByUserId: ctx.userId,
    body: parsed.data.body,
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const NoteDeleteSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
});

export async function deleteNoteAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = NoteDeleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await resolveUserAndProperty(parsed.data.propertyId);
  if (!ctx.ok) return ctx;
  await deleteDealNote({ id: parsed.data.id, orgId: ctx.orgId });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

// ---- Budget -----------------------------------------------------

const BudgetCreateSchema = z.object({
  propertyId: z.string().uuid(),
  category: z.enum(DEAL_BUDGET_CATEGORIES),
  label: z.string().min(1).max(200),
  amountCents: z.number().int().min(0),
  status: z.enum(DEAL_BUDGET_STATUSES),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createBudgetItemAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = BudgetCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await resolveUserAndProperty(parsed.data.propertyId);
  if (!ctx.ok) return ctx;
  await createDealBudgetItem({
    orgId: ctx.orgId,
    propertyId: parsed.data.propertyId,
    createdByUserId: ctx.userId,
    category: parsed.data.category,
    label: parsed.data.label,
    amountCents: parsed.data.amountCents,
    status: parsed.data.status,
    notes: parsed.data.notes ?? null,
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const BudgetUpdateSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  patch: z.object({
    category: z.enum(DEAL_BUDGET_CATEGORIES).optional(),
    label: z.string().min(1).max(200).optional(),
    amountCents: z.number().int().min(0).optional(),
    status: z.enum(DEAL_BUDGET_STATUSES).optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
});

export async function updateBudgetItemAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = BudgetUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await resolveUserAndProperty(parsed.data.propertyId);
  if (!ctx.ok) return ctx;
  await updateDealBudgetItem({
    id: parsed.data.id,
    orgId: ctx.orgId,
    patch: parsed.data.patch,
  });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}

const BudgetDeleteSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
});

export async function deleteBudgetItemAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = BudgetDeleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await resolveUserAndProperty(parsed.data.propertyId);
  if (!ctx.ok) return ctx;
  await deleteDealBudgetItem({ id: parsed.data.id, orgId: ctx.orgId });
  revalidate(parsed.data.propertyId);
  return { ok: true };
}
