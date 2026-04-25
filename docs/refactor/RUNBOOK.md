# DwellVerdict Refactor — Step-by-Step Runbook

**Audience:** Jeremy Collins
**Purpose:** The literal playbook for executing the 34-milestone refactor with Claude Code
**Status:** v1.0 · April 24, 2026

---

## What this document is

This is your operational manual for executing the DwellVerdict UI refactor with Claude Code. It tells you exactly what to do, in what order, when. Reference it every session.

If you ever feel lost or unsure what to do next, this document has the answer.

---

## Recent activity

Last updated: 2026-04-25

- ✅ M1.2 shipped — onboarding schema fields (5 nullable columns on `users`, backfilled `onboarding_completed_at` for pre-existing users, Zod validators in `apps/web/lib/onboarding/schema.ts`)
- ✅ M1.1 shipped (commit 5004560) — design system primitives
- ✅ M0.2 shipped (commit b758e22) — CI infrastructure
- ✅ M0.3 shipped (commit 480ce7c) — Sentry error monitoring
- ✅ M0.1 shipped (commit be71fef) — Email infrastructure
- ⏳ M1.3 next — sidebar shell wired into authenticated layout

---

## Before you start (one-time setup)

You do these once, before any milestone work begins. After this section, you never touch it again.

### Step 1 — Get the four handoff documents into your repo

In your Claude Code environment, open a terminal in the DwellVerdict repo. Tell Claude Code:

> I'm starting a major UI refactor. I need to commit four documentation files into my repo before any work begins. I'll paste each file's content. Save them all to `docs/refactor/`, commit them on a branch called `docs/refactor-handoff`, push the branch, open the PR, and merge it. This is documentation only — no code changes, just adding docs.

Then paste each of the four files in separate messages, telling Claude Code where each goes:

- `docs/refactor/REFACTOR_MASTER_PLAN.md` — paste the master plan content
- `docs/refactor/PROMPT_00_ENGINEERING_SETUP.md` — paste PROMPT_00 content
- `docs/refactor/PROMPT_01_FOUNDATION.md` — paste PROMPT_01 content
- `docs/refactor/PROMPT_02_ONBOARDING_SCHEMA.md` — paste PROMPT_02 content
- `docs/refactor/RUNBOOK.md` — paste this runbook content

Claude Code creates the docs branch, commits all five files, opens the PR, merges it. Production deploys but nothing user-visible changes — these are just docs.

**You now have the source of truth in your repo.** Every later milestone prompt references these files.

### Step 2 — Verify your environment is ready

Check the following before starting M1.1:

- [ ] You can run `pnpm dev` (or your repo's dev command) and the app starts cleanly
- [ ] You have access to your Neon database via the dashboard or a SQL client
- [ ] You have access to your Stripe dashboard (you'll need it for some milestones)
- [ ] You have access to your Vercel project (deploys come from there)
- [ ] Your `.env.local` has all required keys: `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `DATABASE_URL` (Neon connection string), and any others your existing app uses

If any of these are missing, fix them before continuing.

### Step 3 — Save Anthropic and Resend credentials you'll need later

For milestones that come up later, you'll need:

- **Resend API key** (M0.1 email infrastructure) — sign up at resend.com when you reach M0.1, get the API key
- **Sentry DSN** (M9.1 error monitoring) — sign up at sentry.io when you reach M9.1, get the DSN
- **Plausible Analytics account** (M2.4 SEO/GEO) — sign up at plausible.io when you reach M2.4, or use Google Analytics if preferred

You don't need these now. Just know you'll need them when those milestones come.

---

## The repeating loop (do this for every milestone)

Every milestone follows the same 6-step pattern. Internalize this loop — you'll run it 34 times.

### Step A — Get the milestone prompt from Claude (design partner)

Go to Claude (the design partner — me, the same conversation you're in now) and ask for the next milestone prompt.

Use this exact phrasing the first time:

> Send me the next milestone prompt for Claude Code.

Or after a milestone ships:

> M{X.Y} shipped. Send me the next milestone prompt.

I'll write the prompt and present it to you as a markdown file. Save the file or copy its contents.

### Step B — Open a fresh Claude Code session

For each milestone, start with a fresh Claude Code session. Don't reuse the previous session's context — fresh context is cleaner.

Open Claude Code in your terminal. You should be in the DwellVerdict repo root.

### Step C — Paste the milestone prompt

Paste the entire milestone prompt I gave you. Don't summarize it. Don't edit it. Paste verbatim.

Claude Code will:
1. Read the prompt
2. Read the master plan and any other docs referenced
3. Read the relevant codebase files
4. Possibly ask you a few clarifying questions (rare — only for ambiguities)
5. Begin implementation

Answer any clarifying questions briefly. If a question feels like it needs strategic input, defer to me — say "I'll check with my design partner and come back" and bring the question to Claude.

### Step D — Let Claude Code execute autonomously

This is the part where you don't intervene unnecessarily.

Claude Code will:
1. Create the branch (`refactor/M{X.Y}-{slug}`)
2. Make the changes
3. Open a PR
4. Wait for CI
5. Fix CI failures (up to 3 attempts)
6. Merge the PR
7. Confirm production deploy
8. Report back to you with the merge commit SHA

This typically takes 15-90 minutes depending on milestone complexity. Check in periodically. Don't hover.

**When you should intervene:**
- Claude Code asks a question that requires your input (rare)
- Claude Code reports it's blocked on something it can't resolve (rare)
- More than 90 minutes pass with no progress (very rare — likely Claude Code crashed or hit a token limit)

**When you should NOT intervene:**
- Claude Code is reporting progress, even slowly
- Claude Code is fixing CI failures (let the 3-attempt policy run)
- Claude Code is making implementation choices you wouldn't have made (the master plan said "use your judgment for tactical decisions")

### Step E — Verify the deploy worked

Once Claude Code reports the milestone is done and production is deployed:

1. Visit dwellverdict.com (or your production URL)
2. Smoke-check the relevant surface (the milestone prompt has a smoke test plan)
3. Check the Vercel dashboard to confirm the deploy succeeded
4. If the milestone touched the database, run a quick query to verify schema changes applied

If something broke production, two options:
- **Quick fix:** Tell Claude Code to revert the merge and investigate (use the rollback command from the PR description)
- **Forward fix:** Ask Claude Code to make a follow-up PR fixing the issue

For pre-launch with no users, forward-fixing is usually fine.

### Step F — Report back to Claude (design partner)

Come back to me. Tell me:

> M{X.Y} shipped. SHA: {merge commit SHA}. Send me the next milestone prompt.

If anything went wrong, mention it:

> M{X.Y} shipped but had a CI failure that auto-merged anyway — looks like a TypeScript error in {file}. Should we address before continuing?

I'll either send the next prompt or address the issue first.

### Convention: every milestone PR updates this runbook

Every milestone PR must include an edit to `docs/refactor/RUNBOOK.md` as part of the same change:

1. Check off the shipped milestone in the **full milestone sequence** tracker (`[ ]` → `[x]`) and append the merge commit SHA.
2. Update the **Recent activity** section at the top of the runbook — add a new `✅` row for the shipped milestone, move the `⏳ next` indicator to the next milestone in line, and bump the `Last updated` date.
3. If the milestone changed plan structure (added/removed a milestone, reordered phases), update the tracker to match.

The milestone prompt template explicitly includes this step. If a PR ships without it, the next milestone prompt should fix the runbook before doing anything else. This keeps the "Recent activity" view accurate without manual bookkeeping.

---

## The full milestone sequence (34 total)

This is the order. Don't deviate without good reason.

### Phase 0 — Operational foundation
- [x] **M0.1** — Email infrastructure (Resend) — shipped commit be71fef
- [x] **M0.2** — CI infrastructure (typecheck, lint, test) — shipped commit b758e22
- [x] **M0.3** — Sentry error monitoring — shipped commit 480ce7c

### Phase 1 — Foundation
- [x] **M1.1** — Brand tokens + design system primitives (PROMPT_01 already in your repo) — shipped commit 5004560
- [x] **M1.2** — Onboarding schema migration (PROMPT_02 already in your repo) — shipped (merge SHA pending)
- [ ] **M1.3** — Sidebar shell into authenticated layout — next

### Phase 2 — Public surfaces
- [ ] **M2.1** — Landing page
- [ ] **M2.2** — Pricing page
- [ ] **M2.3** — Legal + Help pages (Terms, Privacy, Cookies, FAQ)
- [ ] **M2.4** — SEO + GEO optimization

### Phase 3 — Verdict surfaces
- [ ] **M3.0** — AI cost optimization foundation (model router, cache helpers, batch client, ai_usage_events)
- [ ] **M3.1** — Address input refresh
- [ ] **M3.2** — Streaming verdict generation + cost optimization
- [ ] **M3.3** — Verdict detail page (the centerpiece) + verdict feedback capture
- [ ] **M3.4** — Onboarding intent flow + welcome email

### Phase 4 — Property surfaces
- [ ] **M4.1** — Dashboard route
- [ ] **M4.2** — Properties list
- [ ] **M4.3** — Verdicts cross-property view
- [ ] **M4.4** — Compare view

### Phase 5 — Lifecycle stage pages
- [ ] **M5.1** — Buying stage
- [ ] **M5.2** — Renovating stage
- [ ] **M5.3** — Managing stage

### Phase 6 — AI surfaces
- [ ] **M6.1** — Scout per-property + cost optimization + feedback capture
- [ ] **M6.2** — Scout global view

### Phase 7 — Workspace surfaces
- [ ] **M7.1** — Briefs system schema + base + Batch API
- [ ] **M7.2** — Briefs UI
- [ ] **M7.3** — Alerts system schema + rule engine + Batch API
- [ ] **M7.4** — Alerts UI
- [ ] **M7.5** — Portfolio dashboard

### Phase 8 — Settings surfaces
- [ ] **M8.1** — Settings landing
- [ ] **M8.2** — Settings · Account
- [ ] **M8.3** — Settings · Billing & integrations
- [ ] **M8.4** — Settings · Notifications

### Phase 9 — Embedded admin console
- [ ] **M9.1** — Admin foundation + Dashboard + Sentry setup
- [ ] **M9.2** — Admin · Users + Cost analytics
- [ ] **M9.3** — Admin · Revenue + Usage + AI Quality + Operations

### Final — Launch readiness
- [ ] Run a complete walkthrough of every surface as a non-admin
- [ ] Run a complete walkthrough of every surface as an admin
- [ ] Verify all 22 mockups are matched in production
- [ ] Verify cost optimization is working (check `/admin/costs` for cache hit rates and Haiku routing percentages)
- [ ] Verify AI quality dashboard has at least some feedback data
- [ ] Run Lighthouse on landing page — confirm Performance >85, SEO >95, A11y >90
- [ ] Have a friend (non-technical) try the product end-to-end and tell you what's confusing
- [ ] Mark v1 complete

---

## Pacing recommendations

**Don't try to ship everything in one weekend.** That's how mistakes happen.

Realistic pace:

- **Aggressive solo founder pace:** 2-3 milestones per evening, 2-3 evenings per week. Roughly 6-7 weeks to v1.
- **Sustainable pace:** 1-2 milestones per evening, 2-3 evenings per week. Roughly 10-12 weeks to v1.
- **Weekend warrior pace:** 4-6 milestones per Saturday morning. Roughly 6-8 weekends to v1.

Pick the pace that fits your real life, not the heroic version. The fastest path is the one you can sustain without burnout.

**Natural breakpoints:**

After Phase 1 ships (M1.1 / M1.2 / M1.3), the app has the new shell but the old surfaces. Pause here. Click around. Make sure the foundation feels right before building on it.

After Phase 3 ships (M3.0 through M3.4), the core verdict experience is live in its new form. Pause here. Test verdict generation. Make sure cost optimization is working as expected. This is your first major "is the product fundamentally right?" checkpoint.

After Phase 7 ships (briefs + alerts + portfolio), all the workspace features are done. The app is largely complete except for settings and admin. Pause and assess.

After Phase 9 ships (admin console), you're at v1. Stop and review everything before announcing launch.

---

## When things go wrong

### Scenario: Claude Code asks me a question I don't know how to answer

Tell Claude Code:

> Hold that question. Let me check with my design partner.

Then come to me with the question. I'll give you an answer or update the master plan if it reveals a missing decision.

### Scenario: A milestone takes much longer than expected

If a milestone is taking >2 hours of Claude Code work without obvious progress, something's wrong. Two options:

1. **Ask Claude Code to summarize the situation:** "Where are you stuck? What have you tried? What's blocking you?"
2. **Bring me back in:** Come to me with the situation. I might need to revise the milestone prompt or split it into smaller pieces.

### Scenario: Production breaks after a deploy

For pre-launch, this is acceptable but should still be addressed quickly. Options:

1. **Revert:** Use the rollback command from the PR description (`git revert <SHA>`). Production goes back to the previous working state. Then address the bug in a follow-up.
2. **Forward fix:** Tell Claude Code to immediately make a follow-up PR fixing the bug. Faster but riskier.

For pre-launch, forward-fix is usually fine. Post-launch, revert-first becomes the safer default.

### Scenario: A milestone reveals the master plan is wrong

This will happen at least once. The plan was made with imperfect information. Reality reveals gaps.

Don't have Claude Code work around the gap. Don't ignore it. Come to me. We update the master plan first, then the milestone prompt is rewritten with the correct decision.

### Scenario: I want to skip a milestone or change the order

You can. The plan is a recommendation, not a contract. But check with me first — some milestones have dependencies that aren't obvious. M3.0 depends on M3.0's abstractions. M9.x depends on `ai_usage_events` from M3.0. M2.3 legal pages depend on M2.1's footer linking to them.

If you want to defer something, tell me what and why. I'll tell you what depends on it.

### Scenario: I'm running into Claude Code rate limits

This will happen on the bigger milestones (M3.2 streaming verdict, M9.1 admin foundation). Options:

1. **Wait it out:** Rate limits reset on a 5-hour window. Take a break, come back.
2. **Switch to API overflow:** Anthropic offers pay-as-you-go API access that bypasses subscription rate limits. Set up overflow billing in your Anthropic account, Claude Code will use it for the burst.
3. **Split the milestone:** If a milestone is consistently hitting rate limits, it's probably too big. Come to me, I'll split it into 2-3 smaller PRs.

### Scenario: I want to take a break for a week or two

Totally fine. The plan doesn't expire. When you come back:

1. Re-read the master plan to refresh context
2. Check the milestone tracker (in this runbook) for where you left off
3. Come to me — say "I'm back, ready for M{X.Y}"
4. I'll send the next prompt

Claude Code in the new session will read the docs and pick up wherever the codebase is at.

---

## Communication patterns

### When asking me for the next milestone

The shortest valid request:

> Next milestone.

Or with context:

> M3.2 shipped, took longer than expected because we hit a TypeScript issue with the SSE response type. All works now. Send M3.3.

### When telling Claude Code to start a milestone

The shortest valid instruction:

> [paste full milestone prompt verbatim]

That's it. No preamble. The prompt is self-contained.

### When something is unclear and you want my input

> Quick question before I continue: [the question]. Once you answer, I'll send the next milestone prompt to Claude Code.

### When you've made a decision that affects the plan

> Heads up — I've decided X instead of Y. Update the master plan to reflect this and confirm any milestones that need adjustment.

---

## What "v1 complete" looks like

You'll know v1 is done when:

1. All 34 milestones are checked off above
2. dwellverdict.com matches all 22 mockups in production
3. You can paste an address as a free user, see the verdict, and feel the upgrade prompt
4. You can sign up for Pro and use Compare, Briefs, Alerts, Scout, Portfolio
5. You can manage a property through Buying, Renovating, Managing stages
6. The admin console shows you healthy unit economics (positive margin per user)
7. You've onboarded one or two real friends and gotten honest reactions

That's the bar. Not "feature-complete relative to a roadmap." Working product, real economics, real users.

---

## Quick reference card

**Source of truth:** `docs/refactor/REFACTOR_MASTER_PLAN.md`

**For each milestone:**
1. Ask me for the prompt
2. Open fresh Claude Code session
3. Paste prompt verbatim
4. Let it run autonomously
5. Verify production deploy
6. Report back to me

**When stuck:** Come to me with the specific situation.

**When in doubt:** The master plan has the answer. If it doesn't, that's a signal to update the plan.

---

## You've got this

The plan is comprehensive but the day-to-day is simple: ask for the next prompt, paste it, verify, repeat.

Don't try to predict everything. Don't try to optimize everything. Ship M1.1, see what happens, adjust if needed, ship M1.2.

The hard work — the design, the architecture, the product decisions — is already done. What's left is execution. And execution is just one milestone at a time.

Good luck. I'm here when you need me.
