import * as Sentry from "@sentry/nextjs";

/**
 * Deliberate-error endpoint for Sentry verification.
 *
 * REMOVE BEFORE MERGE per the M0.3 test plan:
 *
 *   1. Wait for the Vercel preview deploy of this PR.
 *   2. Hit the preview URL: curl https://<preview>/api/__sentry-test
 *      (or load it in a browser).
 *   3. Confirm the resulting Error appears in the Sentry dashboard
 *      with a readable, source-mapped stack trace.
 *   4. Delete this file in a follow-up commit, then merge the PR.
 *
 * The route is gated by NODE_ENV-via-`enabled` in
 * `instrumentation.ts`, so on local dev it just throws a 500 without
 * reporting anywhere. On Vercel preview/production NODE_ENV is
 * 'production', so the SDK is live.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  Sentry.setTag("operation", "sentry_smoke_test");
  throw new Error(
    "M0.3 Sentry smoke test — this should appear in the Sentry dashboard",
  );
}
