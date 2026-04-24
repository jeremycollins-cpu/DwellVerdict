"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import type { DealBudgetItem } from "@dwellverdict/db";

import { Button } from "@/components/ui/button";
import {
  createBudgetItemAction,
  updateBudgetItemAction,
  deleteBudgetItemAction,
} from "./actions";

const CATEGORY_LABELS: Record<string, string> = {
  earnest_money: "Earnest money",
  inspection: "Inspection",
  appraisal: "Appraisal",
  title: "Title",
  escrow: "Escrow",
  transfer_tax: "Transfer tax",
  loan_origination: "Loan origination",
  recording: "Recording",
  survey: "Survey",
  insurance: "Insurance",
  hoa_transfer: "HOA transfer",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  estimated: "Estimated",
  committed: "Committed",
  paid: "Paid",
};

export function BudgetCard({
  propertyId,
  items,
  totals,
}: {
  propertyId: string;
  items: DealBudgetItem[];
  totals: {
    estimated: number;
    committed: number;
    paid: number;
    grandTotal: number;
  };
}) {
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="flex flex-col gap-4 rounded-[14px] bg-card p-6 shadow-card">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Closing costs budget
        </h2>
        <span className="font-mono text-sm text-ink">
          {formatCents(totals.grandTotal)} total
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-md border border-hairline bg-paper p-3">
        <Stat label="Estimated" amountCents={totals.estimated} />
        <Stat label="Committed" amountCents={totals.committed} />
        <Stat label="Paid" amountCents={totals.paid} />
      </div>

      {items.length === 0 && !isAdding ? (
        <p className="text-sm text-ink-muted">
          No line items yet. Start with earnest money + inspection fee.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <BudgetRow key={item.id} propertyId={propertyId} item={item} />
        ))}
      </div>

      {isAdding ? (
        <BudgetAddForm
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
          Add line item
        </Button>
      )}
    </div>
  );
}

function Stat({ label, amountCents }: { label: string; amountCents: number }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </span>
      <span className="font-mono text-sm text-ink">
        {formatCents(amountCents)}
      </span>
    </div>
  );
}

function BudgetRow({
  propertyId,
  item,
}: {
  propertyId: string;
  item: DealBudgetItem;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-3 rounded-md border border-hairline bg-paper px-3 py-2">
      <div className="flex flex-1 flex-col">
        <span className="text-sm text-ink">{item.label}</span>
        <span className="font-mono text-[11px] text-ink-muted">
          {CATEGORY_LABELS[item.category] ?? item.category}
        </span>
      </div>
      <span className="font-mono text-sm text-ink">
        {formatCents(item.amountCents)}
      </span>
      <select
        value={item.status}
        disabled={isPending}
        onChange={(e) =>
          startTransition(async () => {
            await updateBudgetItemAction({
              id: item.id,
              propertyId,
              patch: {
                status: e.target.value as "estimated" | "committed" | "paid",
              },
            });
          })
        }
        className="rounded border border-hairline bg-card px-2 py-1 font-mono text-xs"
      >
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <button
        onClick={() =>
          startTransition(async () => {
            if (!confirm(`Delete "${item.label}"?`)) return;
            await deleteBudgetItemAction({ id: item.id, propertyId });
          })
        }
        disabled={isPending}
        className="text-ink-muted transition-colors hover:text-signal-pass"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function BudgetAddForm({
  propertyId,
  onDone,
}: {
  propertyId: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState("earnest_money");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const cents = Math.round(parseFloat(amount || "0") * 100);
        if (!Number.isFinite(cents) || cents < 0) return;
        startTransition(async () => {
          await createBudgetItemAction({
            propertyId,
            category,
            label: label || CATEGORY_LABELS[category] || "Line item",
            amountCents: cents,
            status: "estimated",
            notes: null,
          });
          setLabel("");
          setAmount("");
          onDone();
        });
      }}
      className="flex flex-col gap-2 rounded-md border border-hairline bg-paper p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded border border-hairline bg-card px-2 py-1 font-mono text-xs"
        >
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="flex-1 rounded border border-hairline bg-card px-2 py-1 text-sm"
        />
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-ink-muted">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
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
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
