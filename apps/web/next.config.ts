import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Monorepo lives above apps/web. Pin the trace root so Next doesn't guess
  // based on stray lockfiles in parent directories.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
