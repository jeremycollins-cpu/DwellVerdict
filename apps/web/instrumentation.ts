import * as Sentry from "@sentry/nextjs";

/**
 * Sentry server + edge bootstrap. Runs once per worker boot.
 *
 * This file replaces the legacy `sentry.server.config.ts` /
 * `sentry.edge.config.ts` pattern (the `@sentry/nextjs` wizard's older
 * three-file output). Per M0.3 spec: the end state has no
 * `sentry.{client,server,edge}.config.ts` files.
 *
 * `enabled: process.env.NODE_ENV === 'production'` keeps dev errors out
 * of the dashboard. Vercel sets NODE_ENV=production on both preview and
 * production deploys, so the SDK is live in both — that's intentional
 * (we want preview-deploy regressions visible).
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === "edge"
  ) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      enabled: process.env.NODE_ENV === "production",
      tracesSampleRate: 0.1,
    });
  }
}

// Forward Next.js's onRequestError hook so framework-level errors
// (route handlers throwing, server-component render failures) make it
// to Sentry with proper request context attached.
export const onRequestError = Sentry.captureRequestError;
