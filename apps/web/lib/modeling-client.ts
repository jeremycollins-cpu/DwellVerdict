/**
 * Typed client for the DwellVerdict modeling service.
 *
 * Used from Next.js server components and server actions to call our
 * FastAPI service on Fly.io. Reads MODELING_SERVICE_URL from env; falls
 * back to localhost:8080 for local dev when the env var is unset.
 *
 * Graceful-degradation contract: on network failure, timeout, or non-2xx
 * response, we return a typed result indicating unavailability rather
 * than throwing. This lets the debug footer on /app/properties render
 * "Modeling: unavailable" without crashing the page.
 */

/** Health endpoint response shape — mirrors FastAPI's HealthResponse. */
export type HealthResult = {
  ok: boolean;
  version: string;
};

const DEFAULT_BASE_URL = "http://localhost:8080";
const HEALTH_TIMEOUT_MS = 5_000;

/** Strip a trailing slash so we can join paths with a leading slash cleanly. */
function baseUrl(): string {
  const raw = process.env.MODELING_SERVICE_URL ?? DEFAULT_BASE_URL;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

/**
 * Narrow an unknown JSON payload to HealthResult shape.
 *
 * We don't use Zod here — a 2-field response doesn't justify the
 * dependency or the schema-declaration overhead. When we add richer
 * endpoints (forecast, comps), we'll move the whole client to Zod for
 * all of them at once.
 */
function isHealthResult(payload: unknown): payload is HealthResult {
  if (typeof payload !== "object" || payload === null) return false;
  const record = payload as Record<string, unknown>;
  return typeof record.ok === "boolean" && typeof record.version === "string";
}

/**
 * Hit the modeling service's /health endpoint.
 *
 * Returns { ok: false, version: "unreachable" } on:
 *   - network / DNS / TLS errors
 *   - timeout (5s — AbortSignal.timeout is native in Node >= 20)
 *   - non-2xx responses
 *   - malformed JSON responses
 *
 * Never throws. Callers can render the result directly without a
 * try/catch and know the page won't crash if Fly is cold-starting or
 * the modeling service is down.
 */
export async function checkHealth(): Promise<HealthResult> {
  try {
    const response = await fetch(`${baseUrl()}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      // Opt out of Next.js's fetch cache — we want real-time health
      // status, not a cached result from a prior render.
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, version: "unreachable" };
    }

    const payload: unknown = await response.json();
    if (!isHealthResult(payload)) {
      return { ok: false, version: "unreachable" };
    }

    return payload;
  } catch {
    return { ok: false, version: "unreachable" };
  }
}
