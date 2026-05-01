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
  // M3.11 + M3.12 — variance flags rendered as colored chips above
  // the metrics row for the comps card. Two distinct flags can fire
  // for the same verdict: rental-comp variance (rent/ADR vs market
  // median, M3.11) and offer-price variance (user offer vs comp
  // median sale price, M3.12). Both surface side-by-side when the
  // model emits them; aligned bands stay hidden.
  const rentalVarianceFlag =
    domain.key === "comps" && isStructured(evidence) && evidence.metrics
      ? (evidence.metrics["intake_variance_flag"] as string | undefined)
      : undefined;
  const rentalVarianceRatio =
    domain.key === "comps" && isStructured(evidence) && evidence.metrics
      ? (evidence.metrics["intake_variance_ratio"] as number | undefined)
      : undefined;
  const offerVarianceFlag =
    domain.key === "comps" && isStructured(evidence) && evidence.metrics
      ? (evidence.metrics["offer_price_variance_flag"] as string | undefined)
      : undefined;
  const offerVarianceRatio =
    domain.key === "comps" && isStructured(evidence) && evidence.metrics
      ? (evidence.metrics["offer_price_variance_ratio"] as number | undefined)
      : undefined;

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

      {rentalVarianceFlag && rentalVarianceFlag !== "aligned" ? (
        <VarianceChip
          flag={rentalVarianceFlag}
          ratio={rentalVarianceRatio}
          kind="rental"
        />
      ) : null}
      {offerVarianceFlag && offerVarianceFlag !== "aligned" ? (
        <VarianceChip
          flag={offerVarianceFlag}
          ratio={offerVarianceRatio}
          kind="offer"
        />
      ) : null}

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
 * M3.11 — Intake-vs-market variance chip rendered above the comps
 * card metrics. The verdict orchestrator computed the flag by
 * comparing the user's intake (LTR monthly rent or STR ADR /
 * occupancy) to the LLM-cached market median; the prompt told the
 * narrative model to pass the flag through verbatim.
 *
 * Visual hierarchy by severity:
 *   - significantly_low / significantly_high: prominent yellow/amber
 *     warning urging the user to re-verify
 *   - low / high: subtle muted-warning chip
 *   - aligned: chip is hidden by the parent (we never render it)
 */
function VarianceChip({
  flag,
  ratio,
  kind,
}: {
  flag: string;
  ratio: number | undefined;
  /** M3.12 — `rental` is the M3.11 rent/ADR variance vs market
   *  median; `offer` is the new sales-side variance (user offer
   *  vs comp median sale price). Phrasing differs to match the
   *  decision the user is being asked to verify. */
  kind: "rental" | "offer";
}) {
  const isSignificant =
    flag === "significantly_low" || flag === "significantly_high";
  const isLow = flag === "low" || flag === "significantly_low";
  const pct = typeof ratio === "number" ? Math.round(ratio * 100) : null;
  const direction = isLow ? "below" : "above";
  const detailFragment = pct != null ? `${pct}% of market median` : null;

  let labelChip: string;
  let message: string;
  if (kind === "rental") {
    labelChip = isSignificant ? "Verify intake" : "Market check";
    message = isSignificant
      ? `User intake is significantly ${direction} market${pct != null ? ` (${pct}%)` : ""} — re-verify before underwriting.`
      : `User intake is ${direction} market${detailFragment ? ` (${detailFragment})` : ""}.`;
  } else {
    // offer
    labelChip = isSignificant
      ? isLow
        ? "Acquisition price"
        : "Verify offer"
      : "Offer check";
    if (isSignificant) {
      message = isLow
        ? `Offer is significantly below comp median${pct != null ? ` (${pct}%)` : ""} — possible acquisition opportunity; verify property condition isn't the reason.`
        : `Offer is significantly above comp median${pct != null ? ` (${pct}%)` : ""} — verify the premium is justified before underwriting.`;
    } else {
      message = `Offer is ${direction} comp median${detailFragment ? ` (${detailFragment})` : ""}.`;
    }
  }

  // Acquisition-price (significantly_low offer) is good news, render
  // as terracotta-tinted rather than amber-warning.
  const isAcquisitionWin =
    kind === "offer" && flag === "significantly_low";
  const containerClass = isAcquisitionWin
    ? "rounded-lg border border-terracotta-border bg-terracotta-soft px-3 py-2 text-[12px] font-medium leading-[1.45] text-terracotta"
    : isSignificant
      ? "rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-[12px] font-medium leading-[1.45] text-amber-900"
      : "rounded-lg border border-hairline-strong bg-paper-warm px-3 py-2 text-[12px] leading-[1.45] text-ink-70";

  return (
    <div role="note" className={containerClass}>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
        {labelChip}
      </span>
      <span className="ml-2">{message}</span>
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

    // M3.11 — LTR rental comp metrics (cents). Render alongside
    // legacy STR metrics; the v3 prompt is thesis-routed so only
    // one set is populated per verdict.
    const ltrMedian = get<number>("median_monthly_rent_cents");
    if (typeof ltrMedian === "number")
      rows.push({ label: "Median rent", value: `${formatCents(ltrMedian)}/mo` });
    const ltrLow = get<number>("rent_range_low_cents");
    const ltrHigh = get<number>("rent_range_high_cents");
    if (typeof ltrLow === "number" && typeof ltrHigh === "number")
      rows.push({
        label: "Rent range",
        value: `${formatCents(ltrLow)}–${formatCents(ltrHigh)}`,
      });

    // M3.11 — STR rental comp metrics (cents). New format takes
    // precedence over the legacy median_adr float when both are
    // present.
    const strAdr = get<number>("median_adr_cents");
    if (typeof strAdr === "number") {
      rows.push({ label: "Median ADR", value: `${formatCents(strAdr)}/night` });
    } else {
      const adrLegacy = get<number>("median_adr");
      if (typeof adrLegacy === "number")
        rows.push({ label: "Median ADR", value: `$${Math.round(adrLegacy)}` });
    }
    const adrLow = get<number>("adr_range_low_cents");
    const adrHigh = get<number>("adr_range_high_cents");
    if (typeof adrLow === "number" && typeof adrHigh === "number")
      rows.push({
        label: "ADR range",
        value: `${formatCents(adrLow)}–${formatCents(adrHigh)}`,
      });

    const medianOcc = get<number>("median_occupancy");
    if (typeof medianOcc === "number") {
      rows.push({ label: "Occupancy", value: `${Math.round(medianOcc * 100)}%` });
    } else {
      const occLegacy = get<number>("occupancy");
      if (typeof occLegacy === "number")
        rows.push({
          label: "Occupancy",
          value: `${Math.round(occLegacy * 100)}%`,
        });
    }

    const seas = get<string>("seasonality");
    if (typeof seas === "string")
      rows.push({ label: "Seasonality", value: capitalize(seas) });

    // M3.12 — sales comp + ARV metrics. Surface for OO / LTR-with-
    // appreciation / HH / Flipping verdicts; STR verdicts skip the
    // sales-comps fetcher entirely so these stay absent.
    const salesMedian = get<number>("median_comp_price_cents");
    if (typeof salesMedian === "number")
      rows.push({
        label: "Median comp",
        value: formatCents(salesMedian),
      });
    const salesLow = get<number>("comp_price_range_low_cents");
    const salesHigh = get<number>("comp_price_range_high_cents");
    if (typeof salesLow === "number" && typeof salesHigh === "number")
      rows.push({
        label: "Comp range",
        value: `${formatCents(salesLow)}–${formatCents(salesHigh)}`,
      });
    const arv = get<number>("estimated_arv_cents");
    const arvConfidence = get<string>("arv_confidence");
    if (typeof arv === "number") {
      const confidenceSuffix =
        typeof arvConfidence === "string"
          ? ` (${arvConfidence} confidence)`
          : "";
      rows.push({
        label: "ARV estimate",
        value: `${formatCents(arv)}${confidenceSuffix}`,
      });
    }
    const dom = get<number>("median_days_on_market");
    if (typeof dom === "number")
      rows.push({ label: "Median DOM", value: `${dom}d` });
    const velocity = get<string>("market_velocity");
    if (typeof velocity === "string")
      rows.push({ label: "Market velocity", value: capitalize(velocity) });
    const trend = get<string>("market_trend");
    if (typeof trend === "string")
      rows.push({ label: "Market trend", value: capitalize(trend) });
    const flipMargin = get<number>("flip_margin_percent");
    if (typeof flipMargin === "number")
      rows.push({
        label: "Flip margin",
        value: `${(flipMargin * 100).toFixed(1)}%`,
      });
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

/**
 * M3.11 — render a cents value as $X,XXX with no decimals. Falls
 * back to "$0" for non-finite inputs so the cell renders something
 * rather than "NaN" if the LLM ever emits an unexpected value.
 */
function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) return "$0";
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
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
