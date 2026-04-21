import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config.
 *
 * Schema lives in src/schema/*.ts. Generated migrations land in
 * ./migrations. DATABASE_URL is read from the environment at
 * migrate/push time (not required for `generate`).
 */
export default defineConfig({
  schema: "./src/schema/*.ts",
  out: "./migrations",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
