# DECISIONS.md

Lightweight ADR log for DwellVerdict. Every decision that deviates from
`CLAUDE.md` or the technical spec lands here. The first five ADRs — the
foundational stack choices — are initialized in M6 as part of the Phase 0
wrap-up. Interim entries (like outstanding TODOs) live under **Pending**
until they're resolved or promoted to a full ADR.

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

---

## Accepted ADRs

_Initialized in M6._
