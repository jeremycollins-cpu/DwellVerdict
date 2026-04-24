"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  EXPENSE_CATEGORIES,
  type PropertyExpense,
  type ExpenseCategory,
} from "@dwellverdict/db";

import { Button } from "@/components/ui/button";
import { createExpenseAction, deleteExpenseAction } from "./actions";

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

export function ExpensesCard({
  propertyId,
  expenses,
}: {
  propertyId: string;
  expenses: PropertyExpense[];
}) {
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="flex flex-col gap-4 rounded-[14px] bg-card p-6 shadow-card">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
        Expenses
      </h2>

      {expenses.length === 0 && !isAdding ? (
        <p className="text-sm text-ink-muted">
          No expenses yet. Add mortgage interest, utilities, supplies as they
          happen — categorized by Schedule E for tax time.
        </p>
      ) : null}

      {expenses.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-hairline font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                <th className="py-1 pr-3">Date</th>
                <th className="py-1 pr-3">Category</th>
                <th className="py-1 pr-3">Label</th>
                <th className="py-1 pr-3">Vendor</th>
                <th className="py-1 pr-3 text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <ExpenseRow key={e.id} propertyId={propertyId} expense={e} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {isAdding ? (
        <ExpenseAddForm
          propertyId={propertyId}
          onDone={() => setIsAdding(false)}
        />
      ) : (
        <Button
          variant="outline"
          onClick={() => setIsAdding(true)}
          className="gap-2 self-start"
        >
          <Plus className="h-3.5 w-3.5" />
          Add expense
        </Button>
      )}
    </div>
  );
}

function ExpenseRow({
  propertyId,
  expense,
}: {
  propertyId: string;
  expense: PropertyExpense;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <tr className="border-b border-hairline text-sm">
      <td className="py-2 pr-3 font-mono text-xs">
        {new Date(expense.incurredAt).toLocaleDateString()}
      </td>
      <td className="py-2 pr-3 font-mono text-xs">
        {CATEGORY_LABELS[expense.category] ?? expense.category}
      </td>
      <td className="py-2 pr-3">{expense.label}</td>
      <td className="py-2 pr-3 text-ink-muted">{expense.vendor ?? "—"}</td>
      <td className="py-2 pr-3 text-right font-mono">
        {formatCents(expense.amountCents)}
      </td>
      <td className="py-2 pr-3">
        <button
          onClick={() =>
            startTransition(async () => {
              if (!confirm(`Delete "${expense.label}"?`)) return;
              await deleteExpenseAction({ id: expense.id, propertyId });
            })
          }
          disabled={isPending}
          className="text-ink-muted transition-colors hover:text-signal-pass"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function ExpenseAddForm({
  propertyId,
  onDone,
}: {
  propertyId: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [incurredAt, setIncurredAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [category, setCategory] = useState<ExpenseCategory>("utilities");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const cents = Math.round(parseFloat(amount || "0") * 100);
        if (!Number.isFinite(cents) || cents < 0) return;
        startTransition(async () => {
          await createExpenseAction({
            propertyId,
            incurredAt: new Date(incurredAt).toISOString(),
            category,
            label,
            amountCents: cents,
            vendor: vendor || null,
            notes: null,
          });
          setLabel("");
          setAmount("");
          setVendor("");
          onDone();
        });
      }}
      className="flex flex-col gap-2 rounded-md border border-hairline bg-paper p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={incurredAt}
          onChange={(e) => setIncurredAt(e.target.value)}
          required
          className="rounded border border-hairline bg-card px-2 py-1 font-mono text-xs"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          className="rounded border border-hairline bg-card px-2 py-1 font-mono text-xs"
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c] ?? c}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Label *"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          className="flex-1 rounded border border-hairline bg-card px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Vendor"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          className="flex-1 rounded border border-hairline bg-card px-2 py-1 text-sm"
        />
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-ink-muted">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-24 rounded border border-hairline bg-card px-2 py-1 text-sm"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending} className="gap-2">
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
