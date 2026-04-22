import { VerdictDial } from "@/components/verdict-dial";

/**
 * VerdictCertificate — the signature card every property report mirrors.
 *
 * Three render modes driven by `mode`:
 *
 *   "placeholder" — neutral dial, bracketed label text. Used on the
 *     landing page to teach readers the shape without claiming a
 *     specific property. No data props accepted.
 *
 *   "pending" — same shape as placeholder but with an animated
 *     "generating" affordance and rotating micro-copy. Used on the
 *     property detail page while the Anthropic call is in flight.
 *
 *   "ready" — real verdict. All data props required.
 *
 * Design lock (per Verdict Ledger direction):
 *   - 3px terracotta left stripe — THE visual identifier for every
 *     verdict-class surface.
 *   - Layered warm shadow via `shadow-card` utility.
 *   - Hairline dividers between rows, not solid separators.
 *   - Uppercase mono labels in ink-muted, content below in the
 *     appropriate family (mono for data, sans for narrative).
 *   - VerdictDial top-right at 84px. Fills from 0 on scroll-into-view.
 */

import { PendingMicrocopy } from "@/components/pending-microcopy";

export type VerdictCertificateData = {
  addressFull: string;
  signal: "buy" | "watch" | "pass";
  confidence: number;
  summary: string;
  narrative: string;
  dataPoints: {
    comps: string;
    revenue: string;
    regulatory: string;
    location: string;
  };
  sources: string[];
};

type Props =
  | { mode: "placeholder" }
  | { mode: "pending"; addressFull: string }
  | { mode: "ready"; data: VerdictCertificateData };

const SIGNAL_LABEL: Record<"buy" | "watch" | "pass", string> = {
  buy: "BUY",
  watch: "WATCH",
  pass: "PASS",
};

export function VerdictCertificate(props: Props) {
  const addressLabel =
    props.mode === "ready"
      ? props.data.addressFull
      : props.mode === "pending"
        ? props.addressFull
        : null;

  const dialState =
    props.mode === "ready" ? props.data.signal : "neutral";
  const dialFill =
    props.mode === "ready" ? props.data.confidence : 50;
  const dialInnerLabel =
    props.mode === "ready" ? SIGNAL_LABEL[props.data.signal] : undefined;

  return (
    <div className="relative overflow-hidden rounded-[14px] bg-card shadow-card">
      {/* Left-edge terracotta stripe — the brand's visual identifier
          for verdict-class surfaces. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] bg-terracotta"
      />

      <div className="flex flex-col gap-0 p-8 pl-10 md:flex-row md:gap-8">
        <div className="flex-1 space-y-6">
          {/* Address row */}
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              Address
            </p>
            <p
              className={`mt-2 font-mono text-sm ${
                addressLabel ? "text-ink" : "text-ink/40"
              }`}
            >
              {addressLabel ?? "[ property address ]"}
            </p>
          </div>

          <div className="h-px w-full bg-hairline" />

          {/* Data points row */}
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              Data points
            </p>
            {props.mode === "ready" ? (
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {(["comps", "revenue", "regulatory", "location"] as const).map(
                  (key) => (
                    <div
                      key={key}
                      className="flex flex-col border-l border-hairline pl-3"
                    >
                      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
                        {key}
                      </dt>
                      <dd className="mt-0.5 text-[13px] leading-snug text-ink">
                        {props.data.dataPoints[key]}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            ) : (
              <p className="mt-2 font-mono text-sm text-ink/40">
                [ comps · revenue · regulatory · location ]
              </p>
            )}
          </div>

          <div className="h-px w-full bg-hairline" />

          {/* Narrative row */}
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              Narrative
            </p>
            {props.mode === "ready" ? (
              <>
                <p className="mt-2 text-base font-medium leading-snug text-ink">
                  {props.data.summary}
                </p>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink/85">
                  {props.data.narrative
                    .split(/\n{2,}/)
                    .filter((p) => p.trim())
                    .map((para, i) => (
                      <p key={i}>{para.trim()}</p>
                    ))}
                </div>
              </>
            ) : props.mode === "pending" ? (
              <PendingMicrocopy />
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-ink/40">
                [ AI-drafted thesis — why the verdict, what to watch, what moves
                the number ]
              </p>
            )}
          </div>

          {props.mode === "ready" && props.data.sources.length > 0 ? (
            <>
              <div className="h-px w-full bg-hairline" />
              <div>
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                  Sources
                </p>
                <ul className="mt-2 space-y-1">
                  {props.data.sources.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-mono text-[11px] text-ink-muted underline decoration-hairline underline-offset-2 transition-colors hover:text-terracotta hover:decoration-terracotta"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </div>

        {/* Dial — top-right on md+, above content on mobile. */}
        <div className="mt-6 flex shrink-0 items-start justify-center md:mt-1">
          <VerdictDial
            fill={dialFill}
            state={dialState}
            size={84}
            innerLabel={dialInnerLabel}
          />
        </div>
      </div>
    </div>
  );
}
