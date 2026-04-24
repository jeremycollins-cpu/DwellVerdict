"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";

import type { DealMilestone } from "@dwellverdict/db";

import { Button } from "@/components/ui/button";
import {
  createMilestoneAction,
  updateMilestoneAction,
  deleteMilestoneAction,
} from "./actions";

/**
 * Milestones card — key deadlines (inspection, financing, appraisal,
 * closing, earnest_money, custom). Each row is a checkbox + title +
 * due date. Completed milestones render struck-through.
 */

const MILESTONE_LABELS: Record<string, string> = {
  inspection: "Inspection",
  financing: "Financing",
  appraisal: "Appraisal",
  closing: "Closing",
  earnest_money: "Earnest money",
  custom: "Custom",
};

export function MilestonesCard({
  propertyId,
  milestones,
}: {
  propertyId: string;
  milestones: DealMilestone[];
}) {
  const [isAdding, setIsAdding] = useState(false);

  return (
    <Card title="Deadlines">
      <div className="flex flex-col gap-3">
        {milestones.length === 0 && !isAdding ? (
          <p className="text-sm text-ink-muted">
            No deadlines yet. Add inspection, financing, appraisal, and closing
            dates as they&apos;re set.
          </p>
        ) : null}

        {milestones.map((m) => (
          <MilestoneRow key={m.id} propertyId={propertyId} milestone={m} />
        ))}

        {isAdding ? (
          <MilestoneAddForm
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
            Add deadline
          </Button>
        )}
      </div>
    </Card>
  );
}

function MilestoneRow({
  propertyId,
  milestone,
}: {
  propertyId: string;
  milestone: DealMilestone;
}) {
  const [isPending, startTransition] = useTransition();
  const completed = milestone.completedAt != null;

  const displayTitle =
    milestone.title ??
    MILESTONE_LABELS[milestone.milestoneType] ??
    milestone.milestoneType;

  return (
    <div className="flex items-center gap-3 rounded-md border border-hairline bg-paper px-3 py-2">
      <button
        onClick={() =>
          startTransition(async () => {
            await updateMilestoneAction({
              id: milestone.id,
              propertyId,
              patch: {
                completedAt: completed ? null : new Date().toISOString(),
              },
            });
          })
        }
        disabled={isPending}
        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
          completed
            ? "border-signal-buy bg-signal-buy text-paper"
            : "border-hairline bg-paper hover:border-ink-muted"
        }`}
      >
        {completed ? <Check className="h-3 w-3" /> : null}
      </button>

      <div className="flex flex-1 flex-col">
        <span
          className={`text-sm ${completed ? "text-ink-muted line-through" : "text-ink"}`}
        >
          {displayTitle}
        </span>
        {milestone.dueDate ? (
          <span className="font-mono text-[11px] text-ink-muted">
            Due {new Date(milestone.dueDate).toLocaleDateString()}
          </span>
        ) : null}
      </div>

      <button
        onClick={() =>
          startTransition(async () => {
            if (!confirm("Delete this deadline?")) return;
            await deleteMilestoneAction({ id: milestone.id, propertyId });
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

function MilestoneAddForm({
  propertyId,
  onDone,
}: {
  propertyId: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState("inspection");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await createMilestoneAction({
            propertyId,
            milestoneType: type,
            title: type === "custom" ? title || null : null,
            dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          });
          setTitle("");
          setDueDate("");
          onDone();
        });
      }}
      className="flex flex-col gap-2 rounded-md border border-hairline bg-paper p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded border border-hairline bg-card px-2 py-1 font-mono text-xs"
        >
          {Object.entries(MILESTONE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {type === "custom" ? (
          <input
            type="text"
            placeholder="Milestone title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="flex-1 rounded border border-hairline bg-card px-2 py-1 text-sm"
          />
        ) : null}
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded border border-hairline bg-card px-2 py-1 font-mono text-xs"
        />
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

// Internal card wrapper — extracted for reuse across buying sub-pages.
function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[14px] bg-card p-6 shadow-card">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
        {title}
      </h2>
      {children}
    </div>
  );
}
