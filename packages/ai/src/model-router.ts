/**
 * M3.0 model routing.
 *
 * Production today is Haiku 4.5 for every AI task. The router lets
 * specific tasks escalate to Sonnet 4.6 based on contextual signals.
 * In M3.0 the only escalation is verdict-narrative on low-confidence
 * verdicts; other tasks (regulatory-lookup, place-sentiment,
 * scout-chat) always return the Haiku default. Future milestones
 * (M6.1 in particular) may extend this.
 *
 * Model strings match the keys in MODEL_PRICING (packages/ai/src/
 * pricing.ts) so cost computation works without lookup gaps.
 */

export const HAIKU_MODEL = "claude-haiku-4-5";
export const SONNET_MODEL = "claude-sonnet-4-6";

/**
 * Confidence threshold below which verdict narrative escalates to
 * Sonnet. Configurable via the env var so we can tune per
 * deployment without a code change.
 */
export const VERDICT_NARRATIVE_SONNET_THRESHOLD: number = (() => {
  const raw = process.env.VERDICT_NARRATIVE_SONNET_THRESHOLD;
  if (!raw) return 70;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 70;
  // Clamp to valid confidence range so a misconfigured value can't
  // disable escalation entirely or always-escalate.
  return Math.max(0, Math.min(100, parsed));
})();

export type RoutingReason =
  | "low_confidence_escalation"
  | "default_haiku"
  | "default_sonnet";

export interface RoutingDecision {
  model: string;
  reason: RoutingReason;
}

/**
 * Decide which model writes the verdict narrative for a given
 * confidence. Low-confidence verdicts get Sonnet for nuanced
 * interpretation of ambiguous signals; everything else stays on
 * Haiku since the data is clear and the narrative just explains.
 */
export function routeVerdictNarrative(confidence: number): RoutingDecision {
  if (confidence < VERDICT_NARRATIVE_SONNET_THRESHOLD) {
    return { model: SONNET_MODEL, reason: "low_confidence_escalation" };
  }
  return { model: HAIKU_MODEL, reason: "default_haiku" };
}

export type TaskName =
  | "regulatory-lookup"
  | "place-sentiment"
  | "scout-chat"
  | "verdict-narrative";

/**
 * Default model for a task that doesn't have dynamic routing. Used
 * by tasks that are always Haiku today; centralizing this lets us
 * swap defaults without touching every task file.
 */
export function getDefaultModel(_task: TaskName): string {
  return HAIKU_MODEL;
}
