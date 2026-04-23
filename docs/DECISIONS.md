# DECISIONS.md

Lightweight ADR log for DwellVerdict. Every decision that deviates from
`CLAUDE.md` or the technical spec lands here. The first five ADRs — the
foundational stack choices — are initialized in M6 as part of the Phase 0
wrap-up. Interim entries (like outstanding TODOs) live under **Pending**
until they're resolved or promoted to a full ADR.

---

## Milestone status

**Phase 0 — complete as of 2026-04-22.** (First M1 commit: 2026-04-20.)

**Shipped:**
- **M1** — Monorepo (pnpm + Turborepo), Next.js 15 + Tailwind + shadcn skeleton,
  FastAPI `/health`, CI placeholder.
- **M2** — Drizzle schema for users / organizations / organization_members /
  properties / property_stages with CHECK constraints, Neon HTTPS migration
  runner, typed DB client factory.
- **M3a/b/c** — Clerk auth end-to-end: middleware-protected `/app` routes,
  `<SignIn>`/`<SignUp>` catch-all pages, svix-verified `/api/webhooks/clerk`
  with idempotent user+org+member sync, 3 Vitest integration tests,
  production Clerk instance on `accounts.dwellverdict.com`, custom domain
  with SSL at `https://dwellverdict.com`, first real user signed up and
  landed on `/app/properties` cleanly.
- **M4** — FastAPI modeling service on Fly.io (sjc, scale-to-zero), typed
  `modeling-client.ts` in the web app, debug footer on `/app/properties`
  rendering `Modeling: v0.0.0` live from Fly.

**Deferred from Phase 0 plan (original brief):**
- **M5** (CI + observability) — GitHub Actions lint/typecheck/test on PR,
  Sentry on both services, PostHog client. Treated as pre-Phase-1 work.
- **M6** (formal ADRs) — the five foundational stack-choice ADRs were meant
  to be initialized in the `## Accepted ADRs` section below. Current state:
  decisions are implicit in `CLAUDE.md` / `TECHNICAL_SPEC.md`, with
  post-mortems captured in the Pending section as LESSON entries. Works
  fine until the next engineer joins.

**Outstanding infrastructure TODOs (details in Pending below):**
- Dedicated Neon `test` branch before M5 CI
- Clerk custom email sender upgrade when we move to a paid plan
- pnpm 10 upgrade (its own milestone)
- POSTGRES_* / NEON_* env var alias cleanup in Vercel's Neon integration

---

## Pending

### TODO — dedicated Neon test branch before M5 CI

**Owner:** whoever wires M5 CI.
**Status:** deferred from M3b.
**Context:** M3b's three integration tests hit the same Neon dev branch as
local development, isolated by `clerk_id` prefixes (`test_<uuid>_`) with
`afterEach` cleanup. Acceptable for three tests run manually or in series.

Once M5 wires the test job into GitHub Actions on every PR, parallel runs
(e.g. a push while a PR check is running) will race on the same branch.
Prefix cleanup prevents data collisions but does not prevent dev branch
pollution if a test process is killed mid-run.

**Action:** before the M5 CI workflow is merged:
1. Create a dedicated Neon branch `test` off `main`.
2. Add `TEST_DATABASE_URL` to Vercel + GitHub Actions secrets.
3. Update `apps/web/tests/setup.ts` to prefer `TEST_DATABASE_URL` when set.
4. Leave the prefix cleanup in place as a defense-in-depth measure.

### TODO — upgrade Clerk to custom email sender domain when we leave Phase 0

**Owner:** whoever owns the first paid-plan decision on Clerk.
**Status:** deferred from M3c for cost reasons.
**Context:** M3c ships production Clerk on the free tier. That gives us
custom auth UI on `accounts.dwellverdict.com` (included free) but leaves
verification emails going out from Clerk's own domain (e.g.
`noreply@<subdomain>.clerk.accounts.dev`). The M3c scope originally called
for "a real verification email from a Clerk address on our domain" —
consciously revised mid-milestone to save ~$25/mo while Phase 0 is still
pre-revenue. Custom email sender adds DKIM + SPF + DMARC DNS records on top
of the two CNAMEs we're already adding; total work to upgrade is ~10
minutes once we're on a paid plan.

**Action:** when we upgrade Clerk for any reason (branded email, higher
MAU ceiling, multi-factor policies, etc.):
1. Enable custom email sender domain in Clerk production instance.
2. Add the DKIM/SPF/DMARC records Clerk provides to Namecheap DNS.
3. Wait for DNS propagation + Clerk verification.
4. Send a test sign-up to confirm the From address is now on our domain.
5. No code change required — purely config.

### TODO — landing page copy iteration ("follows the deal")

**Owner:** Sprint 2 copy pass.
**Status:** deferred from Phase 1 Sprint 1 Phase C.
**Context:** Landing page sub-hero currently reads "One report, from
finding to managing. **The property record that follows the deal.**"
The phrase "follows the deal" is slightly transactional — more
real-estate-broker voice than investor-tool voice. Candidate revision:
"The property record that follows the investment" — aligns with our
investor audience without changing the structural meaning.

**Action:** during Sprint 2 content pass, compare:
- "follows the deal" (current, transactional)
- "follows the investment" (investor-aligned)
- any alternatives that surface during user conversations

No code change until the decision is made. One-line edit in
`apps/web/app/page.tsx` when the call is locked.

### LESSON — secret rotation hygiene (M3c post-mortem)

**Trigger:** M3c-6 smoke test. Sign-up flow completed in Clerk and wrote
the correct rows to Neon via the webhook, but `/sign-in` rendered a blank
`<main>` in production. Root cause: after rotating Clerk secrets in the
dashboard (prompted by the leaked `sk_live_` value being echoed earlier in
conversation), only `CLERK_WEBHOOK_SIGNING_SECRET` was updated in Vercel.
The rotated `CLERK_SECRET_KEY` wasn't. Clerk's Next.js SDK silently failed
server-side handshakes with the stale key — Vercel logs showed repeated
`Clerk: unable to resolve handshake: The provided Clerk Secret Key is
invalid. reason: 'secret-key-invalid'` — which cascaded into the
`<ClerkProvider>` client boot rendering nothing. The webhook still worked
because its signing secret lives independently and *was* updated.

**Principle:** secret rotations are all-or-nothing per service. Rotating
one Clerk secret without rotating the others in step is a partial rotation
that leaves the system in a half-broken state where some flows work
(webhook) and others silently fail (SSR auth). The obviously-broken thing
is not always the only broken thing.

**Action — bake these into the M3c-style deploy checklist going forward:**
1. **Rotate-all rule:** when rotating any Clerk secret, update *all three*
   Vercel vars in the same session (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` if
   the pk rotates too, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`).
   Same rule applies to Neon, Stripe, Anthropic, any multi-secret vendor.
2. **Deploy verification step** before marking a prod deploy complete:
   - `GET /sign-in` → page contains rendered Clerk form (grep for `cl-`
     class prefix in post-hydration HTML, or eyeball it in a real browser).
   - Webhook round-trip: trigger a Clerk "Send example event" → confirm
     200 response in Clerk's webhook log + expected Neon row/no-op.
   - Vercel Runtime Logs tail for ≥60s after deploy → no
     `secret-key-invalid`, `invalid_signature`, or `unable to resolve
     handshake` lines.
3. **Promote to a RUNBOOK** at `docs/RUNBOOKS/clerk-secret-rotation.md`
   once we have >1 environment (staging/prod split). Keep the checklist
   in ADR form until then.

### LESSON — fly launch silently mutates fly.toml (M4-3 post-mortem)

**Trigger:** M4-3 `fly launch --copy-config --no-deploy` against Fly's
remote config writer. Two silent mutations we only caught because we
diffed the file afterward — no warning from flyctl for either.

**Mutation 1 — region substitution:** we passed `--region sea` on the
command line. flyctl's output rendered `Region: San Jose, California
(US) (specified on the command line)` — the `(specified on the command
line)` annotation is technically true but misleading because the
written value in fly.toml was `primary_region = 'sjc'`, not `sea`.
`fly platform regions` confirms Seattle is not in Fly's current US
region list (`iad / ord / dfw / lax / sjc / ewr / yyz`). flyctl
accepted the invalid region, silently picked the nearest available
(`sjc`), and rewrote the config without a single warning line.

**Mutation 2 — schema-invalid key dropped:** our original config placed
`swap_size_mb = 512` inside `[[vm]]`. Fly's docs list `swap_size_mb` as
a top-level key (sibling to `kill_signal` / `kill_timeout`). Fly's TOML
writer silently dropped the misplaced key when rewriting the file on
`--copy-config`. No warning in flyctl output, no schema validation
error, no diff summary — just gone. We only caught it by running
`diff -u` against a pre-launch snapshot of the intended config.

**Why this matters:** `fly launch --copy-config --yes` enables fully
non-interactive app provisioning, which we like for reproducibility.
But non-interactive + silent mutation = config drift we won't notice
unless we diff explicitly. The two mutations above are harmless
examples; next time it could be a dropped health check or a wrong
port.

**Action — mandatory for any future flyctl invocation that writes to
fly.toml on disk:**

1. Snapshot the intended `fly.toml` before running flyctl (`cp
   fly.toml /tmp/fly.toml.pre-launch` at minimum, ideally committed to
   git so it's in `HEAD`).
2. After flyctl returns, `diff -u` against the snapshot.
3. If diff shows any functional change (not just quote-style or
   whitespace), pause and resolve consciously before `fly deploy`.
4. Restore stripped comments from the snapshot — flyctl does not
   preserve them.

**General principle:** when any tool writes to a config file we own,
treat the post-write state as untrusted until diffed. Config drift
should always be a conscious choice, not an accident. This applies
beyond Fly — Vercel's `vercel link`, `gh repo create`, `aws
cloudformation deploy`, etc. all mutate config in ways worth diffing.

### ADDENDUM — Fly creates 2 machines by default (observed in M4-3)

Despite `min_machines_running = 0` in our `fly.toml`, `fly deploy`
provisioned 2 machines on first deploy with the console message:
`Creating a second machine for high availability and zero downtime
deployments.`

The `min_machines_running = 0` setting governs **idle** behavior
(scale-to-zero), **not** initial provisioning count. Fly's current
default for new apps is to create 2 machines for HA regardless.

**Cost impact:** negligible. At ~50 MB rootfs per machine, stopped
storage cost is ~$0.015/machine/month (~$0.18/year for the HA pair at
full idle). For DwellVerdict Phase 0, keeping the HA pair is correct
— zero-downtime deploys for free.

**To run strictly 1 machine:** `fly scale count 1 --yes`

If cost becomes a concern at higher machine counts (unlikely for the
modeling service), this is the knob.

---

## Accepted ADRs

### ADR-1 · Verdict Ledger design direction

**Date:** 2026-04-22
**Status:** accepted

**Context.** Early landing and authed layouts shipped in a Linear-school
cold-minimalism aesthetic. User review: "reads as generic AI-built
SaaS, not 'this founder has taste.'" DwellVerdict's audience is real
estate investors + agents — professional but emotional (they're
evaluating homes). The aesthetic reference that fits: Lattice, not
Linear. Warm professional, not cold precision.

**Decision.** Adopt the "Verdict Ledger" direction across the product:
- **Palette** — cream/paper ground (`--paper`), warm-charcoal ink
  (`--ink`), stone-muted secondary text (`--ink-muted`), terracotta
  (`#c55a3f`) as the single saturated accent. Shadcn neutrals remapped
  to the warm palette.
- **Typography system** — Instrument Serif 400 (brand wordmark only),
  Geist Sans 400/500/600/700 (interface), Geist Mono 400/500 (data).
  Three fonts, three jobs. Zero overlap. Weight cap at 500 on body
  sans to force hierarchy via tracking and size.
- **Motion** — reverses the Phase A "CSS-only" decision. Installed
  `motion` (successor to Framer Motion, ~1.3 kb tree-shaken). Scope
  limited to: hero stagger-reveal, VerdictDial scroll-into-view, hover
  states on cards. Not for decorative or scroll-parallax effects.
- **Signature components** — `VerdictDial` (engraved-style ring with
  em-scaled inner label) + `VerdictCertificate` (3 px terracotta left
  stripe on cream card with layered warm shadow). Both reusable
  across landing anatomy preview AND future property reports.

**Consequences.**
- +4-6 kb gzipped for Motion + ~8 kb for Instrument Serif in the
  production bundle. Acceptable for Phase 1 at pre-revenue scale.
- Creates visual system coherence: the dial, card stripe, and wordmark
  peak all use terracotta — seeing one primes the viewer for the
  others.
- Commits us to this aesthetic direction. A future rebrand would
  require touching the whole token system, not just swapping icons.
- Unlocks a real design system for Phase 1+ features (property cards,
  comp rows, forecast panels will all inherit these tokens).

**Revisit when.** Product expands beyond property reports (Scout chat
surfaces, tax strategy flows, operating dashboards) — may require
palette extensions or a dark-mode pass. Also revisit if we acquire
design headcount that wants to push further.

---

### ADR-2 · Defer dedicated logo mark to a designer workstream

**Date:** 2026-04-22
**Status:** accepted (with interim mark adopted)

**Context.** Three rounds of logo exploration in Phase C Redux:
1. Five seal directions (arc, monogram, stamped, circled-D, V-chevron)
2. Five real-estate + verdict fusions (roofline, pin + verdict,
   stamped deed, doorway, roof-and-ring)
3. Four brand identity approaches (integrated wordmark, DV monogram,
   folded deed, accent-V)

None of the nine concrete proposals hit the "memorable brand identity
that someone would describe to a friend" bar without significant
hand-design work. A founder-built-by-Claude-Code sandbox can get to
"legible SVG icons" but not to "mark a type designer would sign off on."

**Decision.** Ship with Approach A (Integrated Wordmark) as the
interim brand mark — "DwellVerdict" in Instrument Serif with a small
terracotta roof-peak above the V in "Verdict." The wordmark IS the
logo. Defer proper icon-mark exploration to a future designer
engagement.

**Consequences.**
- No favicon in production — browser tabs show Vercel's default icon.
- No app icon for future mobile or desktop wrappers.
- No dedicated OG image — social shares render default metadata preview.
- Brand works cleanly in wordmark-first contexts (landing, app header,
  emails, PDFs) and weaker in icon-first contexts (favicons, Slack
  avatars, partner badges, app-store tiles).
- Saves 4-8 hours that would otherwise go into sandboxing a mark we
  can't confidently say would survive a real design critique.

**Revisit when.**
- First designer engagement (contractor or hire) with brand chops.
- OR: the product hits a context where icon-first placement is
  strategically important (e.g., partnering with a marketplace that
  requires a listed app icon, Chrome extension, iOS app submission).
- OR: we reach a point where the wordmark cost becomes visible
  (e.g., press coverage keeps cropping us down to 32×32 favicon
  slots and we look worse than competitors).

**Path forward.** When revisited, the designer brief should include:
Lattice palette + Instrument Serif wordmark as the locked context;
terracotta accent + roof-peak motif as the visual vocabulary already
established; a favicon/app-icon/OG-image set as the deliverable.

---

### ADR-3 · Verdict generation via a POST route handler, not a server action

**Date:** 2026-04-22
**Status:** accepted

**Context.** `CLAUDE.md` → Coding Conventions says *"Server actions for
mutations. No REST endpoints for internal app traffic."* Sprint 2's
verdict-generation flow deviates: the address-paste mutation is a
server action (`createPropertyAction`) but the long-running Anthropic
call lives in a route handler (`POST /api/verdicts/[id]/generate`).

A single server action can't cleanly host the whole flow:
- Anthropic with web_search runs 20–40 s; occasionally 55 s.
- Server actions on Vercel Node runtime inherit the page's max
  duration (60 s on Pro) and block the action result, which blocks
  the client-side navigation that's already in flight.
- Breaking the flow into create-then-generate also lets the client
  show a loading state bound to a real DB row while the long work
  runs — without that seam, the UX is "30 seconds of nothing."

**Decision.** Split the flow:
- **Server action** (`createPropertyAction`) creates the property +
  pending verdict row and resolves in <1s. Client redirects.
- **Route handler** (`POST /api/verdicts/[id]/generate`) owns the
  Anthropic call with its own `maxDuration = 60`. Called by a client
  component on the detail page.

**Consequences.**
- One-time deviation from the no-REST rule, bounded to long-running
  AI work. Not a general precedent.
- Client now owns the "fire this off after navigation" responsibility
  — adds a small amount of code but keeps the server action fast.
- Route handler is idempotent (already-ready short-circuits, failed
  retries overwrite). Required because the client may retry on
  refresh.

**Revisit when.** Anthropic's streaming support reaches a place where
server actions with `useActionState` can stream the entire 30+ s
response cleanly, OR we adopt a job queue (Inngest, already in the
stack) and move verdict generation to background workers. Either
change would let us fold the REST endpoint back into the server
action.

---

### ADR-4 · Observability (PostHog / Sentry) deferred to Sprint 3

**Date:** 2026-04-22
**Status:** accepted (pending implementation)

**Context.** `CLAUDE.md` → Observability requires a PostHog event per
AI call, a Sentry transaction per server action, and Axiom logs for
every scrape. Sprint 2 ships verdict generation without any of the
three wired in.

**Decision.** Log observability fields (`model_version`,
`prompt_version`, `input_tokens`, `output_tokens`, `cost_cents`) to
the `verdicts` table in Sprint 2 so data accumulates correctly from
day one. Wire PostHog / Sentry / Axiom in Sprint 3 (M13 per roadmap).

**Consequences.**
- We can't see AI cost in a PostHog dashboard today. Ad-hoc SQL
  against the `verdicts` table covers the same ground for launch.
- Sentry transactions aren't wrapping the server action or route
  handler — unhandled errors surface only via Vercel runtime logs.
- The data we need for Sprint 3 dashboards is being collected now,
  so the Sprint 3 work is pure wiring, not backfill.

**Revisit when.** Sprint 3 kicks off. M13 has a concrete scope and
acceptance criteria in the roadmap doc.

---

### ADR-5 · Pricing simplification to one $20/mo plan + 1 lifetime free report

**Date:** 2026-04-23
**Status:** accepted

**Context.** `CLAUDE.md` → Pricing and billing specifies four tiers:
Free (3 basic reports / mo), Full Report ($29 one-time or 5/12 packs),
Pro ($79/mo), Portfolio ($199/mo). The founder's instinct after
reviewing cost exposure: **$29 is too high for per-property
evaluation at scale** — investors routinely screen dozens of
properties per week, and $29/each is friction-level expensive enough
to keep them out of the product entirely.

Simultaneously, the current AI-heavy verdict path (Sonnet 4.6 +
adaptive thinking + web_search) lands at ~$0.10–$0.60 per call.
Supporting a $29 price point at that cost is mechanically fine, but
supporting a $1 price point (the original counter-proposal) would
require $0.33 Stripe minimum fees + AI COGS to not exceed margin.
The only version where unit economics hold up is either (a) a
subscription with high gross margin, or (b) a dramatically cheaper
per-report cost. ADR-6 commits to (b). This ADR commits to (a).

**Decision.** Replace the four-tier pricing with a single plan:

- **Free trial:** 1 full report per user, ever. No account-level
  monthly refresh. Intended as a conversion trial, not an ongoing
  tier. The CTA after consumption is "subscribe to run more."
- **DwellVerdict Pro:** $20/month, up to **50 reports per calendar
  month** (reset on the 1st, aligned to Stripe invoice date).
  Unlimited saved properties, full verdict certificates, all
  features except the Portfolio-stage surfaces.

Dropped for now: the $29 one-time Full Report, the 5-pack ($99) and
12-pack ($199) bundles, the $79/mo and $199/mo subscription tiers.
Dropped-but-deferred (not archived): the Portfolio tier concept
($199/mo with PMS integration, actuals, operating copilot) will come
back as a separate ADR when we have a design partner asking for it.

**Monthly cap is hard.** 50/month is a real ceiling with a clear
upgrade-coming-next-month message, not a soft cap with overage
billing. Rationale: overages create support load and explanation
work disproportionate to their revenue contribution at this stage.
If a single whale actually hits the cap, we'll handle that case
manually and consider a power-user tier then.

**Consequences.**
- The `organizations.plan` enum simplifies to `free | pro | canceled`.
  Existing `portfolio` references removed (schema migration).
- `user_verdict_limits` is repurposed: tracks lifetime free-report
  consumption + monthly count + period reset for paid users.
  Renamed to `user_report_usage` to match its new role.
- Unit economics at current per-report COGS: 50 reports × $0.60 =
  $30 COGS vs $20 revenue → negative margin if a paid user actually
  hits the cap. **This only works after ADR-6 lands** — per-report
  COGS must drop to under $0.20 for the economics to hold. The two
  ADRs are intentionally paired in the same branch.
- The `reports` / credit-pack / bundle tables (if any were started)
  are dropped. One-time purchases disappear from the checkout flow.
- The pricing page collapses to one card + one CTA. Simpler marketing,
  less explanation work, easier to A/B.

**Revisit when.**
- A real user hits the 50/mo cap and asks for more. Add a power tier
  ($49/mo, 200 reports) or overage billing.
- Portfolio-stage features (PMS integration, operating copilot) reach
  a point where a design partner wants to pay for them. Reintroduce
  the Portfolio tier as a separate product, not as a pricing ladder
  on top of Pro.
- Per-report COGS regresses above $0.30 (Haiku price change, search
  fee change, regulatory licensing shift). At that point the $20
  price point may need to move.

---

### ADR-6 · Rules-first verdict architecture, AI reserved for narrative

**Date:** 2026-04-23
**Status:** accepted

**Context.** `CLAUDE.md` core principle #4 — *"Rules first, AI second,
proprietary data third. Do not add AI where rules work."* — was
violated by Sprint 2's verdict pipeline, which puts Sonnet 4.6 at
the centre of every verdict: the model issues web_search queries,
reads the results, reasons about comps / regulatory / location, and
renders the final output in one end-to-end call. The architecture
worked as a prototype but produced three compounding problems:

1. **Cost.** Sonnet 4.6 + adaptive thinking + 5 web searches +
   16K max_tokens ran $0.10–$0.60 per attempt. Failed attempts
   (timeouts, Vercel `maxDuration` kills) billed nearly as much as
   successful ones because Anthropic bills inference regardless of
   whether we receive the response. Today's dashboard: $7.32 spent
   across ~12 Anthropic calls with zero successful verdicts rendered.
2. **Latency.** Web-search tool-use with adaptive thinking ran 4+
   minutes on some addresses — unworkable inside Vercel's 300s route
   envelope even with streaming + aggressive envelope shrinking.
3. **Defensibility.** The product was a thin wrapper around Sonnet
   calling web_search. Anyone could replicate it. The moat was
   supposed to be our scoring rubric, curated regulatory DB, and
   comp-scraping pipeline — none of which existed yet.

The free-data stack listed in `CLAUDE.md` → Location Signals
(FEMA NFHL, Census ACS, FBI Crime, OpenStreetMap Overpass, USGS
wildfire) was supposed to power location signals from day one.
In practice Sprint 2 skipped all of it and let Sonnet "research"
each address live — expensive, variable, and legally thin (no
source-backed citations for anything).

**Decision.** Invert the architecture. AI becomes the last, cheapest
step; everything upstream is rules + free data. **No hand-curated
data** — every signal refreshes automatically.

**New pipeline (per verdict):**

1. **Parallel signal fetch** (all free, no AI):
   - FEMA NFHL → flood zone
   - USGS fire history → wildfire risk
   - FBI Crime Data API → crime rate vs metro
   - Census ACS → neutral demographic numbers (income, vacancy;
     never race/ethnicity, per fair housing rules)
   - OpenStreetMap Overpass → amenity counts within 0.5mi / 1mi,
     used to synthesize a walk-score proxy
   - Direct Airbnb StaysSearch (Apify fallback) → comp listings

2. **Deterministic computation:**
   - Revenue formula: `median(ADR) × median(occupancy) × 365 ×
     (1 − expense_ratio)` on returned comps
   - Walk score: weighted amenity sum (grocery 0.25, restaurant
     0.15, transit 0.20, etc.)
   - Location risk composite: flood + wildfire + regulatory flag

3. **Regulatory lookup — LLM + web_search + per-city cache.**
   No hand-curated JSON; there is no free "STR rules per US city"
   API and paid aggregators (Host Compliance, AirDNA regulatory)
   are all competitors whose data we'd rather not fund. Instead:
   - Keyed by `(city, state)` in a new `regulatory_cache` table.
   - On cache miss: Haiku 4.5 + web_search queries "`{city} {state}`
     short-term rental regulations", extracts a structured record
     (`str_legal`, `permit_required`, `owner_occupied_only`,
     `cap_on_non_oo`, `renewal_frequency`), and stores 2-4 source
     URLs it actually cited. Each source page is snapshotted to R2
     at cache-write time to satisfy `CLAUDE.md` core principle #7
     ("every regulatory claim has a source"). ~$0.03-0.05 per miss.
   - TTL: **30 days.** Cache hits are free. Stale-but-extant entries
     during the refresh window return immediately; the refresh runs
     via Inngest after the response so the user never waits.
   - Every user-facing regulatory assertion surfaces its source URL
     + `last_verified` date, and flags "informational — verify with
     city before committing."
   - Amortized cost: ~$2/mo for a portfolio covering ~50 cities
     (vs $500-5K/mo for Host Compliance equivalents).

4. **Place sentiment — LLM synthesis over review data, per-bucket
   cache.** What do real reviewers say about the *businesses,
   attractions, and physical environment* around this address?
   Scoped deliberately narrow per fair housing rules: signals are
   about **places and guest experience**, never about residents.
   - Keyed by `(lat_bucket, lng_bucket)` at ~100m × 100m
     resolution in a new `place_sentiment_cache` table.
   - Source mix per lookup:
     - **Yelp Fusion API** (free tier): businesses within 0.5mi
       radius, review snippets, aggregate star ratings by category
     - **Google Places Details**: up to 5 recent reviews per
       nearby business (free tier covers v0 volume)
     - **Airbnb listing reviews**: scraped alongside the comp
       listings we already fetch, filtered for neighborhood/area
       commentary (not property-specific)
   - Haiku 4.5 synthesizes 2-3 factual bullets per property with
     prompt-level fair-housing guardrails matching the Location
     Verdict rules in `CLAUDE.md`. Explicit allow-list of what
     the prompt may output (amenity mentions, noise/parking
     observations, tourist-draw proximity, construction activity)
     and explicit deny-list (anything about people, schools as
     quality, "family-friendly", subjective safety claims).
   - TTL: **30 days.** ~$0.02 per miss, effectively $0 at steady
     state because 100m buckets hit cached entries from prior
     verdicts in the same area.
   - Deploy-blocking golden-file tests under
     `packages/ai/tests/place-sentiment-fair-housing.test.ts`.

5. **Scoring rubric** (TypeScript function, not AI): weighted sum
   over the fetched signals → numeric score → BUY / WATCH / PASS +
   confidence.

6. **Haiku 4.5 narrative** (the final AI call): takes the
   structured signals + place-sentiment bullets + score as input,
   writes a 2-3 paragraph narrative explaining *why* this verdict,
   citing the specific data points. ~1.5K input / 500 output tokens
   → ~$0.005 per call.

**Per-report COGS (projected):**

| Component | Cost per verdict |
|---|---|
| FEMA / USGS / FBI / Census / Overpass | **$0** |
| Airbnb scrape (direct) or Apify fallback ($50/mo ÷ volume) | $0 – $0.05 |
| Yelp Fusion (free tier), Google Places (free tier) | $0 at v0 volume |
| Regulatory LLM+web_search (amortized, 30-day cache, ~50 cities) | **~$0.001** |
| Place sentiment LLM synthesis (amortized, 30-day cache, 100m buckets) | **~$0.001** |
| Haiku narrative | ~$0.005 |
| **Steady-state total** | **~$0.007 – $0.06** |

vs the Sonnet-first architecture at $0.10–$0.60. **15–100× cheaper.**
At $20/mo × 50 reports/mo cap = $1 max/sub/mo COGS. Healthy under
ADR-5's economics.

**Consequences.**
- `packages/ai/src/tasks/verdict-generation.ts` rewrites from "one
  big Anthropic call" to "orchestrator that fetches signals,
  computes a score, then asks Haiku for a narrative."
- New package: `packages/data-sources/` (FEMA, USGS, FBI, Census,
  Overpass, Yelp, Google Places clients, per-address cache in
  Postgres with 7-day TTL on raw data).
- New tables: `regulatory_cache` (keyed by city+state) and
  `place_sentiment_cache` (keyed by lat/lng bucket). Both with
  `last_verified_at` + `source_urls` + `r2_snapshot_keys`.
- New prompts:
  - `prompts/verdict-narrative.v1.md` (Haiku, structured-signals
    → narrative)
  - `prompts/regulatory-lookup.v1.md` (Haiku + web_search, city
    → structured regulatory record)
  - `prompts/place-sentiment.v1.md` (Haiku, review data →
    factual bullets with strict allow/deny lists)
  - All three have deploy-blocking golden-file tests.
- Inngest jobs for background cache refresh (regulatory and place
  sentiment): when a cache row's TTL expires, enqueue a refresh
  rather than blocking the user's verdict on the LLM call.
- Regulatory honesty: we're outsourcing regulatory interpretation
  to an LLM. **Hallucination risk is real** and the mitigation is
  (a) always surface the source URL, (b) always show `last_verified`
  date, (c) golden-file tests against known-correct rules for
  high-volume markets (Nashville, Scottsdale, Austin, Denver,
  Phoenix, etc.), (d) never phrase output as legal advice, always
  as "check with city before committing." We accept this tradeoff
  over licensing a competitor's data.
- Verdict quality on cities outside the golden-file set degrades
  gracefully: LLM regulatory lookup returns a best-effort record
  with source citations; UI flags the `last_verified` age and
  encourages user verification.
- `CLAUDE.md` → Model routing says Sonnet 4 for "location verdict
  synthesis" and "regulatory interpretation." This ADR narrows
  that: Sonnet 4 stays reserved for task types we haven't built
  yet (offer analysis, tax strategy); verdict narrative,
  regulatory lookup, and place sentiment all run on Haiku 4.5
  because the structured signals and strict prompt scoping do the
  heavy lifting and synthesis is cheap.
- `CLAUDE.md` → Pricing section needs a rewrite to match ADR-5.
  Done in the same branch.

**Revisit when.**
- Regulatory golden-file tests start failing for a city we care
  about (LLM output drifts from known-correct rules). Either tune
  the prompt, upgrade that city's lookup to Sonnet 4.6, or build
  a dedicated scraper for that city's STR permit portal. Per-city
  scrapers are still on the table — we just don't start with them.
- A paid regulatory aggregator becomes cheap enough that the
  LLM-hallucination risk isn't worth the savings. Write a
  cost-vs-risk ADR at that point.
- Haiku-quality narrative regresses on a benchmark address (the
  output reads generic or loses citations). Upgrade that specific
  task to Sonnet 4.6 via the task registry — the routing is
  per-task, not global.
- A paid data source becomes undeniably better than our free-stack
  equivalent (e.g., Walk Score API beats our Overpass-derived walk
  score by a measurable margin on a design partner's portfolio).
  At that point license it with a standalone cost-justification ADR.
- Reddit loosens commercial API terms or an open-data alternative
  emerges (e.g., a Common Crawl-style neighborhood corpus).
  Consider adding Reddit/forum data to the place-sentiment sources
  at that point.

---

### ADR-7 · v0 scope ladder, small-operator persona, and dogfooding commitment

**Date:** 2026-04-23
**Status:** accepted

**Context.** Several threads converged into one scoping decision:
- ADR-5 simplified pricing but left "what actually ships in v0"
  undefined.
- ADR-6 laid out the data architecture but not which product
  surfaces it serves.
- A competitive scan (HouseCanary, AirDNA, BNBCalc, Guesty,
  Hostaway, Lodgify, Turnify, Buildium) showed a clean gap: no
  competitor serves solo-to-small operators (1-5 properties)
  across the full lifecycle at a flat low price. Everyone is
  either evaluate-only or manage-only, and every PMS prices
  per-listing.
- The founder is personally closing on an Airbnb property with
  a renovation in flight — **dogfooding opportunity on Buying
  and Renovating stages** that will drive real scope decisions.

This ADR pins down the v0 scope, the persona, and the guardrails
that prevent scope creep back into enterprise-grade or paid-
aggregator directions.

**Decision.**

**Persona (explicit):** Solo-to-small STR/LTR operator with 1-5
properties. Both entry points supported:
- "Evaluator" — considering a purchase, starts at Finding
- "Manager" — already owns, starts at Managing ("I already own
  this property" flow)

We are explicitly **not**:
- HouseCanary (enterprise AVM for institutions)
- AirDNA (proprietary STR market data for analysts)
- Guesty / Hostaway / Lodgify (multi-channel-distribution PMS
  for portfolio operators)
- Propstream / Propwire (wholesaler prospecting with
  owner/mortgage/distress data)

**Positioning (explicit):** The easy, affordable, full-lifecycle
tool for the 1-5-property host. Flat pricing (not per-listing).
No fluff — features that work and make life easier.

**v0 scope ladder — all five stages are real features:**

| Stage | v0 reality | Free-services stack |
|---|---|---|
| **Finding** | Paste address → verdict certificate with BUY/WATCH/PASS, scoring, signals, narrative | FEMA, USGS, FBI, Census, Overpass, Yelp, Google Places, Zillow/Redfin scrape, Airbnb scrape |
| **Evaluating** | Save property, scenario sliders (occupancy, ADR, expenses), LTR vs STR comparison, notes | Same signals + Neon persistence |
| **Buying** | Key deadlines checklist, document vault, contacts (agent/lender/inspector/title/attorney), notes timeline, closing costs budget | Neon + R2 |
| **Renovating** | Scope list, budget tracker (budgeted → committed → spent), task checklist, contractor contacts + quotes, receipt/photo upload, timeline view | Neon + R2 |
| **Managing** | "I already own this" entry, CSV import (Airbnb/Hospitable/Guesty/Hostaway formats), actuals-vs-forecast dashboard, expense tracking categorized by Schedule E, tax-ready annual summary | CSV parser + Neon |

Nothing in v0 is a "coming soon" waitlist surface. Every stage is
usable from launch. Fidelity is "basic but complete" — not
demo-ware, not enterprise-grade.

**Dogfooding commitment.** The Buying and Renovating features will
be used by the founder on a live purchase during v0 development.
Every usability friction, missing feature, and unclear UI hit in
dogfood becomes a v0 fix, not a v1 defer. Dogfooding ends when
the founder closes on the property; features added mid-dogfood
are committed scope.

**No-paid-data guardrail.** The following data sources are
explicitly out until a specific user-demand trigger is logged:
- HouseCanary, ATTOM, CoreLogic, DataTree, Estated (property,
  owner, mortgage data)
- AirDNA, Rabbu (proprietary STR market data)
- GreatSchools, Walk Score, FirstStreet, AreaVibes (neighborhood
  quality scores)
- Host Compliance, STRGuard (regulatory aggregators)
- Paid MLS / RETS feeds

**Revisit threshold:** 100 paying subscribers AND a specific
user-logged request tied to a concrete deal or decision we
cannot support on the free-services stack. Any paid data source
needs its own cost-justification ADR.

**Explicitly excluded signals** (per fair housing discipline +
persona relevance):
- School ratings in any form (legally radioactive — Redfin/HUD
  settlement precedent, irrelevant for STR)
- Subjective resident demographic characterizations
- Propwire-class wholesaler data (owner info, mortgage, absentee
  flag, distress indicators) — different product, different
  persona. Not "deferred" — actively out.

**Consequences.**
- All five stages get real UI in v0. No "coming soon" surfaces
  for the core five.
- Managing gets more scope weight than a typical MVP would assign
  it — it's the feature where $20/mo flat most clearly beats
  Lodgify/Hostaway/Guesty at the 3-property scale, and it's the
  only entry point for the "manager" persona.
- Buying + Renovating fidelity is set by founder dogfooding,
  not a theoretical spec. Real use drives scope.
- No-paid-data guardrail means some features competitors have
  (ATTOM owner data, GreatSchools ratings, AirDNA market
  forecasts, Propwire prospecting) do not exist in our product.
  Marketing and UI must be honest about this rather than
  implying parity.
- Decision velocity: future feature requests get a yes/no in
  30 seconds via the persona + no-paid-data rules, not 30
  minutes of re-litigation.

**Revisit when.**
- Paid user count crosses 100 AND a specific paid-data-source
  request lines up with a lost-deal story.
- Persona shifts in practice (we find real users are 10+-property
  operators, requiring per-listing pricing + enterprise features).
- A competitor launches a flat-priced full-lifecycle product,
  changing the positioning calculus.
- Founder's own dogfooding reveals a category of feature we
  missed (e.g., inspection-contingency workflow patterns,
  specific renovation phase tracking).

---

### ADR-8 · Add DwellVerdict Pro tier at $40/mo with Scout chat exclusivity

**Date:** 2026-04-23
**Status:** accepted (supersedes ADR-5's single-plan decision)

**Context.** ADR-5 established one $20/mo plan + 1 lifetime free
report. As we scoped Scout (the CLAUDE.md AI assistant) into v0,
cost-variance analysis showed chat is the only feature whose
COGS scales with *user engagement* rather than user count:

- Verdicts, place sentiment, regulatory lookups, Managing
  dashboards — all cached or bounded per-verdict. Costs scale
  with subscriber count.
- Chat at 30 messages/day × 30 days × ~$0.02/msg = ~$18/user/mo
  worst case on Haiku 4.5.

A single-tier $20/mo plan with unlimited Scout chat has negative
margin in the abuse case. Two options: tight chat rate limits
on the $20 plan (5/day ≈ ~$3/mo worst case), or gate chat behind
a higher tier. The higher tier doubles as a conversion upsell.

**Decision.** Add a second paid tier. Scout chat is the only
feature exclusively gated behind it; everything else remains in
the base tier so the $20 subscriber still gets the full
five-stage product.

**Final structure:**

|                    | **Free trial** | **DwellVerdict** | **DwellVerdict Pro** |
|---|---|---|---|
| Price              | $0             | $20/mo           | $40/mo               |
| Reports            | 1 lifetime     | 50/mo            | 200/mo               |
| Properties saved   | 1              | unlimited        | unlimited            |
| All five stages    | Finding only   | ✓                | ✓                    |
| Managing dashboard | —              | ✓                | ✓                    |
| Buying + Renovating PM | —          | ✓                | ✓                    |
| PDF export of verdicts | —          | ✓                | ✓                    |
| Scout AI chat      | —              | —                | **✓** (30/day, 300/mo cap) |
| Priority verdict queue | —          | —                | ✓                    |

**Rationale for these knobs:**
- **Scout on Pro only** — matches the cost profile (the single
  engagement-scaled COGS).
- **50 vs 200 reports** — gives Pro a substantive differentiator
  beyond chat. 200/mo (~7/day) is serious-scout territory.
- **Priority verdict queue at Pro** — effectively free for us
  (one job-queue re-ordering) but a real user benefit.
- **PDF export in both tiers** — not COGS-sensitive, would be
  cruel to withhold.
- **All five stages in both tiers** — the $20 subscriber gets the
  full lifecycle product, not a crippled version. Key to
  positioning.

**Worst-case COGS:**
- DwellVerdict ($20): 50 reports × $0.007 = $0.35/sub/mo → 98%
  gross margin
- DwellVerdict Pro ($40): 200 × $0.007 + 300 chats × $0.02 =
  $7.40/sub/mo → 81% gross margin

**Consequences.**
- Two Stripe products (recurring). Upgrade/downgrade flow via
  Stripe Billing Portal.
- `organizations.plan` enum: `free | starter | pro | canceled`.
- `consumeReport` is plan-aware: 50/mo cap for starter, 200/mo
  cap for pro, 1-lifetime for free.
- New `canUseScout(plan)` gate on both chat UI and chat route.
- Pricing page has two cards + a comparison matrix.
- ADR-5's "single plan" decision is superseded by this ADR;
  ADR-8 is the current source of truth for pricing shape.
- ADR-5 stays in the log as the record of "we simplified from
  four tiers to one," which is still true — we then added a
  narrow second tier for chat-cost safety + upsell, not a
  return to the original ladder.

**Revisit when.**
- A pattern shows $20 users are heavy chat-requesters but don't
  upgrade — we're losing conversion, maybe chat belongs in the
  base tier with a metered cap.
- Haiku pricing shifts materially (price change, model routing
  update).
- Competitor pricing shifts enough that $20/$40 is no longer
  well-placed.
- A third tier becomes obvious (team/portfolio features at
  $80-150/mo for users running 5+ properties as a side business).

