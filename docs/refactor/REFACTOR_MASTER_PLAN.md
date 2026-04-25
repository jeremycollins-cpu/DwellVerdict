# DwellVerdict Engineering Refactor — Master Plan

**Status:** Active · v1.5 · April 24, 2026
**Owner:** Jeremy Collins
**Engineering executor:** Claude Code (autonomous)
**Design reference:** 22 mockups in `/mnt/user-data/outputs/`

---

## What this document is

The single source of truth for the DwellVerdict UI refactor. Every milestone prompt for Claude Code references back to this plan. When trade-offs come up mid-refactor, this is where the answer lives.

**This document does NOT change without explicit revision** (versioned at top). If a milestone reveals a missing decision, we update the plan first, then write the prompt.

---

## North star

Transform the existing DwellVerdict production app — which has working backend, working verdict generation, working Stripe, working Clerk auth, working Scout — into the UI represented by 22 design mockups. The product itself is sound. We're rebuilding the visual layer, the navigation, and several net-new surfaces while preserving every working piece of the data + AI infrastructure.

**Quality bar:** World-class. No shortcuts. No "coming soon" placeholders. Every surface ships to production polished.

**Speed bar:** Pre-launch, no real users yet. Speed is prioritized over safety nets. Claude Code operates autonomously: opens PRs, runs CI, merges to main, deploys. Bugs get fixed forward. The optimization is "ship the v1 fast" not "zero defects."

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
- **DwellVerdict $20** — Full Regulatory + Location domains unlocked. Comps ADR visible. Comps revenue + Revenue projection gated.
- **Pro $40** — Everything unlocked. Scout chat (30/day, 300/mo). Compare. Briefs unlimited. Portfolio dashboard. Alerts.

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

Adjusted from current production:
- **DwellVerdict $20:** Scout limited to 3 messages/day, demo only
- **Pro $40:** 20 messages/day, soft cap at 200/month with smooth slowdown after
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

Critical infrastructure that must exist before user-facing work begins. These milestones establish email delivery, error monitoring, and other operational essentials. Without these in place, later phases either can't function (M7.3 alerts, M8.4 notifications) or ship without the safety net needed for production launch (no Sentry = no visibility into production errors).

**M0.1** — Email infrastructure (Resend)
> Set up Resend as the email provider. Create a Resend account at resend.com if not already created. Provision API key, store in env var `RESEND_API_KEY`. Configure DNS records on dwellverdict.com domain: SPF record, DKIM record (Resend provides), DMARC record. Verify domain in Resend dashboard. Set up `notifications@dwellverdict.com` and `hello@dwellverdict.com` as sending addresses. Install `resend` and `@react-email/components` npm packages. Create `apps/web/lib/email/client.ts` (Resend client singleton with retry logic) and `apps/web/lib/email/send.ts` (typed sendEmail helper that takes a React Email component, recipient, subject). Build base email layout component at `apps/web/emails/_layout.tsx` matching brand tokens (terracotta accent, paper background, ink type). Build one example transactional email (`apps/web/emails/welcome.tsx`) to verify the pipeline works end-to-end. Send a test email to Jeremy's address from the verified sending address. Document the email setup in `docs/runbooks/email.md`. After this milestone, every later milestone that sends email uses these helpers — no direct Resend SDK calls.

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

**M3.4** — Onboarding intent flow (mockup #02)
> New route `/onboarding/intent` shown to users who haven't completed onboarding. 4-card segment selection, strategy multi-select, target markets, deal range. On submit, write to user record and route to `/app/properties`.

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

### Phase 5 — Lifecycle stage pages

The 3 stage pages for properties under management.

**M5.1** — Buying stage (mockup #14)
> Rebuild `/app/properties/[propertyId]/buying/page.tsx`. Hero row: countdown to next milestone, deal progress bar, closing budget burn. 2-column grid: vertical milestone timeline + notes feed, contacts grid + budget table. Preserve existing CRUD server actions.

**M5.2** — Renovating stage (mockup #15)
> Rebuild `/app/properties/[propertyId]/renovating/page.tsx`. Hero row: budget burn donut, overdue tasks, days remaining. 2-column grid: scope items + tasks list, contractors + quotes. Preserve existing CRUD.

**M5.3** — Managing stage (mockup #16)
> Rebuild `/app/properties/[propertyId]/managing/page.tsx`. Time picker. PMS connection status. Hero row: revenue gauge + occupancy + ADR. P&L strip. 2-column grid: reservations + Schedule E roll-up + recent expenses. Preserve CSV import + existing CRUD.

### Phase 6 — AI surfaces

Scout chat — the AI conversation surfaces.

**M6.1** — Scout per-property (mockup #17) + cost optimization
> Refactor `/app/properties/[propertyId]/scout/page.tsx` to match mockup 17. Conversation thread with editorial greeting, message blocks, inline evidence cards, citation chips, live thinking states, per-message contextual actions. Right rail: Scout's context summary, cited sources, earlier conversations. Implement two-pass routing in `/api/scout/message`: first call goes to Haiku 4.5 via `model-router.ts`; if Haiku classifies the question as requiring complex reasoning, escalate to Sonnet 4.6 with same context. Use `cache-helpers.ts` to cache property context (verdict + evidence + recent messages) with 1-hour TTL on first message of a session. Adjust tier limits: $20 DwellVerdict tier capped at 3 messages/day (demo only), $40 Pro tier at 20/day with 200/month soft cap. Implement monthly cost cap: when a user's `ai_usage_events` spend in current month exceeds $30, Scout degrades to Haiku-only with friendly notification. Track all costs in `ai_usage_events`. Add per-message thumbs up/down feedback (one of the per-message actions in the message footer, alongside Copy / Save to notes / etc.) — clicking writes to `scout_message_feedback` table (schema in master plan § AI quality feedback) with the model used for that message captured in the snapshot.

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

**M9.1** — Admin foundation + Dashboard + Error monitoring (Sentry)
> Add `is_super_admin` boolean column to users table (default false). Implement `getEffectiveTier(user)` helper at `apps/web/lib/auth/effective-tier.ts` that returns `'pro'` for super admins, otherwise returns the user's actual subscription tier. Refactor every existing tier-gating check in the codebase (the `consumeReport()` function, any `if user.tier === 'pro'` checks, Pro-feature middleware) to use this helper. Add admin auth gate as server-side middleware on all `/admin/*` routes: returns 404 to non-admins so the routes are indistinguishable from non-existent routes. Add admin sidebar section to `Sidebar` component as a conditionally-rendered group at the bottom — when `user.is_super_admin === false`, the admin section must be entirely absent from the rendered DOM (not hidden, not styled invisible, actually not in the output). Use server-side rendering or dynamic imports to ensure admin code is not in JS bundles served to non-admins.
>
> **Set up Sentry for error monitoring.** Install `@sentry/nextjs` and configure with DSN env var. Configure source maps upload on production deploy. Set up alert rules in Sentry dashboard: notify Jeremy via email when error rate exceeds 1% in any 5-minute window, or when any new error type appears in production. Wrap critical server actions (verdict generation, Stripe webhook handlers, Scout message endpoint) with Sentry context tags so errors are attributable. Test by triggering a deliberate error in dev and confirming it appears in Sentry dashboard.
>
> Build `/admin/dashboard` page: top-level KPIs (MRR from Stripe, ARR, total users by tier, net new users this period, churn count, Anthropic spend this month with delta vs last month, gross margin estimate, top 3 system alerts including Sentry error rate). Time picker (7D / 30D / 90D / YTD / All) using same pattern as customer-facing portfolio dashboard. Aggregations queried on-demand from existing tables — no admin-specific cache required for v1. After this milestone ships, manually update Jeremy's user record with `UPDATE users SET is_super_admin = true WHERE email = '<jeremy's email>'` (run via direct DB access — no admin endpoint that grants the flag, since that would be a critical security hole).

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

## Milestone count summary

- Phase 0 — Operational foundation: 1 milestone (M0.1 email infrastructure)
- Phase 1 — Foundation: 3 milestones
- Phase 2 — Public surfaces: 4 milestones (M2.1 landing, M2.2 pricing, M2.3 legal+help, M2.4 SEO+GEO)
- Phase 3 — Verdict surfaces: 5 milestones (M3.0 cost optimization foundation + M3.1-M3.4)
- Phase 4 — Property surfaces: 4 milestones
- Phase 5 — Lifecycle stage pages: 3 milestones
- Phase 6 — AI surfaces: 2 milestones
- Phase 7 — Workspace surfaces: 5 milestones
- Phase 8 — Settings surfaces: 4 milestones
- Phase 9 — Embedded admin console: 3 milestones (includes Sentry setup in M9.1, AI quality dashboard in M9.3)

**Total: 34 milestones.** With autonomous Claude Code execution, estimated 32-44 hours of compute time, deliverable at Jeremy's pace of pasting prompts.

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

1. All 34 milestones have shipped to production
2. dwellverdict.com matches the 22 mockups visually
3. All new schema migrations are applied
4. No "coming soon" placeholders remain
5. Jeremy has personally clicked through every surface end-to-end and confirmed it matches expectations

After completion, this becomes "v1" and the product is ready for broader launch.
