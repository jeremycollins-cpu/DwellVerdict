import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

/**
 * Use Node's built-in WebSocket (Node >= 22) so we don't need the `ws`
 * polyfill shipped by @neondatabase/serverless. Safe because our runtime is
 * pinned to Node 20+ via `.nvmrc` and Vercel; Node 20.11 already has the
 * required WebSocket global in Node-level API.
 *
 * If we ever run this on an older Node, flip this to import 'ws' and set
 * `neonConfig.webSocketConstructor = ws` instead.
 */
if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

/**
 * Create a typed Drizzle client for DwellVerdict's Postgres schema.
 *
 * Uses @neondatabase/serverless's WebSocket Pool so callers get real
 * interactive transactions (read-then-write within a single tx) — the HTTP
 * driver batches statements and does not support cross-statement reads.
 * Migrations keep using the HTTP driver in scripts/migrate.ts.
 */
export function createDb(url: string) {
  const pool = new Pool({ connectionString: url });
  return drizzle(pool, { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof createDb>;
