# Runbook — Sprint 2 verdict generation

What it takes to bring Sprint 2 live in production after the code has
merged.

## 1. Provision API keys

Two new third-party dependencies:

**Google Maps / Places**
1. Google Cloud Console → APIs & Services → Credentials → Create credentials → API key
2. Enable: Places API (New), Maps JavaScript API
3. Restrict the key:
   - Application restriction: HTTP referrers
   - Allow: `https://dwellverdict.com/*`, `https://*.vercel.app/*`, `http://localhost:3000/*`
   - API restriction: Places API + Maps JavaScript API only
4. Add to Vercel (Production, Preview, Development scopes): `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
5. **Do not** mark this key as Sensitive in Vercel — it's `NEXT_PUBLIC_*` and ships to the browser. The HTTP referrer restriction is what protects it.

Cost: $0.017 per Places autocomplete lookup. Budget ~$2–5/month at launch volume.

**Anthropic**
1. console.anthropic.com → API Keys → Create key named "dwellverdict-prod"
2. Add to Vercel Production only, marked Sensitive: `ANTHROPIC_API_KEY`
3. Preview + Development: create a separate key named "dwellverdict-dev" to isolate spending

Cost: ~$0.14 per verdict (Sonnet 4.6 tokens + 5× $0.01 web_search). Budget ~$15/mo at 100 verdicts/mo launch volume.

## 2. Apply the migration

Schema changes land in migration `0001_late_thaddeus_ross.sql`:
- `properties.google_place_id` + `properties.address_full` columns
- `verdicts` table (immutable snapshots)
- `user_verdict_limits` table (free-tier metering)
- Partial unique index on `(org_id, google_place_id)`

```bash
# From the repo root, with DATABASE_URL set to the Neon main branch:
pnpm --filter @dwellverdict/db db:migrate
```

The script uses the HTTPS driver (`neon-http/migrator`) so it works from
any shell with outbound 443. For Neon dev branches, repeat with
`DATABASE_URL` pointing at each branch.

## 3. Smoke test

Three real addresses across the launch markets:

1. **Nashville STR-heavy:** 123 3rd Ave S, Nashville, TN 37201
2. **Scottsdale resort:** 7007 E Greenway Pkwy, Scottsdale, AZ 85254
3. **Gatlinburg cabin:** 916 Campbell Lead Rd, Gatlinburg, TN 37738

For each:
- Paste on `/app/properties`
- Confirm the loader auto-triggers after redirect
- Verdict should render in 20–40s
- Verify: signal present, confidence 0–100, 2+ sources, narrative 2–4 paragraphs
- Fair-housing spot check: narrative references data, not resident demographics

If a verdict fails, inspect the `verdicts.error_message` column and the
Vercel runtime log for the route handler.

## 4. Cost tracking

Every successful verdict writes `cost_cents`, `input_tokens`,
`output_tokens`, `model_version`, and `prompt_version` to the `verdicts`
row. Query to confirm reporting:

```sql
SELECT
  date_trunc('day', created_at) AS day,
  COUNT(*) AS verdicts,
  SUM(cost_cents) / 100.0 AS total_usd,
  AVG(cost_cents) AS avg_cents,
  SUM(input_tokens) AS input_tokens,
  SUM(output_tokens) AS output_tokens
FROM verdicts
WHERE status = 'ready'
GROUP BY 1
ORDER BY 1 DESC;
```

If `AVG(cost_cents)` drifts above ~20 cents, the model is running more
web searches than expected — check `max_uses` in
`packages/ai/src/tasks/verdict-generation.ts`.

## 5. Free-tier quota behaviour

Free users get 3 verdicts per 30-day rolling window (anchored to first
use, not calendar month — see `user_verdict_limits.reset_at`). Failed
generations are refunded via `refundFreeVerdict()` in the route handler.

To manually reset a user's quota for testing:

```sql
UPDATE user_verdict_limits
SET verdicts_this_month = 0, reset_at = NOW() + interval '30 days'
WHERE user_id = (SELECT id FROM users WHERE email = 'test@example.com');
```

## 6. Rollback

Rolling back the route handler is safe — `verdicts` rows persist,
pending rows stay pending. The `generate` route is idempotent, so
callers can retry once the deploy is healthy again.

Rolling back the schema migration is **not** safe after any production
traffic — `verdicts` and `user_verdict_limits` may have rows. Prefer
forward fixes.
