import * as Sentry from "@sentry/nextjs";

/**
 * Sentry browser bootstrap (Next 15 client instrumentation hook).
 *
 * Replay strategy per M0.3 spec:
 *   replaysSessionSampleRate: 0     no speculative session capture (saves quota)
 *   replaysOnErrorSampleRate: 1.0   capture the 30s before any error
 *
 * `enabled` is gated on production so dev console errors don't pollute
 * the dashboard. Vercel preview deploys set NODE_ENV=production, so
 * Sentry is live on previews too.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
});

// Forward router transitions so client-side navigation timings show up
// in Sentry's tracing view.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
