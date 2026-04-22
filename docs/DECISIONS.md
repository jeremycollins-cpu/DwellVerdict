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

---

## Accepted ADRs

_Initialized in M6._
