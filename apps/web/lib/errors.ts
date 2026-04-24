import "server-only";

/**
 * Best-effort extraction of a useful message from a thrown error.
 *
 * Drizzle + neon-http both wrap the underlying PG error with generic
 * prefixes ("Failed query: …") that bury the actual cause — the
 * `relation does not exist`, `invalid input syntax`, etc. message
 * that would let you fix the bug in 30 seconds.
 *
 * This walks the `.cause` chain, prefers the most specific message
 * available, and tacks on any PG error code / table / column fields
 * we can scrape off the object. Returns a compact one-line summary
 * suitable for logs + the client-side error surface.
 *
 * Examples:
 *   relation_not_found: relation "place_sentiment_cache" does not exist
 *   unique_violation: duplicate key value violates unique constraint "x"
 *   stripe/resource_missing: No such price: 'price_abc'
 */
export function describeError(err: unknown): {
  message: string;
  code: string | null;
} {
  if (err == null) return { message: "unknown error", code: null };
  if (typeof err !== "object") return { message: String(err), code: null };

  // Walk the cause chain, keeping the deepest one with a usable
  // message. Cap depth to avoid pathological cycles.
  let current: unknown = err;
  let deepest: Record<string, unknown> = err as Record<string, unknown>;
  for (let i = 0; i < 8 && current && typeof current === "object"; i++) {
    const rec = current as Record<string, unknown>;
    if (typeof rec.message === "string" && rec.message.length > 0) {
      deepest = rec;
    }
    if (!("cause" in rec)) break;
    current = rec.cause;
  }

  const rawMessage =
    (typeof deepest.message === "string" && deepest.message) ||
    (err instanceof Error ? err.message : String(err));

  const code = pickString(deepest, ["code"]);
  const table = pickString(deepest, ["table", "table_name"]);
  const column = pickString(deepest, ["column", "column_name"]);
  const constraint = pickString(deepest, ["constraint", "constraint_name"]);
  const detail = pickString(deepest, ["detail"]);

  // Strip drizzle's "Failed query: ..." wrapper if the deepest message
  // is that shape AND the top-level err has a useful code. Drizzle
  // emits this with the SQL + params inline, which is noise.
  const stripped = rawMessage.startsWith("Failed query:")
    ? rawMessage.replace(/Failed query:.*$/s, "").trim() || rawMessage
    : rawMessage;

  const parts: string[] = [];
  if (code) parts.push(code);
  if (table) parts.push(`table=${table}`);
  if (column) parts.push(`column=${column}`);
  if (constraint) parts.push(`constraint=${constraint}`);
  const prefix = parts.length > 0 ? `${parts.join(" ")}: ` : "";

  const message = `${prefix}${stripped}${detail ? ` — ${detail}` : ""}`.slice(
    0,
    1000,
  );

  return { message, code };
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}
