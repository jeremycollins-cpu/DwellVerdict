/**
 * Per-model token pricing used for cost attribution on every AI call.
 *
 * Values are USD per million tokens, from the Anthropic pricing sheet
 * as of the date in the comment next to each entry. When the pricing
 * page updates we update these manually — CLAUDE.md requires every AI
 * call to record cost_cents, and under-reporting a rate quietly would
 * miscount by 2-3× on long runs.
 */
export type ModelPricing = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // 2026-04 — from claude-api skill's "Current Models" table.
  "claude-opus-4-7": { inputUsdPerMillion: 5, outputUsdPerMillion: 25 },
  "claude-opus-4-6": { inputUsdPerMillion: 5, outputUsdPerMillion: 25 },
  "claude-sonnet-4-6": { inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
  "claude-haiku-4-5": { inputUsdPerMillion: 1, outputUsdPerMillion: 5 },
};

/**
 * Flat per-search fee Anthropic bills for server-side web_search
 * calls. Charged on top of token costs.
 */
export const WEB_SEARCH_USD_PER_CALL = 0.01;

/**
 * Cache-read tokens are billed at 10% of base input rate.
 * Cache-creation tokens are billed at 125% of base input rate
 * (5-minute TTL — the only TTL we use today). Both rates from the
 * Anthropic prompt-caching pricing page.
 */
export const CACHE_READ_DISCOUNT = 0.1;
export const CACHE_WRITE_MULTIPLIER = 1.25;

/**
 * Convert token usage to a cost in cents.
 *
 * Anthropic's API returns four token counts on a Message response:
 *   - input_tokens         : uncached input (already excludes cache reads)
 *   - cache_read_input_tokens     : tokens served from the prompt cache
 *   - cache_creation_input_tokens : tokens written to the cache
 *   - output_tokens        : completion output
 *
 * input_tokens is *NOT* a superset of cache_read_input_tokens — the
 * three input fields are disjoint. Earlier versions of this file
 * only summed input_tokens × baseRate, which silently undercounted
 * cache writes (charged below their 125% rate) and miscategorised
 * cache reads. Now each pool is priced explicitly.
 *
 * Returns 0 for unknown models (with a console.warn) so we don't
 * drop events entirely.
 */
export function computeCostCents(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  webSearchCount?: number;
}): number {
  const rate = MODEL_PRICING[params.model];
  if (!rate) {
    console.warn(`[ai pricing] unknown model ${params.model}; cost defaulted to 0`);
    return 0;
  }
  const cacheRead = params.cacheReadInputTokens ?? 0;
  const cacheWrite = params.cacheCreationInputTokens ?? 0;

  const baseInputUsd = (params.inputTokens / 1_000_000) * rate.inputUsdPerMillion;
  const cacheReadUsd =
    (cacheRead / 1_000_000) * rate.inputUsdPerMillion * CACHE_READ_DISCOUNT;
  const cacheWriteUsd =
    (cacheWrite / 1_000_000) * rate.inputUsdPerMillion * CACHE_WRITE_MULTIPLIER;
  const outputUsd = (params.outputTokens / 1_000_000) * rate.outputUsdPerMillion;
  const webSearchUsd = (params.webSearchCount ?? 0) * WEB_SEARCH_USD_PER_CALL;

  const totalUsd =
    baseInputUsd + cacheReadUsd + cacheWriteUsd + outputUsd + webSearchUsd;
  return Math.round(totalUsd * 100);
}
