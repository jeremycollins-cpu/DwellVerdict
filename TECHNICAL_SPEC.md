# Parcel — Technical Architecture & Data Strategy

**A build-ready specification for Claude Code**

Version 1.0 · April 2026

---

## How to use this document

This document is the full technical specification for building the Parcel MVP (and the v2 moat features). It is written to be consumed by Claude Code as a build prompt.

- **Sections 1–3** are architecture decisions, stack, and repo structure. Read first.
- **Sections 4–5** are the data strategy: schema, sourcing, regulatory build, and the actuals pipeline.
- **Section 6** is the modeling stack — comp engine, amenity coefficients, forecast engine.
- **Section 7** is infrastructure, costs, and unit economics at scale. This section is load-bearing for the profitability story.
- **Section 8** is a phase-by-phase build plan aligned with Claude Code workflows.
- **Section 9** is the hiring and eng cost model for 18 months.
- **Appendix A** is `CLAUDE.md` contents for the repo.

**Product name used throughout:** `Parcel` (placeholder — replace globally when brand is locked).

**Guiding constraints:**

1. Phase 1 must be buildable by one founder with Claude Code for under **$300/month in infra** at 100 active users.
2. Every architectural decision must survive scaling to 10,000 paid accounts without a rewrite.
3. Rules first. AI second. Proprietary data third. The order is not optional.
4. No PMS, no bookkeeping, no guest messaging in phase 1. The MVP is the Underwriting Workbench.

---

## 1. Architecture Decisions — The Short List

These are the locked decisions. Anything not on this list is a later judgment call.

| Decision | Choice | Why |
|---|---|---|
| App framework | **Next.js 15 (App Router)** on Vercel | Claude Code is fluent; server components remove half the API boilerplate; Vercel's free tier covers phase 1 |
| Primary language (app) | TypeScript | Type safety pays for itself on a data-heavy app |
| Primary language (modeling) | Python 3.12 | Numerical work belongs in Python; pandas/polars/scikit ecosystem |
| Modeling service | **FastAPI on Fly.io** (single region, auto-stop) | Separate service from day one; Fly.io scale-to-zero keeps phase 1 costs near zero |
| Database | **Postgres on Neon** | Branching for dev environments, scale-to-zero, cheap; Supabase is second choice |
| ORM | **Drizzle** | Claude Code produces cleaner Drizzle than Prisma; closer to SQL; no runtime overhead |
| Auth | **Clerk** (phase 1), self-host later | Free to 10K MAU; saves a week of build time |
| Payments | **Stripe** | Non-negotiable |
| Email (transactional) | **Resend** | Free tier, great DX |
| File storage | **Cloudflare R2** | S3-compatible, zero egress fees (critical for serving property briefs at scale) |
| Background jobs | **Inngest** | Free tier generous; triggers and retries are handled; no Redis to manage |
| Scraping / ingestion | **Python workers on Fly.io**, run by Inngest | Keeps scraping isolated from the app |
| LLM gateway | **Anthropic API** (Claude Sonnet 4) for all user-facing AI; **Haiku 4.5** for bulk tasks | Consistent with tool approval policy; Claude is the house model |
| Observability | **Sentry** (errors) + **PostHog** (product) + **Axiom** (logs) | All have free/low tiers |
| Internal BI | **Metabase** self-hosted on Fly.io (v2) | Free; connects to Neon read replica |
| CDN / edge | **Cloudflare** (proxied DNS) | Free tier covers phase 1 |

**What we are explicitly NOT choosing yet:**

- **Not Kubernetes.** Not now, possibly not ever. Fly.io + Vercel + Neon is the stack until ~$3M ARR.
- **Not a data warehouse** in phase 1. Postgres is the warehouse. Move to BigQuery or Snowflake when the actuals corpus exceeds 5M rows (~year 2).
- **Not a feature store.** Build coefficients as versioned Postgres tables with a simple API. Feast comes later.
- **Not GraphQL.** tRPC or plain REST. GraphQL adds complexity without benefit at this scale.
- **Not microservices.** Two services: `web` (Next.js) and `modeling` (FastAPI). That's it.

---

## 2. The Stack, End to End

```
┌─────────────────────────────────────────────────────────────┐
│                        User Browser                          │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTPS
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare (DNS + WAF + CDN)                                │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Vercel — Next.js 15 App Router                              │
│  • Server components (most pages)                            │
│  • Server actions for mutations                              │
│  • /api routes for webhooks (Stripe, Clerk, Inngest)         │
│  • Clerk middleware for auth                                 │
└──────┬─────────────────┬──────────────────┬─────────────────┘
       │                 │                  │
       │ Drizzle         │ HTTP (JWT)       │ HTTP
       ▼                 ▼                  ▼
┌──────────────┐  ┌──────────────────┐  ┌─────────────────────┐
│  Neon        │  │  FastAPI         │  │  Anthropic API      │
│  Postgres    │  │  (Fly.io)        │  │  Claude Sonnet 4    │
│              │  │  • Comp engine   │  │  Claude Haiku 4.5   │
│              │  │  • Forecast      │  │                     │
│              │  │  • Amenity model │  │                     │
└──────┬───────┘  └────────┬─────────┘  └─────────────────────┘
       │                   │
       │ SQL               │ read Postgres
       │                   │
       └───────┬───────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  Inngest — Background Jobs                                   │
│  • Daily listing ingest                                      │
│  • Regulatory scrape / diff / alert                          │
│  • Property brief PDF generation                             │
│  • Nightly aggregations                                      │
└──────┬──────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Python Workers (Fly.io, scale-to-zero)                      │
│  • Listing scrapers (Airbnb, Vrbo where permitted)           │
│  • MLS ingestion (where licensed)                            │
│  • Regulatory page scrapers                                  │
│  • Rabbu / AirDNA API clients (phase 1 comp bootstrap)       │
└──────┬──────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare R2 — Object Storage                              │
│  • Property brief PDFs                                       │
│  • Scraped HTML snapshots (regulatory provenance)            │
│  • Raw listing exports                                       │
└─────────────────────────────────────────────────────────────┘
```

**Request flow — user runs an underwrite:**

1. User opens property page in Next.js. Server component fetches property from Postgres via Drizzle.
2. User hits "Run underwrite." Server action calls FastAPI `/forecast` with property_id and scenario_params.
3. FastAPI reads listing comps + regulatory data + amenity coefficients from Postgres.
4. FastAPI returns forecast JSON (revenue, expenses, IRR, scenarios). Latency target: < 2 seconds at p95.
5. Server action writes forecast to `forecasts` table with full assumption snapshot.
6. Next.js streams the updated UI back to the user.

**Request flow — user connects PMS (v2):**

1. User clicks "Connect Hostaway" in settings. OAuth flow via Hostaway's app marketplace.
2. Webhook lands on `/api/integrations/hostaway/webhook`. Queued to Inngest.
3. Inngest worker pulls reservations, writes to `property_actuals` with source tag.
4. Nightly job reconciles actuals against most recent forecast for each property, writes `actuals_vs_forecast`.
5. User sees updated pacing on their dashboard.

---

## 3. Repository Structure

Monorepo using pnpm workspaces. One repo, two deployable services, shared types.

```
parcel/
├── apps/
│   ├── web/                          # Next.js 15 app
│   │   ├── app/
│   │   │   ├── (marketing)/          # Public pages
│   │   │   ├── (app)/                # Authed app
│   │   │   │   ├── properties/
│   │   │   │   ├── underwrite/
│   │   │   │   └── settings/
│   │   │   └── api/
│   │   │       ├── webhooks/
│   │   │       │   ├── stripe/
│   │   │       │   ├── clerk/
│   │   │       │   └── inngest/
│   │   │       └── trpc/             # optional — tRPC router
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── db/                   # Drizzle client
│   │   │   ├── auth.ts
│   │   │   ├── modeling-client.ts    # typed client for FastAPI
│   │   │   └── ai/                   # Anthropic wrappers
│   │   └── package.json
│   │
│   └── modeling/                     # FastAPI service
│       ├── parcel_modeling/
│       │   ├── api/
│       │   │   ├── forecast.py
│       │   │   ├── comps.py
│       │   │   └── amenity.py
│       │   ├── engines/
│       │   │   ├── comp_selection.py
│       │   │   ├── revenue_model.py
│       │   │   ├── expense_model.py
│       │   │   └── scenario.py
│       │   ├── data/
│       │   │   └── repos.py          # Postgres read access
│       │   └── main.py
│       ├── tests/
│       └── pyproject.toml
│
├── packages/
│   ├── db/                           # Shared Drizzle schema (source of truth)
│   │   ├── schema/
│   │   │   ├── properties.ts
│   │   │   ├── listings.ts
│   │   │   ├── regulatory.ts
│   │   │   ├── forecasts.ts
│   │   │   ├── actuals.ts
│   │   │   └── users.ts
│   │   └── migrations/
│   │
│   ├── types/                        # Shared TS types
│   ├── ui/                           # Shared React components (shadcn/ui)
│   └── workers/                      # Python ingestion workers
│       ├── scrapers/
│       ├── regulatory/
│       └── ingestors/
│
├── infra/
│   ├── fly.modeling.toml
│   ├── fly.workers.toml
│   └── neon-setup.md
│
├── docs/
│   ├── CLAUDE.md                     # Claude Code instructions
│   ├── DECISIONS.md                  # ADRs
│   └── RUNBOOKS/
│
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

**Why this structure for Claude Code specifically:**

- **Drizzle schema in a shared package** means Claude Code can reference canonical types in both `apps/web` and generate type-safe FastAPI Pydantic models from the same source.
- **Modeling is a separate app, not a package**, because it deploys independently and has its own language runtime. Claude Code handles this cleanly when the boundary is explicit.
- **`docs/CLAUDE.md`** gives Claude Code the repo rules in a canonical place (see Appendix A).
- **Turborepo for caching** — shaves minutes off every CI run. Free.

---

## 4. Data Model (Postgres Schema)

This is the schema for phase 1. Every table has `id uuid default gen_random_uuid()`, `created_at`, `updated_at`. Row-level security (Clerk `org_id` / `user_id` scoping) is enforced in application code, not RLS policies — Neon RLS is fine but complicates migrations.

### Core entities

```sql
-- users & orgs (mirrored from Clerk)
users (
  id uuid pk,
  clerk_id text unique,
  email text,
  name text,
  created_at, updated_at
)

organizations (
  id uuid pk,
  clerk_org_id text unique,
  name text,
  stripe_customer_id text,
  plan text,  -- starter | pro | portfolio
  created_at, updated_at
)

organization_members (
  org_id uuid fk,
  user_id uuid fk,
  role text,  -- owner | member
  primary key (org_id, user_id)
)

-- the atomic unit: the property
properties (
  id uuid pk,
  org_id uuid fk,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,
  county text,
  lat numeric(10,7),
  lng numeric(10,7),
  parcel_id text,              -- from public records where available
  property_type text,          -- single_family | townhouse | condo | multi_family
  bedrooms int,
  bathrooms numeric(3,1),
  sqft int,
  lot_sqft int,
  year_built int,
  status text,                 -- prospect | under_contract | owned | sold
  purchase_price numeric(12,2),
  close_date date,
  source_url text,             -- Zillow/Redfin/MLS origin
  listing_data jsonb,          -- raw extracted listing fields
  created_at, updated_at
)
-- Indexes: (org_id), (lat, lng) gist, (city, state), (parcel_id)

property_amenities (
  property_id uuid fk,
  amenity_code text,           -- hot_tub | pool | ev_charger | ...
  source text,                 -- user | extracted | comp_inferred
  confidence numeric(3,2),
  primary key (property_id, amenity_code)
)
```

### Comp data

```sql
-- every comparable STR listing we've indexed
listings (
  id uuid pk,
  external_id text,            -- vendor-provided id
  source text,                 -- airbnb | vrbo | rabbu | airdna | user_contributed
  address_line1 text,
  city text, state text, zip text,
  lat numeric(10,7), lng numeric(10,7),
  bedrooms int, bathrooms numeric(3,1),
  sqft int,
  property_type text,
  amenities text[],
  active boolean,
  last_seen_at timestamptz,
  created_at, updated_at
)
-- Indexes: (lat, lng) gist, (city, state, bedrooms), (source, external_id) unique

-- monthly performance snapshots for listings
listing_performance (
  listing_id uuid fk,
  period_month date,           -- first of month
  occupancy numeric(4,3),
  adr numeric(10,2),
  revpar numeric(10,2),
  revenue numeric(12,2),
  nights_booked int,
  nights_available int,
  source text,                 -- rabbu | airdna | pms_connected | scraped
  primary key (listing_id, period_month, source)
)

-- chosen comps for a specific property (pinned by the user or the algo)
property_comps (
  property_id uuid fk,
  listing_id uuid fk,
  rank int,                    -- 1-8
  similarity_score numeric(4,3),
  selection_source text,       -- auto | user_added | user_kept
  rationale text,              -- why the algo picked it (AI explanation)
  added_at timestamptz,
  primary key (property_id, listing_id)
)
```

### Regulatory data

This is where the moat is earned. See Section 5.2 for the full build plan.

```sql
regulatory_jurisdictions (
  id uuid pk,
  level text,                  -- state | county | city | hoa | zone_overlay
  parent_id uuid fk,
  name text,
  geometry geography,          -- PostGIS polygon
  source_urls text[],
  last_verified_at timestamptz,
  verified_by text,            -- human curator id | auto
  created_at, updated_at
)

regulatory_rules (
  id uuid pk,
  jurisdiction_id uuid fk,
  rule_type text,              -- str_allowed | permit_required | owner_occupancy | min_stay | cap_count | zoning_class
  rule_value jsonb,            -- structured value depending on type
  effective_date date,
  expires_date date,
  source_document_url text,
  source_snapshot_r2_key text, -- the HTML/PDF we scraped
  ai_extracted boolean,
  human_verified boolean,
  created_at, updated_at
)

property_regulatory_assessments (
  property_id uuid fk,
  jurisdiction_ids uuid[],
  risk_score int,              -- 0-100
  risk_badge text,              -- green | yellow | red
  applicable_rules jsonb,
  uncertainty_flags text[],
  generated_at timestamptz,
  primary key (property_id, generated_at)
)
```

### Forecasts & actuals

This is where the forecast-to-actuals loop lives. Every forecast is immutable — never edit in place. The "current" forecast is the most recent one.

```sql
forecasts (
  id uuid pk,
  property_id uuid fk,
  org_id uuid fk,
  created_by uuid fk,           -- user_id
  scenario text,                -- base | downside | stretch
  assumptions jsonb,            -- full assumption snapshot (financing, ops, pricing)
  comps_snapshot jsonb,         -- the exact comps used, frozen
  regulatory_snapshot jsonb,    -- regulatory state at forecast time
  revenue_monthly numeric(10,2)[12],
  occupancy_monthly numeric(4,3)[12],
  adr_monthly numeric(10,2)[12],
  expenses_monthly jsonb,
  net_operating_income numeric(12,2),
  cash_on_cash numeric(6,4),
  irr_10yr numeric(6,4),
  model_version text,           -- which forecast engine version
  created_at timestamptz
)

-- (v2) actuals from connected PMS / bookkeeping
property_actuals (
  property_id uuid fk,
  period_month date,
  revenue numeric(12,2),
  occupancy numeric(4,3),
  adr numeric(10,2),
  nights_booked int,
  expenses jsonb,
  source text,                  -- hostaway | ownerrez | plaid | manual
  ingested_at timestamptz,
  primary key (property_id, period_month, source)
)

-- (v2) scored reconciliation
actuals_vs_forecast (
  property_id uuid fk,
  forecast_id uuid fk,
  period_month date,
  revenue_forecast numeric(12,2),
  revenue_actual numeric(12,2),
  revenue_delta_pct numeric(6,3),
  occupancy_delta_pct numeric(6,3),
  adr_delta_pct numeric(6,3),
  computed_at timestamptz,
  primary key (property_id, forecast_id, period_month)
)
```

### Amenity impact (v1.5)

```sql
amenity_coefficients (
  id uuid pk,
  amenity_code text,
  market_cluster text,          -- bucketed market (e.g. "mountain_destination_medium")
  property_type text,
  bedroom_bucket text,          -- 1-2 | 3-4 | 5+
  revenue_lift_pct numeric(5,4),
  revenue_lift_absolute numeric(12,2),
  adr_lift_pct numeric(5,4),
  occupancy_lift_pct numeric(5,4),
  sample_size int,
  confidence_interval jsonb,
  model_version text,
  computed_at timestamptz
)
```

**Why coefficients are a table, not a feature store:**

In phase 1 you'll have maybe 50,000 listings worth of performance data. A feature store is overkill. A versioned Postgres table is queryable, auditable, and Claude Code can maintain it. Revisit when the corpus hits 1M+ listing-months.

### Audit and provenance

```sql
data_sources (
  id uuid pk,
  source_type text,             -- listing_scrape | regulatory_scrape | api_pull | user_input
  vendor text,                  -- rabbu | airdna | manual | ...
  url text,
  r2_snapshot_key text,         -- the raw artifact
  checksum text,
  fetched_at timestamptz,
  license_terms text            -- notes on reuse rights
)

change_log (
  id uuid pk,
  entity_type text,
  entity_id uuid,
  changed_by text,
  change jsonb,                 -- diff
  reason text,
  created_at
)
```

**Every regulatory rule has a raw source snapshot in R2.** This is non-negotiable. If a user gets a regulatory classification wrong, you must be able to show the exact HTML/PDF that was parsed, the date it was scraped, and the extraction version. This is trust insurance.

---

## 5. Data Strategy

### 5.1 Data inventory and sourcing plan

| Data category | Phase 1 source | Phase 2 source | Build? Buy? License? |
|---|---|---|---|
| Listing comps (ADR, occ, revenue) | **Rabbu API** + scraped Airbnb samples | Own comps from PMS-connected users (moat) | Buy (phase 1), Build (phase 2) |
| Property characteristics | User input + Zillow/Redfin URL extraction | Enrich with public records API | Build (light extraction) |
| Regulatory rules | **Manual curation** for 3 launch markets | Licensed feed (Granicus / Host Compliance) + AI extraction | Build (phase 1), hybrid (phase 2) |
| Mortgage rates (DSCR, conventional) | **Weekly manual update** from a few public trackers | API feed (Mortgage News Daily, Optimal Blue) | Build, then license |
| Property taxes | **Public county assessor APIs/scrapes** | Licensed (ATTOM, CoreLogic) | Build, then license |
| Insurance estimates | Rule-of-thumb by market | Quote integration (Steadily, Proper) | Build, then integrate |
| Utility costs | Regional averages | User-contributed actuals | Build |
| Cleaning fees | Regional averages from Turno/Airbnb | User-contributed | Build |
| Amenity impact coefficients | Baseline from Rabbu + research | Proprietary regression from owned actuals | Build |

### 5.2 The regulatory data build — how you earn the moat

This is the hardest data problem and the biggest trust liability. Do it well or do not do it at all.

**Phase 1 scope — 3 launch markets:**

- Nashville (Davidson County, TN)
- Scottsdale (Maricopa County, AZ)
- Gatlinburg / Sevier County, TN

**Data layers per market:**

1. **State law** — does state law preempt local STR bans? (1 row per state)
2. **County rules** — zoning overlays, permit programs. (1–5 rows per county)
3. **City/municipality rules** — the meat of the work. Permit caps, owner-occupancy requirements, minimum stay, zoning classifications, cap counts by zone. (5–30 structured rules per city)
4. **HOA overlays** — not scraped; triggered as "HOA lookup required — get the CC&Rs from the listing agent." Structured as an uncertainty flag.
5. **Zoning geometry** — PostGIS polygons for residential zones where STR is or isn't permitted.

**Curation workflow (phase 1 — the manual mode that proves the model):**

```
1. Analyst identifies market authoritative sources (municipal code, planning dept, STR office).
2. Python worker downloads source documents → R2 snapshot + checksum.
3. Claude (Haiku 4.5 for bulk, Sonnet 4 for ambiguity) extracts structured rules from PDFs.
4. Analyst reviews AI extraction in internal admin UI — approve, edit, or flag.
5. Approved rules written to regulatory_rules with human_verified = true.
6. Weekly scrape rerun; any diff in source document triggers re-review.
```

**Internal admin UI is non-negotiable for phase 1.** Claude Code should build a simple `/admin/regulatory` route (Clerk admin role gated) with:

- List of jurisdictions and their rule count
- "Needs review" queue (new AI extractions, changed source documents)
- Side-by-side view: AI extraction vs. raw source snapshot
- One-click approve/edit/reject

**Budget reality:** expect 40–60 human-curator hours per market to get the initial data right. At $40–60/hr, that's $2,000–$3,500 per market, or ~$9K for the first three. This is a line item, not something to wave away.

### 5.3 Listing comp data — the cold start problem

You have a chicken-and-egg problem. Property-specific forecasts need comps. Comps need performance data. Performance data takes years to accumulate organically.

**The bridge is Rabbu's API.** Rabbu sells STR performance data (revenue, occupancy, ADR) at a per-property level via their "Property Revenue Calculator" API.

| Vendor | Phase 1 fit | Notes |
|---|---|---|
| **Rabbu API** | **Primary pick** | Cleanest per-property API; pricing in the $500–2,000/mo range for small volume; covers ~1M+ US STRs |
| AirDNA API | Fallback | Ironic but pragmatic; more expensive; API access gated; terms forbid competitive use — read carefully |
| AllTheRooms | No | Aggregator, less depth |
| Transparent | Maybe v2 | European-strong, B2B focused, pricey |
| DIY Airbnb scraping | Supplemental only | Legal gray area (see 5.4); provides amenity and description data, not performance |

**Sourcing strategy (phase 1):**

- Rabbu API for performance data on ~10,000 pre-warmed comps in the 3 launch markets (roughly 1 API call per property, cached 30 days).
- Public Airbnb/Vrbo listings scraped for amenity, description, and photos only — never performance.
- User-contributed property actuals as they opt in (starts small, grows fast in v2).

**When to cut the licensing cord:** once you have 2,000+ PMS-connected properties with 12+ months of actuals, own comps beat licensed comps in accuracy and cost. Target: end of year 2.

### 5.4 The legality question (say it plainly)

| Activity | Legal reality | Recommendation |
|---|---|---|
| Using Rabbu / AirDNA APIs | Governed by ToS; most APIs forbid using output to build a competing data product. **Read the ToS with counsel.** | License for usage, not for resale. Build your own dataset in parallel. |
| Scraping Airbnb/Vrbo listings | Technically violates ToS; courts have been mixed post-*hiQ v. LinkedIn*; public data scraping is not criminal but is a civil liability | Scrape for amenity and description metadata only, never performance numbers. Rate-limit aggressively. Identify your scraper's user-agent. |
| Scraping public regulatory documents | Public government documents, generally permissible | Do it, but snapshot everything into R2 with timestamps |
| Scraping MLS | Almost always violates IDX/MLS terms | Do not scrape. License IDX feed ($50–500/mo per MLS region) when MLS integration becomes strategic |
| Using scraped data in paid products | **Risk vector** — even if scraping is permitted, commercial use can fail ToS | For paid product features, rely on licensed sources; use scraped data as internal enrichment only |

**The pragmatic posture:** pay Rabbu for the comp data you sell against. Scrape only for non-competitive enrichment (amenity discovery from listing text, photo counts, description tone). Every scraping worker logs the source URL, user-agent, and timestamp into `data_sources` for defensibility.

### 5.5 The actuals pipeline (v2 — the moat)

This is the long-term defensibility. Phase 1 does not touch it, but the schema must be ready.

**Integration targets, in order:**

1. **Hostaway** (largest PMS in the 1–5 property owner segment)
2. **OwnerRez** (strong with self-managers)
3. **Hospitable** (growing fast, owner-friendly)
4. **Guesty for Hosts** (secondary; Guesty's larger business is out of wedge)
5. **Plaid** for bank connection (catches bookkeeping side)

**What gets pulled:**

- Reservations (nightly rate, occupancy dates, fees, gross revenue)
- Listings (to reconcile property identity — the customer's Hostaway property = our property record)
- Expenses (cleaning, linens, supplies via bookkeeping integration)

**Frequency:** daily sync. Not real-time. Real-time adds complexity without customer value at this scale.

**Data quality gate:** every incoming reservation is validated against the property record's expected ADR range (±3 sigma of the forecast). Outliers land in a review queue in admin — catches PMS sync bugs before they corrupt the dataset.

**Privacy and the anonymization question:** the proprietary dataset's value is in aggregate patterns, not individual performance. Commit in the ToS that:

- Individual property performance is never shared with third parties
- Aggregated, anonymized patterns (e.g., "hot tub lift in Scottsdale 3BR") are used to train models
- Users can opt out of aggregate use at any time (their own data still works for them)

This matters legally and it matters for trust. Do not get clever with the data rights.

---

## 6. Modeling Stack

### 6.1 Comp selection engine

**Phase 1: rules + similarity.** No ML yet.

```
Input:  subject property (address, beds, baths, sqft, amenities)
Output: 8 ranked comps with similarity scores and rationale

Algorithm:
1. Geofence: within N miles of subject
   - Urban markets (Nashville): 2 miles
   - Resort markets (Gatlinburg): 5 miles
   - Suburban (Scottsdale): 3 miles
2. Hard filters:
   - bedrooms ∈ [subject.bedrooms - 1, subject.bedrooms + 1]
   - property_type matches (or compatible)
   - active within last 12 months
3. Score remaining candidates on weighted similarity:
   - bedroom exact match: 30%
   - bathroom within 0.5: 15%
   - sqft within 25%: 20%
   - amenity overlap (Jaccard): 20%
   - distance decay: 15%
4. Return top 8 by score.
5. For each comp, Claude generates a one-sentence rationale
   ("3BR/2BA within 0.8mi, same hot-tub-and-pool amenity profile,
    similar sqft at 1,850").
```

**Phase 2: learned similarity.** Once you have user comp-swap data, train a model that learns which comps users keep vs. replace. The user corrections are the labels — this is one of the quiet wins in the moat story.

### 6.2 Revenue forecast engine

```
Input:  subject property, selected comps, scenario params
Output: monthly revenue, occupancy, ADR for 12 months; 10-year projection

Algorithm (phase 1):
1. Base case revenue = weighted average of comps' trailing 12-month revenue,
   weighted by similarity score.
2. Seasonal curve: use market's seasonal index (derived from all comps in market).
3. Apply amenity adjustments from amenity_coefficients table.
4. Scenario variants:
   - base: p50 of comp distribution
   - downside: p25 of comp distribution, -10% occupancy
   - stretch: p75 of comp distribution, +5% ADR
5. Expense side: rule-based from market averages + user overrides.
6. Financing: standard DSCR / conventional calculators.
7. Return NOI, cash-on-cash, 10-year IRR, monthly detail.
```

**Why rules-based for phase 1:**

- Auditable — every number traces to an input
- Testable — unit tests on known properties
- Trustable — users can challenge any number and get a source
- Cheap — no training data requirement, no model ops

**What moves to ML in v2:**

- Occupancy prediction as a gradient-boosted model on listing features
- ADR prediction with explicit seasonality decomposition
- Expense prediction from the accumulated actuals corpus

**Model versioning is mandatory.** Every forecast writes `model_version` to the row. When you ship a new forecast engine version, existing forecasts don't re-run — but users can re-run them with the new version and see the diff. This is how you preserve the actuals-vs-forecast loop even as the engine improves.

### 6.3 Amenity impact model

**Phase 1: priors from Rabbu / AirDNA research + hand-tuned.** A hot tub in a mountain destination has a known ~$5–10K/yr revenue lift. Use published research as the starting point. Store as `amenity_coefficients` with `sample_size = 0` and `model_version = "prior_v1"`.

**Phase 1.5: calibrate on Rabbu comp data.** Once you have 2,000+ comps, run a straightforward fixed-effects regression:

```
revenue ~ bedrooms + baths + sqft + market + amenity_hot_tub
          + amenity_pool + amenity_ev_charger + ...
```

Write the coefficients into `amenity_coefficients`. Bump `model_version`.

**Phase 2: tree-based on owned actuals.** Once PMS-connected properties exist, gradient-boosted models on the proprietary data. This is where the moat actually closes — licensed data doesn't include amenity-level conversion signal at useful resolution.

### 6.4 AI use — where Claude actually earns its keep

Ranked by where AI creates real value:

| Use case | Model | Why it matters |
|---|---|---|
| Regulatory document extraction | Sonnet 4 | High stakes; needs reasoning about legal language; always human-reviewed in phase 1 |
| Listing URL → property characteristics | Haiku 4.5 | High volume, structured output; Haiku is plenty |
| Comp rationale ("why this comp?") | Haiku 4.5 | Short, formulaic; Haiku is cost-appropriate |
| Property brief narrative | Sonnet 4 | Customer-facing prose quality matters |
| Underwriting copilot (v2) | Sonnet 4 | Reasoning about scenarios, nuanced |
| Actuals anomaly explanations (v2) | Sonnet 4 | Causal reasoning about deltas |

**AI cost budgeting (phase 1):**

- Average underwrite session: ~15K input tokens, ~3K output (Sonnet 4)
- At Anthropic current pricing: ~$0.08 per underwrite
- At 20 underwrites/user/month × 100 users = 2,000 underwrites = **~$160/mo**
- Haiku tasks (listing extraction, comp rationales): ~$30/mo

AI is a rounding error in phase 1. Do not over-optimize. Keep prompts readable.

**Provenance on AI output is non-negotiable.** Every AI-generated regulatory summary, comp rationale, and property brief section tags its source with `model_version`, `prompt_version`, and a link to the source document it was based on. When (not if) an AI extraction is wrong, you need to answer "what did it see" in 30 seconds.

---

## 7. Infrastructure Cost Model & Unit Economics at Scale

This is the part that determines whether this company is fundable. Three scale points: phase 1 (100 active users), growth (2,500 paid users), scale (15,000 paid users).

### 7.1 Phase 1 — 100 active users (MVP launch)

| Line item | Vendor | Monthly cost | Notes |
|---|---|---|---|
| Next.js hosting | Vercel Hobby → Pro | $0 → $20 | Hobby works until you hit limits |
| Postgres | Neon Free → Launch | $0 → $19 | Launch plan covers phase 1 comfortably |
| FastAPI service | Fly.io shared-cpu-1x, scale-to-zero | $5–15 | Wakes up on request |
| Python workers | Fly.io, scheduled | $10–20 | Run a few times daily |
| R2 object storage | Cloudflare | $0–5 | Under 10 GB; free tier holds |
| Clerk auth | Free tier | $0 | Under 10K MAU |
| Stripe | — | $0 fixed + % | 2.9% + $0.30 per charge |
| Resend | Free tier | $0 | Under 3K emails/mo |
| Inngest | Free tier | $0 | Under 50K steps/mo |
| Sentry | Team plan | $26 | Errors only |
| PostHog | Free tier | $0 | Under 1M events |
| Axiom | Free tier | $0 | Under 0.5 TB logs |
| Anthropic API | Sonnet + Haiku mix | $190 | Section 6.4 math |
| Rabbu API | Licensed data | $500–800 | Starter tier |
| Domain / misc | — | $10 | |
| **Total** | | **~$780–1,100/mo** | |

At 100 users paying $99/mo average: ~$9,900 revenue. Gross margin ~88%. That's healthy, but the line item that moves it is **Rabbu**, not infra.

**Claude Code fact of life for phase 1:** almost every choice above is "use the free tier, scale up when it pinches." Neon Launch and Vercel Pro are the first paid tiers you hit. Everything else is cheap.

### 7.2 Growth — 2,500 paid users (~$400K ARR)

| Line item | Monthly cost | Notes |
|---|---|---|
| Vercel Pro / Enterprise | $150–400 | Bandwidth + seats |
| Neon Scale plan | $200–500 | Bigger compute; read replica |
| Fly.io (modeling + workers) | $150–300 | Multiple regions, higher CPU |
| R2 | $50 | Property briefs accumulate |
| Clerk Production | $100 | Over MAU threshold |
| Inngest Team | $100–200 | Higher step volume |
| Sentry Business | $100 | More volume |
| PostHog Scale | $200–400 | Event volume |
| Axiom | $100 | Log volume |
| **Anthropic API** | **$1,500–2,500** | Volume-weighted |
| **Rabbu API** | **$2,000–4,000** | Mid tier |
| Granicus regulatory feed | $1,500–3,000 | v2 — swap in when it's cheaper than manual |
| Metabase hosting | $50 | Internal BI |
| Misc / tools / compliance | $300 | Cloudflare paid, 1Password, GitHub, etc. |
| **Total** | **~$6,200–11,700/mo** | |

At 2,500 users × $149 blended: ~$372K MRR equivalent. Infra is 2–3% of revenue. Gross margin still ~90%+.

**The cost line that grows fastest is Anthropic API.** This is fine. It grows linearly with usage, and the value per AI call (an underwrite, a regulatory summary) is denominated in dollars, not fractions of a cent.

**The cost line to watch most carefully is Rabbu / licensed data.** By the time you're at 2,500 users, you should be actively shifting toward owned actuals. The Rabbu line going *down* while user count goes *up* is the single best signal that the moat is closing.

### 7.3 Scale — 15,000 paid users (~$2.7M ARR)

| Line item | Monthly cost | Notes |
|---|---|---|
| Vercel Enterprise | $1,500–3,000 | Negotiated |
| Postgres (Neon Business or move to RDS) | $2,000–4,000 | Multiple read replicas, larger compute |
| Data warehouse (BigQuery / Snowflake) | $1,500–3,000 | Actuals corpus lives here |
| Fly.io compute | $1,500–2,500 | Multiple services, auto-scaling |
| R2 | $300 | |
| Clerk | $500 | |
| Observability (Sentry + DD or similar) | $1,500 | |
| PostHog | $1,000 | |
| **Anthropic API** | **$8,000–15,000** | Volume |
| **Proprietary data ops (no more Rabbu for core)** | $1,000 | Spot licensing, not primary |
| Regulatory data (hybrid licensed + owned) | $3,000 | |
| Integration layer ops (PMS webhooks) | $500 | |
| Misc | $1,000 | |
| **Total** | **~$22,000–35,000/mo** | |

At 15,000 users × $169 blended: ~$2.5M MRR equivalent. Infra is 1–1.5% of revenue. **This is the part that makes this a venture-grade business.**

### 7.4 Gross margin evolution

| Scale point | MRR | Infra cost | Gross margin |
|---|---|---|---|
| Phase 1 (100 users) | $9.9K | $1.0K | 90% |
| Growth (2,500 users) | $372K | $9K | 97.5% |
| Scale (15,000 users) | $2,537K | $28K | 98.9% |

**Why margins improve with scale in this model:**

1. Licensed data costs (Rabbu) are replaced by proprietary data (owned at near-zero marginal cost).
2. Regulatory curation is amortized across more users per market.
3. AI costs are variable but small relative to subscription revenue.
4. No COGS per customer beyond compute.

**The one thing that could break this:** expensive PMS integrations (revenue-share deals with Hostaway / Guesty) or a pivot to transaction-based pricing where per-deal costs compress margins. Keep the business on subscription and the margins stay above 95%.

### 7.5 LTV, CAC, and payback

Using conservative assumptions for the wedge segment:

| Metric | Assumption | Value |
|---|---|---|
| ARPA (blended) | Starter $49 + Pro $149 + Portfolio $349, 20/70/10 mix | $157/mo |
| Gross margin | At growth scale | 97% |
| Monthly churn | Paid SaaS in this segment | 4% (72% annual retention year 1, improving to ~85% year 2) |
| LTV (3-year horizon) | ARPA × GM / churn, capped at 3yr | ~$3,900 |
| Target CAC (phase 1–2) | Founder-led + community | $200–400 |
| Target CAC (growth) | Blended paid + organic | $500–800 |
| CAC payback | At target CAC | 3–6 months |
| LTV:CAC | At blended CAC $600 | 6.5× |

**The unit economics only work because of three compounding effects:**

1. **The community GTM** keeps CAC low in the wedge segment (see Section 13 of the strategy brief).
2. **The moat dataset** means Rabbu licensing eventually disappears, not just plateaus.
3. **The lifecycle expansion** (starter → Pro → Portfolio) grows ARPA without new acquisition cost.

### 7.6 When to raise, based on this math

- **Seed** ($1.5–2.5M): covers 12–18 months of phase 1 → growth transition. Primary use: first 3–4 eng hires, Rabbu licensing, regulatory curation.
- **Series A** ($8–15M): triggered when you have 1,000+ paid users, <2% monthly churn, and forecast accuracy validated publicly. Primary use: PMS integrations, proprietary dataset investment, growth marketing.

Do not raise a Series A before the accuracy scorecard exists publicly. It is the only diligence artifact investors in this category will actually care about.

---

## 8. Phase-by-Phase Build Plan (Claude Code-Shaped)

Each phase is sized to be buildable by one founder + Claude Code. Each phase ends with a shippable checkpoint.

### Phase 0 — Week 0–2: Foundation

**Goal:** repo, deployed skeleton, auth, empty app.

- Monorepo with pnpm + Turborepo
- Drizzle schema v1 (users, orgs, properties)
- Clerk auth + middleware
- Vercel deploy (empty Next.js app authenticated)
- Neon dev + prod branches
- CI on GitHub Actions
- `CLAUDE.md` committed (Appendix A)

**Checkpoint:** logged-in user sees an empty "Properties" dashboard.

### Phase 1 — Week 2–6: Property entry + regulatory lookup

**Goal:** user can enter a property and see regulatory risk.

- Property CRUD (manual entry)
- Zillow/Redfin URL paste → Haiku extracts characteristics
- Nashville, Scottsdale, Gatlinburg regulatory data manually curated
- `property_regulatory_assessments` lookup on property save
- Green / yellow / red badge on property page
- Source snapshot R2 storage + display

**Checkpoint:** user enters a Nashville address, gets a correct regulatory badge with citations.

### Phase 2 — Week 6–10: Comp engine + first forecast

**Goal:** user sees a property-specific forecast.

- Rabbu API integration, ingestion worker
- `listings` + `listing_performance` tables populated for 3 markets
- Comp selection algorithm (Section 6.1)
- Comp UI: show 8 comps, let user swap
- Revenue forecast engine v1 (Section 6.2) in FastAPI
- Scenario toggles (base / downside / stretch)
- Forecast persistence with assumption snapshot

**Checkpoint:** user enters property, sees comps, gets forecast with full scenario breakdown.

### Phase 3 — Week 10–14: Amenity modeling + underwriting

**Goal:** full MVP underwriting workbench.

- `amenity_coefficients` with prior v1 values loaded
- Amenity picker with quantified impact display
- Expense model (operating costs, financing, taxes, insurance)
- Full underwriting calculation (NOI, cash-on-cash, IRR)
- Sensitivity sliders (ADR, occupancy, interest rate)
- AI comp rationale (Haiku)

**Checkpoint:** a design partner can run a complete underwrite in under 10 minutes.

### Phase 4 — Week 14–18: Property brief + sharing + billing

**Goal:** shipped, paying customers.

- Property brief PDF generation (React PDF → R2)
- Share link (tokenized, revocable)
- Stripe billing integration
- Three tiers (Starter, Pro, Portfolio placeholder)
- 14-day trial
- Basic in-app analytics (PostHog)
- Internal admin UI for regulatory curation

**Checkpoint:** public launch; first paying customer.

### Phase 5 — Month 5–7: Expansion markets + programmatic SEO

- 10 additional markets with manual regulatory curation
- Programmatic SEO pages for "STR rules in [city]"
- Creator partnership landing pages
- Referral mechanic

### Phase 6 — Month 7–10: Actuals loop v1 — the moat begins

- `property_actuals` schema live
- **Hostaway integration** (v2 flagship)
- Daily reservation sync via Inngest
- Actuals-vs-forecast reporting on property dashboard
- Public accuracy scorecard v1 (aggregate, anonymized)

### Phase 7 — Month 10–14: Second integration + bookkeeping

- OwnerRez integration
- Plaid bank connection for expense tracking
- Portfolio tier launch
- Amenity coefficients v2 from owned actuals (regression)

### Phase 8 — Month 14–18: Regulatory depth + HOA

- HOA overlay data layer
- Parcel-level regulatory geometry
- Licensed regulatory feed evaluation (Granicus vs. continue manual)
- Agent/consultant lane pilot

---

## 9. Engineering & Hiring Cost Model (18 Months)

Assumes founder-led build through month 4, first hire in month 4–5.

| Month | Headcount | Monthly burn (comp) | Monthly burn (infra + tools) | Total monthly burn |
|---|---|---|---|---|
| 1–4 | 1 founder (deferred / reduced salary) | $10K | $1.5K | $11.5K |
| 4–6 | +1 senior full-stack eng | $28K | $2K | $30K |
| 6–9 | +1 data/ML eng + 0.5 data analyst (contractor) | $55K | $5K | $60K |
| 9–12 | +1 growth/product | $80K | $8K | $88K |
| 12–15 | +1 second full-stack + regulatory ops lead | $115K | $12K | $127K |
| 15–18 | +1 DevRel/community + senior data eng | $160K | $15K | $175K |

**18-month cumulative burn: ~$1.9M.** This sizes the seed round at **$2.0–2.5M** including runway buffer.

**Critical hiring sequence:**

1. **First hire — senior full-stack eng.** Not a "10x generalist." Someone with actual Next.js + Postgres production experience. This hire takes operational ownership of `apps/web`.
2. **Second hire — data/ML eng.** Owns the modeling service, comp engine, and eventually the actuals pipeline. This is the hire that makes the moat real.
3. **Contractor — regulatory ops analyst.** 20 hr/week. Curates regulatory data, runs the admin review queue. Do not hire full-time until 8+ markets are live.
4. **Third hire — growth/product.** Owns the activation funnel, pricing experiments, and the first real marketing infrastructure.
5. **Post-Series A hires** — regulatory ops lead (full-time), second data eng, DevRel.

**What to avoid:** hiring a dedicated backend/infra engineer in year one. Fly.io, Neon, and Vercel are operated by their teams. You do not need DevOps on headcount until multi-region or enterprise SSO.

**Compensation assumption:** senior full-stack at $180K base + equity; data/ML eng at $200K + equity; growth/product at $160K + equity. These are 2026 US market rates for senior ICs who will not need heavy management.

---

## 10. Risks to This Architecture (Honest List)

| Risk | Mitigation |
|---|---|
| Fly.io outage / acquisition | Infrastructure is stateless except for Python workers; can migrate to Render or Railway in <1 week. DB is on Neon, fully portable |
| Neon scaling issues past ~1TB | Move to managed Postgres (RDS, Crunchy Bridge) when data volume demands. Drizzle makes the migration surgical |
| Rabbu deprecates or changes pricing | Actively build owned comps from month 6 onward. Cold start problem becomes a self-healing problem |
| Clerk pricing changes post-scale | Auth.js self-host migration is 1–2 engineer-weeks. Clerk schemas are portable |
| Anthropic API cost spike | Multi-provider abstraction in `lib/ai/` from day one. Swap to OpenAI or open-weights for specific workloads if pricing shifts |
| Regulatory data wrong → lawsuit | Source snapshots in R2; uncertainty flags; ToS disclaims reliance for legal purposes; always link to source document |
| PMS integration lock-out | Do not build revenue share deals; use public OAuth marketplace access; user owns the connection |

**The biggest architectural risk is not any of these.** It's over-engineering phase 1. If the MVP has a feature store, multi-region Postgres, or a message queue other than Inngest, the build took too long and cost too much. Keep phase 1 boring.

---

## Appendix A — `docs/CLAUDE.md` contents

See the separate `CLAUDE.md` artifact in this deliverable. It is the file to commit into the repo root for Claude Code consumption.

---

## Appendix B — Decision Record Template

Every architectural decision that deviates from this document should be logged in `docs/DECISIONS.md` using this format:

```
## ADR-N: Title
Date: YYYY-MM-DD
Status: proposed | accepted | superseded
Context: what problem
Decision: what we chose
Consequences: what we gained and gave up
Revisit: when to reconsider
```

The first five ADRs are already implied by this document:
- ADR-1: Next.js + Vercel for web
- ADR-2: Fly.io for stateful Python services
- ADR-3: Neon Postgres as primary datastore (no warehouse in phase 1)
- ADR-4: Rules-based modeling engine in phase 1
- ADR-5: Rabbu API as phase 1 comp source, with owned-data transition plan

Commit these as accepted ADRs when the repo is initialized.
