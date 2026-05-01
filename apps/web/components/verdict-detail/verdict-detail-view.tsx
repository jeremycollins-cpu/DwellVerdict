import Link from "next/link";
import { ArrowLeft, ChevronRight, Sparkles } from "lucide-react";

import { VerdictDial } from "@/components/verdict-dial";
import { PropertyStageNav } from "@/components/property-stage-nav";
import {
  EVIDENCE_DOMAINS,
  EvidenceCard,
  type EvidenceDomain,
} from "@/components/verdict-detail/evidence-card";
import { FeedbackControls } from "@/components/verdict-detail/feedback-controls";
import { IntakePromptBanner } from "@/components/property-intake/intake-prompt-banner";
import { VerdictLoader } from "@/app/app/properties/[propertyId]/verdict-loader";
import type { Verdict, VerdictFeedback } from "@dwellverdict/db";
import type { IntakeBannerState } from "@/lib/db/queries/properties";

/**
 * Read-only verdict detail view (M3.3 / mockup v4-verdict). Pieces:
 *   - Hero: signal, dial, address, run number, regenerate, Deep
 *     Analysis badge if Sonnet
 *   - Stage nav (existing PropertyStageNav)
 *   - Evidence grid (4 cards via <EvidenceCard>)
 *   - Narrative section
 *   - Score breakdown ("what moved the verdict") if persisted
 *   - Feedback controls
 *   - Run history rail with prior verdicts
 *   - Sources list
 *
 * Renders both legacy and v2 evidence shapes via the type-guarding
 * inside <EvidenceCard>. Old verdicts (data_points = 4 strings)
 * keep working without backfill.
 */

interface VerdictDetailViewProps {
  property: {
    id: string;
    addressFull: string;
  };
  verdict: Verdict;
  /** Sorted DESC; current verdict is the first match. */
  runHistory: ReadonlyArray<Verdict>;
  /** Caller's existing feedback for this verdict, if any. */
  myFeedback: VerdictFeedback | null;
  /**
   * Intake banner state for this property. When 'hard' or 'soft',
   * we render <IntakePromptBanner> above the hero AND swap the
   * regenerate button for an "intake required" stub.
   */
  intakeBannerState: IntakeBannerState;
  intakeStepCompleted: number;
}

const SIGNAL_STYLE: Record<
  "buy" | "watch" | "pass",
  { label: string; className: string }
> = {
  buy: {
    label: "BUY",
    className: "border-buy-border bg-buy-soft text-buy",
  },
  watch: {
    label: "WATCH",
    className: "border-watch-border bg-watch-soft text-watch",
  },
  pass: {
    label: "PASS",
    className: "border-pass-border bg-pass-soft text-pass",
  },
};

function formatRunDate(d: Date): string {
  // 04.26.26
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  return `${mm}.${dd}.${yy}`;
}

function dataPointsByDomain(
  dataPoints: unknown,
  domain: EvidenceDomain,
): unknown {
  if (!dataPoints || typeof dataPoints !== "object") return null;
  const obj = dataPoints as Record<string, unknown>;
  return obj[domain] ?? null;
}

export function VerdictDetailView({
  property,
  verdict,
  runHistory,
  myFeedback,
  intakeBannerState,
  intakeStepCompleted,
}: VerdictDetailViewProps) {
  const signal = (verdict.signal ?? "watch") as "buy" | "watch" | "pass";
  const confidence = verdict.confidence ?? 0;
  const signalStyle = SIGNAL_STYLE[signal];
  const isSonnet = verdict.modelVersion === "claude-sonnet-4-6";

  // Run number = position in DESC history, counting from oldest.
  const totalRuns = runHistory.length;
  const indexInHistory = runHistory.findIndex((r) => r.id === verdict.id);
  const runNumber =
    indexInHistory >= 0 ? totalRuns - indexInHistory : 1;
  const runDateLabel = verdict.completedAt
    ? formatRunDate(new Date(verdict.completedAt))
    : verdict.createdAt
      ? formatRunDate(new Date(verdict.createdAt))
      : "";

  const sources = Array.isArray(verdict.sources) ? (verdict.sources as string[]) : [];
  const breakdown = Array.isArray(verdict.scoreBreakdown)
    ? (verdict.scoreBreakdown as Array<{
        key: string;
        contribution: number;
        note: string;
        // M3.8 fields — present on new verdicts only.
        category?:
          | "rental_fundamentals"
          | "location"
          | "regulatory"
          | "market"
          | "risk";
        weight?: number;
        multiplier?: number | null;
      }>)
    : null;
  // M3.8: detect legacy (pre-thesis-aware) verdicts by absence of
  // `category` on every entry. Legacy verdicts get a "regenerate
  // for thesis-aware analysis" banner; we don't auto-regenerate.
  const isLegacyBreakdown =
    breakdown != null &&
    breakdown.length > 0 &&
    breakdown.every((b) => b.category == null);

  return (
    <div className="flex flex-1 flex-col bg-paper">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-8 md:px-12 md:py-12">
        <Link
          href="/app/properties"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3" />
          All properties
        </Link>

        {intakeBannerState !== "none" ? (
          <div className="mt-6">
            <IntakePromptBanner
              state={intakeBannerState}
              propertyId={property.id}
              resumeStep={intakeStepCompleted}
            />
          </div>
        ) : null}

        {/* Hero */}
        <header className="mt-6 flex flex-col gap-6 rounded-2xl border border-hairline bg-card-ink p-6 md:p-8 lg:flex-row lg:items-start lg:gap-10">
          <div className="flex-1">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
              Property
            </div>
            <h1 className="mt-2 font-mono text-[18px] font-medium tracking-[-0.005em] text-ink md:text-[20px]">
              {property.addressFull}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
              <span>
                Run {String(runNumber).padStart(2, "0")} of {String(totalRuns).padStart(2, "0")}
              </span>
              {runDateLabel ? <span>· {runDateLabel}</span> : null}
              {isSonnet ? (
                <span
                  title="Sonnet 4.6 wrote this narrative — escalated for low-confidence verdicts."
                  className="inline-flex items-center rounded-[10px] border border-terracotta-border bg-terracotta-soft px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-terracotta"
                >
                  Deep Analysis
                </span>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center rounded-[10px] border px-3 py-1.5 font-mono text-[12px] font-medium uppercase tracking-[0.18em] ${signalStyle.className}`}
              >
                {signalStyle.label}
              </span>
              <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-muted">
                Confidence {confidence}/100
              </span>
            </div>

            {verdict.summary ? (
              <p className="mt-5 max-w-[640px] font-serif text-[20px] leading-[1.4] tracking-[-0.01em] text-ink md:text-[22px]">
                {verdict.summary}
              </p>
            ) : null}

            <div className="mt-6">
              {intakeBannerState === "none" ? (
                <VerdictLoader
                  verdictId={verdict.id}
                  label="Regenerate verdict"
                  force
                />
              ) : (
                <Link
                  href={`/app/properties/${property.id}/intake`}
                  className="inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-card-ink px-4 py-2.5 text-sm text-ink-muted transition-colors hover:border-ink hover:text-ink"
                  title="Complete the intake wizard before regenerating — gives the verdict the thesis-aware context it needs."
                >
                  Regenerate locked · Complete intake
                  <ChevronRight className="size-3.5" />
                </Link>
              )}
            </div>
          </div>

          <div className="shrink-0 self-start">
            <VerdictDial fill={confidence} state={signal} size={120} />
          </div>
        </header>

        {/* Stage nav (Finding/Evaluating/Buying/Renovating/Managing) */}
        <div className="mt-8">
          <PropertyStageNav propertyId={property.id} active="finding" />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_240px]">
          {/* Main column */}
          <div className="flex flex-col gap-8">
            {/* Evidence grid */}
            <section>
              <h2 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted">
                Evidence
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {EVIDENCE_DOMAINS.map((d) => (
                  <EvidenceCard
                    key={d.key}
                    domain={d}
                    evidence={dataPointsByDomain(verdict.dataPoints, d.key) as never}
                  />
                ))}
              </div>
            </section>

            {/* Narrative */}
            {verdict.narrative ? (
              <section className="rounded-xl border border-hairline bg-card-ink p-6 md:p-7">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-3.5 text-terracotta" />
                  <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
                    Scout&rsquo;s analysis
                  </span>
                  {isSonnet ? (
                    <span
                      title="Sonnet 4.6 wrote this narrative."
                      className="inline-flex items-center rounded-[10px] border border-terracotta-border bg-terracotta-soft px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-terracotta"
                    >
                      Deep Analysis
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 space-y-4 font-serif text-[18px] leading-[1.55] text-ink md:text-[20px]">
                  {verdict.narrative
                    .split(/\n{2,}/)
                    .filter((p) => p.trim())
                    .map((para, i) => (
                      <p key={i}>{para.trim()}</p>
                    ))}
                </div>
              </section>
            ) : null}

            {/* Score breakdown */}
            {breakdown && breakdown.length > 0 ? (
              <section>
                <h2 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted">
                  What moved the verdict
                </h2>
                {isLegacyBreakdown ? (
                  <div
                    role="note"
                    className="mb-4 rounded-lg border border-hairline-strong bg-paper-warm px-4 py-3 text-[13px] leading-[1.45] text-ink-70"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                      Legacy verdict
                    </span>
                    <span className="ml-2">
                      Generated before thesis-aware scoring. Regenerate to see
                      a breakdown calibrated to your investment thesis.
                    </span>
                  </div>
                ) : null}
                {isLegacyBreakdown ? (
                  <LegacyBreakdownList breakdown={breakdown} />
                ) : (
                  <ThesisAwareBreakdown breakdown={breakdown} />
                )}
              </section>
            ) : null}

            {/* Sources */}
            {sources.length > 0 ? (
              <section>
                <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted">
                  Sources
                </h2>
                <ul className="space-y-1.5">
                  {sources.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-mono text-[11px] text-ink-muted underline-offset-2 hover:text-terracotta hover:underline"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Feedback */}
            <section className="rounded-xl border border-hairline bg-card-ink p-5">
              <FeedbackControls
                verdictId={verdict.id}
                initialRating={
                  (myFeedback?.rating as
                    | "thumbs_up"
                    | "thumbs_down"
                    | undefined) ?? null
                }
                initialComment={myFeedback?.comment ?? null}
                initialIssueCategories={
                  (myFeedback?.issueCategories as
                    | ReadonlyArray<
                        "inaccurate_data" | "missing_context" | "wrong_verdict" | "other"
                      >
                    | undefined) ?? null
                }
              />
            </section>
          </div>

          {/* Run history rail */}
          {runHistory.length > 1 ? (
            <aside className="flex flex-col gap-3">
              <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
                Run history
              </h2>
              <ul className="overflow-hidden rounded-xl border border-hairline bg-card-ink">
                {runHistory.map((run, i) => {
                  const isCurrent = run.id === verdict.id;
                  const num = totalRuns - i;
                  const date =
                    run.completedAt ?? run.createdAt
                      ? formatRunDate(new Date(run.completedAt ?? run.createdAt))
                      : "";
                  const runSignal = run.signal as "buy" | "watch" | "pass" | null;
                  return (
                    <li
                      key={run.id}
                      className={i < runHistory.length - 1 ? "border-b border-hairline" : ""}
                    >
                      <Link
                        href={`/app/properties/${property.id}/verdicts/${run.id}`}
                        aria-current={isCurrent ? "page" : undefined}
                        className={`flex items-center justify-between gap-2 px-4 py-3 transition-colors ${
                          isCurrent ? "bg-terracotta-soft" : "hover:bg-paper-warm"
                        }`}
                      >
                        <div className="flex flex-col">
                          <span
                            className={`font-mono text-[11px] font-medium uppercase tracking-[0.14em] ${
                              isCurrent ? "text-terracotta" : "text-ink"
                            }`}
                          >
                            Run {String(num).padStart(2, "0")}
                          </span>
                          <span className="font-mono text-[10px] text-ink-muted">
                            {date} · {run.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {runSignal ? (
                            <span
                              className={`rounded-[10px] border px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.14em] ${SIGNAL_STYLE[runSignal].className}`}
                            >
                              {SIGNAL_STYLE[runSignal].label}
                            </span>
                          ) : null}
                          <ChevronRight className="size-3.5 text-ink-muted" />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// M3.8 score breakdown rendering
// ============================================================

type BreakdownRow = {
  key: string;
  contribution: number;
  note: string;
  category?:
    | "rental_fundamentals"
    | "location"
    | "regulatory"
    | "market"
    | "risk";
  weight?: number;
  multiplier?: number | null;
};

const CATEGORY_LABEL: Record<NonNullable<BreakdownRow["category"]>, string> = {
  rental_fundamentals: "Rental fundamentals",
  location: "Location",
  regulatory: "Regulatory",
  market: "Market",
  risk: "Risk",
};
const CATEGORY_ORDER: Array<NonNullable<BreakdownRow["category"]>> = [
  "rental_fundamentals",
  "location",
  "regulatory",
  "market",
  "risk",
];

function ContributionPill({ value }: { value: number }) {
  return (
    <span
      className={`font-mono text-[14px] font-medium tabular-nums ${
        value > 0
          ? "text-buy"
          : value < 0
            ? "text-pass"
            : "text-ink-muted"
      }`}
    >
      {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}

function LegacyBreakdownList({ breakdown }: { breakdown: BreakdownRow[] }) {
  return (
    <ul className="overflow-hidden rounded-xl border border-hairline bg-card-ink">
      {breakdown.map((row, i) => (
        <li
          key={`${row.key}-${i}`}
          className={`flex items-baseline gap-4 px-5 py-3 ${
            i < breakdown.length - 1 ? "border-b border-hairline" : ""
          }`}
        >
          <ContributionPill value={row.contribution} />
          <span className="text-[14px] text-ink-70">{row.note}</span>
        </li>
      ))}
    </ul>
  );
}

function ThesisAwareBreakdown({ breakdown }: { breakdown: BreakdownRow[] }) {
  // Group by category, preserving CATEGORY_ORDER. Rules without a
  // category (shouldn't happen post-M3.8) fall into a fallback
  // "Other" bucket so the UI never silently drops rows.
  const grouped = new Map<string, BreakdownRow[]>();
  for (const row of breakdown) {
    const cat = row.category ?? "other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(row);
  }

  const orderedCategories: string[] = [
    ...CATEGORY_ORDER.filter((c) => grouped.has(c)),
    ...(grouped.has("other") ? ["other"] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {orderedCategories.map((cat) => {
        const rows = grouped.get(cat)!;
        const label =
          cat in CATEGORY_LABEL
            ? CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL]
            : "Other";
        return (
          <div
            key={cat}
            className="overflow-hidden rounded-xl border border-hairline bg-card-ink"
          >
            <div className="border-b border-hairline bg-paper-warm px-5 py-2">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                {label}
              </span>
            </div>
            <ul>
              {rows.map((row, i) => (
                <li
                  key={`${row.key}-${i}`}
                  className={`flex items-baseline gap-4 px-5 py-3 ${
                    i < rows.length - 1 ? "border-b border-hairline" : ""
                  }`}
                >
                  <ContributionPill value={row.contribution} />
                  <span className="flex-1 text-[14px] text-ink-70">
                    {row.note}
                  </span>
                  {typeof row.weight === "number" ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                      Weight {row.weight}
                      {typeof row.multiplier === "number"
                        ? ` · ×${row.multiplier.toFixed(1)}`
                        : ""}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
