"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Scout chat panel — client component rendering message history
 * + compose box. Persisted via POST /api/scout/message.
 */

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export function ScoutChatPanel({
  propertyId,
  initialMessages,
}: {
  propertyId: string;
  initialMessages: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  async function send() {
    const body = input.trim();
    if (!body) return;
    setInput("");
    setError(null);

    // Optimistic user message.
    const tempId = `temp-${Date.now()}`;
    const now = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: body, createdAt: now },
    ]);

    startTransition(async () => {
      try {
        const res = await fetch("/api/scout/message", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ propertyId, message: body }),
          // Scout should stay well under 60s; the route caps there.
          signal: AbortSignal.timeout(65_000),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          reply?: string;
          message?: string;
          error?: string;
          remainingToday?: number;
        };
        if (!res.ok || !payload.ok || !payload.reply) {
          setError(
            payload.message ??
              payload.error ??
              `Scout responded ${res.status}`,
          );
          return;
        }
        setRemainingToday(payload.remainingToday ?? null);
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: payload.reply!,
            createdAt: new Date().toISOString(),
          },
        ]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message.includes("timeout") || err.message.includes("timed out")
              ? "Scout took too long — try again."
              : err.message
            : "Unexpected error",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-[14px] bg-card p-6 shadow-card">
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Ask Scout
        </h2>
        {remainingToday != null ? (
          <span className="font-mono text-[11px] text-ink-muted">
            {remainingToday} left today
          </span>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="flex max-h-[60vh] min-h-[280px] flex-col gap-3 overflow-y-auto rounded-md border border-hairline bg-paper p-4"
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))
        )}
        {isPending ? (
          <div className="flex items-center gap-2 self-start font-mono text-[11px] text-ink-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            Scout is thinking…
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2"
      >
        <textarea
          rows={2}
          placeholder="Ask about deal math, regulations, renovation sequencing, tax strategy…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          disabled={isPending}
          className="flex-1 resize-y rounded-md border border-hairline bg-paper px-3 py-2 text-sm"
        />
        <Button
          type="submit"
          disabled={isPending || !input.trim()}
          className="gap-2"
        >
          <Send className="h-3.5 w-3.5" />
          Send
        </Button>
      </form>

      {error ? (
        <span className="font-mono text-[11px] text-signal-pass">{error}</span>
      ) : null}

      <p className="font-mono text-[11px] text-ink-muted">
        Scout provides research summaries, not investment / legal / tax advice.
        Verify regulatory status, tax implications, and property-specific
        details with the relevant professionals before acting.
      </p>
    </div>
  );
}

function MessageBubble({ message }: { message: Msg }) {
  const isUser = message.role === "user";
  return (
    <div
      className={`flex flex-col ${isUser ? "items-end" : "items-start"} gap-1`}
    >
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-ink text-paper"
            : "border border-hairline bg-card text-ink"
        }`}
      >
        {message.content}
      </div>
      <span className="font-mono text-[10px] text-ink-muted">
        {new Date(message.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
      <p className="text-sm text-ink">
        Scout has the verdict signals for this property loaded.
      </p>
      <p className="font-mono text-[11px] text-ink-muted">
        Try: &ldquo;What&apos;s a realistic cap rate here?&rdquo; · &ldquo;What would kill this deal?&rdquo;
        · &ldquo;Walk me through the regulatory risk.&rdquo;
      </p>
    </div>
  );
}
