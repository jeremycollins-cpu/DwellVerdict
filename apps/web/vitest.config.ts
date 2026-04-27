import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Test runtime isn't a React Server Component runtime, so the
      // `server-only` marker package would otherwise throw when any
      // module under test imports it. Map to its bundled empty stub
      // (the same file Next's RSC bundler picks via the `react-server`
      // export condition) so server-side queries can be unit-tested.
      "server-only": path.resolve(
        __dirname,
        "../../node_modules/.pnpm/server-only@0.0.1/node_modules/server-only/empty.js",
      ),
    },
  },
});
