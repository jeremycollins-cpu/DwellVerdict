/**
 * Fair-housing lint for place-sentiment output. Runs offline as
 * a defense-in-depth layer — the primary enforcement is the prompt
 * (prompts/place-sentiment.v1.md allow/deny lists), but if a bad
 * phrase ever makes it through (e.g., the LLM echoed a review
 * verbatim that included "family-friendly"), this guard catches
 * it before the value hits the DB.
 *
 * Test coverage in packages/ai/tests/place-sentiment-fair-housing.test.ts
 * is deploy-blocking per CLAUDE.md.
 *
 * The list is intentionally conservative — a false positive just
 * means we drop a bullet and ask for a rewrite. A false negative
 * is a potential FHA disparate-impact claim. Err on the side of
 * over-flagging.
 */

export const FAIR_HOUSING_DENIED_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  reason: string;
}> = [
  { pattern: /\bfamil(y|ies)[- ]friend/i, reason: "familial status (FHA protected)" },
  { pattern: /\bkid[- ]friend/i, reason: "familial status proxy" },
  { pattern: /\bgreat for (kids|families|children)/i, reason: "familial status proxy" },
  { pattern: /\bgreat schools\b/i, reason: "schools as quality — redlining proxy" },
  { pattern: /\bgood schools\b/i, reason: "schools as quality — redlining proxy" },
  { pattern: /\btop[- ]rated schools/i, reason: "schools as quality — redlining proxy" },
  { pattern: /\bsafe neighborhood/i, reason: "subjective safety claim — race proxy" },
  { pattern: /\bsafer than\b/i, reason: "subjective safety comparison" },
  {
    pattern: /\b(sketchy|dangerous) (area|neighborhood|part)/i,
    reason: "subjective negative resident claim",
  },
  { pattern: /\bup[- ]and[- ]coming\b/i, reason: "gentrification / racial proxy language" },
  { pattern: /\bgentrif(y|ying|ied|ication)/i, reason: "racial proxy language" },
  { pattern: /\byoung professional/i, reason: "age / class proxy" },
  { pattern: /\bretirees?\b/i, reason: "age proxy" },
  { pattern: /\bquiet neighborhood/i, reason: "people-characterization" },
  { pattern: /\browdy neighborhood/i, reason: "people-characterization" },
  { pattern: /\baffluent\b/i, reason: "class proxy" },
  { pattern: /\bworking[- ]class\b/i, reason: "class proxy" },
  { pattern: /\bblue[- ]collar\b/i, reason: "class proxy" },
  { pattern: /\bupscale residents/i, reason: "class proxy, people characterization" },
];

export function containsFairHousingFlag(
  text: string,
): { pattern: string; reason: string } | null {
  for (const { pattern, reason } of FAIR_HOUSING_DENIED_PATTERNS) {
    if (pattern.test(text)) {
      return { pattern: pattern.source, reason };
    }
  }
  return null;
}

export function lintPlaceSentiment(output: {
  bullets: string[];
  summary: string;
}): Array<{ location: "summary" | "bullet"; index: number; reason: string }> {
  const flags: Array<{
    location: "summary" | "bullet";
    index: number;
    reason: string;
  }> = [];
  const summaryFlag = containsFairHousingFlag(output.summary);
  if (summaryFlag) {
    flags.push({ location: "summary", index: 0, reason: summaryFlag.reason });
  }
  output.bullets.forEach((b, i) => {
    const f = containsFairHousingFlag(b);
    if (f) flags.push({ location: "bullet", index: i, reason: f.reason });
  });
  return flags;
}
