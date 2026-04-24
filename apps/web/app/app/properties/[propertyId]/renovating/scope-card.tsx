"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import type { RenovationScopeItem } from "@dwellverdict/db";

import { Button } from "@/components/ui/button";
import {
  createScopeItemAction,
  updateScopeItemAction,
  deleteScopeItemAction,
} from "./actions";

const CATEGORY_LABELS: Record<string, string> = {
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  exterior: "Exterior",
  flooring: "Flooring",
  electrical: "Electrical",
  plumbing: "Plumbing",
  hvac: "HVAC",
  painting: "Painting",
  landscaping: "Landscaping",
  roofing: "Roofing",
  structural: "Structural",
  appliances: "Appliances",
  furnishings: "Furnishings",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  in_progress: "In progress",
  complete: "Complete",
  deferred: "Deferred",
};

export function ScopeCard({
  propertyId,
  items,
  totals,
}: {
  propertyId: string;
  items: RenovationScopeItem[];
  totals: { budgeted: number; committed: number; spent: number; remaining: number };
}) {
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="flex flex-col gap-4 rounded-[14px] bg-card p-6 shadow-card">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Renovation scope + budget
        </h2>
        <span className="font-mono text-sm text-ink">
          {formatCents(totals.budgeted)} budgeted
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3 rounded-md border border-hairline bg-paper p-3">
        <Stat label="Budgeted" amount={totals.budgeted} />
        <Stat label="Committed" amount={totals.committed} />
        <Stat label="Spent" amount={totals.spent} />
        <Stat
          label="Remaining"
          amount={totals.remaining}
          tone={totals.remaining < 0 ? "over" : "ok"}
        />
      </div>

      {items.length === 0 && !isAdding ? (
        <p className="text-sm text-ink-muted">
          No scope items yet. Start with major rooms or systems (kitchen, bath, roof).
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <ScopeRow key={it.id} propertyId={propertyId} item={it} />
        ))}
      </div>

      {isAdding ? (
        <ScopeAddForm propertyId={propertyId} onDone={() => setIsAdding(false)} />
      ) : (
        <Button
          variant="outline"
          onClick={() => setIsAdding(true)}
          className="gap-2 self-start"
        >
          <Plus className="h-3.5 w-3.5" />
          Add scope item
        </Button>
      )}
    </div>
  );
}

function Stat({
  label,
  amount,
  tone = "ok",
}: {
  label: string;
  amount: number;
  tone?: "ok" | "over";
}) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </span>
      <span
        className={`font-mono text-sm ${tone === "over" ? "text-signal-pass" : "text-ink"}`}
      >
        {formatCents(amount)}
      </span>
    </div>
  );
}

function ScopeRow({
  propertyId,
  item,
}: {
  propertyId: string;
  item: RenovationScopeItem;
}) {
  const [isPending, startTransition] = useTransition();
  const [committed, setCommitted] = useState(
    (item.committedCents / 100).toString(),
  );
  const [spent, setSpent] = useState((item.spentCents / 100).toString());

  const commitPatch = (field: "committedCents" | "spentCents", rawStr: string) => {
    const cents = Math.round(parseFloat(rawStr || "0") * 100);
    if (!Number.isFinite(cents) || cents < 0) return;
    startTransition(async () => {
      await updateScopeItemAction({
        id: item.id,
        propertyId,
        patch: { [field]: cents },
      });
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-hairline bg-paper px-3 py-2 md:flex-row md:items-center">
      <div className="flex flex-1 flex-col">
        <span className="text-sm text-ink">{item.label}</span>
        <span className="font-mono text-[11px] text-ink-muted">
          {CATEGORY_LABELS[item.category] ?? item.category} · budgeted{" "}
          {formatCents(item.budgetedCents)}
        </span>
      </div>

      <label className="flex items-center gap-1 text-xs">
        <span className="font-mono text-[10px] uppercase text-ink-muted">Committed</span>
        <span className="text-ink-muted">$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={committed}
          onChange={(e) => setCommitted(e.target.value)}
          onBlur={(e) => commitPatch("committedCents", e.target.value)}
          className="w-20 rounded border border-hairline bg-card px-1 py-0.5 text-right text-xs"
        />
      </label>

      <label className="flex items-center gap-1 text-xs">
        <span className="font-mono text-[10px] uppercase text-ink-muted">Spent</span>
        <span className="text-ink-muted">$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={spent}
          onChange={(e) => setSpent(e.target.value)}
          onBlur={(e) => commitPatch("spentCents", e.target.value)}
          className="w-20 rounded border border-hairline bg-card px-1 py-0.5 text-right text-xs"
        />
      </label>

      <select
        value={item.status}
        disabled={isPending}
        onChange={(e) =>
          startTransition(async () => {
            await updateScopeItemAction({
              id: item.id,
              propertyId,
              patch: {
                status: e.target.value as
                  | "planning"
                  | "in_progress"
                  | "complete"
                  | "deferred",
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
            await deleteScopeItemAction({ id: item.id, propertyId });
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

function ScopeAddForm({
  propertyId,
  onDone,
}: {
  propertyId: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState("kitchen");
  const [label, setLabel] = useState("");
  const [budgeted, setBudgeted] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const cents = Math.round(parseFloat(budgeted || "0") * 100);
        startTransition(async () => {
          await createScopeItemAction({
            propertyId,
            category,
            label: label || CATEGORY_LABELS[category] || "Scope item",
            budgetedCents: Number.isFinite(cents) && cents >= 0 ? cents : 0,
            notes: null,
          });
          setLabel("");
          setBudgeted("");
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
          <span className="font-mono text-xs text-ink-muted">Budget $</span>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={budgeted}
            onChange={(e) => setBudgeted(e.target.value)}
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
