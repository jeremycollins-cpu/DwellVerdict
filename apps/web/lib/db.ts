import { createDb, type Db } from "@dwellverdict/db";
import { setUsageLoggerDb } from "@dwellverdict/ai";

/**
 * Process-wide singleton pinned to `globalThis` so Next.js dev-mode hot
 * reloads don't leak WebSocket pools each time a route file is edited. In
 * production there's no hot-reload, so this behaves identically to a plain
 * module-scoped variable — one Pool per Node worker for its full lifetime.
 */
const globalForDb = globalThis as unknown as { _dwellverdictDb?: Db };

export function getDb(): Db {
  if (globalForDb._dwellverdictDb) return globalForDb._dwellverdictDb;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  globalForDb._dwellverdictDb = createDb(url);
  // Wire the AI package's usage-event logger to this same Drizzle
  // client. Decouples packages/ai from any concrete connection
  // pattern while ensuring every AI call lands in
  // ai_usage_events. Safe to call repeatedly — setUsageLoggerDb
  // just overwrites the module-scoped pointer.
  setUsageLoggerDb(globalForDb._dwellverdictDb);
  return globalForDb._dwellverdictDb;
}
