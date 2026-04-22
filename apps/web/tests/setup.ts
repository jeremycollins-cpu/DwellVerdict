import { config as loadEnv } from "dotenv";
import { randomBytes } from "node:crypto";
import path from "node:path";

// Load web app's .env.local first (CLERK_*, DATABASE_URL for Next runtime).
loadEnv({ path: path.resolve(__dirname, "../.env.local") });
// Then packages/db/.env.local as a fallback for DATABASE_URL (M2 lives there).
loadEnv({ path: path.resolve(__dirname, "../../../packages/db/.env.local") });

// Tests sign their own fixture payloads with a synthetic signing secret.
// We deliberately override whatever Clerk-issued secret the dev env has so
// the test signer and verifier match, without leaking prod secrets into
// test state.
//
// Use standard base64 (not base64url) — svix's decoder rejects the
// URL-safe `-`/`_` chars, and for 24 random bytes those show up ~36% of
// the time. 24 bytes is exactly divisible by 3 so there's no `=` padding
// to worry about.
process.env.CLERK_WEBHOOK_SIGNING_SECRET = `whsec_${randomBytes(24).toString("base64")}`;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set for integration tests. Copy packages/db/.env.local → apps/web/.env.local or export it inline.",
  );
}
