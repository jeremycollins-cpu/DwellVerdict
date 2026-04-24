"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";

import type { RenovationTask, RenovationScopeItem } from "@dwellverdict/db";

import { Button } from "@/components/ui/button";
import {
  createRenovationTaskAction,
  updateRenovationTaskAction,
  deleteRenovationTaskAction,
} from "./actions";

export function TasksCard({
  propertyId,
  tasks,
  scopeItems,
}: {
  propertyId: string;
  tasks: RenovationTask[];
  scopeItems: RenovationScopeItem[];
}) {
  const [isAdding, setIsAdding] = useState(false);

  const scopeById = new Map(scopeItems.map((s) => [s.id, s]));

  return (
    <div className="flex flex-col gap-4 rounded-[14px] bg-card p-6 shadow-card">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
        Tasks
      </h2>

      {tasks.length === 0 && !isAdding ? (
        <p className="text-sm text-ink-muted">
          No tasks yet. Add what needs to happen next — order cabinets, call
          inspector, pull permits.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            propertyId={propertyId}
            task={t}
            scopeLabel={
              t.scopeItemId ? scopeById.get(t.scopeItemId)?.label : undefined
            }
          />
        ))}
      </div>

      {isAdding ? (
        <TaskAddForm
          propertyId={propertyId}
          scopeItems={scopeItems}
          onDone={() => setIsAdding(false)}
        />
      ) : (
        <Button
          variant="outline"
          onClick={() => setIsAdding(true)}
          className="gap-2 self-start"
        >
          <Plus className="h-3.5 w-3.5" />
          Add task
        </Button>
      )}
    </div>
  );
}

function TaskRow({
  propertyId,
  task,
  scopeLabel,
}: {
  propertyId: string;
  task: RenovationTask;
  scopeLabel: string | undefined;
}) {
  const [isPending, startTransition] = useTransition();
  const completed = task.completedAt != null;

  return (
    <div className="flex items-center gap-3 rounded-md border border-hairline bg-paper px-3 py-2">
      <button
        onClick={() =>
          startTransition(async () => {
            await updateRenovationTaskAction({
              id: task.id,
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
          {task.title}
        </span>
        <div className="flex items-center gap-2 font-mono text-[11px] text-ink-muted">
          {task.dueDate ? (
            <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>
          ) : null}
          {scopeLabel ? <span>· {scopeLabel}</span> : null}
        </div>
      </div>
      <button
        onClick={() =>
          startTransition(async () => {
            if (!confirm("Delete this task?")) return;
            await deleteRenovationTaskAction({ id: task.id, propertyId });
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

function TaskAddForm({
  propertyId,
  scopeItems,
  onDone,
}: {
  propertyId: string;
  scopeItems: RenovationScopeItem[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [scopeItemId, setScopeItemId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        startTransition(async () => {
          await createRenovationTaskAction({
            propertyId,
            scopeItemId: scopeItemId || null,
            title: title.trim(),
            dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          });
          setTitle("");
          setScopeItemId("");
          setDueDate("");
          onDone();
        });
      }}
      className="flex flex-col gap-2 rounded-md border border-hairline bg-paper p-3"
    >
      <input
        type="text"
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        className="rounded border border-hairline bg-card px-2 py-1 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={scopeItemId}
          onChange={(e) => setScopeItemId(e.target.value)}
          className="rounded border border-hairline bg-card px-2 py-1 font-mono text-xs"
        >
          <option value="">No scope item</option>
          {scopeItems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
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
