# PROMPT 00 · Engineering Setup
**Paste this to Claude Code FIRST, before any milestone prompts.**

---

You're about to help me execute a major UI refactor of DwellVerdict, a property verdict platform I'm building. The product is live at dwellverdict.com with working backend, AI verdict generation, Stripe billing, and authentication. We're rebuilding the visual layer, navigation, and adding several new surfaces to match a comprehensive design system.

**Important context:** This product is pre-launch with no real users yet. That changes how we work. You operate autonomously: you open PRs, run CI, fix CI failures, merge to main, deploy to production. I'm not going to review every PR before merge. Speed matters more than safety nets here. We fix bugs forward.

Before any work starts, I need you to read several context documents so we're aligned. **Don't write any code yet.** This first prompt is purely about setting up shared context.

## What I want you to do in this first session

**Step 1.** Read these files in this order:

1. `docs/refactor/REFACTOR_MASTER_PLAN.md` — the comprehensive plan, locked decisions, milestone catalog. This is the source of truth for the entire refactor. Read it carefully.
2. The existing codebase — at minimum:
   - `apps/web/app/layout.tsx` and `apps/web/app/app/layout.tsx`
   - `apps/web/components/logo.tsx`, `apps/web/components/app-nav.tsx`, `apps/web/components/public-nav.tsx`
   - `apps/web/lib/brand-tokens.ts`
   - `apps/web/tailwind.config.ts`
   - `apps/web/app/globals.css`
   - `packages/db/src/schema/` (all schema files)
   - `apps/web/app/app/properties/page.tsx`
   - `apps/web/app/app/properties/[propertyId]/page.tsx`
   - `apps/web/app/api/verdicts/[id]/generate/route.ts`

**Step 2.** Confirm understanding by writing back to me:

- A 3-paragraph summary of what the refactor entails, in your own words
- Your understanding of the engagement model (autonomous execution, you merge your own PRs)
- Any questions you have about the master plan that aren't already answered there
- Any concerns about the existing codebase that might affect refactor sequencing

**Step 3.** Wait for my reply before doing any work. After my reply, I'll send you the first milestone prompt (`PROMPT_01_FOUNDATION.md`), which is the first executable unit of work.

## Operating ground rules for the entire refactor

These apply to every milestone you execute. Internalize them now.

### 1. The master plan is law

`docs/refactor/REFACTOR_MASTER_PLAN.md` is the source of truth for what we're building and why. If a milestone prompt seems to conflict with the master plan, follow the milestone prompt — I would have updated the plan before changing the prompt.

If a milestone reveals a missing decision in the master plan, use your best judgment, document the choice in the PR description, and proceed. Don't stall waiting for me to weigh in on small things.

### 2. Milestone-by-milestone, one PR per milestone

I send you exactly one milestone prompt at a time. Each milestone is a focused, reviewable unit of work. Each one results in one PR, opened and merged by you.

Don't combine milestones unless I explicitly ask.

### 3. Branch + PR naming

For each milestone, create a branch named: `refactor/M{phase}.{number}-{slug}`

Examples:
- `refactor/M1.1-foundation-tokens`
- `refactor/M3.3-verdict-detail-page`
- `refactor/M7.4-alerts-ui`

PR title: `M{phase}.{number} — {milestone name}`

PR body must include:
- Milestone reference (which milestone this completes)
- Files changed summary
- Implementation notes (decisions you made beyond the spec)
- Known issues / deferred work
- Rollback command: `git revert <merge-commit-SHA>` (you'll fill in SHA after merge if needed)

This makes future debugging easier when I (or you) come back to figure out why something works the way it does.

### 4. Autonomous merge flow

For each milestone:

1. Create the branch
2. Make changes
3. Open the PR
4. Wait for CI to run
5. If CI passes → merge the PR yourself, confirm production deploy, report back
6. If CI fails → attempt to fix (up to 3 fix attempts)
7. After 3 fix attempts: merge anyway with a "CI failure noted: <reason>" tag in PR body, continue. Pre-launch, this is acceptable.

You merge your own PRs. You do not wait for my approval. You do not push directly to main — always work through a PR for traceability.

### 5. Preserve existing infrastructure

The production app has working:
- Verdict generation via Anthropic Sonnet 4 (with FHA lint, place sentiment, prompt caching, cost tracking)
- Stripe billing with webhooks
- Clerk authentication and org sync
- Scout AI chat with quota enforcement
- Address autocomplete via Google Places
- Deal/renovation/management CRUD on multiple tables
- Regulatory cache, data source cache, place sentiment cache

**Every milestone preserves this infrastructure.** Refactor changes the UI layer and adds new surfaces. It does not rewrite the AI pipeline, billing logic, or auth — except where explicitly called out:
- M3.0 introduces cost optimization abstractions that wrap AI calls (see master plan § Cost optimization architecture)
- M9.1 introduces the `getEffectiveTier(user)` helper and refactors existing tier-gating checks (`consumeReport()`, Pro-feature middleware, etc.) to use it. This is the only place tier-gating logic gets touched. After M9.1, all gating checks read through the helper rather than `subscription_tier` directly.

When in doubt, prefer to extend or wrap existing code rather than rewrite. If a milestone seems to require rewriting Stripe/Clerk integration code, **stop and ask me first** — that's the one place where I want a checkpoint. Anthropic SDK calls are the exception: starting at M3.0, they get wrapped behind `model-router.ts`, `cache-helpers.ts`, and `batch-client.ts` abstractions. After M3.0 ships, the hard rule is **no direct Anthropic SDK calls outside these abstractions** — every later milestone consumes them.

### 5a. Cost optimization is a first-class concern

The product's unit economics depend on aggressive AI cost optimization. The master plan has a detailed "Cost optimization architecture" section explaining the strategy (prompt caching, model routing Haiku vs Sonnet, two-pass Scout, Batch API for non-real-time). M3.0 implements the foundational abstractions; subsequent milestones consume them.

Hard rules after M3.0 ships:
- All AI calls route through `apps/web/lib/ai/model-router.ts` (no direct SDK calls)
- All static prompt portions use `cache-helpers.ts` with `cache_control` markers
- All non-user-real-time AI work uses `batch-client.ts` (briefs, alerts, portfolio aggregations)
- All AI operations record usage to `ai_usage_events` for cost tracking
- Routing and caching defaults are conservative — when in doubt, prefer Haiku over Sonnet, prefer cached over uncached

If a milestone seems to ignore these rules without justification, that's a sign the prompt or the implementation is wrong. Flag it and ask.

### 6. Deploy safety

Every PR you merge must be safe to deploy. Means:
- No half-built UIs visible to users (placeholders during transition are fine if labeled)
- No half-applied database migrations
- No broken auth/billing flows

If a milestone is too large to be deploy-safe in one PR, split it into 2 PRs. The first PR includes a note "Part 1 of 2 — full milestone completes in next PR."

### 7. Type safety

The repo uses TypeScript strictly. Every new component is typed. Every new server action uses Zod for input validation. Every new database query uses Drizzle's type inference. No `any` types unless absolutely necessary.

### 8. Mobile responsiveness

Mockups target desktop (1200-1400px viewport). But every milestone must produce mobile-responsive results. Mobile breakpoints: 768px (tablet) and 480px (phone). The sidebar collapses to a drawer on mobile. Hero cards stack. Tables become horizontally scrollable or collapse to card lists.

### 9. Accessibility

Every interactive element gets keyboard navigation, focus states, and ARIA attributes. Color contrast meets WCAG AA. Form fields have proper labels.

### 10. Tests where they matter

You don't need exhaustive test coverage. But test:
- New utility functions or critical logic
- New server actions
- Anything that could regress an existing system (verdict generation, Stripe checkout, auth flows)

Skip tests for purely-visual changes that don't have logic. CI must be green to merge — you can fix CI failures with up to 3 fix attempts before merging anyway.

### 11. Don't touch what isn't yours

Each milestone has a focused scope. Don't refactor adjacent code "while you're there." Don't reformat files you didn't need to change. Don't update dependencies unless the milestone requires it. Stay surgical.

If you notice technical debt or improvements that aren't in scope, mention them in the PR description as "Future work observed:" but don't do them.

### 12. Communicate uncertainty in PR descriptions, not by stopping

I want to know what choices you made that weren't explicit in the spec. But I don't want you to stop and ask me about every small decision — that defeats the autonomous workflow.

Document decisions in the PR body under "Implementation notes." Things I want documented:
- "The mockup shows X but the existing code does Y. I went with X."
- "I added schema field Z that wasn't in the master plan because the milestone required it."
- "I chose library A over library B because [reason]."

Things that DO warrant stopping and asking me:
- Rewrites of Stripe / Clerk / Anthropic integration code
- Changes that would break existing user data
- Anything that requires a destructive database migration

For everything else, exercise judgment and document.

## What you should NOT do

- ❌ Don't start coding before I send the first milestone prompt
- ❌ Don't combine milestones into one PR
- ❌ Don't rewrite working systems unless explicitly asked
- ❌ Don't change pricing logic, Stripe integration, or quota enforcement without asking
- ❌ Don't change Clerk auth flows without asking
- ❌ Don't change the Anthropic verdict generation logic without asking
- ❌ Don't push directly to main (always work through a PR)
- ❌ Don't add new dependencies without justifying them in the PR description

## What you SHOULD do

- ✅ Open and merge your own PRs
- ✅ Run CI, fix CI failures, merge anyway after 3 fix attempts if needed
- ✅ Confirm production deploy after each merge
- ✅ Document decisions in PR descriptions
- ✅ Exercise judgment on small decisions, don't stall waiting for input
- ✅ Stop and ask only for the rare big decisions (Stripe/Clerk/Anthropic rewrites, data migrations, etc.)

## Getting started

Read the master plan, read the existing codebase, then write back to me with:
1. Your 3-paragraph summary
2. Confirmation of the autonomous engagement model
3. Questions about the master plan
4. Concerns about the existing codebase

After I respond, I'll send `PROMPT_01_FOUNDATION.md` and you begin building.
