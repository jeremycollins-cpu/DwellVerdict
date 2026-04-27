# DwellVerdict Engineering Refactor — Master Plan

**Status:** Active · v1.8 · April 26, 2026
**Owner:** Jeremy Collins
**Engineering executor:** Claude Code (autonomous)
**Design reference:** 22 mockups + v4-verdict in `docs/refactor/design-mockups/`

---

## Changelog

**v1.8 (2026-04-26):** Major reframe. DwellVerdict is an end-to-end real estate platform; verdicts are the lead-gen hook into a longer user journey. Added platform positioning section, expanded lifecycle stage scope, added tax strategy as a new pillar (cost segregation, STR loophole, depreciation, 1031 exchanges), added user-input data architecture for affordability ($0 data infrastructure pre-launch), added regional risk awareness (wildfire-weighted scoring for California, etc.), added milestones M3.5-M3.9 for revised Phase 3 scope, added M2.5 marketing positioning refresh, added M5.4-M5.6 tax strategy milestones, revised M5.1-M5.3 lifecycle stages from "light treatment" to "core platform surfaces."

**v1.7 (2026-04-25):** Reconciled cost optimization architecture with actual codebase state. Most planned infrastructure already existed; M3.0 reduced to additive enhancements. Updated CLAUDE.md inaccuracy (Sonnet→Haiku). Cache-read token cost math corrected.

**v1.6 (2026-04-25):** Reconciled with production reality on verdict quotas (50/200 caps not "unlimited"), Scout availability (Pro-only currently, M6.1 to revisit), and M6.1 milestone framing.

**v1.5 (2026-04-24):** Pricing pivot to $20/$40 two-tier (was three-tier). Mockups updated.

Earlier versions: foundational planning, milestone catalog, locked engineering decisions.

---

## What this document is

The single source of truth for the DwellVerdict UI refactor. Every milestone prompt for Claude Code references back to this plan. When trade-offs come up mid-refactor, this is where the answer lives.

**This document does NOT change without explicit revision** (versioned at top). If a milestone reveals a missing decision, we update the plan first, then write the prompt.

---

## North star

**DwellVerdict is an end-to-end real estate platform that guides investors through every stage of property ownership — from evaluating a deal to executing on it to optimizing its tax treatment to managing it as part of a portfolio.**

The verdict is the lead-gen hook. It's what gets users in the door — paste any address, get an AI-powered Buy/Watch/Pass verdict in seconds. But the platform is where the relationship lives. Once a user is in:

- **Property evaluation** — verdicts, evidence, what-if calculator
- **Buying lifecycle** — offer planning, due diligence checklists, contract guidance
- **Renovating lifecycle** — renovation tracking, cost segregation activation, contractor management
- **Managing lifecycle** — operational tracking, revenue management, ongoing tax tracking
- **Tax strategy** — cost segregation, STR loophole, depreciation, 1031 exchanges (cross-cutting across lifecycle stages plus dedicated portfolio-wide view)
- **Scout AI** — conversational advisor available everywhere
- **Briefs** — shareable PDFs for partners, lenders, agents
- **Alerts** — regulatory changes, market shifts, opportunity notifications
- **Portfolio dashboard** — cross-property insights and strategy

This is a SaaS relationship measured in years, not a one-time evaluation tool.

**The refactor goal:** Transform the existing DwellVerdict production app — which has working backend, working verdict generation, working Stripe, working Clerk auth, working Scout — into the platform vision represented by 22 design mockups + new lifecycle and tax strategy surfaces. The product engineering is sound. We're rebuilding the visual layer, the navigation, several net-new surfaces, AND adding the platform pillars (lifecycle stages with substance, tax strategy as a new pillar) while preserving every working piece of the data + AI infrastructure.

**Quality bar:** World-class. No shortcuts. No "coming soon" placeholders for v1 launch surfaces. Every surface ships to production polished.

**Speed bar:** Pre-launch, no real users yet. Speed is prioritized over safety nets. Claude Code operates autonomously: opens PRs, runs CI, merges to main, deploys. Bugs get fixed forward. The optimization is "ship the v1 fast" not "zero defects."

**Honest scope acknowledgment:** v1.8 expanded scope substantially over v1.6/v1.7. Lifecycle stages went from "light treatment" to "core platform surfaces." Tax strategy is a new pillar. Marketing positioning needs to reflect platform vision, not verdict-first framing. This adds approximately 5-7 milestones beyond the original plan and ~30-50 hours of additional Claude Code work. Worth it because the original plan would have shipped a verdict-first product that didn't match the actual platform vision.

---

## Product positioning

**Tagline (working):** "Your real estate co-pilot. From verdict to ownership and beyond."

**Pitch (working):** "DwellVerdict gives you a verdict on any property in seconds — but that's just the start. We guide you through buying, renovating, managing, and optimizing — including the tax strategies most investors miss. One platform for every stage of real estate investing."

**Hook (the verdict, free):** Anyone can paste an address and get a thesis-aware Buy/Watch/Pass verdict. Pre-launch users get one verdict free; real launch users may get more demo verdicts. The verdict demonstrates the product's intelligence — accurate analysis grounded in user-verified data plus public sources, with thesis-specific scoring (STR vs LTR vs owner-occupied) and regional risk awareness (wildfire in California, hurricane in Florida, etc.).

**The platform pillars (what subscribers get):**

1. **Property evaluation** — Generate verdicts, run what-if scenarios, compare properties
2. **Buying guidance** — Offer planning, due diligence, contract review checklists, closing prep
3. **Renovating guidance** — Renovation tracking, cost-seg activation, contractor management
4. **Managing guidance** — Operational tracking, revenue management, ongoing optimization
5. **Tax strategy** — Cost segregation, STR loophole, depreciation, 1031 exchanges (per-property + portfolio-wide)
6. **Scout AI** — Conversational advisor across all surfaces
7. **Briefs** — Shareable PDFs for partners, lenders, agents
8. **Alerts** — Regulatory changes, market shifts, opportunity notifications
9. **Portfolio dashboard** — Cross-property insights and strategy

**Marketing emphasis:** Platform positioning, not verdict-first. The verdict gets people in the door; the platform is what they pay for.

---

## Locked decisions

These are the choices made during design that the engineering refactor honors without re-litigating:

### Pricing

**Two tiers, matching current production:**
- **DwellVerdict** — $20/month
- **Pro** — $40/month

No third tier added in this refactor. Mockups updated to match this structure.

### Feature gating (soft paywall)

- **Free / unauthenticated** — Can paste an address, see the verdict generate, but the result is partially gated (verdict signal + 1 evidence domain visible, rest behind upgrade)
- **DwellVerdict $20** — 50 verdicts/month. Full Regulatory + Location domains unlocked. Comps ADR visible. Comps revenue + Revenue projection gated. Lifecycle stages (Buying / Renovating / Managing) unlocked.
- **Pro $40** — 200 verdicts/month. Everything unlocked: full evidence (regulatory, location, comps revenue, revenue projection), Scout chat, Compare, Briefs, Portfolio dashboard, Alerts.

Note: Verdict quotas (50/200 per month) are real per-period caps enforced by `consumeReport()` in production. This is the actual model — not "unlimited verdicts." Marketing materials must reflect the real numbers, not aspirational simplicity. Per-period caps are cost controls; at heavy usage 200 verdicts/month aligns with the gross-margin targets in the cost optimization architecture section.

This gating is enforced server-side via existing `consumeReport()` quota logic. UI shows lock states matching mockup designs.

### Navigation

**Full sidebar with 8 items in 3 sections** (replaces current top-bar):

- **Primary:** Dashboard / Properties / Verdicts / Compare
- **Workspace:** Portfolio / Briefs / Alerts
- **Account:** Settings

Locked logo at top. Avatar + plan footer at bottom. Active item indicated by terracotta left-edge accent + tinted background.

### Logo

Locked: D-house + V-checkmark mark + Geist 800 two-tone wordmark (`dwell` ink, `verdict` terracotta). Already shipped. Component lives at `apps/web/components/logo.tsx`.

### Brand tokens

Already defined at `apps/web/lib/brand-tokens.ts`. Refactor uses these as-is, with one addition needed (see Schema Changes below for any token additions discovered mid-refactor).

### Stack (existing)

- Next.js 14 App Router
- Neon Postgres + Drizzle ORM (NOT Supabase)
- Clerk auth
- Stripe billing
- Anthropic Sonnet 4 for verdict generation, Haiku for regulatory lookups
- Tailwind + shadcn/ui
- Vercel deployment

This stack stays. No framework changes in this refactor.

### Deployment strategy

**Ship in place, autonomously.** Each milestone PR deploys to production when merged by Claude Code. Means every PR must be deploy-safe — no half-built UIs that break the live app.

When a milestone introduces a new surface, the surface is built fully before merge. When a milestone changes an existing surface, build the new surface alongside the old, swap routing in one atomic commit.

### Engagement pattern

**Autonomous milestone execution.** Per Jeremy's decision (April 24, 2026):

For each milestone:
1. Claude (design partner) writes a focused milestone prompt
2. Jeremy pastes it to Claude Code
3. Claude Code executes the work, opens a PR, waits for CI to pass, merges PR, confirms production deploy
4. Jeremy moves to the next milestone prompt

**No manual PR review.** Claude Code merges its own work. Jeremy does not need to be in the loop for routine milestones.

**No Terminal commands** for Jeremy. Claude Code handles all git operations.

**Prompt delivery:** Claude (design partner) delivers milestone prompts in batches of 3-5 to reduce round-trips. Jeremy pastes them in sequence to Claude Code as each completes.

### CI requirements

Every PR must pass CI before merge. Required checks:
- TypeScript compiles (`pnpm typecheck`)
- Lint passes (`pnpm lint`)
- Existing tests pass (`pnpm test`)

If CI fails, Claude Code attempts to fix the failure (up to 3 fix attempts), then merges. If after 3 attempts CI still fails, Claude Code documents the failure in the PR description, merges anyway with a "CI failure noted" tag, and continues. Bugs get fixed forward in subsequent milestones.

This is intentionally aggressive. Pre-launch, the cost of a half-broken merge is much lower than the cost of stalling the refactor.

---

## User-input data architecture

**Major architectural decision (v1.8):** Pre-launch, DwellVerdict does NOT depend on paid third-party data providers. Instead, users provide verified data inputs themselves through guided forms, supplemented by free public APIs (FEMA, USGS, Census, county records where available).

**Why this is right for v1:**

The audit conducted before M3.5 revealed that the existing scraper-based fetchers (Apify-driven Zillow, Redfin, Airbnb) have been at 100% failure rate in production. Fixing them would require either paying for reliable providers ($30-200/month for AirDNA, ATTOM, etc.) or accepting fragile scrapers that break frequently.

The user-input architecture solves this by inverting the data sourcing model:

- User provides listing price (verified from Zillow listing page)
- User provides property value estimate (from Zestimate or Redfin estimate)
- User provides expected rent / nightly rate / occupancy (from comp research with our guidance)
- User provides insurance estimate (from quick quote with Lemonade or Geico)
- User provides property tax (from Zillow listing or county records)
- User confirms regulatory status (from our LLM lookup, with override option)

This produces MORE accurate verdicts than scraped data because:
- User-verified > scraper-guessed
- User contextual judgment > rigid algorithms
- User involvement creates buy-in to the verdict

**The platform's job is to MAKE THIS EASY.** Each input field includes:
- Clear guidance on where to find the data ("Open the Zillow listing → copy the price shown above the address")
- Reasonable defaults when possible (regional averages, comp medians)
- Optional confirmation checkbox ("I verified this from [source]")
- Explanation of how it impacts the verdict

**Future paid integration (post-launch):**

Once DwellVerdict has 5+ paying users (~$100+/month revenue), upgrade triggers activate:
- AirDNA basic ($30/month) for working STR comps replaces user-input expected nightly rate / occupancy
- ATTOM Data ($50-100/month) for working property records replaces user-input listing price / value
- User intake becomes optional override rather than required input

When paid integrations land, existing user-input data stays as authoritative until the user opts to refresh from API. Smooth migration, not jarring replacement.

**Tier 1/2/3 data architecture (long-term):**

- **Tier 1 (premium):** Best-in-class data when available for free in a region (state public records, county assessors, local MLS feeds where free)
- **Tier 2 (national free):** Reliable nationwide free APIs (FEMA, USGS, Census, federal regulatory)
- **Tier 3 (premium paid):** Subscription-based providers added when revenue justifies (AirDNA, ATTOM, etc.)

User input is the **temporary substitute for Tier 1/3 where data isn't free**. As paid tiers come online, user input migrates to optional/override mode.

---

## Regional risk awareness

**Major scoring decision (v1.8):** Verdict scoring rubric must reflect regional risk realities, not apply a one-size-fits-all rubric to every property.

**Specific regional adjustments for v1:**

- **California (especially wildfire zones):** Wildfire risk weighted higher. Insurance cost factored heavily into ROI (CA insurer exits driving premiums up dramatically). Properties in Cal Fire high-risk zones flagged prominently. Required user input for insurance estimate.
- **Florida (coastal + hurricane zones):** Hurricane + flood risk weighted higher. Insurance + flood insurance separated. Cat-bond exposure noted.
- **Gulf Coast (TX, LA, AL, MS):** Hurricane + flood risk weighted higher.
- **Tornado Alley (OK, KS, NE, TX panhandle, etc.):** Wind/storm damage risk weighted higher.
- **Mountain West (CO, UT, MT, ID):** Wildfire + winter storm risk noted.
- **Pacific Northwest (WA, OR):** Earthquake + wildfire risk noted.
- **Northeast urban:** Default rubric (less specialized regional risk).

**How regional risk integrates with thesis:**

Risk weighting depends on BOTH region AND thesis:

- STR in California fire zone → wildfire risk drops occupancy expectations (smoke season cancellations) AND drives insurance cost up; both hit ROI
- LTR in California fire zone → tenant retention risk in repeat fire areas; insurance cost dominant
- Owner-occupied in California fire zone → personal safety + insurance + appreciation impact

**v1 implementation scope:**

M3.8 (thesis-aware scoring) implements this. Rubric weights become a 2D table: `{thesis} × {region}` → weight overrides applied to base rules. Default rubric applies where no region-specific weighting is defined.

**Out of scope for v1:**

- Earthquake risk modeling (requires specialized geological data; default to noting state-level)
- Climate change projections (out of scope for v1; Phase 10+ feature)
- Insurer-specific pricing (we use user-provided estimates)

---

## Schema changes required

Production schema lives in `packages/db/src/schema/`. The refactor introduces these new fields/tables:

### M1.2 — Onboarding intent

Add to existing `users` table:
```sql
ALTER TABLE users
  ADD COLUMN intent_segment text,             -- 'investor' | 'shopper' | 'agent' | 'exploring'
  ADD COLUMN strategy_focus text[],           -- ['str', 'ltr', 'house_hacking', etc.]
  ADD COLUMN target_markets text[],           -- ['Monterey County', 'North Lake Tahoe']
  ADD COLUMN deal_range text,                 -- '<500k' | '500k-1m' | '1m-3m' | '3m-5m' | '5m+'
  ADD COLUMN onboarding_completed_at timestamp;
```

Migration adds these as nullable. Existing users skip onboarding (we set `onboarding_completed_at = NOW()` for existing users in the migration).

### M3 — Verdict streaming events

Add new table for streaming verdict generation telemetry:
```sql
CREATE TABLE verdict_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verdict_id uuid REFERENCES verdicts(id) ON DELETE CASCADE,
  event_type text NOT NULL,                   -- 'domain_started' | 'domain_complete' | 'narrative_chunk' | 'finalized'
  domain text,                                -- 'regulatory' | 'location' | 'comps' | 'revenue'
  payload jsonb,
  created_at timestamp DEFAULT NOW()
);
CREATE INDEX idx_verdict_events_verdict_id ON verdict_events(verdict_id);
```

Used by the streaming UI in mockup #04 to show domain-by-domain evidence appearing as Scout completes each one.

### M5 — Briefs

New tables for the brief generation system:
```sql
CREATE TABLE briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) NOT NULL,
  property_id uuid REFERENCES properties(id),  -- nullable for portfolio-wide briefs
  verdict_id uuid REFERENCES verdicts(id),     -- nullable for offer letters and portfolio
  created_by_user_id uuid REFERENCES users(id) NOT NULL,
  template_type text NOT NULL,                -- 'verdict_snapshot' | 'offer_letter' | 'portfolio_summary'
  name text NOT NULL,
  audience text,
  config jsonb NOT NULL,                      -- toggle states, customizations
  pdf_url text,                                -- generated PDF storage URL
  page_count integer,
  status text NOT NULL,                       -- 'generating' | 'ready' | 'failed'
  created_at timestamp DEFAULT NOW(),
  updated_at timestamp DEFAULT NOW()
);
CREATE INDEX idx_briefs_org_id ON briefs(org_id);
CREATE INDEX idx_briefs_property_id ON briefs(property_id);
```

### M6 — Alerts

New tables for alert rules and triggered alerts:
```sql
CREATE TABLE alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  name text NOT NULL,
  trigger_type text NOT NULL,                 -- 'regulatory_change', 'cap_threshold', 'adr_shift', 'price_movement', 'confidence_drop', 'scheduled', 'custom'
  trigger_config jsonb NOT NULL,              -- threshold values, scope (property_ids[], all, etc.)
  delivery_channels text[] NOT NULL,          -- ['email', 'in_app', 'push']
  enabled boolean DEFAULT true,
  created_at timestamp DEFAULT NOW(),
  updated_at timestamp DEFAULT NOW()
);

CREATE TABLE alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  alert_rule_id uuid REFERENCES alert_rules(id) ON DELETE SET NULL,
  property_id uuid REFERENCES properties(id),
  severity text NOT NULL,                     -- 'critical' | 'warning' | 'opportunity' | 'info'
  title text NOT NULL,
  description text,
  cta_label text,
  cta_url text,
  read_at timestamp,
  dismissed_at timestamp,
  created_at timestamp DEFAULT NOW()
);
CREATE INDEX idx_alert_events_org_user_unread ON alert_events(org_id, user_id) WHERE read_at IS NULL AND dismissed_at IS NULL;
```

### Notification preferences (M8)

Add to existing `users` table:
```sql
ALTER TABLE users
  ADD COLUMN notification_prefs jsonb DEFAULT '{
    "email": true,
    "in_app": true,
    "push": false,
    "quiet_hours": {"enabled": true, "from": "21:00", "to": "07:00", "tz": "America/Los_Angeles"},
    "events": {
      "verdict_ready": ["email", "in_app"],
      "verdict_failed": ["email", "in_app"],
      "confidence_shift_10": ["email", "in_app"],
      "signal_flipped": ["email", "in_app", "push"],
      "alert_critical": ["email", "in_app", "push"],
      "alert_warning": ["email", "in_app"],
      "alert_opportunity": ["email", "in_app"],
      "alert_info": ["in_app"],
      "brief_generated": ["in_app"],
      "scout_limit_warning": ["in_app"],
      "billing_event": ["email", "in_app"],
      "security_event": ["email", "in_app"]
    }
  }'::jsonb;
```

### Super admin flag (M9.1)

Add to existing `users` table for the embedded admin console:
```sql
ALTER TABLE users
  ADD COLUMN is_super_admin boolean DEFAULT false NOT NULL;

-- Set Jeremy's account as super admin
-- (run manually post-migration with the actual user UUID or email match)
UPDATE users SET is_super_admin = true WHERE email = 'jeremy@routeware.com';
```

This single boolean has two effects across the codebase. Both are mandatory and must be enforced everywhere the relevant logic exists.

**Effect 1: Admin UI visibility.**
The admin sidebar section, all `/admin/*` routes, and any admin-specific UI elements are **completely invisible** to users where `is_super_admin = false`:
- The sidebar admin section must not render in the DOM (not hidden via CSS, not display:none — actually absent from the rendered output)
- All `/admin/*` routes return 404 (not 401, not 403 — the routes must appear to not exist)
- No client-side feature flags, hints, or comments that could reveal admin exists
- No admin-related strings in client bundles served to non-admins (use server-side rendering or dynamic imports for admin code)

The existence of admin must not leak to customers. A non-admin viewing page source, inspecting network requests, or reading client bundles should see no evidence that admin functionality exists.

**Effect 2: Implicit Pro tier access.**
Super admins have full Pro tier access automatically, without requiring a Stripe subscription:
- All Pro-gated features unlocked: Compare, Briefs unlimited, Scout at Pro tier limits, Portfolio dashboard, Alerts
- All quota enforcement treats `is_super_admin = true` as if `subscription_tier = 'pro'`
- The existing `consumeReport()` and similar quota functions must check `is_super_admin` first and skip quota checks if true
- Billing settings page for super admins should still display gracefully (showing whatever subscription state they actually have, if any) but does not gate access

Implementation pattern: Add a helper `getEffectiveTier(user)` that returns `'pro'` if `user.is_super_admin === true`, otherwise returns `user.subscription_tier`. Every gating check in the codebase uses this helper rather than reading `subscription_tier` directly.

No separate roles or permissions system — Jeremy is the only super admin, no one else. If the customer-facing product later needs role-based access (e.g., team accounts where one user can invite others with limited permissions), that's a separate post-launch project and a separate schema design.

### AI quality feedback (M9.3)

New tables for capturing user feedback on AI outputs, used by the admin AI quality dashboard:

```sql
CREATE TABLE verdict_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verdict_id uuid REFERENCES verdicts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  rating text NOT NULL,                       -- 'helpful' | 'not_helpful'
  reason text,                                -- optional free-text feedback
  signal_at_feedback text,                    -- 'buy' | 'watch' | 'pass' (snapshot for analytics)
  confidence_at_feedback integer,             -- 0-100 (snapshot for analytics)
  created_at timestamp DEFAULT NOW()
);
CREATE INDEX idx_verdict_feedback_verdict_id ON verdict_feedback(verdict_id);
CREATE INDEX idx_verdict_feedback_created_at ON verdict_feedback(created_at);

CREATE TABLE scout_message_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scout_message_id uuid REFERENCES scout_messages(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  rating text NOT NULL,                       -- 'helpful' | 'not_helpful'
  reason text,                                -- optional free-text feedback
  model_used text,                            -- 'sonnet-4-6' | 'haiku-4-5' (snapshot for analytics)
  created_at timestamp DEFAULT NOW()
);
CREATE INDEX idx_scout_feedback_message_id ON scout_message_feedback(scout_message_id);
CREATE INDEX idx_scout_feedback_created_at ON scout_message_feedback(created_at);
```

These tables capture the data the admin AI quality dashboard analyzes: satisfaction rates by signal type, satisfaction by confidence band (does our 80+ confidence really feel 80% accurate?), satisfaction by model (does Haiku-handled Scout feel as good as Sonnet?), common complaint themes from `reason` field.

The customer-facing UI for capturing this feedback ships in M3.3 (verdict detail) and M6.1 (Scout) — small thumbs up/down with optional "tell us more" text input. Unobtrusive, easy to skip, never required.

---

## Cost optimization architecture

This is a first-class concern of the refactor, not an afterthought. The product's unit economics depend on aggressive cost optimization in the AI layer. Without it, heavy Pro users cost more in Anthropic API spend than they pay in subscription, and the business doesn't work.

### The unit economics problem

At naive Sonnet 4.6 pricing across all AI operations:

- **Average verdict generation:** ~$0.72 per verdict (4 domain sub-calls × ~$0.18 each)
- **Scout chat at heavy use:** ~$0.15 per message × 450 messages/month = $67.50/month per heavy user
- **Heavy Pro user total:** ~$71/month in COGS against $40 in subscription revenue → **negative margin**

This is unsustainable. The optimization strategy below restructures these costs to land at roughly $20/month in COGS for a heavy Pro user, achieving ~50% gross margin even at the high end of usage.

### The four cost levers

These levers stack. Implemented together, they take blended Anthropic costs down by 70-75% versus naive usage with no perceptible change to user experience.

#### Lever 1: Aggressive prompt caching (90% savings on cached input)

The verdict generation pipeline has a large static portion — the system prompt with verdict methodology, output schema, FHA lint instructions, comp ranking logic, narrative voice. This is identical across every verdict.

Cache it once, reuse forever. Anthropic's prompt caching reduces cached input cost from $3/M to $0.30/M (90% off). A 1-hour cache write costs 2x base input price; a 5-minute cache write costs 1.25x base input price. After one cache read, the write cost has paid for itself.

**Architecture:**
- Static system prompt portions (>1,024 tokens to be cacheable) marked with `cache_control: { type: 'ephemeral' }` in the API request
- Property-specific data passed as non-cached input
- Same system prompt structure across regulatory, location, comps, revenue domains so all 4 sub-calls benefit from the same cache
- 5-minute TTL for verdict generation (typically completes in <1 minute), 1-hour TTL for Scout sessions

**Implementation:** A shared `cache-helpers.ts` abstraction so every AI call uses caching by default.

#### Lever 2: Model routing (60-80% savings on routed calls)

Not every AI operation needs Sonnet 4.6. Haiku 4.5 at $1/$5 per million tokens matches Sonnet 4 quality on many production tasks at ~33% the cost.

**Routing matrix:**

| Task | Model | Reasoning |
|------|-------|-----------|
| Full verdict synthesis | Sonnet 4.6 | Core quality moat; never compromise here |
| Regulatory data extraction + summarize | Haiku 4.5 | Structured extraction, well-suited to Haiku |
| Comp set ranking and scoring | Haiku 4.5 | Numerical reasoning + filtering |
| Place sentiment analysis | Haiku 4.5 | Sentiment + summarization, Haiku optimized |
| Scout — simple factual questions | Haiku 4.5 | Lookups, summaries, structured retrieval |
| Scout — complex reasoning | Sonnet 4.6 | Nuanced analytical questions |
| Brief generation | Haiku 4.5 | Templated content from existing data |
| Compare recommendation | Sonnet 4.6 | Cross-property synthesis requires depth |
| Verdict re-runs (alert-triggered, not user-initiated) | Sonnet 4.6 + Batch | Same quality, 50% off via Batch API |

**Architecture:**
- A `model-router.ts` abstraction that classifies each AI request type and picks the model
- Every AI call in the codebase routes through this abstraction; never call Anthropic SDK directly outside of it
- Routing logic is config-driven so model assignments can be tuned without code changes

#### Lever 3: Scout cost containment (the highest-leverage area)

Scout is the largest unit-economics risk because of message volume. A heavy Pro user can send 30 messages/day = 900/month. Even with caching and Haiku routing, this needs structural containment.

**Three changes:**

**3a. Two-pass routing in Scout.**
Every Scout message hits Haiku 4.5 first. Haiku decides: "Is this a simple factual/lookup question, or does it require complex reasoning?" If simple, Haiku answers (most cases — ~70-80% of production Scout traffic). If complex, the request escalates to Sonnet 4.6 with the same context.

This requires a small "router prompt" — Haiku decides escalation in roughly 200 tokens of output, then either continues with the answer or signals escalation. Total cost when answered by Haiku: ~$0.03. Total cost when escalated to Sonnet: ~$0.12.

Net effect on Scout cost: 50-60% reduction blended across all Scout messages.

**3b. Property context caching.**
A property's full context (verdict + evidence + comp data + regulatory data + 5 most recent messages) is ~20-40K tokens. This is cached on the first Scout message of a session with a 1-hour TTL. Subsequent messages within the hour read from cache at 90% off the input cost.

Net effect on Scout cost: 80-90% reduction on the property-context portion of every message after the first in a session.

**3c. Tier limits + monthly cost cap.**

Current production (subject to revisit when M6.1 ships):
- **DwellVerdict $20:** Scout is Pro-only in production today (no DwellVerdict tier access). When M6.1 ships, evaluate whether to add a small demo allowance (e.g., 3 messages/day) for conversion purposes vs. keeping Scout fully Pro-only. Decision is data-driven from M6.1 conversion telemetry, not pre-determined here.
- **Pro $40:** 30 messages/day, 300/month soft cap (current production behavior). M6.1 may tighten to 20/day, 200/month based on actual usage data — adjustment ships with M6.1 implementation.
- **Per-user monthly Anthropic spend cap:** If a user's tracked Anthropic spend in a month exceeds $30 (75% of Pro subscription), Scout degrades to Haiku-only and surfaces a friendly "you're using Scout heavily" message. Keeps margins positive even on outlier users.

#### Lever 4: Batch API for non-urgent operations (50% savings)

Anthropic's Batch API processes requests asynchronously with results returned within 24 hours, at exactly 50% off standard token prices. No quality difference, just timing.

**What gets batched:**
- Brief generation — user clicks "Generate brief," gets in-app notification when ready (24-hour latency acceptable)
- Alert rule engine evaluation — runs on cron, evaluates many properties at once
- Verdict re-runs triggered by data changes (alert-driven, not user-initiated)
- Portfolio aggregations — computed nightly, displayed on next-day dashboard

**What stays real-time:**
- User-initiated verdict generation (must stream)
- User-initiated Scout messages (must be conversational)
- Compare recommendations (user is waiting)

**Implementation:**
- A `batch-client.ts` abstraction parallel to the streaming verdict client
- All non-real-time AI operations route through batch by default
- Batch results stored in existing tables; UI polls or receives webhook on completion

### Cost tracking and observability

Every AI call records its actual cost to a per-user, per-org, per-operation cost table. This is foundational — without measurement, optimization is guessing.

**Schema additions:**

```sql
CREATE TABLE ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  operation_type text NOT NULL,           -- 'verdict_generation' | 'scout_message' | 'brief_generation' | 'compare_recommendation' | 'alert_evaluation' | 'portfolio_aggregation'
  model text NOT NULL,                    -- 'sonnet-4-6' | 'haiku-4-5' | 'opus-4-7'
  used_caching boolean DEFAULT false,
  used_batch boolean DEFAULT false,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  cost_cents numeric(10, 4) NOT NULL,     -- precise to fractions of a cent
  related_entity_type text,               -- 'verdict' | 'property' | 'brief' | 'alert_event'
  related_entity_id uuid,
  request_id text,                        -- Anthropic request ID for debugging
  created_at timestamp DEFAULT NOW()
);
CREATE INDEX idx_ai_usage_org_user_month ON ai_usage_events(org_id, user_id, created_at);
CREATE INDEX idx_ai_usage_operation ON ai_usage_events(operation_type, created_at);
```

A view or function `user_monthly_ai_spend(user_id, month)` aggregates this for the cost-cap logic.

### Expected post-optimization economics

**Per Pro user, heavy use scenario (5 verdicts/month, 450 Scout messages/month):**

- Verdicts: 5 × $0.30 (caching + Haiku sub-routing) = $1.50
- Scout: 450 messages, 80% Haiku-handled with context caching @ ~$0.03 each + 20% Sonnet-escalated with context caching @ ~$0.08 each = $10.80 + $7.20 = $18.00
- **Total: ~$19.50/month against $40 revenue → 51% gross margin**

**Per DwellVerdict user, average use (2 verdicts/month, 60 Scout messages/month — limited by tier):**

- Verdicts: 2 × $0.30 = $0.60
- Scout: 60 × ~$0.03 = $1.80
- **Total: ~$2.40/month against $20 revenue → 88% gross margin**

These projections are conservative. With real usage data post-launch, we'll have actuals to optimize against.

### Implementation across milestones

Cost optimization isn't a single milestone — it's woven through several:

- **M3.0** (NEW) — AI cost optimization foundation: `model-router.ts`, `cache-helpers.ts`, `batch-client.ts`, `ai_usage_events` schema, monthly spend tracking
- **M3.2** — Streaming verdict generation uses `model-router.ts` and `cache-helpers.ts` from day one
- **M6.1** — Scout per-property implements two-pass routing, context caching, tier limits, and cost-cap degradation
- **M7.1** — Brief generation uses Batch API
- **M7.3** — Alert rule engine uses Batch API for evaluation runs

Every other milestone that touches AI code reuses these abstractions rather than calling Anthropic SDK directly. This is a hard architectural rule: **no direct Anthropic SDK calls outside the routing/caching abstractions.**

### Future optimization (post-v1)

Beyond v1, additional levers we may pull:

- **Fine-tuning on Haiku** for verdict-style outputs (Anthropic doesn't offer fine-tuning publicly yet, but watch for it)
- **Pre-computed regulatory lookups** — many properties in the same county share regulatory data; cache and reuse across users
- **Verdict snapshot deduplication** — same address re-run within 24 hours returns cached result with refresh banner
- **Tiered Scout context** — only load full property context for messages that actually reference the property; lighter context for general questions
- **Self-hosted models for low-stakes operations** — open-weight models on Bedrock could handle some Haiku-tier tasks at near-zero marginal cost at scale

These are deferred to v1.1+. The four levers above are sufficient for v1 launch.

---

## Milestone catalog (the refactor)

Milestones are organized into 9 phases plus a Phase 0 setup. Each phase represents a coherent slice of work; milestones within a phase often share dependencies and can sometimes overlap. Cross-phase dependencies are explicit.

### Phase 0 — Operational foundation

Critical infrastructure that must exist before user-facing work continues. These milestones establish CI, error monitoring, email delivery, and other operational essentials. Without these in place, later phases either can't function (M7.3 alerts, M8.4 notifications), ship without the safety net needed for production launch (no Sentry = no visibility into production errors), or accumulate undetected regressions (no real CI = type errors and broken tests slip through).

**Sequencing note:** Phase 0 milestones are interleaved with Phase 1+ rather than all shipping at once. M0.2 (CI) ships immediately after M1.1 so all subsequent milestones get type-checking. M0.1 (email) ships after M1.3 since the first email-using milestone (M3.4 welcome email) is in Phase 3. M0.3 (Sentry) ships before Phase 3 begins so verdict generation errors are captured from day one.

**M0.1** — Email infrastructure (Resend)
> Set up Resend as the email provider. Create a Resend account at resend.com if not already created. Provision API key, store in env var `RESEND_API_KEY`. Configure DNS records on dwellverdict.com domain: SPF record, DKIM record (Resend provides), DMARC record. Verify domain in Resend dashboard. Set up `notifications@dwellverdict.com` and `hello@dwellverdict.com` as sending addresses. Install `resend` and `@react-email/components` npm packages. Create `apps/web/lib/email/client.ts` (Resend client singleton with retry logic) and `apps/web/lib/email/send.ts` (typed sendEmail helper that takes a React Email component, recipient, subject). Build base email layout component at `apps/web/emails/_layout.tsx` matching brand tokens (terracotta accent, paper background, ink type). Build one example transactional email (`apps/web/emails/welcome.tsx`) to verify the pipeline works end-to-end. Send a test email to Jeremy's address from the verified sending address. Document the email setup in `docs/runbooks/email.md`. After this milestone, every later milestone that sends email uses these helpers — no direct Resend SDK calls.

**M0.2** — Real CI infrastructure
> The current `.github/workflows/ci.yml` is a placeholder stub that runs `echo` and reports green. Replace it with a functional CI pipeline that runs on every PR and push to main. Configure these required jobs:
>
> 1. **Typecheck** — runs `pnpm typecheck` across the monorepo. Fails build if any TypeScript error exists. This is the highest-value job for the refactor since most schema and prop type issues will be caught here.
> 2. **Lint** — runs `pnpm lint` across the monorepo. Fails build on lint errors. Warnings allowed but visible in PR.
> 3. **Build** — runs `pnpm build` for the web app. Catches build-time errors that aren't pure TypeScript issues (e.g., missing env vars referenced in code, incorrect Next.js config).
> 4. **Tests** — runs `pnpm test` if test scripts exist; otherwise skip with a no-op. Don't block the PR for missing tests, but if tests exist, they must pass.
>
> Use `actions/checkout@v4`, `actions/setup-node@v4` (Node version from `.nvmrc`), `pnpm/action-setup@v3` (read version from package.json), and `actions/cache@v4` for pnpm store caching. Set up matrix-free single-runner config — overcomplicating CI is a waste at this scale. Add branch protection rules in GitHub: require all CI jobs green before merge to main (except for the `placeholder` legacy job, which can be removed entirely). Document the CI architecture in `docs/runbooks/ci.md`.
>
> After this milestone, every PR runs real type-checking and linting. Claude Code's "merge after 3 fix attempts" policy still applies, but most of those fix attempts will be fixing real issues now rather than working around CI gaps.

**M0.3** — Sentry error monitoring
> Set up Sentry for production error monitoring. Create Sentry project at sentry.io if not already created. Install `@sentry/nextjs` package. Run `npx @sentry/wizard@latest -i nextjs` to scaffold the integration, or configure manually with `apps/web/sentry.client.config.ts`, `apps/web/sentry.server.config.ts`, and `apps/web/sentry.edge.config.ts`. Store DSN in env var `NEXT_PUBLIC_SENTRY_DSN`. Configure source maps upload on production deploy via Vercel integration or build-time script. Set up Sentry alert rules in dashboard: notify Jeremy via email when error rate exceeds 1% in any 5-minute window, when any new error type appears in production, when verdict generation fails more than 5 times in an hour. Wrap critical server actions with Sentry context tags using `Sentry.withScope()` so errors are attributable: verdict generation route, Stripe webhook handler, Scout message endpoint, Clerk webhook handler. Test the integration by triggering a deliberate error in dev and confirming it appears in Sentry dashboard within 30 seconds. Document the Sentry setup in `docs/runbooks/error-monitoring.md`.
>
> After this milestone, every production error is captured. M9.3 admin operations view will read from Sentry's API to display recent errors in the admin console — but Sentry's own dashboard is the primary surface until then.

### Phase 1 — Foundation

Establish the shared design system primitives that every later phase depends on. This phase has no user-visible changes initially — it lays the groundwork.

**M1.1** — Brand token verification + design system primitives
> Audit `apps/web/lib/brand-tokens.ts` against the mockup color set, add any missing tokens, ensure all 22 mockups can be implemented with these tokens. Confirm `globals.css` HSL variables match the brand tokens. Add `Sidebar`, `Avatar`, `Badge` (with variants for accent/count), `Toggle`, `Chip` (variant: filter, status), and `GlanceTile` shared components. No route changes.

**M1.2** — Database schema migration: onboarding fields
> Add migration for `users` table: `intent_segment`, `strategy_focus`, `target_markets`, `deal_range`, `onboarding_completed_at`. Backfill existing users with `onboarding_completed_at = NOW()` so they skip the flow. No UI changes.

**M1.3** — Authenticated layout: sidebar shell
> Replace the current top-bar nav (`AppNav`) with the full sidebar pattern from mockups. The sidebar lives at `apps/web/components/sidebar.tsx`. Update `apps/web/app/app/layout.tsx` to use grid layout. Sidebar navigation items match mockup. Routes for items that don't yet exist render a temporary "Surface coming in M3+" placeholder page. After this milestone the app feels different but works the same.

### Phase 2 — Public surfaces

Public-facing pages: landing, pricing, legal, help, plus comprehensive SEO/GEO optimization. These are what unauthenticated visitors see and what search engines and AI assistants discover.

**M2.1** — Landing page (mockup #01)
> Replace `apps/web/app/page.tsx` with the rich landing from mockup 01: hero "Paste any address. Know the verdict.", hero demo frame, 3-step explainer, Anatomy of a Verdict section, founder quote, 2-tier pricing preview ($20 + $40), final CTA, rich footer. Keep `<PublicNav>` component for header. Footer must include links to /pricing, /help, /terms, /privacy, /cookies. Mobile responsive. SEO/GEO optimization happens in M2.4 — for this milestone, just match the design.

**M2.2** — Pricing page (mockup pricing section, full)
> Replace `apps/web/app/pricing/page.tsx` with detailed pricing comparison: 2 tiers, feature comparison table, FAQ section, both CTAs route to Stripe checkout (existing flow). Footer matches landing.

**M2.3** — Legal + Help pages
> Build four content pages: `/terms` (Terms of Service), `/privacy` (Privacy Policy), `/cookies` (Cookie Policy), `/help` (FAQ + Getting Started). All four use a simple shared layout: PublicNav at top, max-width content column with proper typography (Geist serif headings, comfortable line-height, generous spacing), footer with links to other legal pages and contact info.
>
> **Terms of Service** content covers (at minimum): acceptance of terms, account requirements, subscription billing terms (monthly auto-renewal, cancellation policy, refund policy — propose 7-day refund for first subscription only), AI-generated content disclaimer (verdicts are informational, not financial advice, not a substitute for professional real estate or legal counsel), limitation of liability, intellectual property (user retains rights to their property data; DwellVerdict retains rights to verdicts and platform), termination clauses, dispute resolution (arbitration in California unless prohibited), governing law (California), changes to terms.
>
> **Privacy Policy** content covers (at minimum): what data is collected (account info via Clerk, payment info via Stripe — never stored by us, property addresses entered by user, verdict generation history, Scout conversation history, usage analytics), how data is used (service delivery, AI training is NOT performed on user data, billing, support, product improvement, security), data sharing (Stripe for payments, Clerk for auth, Anthropic for AI processing — note that Anthropic's data handling is governed by their own policies, Apify for property data scraping, Vercel/Neon for hosting), user rights (access, deletion, export — match what M8.1 settings landing offers), cookies and tracking, data retention, security practices, children's privacy (13+, COPPA compliance), CCPA-specific rights for California residents, GDPR-specific rights if EU users present, contact info for privacy questions.
>
> **Cookie Policy** content covers: what cookies are used (Clerk session, Stripe payment processing, analytics — Plausible if added in M2.4, no advertising cookies), why each cookie is used, how to opt out.
>
> **Help / FAQ** content covers (at minimum these questions): "How do verdicts work?" (high-level explanation of the 4 domains), "How accurate are the verdicts?" (honest answer: AI-generated, informational, accuracy varies by data availability, not financial advice), "What does each plan include?" (feature-by-tier breakdown), "How do I cancel my subscription?" (link to Settings → Billing), "Can I get my data exported?" (yes, via Settings → Account → Data export), "What data sources do you use?" (Zillow, Redfin, AirDNA, Census, FEMA, regulatory data — be transparent), "How does Scout work?" (AI assistant grounded in your property data), "What's the refund policy?", "How do I contact support?" (email: support@dwellverdict.com), "Is my financial data secure?" (Stripe handles payments; we never store card numbers), "Will my property data be used to train AI?" (no — confirm with Anthropic ToS), "What if a verdict is wrong?" (feedback mechanism + we improve over time).
>
> All legal content uses standard SaaS templates customized for DwellVerdict's specific use case: AI-generated content with appropriate disclaimers, financial-adjacent product (informational only, not financial advice), real estate decision support, user data storage, third-party AI processing (Anthropic), third-party data sources (Apify, Zillow). Include a "Last updated" date on each legal page. Add a banner at the top of legal pages noting "These templates are based on standard SaaS legal patterns and have not been reviewed by an attorney. Plan to engage legal counsel before crossing $50K ARR or processing material data volumes." (This banner is for Jeremy's reference; remove before public launch if desired.) Footer email: legal@dwellverdict.com.

**M2.4** — SEO + GEO optimization
> Comprehensive search and generative-engine optimization across all public pages (landing, pricing, help, legal). Add structured data (JSON-LD) appropriate to each page: Organization schema on landing, Product schema on pricing, FAQPage schema on /help and /pricing FAQ section, Article schema on legal pages. Add per-page meta optimization: unique title tags (under 60 chars), unique descriptions (under 160 chars), canonical URLs, OpenGraph tags (og:title, og:description, og:image, og:url, og:type), Twitter Card tags (twitter:card, twitter:title, twitter:description, twitter:image). Build a designed OG share image (1200×630px) for landing page social sharing — terracotta + ink + verdict tagline. Generate `/sitemap.xml` automatically from the routes (use Next.js built-in sitemap generation). Create `/robots.txt` allowing all crawlers, pointing to sitemap. Install Plausible Analytics (or Google Analytics 4 if Jeremy prefers — Plausible is privacy-friendly, lightweight, ~$9/month — Plausible recommended) with the script tag in the public layout. Optimize landing page content for generative engines: clear topical authority via H1/H2 hierarchy, FAQ-style content blocks (AI engines cite these), explicit answers to questions a real estate investor might ask an AI ("what makes a property a good short-term rental investment", "how do I evaluate a vacation rental property", "what are the regulatory risks of owning an STR"). Run Lighthouse on the landing page and confirm Performance score >85, SEO score >95, Accessibility score >90 — if any score is below threshold, fix before merge. Verify OG cards render correctly using opengraph.xyz or similar.

**M2.5** — Marketing positioning refresh (NEW in v1.8)
> Update landing page (M2.1) and pricing page (M2.2) marketing copy to reflect end-to-end platform positioning rather than verdict-first framing. Per the v1.8 master plan reframe: verdicts are the lead-gen hook, the platform is end-to-end real estate guidance.
>
> **Landing page changes:**
> - Update hero: keep "Paste any address. Know the verdict." headline (it works), but expand the subhead/explainer to communicate platform vision. New subhead reads roughly: "The verdict is just the start. DwellVerdict guides you through buying, renovating, managing, and optimizing — including the tax strategies most investors miss."
> - Add a new section between three-step explainer and Anatomy of Verdict: "Beyond the verdict — your complete real estate co-pilot." Lists the 9 platform pillars with brief descriptions and visual treatment. Each pillar links to relevant lifecycle stage or tax strategy preview if user signs in.
> - Update Anatomy of Verdict section to acknowledge it as "step one of your journey" not "the destination."
> - Update pricing preview to emphasize platform value, not just verdict count.
> - Add a "Why investors choose DwellVerdict" section showcasing the integrated journey (verdict → buy → renovate → tax-optimize → manage).
> - Update final CTA: "Start with a verdict. Stay for the platform."
> - Update meta description and OG copy to reflect platform positioning.
>
> **Pricing page changes:**
> - Update tier descriptions to emphasize platform features, not just verdict access. DwellVerdict $20 includes "lifecycle stages (buying, renovating, managing) + tax strategy guidance + Scout AI questions"; Pro $40 adds "Compare, Briefs, Alerts, Portfolio dashboard, advanced tax strategy."
> - Expand FAQ to address platform questions: "What does DwellVerdict do besides generate verdicts?", "How does tax strategy work?", "Can I track my whole portfolio?", "Do I get help during renovation?".
> - Comparison table reflects platform features, not just verdict limits.
>
> **Founder quote** in landing page should reference the platform vision (rough draft: "I built DwellVerdict because every real estate decision touches twenty other decisions. The verdict tells you whether to buy. Then you have to actually buy it, renovate it, optimize the taxes, manage it, and decide what's next. We're the platform that walks you through all of it.").
>
> **Reasonable scope discipline:** Don't redesign visual treatment, just update copy. Don't add new sections that require new components; reuse the existing landing/pricing component structure. Update metadata (titles, descriptions, OG) consistently with platform positioning.
>
> **Production verification:** Visit dwellverdict.com after deploy. Read the landing page top to bottom. Confirm platform messaging is clear and consistent. Confirm pricing page reflects platform features. Verify OG card on opengraph.xyz updates correctly. Mobile readability check at 380px.

### Phase 3 — Verdict surfaces

The core product: how users go from address to verdict to evidence. This phase opens with the AI cost optimization foundation (M3.0) — every milestone after this one consumes those abstractions rather than calling Anthropic directly.

**M3.0** — AI cost optimization foundation
> Build the architectural foundation for cost-optimized AI usage that every later milestone depends on. Three new abstractions in `apps/web/lib/ai/`: `model-router.ts` (classifies request type and picks Haiku vs Sonnet vs Opus), `cache-helpers.ts` (wraps Anthropic SDK with prompt caching markers and TTL management), `batch-client.ts` (queues non-real-time AI operations through the Anthropic Batch API for 50% savings). Add `ai_usage_events` schema migration for per-call cost tracking. Add a `user_monthly_ai_spend(userId, month)` helper for cost-cap logic. Refactor existing AI code paths (verdict generation, Scout chat) to route through these abstractions — without changing behavior yet, just plumbing. Hard rule: no direct Anthropic SDK calls anywhere in the codebase outside these abstractions after this milestone ships.

**M3.1** — Address input refresh (mockup #03)
> Update the address input on `/app/properties` to match mockup 03 exactly. Preserve existing `AddressAutocomplete` component logic. Visual changes only.

**M3.2** — Streaming verdict generation (mockup #04) + cost optimization
> Refactor `/api/verdicts/[id]/generate/route.ts` from polling to streaming via Server-Sent Events. Add `verdict_events` table. Each domain emits events as Scout completes them. New client component `VerdictStreamLoader` consumes the SSE stream and animates evidence cards filling in. Use the `model-router.ts` from M3.0 to route domain sub-calls (regulatory, comps, sentiment) to Haiku 4.5 while keeping verdict synthesis on Sonnet 4.6. Use `cache-helpers.ts` to mark the static system prompt portions with `cache_control: { type: 'ephemeral' }` and 5-minute TTL — caches reused across the 4 domain calls. Preserve all existing FHA lint logic, prompt caching, cost tracking. Track cost per call in `ai_usage_events`.

**M3.3** — Verdict detail page (v4 mockup, the centerpiece)
> Rebuild `/app/properties/[propertyId]/page.tsx` to match the v4 verdict mockup exactly. Hero with verdict dial + signal chip + confidence + headline. Hero metrics strip. Evidence grid (4 cards). Scout's Analysis narrative section in serif type. Right rail with verdict run history + soft paywall states for locked content. Add a small thumbs up/down feedback control near the bottom of the verdict (after Scout's Analysis) — clicking either thumb reveals an optional "tell us more" text input. Posts to a new `/api/verdicts/[id]/feedback` server action that writes to `verdict_feedback` table (schema in master plan § AI quality feedback). Feedback is unobtrusive: small, easy to skip, never required to access other features.

**M3.4** — User-level onboarding intent (REVISED in v1.8)
> New route `/onboarding/intent` shown to users who haven't completed onboarding. 4-card segment selection (investor / shopper / agent / exploring), strategy multi-select (STR / LTR / house-hacking / flipping / owner-occupied), target markets, deal range. On submit, write to user record (M1.2 schema columns) and route to `/app/properties`.
>
> **Revised purpose (v1.8):** User-level onboarding captures investment focus that PRE-FILLS per-property thesis intake forms (M3.5). Reduces friction for investors evaluating many properties with consistent thesis. Schema columns from M1.2 (`intent_segment`, `strategy_focus`, `deal_range`) finally get used.
>
> Sequence note: M3.4 ships AFTER M3.5/M3.6/M3.7 because user-level data is most useful AFTER per-property intake exists.

**M3.5** — Property thesis + intake form (NEW in v1.8)
> The most important Phase 3 milestone. Build a comprehensive intake form that captures investment thesis + verified data inputs for every new property. Per the v1.8 master plan reframe, this intake is the foundation of the platform's user data — every subsequent surface (verdict, lifecycle stages, tax strategy, what-if calculator, briefs, portfolio dashboard) reads from this data.
>
> **Schema additions to `properties` table:**
> - `thesis_type` (text, CHECK: 'str' / 'ltr' / 'owner_occupied' / 'house_hacking' / 'flipping' / 'other')
> - `goal_type` (text, CHECK: 'cap_rate' / 'appreciation' / 'both' / 'lifestyle' / 'flip_profit')
> - `listing_price` (integer, cents) — user-input, fetched from Zillow listing
> - `user_offer_price` (integer, cents, nullable) — what the user plans to offer
> - `estimated_value` (integer, cents) — Zestimate / Redfin estimate / appraisal
> - `year_built` (integer)
> - `bedrooms` (decimal)
> - `bathrooms` (decimal)
> - `square_footage` (integer)
> - `lot_size_sqft` (integer)
> - `annual_property_tax` (integer, cents)
> - `annual_insurance_estimate` (integer, cents)
> - `monthly_hoa_fee` (integer, cents, nullable)
> - For STR: `expected_nightly_rate` (integer, cents), `expected_occupancy` (decimal, 0-1), `cleaning_fee_per_stay` (integer, cents), `average_length_of_stay` (integer, days)
> - For LTR: `expected_monthly_rent` (integer, cents), `vacancy_rate_assumption` (decimal, 0-1), `expected_appreciation_rate` (decimal, 0-1)
> - For owner-occupied: `down_payment_percent` (decimal, 0-1), `mortgage_rate` (decimal, 0-1), `mortgage_term_years` (integer), `renovation_budget` (integer, cents, nullable)
> - `intake_completed_at` (timestamptz, nullable) — null until form fully submitted
>
> **Form flow:**
>
> User submits address (M3.1) → form opens BEFORE verdict generation:
>
> 1. **Thesis selection.** 6 cards: STR (vacation rental), LTR (long-term rental), Owner-occupied, House hacking, Flipping, Other. Pre-filled from user-level onboarding data if present. User selects one.
> 2. **Goal selection.** Conditional on thesis: STR/LTR shows cap rate / appreciation / both; Owner-occupied shows lifestyle / appreciation / both; Flipping shows flip profit. User selects one.
> 3. **Property fundamentals.** Year built, beds/baths, square footage, lot size. Each field includes guidance ("Find this on the Zillow listing 'Facts & features' section"). User confirms each.
> 4. **Pricing data.** Listing price, estimated value, optional user offer price. Each field includes guidance ("Open Zillow → copy 'Listed at $X'"). User can skip any field but sees "this affects verdict accuracy" warning.
> 5. **Cost data.** Property tax, insurance estimate (with regional guidance — California fire-prone areas $3K-8K/year; safe areas $1K-2K), HOA fees if applicable. Insurance guidance includes link to "Get a quick quote with Lemonade or Geico (60 seconds)" with disclosure these are referrals.
> 6. **Thesis-specific inputs.** Conditional on thesis selection. STR sees nightly rate / occupancy / cleaning fee. LTR sees expected rent / vacancy / appreciation. Owner-occupied sees down payment / mortgage. Each includes guidance and reasonable defaults.
> 7. **Review and confirm.** Single screen showing all entries with "edit" links per section. User submits. Property record updated with `intake_completed_at = NOW()`.
> 8. **Verdict generation triggers automatically** with intake data flowing as inputs.
>
> **Form UX requirements:**
> - Progress indicator showing 7 steps
> - Each step uses guided input pattern: clear instructions + verification checkbox + impact note
> - User can save and resume (intake_completed_at = null until submit)
> - Skip individual fields with "I'll provide this later" option, but warn it impacts verdict
> - Mobile-responsive (380px → desktop)
> - Preserves existing M3.1 address input as step 0
>
> **Backfill for existing 5 production properties:**
>
> Add a backfill migration that sets thesis_type and goal_type for Jeremy's existing properties:
> - 41 Maywood Ct (Roseville) — LTR, both (cap rate + appreciation, breakeven monthly target)
> - 207 Corte Sendero (Lincoln) — Owner-occupied, appreciation
> - 295 Bend Ave (Kings Beach) — STR, both (cap rate + appreciation)
> - The other 2 properties — Jeremy will provide thesis values; until then, set thesis to NULL and require intake completion before next verdict regeneration
>
> Existing properties will have most other fields NULL. Future verdict regenerations on existing properties prompt user to complete intake form first.
>
> **Reasonable scope discipline:**
> - Don't ask for what we can't use yet (e.g., no need for renovation tracking inputs in M3.5 — those go in M5.2)
> - Don't ask for redundant data (if user provides listing price + year built, derive purchase year if/when needed)
> - Don't gate verdict generation on optional fields; only thesis_type is hard required
>
> **Production verification:** Create a new test property end-to-end. Step through all 7 form steps. Verify all data persists to property record. Trigger verdict generation, confirm intake data flows through. Test thesis pre-fill from user-level onboarding (after M3.4 ships, retest). Mobile flow verification.

**M3.6** — User-input data architecture for verdict generation (NEW in v1.8)
> Wire intake form data (M3.5) into verdict generation. Per the v1.8 user-input data architecture decision, the verdict engine sources critical data from user input rather than scraped APIs.
>
> **Scope:**
>
> Update `apps/web/lib/verdict/orchestrator.ts` to read from `properties` row's intake fields BEFORE attempting any external fetcher. Specifically:
> - Listing price → from `properties.listing_price` (replaces failed Zillow listPrice)
> - Estimated value → from `properties.estimated_value` (replaces failed Zillow Zestimate / Redfin estimate)
> - Expected revenue → from `properties.expected_nightly_rate * expected_occupancy * 365` for STR, or `expected_monthly_rent * 12` for LTR
> - Expense estimates → property tax + insurance + HOA from intake
>
> External fetchers (Zillow, Redfin, Airbnb scrapers) become OPTIONAL enrichment, not critical path. If they succeed and confirm user input within reasonable variance, log "verified" status. If they fail or contradict, prefer user input but log the discrepancy for future review.
>
> Update `packages/ai/src/scoring.ts` to consume user-input values as primary inputs. The `referencePrice` field (used for cap rate calculation) becomes `listing_price ?? user_offer_price ?? estimated_value` from the intake, not from scraper.
>
> Update `packages/ai/src/tasks/verdict-narrative.ts` v2 prompt to:
> - Include intake-provided thesis context ("This property is being evaluated as a [thesis_type] with goal [goal_type]")
> - Include user-provided pricing in the context
> - Include user-provided revenue assumptions in the context
> - Note when user input was used vs. enriched from scraper
>
> **Production verification:** Regenerate verdicts on Jeremy's 3 existing properties (after M3.5 backfill). Verify verdicts now include real listing prices, real revenue projections (from intake), and thesis-aware narrative framing. Compare to pre-M3.6 verdicts to confirm meaningful improvement.

**M3.7** — Free fetcher diagnostics & repair (NEW in v1.8)
> Diagnose and fix the broken free public APIs that are currently failing in production. Per the audit conducted before this milestone, FEMA flood, USGS wildfire, Census ACS, and county records (where applicable) should all be working but are at 100% failure rate.
>
> **Investigation scope:**
>
> For each broken fetcher in `packages/data-sources/src/`:
> 1. Determine the failure mode (auth issue, API change, rate limit, parse error, timeout)
> 2. Test against fresh requests to verify current API state
> 3. Fix what's fixable (most likely auth, headers, or response parsing)
> 4. Document any genuinely broken or deprecated APIs and propose alternatives
>
> **Specific fetchers to investigate:**
>
> - **FEMA flood zones** — National Flood Hazard Layer API. Free public API. Critical for Florida/Gulf Coast/coastal properties.
> - **Census ACS** — American Community Survey via Census API. Free with API key. Provides demographic context.
> - **USGS wildfire** — already partially working but spotty. Verify reliability.
> - **County records (selective)** — If quick wins exist for high-traffic states (CA, FL, TX), wire them up. Don't try to support every county; pick high-leverage ones.
>
> **Out of scope (this milestone):**
>
> - Fixing Zillow / Redfin scrapers (handled by M3.6 user-input fallback)
> - Fixing Airbnb scraper (same)
> - Adding paid integrations (deferred to post-launch revenue triggers)
>
> **Production verification:** Regenerate a verdict on Bend Ave (Kings Beach, near Tahoe — should have flood zone data, wildfire risk). Verify FEMA, Census, USGS data populate the verdict. Compare to pre-M3.7 verdict (where these were all empty).

**M3.8** — Thesis-aware scoring with regional risk awareness (NEW in v1.8)
> Update verdict scoring rubric to be thesis-aware AND regional-risk-aware. This is the biggest scoring change since the engine was built.
>
> **Scope:**
>
> Update `packages/ai/src/scoring.ts` to accept `thesis_type` and `goal_type` from the property record. Implement rubric weights as a 2D table indexed by `{thesis} × {region}` with default fallback when no specific override exists.
>
> **Thesis-specific weight examples:**
>
> | Rule | STR Destination | STR Urban | LTR Residential | Owner-occupied |
> |------|----------------|-----------|-----------------|----------------|
> | Walk Score | Low (5%) | High (15%) | Moderate (10%) | High (15%) |
> | Schools | Off (0%) | Off (0%) | High (20%) | High (25%) |
> | Proximity to attractions | Critical (25%) | Moderate (10%) | Low (5%) | Low (5%) |
> | Cap rate vs price | Critical (20%) | Critical (20%) | Critical (20%) | Off (0%) |
> | Seasonality | Critical (15%) | Low (5%) | Low (0%) | Off |
> | Crime | Moderate (10%) | High (15%) | High (20%) | Critical (25%) |
> | Permitting/regulatory | Critical (20%) | Critical (20%) | Lower (10%) | Lower (5%) |
>
> Note: percentages are illustrative — actual weights to be calibrated.
>
> **Regional risk overrides:**
>
> When property is in a specific risk region, additional rule weights apply on top of thesis weights:
> - California: wildfire risk weight +15%, insurance cost factor multiplier 1.5x
> - Florida: hurricane + flood weight +20%, flood insurance separate factor
> - Gulf Coast (TX/LA/AL/MS): hurricane + flood +15%
> - Tornado Alley: wind/storm risk +10%
> - Mountain West: wildfire + winter storm +10%
> - Pacific Northwest: earthquake + wildfire +5%
>
> Implementation: a `region_risk_factor(state, county_or_zip)` helper returns the active risk overrides. Combined with thesis weights via simple addition.
>
> **Listing price as first-class metric:**
>
> Update v2 narrative tool schema to include:
> - `evidence.pricing.metrics.listing_price` (cents)
> - `evidence.pricing.metrics.estimated_value` (cents)
> - `evidence.pricing.metrics.user_offer_price` (cents, nullable)
> - `evidence.pricing.metrics.price_to_value_ratio` (decimal)
> - `evidence.pricing.summary` (string, narrative explanation of price context)
>
> A new "Pricing" evidence card displays alongside the existing 4 (Comps, Revenue, Regulatory, Location), making it 5 cards total.
>
> **Existing verdict migration:**
>
> Mark all existing verdicts as `legacy_rubric: true`. Render them with a small "Legacy verdict — regenerate for thesis-aware analysis" prompt at the top. Don't auto-regenerate (cost concern). Let user opt in.
>
> **Production verification:** Regenerate Kings Beach verdict (STR in CA fire zone) — wildfire weight should be high, insurance cost should factor heavily, low Walk Score should NOT drop the verdict significantly because STR destination thesis. Regenerate Roseville (LTR in CA suburbs) — wildfire moderate, schools and neighborhood quality matter more. Verify the verdicts feel meaningfully different in their reasoning.

**M3.9** — What-if calculator (NEW in v1.8)
> Build a "what-if" mode users enter from the verdict detail page. Lets users adjust the inputs they provided in M3.5 to stress-test the verdict.
>
> **Scope:**
>
> New route `/app/properties/[propertyId]/verdicts/[verdictId]/what-if` (or modal/sheet on the verdict page, designer's call).
>
> Adjustable inputs:
> - Listing price (test "what if I offer $50K below asking")
> - User offer price
> - Expected nightly rate (STR) / monthly rent (LTR)
> - Expected occupancy (STR)
> - Vacancy rate assumption (LTR)
> - Property tax (test "what if reassessed higher")
> - Insurance estimate (test "what if California fire premiums go up")
> - HOA fees (if applicable)
> - Down payment % (owner-occupied)
> - Mortgage rate (test "what if rates rise")
> - Renovation budget (if applicable)
> - Expected appreciation rate
>
> User adjusts any combination of inputs. Verdict signal/confidence/narrative recompute on the fly using `scoring.ts` directly (no AI call needed for what-if — uses the same scoring rubric M3.8 implements).
>
> User can save what-if scenarios as named entries on the property ("Aggressive offer at $25K below", "Insurance doubles", "Cancel STR strategy → LTR").
>
> **What's not in scope:**
>
> - Triggering AI narrative regeneration based on what-if inputs (uses cached narrative + flags as "what-if")
> - Persisting what-if scenarios to a separate table (uses property record JSON field for v1)
> - Sharing what-if scenarios with collaborators (post-launch)
>
> **Production verification:** Open Kings Beach verdict, click "What-if". Adjust nightly rate from $400 → $300 and verify cap rate calculation updates. Test thesis change (STR → LTR) and verify rubric reapplies. Save scenario, navigate away and back, confirm scenario persists.

### Phase 4 — Property surfaces

Cross-property views and the property list.

**M4.1** — Dashboard route (mockup #05)
> New route `/app/dashboard`. Becomes default redirect after sign-in. Activity feed query on verdicts + property_stages + alert_events. Right rail: 3 alerts, Scout tip, Pipeline by stage. Hero greeting. Empty state for users with no properties.

**M4.2** — Properties list (mockup #06)
> Refactor `/app/properties` to match mockup 06: glance metrics row, filter bar, table view + cards view toggle. Preserve inline address paste box at top.

**M4.3** — Verdicts cross-property view (mockup #09)
> New route `/app/verdicts`. Cross-property verdict list grouped by date or property. Run badges, signal chips, mini confidence rings, evidence pills.

**M4.4** — Compare view (mockup #10)
> New route `/app/compare`. Side-by-side comparison of 2-4 properties (Pro tier). Property chip management. Domain-by-domain comparison rows. Winner highlighting. Scout-generated recommendation at bottom.

### Phase 5 — Lifecycle stage pages + Tax strategy

The 3 lifecycle stage pages plus dedicated tax strategy surfaces. **Per v1.8 master plan reframe, this phase is now CORE PRODUCT, not a "light treatment" afterthought.** Each lifecycle stage delivers substantive workflow tools that justify the platform's value beyond the verdict.

**M5.1** — Buying lifecycle stage (mockup #14, expanded scope in v1.8)
> Rebuild `/app/properties/[propertyId]/buying/page.tsx` as a substantive workflow surface for users in the buying process.
>
> **Sections:**
>
> 1. **Hero row (from mockup):** Countdown to next milestone, deal progress bar, closing budget burn.
>
> 2. **Offer planning toolkit:**
>    - Offer calculator (suggested offer based on verdict + user price preferences)
>    - Counter-offer scenarios (what-if integration from M3.9)
>    - Inspection contingency tracker
>    - Financing contingency tracker
>    - Estimated closing costs breakdown
>
> 3. **Due diligence checklist (thesis-aware):**
>    - For STR: title check, HOA verification, STR permit verification, insurance quote validation, lender pre-approval for non-owner-occupied financing, comp validation, regulatory deep-dive
>    - For LTR: title check, tenant rights review (state-specific), security deposit limits, vacancy assumptions validation
>    - For owner-occupied: title check, structural inspection, HOA review, neighborhood walk-through
>
> 4. **Vertical milestone timeline + notes feed** (from mockup): user adds notes per milestone, status updates trigger reminders.
>
> 5. **Contacts grid** (from mockup): agent, lender, inspector, attorney, contractor; CRUD interface.
>
> 6. **Closing budget table** (from mockup): line items + actual vs. estimated, runs into Renovating stage budget if user proceeds.
>
> 7. **Cost segregation pre-planning (NEW):** If property qualifies (5+ unit residential, commercial, or STR with operating intent), surface a "Cost segregation eligible" callout linking to M5.4 tax strategy planning. Cost seg savings can be huge — surfacing the option here captures it before the user closes.
>
> 8. **Scout panel:** Quick-ask Scout questions like "Is this a fair offer?", "What contingencies should I include?", "What inspection issues are red flags for this property type?" Pulls property + verdict + intake context.
>
> Preserve existing CRUD server actions for property_stages, contacts, milestones. Add new server actions for offer planning, due diligence checklist state, cost-seg callout dismissal.

**M5.2** — Renovating lifecycle stage (mockup #15, expanded scope in v1.8)
> Rebuild `/app/properties/[propertyId]/renovating/page.tsx` as a substantive renovation tracking workflow.
>
> **Sections:**
>
> 1. **Hero row (from mockup):** Budget burn donut, overdue tasks, days remaining.
>
> 2. **Scope items + tasks list (from mockup, expanded):** Each scope item has tasks, contractor assignment, estimated and actual cost, completion percentage. Tasks roll up to scope item; scope items roll up to total project.
>
> 3. **Contractor management (from mockup, expanded):**
>    - Contractor profiles (license verification status, references, scope assignments)
>    - Quotes received per scope item
>    - Payment schedule tracking
>    - Lien waivers tracking
>
> 4. **Cost segregation activation (NEW, integrated):**
>    - "Activate cost segregation" CTA on the page if property qualifies
>    - Walks user through the steps: hire cost-seg study firm, identify eligible items, produce study report, file Form 3115 with tax return
>    - Surfaces estimated tax savings based on renovation budget
>    - Links to M5.4 tax strategy for portfolio-level coordination
>    - Out of scope to AUTOMATE the study (requires CPA/firm); in scope to GUIDE through the process
>
> 5. **Renovation timeline:** Gantt-style or simplified timeline with milestone dependencies.
>
> 6. **Material/fixture decisions log:** Track choices for taxes, appraisal, depreciation later.
>
> 7. **Progress photos:** Simple upload/timeline (not a full project management tool, just enough for record-keeping).
>
> 8. **Scout panel:** "Is this contractor quote reasonable?", "What permits do I need for this scope?", "Should I capitalize or expense this?" with property + scope context.
>
> Preserve existing CRUD. Add cost-seg planning state, contractor management table, photo storage.

**M5.3** — Managing lifecycle stage (mockup #16, expanded scope in v1.8)
> Rebuild `/app/properties/[propertyId]/managing/page.tsx` as a substantive operational tracking surface.
>
> **Sections:**
>
> 1. **Hero row (from mockup):** Revenue gauge, occupancy %, ADR (or monthly rent for LTR).
>
> 2. **PMS connection status (from mockup):** Existing PMS integrations + manual entry option.
>
> 3. **P&L strip (from mockup, expanded):** Monthly revenue, expenses by category, net cash flow, year-to-date, comparison to projected (from M3.5 intake assumptions).
>
> 4. **Reservations list (STR-specific) or rent roll (LTR-specific):** From mockup, expanded with status tracking.
>
> 5. **Schedule E roll-up (from mockup):** Tax-ready P&L organized by Schedule E line items. Exports to CSV for tax prep.
>
> 6. **Recent expenses (from mockup, expanded):**
>    - Categorized by IRS expense type
>    - Receipts attached
>    - Capitalized vs expensed flag for renovation continuation
>
> 7. **Ongoing tax tracking (NEW):**
>    - Depreciation schedule visualization (if cost seg done in M5.2)
>    - Tax-loss harvesting opportunities (if multiple properties)
>    - Estimated tax bill at current pace
>    - Links to M5.5 tax strategy ongoing optimization
>
> 8. **Performance vs. projection:** Compares actual revenue/expenses to user-provided assumptions in M3.5 intake. Flags significant variances. "You projected $525 ADR; actual is $487. Want to update assumptions for the verdict?"
>
> 9. **Scout panel:** "Why was occupancy low last month?", "Should I raise nightly rate?", "What expense categories am I missing?" with operational context.
>
> Preserve CSV import + existing CRUD. Add tax tracking schema, performance comparison, expense categorization.

**M5.4** — Tax strategy: per-property surface (NEW in v1.8)
> New route `/app/properties/[propertyId]/tax-strategy/page.tsx`. Per-property tax strategy guidance, complementing the cross-cutting tax content embedded in M5.1-M5.3.
>
> **Sections:**
>
> 1. **Strategy overview:** Lists tax strategies applicable to this specific property based on thesis, ownership status, and lifecycle stage.
>
> 2. **Cost segregation (highlighted for STR/commercial):**
>    - Eligibility check
>    - Estimated savings calculator
>    - When to do the study (during renovation typically)
>    - How to engage a firm (links to firms — disclose any referral relationships)
>    - Form 3115 filing reminder
>
> 3. **STR loophole (highlighted for STR):**
>    - Explanation: STR with avg stay <7 days + material participation = treated as non-passive, losses offset W-2 income
>    - Material participation tests (500 hours, 100 hours and most participation, etc.)
>    - Tracking template for material participation hours
>    - Example: bonus depreciation + cost seg + STR loophole stacked
>    - Common mistakes (passive without realizing it)
>
> 4. **Depreciation schedule (highlighted post-purchase):**
>    - 27.5-year residential straight-line baseline
>    - Cost seg-accelerated schedule (if applicable)
>    - Bonus depreciation eligibility
>    - Annual deduction projections
>
> 5. **1031 exchange planning (highlighted for sale planning):**
>    - Rules: like-kind, 45-day identification, 180-day completion
>    - Qualified intermediary recommendations
>    - Reverse 1031 considerations
>    - Boot consequences
>
> 6. **Section 199A (QBI) deduction:** When 20% pass-through deduction applies to rental income.
>
> 7. **Disclaimers:** Strong, clear, repeated. "This is educational content, not tax advice. Engage a CPA familiar with real estate tax strategy." DwellVerdict is NOT a tax advisor.
>
> 8. **Scout panel:** "What tax strategies apply to my Kings Beach STR?", "Do I qualify for the STR loophole?", "When should I do cost seg?" with property context.
>
> **Out of scope:**
> - Filing forms on user's behalf (we're not a tax preparer)
> - Specific dollar-amount tax projections (would require user's full income picture)
> - Connecting to QuickBooks or accounting software (post-launch)

**M5.5** — Tax strategy: portfolio-wide surface (NEW in v1.8)
> New route `/app/tax-strategy/page.tsx`. Portfolio-wide tax strategy view that complements per-property M5.4.
>
> **Sections:**
>
> 1. **Portfolio tax overview:** Total properties, tax classifications, current depreciation schedule, projected annual tax savings from current strategies.
>
> 2. **Strategy opportunities across properties:**
>    - Properties eligible for cost seg that haven't done it
>    - STR properties that haven't activated the STR loophole
>    - Properties approaching 1031 exchange windows
>    - Loss-harvesting opportunities (sell loss to offset gains elsewhere)
>
> 3. **Annual planning calendar:**
>    - Q1: Tax filing prep
>    - Q2: Mid-year review
>    - Q3: Cost seg studies for properties acquired this year
>    - Q4: 1031 identification windows, year-end purchase decisions
>
> 4. **Material participation tracker (cross-property):** For users with multiple STRs, total hours across properties to qualify for material participation.
>
> 5. **CPA/tax advisor coordination:** Generate a tax-strategy-summary PDF for sharing with the user's CPA. (M7.1 Briefs handles the actual PDF generation; M5.5 generates the content.)
>
> 6. **Educational content library:** Articles, calculators, examples covering each strategy.
>
> 7. **Scout panel:** Cross-property questions like "Which of my properties should I do cost seg on first?" or "Can I 1031 my Kings Beach STR into a multifamily?" with full portfolio context.

**M5.6** — Tax strategy: integration polish (NEW in v1.8)
> Cross-cutting integration milestone. Tax strategy lives in 3 places (M5.1 buying integration, M5.2 renovating integration, M5.3 managing integration, M5.4 per-property surface, M5.5 portfolio-wide surface). M5.6 ensures these are all discoverable, consistent, and well-cross-linked.
>
> **Scope:**
>
> 1. **Sidebar navigation:** Add "Tax Strategy" to the Workspace section of sidebar (M1.3 sidebar shell). Routes to /app/tax-strategy (M5.5).
> 2. **Property-level tax tab:** Each property page gets a "Tax Strategy" tab that surfaces M5.4 per-property surface.
> 3. **Lifecycle stage cross-references:** Buying stage links to M5.4 cost seg pre-planning; Renovating stage links to M5.4 cost seg activation; Managing stage links to M5.4 ongoing tax tracking.
> 4. **Verdict detail integration:** Verdict detail page (M3.3) gets a small "Tax considerations" section showing thesis-relevant strategies (STR → STR loophole highlighted; LTR → depreciation highlighted).
> 5. **Scout integration:** Scout AI (M6.1, M6.2) has access to tax strategy context for the property and portfolio.
> 6. **Onboarding hint:** User-level onboarding (M3.4) mentions tax strategy as a platform pillar.
>
> Reasonable scope discipline: M5.6 is mostly UI integration, not new functionality. The actual tax strategy logic ships in M5.4-M5.5.

### Phase 6 — AI surfaces

Scout chat — the AI conversation surfaces.

**M6.1** — Scout per-property (mockup #17) + cost optimization
> Refactor `/app/properties/[propertyId]/scout/page.tsx` to match mockup 17. Conversation thread with editorial greeting, message blocks, inline evidence cards, citation chips, live thinking states, per-message contextual actions. Right rail: Scout's context summary, cited sources, earlier conversations. Implement two-pass routing in `/api/scout/message`: first call goes to Haiku 4.5 via `model-router.ts`; if Haiku classifies the question as requiring complex reasoning, escalate to Sonnet 4.6 with same context. Use `cache-helpers.ts` to cache property context (verdict + evidence + recent messages) with 1-hour TTL on first message of a session. Re-evaluate tier limits at this milestone with conversion telemetry from prior milestones: current production is Scout-as-Pro-only with 30/day, 300/month caps; this milestone should determine whether to (a) keep Pro-only, (b) add small DwellVerdict demo allowance (~3/day), and (c) tighten Pro caps to 20/day, 200/month for tighter cost control. Implement monthly cost cap: when a user's `ai_usage_events` spend in current month exceeds $30, Scout degrades to Haiku-only with friendly notification. Track all costs in `ai_usage_events`. Add per-message thumbs up/down feedback (one of the per-message actions in the message footer, alongside Copy / Save to notes / etc.) — clicking writes to `scout_message_feedback` table (schema in master plan § AI quality feedback) with the model used for that message captured in the snapshot.

**M6.2** — Scout global view (mockup #18)
> New route `/app/scout`. Cross-portfolio Scout history. Hero ask block + composer + quick-ask chips. Search controls scoped by property. Date-grouped conversation list with property pills, snippets, tags, jump-back actions. Uses the same two-pass routing and tier limits from M6.1.

### Phase 7 — Workspace surfaces

Briefs and Alerts — the document and notification systems.

**M7.1** — Briefs system schema + base + Batch API
> Apply briefs migration. Build the 3-template generation system. PDF generation via `@react-pdf/renderer`. Briefs API endpoint at `/api/briefs/[id]/generate`. Save generated PDFs to Vercel blob storage. Use `batch-client.ts` from M3.0 to route brief content generation through the Anthropic Batch API for 50% cost savings (briefs are not user-real-time — show "generating" state with notification on completion). Use Haiku 4.5 via `model-router.ts` for templated content from existing data. Track costs in `ai_usage_events`.

**M7.2** — Briefs UI (mockup #11)
> New route `/app/briefs`. 3 states: list (table with template chips), template picker (3 cards + configure form), preview (PDF rendered in-frame with aside actions).

**M7.3** — Alerts system schema + rule engine + Batch API
> Apply alerts migration. Build alert rule engine that runs on Vercel Cron: checks `regulatory_cache`, `data_source_cache`, recent verdicts for changes matching active `alert_rules`. Generates `alert_events` rows with severity classification. Any AI evaluation calls (e.g., "is this regulatory change material?") use `batch-client.ts` for 50% savings — alert evaluation runs are inherently async. Track costs in `ai_usage_events`.

**M7.4** — Alerts UI (mockup #12)
> New route `/app/alerts`. 3 tabs: Inbox, Alert Rules, Delivery Settings.

**M7.5** — Portfolio dashboard (mockup #13)
> New route `/app/portfolio`. Time picker. 4 hero metrics with sparklines. Charts: revenue trend, verdict distribution donut, revenue seasonality heatmap, regulatory risk matrix, geographic distribution. Aggregations on-demand for v1; if performance demands it post-launch, move heavy aggregations to nightly batch via `batch-client.ts`.

### Phase 8 — Settings surfaces

Account, billing, integrations, notifications.

**M8.1** — Settings landing (mockup #19)
> New route `/app/settings`. Hub view with section cards showing live state, danger zone with export/pause/delete actions.

**M8.2** — Settings · Account (mockup #20)
> Refactor or build `/app/settings/account` with sub-nav pattern. Profile form, security card, investor profile. Sticky save bar.

**M8.3** — Settings · Billing & integrations (mockup #21)
> Refactor `/app/settings/billing` to match mockup 21. Plan hero with usage strip, payment method via Stripe portal, invoices, PMS integration cards, data source cards.

**M8.4** — Settings · Notifications (mockup #22)
> New route `/app/settings/notifications`. Apply notification_prefs schema migration. Master channel toggles, per-event matrix, quiet hours card.

### Phase 9 — Embedded admin console

Internal-only admin surfaces for Jeremy. Embedded in the existing app at `/admin/*` routes, gated by `users.is_super_admin = true`.

**Two non-negotiable rules govern every milestone in this phase:**

**Rule 1: Admin must be invisible to non-admins.** No customer should ever see, hear about, or be able to discover that admin functionality exists. This means:
- The admin sidebar section is absent from the rendered DOM for non-admins (not display:none, not hidden via CSS — actually not rendered at all)
- All `/admin/*` routes return HTTP 404 to non-admins, identical to any other non-existent route
- No admin-related strings, route paths, or UI hints in JS bundles served to non-admins (use server-side rendering or dynamic imports gated on the flag)
- No public documentation, marketing copy, or release notes ever reference the admin console
- Network requests, page source, and client bundles must be inspectable by a non-admin without revealing admin's existence

**Rule 2: Super admins have implicit Pro tier access.** Jeremy never needs a Stripe subscription to use his own product at the Pro tier. The flag `is_super_admin = true` automatically grants:
- All Pro features unlocked: Compare, Briefs, Scout at Pro limits, Portfolio, Alerts
- All quota gating bypassed (`consumeReport()` and similar functions check `is_super_admin` first and skip checks if true)
- A helper `getEffectiveTier(user)` returns `'pro'` for super admins regardless of actual subscription state; every gating check uses this helper instead of reading `subscription_tier` directly
- The Settings → Billing page renders gracefully even if no Stripe subscription exists (shows "Admin · full access" rather than an empty state)

The "live in one tab" framing: Jeremy is both a user and an admin. The admin section appears as an additional sidebar group at the bottom (below "Account · Settings"), labeled "Admin," visible only when `is_super_admin = true`. Inside admin views, the customer-facing nav remains clickable so Jeremy can switch between his own properties and admin views without leaving the tab.

**M9.1** — Admin foundation + Dashboard
> Add `is_super_admin` boolean column to users table (default false). Implement `getEffectiveTier(user)` helper at `apps/web/lib/auth/effective-tier.ts` that returns `'pro'` for super admins, otherwise returns the user's actual subscription tier. Refactor every existing tier-gating check in the codebase (the `consumeReport()` function, any `if user.tier === 'pro'` checks, Pro-feature middleware) to use this helper. Add admin auth gate as server-side middleware on all `/admin/*` routes: returns 404 to non-admins so the routes are indistinguishable from non-existent routes. Add admin sidebar section to `Sidebar` component as a conditionally-rendered group at the bottom — when `user.is_super_admin === false`, the admin section must be entirely absent from the rendered DOM (not hidden, not styled invisible, actually not in the output). Use server-side rendering or dynamic imports to ensure admin code is not in JS bundles served to non-admins.
>
> Build `/admin/dashboard` page: top-level KPIs (MRR from Stripe, ARR, total users by tier, net new users this period, churn count, Anthropic spend this month with delta vs last month, gross margin estimate, top 3 system alerts — pull recent error rate from Sentry API, which was set up in M0.3). Time picker (7D / 30D / 90D / YTD / All) using same pattern as customer-facing portfolio dashboard. Aggregations queried on-demand from existing tables — no admin-specific cache required for v1. After this milestone ships, manually update Jeremy's user record with `UPDATE users SET is_super_admin = true WHERE email = '<jeremy's email>'` (run via direct DB access — no admin endpoint that grants the flag, since that would be a critical security hole).

**M9.2** — Admin · Users + Cost analytics
> Build `/admin/users`: paginated table of every user with columns for name, email, signup date, plan tier, Stripe status, properties count, lifetime verdicts, Scout messages this month, Anthropic spend this month, Anthropic spend lifetime, margin this month (color-coded green/yellow/red), last active. Sortable, filterable. Click into user → individual user detail page at `/admin/users/[userId]` showing full activity timeline, properties, verdicts, briefs, scout conversations, and detailed cost breakdown by operation type. Build `/admin/costs`: total Anthropic spend chart (current month + trailing 12 months), spend by operation type breakdown, spend by model split (Sonnet / Haiku / Opus), top 20 users by cost with margin alongside, cache hit rate, batch API usage rate, cost per verdict trend, cost per Scout message trend. All queries hit `ai_usage_events` table from M3.0. All routes protected by the M9.1 admin auth gate.

**M9.3** — Admin · Revenue + Usage + AI Quality + Operations
> Build `/admin/revenue`: monthly revenue chart (last 12 months), new subscribers by tier this period, churn this period (downgrades + cancellations + failed payments), failed payment list, upcoming renewals next 30 days, lifetime revenue, ARPU by tier. Pulls directly from Stripe API (cache 1 hour to avoid rate limits).
>
> Build `/admin/usage`: verdicts generated per day chart (last 90 days), Scout messages per day, briefs generated per day, most-searched markets (county/city), verdict signal distribution (BUY / WATCH / PASS) lifetime, most active users leaderboard, feature adoption rates among Pro users (% using Compare, Briefs, Alerts, Scout).
>
> Build `/admin/quality`: AI quality dashboard. Verdict satisfaction rate (% helpful vs not helpful, last 30 days + lifetime). Satisfaction by signal type (are BUY verdicts more or less satisfying than WATCH/PASS?). Satisfaction by confidence band (do high-confidence verdicts feel more accurate? — split into 0-50, 50-70, 70-85, 85-100 bands). Recent negative feedback list with the user's free-text reason (last 50). Scout satisfaction rate by model (Haiku-handled vs Sonnet-escalated — does the cost-saving routing degrade quality?). Scout satisfaction by message classification (factual lookups vs complex reasoning). Recent Scout negative feedback list. All queries hit `verdict_feedback` and `scout_message_feedback` tables.
>
> Build `/admin/operations`: Sentry error feed (last 50 errors via Sentry API), Stripe webhook failures (from existing webhook log table or Stripe dashboard data), cron job health (alert engine + nightly rollups — log execution timestamps and durations to a new `cron_runs` table if one doesn't exist), DB connection pool utilization (via Neon API if available, otherwise skip), Anthropic API error rate (computed from `ai_usage_events` failures), Apify scrape success rate (computed from `data_source_cache` insert/error logs).
>
> All routes protected by the M9.1 admin auth gate.

---

## Milestone count summary (v1.8)

- Phase 0 — Operational foundation: 3 milestones (M0.1 email, M0.2 CI, M0.3 Sentry)
- Phase 1 — Foundation: 3 milestones
- Phase 2 — Public surfaces: 5 milestones (M2.1 landing, M2.2 pricing, M2.3 legal+help, M2.4 SEO+GEO, M2.5 marketing positioning refresh)
- Phase 3 — Verdict surfaces: 10 milestones (M3.0 cost optimization, M3.1 address input, M3.2 streaming, M3.3 verdict detail, M3.4 user onboarding, M3.5 property thesis intake, M3.6 user-input data architecture, M3.7 free fetcher repair, M3.8 thesis-aware scoring, M3.9 what-if calculator)
- Phase 4 — Property surfaces: 4 milestones
- Phase 5 — Lifecycle stages + Tax strategy: 6 milestones (M5.1 buying expanded, M5.2 renovating expanded, M5.3 managing expanded, M5.4 per-property tax, M5.5 portfolio tax, M5.6 tax integration polish)
- Phase 6 — AI surfaces: 2 milestones
- Phase 7 — Workspace surfaces: 5 milestones
- Phase 8 — Settings surfaces: 4 milestones
- Phase 9 — Embedded admin console: 3 milestones

**Total: 45 milestones (up from 36 in v1.6/v1.7).** Net additions in v1.8:
- M2.5 marketing positioning refresh (1 new)
- M3.5-M3.9 expanded Phase 3 (5 new)
- M5.4-M5.6 tax strategy (3 new)
- Plus M5.1-M5.3 expanded scope (same milestones, 2-3x the work each)

With autonomous Claude Code execution, estimated 50-70 hours of compute time, deliverable at Jeremy's pace of pasting prompts.

**Already shipped in this session (13 milestones):** M1.1, M0.2, M0.3, M0.1, M1.2, M1.3, M2.1, M2.2, M2.3, M2.4, M3.0, M3.1, M3.2, M3.3.

**Remaining to ship: 32 milestones.** Substantial but achievable at the pace Jeremy has demonstrated.

---

## Cross-cutting concerns

These apply to every milestone:

### Existing code preservation

The production app has working Stripe, Clerk, verdict generation, Scout chat, deal/renovation/management CRUD, address autocomplete, FHA lint, place sentiment, regulatory cache. **Every milestone preserves this work.** Refactor changes the UI layer and adds new surfaces. It does not rewrite the AI pipeline, billing logic, or auth.

When in doubt, prefer to extend or wrap existing code rather than rewrite. If existing code conflicts with a mockup design, Claude Code uses its judgment — the mockup is the design source of truth, but Stripe/Clerk/Anthropic integration code should not be rewritten without strong justification.

### Type safety

The repo uses TypeScript strictly. Every new component is typed. Every new server action uses Zod for input validation. Every new database query uses Drizzle's type inference.

### Mobile responsiveness

Mockups are designed for desktop (1200-1400px viewport). Each milestone must produce mobile-responsive results. Mobile breakpoints: 768px (tablet) and 480px (phone).

### Accessibility

Every interactive element gets keyboard navigation, focus states, and ARIA attributes. Color contrast meets WCAG AA. Form fields have proper labels.

### Tests

Test new utility functions, new server actions, and anything that could regress (verdict generation, Stripe checkout, auth). Skip exhaustive coverage. CI must be green to merge.

### Deploy safety

Every PR is deploy-safe to merge. No half-built UIs visible to users, no broken auth/billing. Pre-launch tolerance for minor visual bugs is high; tolerance for breaking the verdict pipeline or auth is zero.

### PR description format

Each Claude Code PR includes:
- Milestone reference (e.g. "M3.3 — Verdict detail page")
- Files changed summary
- Implementation notes (any decisions made beyond the spec)
- Known issues / deferred work
- Rollback command (`git revert <SHA>`) for emergency use

---

## Risks and mitigations

### Risk: Streaming verdict implementation is complex

M3.2 is the highest-risk technical milestone. Server-Sent Events with Anthropic streaming is non-trivial. If it stalls in CI repeatedly, fall back to incremental polling for v1 launch and revisit streaming post-launch.

### Risk: PDF brief generation has weight

M7.1 introduces PDF generation via `@react-pdf/renderer`. Server-side only. If complexity blooms, ship verdict_snapshot template first and defer offer_letter/portfolio_summary to v1.1.

### Risk: Alert rule engine cron complexity

M7.3 needs Vercel Cron for hourly checks. If custom rules get complex, ship the 6 template-based rules first and defer full custom rule support to v1.1.

### Risk: PMS OAuth integrations

If Hospitable/Guesty OAuth registration can't be completed pre-launch, ship M8.3 with manual API key entry and defer OAuth to v1.1.

### Risk: Autonomous merge breaking production

Pre-launch with no users, this risk is acceptable. Post-launch, this engagement model should be reconsidered — at that point, manual PR review for sensitive surfaces (Stripe, auth, billing) becomes worth the time cost.

---

## What's NOT in this refactor

To be explicit about scope:

- ❌ Email template redesigns
- ❌ Mobile native apps
- ❌ Browser extension
- ❌ Multi-org / team features
- ❌ White-labeling
- ❌ API/SDK for external integrations
- ❌ Internationalization
- ❌ Dark mode (variables exist, full implementation deferred)

These come post-launch.

---

## Done definition

The refactor is "complete" when:

1. All 36 milestones have shipped to production
2. dwellverdict.com matches the 22 mockups visually
3. All new schema migrations are applied
4. No "coming soon" placeholders remain
5. Jeremy has personally clicked through every surface end-to-end and confirmed it matches expectations

After completion, this becomes "v1" and the product is ready for broader launch.
