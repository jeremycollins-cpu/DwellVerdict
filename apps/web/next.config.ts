import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Monorepo lives above apps/web. Pin the trace root so Next doesn't guess
  // based on stray lockfiles in parent directories.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Scout's verdict task reads prompt markdown from `/prompts/` at
  // runtime via readFileSync (see packages/ai/src/tasks/verdict-
  // generation.ts). File tracing can't see those reads since the
  // path is computed, so we explicitly include the directory for any
  // route that ends up invoking the AI package.
  outputFileTracingIncludes: {
    "/api/verdicts/**": ["../../prompts/**/*.md"],
  },
};

// `withSentryConfig` wraps the Next config to upload source maps on
// every Vercel build (uses SENTRY_AUTH_TOKEN from the Vercel env).
// `org` and `project` are public identifiers, intentionally inlined
// here rather than env-var'd — they don't change per environment and
// code is the right place for them per M0.3 spec.
export default withSentryConfig(nextConfig, {
  org: "dwellverdict",
  project: "javascript-nextjs",
  // Quiet during local builds; verbose in CI logs for source-map upload
  // diagnostics.
  silent: !process.env.CI,
  // Bundle dynamic imports + middleware sourcemaps so client-side errors
  // hit readable stack traces.
  widenClientFileUpload: true,
  webpack: {
    treeshake: {
      // Strip Sentry's own debug logger from the production bundle.
      removeDebugLogging: true,
    },
    // Off by default — we don't use Vercel Cron yet, no monitor entries
    // to auto-create.
    automaticVercelMonitors: false,
  },
});
