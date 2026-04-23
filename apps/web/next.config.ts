import path from "node:path";
import type { NextConfig } from "next";

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

export default nextConfig;
