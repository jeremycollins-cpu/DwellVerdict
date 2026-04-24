import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";
import type {
  DealMilestone,
  DealContact,
  DealNote,
  DealBudgetItem,
  DealMilestoneType,
  DealContactRole,
  DealBudgetCategory,
  DealBudgetStatus,
} from "@dwellverdict/db";

import { getDb } from "@/lib/db";

const { dealMilestones, dealContacts, dealNotes, dealBudgetItems } = schema;

/**
 * Buying-stage CRUD helpers per ADR-7. Every query is org-scoped —
 * we pass orgId on both reads and writes so nothing leaks across
 * workspaces.
 *
 * Server actions are responsible for resolving the caller's orgId
 * via resolveAppUser; these functions trust what they're given.
 */

// ---- Milestones -------------------------------------------------

export async function listDealMilestones(params: {
  propertyId: string;
  orgId: string;
}): Promise<DealMilestone[]> {
  const db = getDb();
  return db
    .select()
    .from(dealMilestones)
    .where(
      and(
        eq(dealMilestones.propertyId, params.propertyId),
        eq(dealMilestones.orgId, params.orgId),
      ),
    )
    .orderBy(sql`${dealMilestones.dueDate} ASC NULLS LAST`);
}

export async function createDealMilestone(params: {
  orgId: string;
  propertyId: string;
  createdByUserId: string;
  milestoneType: DealMilestoneType;
  title: string | null;
  dueDate: Date | null;
  notes: string | null;
}): Promise<DealMilestone> {
  const db = getDb();
  const [row] = await db
    .insert(dealMilestones)
    .values({
      orgId: params.orgId,
      propertyId: params.propertyId,
      createdByUserId: params.createdByUserId,
      milestoneType: params.milestoneType,
      title: params.title,
      dueDate: params.dueDate,
      notes: params.notes,
    })
    .returning();
  if (!row) throw new Error("deal_milestone insert returned no row");
  return row;
}

export async function updateDealMilestone(params: {
  id: string;
  orgId: string;
  patch: Partial<{
    title: string | null;
    dueDate: Date | null;
    completedAt: Date | null;
    notes: string | null;
  }>;
}): Promise<void> {
  const db = getDb();
  await db
    .update(dealMilestones)
    .set({ ...params.patch, updatedAt: sql`NOW()` })
    .where(
      and(
        eq(dealMilestones.id, params.id),
        eq(dealMilestones.orgId, params.orgId),
      ),
    );
}

export async function deleteDealMilestone(params: {
  id: string;
  orgId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .delete(dealMilestones)
    .where(
      and(
        eq(dealMilestones.id, params.id),
        eq(dealMilestones.orgId, params.orgId),
      ),
    );
}

// ---- Contacts ---------------------------------------------------

export async function listDealContacts(params: {
  propertyId: string;
  orgId: string;
}): Promise<DealContact[]> {
  const db = getDb();
  return db
    .select()
    .from(dealContacts)
    .where(
      and(
        eq(dealContacts.propertyId, params.propertyId),
        eq(dealContacts.orgId, params.orgId),
      ),
    )
    .orderBy(dealContacts.role, dealContacts.name);
}

export async function createDealContact(params: {
  orgId: string;
  propertyId: string;
  createdByUserId: string;
  role: DealContactRole;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}): Promise<DealContact> {
  const db = getDb();
  const [row] = await db
    .insert(dealContacts)
    .values({
      orgId: params.orgId,
      propertyId: params.propertyId,
      createdByUserId: params.createdByUserId,
      role: params.role,
      name: params.name,
      company: params.company,
      email: params.email,
      phone: params.phone,
      notes: params.notes,
    })
    .returning();
  if (!row) throw new Error("deal_contact insert returned no row");
  return row;
}

export async function updateDealContact(params: {
  id: string;
  orgId: string;
  patch: Partial<{
    role: DealContactRole;
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
  }>;
}): Promise<void> {
  const db = getDb();
  await db
    .update(dealContacts)
    .set({ ...params.patch, updatedAt: sql`NOW()` })
    .where(
      and(
        eq(dealContacts.id, params.id),
        eq(dealContacts.orgId, params.orgId),
      ),
    );
}

export async function deleteDealContact(params: {
  id: string;
  orgId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .delete(dealContacts)
    .where(
      and(
        eq(dealContacts.id, params.id),
        eq(dealContacts.orgId, params.orgId),
      ),
    );
}

// ---- Notes ------------------------------------------------------

export async function listDealNotes(params: {
  propertyId: string;
  orgId: string;
  limit?: number;
}): Promise<DealNote[]> {
  const db = getDb();
  return db
    .select()
    .from(dealNotes)
    .where(
      and(
        eq(dealNotes.propertyId, params.propertyId),
        eq(dealNotes.orgId, params.orgId),
      ),
    )
    .orderBy(desc(dealNotes.createdAt))
    .limit(params.limit ?? 100);
}

export async function createDealNote(params: {
  orgId: string;
  propertyId: string;
  createdByUserId: string;
  body: string;
}): Promise<DealNote> {
  const db = getDb();
  const [row] = await db
    .insert(dealNotes)
    .values({
      orgId: params.orgId,
      propertyId: params.propertyId,
      createdByUserId: params.createdByUserId,
      body: params.body,
    })
    .returning();
  if (!row) throw new Error("deal_note insert returned no row");
  return row;
}

export async function deleteDealNote(params: {
  id: string;
  orgId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .delete(dealNotes)
    .where(
      and(eq(dealNotes.id, params.id), eq(dealNotes.orgId, params.orgId)),
    );
}

// ---- Budget -----------------------------------------------------

export async function listDealBudgetItems(params: {
  propertyId: string;
  orgId: string;
}): Promise<DealBudgetItem[]> {
  const db = getDb();
  return db
    .select()
    .from(dealBudgetItems)
    .where(
      and(
        eq(dealBudgetItems.propertyId, params.propertyId),
        eq(dealBudgetItems.orgId, params.orgId),
      ),
    )
    .orderBy(dealBudgetItems.category, dealBudgetItems.label);
}

export async function createDealBudgetItem(params: {
  orgId: string;
  propertyId: string;
  createdByUserId: string;
  category: DealBudgetCategory;
  label: string;
  amountCents: number;
  status: DealBudgetStatus;
  notes: string | null;
}): Promise<DealBudgetItem> {
  const db = getDb();
  const [row] = await db
    .insert(dealBudgetItems)
    .values({
      orgId: params.orgId,
      propertyId: params.propertyId,
      createdByUserId: params.createdByUserId,
      category: params.category,
      label: params.label,
      amountCents: params.amountCents,
      status: params.status,
      notes: params.notes,
    })
    .returning();
  if (!row) throw new Error("deal_budget_item insert returned no row");
  return row;
}

export async function updateDealBudgetItem(params: {
  id: string;
  orgId: string;
  patch: Partial<{
    category: DealBudgetCategory;
    label: string;
    amountCents: number;
    status: DealBudgetStatus;
    notes: string | null;
  }>;
}): Promise<void> {
  const db = getDb();
  await db
    .update(dealBudgetItems)
    .set({ ...params.patch, updatedAt: sql`NOW()` })
    .where(
      and(
        eq(dealBudgetItems.id, params.id),
        eq(dealBudgetItems.orgId, params.orgId),
      ),
    );
}

export async function deleteDealBudgetItem(params: {
  id: string;
  orgId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .delete(dealBudgetItems)
    .where(
      and(
        eq(dealBudgetItems.id, params.id),
        eq(dealBudgetItems.orgId, params.orgId),
      ),
    );
}

/** Helper that sums committed + paid items — UI's running-total. */
export async function getDealBudgetTotals(params: {
  propertyId: string;
  orgId: string;
}): Promise<{
  estimated: number;
  committed: number;
  paid: number;
  grandTotal: number;
}> {
  const items = await listDealBudgetItems(params);
  const tally = { estimated: 0, committed: 0, paid: 0 };
  for (const it of items) {
    if (it.status === "estimated") tally.estimated += it.amountCents;
    else if (it.status === "committed") tally.committed += it.amountCents;
    else if (it.status === "paid") tally.paid += it.amountCents;
  }
  return {
    ...tally,
    grandTotal: tally.estimated + tally.committed + tally.paid,
  };
}
