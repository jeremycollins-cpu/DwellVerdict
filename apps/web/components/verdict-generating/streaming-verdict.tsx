"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Check,
  Grid3X3,
  Loader2,
  MapPin,
  RefreshCw,
  Shield,
  Sparkles,
} from "lucide-react";

import {
  openVerdictStream,
  pollVerdictUntilDone,
} from "@/lib/verdict/sse-client";
import type {
  SignalKey,
  VerdictProgressEvent,
} from "@/lib/verdict/orchestrator";

/**
 * StreamingVerdict — replaces the static-skeleton VerdictLoader in
 * the pending-verdict branch of the property detail page (M3.2).
 *
 * On click of "Generate verdict", opens an SSE connection to
 * /api/verdicts/[id]/generate and renders mockup-04's streaming UI:
 *
 *   - Eyebrow with elapsed seconds
 *   - Serif "Reading the evidence" headline
 *   - Four domain cards (regulatory / location / comps / revenue),
 *     each ticking from pending → active → complete as the
 *     orchestrator's signal_complete events arrive
 *   - Progress bar
 *   - Live sources panel (URLs cited so far)
 *   - Narrative section that appears once the AI call returns,
 *     revealed via a client-side typewriter animation. Real
 *     Anthropic token streaming for the narrative (vs the current
 *     full-text-in-one-shot tool-call response) is a v1.1 follow-up
 *     — the structured-output verdict task uses a forced tool call
 *     today, and JSON streaming would be a separate validation
 *     milestone
 *   - "Deep Analysis" badge if the narrative was written by Sonnet
 *
 * If the SSE connection fails (cold start, intermediary, etc.),
 * the component falls back to polling /api/verdicts/[id]/status
 * and surfaces a "we lost the live feed; checking the result"
 * state so the user isn't staring at a frozen UI.
 *
 * Cost-control invariant from the legacy VerdictLoader is
 * preserved by default: generation is user-initiated via the
 * button, never auto-started on mount. Multiple page loads against
 * a pending verdict won't double-spend.
 *
 * Exception: when the page mounts with `autoStart={true}` (driven
 * by `?auto=1` in the URL), we fire `start()` once on first render
 * and immediately strip the query param so a subsequent refresh
 * falls back to the click path. This is the post-intake flow —
 * pressing Submit on step 7 IS the user's intent to generate, and
 * forcing a second click on the next page is the kind of friction
 * that makes the wizard feel broken.
 */

type DomainKey = "regulatory" | "location" | "comps" | "revenue";

type DomainState = "pending" | "active" | "complete";

interface DomainSpec {
  key: DomainKey;
  title: string;
  pendingDesc: string;
  signals: SignalKey[];
  Icon: typeof Shield;
}

const DOMAINS: DomainSpec[] = [
  {
    key: "regulatory",
    title: "Regulatory Status",
    pendingDesc: "Permit rules, zoning, HOA overlay",
    signals: ["regulatory"],
    Icon: Shield,
  },
  {
    key: "location",
    title: "Location Signal",
    pendingDesc: "Walkability, amenities, hazard layers",
    signals: ["placeSentiment", "overpass", "fema", "usgs", "fbi", "census"],
    Icon: MapPin,
  },
  {
    key: "comps",
    title: "Comparable Properties",
    pendingDesc: "Recent comps · ADR · occupancy",
    signals: ["airbnb", "zillow", "redfin"],
    Icon: Grid3X3,
  },
  {
    key: "revenue",
    title: "Revenue Projection",
    pendingDesc: "Comp-weighted annual revenue · seasonality",
    signals: ["revenue"],
    Icon: BarChart3,
  },
];

interface SourceRow {
  url: string;
  addedAt: number;
}

interface ConnectionState {
  phase: "idle" | "streaming" | "polling" | "complete" | "error";
  startedAt: number | null;
  domainCompleted: Set<SignalKey>;
  domainStarted: boolean; // signals phase begun
  sources: SourceRow[];
  narrative: {
    text: string;
    summary: string;
    model: string;
    routingReason: string;
  } | null;
  /**
   * Verdict id from the SSE `complete` event. May differ from the
   * starting `verdictId` prop on regenerate (insert-only writes
   * give the new run its own id).
   */
  effectiveVerdictId: string | null;
  /**
   * Property id pulled out of the current pathname so we can
   * navigate to the new verdict's canonical URL on completion.
   */
  propertyId: string | null;
  error: string | null;
  // For "+N in last 6s" rolling window on the sources panel.
  now: number;
}

const initialState = (): ConnectionState => ({
  phase: "idle",
  startedAt: null,
  domainCompleted: new Set(),
  domainStarted: false,
  sources: [],
  narrative: null,
  effectiveVerdictId: null,
  propertyId: null,
  error: null,
  now: Date.now(),
});

export interface StreamingVerdictProps {
  verdictId: string;
  addressFull: string;
  /** When true, send `{ force: true }` so the server bypasses its
   *  ready short-circuit. Used by the "regenerate" action. */
  force?: boolean;
  /** Initial-button label override. */
  startLabel?: string;
  /** Auto-fire generation once on mount, skipping the click. Used
   *  by the post-intake redirect (`?auto=1`). The component strips
   *  the query param after firing so a refresh falls back to the
   *  manual button path and doesn't double-spend. */
  autoStart?: boolean;
}

export function StreamingVerdict({
  verdictId,
  addressFull,
  force = false,
  startLabel = "Generate verdict",
  autoStart = false,
}: StreamingVerdictProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<ConnectionState>(initialState);
  const streamRef = useRef<{ abort: () => void } | null>(null);
  const autoStartFiredRef = useRef(false);

  // Pull `propertyId` from the URL so we can navigate to the new
  // verdict's canonical /verdicts/[id] page on completion. The
  // pathname always contains it because every surface that renders
  // StreamingVerdict lives under /app/properties/[propertyId]/...
  const propertyIdFromPath = (() => {
    const m = pathname?.match(/\/app\/properties\/([^/]+)/);
    return m ? m[1] : null;
  })();

  // Tick the clock once per second so elapsed times animate without
  // having to re-render the world on every event arrival.
  useEffect(() => {
    if (state.phase !== "streaming" && state.phase !== "polling") return;
    const id = window.setInterval(() => {
      setState((s) => ({ ...s, now: Date.now() }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.phase]);

  const handleEvent = useCallback(
    (event: VerdictProgressEvent) => {
      setState((prev) => {
        switch (event.type) {
          case "phase_start":
            if (event.phase === "signals") {
              return { ...prev, domainStarted: true };
            }
            return prev;
          case "signal_complete": {
            const next = new Set(prev.domainCompleted);
            next.add(event.signal);
            const newSources = event.sourceUrls.map((url) => ({
              url,
              addedAt: Date.now(),
            }));
            return {
              ...prev,
              domainCompleted: next,
              sources: dedupSources([...prev.sources, ...newSources]),
            };
          }
          case "narrative_ready":
            return {
              ...prev,
              narrative: {
                text: event.text,
                summary: event.summary,
                model: event.model,
                routingReason: event.routingReason,
              },
            };
          case "complete":
            return {
              ...prev,
              phase: "complete",
              effectiveVerdictId: event.verdictId || prev.effectiveVerdictId,
            };
          case "error":
            return { ...prev, phase: "error", error: event.error };
          default:
            return prev;
        }
      });
    },
    [],
  );

  // Once the server signals complete, navigate to the new verdict's
  // canonical URL. With M3.3's insert-only regenerate, the
  // effectiveVerdictId from the SSE complete event may differ from
  // the verdictId we started streaming against — so we always push
  // to /app/properties/[propertyId]/verdicts/[effectiveId] rather
  // than refreshing in place. Small delay so the user sees the
  // final "complete" state for a moment before the transition.
  useEffect(() => {
    if (state.phase !== "complete") return;
    const id = window.setTimeout(() => {
      const targetVerdictId = state.effectiveVerdictId ?? verdictId;
      if (propertyIdFromPath) {
        router.push(
          `/app/properties/${propertyIdFromPath}/verdicts/${targetVerdictId}`,
        );
        router.refresh();
      } else {
        router.refresh();
      }
    }, 800);
    return () => window.clearTimeout(id);
  }, [state.phase, state.effectiveVerdictId, verdictId, router, propertyIdFromPath]);

  const start = useCallback(() => {
    if (streamRef.current) return;
    setState({ ...initialState(), phase: "streaming", startedAt: Date.now() });

    const handle = openVerdictStream({
      verdictId,
      force,
      onEvent: handleEvent,
      onConnectError: async (err) => {
        console.warn("[verdict-stream] SSE failed, falling back to polling", err);
        setState((s) => ({ ...s, phase: "polling" }));
        try {
          const result = await pollVerdictUntilDone({ verdictId });
          if (result.status === "ready") {
            setState((s) => ({ ...s, phase: "complete" }));
          } else {
            setState((s) => ({
              ...s,
              phase: "error",
              error:
                result.errorMessage ??
                "Generation failed. Try again — failures don't count against your quota.",
            }));
          }
        } catch (pollErr) {
          setState((s) => ({
            ...s,
            phase: "error",
            error:
              pollErr instanceof Error
                ? pollErr.message
                : "Lost connection. Refresh to check the result.",
          }));
        }
      },
    });
    streamRef.current = handle;
  }, [verdictId, force, handleEvent]);

  // Post-intake auto-fire. Runs exactly once per mount when
  // autoStart is true; immediately strips `?auto=1` from the URL
  // so a refresh during streaming falls back to the manual click
  // path and doesn't risk a duplicate orchestration kick (the
  // server-side claim/dedupe is a M3.2 v1.1 follow-up).
  useEffect(() => {
    if (!autoStart) return;
    if (autoStartFiredRef.current) return;
    autoStartFiredRef.current = true;
    start();
    if (pathname) {
      router.replace(pathname, { scroll: false });
    }
  }, [autoStart, pathname, router, start]);

  // If the user navigates away mid-stream we abort the fetch on
  // the client side. The orchestrator on the server keeps running
  // to completion either way.
  useEffect(() => {
    return () => {
      streamRef.current?.abort();
      streamRef.current = null;
    };
  }, []);

  const elapsed = state.startedAt
    ? Math.max(0, Math.floor((state.now - state.startedAt) / 1000))
    : 0;

  if (state.phase === "idle") {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={start}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-hairline-strong bg-card-ink px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink"
        >
          <RefreshCw className="size-4" />
          {startLabel}
        </button>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
          Generation is user-initiated · runs cost a fraction of a cent · 30–60s typical
        </p>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-pass-border bg-pass-soft px-4 py-3 text-sm text-pass">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">Generation failed</p>
          <p className="mt-1 text-ink-70">{state.error}</p>
          <button
            type="button"
            onClick={() => {
              streamRef.current = null;
              start();
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-card-ink px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink"
          >
            <RefreshCw className="size-3" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <Header elapsed={elapsed} addressFull={addressFull} polling={state.phase === "polling"} />

      <StreamTrack state={state} />

      <ProgressBar state={state} />

      {state.sources.length > 0 ? <SourcesPanel state={state} /> : null}

      {state.narrative ? <NarrativeReveal narrative={state.narrative} /> : null}
    </div>
  );
}

function Header({
  elapsed,
  addressFull,
  polling,
}: {
  elapsed: number;
  addressFull: string;
  polling: boolean;
}) {
  const eyebrow = polling
    ? "Lost the live feed · checking the result"
    : `Generating verdict · ${elapsed}s elapsed`;
  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-terracotta-border bg-terracotta-soft px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-terracotta">
        <span className="inline-flex size-[6px] animate-pulse rounded-full bg-terracotta" />
        <span>{eyebrow}</span>
      </div>
      <h2 className="font-serif text-[32px] font-normal leading-[1.1] tracking-[-0.02em] text-ink md:text-[40px]">
        Reading the evidence.
      </h2>
      <p className="max-w-[620px] text-[15px] leading-[1.55] text-ink-muted">
        Scout is checking four domains for{" "}
        <span className="text-ink">{addressFull}</span> — regulatory rules,
        comparable properties, revenue projections, and location signals — each
        grounded in cited sources.
      </p>
    </div>
  );
}

function domainState(
  domain: DomainSpec,
  state: ConnectionState,
): DomainState {
  if (!state.domainStarted) return "pending";
  // Revenue depends on comps; show pending until comps complete.
  if (
    domain.key === "revenue" &&
    !domain.signals.every((s) => state.domainCompleted.has(s)) &&
    !["airbnb"].every((s) => state.domainCompleted.has(s as SignalKey))
  ) {
    return "pending";
  }
  const done = domain.signals.every((s) => state.domainCompleted.has(s));
  if (done) return "complete";
  const any = domain.signals.some((s) => state.domainCompleted.has(s));
  return any || state.domainStarted ? "active" : "pending";
}

function StreamTrack({ state }: { state: ConnectionState }) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-card-ink">
      {DOMAINS.map((domain, i) => {
        const status = domainState(domain, state);
        const Icon = domain.Icon;
        return (
          <div
            key={domain.key}
            className={`flex items-center gap-4 px-5 py-4 ${
              i < DOMAINS.length - 1 ? "border-b border-hairline" : ""
            } ${status === "pending" ? "opacity-50" : ""}`}
          >
            <span
              className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${
                status === "complete"
                  ? "bg-buy-soft text-buy"
                  : status === "active"
                    ? "bg-terracotta-soft text-terracotta"
                    : "bg-paper-warm text-ink-muted"
              }`}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-medium text-ink">
                {domain.title}
              </div>
              <div className="mt-0.5 text-[13px] leading-[1.45] text-ink-muted">
                {domain.pendingDesc}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {status === "complete" ? (
                <>
                  <Check className="size-4 text-buy" strokeWidth={3} />
                  <span className="rounded-[10px] border border-buy-border bg-buy-soft px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-buy">
                    Complete
                  </span>
                </>
              ) : status === "active" ? (
                <>
                  <Loader2 className="size-4 animate-spin text-terracotta" />
                  <span className="rounded-[10px] border border-terracotta-border bg-terracotta-soft px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-terracotta">
                    Analyzing
                  </span>
                </>
              ) : (
                <span className="rounded-[10px] border border-hairline bg-paper-warm px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                  Pending
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProgressBar({ state }: { state: ConnectionState }) {
  const completedDomains = DOMAINS.filter(
    (d) => domainState(d, state) === "complete",
  ).length;
  const ratio = completedDomains / DOMAINS.length;
  // Add narrative weight to the bar — narrative arrival is the
  // last meaningful step, so reflect it visually too.
  const withNarrative = state.narrative ? 1 : ratio * 0.85;
  const pct = Math.round(withNarrative * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-paper-warm">
        <div
          className="h-full rounded-full bg-terracotta transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
        <span>
          <strong className="font-medium text-ink">
            {completedDomains.toString().padStart(2, "0")} of {DOMAINS.length.toString().padStart(2, "0")}
          </strong>{" "}
          domains complete
        </span>
        <span>~{pct}%</span>
      </div>
    </div>
  );
}

function SourcesPanel({ state }: { state: ConnectionState }) {
  const recentWindow = 6_000;
  const recentCount = state.sources.filter(
    (s) => state.now - s.addedAt < recentWindow,
  ).length;

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-card-ink">
      <div className="flex items-baseline justify-between border-b border-hairline bg-paper-warm px-5 py-3">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
          Sources cited so far
        </span>
        {recentCount > 0 ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-terracotta">
            +{recentCount} in last 6s
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
            {state.sources.length} total
          </span>
        )}
      </div>
      <ul className="max-h-[200px] overflow-y-auto">
        {state.sources.map((s) => {
          const isNew = state.now - s.addedAt < recentWindow;
          return (
            <li
              key={`${s.url}-${s.addedAt}`}
              className={`flex items-center px-5 py-2 font-mono text-[12px] text-ink-70 ${
                isNew ? "bg-terracotta-soft/40" : ""
              }`}
            >
              <span className="truncate">{s.url}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NarrativeReveal({
  narrative,
}: {
  narrative: NonNullable<ConnectionState["narrative"]>;
}) {
  // Client-side typewriter so the narrative paragraphs reveal at
  // ~30-50 chars/sec rather than landing as a single block. Mimics
  // the streaming-text feel without needing real Anthropic text
  // streaming through the structured-output tool call (a v1.1
  // follow-up).
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    setRevealed(0);
    const totalChars = narrative.text.length;
    if (totalChars === 0) return;
    // Aim for ~3.5 seconds total reveal; cap CPS so very short
    // narratives don't feel snappy and very long ones don't drag.
    const targetMs = Math.min(4500, Math.max(2200, totalChars * 8));
    const charsPerTick = Math.max(2, Math.ceil(totalChars / (targetMs / 30)));
    const id = window.setInterval(() => {
      setRevealed((cur) => {
        const next = Math.min(totalChars, cur + charsPerTick);
        if (next >= totalChars) {
          window.clearInterval(id);
        }
        return next;
      });
    }, 30);
    return () => window.clearInterval(id);
  }, [narrative.text]);

  const isSonnet = narrative.model === "claude-sonnet-4-6";
  const text = narrative.text.slice(0, revealed);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-hairline bg-card-ink p-6 md:p-7">
      <div className="flex items-center gap-2">
        <Sparkles className="size-3.5 text-terracotta" />
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
          Scout&rsquo;s analysis
        </span>
        {isSonnet ? <DeepAnalysisBadge /> : null}
      </div>
      <p className="whitespace-pre-line font-serif text-[18px] leading-[1.55] text-ink md:text-[20px]">
        {text}
        {revealed < narrative.text.length ? (
          <span className="ml-0.5 inline-block animate-pulse text-terracotta">
            ▍
          </span>
        ) : null}
      </p>
    </div>
  );
}

function DeepAnalysisBadge() {
  // Single-line monospace tag near the narrative when Sonnet wrote
  // it (i.e. routeVerdictNarrative escalated due to low confidence
  // per M3.0). Subtle by design — informative, not boastful.
  return (
    <span
      title="Sonnet 4.6 wrote this narrative — escalated for low-confidence verdicts."
      className="inline-flex items-center gap-1.5 rounded-[10px] border border-terracotta-border bg-terracotta-soft px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-terracotta"
    >
      Deep Analysis
    </span>
  );
}

function dedupSources(rows: SourceRow[]): SourceRow[] {
  const seen = new Set<string>();
  const out: SourceRow[] = [];
  for (const r of rows) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r);
  }
  return out;
}

