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

_Initialized in M6._
