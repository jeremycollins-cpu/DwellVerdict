import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";
import type {
  RenovationScopeItem,
  RenovationScopeCategory,
  RenovationScopeStatus,
  RenovationTask,
  RenovationContractor,
  RenovationTrade,
  RenovationQuote,
  RenovationQuoteStatus,
} from "@dwellverdict/db";

import { getDb } from "@/lib/db";

const {
  renovationScopeItems,
  renovationTasks,
  renovationContractors,
  renovationQuotes,
} = schema;

// ---- Scope items ------------------------------------------------

export async function listScopeItems(params: {
  propertyId: string;
  orgId: string;
}): Promise<RenovationScopeItem[]> {
  const db = getDb();
  return db
    .select()
    .from(renovationScopeItems)
    .where(
      and(
        eq(renovationScopeItems.propertyId, params.propertyId),
        eq(renovationScopeItems.orgId, params.orgId),
      ),
    )
    .orderBy(renovationScopeItems.category, renovationScopeItems.label);
}

export async function createScopeItem(params: {
  orgId: string;
  propertyId: string;
  createdByUserId: string;
  category: RenovationScopeCategory;
  label: string;
  budgetedCents: number;
  notes: string | null;
}): Promise<RenovationScopeItem> {
  const db = getDb();
  const [row] = await db
    .insert(renovationScopeItems)
    .values({
      orgId: params.orgId,
      propertyId: params.propertyId,
      createdByUserId: params.createdByUserId,
      category: params.category,
      label: params.label,
      budgetedCents: params.budgetedCents,
      notes: params.notes,
    })
    .returning();
  if (!row) throw new Error("renovation_scope_item insert returned no row");
  return row;
}

export async function updateScopeItem(params: {
  id: string;
  orgId: string;
  patch: Partial<{
    category: RenovationScopeCategory;
    label: string;
    budgetedCents: number;
    committedCents: number;
    spentCents: number;
    status: RenovationScopeStatus;
    notes: string | null;
  }>;
}): Promise<void> {
  const db = getDb();
  await db
    .update(renovationScopeItems)
    .set({ ...params.patch, updatedAt: sql`NOW()` })
    .where(
      and(
        eq(renovationScopeItems.id, params.id),
        eq(renovationScopeItems.orgId, params.orgId),
      ),
    );
}

export async function deleteScopeItem(params: {
  id: string;
  orgId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .delete(renovationScopeItems)
    .where(
      and(
        eq(renovationScopeItems.id, params.id),
        eq(renovationScopeItems.orgId, params.orgId),
      ),
    );
}

export async function getRenovationBudgetTotals(params: {
  propertyId: string;
  orgId: string;
}): Promise<{
  budgeted: number;
  committed: number;
  spent: number;
  remaining: number;
}> {
  const items = await listScopeItems(params);
  const tally = { budgeted: 0, committed: 0, spent: 0 };
  for (const it of items) {
    tally.budgeted += it.budgetedCents;
    tally.committed += it.committedCents;
    tally.spent += it.spentCents;
  }
  return { ...tally, remaining: tally.budgeted - tally.spent };
}

// ---- Tasks ------------------------------------------------------

export async function listRenovationTasks(params: {
  propertyId: string;
  orgId: string;
}): Promise<RenovationTask[]> {
  const db = getDb();
  return db
    .select()
    .from(renovationTasks)
    .where(
      and(
        eq(renovationTasks.propertyId, params.propertyId),
        eq(renovationTasks.orgId, params.orgId),
      ),
    )
    .orderBy(sql`${renovationTasks.dueDate} ASC NULLS LAST`);
}

export async function createRenovationTask(params: {
  orgId: string;
  propertyId: string;
  createdByUserId: string;
  scopeItemId: string | null;
  title: string;
  dueDate: Date | null;
  notes: string | null;
}): Promise<RenovationTask> {
  const db = getDb();
  const [row] = await db
    .insert(renovationTasks)
    .values({
      orgId: params.orgId,
      propertyId: params.propertyId,
      createdByUserId: params.createdByUserId,
      scopeItemId: params.scopeItemId,
      title: params.title,
      dueDate: params.dueDate,
      notes: params.notes,
    })
    .returning();
  if (!row) throw new Error("renovation_task insert returned no row");
  return row;
}

export async function updateRenovationTask(params: {
  id: string;
  orgId: string;
  patch: Partial<{
    title: string;
    scopeItemId: string | null;
    dueDate: Date | null;
    completedAt: Date | null;
    notes: string | null;
  }>;
}): Promise<void> {
  const db = getDb();
  await db
    .update(renovationTasks)
    .set({ ...params.patch, updatedAt: sql`NOW()` })
    .where(
      and(
        eq(renovationTasks.id, params.id),
        eq(renovationTasks.orgId, params.orgId),
      ),
    );
}

export async function deleteRenovationTask(params: {
  id: string;
  orgId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .delete(renovationTasks)
    .where(
      and(
        eq(renovationTasks.id, params.id),
        eq(renovationTasks.orgId, params.orgId),
      ),
    );
}

// ---- Contractors ------------------------------------------------

export async function listContractors(params: {
  propertyId: string;
  orgId: string;
}): Promise<RenovationContractor[]> {
  const db = getDb();
  return db
    .select()
    .from(renovationContractors)
    .where(
      and(
        eq(renovationContractors.propertyId, params.propertyId),
        eq(renovationContractors.orgId, params.orgId),
      ),
    )
    .orderBy(renovationContractors.trade, renovationContractors.name);
}

export async function createContractor(params: {
  orgId: string;
  propertyId: string;
  createdByUserId: string;
  trade: RenovationTrade;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  licenseNumber: string | null;
  notes: string | null;
}): Promise<RenovationContractor> {
  const db = getDb();
  const [row] = await db
    .insert(renovationContractors)
    .values({
      orgId: params.orgId,
      propertyId: params.propertyId,
      createdByUserId: params.createdByUserId,
      trade: params.trade,
      name: params.name,
      company: params.company,
      email: params.email,
      phone: params.phone,
      licenseNumber: params.licenseNumber,
      notes: params.notes,
    })
    .returning();
  if (!row) throw new Error("renovation_contractor insert returned no row");
  return row;
}

export async function deleteContractor(params: {
  id: string;
  orgId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .delete(renovationContractors)
    .where(
      and(
        eq(renovationContractors.id, params.id),
        eq(renovationContractors.orgId, params.orgId),
      ),
    );
}

// ---- Quotes -----------------------------------------------------

export async function listQuotes(params: {
  propertyId: string;
  orgId: string;
}): Promise<RenovationQuote[]> {
  const db = getDb();
  return db
    .select()
    .from(renovationQuotes)
    .where(
      and(
        eq(renovationQuotes.propertyId, params.propertyId),
        eq(renovationQuotes.orgId, params.orgId),
      ),
    )
    .orderBy(renovationQuotes.createdAt);
}

export async function createQuote(params: {
  orgId: string;
  propertyId: string;
  createdByUserId: string;
  contractorId: string | null;
  scopeItemId: string | null;
  label: string;
  amountCents: number;
  status: RenovationQuoteStatus;
  notes: string | null;
}): Promise<RenovationQuote> {
  const db = getDb();
  const [row] = await db
    .insert(renovationQuotes)
    .values({
      orgId: params.orgId,
      propertyId: params.propertyId,
      createdByUserId: params.createdByUserId,
      contractorId: params.contractorId,
      scopeItemId: params.scopeItemId,
      label: params.label,
      amountCents: params.amountCents,
      status: params.status,
      notes: params.notes,
    })
    .returning();
  if (!row) throw new Error("renovation_quote insert returned no row");
  return row;
}

export async function updateQuote(params: {
  id: string;
  orgId: string;
  patch: Partial<{
    status: RenovationQuoteStatus;
    amountCents: number;
    label: string;
    notes: string | null;
  }>;
}): Promise<void> {
  const db = getDb();
  await db
    .update(renovationQuotes)
    .set({ ...params.patch, updatedAt: sql`NOW()` })
    .where(
      and(
        eq(renovationQuotes.id, params.id),
        eq(renovationQuotes.orgId, params.orgId),
      ),
    );
}

export async function deleteQuote(params: {
  id: string;
  orgId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .delete(renovationQuotes)
    .where(
      and(
        eq(renovationQuotes.id, params.id),
        eq(renovationQuotes.orgId, params.orgId),
      ),
    );
}
