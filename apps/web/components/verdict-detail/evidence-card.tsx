import {
  BarChart3,
  Grid3X3,
  MapPin,
  Shield,
  type LucideIcon,
} from "lucide-react";

/**
 * Backward-compatible domain evidence renderer.
 *
 * Pre-M3.3 verdicts wrote `data_points.<domain>` as a single
 * sentence string. M3.3+ writes a structured object with
 * `summary`, optional `metrics`, and optional `citations`. This
 * component handles both shapes via a runtime type guard so the
 * detail page works for any verdict in the database.
 */

export type EvidenceDomain = "comps" | "revenue" | "regulatory" | "location";

export interface DomainSpec {
  key: EvidenceDomain;
  title: string;
  Icon: LucideIcon;
}

export const EVIDENCE_DOMAINS: ReadonlyArray<DomainSpec> = [
  { key: "regulatory", title: "Regulatory", Icon: Shield },
  { key: "location", title: "Location", Icon: MapPin },
  { key: "comps", title: "Comparable Properties", Icon: Grid3X3 },
  { key: "revenue", title: "Revenue Projection", Icon: BarChart3 },
];

interface StructuredEvidence {
  summary: string;
  metrics?: Record<string, unknown>;
  citations?: Array<{ url: string; label: string }>;
}

type RawEvidence = string | StructuredEvidence | null | undefined;

function isStructured(v: RawEvidence): v is StructuredEvidence {
  return typeof v === "object" && v !== null && "summary" in v;
}

interface EvidenceCardProps {
  domain: DomainSpec;
  evidence: RawEvidence;
}

export function EvidenceCard({ domain, evidence }: EvidenceCardProps) {
  const Icon = domain.Icon;
  const summary = isStructured(evidence)
    ? evidence.summary
    : typeof evidence === "string"
      ? evidence
      : null;
  const metrics =
    isStructured(evidence) && evidence.metrics
      ? formatMetrics(domain.key, evidence.metrics)
      : null;
  const citations = isStructured(evidence) ? evidence.citations ?? [] : [];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-hairline bg-card-ink p-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-paper-warm text-ink-70">
          <Icon className="size-4" />
        </span>
        <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted">
          {domain.title}
        </h3>
      </div>

      {metrics && metrics.length > 0 ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {metrics.map((m) => (
            <div key={m.label} className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                {m.label}
              </span>
              <span className="text-[18px] font-medium tracking-[-0.01em] text-ink">
                {m.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {summary ? (
        <p className="text-[14px] leading-[1.55] text-ink-70">{summary}</p>
      ) : (
        <p className="text-[13px] italic leading-[1.55] text-ink-muted">
          No evidence available for this domain.
        </p>
      )}

      {citations.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-hairline pt-3">
          {citations.map((c, i) => (
            <CitationChip key={`${c.url}-${i}`} url={c.url} label={c.label} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Citation chip — clickable terracotta link for real URLs, soft
 * "From your intake" pill for the M3.10 citation sentinels
 * (`user-provided` / `intake-data`). The model emits these
 * sentinels when the cited source is the user's own intake form
 * answers (per v3 prompt's citations guidance), where there's no
 * URL to point at.
 */
function CitationChip({ url, label }: { url: string; label: string }) {
  const isSentinel = url === "user-provided" || url === "intake-data";
  if (isSentinel) {
    return (
      <span
        title={`Source: ${label} (from your intake)`}
        className="inline-flex items-center rounded-[10px] border border-hairline-strong bg-card-ink px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted"
      >
        {label} · From your intake
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center rounded-[10px] border border-terracotta-border bg-terracotta-soft px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-terracotta transition-colors hover:bg-terracotta hover:text-white"
    >
      {label}
    </a>
  );
}

interface MetricRow {
  label: string;
  value: string;
}

function formatMetrics(
  domain: EvidenceDomain,
  metrics: Record<string, unknown>,
): MetricRow[] {
  const rows: MetricRow[] = [];
  const get = <T,>(k: string): T | undefined => metrics[k] as T | undefined;

  if (domain === "comps") {
    const count = get<number>("count");
    if (typeof count === "number") rows.push({ label: "Comps", value: String(count) });
    const adr = get<number>("median_adr");
    if (typeof adr === "number")
      rows.push({ label: "Median ADR", value: `$${Math.round(adr)}` });
    const occ = get<number>("occupancy");
    if (typeof occ === "number")
      rows.push({ label: "Occupancy", value: `${Math.round(occ * 100)}%` });
  }

  if (domain === "revenue") {
    const annual = get<number>("annual_estimate");
    if (typeof annual === "number")
      rows.push({
        label: "Annual",
        value:
          annual >= 1000
            ? `$${(annual / 1000).toFixed(annual % 1000 === 0 ? 0 : 1)}K`
            : `$${annual}`,
      });
    const cap = get<number>("cap_rate");
    if (typeof cap === "number")
      rows.push({ label: "Cap rate", value: `${(cap * 100).toFixed(1)}%` });
    const seas = get<string>("seasonality");
    if (typeof seas === "string")
      rows.push({ label: "Seasonality", value: capitalize(seas) });
  }

  if (domain === "regulatory") {
    const str = get<string>("str_status");
    if (typeof str === "string")
      rows.push({ label: "STR status", value: capitalize(str) });
    const hoa = get<string>("hoa_status");
    if (typeof hoa === "string")
      rows.push({ label: "HOA", value: hoaLabel(hoa) });
    const reg = get<boolean>("registration_required");
    if (typeof reg === "boolean")
      rows.push({ label: "Permit", value: reg ? "Required" : "None" });
  }

  if (domain === "location") {
    const walk = get<number>("walk_score");
    if (typeof walk === "number")
      rows.push({ label: "Walk score", value: String(walk) });
    const flood = get<string>("flood_zone");
    if (typeof flood === "string")
      rows.push({ label: "Flood zone", value: flood });
    const crime = get<string>("crime_rate_rank");
    if (typeof crime === "string")
      rows.push({ label: "Crime rank", value: capitalize(crime) });
    const rating = get<number>("nearby_rating");
    if (typeof rating === "number")
      rows.push({ label: "Nearby rating", value: `${rating.toFixed(2)} ★` });
    // M3.10 — school median ratings. Whether these appear in
    // `metrics` is decided upstream by the v3 prompt's thesis-aware
    // emit rules (LTR / Owner-occupied / House-hacking / Flipping
    // emit; STR omits). The card just renders whatever the model
    // included.
    const elem = get<number>("elementary_school_rating_median");
    if (typeof elem === "number")
      rows.push({ label: "Elementary", value: `${elem.toFixed(1)}/10` });
    const middle = get<number>("middle_school_rating_median");
    if (typeof middle === "number")
      rows.push({ label: "Middle", value: `${middle.toFixed(1)}/10` });
    const high = get<number>("high_school_rating_median");
    if (typeof high === "number")
      rows.push({ label: "High", value: `${high.toFixed(1)}/10` });
    const notable = get<unknown>("notable_schools");
    if (Array.isArray(notable) && notable.length > 0) {
      const names = notable.filter((n): n is string => typeof n === "string");
      if (names.length > 0) {
        rows.push({ label: "Notable schools", value: names.join(", ") });
      }
    }
  }

  return rows;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function hoaLabel(value: string): string {
  switch (value) {
    case "no_hoa":
      return "None";
    case "hoa_neutral":
      return "Neutral";
    case "hoa_restrictive":
      return "Restrictive";
    case "unverified":
      return "Unverified";
    default:
      return value;
  }
}
