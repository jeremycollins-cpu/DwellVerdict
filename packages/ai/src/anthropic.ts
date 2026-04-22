import Anthropic from "@anthropic-ai/sdk";

/**
 * Lazy-initialised, module-scoped Anthropic client. We avoid creating
 * it at module load so environments without ANTHROPIC_API_KEY (e.g.
 * unit tests using the mock task runner) don't fail to import.
 */
let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Provision it in Vercel (web) or as an env var for local dev.",
    );
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

/**
 * Explicit setter for tests — inject a mock client without going
 * through the real API. Call reset() between tests.
 */
export function __setAnthropicClientForTesting(client: Anthropic): void {
  cached = client;
}

export function __resetAnthropicClientForTesting(): void {
  cached = null;
}
