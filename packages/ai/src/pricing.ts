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
 * Convert token usage to a cost in cents. Returns 0 for unknown
 * models so we don't drop events entirely, but logs a warning so
 * missing pricing gets noticed.
 */
export function computeCostCents(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearchCount?: number;
}): number {
  const rate = MODEL_PRICING[params.model];
  if (!rate) {
    console.warn(`[ai pricing] unknown model ${params.model}; cost defaulted to 0`);
    return 0;
  }
  const inputCost = (params.inputTokens / 1_000_000) * rate.inputUsdPerMillion;
  const outputCost = (params.outputTokens / 1_000_000) * rate.outputUsdPerMillion;
  const webSearchCost = (params.webSearchCount ?? 0) * WEB_SEARCH_USD_PER_CALL;
  const totalUsd = inputCost + outputCost + webSearchCost;
  return Math.round(totalUsd * 100);
}
