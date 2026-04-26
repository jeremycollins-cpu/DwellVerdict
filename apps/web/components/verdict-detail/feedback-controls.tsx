"use client";

import { useState } from "react";
import { Loader2, ThumbsDown, ThumbsUp, X } from "lucide-react";

import {
  VERDICT_FEEDBACK_ISSUE_CATEGORIES,
  type VerdictFeedbackIssueCategory,
  type VerdictFeedbackRating,
} from "@dwellverdict/db";

/**
 * Inline thumbs up / thumbs down controls. Thumbs up posts
 * immediately. Thumbs down opens a small inline panel with
 * issue-category checkboxes and an optional comment box; user can
 * skip and submit empty.
 *
 * Re-rating: clicking a previously-selected rating clears it via
 * DELETE; clicking the other rating overwrites via POST. Both
 * happen against the existing API endpoints.
 */

interface FeedbackControlsProps {
  verdictId: string;
  initialRating: VerdictFeedbackRating | null;
  initialComment: string | null;
  initialIssueCategories: ReadonlyArray<VerdictFeedbackIssueCategory> | null;
}

const ISSUE_LABELS: Record<VerdictFeedbackIssueCategory, string> = {
  inaccurate_data: "Inaccurate data",
  missing_context: "Missing context",
  wrong_verdict: "Wrong verdict",
  other: "Other",
};

export function FeedbackControls({
  verdictId,
  initialRating,
  initialComment,
  initialIssueCategories,
}: FeedbackControlsProps) {
  const [rating, setRating] = useState<VerdictFeedbackRating | null>(
    initialRating,
  );
  const [showDownPanel, setShowDownPanel] = useState(false);
  const [comment, setComment] = useState(initialComment ?? "");
  const [categories, setCategories] = useState<
    ReadonlyArray<VerdictFeedbackIssueCategory>
  >(initialIssueCategories ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (
    nextRating: VerdictFeedbackRating,
    body?: {
      comment?: string;
      issueCategories?: VerdictFeedbackIssueCategory[];
    },
  ) => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/verdicts/${verdictId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rating: nextRating,
          comment: body?.comment || undefined,
          issueCategories:
            body?.issueCategories && body.issueCategories.length > 0
              ? body.issueCategories
              : undefined,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(json.message ?? `Feedback failed (${res.status})`);
      }
      setRating(nextRating);
      setShowDownPanel(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save feedback.");
    } finally {
      setPending(false);
    }
  };

  const clear = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/verdicts/${verdictId}/feedback`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Couldn't clear feedback.");
      setRating(null);
      setComment("");
      setCategories([]);
      setShowDownPanel(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't clear feedback.");
    } finally {
      setPending(false);
    }
  };

  const handleUp = () => {
    if (rating === "thumbs_up") {
      void clear();
      return;
    }
    void submit("thumbs_up");
  };

  const handleDown = () => {
    if (rating === "thumbs_down") {
      void clear();
      return;
    }
    setShowDownPanel(true);
  };

  const toggleCategory = (cat: VerdictFeedbackIssueCategory) => {
    setCategories((cur) =>
      cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat],
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
          Was this verdict helpful?
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleUp}
            disabled={pending}
            aria-label={
              rating === "thumbs_up" ? "Clear thumbs up" : "Mark helpful"
            }
            className={`inline-flex size-8 items-center justify-center rounded-md border transition-colors ${
              rating === "thumbs_up"
                ? "border-buy bg-buy-soft text-buy"
                : "border-hairline-strong bg-card-ink text-ink-muted hover:border-ink hover:text-ink"
            }`}
          >
            <ThumbsUp className="size-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={handleDown}
            disabled={pending}
            aria-label={
              rating === "thumbs_down" ? "Clear thumbs down" : "Mark not helpful"
            }
            className={`inline-flex size-8 items-center justify-center rounded-md border transition-colors ${
              rating === "thumbs_down"
                ? "border-pass bg-pass-soft text-pass"
                : "border-hairline-strong bg-card-ink text-ink-muted hover:border-ink hover:text-ink"
            }`}
          >
            <ThumbsDown className="size-3.5" strokeWidth={2} />
          </button>
          {pending ? (
            <Loader2 className="ml-1 size-3.5 animate-spin text-ink-muted" />
          ) : null}
        </div>
        {rating ? (
          <button
            type="button"
            onClick={clear}
            disabled={pending}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Change
          </button>
        ) : null}
        {error ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-pass">
            {error}
          </span>
        ) : null}
      </div>

      {showDownPanel ? (
        <div className="rounded-xl border border-hairline bg-paper-warm p-5">
          <div className="flex items-start justify-between">
            <p className="text-[13px] font-medium text-ink">
              What&rsquo;s wrong with this verdict?
            </p>
            <button
              type="button"
              onClick={() => setShowDownPanel(false)}
              aria-label="Close feedback panel"
              className="-mr-1 -mt-1 inline-flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-card-ink hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <p className="mt-1 text-[12px] text-ink-muted">
            Optional — helps us improve the AI. You can submit without picking
            any.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {VERDICT_FEEDBACK_ISSUE_CATEGORIES.map((cat) => {
              const selected = categories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                    selected
                      ? "border-terracotta bg-terracotta text-white"
                      : "border-hairline-strong bg-card-ink text-ink-70 hover:border-ink"
                  }`}
                >
                  {ISSUE_LABELS[cat]}
                </button>
              );
            })}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Tell us more (optional)…"
            className="mt-3 w-full rounded-md border border-hairline-strong bg-card-ink px-3 py-2 text-[13px] text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
          />

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowDownPanel(false)}
              disabled={pending}
              className="rounded-md px-3 py-1.5 text-[12px] font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                void submit("thumbs_down", {
                  comment: comment.trim(),
                  issueCategories: [...categories],
                })
              }
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-paper transition-colors hover:bg-ink-70 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : null}
              Submit feedback
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
