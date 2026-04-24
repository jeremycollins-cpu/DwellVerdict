/**
 * Minimal CSV parser + PMS-specific normalizers per ADR-7
 * Managing stage.
 *
 * No new npm dep — this handles the common PMS export formats
 * (Airbnb / Hospitable / Guesty / Hostaway) which all use
 * straightforward RFC-4180 CSV. If we hit pathological data
 * we'll swap in papaparse; for v0 this is simpler to reason
 * about.
 */

// ---- Core CSV tokenizer ----------------------------------------

/**
 * Parse CSV text into rows of fields. Handles:
 *   - Comma separator
 *   - Double-quote wrapping
 *   - "" escape within a quoted field
 *   - CRLF and LF line endings
 *   - Blank trailing lines
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    // Not in quotes
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      // swallow — the \n after it will end the row
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      field = "";
      // Skip entirely empty trailing rows.
      if (!(row.length === 1 && row[0] === "")) rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Flush the last field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
  }
  return rows;
}

/**
 * Parse CSV into objects keyed by (normalized) header. Header
 * normalization: lowercase, spaces→underscore, strip non-word.
 */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0]!.map(normalizeHeader);
  return rows.slice(1).map((row) => {
    const rec: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      rec[headers[i]!] = (row[i] ?? "").trim();
    }
    return rec;
  });
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---- Normalized reservation shape -------------------------------

export type NormalizedReservation = {
  externalId: string | null;
  guestName: string | null;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  grossRevenueCents: number;
  cleaningFeeCents: number;
  serviceFeeCents: number;
  taxesCents: number;
  netCents: number;
  status: "confirmed" | "canceled" | "blocked" | "completed";
  notes: string | null;
};

export type NormalizeResult =
  | { ok: true; reservations: NormalizedReservation[]; skipped: number }
  | { ok: false; error: string };

// ---- Airbnb Reservations CSV normalizer --------------------------

/**
 * Airbnb exports two CSV shapes: "Earnings" (one row per payout
 * transaction) and "Reservations" (one row per booking). This
 * normalizer targets the **Reservations** export — the sane
 * one-row-per-booking shape — downloadable from hosting.airbnb.com.
 *
 * Column names vary slightly over time. We look up each field by
 * a list of plausible header aliases (case-insensitive after
 * normalizeHeader).
 */
export function normalizeAirbnbCsv(text: string): NormalizeResult {
  try {
    const records = parseCsvRecords(text);
    if (records.length === 0) {
      return { ok: false, error: "CSV has no data rows" };
    }

    const reservations: NormalizedReservation[] = [];
    let skipped = 0;

    for (const r of records) {
      const externalId = pick(r, [
        "confirmation_code",
        "reservation_code",
        "confirmation_id",
      ]);
      const guestName = pick(r, ["guest_name", "guest"]);
      const checkInRaw = pick(r, ["start_date", "check_in", "begin_date"]);
      const checkOutRaw = pick(r, ["end_date", "check_out", "end"]);
      const nightsStr = pick(r, ["nights", "of_nights", "number_of_nights"]);
      const earningsStr = pick(r, ["earnings", "total_earnings", "net_earnings"]);
      const amountStr = pick(r, ["amount", "total", "booking_amount"]);
      const cleaningStr = pick(r, ["cleaning_fee", "cleaning"]);
      const hostFeeStr = pick(r, ["host_fee", "service_fee", "airbnb_fee"]);
      const taxStr = pick(r, ["occupancy_taxes", "taxes", "tax"]);
      const statusStr = pick(r, ["status", "listing_status"]);

      if (!checkInRaw || !checkOutRaw) {
        skipped += 1;
        continue;
      }
      const checkIn = parseDate(checkInRaw);
      const checkOut = parseDate(checkOutRaw);
      if (!checkIn || !checkOut || checkOut <= checkIn) {
        skipped += 1;
        continue;
      }
      const nights =
        parseInt(nightsStr, 10) ||
        Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
      if (!Number.isFinite(nights) || nights < 1) {
        skipped += 1;
        continue;
      }

      const netCents = parseMoneyCents(earningsStr);
      const cleaningFeeCents = parseMoneyCents(cleaningStr);
      const serviceFeeCents = parseMoneyCents(hostFeeStr);
      const taxesCents = parseMoneyCents(taxStr);
      // "Amount" on Airbnb usually means the guest total; if it's
      // not present, back into gross from net + fees + taxes.
      const grossFromAmount = parseMoneyCents(amountStr);
      const grossRevenueCents =
        grossFromAmount > 0
          ? grossFromAmount
          : netCents + serviceFeeCents + cleaningFeeCents + taxesCents;

      reservations.push({
        externalId: externalId || null,
        guestName: guestName || null,
        checkIn,
        checkOut,
        nights,
        grossRevenueCents,
        cleaningFeeCents,
        serviceFeeCents,
        taxesCents,
        netCents,
        status: normalizeStatus(statusStr),
        notes: null,
      });
    }

    return { ok: true, reservations, skipped };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---- Helpers ----------------------------------------------------

function pick(rec: Record<string, string>, aliases: string[]): string {
  for (const a of aliases) {
    if (rec[a] != null && rec[a] !== "") return rec[a]!;
  }
  return "";
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  // Try ISO first. Fall back to Date.parse which handles MM/DD/YYYY,
  // "Jan 15, 2026", etc. If it still fails, give up.
  const trimmed = raw.trim();
  const t = Date.parse(trimmed);
  if (!Number.isNaN(t)) return new Date(t);
  return null;
}

function parseMoneyCents(raw: string): number {
  if (!raw) return 0;
  // Strip $, commas, currency codes. Negative values (refunds,
  // cancellations) map to 0 — we surface cancels via the status
  // column rather than by negative revenue.
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function normalizeStatus(
  raw: string,
): "confirmed" | "canceled" | "blocked" | "completed" {
  const lower = raw.toLowerCase().trim();
  if (lower.includes("cancel")) return "canceled";
  if (lower.includes("block")) return "blocked";
  if (lower.includes("past") || lower.includes("complete")) return "completed";
  return "confirmed";
}
