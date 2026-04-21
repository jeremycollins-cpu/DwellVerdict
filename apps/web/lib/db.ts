import { createDb, type Db } from "@dwellverdict/db";

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
  return globalForDb._dwellverdictDb;
}
