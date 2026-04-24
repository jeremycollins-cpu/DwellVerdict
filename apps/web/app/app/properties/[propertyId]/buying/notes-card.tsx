"use client";

import { useState, useTransition } from "react";
import { Send, Trash2 } from "lucide-react";

import type { DealNote } from "@dwellverdict/db";

import { Button } from "@/components/ui/button";
import { createNoteAction, deleteNoteAction } from "./actions";

/**
 * Notes card — append-only timeline. Most recent on top. Useful
 * for capturing "today seller countered at $X" / "inspection
 * report flagged electrical" without losing context.
 */

export function NotesCard({
  propertyId,
  notes,
}: {
  propertyId: string;
  notes: DealNote[];
}) {
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4 rounded-[14px] bg-card p-6 shadow-card">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
        Notes
      </h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          startTransition(async () => {
            await createNoteAction({ propertyId, body: body.trim() });
            setBody("");
          });
        }}
        className="flex flex-col gap-2"
      >
        <textarea
          rows={3}
          placeholder="Quick note — what changed, what you learned, what's next…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full resize-y rounded-md border border-hairline bg-paper px-3 py-2 text-sm"
        />
        <Button
          type="submit"
          disabled={isPending || !body.trim()}
          className="gap-2 self-start"
        >
          <Send className="h-3.5 w-3.5" />
          {isPending ? "Adding…" : "Add note"}
        </Button>
      </form>

      {notes.length === 0 ? (
        <p className="text-sm text-ink-muted">No notes yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map((n) => (
            <NoteRow key={n.id} propertyId={propertyId} note={n} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteRow({
  propertyId,
  note,
}: {
  propertyId: string;
  note: DealNote;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex items-start gap-3 border-l-2 border-hairline pl-3">
      <div className="flex flex-1 flex-col gap-1">
        <p className="whitespace-pre-wrap text-sm text-ink">{note.body}</p>
        <span className="font-mono text-[11px] text-ink-muted">
          {new Date(note.createdAt).toLocaleString()}
        </span>
      </div>
      <button
        onClick={() =>
          startTransition(async () => {
            if (!confirm("Delete this note?")) return;
            await deleteNoteAction({ id: note.id, propertyId });
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
