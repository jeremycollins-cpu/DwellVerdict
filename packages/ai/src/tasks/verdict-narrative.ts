import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropicClient } from "../anthropic";
import { routeVerdictNarrative, type RoutingReason } from "../model-router";
import { computeCostCents } from "../pricing";
import { logAiUsageEvent } from "../usage-events";
import type { VerdictScore } from "../scoring";

/**
 * verdict-narrative — Haiku synthesis that writes the 2-3 paragraph
 * narrative for a verdict given pre-computed signals + score per
 * ADR-6.
 *
 * Does NOT decide the BUY/WATCH/PASS. That's set by scoreVerdict()
 * upstream. This task only writes the prose.
 */

export const VERDICT_NARRATIVE_TASK_TYPE = "verdict_narrative";
/**
 * v2 (M3.3) — added structured `metrics` + `citations` per evidence
 * domain. Existing v1 verdict rows in production are preserved
 * verbatim (their `data_points` are 4 sentence strings); the M3.3
 * frontend type-guards on render and falls back to the legacy
 * 4-card layout when the shape predates the structured fields.
 */
export const VERDICT_NARRATIVE_PROMPT_VERSION = "v2";

/**
 * Default model for verdict-narrative. Kept exported for backward
 * compatibility — callers that import VERDICT_NARRATIVE_MODEL still
 * work, but the actual model on a given call is decided at runtime
 * by routeVerdictNarrative(confidence) (see model-router.ts).
 */
export const VERDICT_NARRATIVE_MODEL = "claude-haiku-4-5";

/**
 * Per-domain evidence. The narrative summary is required; metrics
 * and citations are optional because not every property has every
 * metric (e.g. no HOA → no hoa_status). The model is instructed to
 * emit fields it has data for and omit the rest.
 */
const CitationSchema = z.object({
  url: z.string().url(),
  label: z.string().min(1).max(120),
});

const CompsEvidenceSchema = z.object({
  summary: z.string().min(1).max(300),
  metrics: z
    .object({
      count: z.number().int().nonnegative().optional(),
      median_adr: z.number().nonnegative().optional(),
      occupancy: z.number().min(0).max(1).optional(),
    })
    .optional(),
  citations: z.array(CitationSchema).max(6).optional(),
});

const RevenueEvidenceSchema = z.object({
  summary: z.string().min(1).max(300),
  metrics: z
    .object({
      annual_estimate: z.number().nonnegative().optional(),
      seasonality: z.enum(["high", "moderate", "low"]).optional(),
      cap_rate: z.number().min(0).max(1).optional(),
    })
    .optional(),
  citations: z.array(CitationSchema).max(6).optional(),
});

const RegulatoryEvidenceSchema = z.object({
  summary: z.string().min(1).max(300),
  metrics: z
    .object({
      str_status: z
        .enum(["permitted", "restricted", "prohibited", "unclear"])
        .optional(),
      hoa_status: z
        .enum(["no_hoa", "hoa_neutral", "hoa_restrictive", "unverified"])
        .optional(),
      registration_required: z.boolean().optional(),
    })
    .optional(),
  citations: z.array(CitationSchema).max(6).optional(),
});

const LocationEvidenceSchema = z.object({
  summary: z.string().min(1).max(300),
  metrics: z
    .object({
      walk_score: z.number().int().min(0).max(100).optional(),
      flood_zone: z.string().min(1).max(20).optional(),
      crime_rate_rank: z.enum(["low", "moderate", "high"]).optional(),
      nearby_rating: z.number().min(0).max(5).optional(),
    })
    .optional(),
  citations: z.array(CitationSchema).max(6).optional(),
});

export const VerdictNarrativeOutputSchema = z.object({
  narrative: z.string().min(50).max(2000),
  summary: z.string().min(1).max(400),
  data_points: z.object({
    comps: CompsEvidenceSchema,
    revenue: RevenueEvidenceSchema,
    regulatory: RegulatoryEvidenceSchema,
    location: LocationEvidenceSchema,
  }),
});
export type VerdictNarrativeOutput = z.infer<typeof VerdictNarrativeOutputSchema>;
export type CompsEvidence = z.infer<typeof CompsEvidenceSchema>;
export type RevenueEvidence = z.infer<typeof RevenueEvidenceSchema>;
export type RegulatoryEvidence = z.infer<typeof RegulatoryEvidenceSchema>;
export type LocationEvidence = z.infer<typeof LocationEvidenceSchema>;

const CITATION_SCHEMA = {
  type: "object" as const,
  properties: {
    url: { type: "string" as const, description: "Source URL." },
    label: {
      type: "string" as const,
      description: "Short human-readable label (e.g. 'FEMA flood map').",
    },
  },
  required: ["url", "label"],
};

const RENDER_VERDICT_NARRATIVE_TOOL: Anthropic.Messages.Tool = {
  name: "render_verdict_narrative",
  description:
    "Emit the verdict narrative + summary + structured per-domain evidence. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      narrative: {
        type: "string",
        description: "2-3 paragraphs, ~140-180 words, separated by '\\n\\n'.",
      },
      summary: {
        type: "string",
        description: "One-sentence headline ≤140 chars for card previews.",
      },
      data_points: {
        type: "object",
        properties: {
          comps: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description: "One sentence summarizing the comp situation.",
              },
              metrics: {
                type: "object",
                description:
                  "Structured comp metrics. Omit any fields you don't have data for.",
                properties: {
                  count: {
                    type: "integer",
                    description: "Total comp count (e.g. 15).",
                  },
                  median_adr: {
                    type: "number",
                    description:
                      "Median Average Daily Rate across the comp set (USD).",
                  },
                  occupancy: {
                    type: "number",
                    description:
                      "Median occupancy across comps as a 0..1 ratio (e.g. 0.67 for 67%).",
                  },
                },
              },
              citations: {
                type: "array",
                items: CITATION_SCHEMA,
                description:
                  "0-6 citations specific to comp data (Airbnb, AirDNA, etc.).",
              },
            },
            required: ["summary"],
          },
          revenue: {
            type: "object",
            properties: {
              summary: { type: "string" },
              metrics: {
                type: "object",
                description:
                  "Structured revenue metrics. Omit any field you don't have data for.",
                properties: {
                  annual_estimate: {
                    type: "number",
                    description:
                      "Comp-weighted annual revenue estimate (USD).",
                  },
                  seasonality: {
                    type: "string",
                    enum: ["high", "moderate", "low"],
                    description: "Seasonality concentration.",
                  },
                  cap_rate: {
                    type: "number",
                    description:
                      "Cap rate as a 0..1 ratio (e.g. 0.082 for 8.2%).",
                  },
                },
              },
              citations: { type: "array", items: CITATION_SCHEMA },
            },
            required: ["summary"],
          },
          regulatory: {
            type: "object",
            properties: {
              summary: { type: "string" },
              metrics: {
                type: "object",
                properties: {
                  str_status: {
                    type: "string",
                    enum: ["permitted", "restricted", "prohibited", "unclear"],
                  },
                  hoa_status: {
                    type: "string",
                    enum: [
                      "no_hoa",
                      "hoa_neutral",
                      "hoa_restrictive",
                      "unverified",
                    ],
                  },
                  registration_required: {
                    type: "boolean",
                  },
                },
              },
              citations: { type: "array", items: CITATION_SCHEMA },
            },
            required: ["summary"],
          },
          location: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description:
                  "One sentence of objective location signals (fair-housing compliant).",
              },
              metrics: {
                type: "object",
                description:
                  "Objective metrics only. Never include demographic or characterization fields.",
                properties: {
                  walk_score: { type: "integer", description: "0-100." },
                  flood_zone: {
                    type: "string",
                    description: "FEMA designation (e.g. 'X', 'AE').",
                  },
                  crime_rate_rank: {
                    type: "string",
                    enum: ["low", "moderate", "high"],
                  },
                  nearby_rating: {
                    type: "number",
                    description: "Average nearby business rating, 0-5.",
                  },
                },
              },
              citations: { type: "array", items: CITATION_SCHEMA },
            },
            required: ["summary"],
          },
        },
        required: ["comps", "revenue", "regulatory", "location"],
      },
    },
    required: ["narrative", "summary", "data_points"],
  },
};

function loadPromptTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "prompts", "verdict-narrative.v2.md"),
    join(here, "..", "..", "..", "..", "prompts", "verdict-narrative.v2.md"),
    join(process.cwd(), "..", "..", "prompts", "verdict-narrative.v2.md"),
  ];
  let lastErr: unknown;
  for (const p of candidates) {
    try {
      return readFileSync(p, "utf8");
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `verdict-narrative prompt template not found. Tried: ${candidates.join(", ")}. ` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

function renderPrompt(vars: {
  addressFull: string;
  signal: string;
  score: number;
  confidence: number;
  inputJson: string;
  breakdownJson: string;
}): { system: string; user: string } {
  const template = loadPromptTemplate();
  const [, afterSystem] = template.split(/^## System\s*$/m);
  if (!afterSystem) throw new Error("prompt missing '## System' heading");
  const [systemText, userText] = afterSystem.split(/^## User\s*$/m);
  if (!systemText || !userText) throw new Error("prompt missing '## User' heading");

  const interpolate = (s: string) =>
    s
      .replaceAll("{{ADDRESS_FULL}}", vars.addressFull)
      .replaceAll("{{SIGNAL}}", vars.signal.toUpperCase())
      .replaceAll("{{SCORE}}", String(vars.score))
      .replaceAll("{{CONFIDENCE}}", String(vars.confidence))
      .replaceAll("{{INPUT_JSON}}", vars.inputJson)
      .replaceAll("{{BREAKDOWN_JSON}}", vars.breakdownJson);

  return {
    system: interpolate(systemText).trim(),
    user: interpolate(userText).trim(),
  };
}

export type VerdictNarrativeInput = {
  addressFull: string;
  score: VerdictScore;
  /** Already-computed structured signals the narrative should cite. */
  signals: Record<string, unknown>;
  /** Optional userId so the call can be logged to ai_usage_events.
   *  When omitted (e.g. unit tests) usage logging silently no-ops. */
  userId?: string;
  /** Optional orgId. Threaded into ai_usage_events for org-scoped
   *  cost analytics. */
  orgId?: string;
  /** Optional verdictId so the usage event can be correlated to the
   *  verdict that triggered it. */
  verdictId?: string;
};

export type VerdictNarrativeSuccess = {
  ok: true;
  output: VerdictNarrativeOutput;
  observability: {
    modelVersion: string;
    promptVersion: string;
    routingReason: RoutingReason;
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    costCents: number;
  };
};

export type VerdictNarrativeFailure = {
  ok: false;
  error: string;
  observability: Partial<VerdictNarrativeSuccess["observability"]>;
};

export async function writeVerdictNarrative(
  input: VerdictNarrativeInput,
): Promise<VerdictNarrativeSuccess | VerdictNarrativeFailure> {
  // Route based on confidence: low-confidence verdicts get Sonnet
  // for nuanced interpretation; everything else stays on Haiku.
  const routing = routeVerdictNarrative(input.score.confidence);

  let client: Anthropic;
  let prompt: { system: string; user: string };
  try {
    client = getAnthropicClient();
    prompt = renderPrompt({
      addressFull: input.addressFull,
      signal: input.score.signal,
      score: input.score.score,
      confidence: input.score.confidence,
      inputJson: JSON.stringify(input.signals, null, 2),
      breakdownJson: JSON.stringify(input.score.breakdown, null, 2),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `verdict_narrative_setup_failed: ${message}`,
      observability: {
        modelVersion: routing.model,
        promptVersion: VERDICT_NARRATIVE_PROMPT_VERSION,
      },
    };
  }

  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    response = await client.messages.create(
      {
        model: routing.model,
        max_tokens: 1000,
        system: [
          {
            type: "text",
            text: prompt.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: prompt.user }],
        tools: [RENDER_VERDICT_NARRATIVE_TOOL],
        tool_choice: { type: "tool", name: "render_verdict_narrative" },
      },
      { timeout: 60_000, maxRetries: 0 },
    );
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `anthropic_${err.status ?? "error"}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("[verdict-narrative] Anthropic call failed", {
      message,
      elapsedMs: Date.now() - startedAt,
      addressFull: input.addressFull,
      model: routing.model,
      routingReason: routing.reason,
    });
    if (input.userId) {
      await logAiUsageEvent({
        userId: input.userId,
        orgId: input.orgId,
        task: "verdict-narrative",
        model: routing.model,
        routingReason: routing.reason,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
        verdictId: input.verdictId,
        durationMs: Date.now() - startedAt,
        error: message,
      });
    }
    return {
      ok: false,
      error: message,
      observability: {
        modelVersion: routing.model,
        promptVersion: VERDICT_NARRATIVE_PROMPT_VERSION,
      },
    };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadInputTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheCreationInputTokens =
    response.usage.cache_creation_input_tokens ?? 0;

  console.log("[verdict-narrative] call complete", {
    addressFull: input.addressFull,
    elapsedMs: Date.now() - startedAt,
    model: routing.model,
    routingReason: routing.reason,
    confidence: input.score.confidence,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    stopReason: response.stop_reason,
  });

  const costCents = computeCostCents({
    model: routing.model,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
  });

  const observability = {
    modelVersion: routing.model,
    promptVersion: VERDICT_NARRATIVE_PROMPT_VERSION,
    routingReason: routing.reason,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    costCents,
  };

  if (input.userId) {
    await logAiUsageEvent({
      userId: input.userId,
      orgId: input.orgId,
      task: "verdict-narrative",
      model: routing.model,
      routingReason: routing.reason,
      inputTokens,
      outputTokens,
      cacheReadInputTokens,
      cacheCreationInputTokens,
      costCents,
      verdictId: input.verdictId,
      durationMs: Date.now() - startedAt,
    });
  }

  const renderCall = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock =>
      b.type === "tool_use" && b.name === "render_verdict_narrative",
  );
  if (!renderCall) {
    return {
      ok: false,
      error:
        "Model did not call render_verdict_narrative. " +
        `stop_reason=${response.stop_reason}.`,
      observability,
    };
  }

  const parsed = VerdictNarrativeOutputSchema.safeParse(renderCall.input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "render_verdict_narrative output failed schema validation: " +
        parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      observability,
    };
  }

  return { ok: true, output: parsed.data, observability };
}
