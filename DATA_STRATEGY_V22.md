# Parcel — Data Strategy v2.2 (Direct-HTTP First)

**Supersedes v2.1 — the scrappy version**

Version 2.2 · April 2026

---

## What changed and why

v2.0 dropped Rabbu. v2.1 used Apify actors for scraping. v2.2 goes one level deeper: use direct HTTP calls against public endpoints wherever possible, with Apify as a paid fallback only when primary paths break.

**The core realization:** the data we need is publicly served by Airbnb, Zillow, and Redfin through their own site's internal JSON APIs. Apify was abstracting that away with browsers and proxies at $0.03–0.05 per call, but the underlying data is accessible via simple HTTPS requests at $0. For a Claude Code build, the engineering cost of going direct is a handful of hours — far below what Apify saves you over the life of the product.

**Phase 1 scraping cost: $30–70/mo instead of $150–250/mo.**

The three constraints are unchanged:
1. Budget ceiling: $50–200/mo for all comp data
2. Fully automated — no manual per-property lookups
3. Accurate enough — median forecast error ≤15% vs. ground truth

The consequence: **no market pre-warming needed.** On-demand scraping with aggressive caching. Launch nationwide from day one.

---

## 1. The Four-Source Data Stack (v2.2)

| Layer | Source | Purpose | Cost |
|---|---|---|---|
| L1 — Property details | **Direct HTTP** to Zillow/Redfin `__NEXT_DATA__` | Pull property specs when user pastes a URL | $0 |
| L2 — Comp discovery + data | **Direct HTTP** to Airbnb internal search API | Find comps, pull metadata + review velocity in one call | $0 |
| L3 — Ground truth | **Design partner contributions** (Airbnb CSV + PMS connects) | Calibration labels for review-velocity + amenity models | $0 |
| L4 — User corrections | **Every time a user edits anything** | Active learning signal | $0 |
| Fallback — Apify | **Paid scrapers when primary paths break** | Resilience | $20–50/mo budget |

Each layer has a specific job. L1 gives you property characteristics. L2 gives you comps + occupancy inference in a single request. L3 gives you calibration. L4 compounds.

---

## 2. L1 — Direct HTTP Property Extraction

### How it works

When a user pastes a Zillow or Redfin URL, your server-side code fetches the page HTML and extracts the data from the embedded `__NEXT_DATA__` script tag.

Both Zillow and Redfin are Next.js apps. Every page ships with a `<script id="__NEXT_DATA__">` tag containing the complete page state as JSON — address, beds, baths, sqft, lot size, year built, photos, tax history, price history. Everything the server rendered for the page, available as structured data.

### Implementation sketch

```python
# apps/modeling/parcel_modeling/sources/zillow.py
import httpx, json, re
from typing import Optional

NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__"[^>]*>(.+?)</script>',
    re.DOTALL
)

async def extract_zillow_property(url: str) -> dict:
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; ParcelBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    }
    async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()

    match = NEXT_DATA_RE.search(resp.text)
    if not match:
        raise ExtractionError("No __NEXT_DATA__ found; structure changed")

    payload = json.loads(match.group(1))
    # Navigate payload.props.pageProps.componentProps.gdpClientCache
    # (the exact path drifts every few months; self-heal via AI fallback)
    return normalize_zillow_property(payload)
```

### Self-healing when Zillow changes structure

Zillow's internal JSON structure changes every 3–6 months. Instead of maintaining a brittle parser, use a Claude fallback:

```python
async def normalize_zillow_property(payload: dict) -> dict:
    try:
        return KNOWN_PARSER_V3(payload)
    except (KeyError, TypeError):
        # Structure changed - ask Haiku to find the fields
        return await ai_fallback_parse(payload, schema=PropertySchema)
```

Haiku 4.5 at ~$0.001 per call costs nothing, and when the parser eventually breaks you get a working fallback until you ship an updated extractor. This is a defining pattern for a Claude Code build.

### What works, what doesn't

**Works reliably:**
- Zillow property detail pages (`/homedetails/.../XXXX_zpid/`)
- Redfin property detail pages (`/home/XXXXX` and similar)
- Realtor.com detail pages (same Next.js pattern)

**Does not work:**
- Zillow search result pages (loaded via JS after initial render — use Apify fallback)
- Pages behind login or captcha
- Any listing marked "contingent" with restricted detail

**Rate and IP considerations:**
- Single VPS IP handles ~100 requests/hour on Zillow before soft rate-limits
- One IP is enough for phase 1. At 100 users doing 10 underwrites/mo, that's 1,000 requests/mo max — well under the rate limit.
- If you start hitting limits, rotate across 3–5 cheap VPS IPs ($5/mo each). This is a growth-scale problem, not phase 1.

---

## 3. L2 — Direct HTTP Against Airbnb's Search API

### The key insight

Airbnb's public website uses an internal GraphQL endpoint at `https://www.airbnb.com/api/v3/StaysSearch` that returns comprehensive listing data as JSON. The same endpoint powers the public search UI. Every listing in the response includes:

- listing_id, title, property type
- bedrooms, bathrooms, max guests
- nightly price (current) and price history
- **review count and average rating**
- **most recent review date** (for the review-velocity model)
- amenities list
- lat/lng coordinates (approximate)
- host info
- availability calendar hints

One request returns 20–40 listings. For a typical underwrite, that's enough to build a complete comp set without a second call.

### How to actually hit it

This endpoint requires specific headers (Airbnb API key, client version, request signatures) that change occasionally. Getting them right is the reverse-engineering task.

**The process for figuring out the current request shape:**

1. Open Airbnb in Chrome
2. Open DevTools → Network tab → filter "Fetch/XHR"
3. Run a search on Airbnb's public site
4. Find the `StaysSearch` request
5. Right-click → "Copy as cURL"
6. Paste into Claude Code and say: "convert this cURL to a reusable Python client with the variable parts parameterized"

Claude Code generates a working client in one session. When the endpoint structure changes (every 3–6 months), you repeat this process. Takes ~30 minutes each time.

### Implementation sketch

```python
# apps/modeling/parcel_modeling/sources/airbnb.py
import httpx
from typing import List

class AirbnbSearchClient:
    BASE_URL = "https://www.airbnb.com/api/v3/StaysSearch"

    def __init__(self):
        # Headers obtained from DevTools; refresh when they stop working
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            "X-Airbnb-API-Key": load_current_api_key(),
            "X-Client-Version": load_current_client_version(),
            "Accept": "application/json",
        }

    async def search_by_bbox(
        self,
        sw_lat: float, sw_lng: float,
        ne_lat: float, ne_lng: float,
        min_beds: int, max_beds: int,
        min_baths: float, property_type: str,
    ) -> List[dict]:
        params = build_search_params(sw_lat, sw_lng, ne_lat, ne_lng,
                                      min_beds, max_beds, min_baths, property_type)
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(self.BASE_URL, headers=self.headers, params=params)
            resp.raise_for_status()
        return parse_search_response(resp.json())

    async def get_listing_details(self, listing_id: str) -> dict:
        # Separate endpoint for full listing details with photos and amenities
        ...
```

### The comp-finding flow, end to end

```
User pastes Zillow URL
  ↓
extract_zillow_property(url) → address, beds, baths, sqft, lat/lng
  ↓ (~0.5s, $0)

build_bbox(lat, lng, radius=2mi)  # 2-mile bounding box around subject
  ↓
airbnb.search_by_bbox(bbox, beds=[N-1, N+1], baths>=M-0.5, property_type)
  ↓ (~1.5s, $0)

30 candidate comps with reviews, pricing, amenities, ratings
  ↓

comp_selection_algorithm → top 8 by similarity
  ↓

review_velocity_model(comps, calibration_params) → occupancy estimates
  ↓

forecast_engine(subject, comps, scenario_params) → revenue, NOI, IRR
  ↓ (~2s for compute)

Total: ~4 seconds, $0 in scraping costs
```

### The rate-limit reality

Airbnb's search endpoint tolerates roughly 200–400 requests/hour per IP before rate-limiting. Phase 1 volume (1,000 underwrites/month = ~35 requests/day) is nowhere near this limit.

At scale:
- 2,500 users × 8 underwrites/mo = 20K requests/mo = ~670/day = ~30/hour average, with peaks to ~100/hour
- Still well within single-IP capacity; add 2–3 VPS IPs as insurance ($10–20/mo)
- 15,000 users starts to push limits — by then you're ready to invest in proper proxy rotation or move more load to cached data

---

## 4. Caching — Where the Real Savings Live

Even though direct HTTP is free, smart caching is still the architecture because it makes everything faster and more resilient.

### What to cache and for how long

| Data | Cache TTL | Rationale |
|---|---|---|
| Zillow property details | 7 days | Listings don't change often; price updates matter |
| Redfin property details | 7 days | Same |
| Airbnb listing metadata | 14 days | Amenities and descriptions change slowly |
| Airbnb listing review count/date | 24 hours | The critical value for velocity model |
| Airbnb nightly pricing | 3 days | Dynamic but expensive to refresh |
| Airbnb search results by bbox | 7 days | Comp composition changes slowly |
| Subject property + comp selection | Until user edits | Once a user runs an underwrite, freeze comps in the forecast snapshot |

### Cache implementation

Just use Postgres. No Redis, no separate cache layer.

```sql
scrape_cache (
  cache_key text primary key,         -- sha256(endpoint+params)
  source text,                         -- zillow | redfin | airbnb_search | airbnb_listing
  payload jsonb,                       -- full parsed response
  r2_raw_snapshot_key text,            -- raw HTML/JSON in R2 for provenance
  fetched_at timestamptz,
  expires_at timestamptz,
  response_version text                -- which parser version extracted this
)
-- Index: (expires_at) for cleanup, (source, fetched_at) for analytics
```

Simple lookup pattern in the modeling service:

```python
async def get_or_fetch(cache_key: str, source: str, fetcher: Callable) -> dict:
    cached = await cache_repo.get_if_fresh(cache_key)
    if cached:
        return cached.payload
    fresh = await fetcher()
    await cache_repo.upsert(cache_key, source, fresh)
    return fresh
```

### Why this pattern wins

In a concentrated market (Nashville hot zips, Scottsdale, Gatlinburg), comp sets overlap heavily between underwrites. After 30 underwrites in a neighborhood:
- ~80% of comp requests hit the cache
- New underwrites complete in <2 seconds (just the subject property fetch)
- Direct HTTP volume drops by ~75%

This is why on-demand architecture beats pre-warming: you cache what users actually care about, not what you guessed they might.

---

## 5. L3 — Design Partner Data (Unchanged from v2.1)

The design partner strategy is unchanged. Your personal STR connections give you ground-truth reservation data that calibrates everything else.

What changes slightly in v2.2: since you're no longer pre-warming markets, the design partner data becomes even more important for calibration. Without a big pre-scraped corpus, you're relying on smaller on-demand comp sets, so the model parameters (review rate, stay length, review lag) need to be well-calibrated from day one.

**Refined design partner ask:**

Recruit 15–25 STR owners. Ask for:
1. Airbnb reservation CSV exports (ground truth for booking dates + revenue)
2. Their Airbnb listing URLs (so you can track public review counts over time against their real bookings)
3. Property details (beds, baths, amenities, address)
4. 2-year historical data if available

With this you can calibrate the review-velocity model:
- Compare real booking count (from CSV) to observed review count change over same period
- Fit review rate per market/property type
- Learn review-to-booking lag distribution
- Validate AirROI-free baseline against real revenue

This calibration work is a 2-3 day task that happens before launch. It produces the market-specific parameters in `model_calibration`.

---

## 6. L4 — User Corrections (Unchanged from v2.1)

Same as v2.1. Every comp swap, assumption edit, and forecast override is a labeled training signal. Capture in `user_corrections`, review weekly, feed into model tuning.

---

## 7. The Fallback Layer — When Primary Paths Break

Direct HTTP works until it doesn't. Plan for the failure modes.

### Failure scenarios and responses

| Failure | Primary path behavior | Fallback | Est. downtime |
|---|---|---|---|
| Zillow `__NEXT_DATA__` structure changes | Parser fails gracefully | AI reparse via Haiku + Apify Zillow actor as secondary | <1 day to ship fixed parser |
| Airbnb API key format changes | 401/403 errors | DevTools re-inspection → new headers, ship same day | <4 hours |
| Airbnb rate-limits IP | 429 errors | VPS IP rotation + Apify fallback | Instant failover |
| Airbnb endpoint restructured | Unclear errors | Apify Airbnb actor (slower, more expensive) | 1-3 days |
| Zillow blocks scraping IP | Consistent errors | Apify Zillow actor | <1 hour |

### Fallback architecture

```python
# Unified interface with fallback chain
class CompSource:
    async def search_airbnb_comps(self, query: CompQuery) -> List[Listing]:
        for provider in [self.direct_airbnb, self.apify_airbnb]:
            try:
                return await provider.search(query)
            except (RateLimitError, StructureError, NetworkError) as e:
                logger.warning(f"{provider.name} failed: {e}, trying next")
                continue
        raise AllProvidersFailedError()
```

### The Apify fallback budget

Reserve **$50/mo** for Apify as a pure fallback. Normal operation: you spend $0. When a primary path breaks: you spend $5-30 on that day until you ship a fix. Apify bills per-use, so an unused budget is a $0 budget.

This $50 is insurance premium, not recurring spend.

---

## 8. Legal Posture — Is This Defensible?

This is the part that matters most. Direct HTTP to internal endpoints is more aggressive than using Apify. Let me be direct about the exposure.

### What's the same as Apify

- You're accessing publicly-displayed data
- You're not redistributing scraped data as a product feature
- You're helping STR hosts (aligned incentives with the platforms)
- Post-*hiQ v. LinkedIn*, scraping public data isn't a CFAA violation
- You're operating at small scale (no pattern of mass data extraction)

### What's different

- **You're not using a commercial abstraction.** Apify provides some distance — you didn't write the scraper, you just used a tool. With direct HTTP, you're intentionally calling internal endpoints, which reads as more deliberate to a court if it comes to that.
- **The endpoints aren't advertised as public.** Airbnb's `/api/v3/StaysSearch` is not an "API" in the marketed sense. It's internal infrastructure. Using it reads as closer to reverse engineering than web scraping.
- **ToS violations are slightly more explicit.** Airbnb's ToS forbids automated access to the platform. Apify users violate the same rule but have more plausible deniability.

### Practical enforcement reality

- Airbnb has sued data companies — Pendo Analytics in 2023, and others over the years — but the cases targeted businesses that **redistributed** scraped listing data or operated **booking-engine competitors**. Parcel does neither.
- Airbnb has never (publicly) pursued a small B2B tool that uses scraped data internally to help hosts.
- Zillow and Redfin have similar enforcement patterns: they send C&Ds to redistributors and competitors, not to tools helping their sellers.
- Your biggest actual risk: a C&D letter that forces you to migrate to Apify. Cost: a week of engineering and an extra $100/mo ongoing.

### How to minimize the risk

1. **Never redistribute scraped data as a product feature.** Your product shows users forecasts built from the data, not the data itself.
2. **Don't market "we scrape Airbnb."** Your marketing says "property-specific forecasts from multiple data sources" — truthful and non-provocative.
3. **Use respectful rate limits.** 1 request per few seconds per source is fine.
4. **Keep the Apify fallback always ready to flip on.** If you get a C&D, you migrate in hours, not weeks.
5. **Incorporate in Delaware.** (Standard startup advice, but relevant — limits personal liability.)
6. **Don't scrape authenticated content.** Only public-facing pages.

### Bottom line

This is the same legal posture as a long tail of small B2B data tools that have operated for years without serious issues. The practical risk is a C&D that you respond to by migrating to Apify — not an existential lawsuit. Get comfortable with that tradeoff or stick with Apify from day one.

---

## 9. Revised Phase 1 Cost Model

| Line item | v2.1 (Apify) | v2.2 (Direct HTTP) | Delta |
|---|---|---|---|
| Rabbu API | $0 | $0 | — |
| AirROI API | $0 | $0 (optional, likely skipped) | — |
| Apify actors (primary in v2.1) | $150–250/mo | $0–50/mo (fallback only) | -$200 |
| VPS IPs (optional, for rotation) | $0 | $10–20/mo | +$15 |
| Cloudflare R2 | $5–15/mo | $5–15/mo | — |
| Other infra (unchanged) | $280 | $280 | — |
| **Total** | **$435–545/mo** | **$295–365/mo** | **~$170/mo savings** |

At 100 paid users × $99/mo blended = $9,900 MRR against $365 infra = **96.3% gross margin.**

At scale (2,500 users), the direct-HTTP approach keeps infra nearly flat while Apify's per-call pricing would grow linearly — so the margin advantage compounds.

---

## 10. The Build Sequence for Claude Code

This is the practical sequence to actually implement this in Claude Code.

### Week 1: Reverse-engineering session

**Day 1-2: Zillow extractor**
```
Task for Claude Code:
"Given this sample Zillow property page HTML, write a Python function
that extracts: address, beds, baths, sqft, lot_sqft, year_built,
property_type, list_price, photos, price_history, tax_history.
Use __NEXT_DATA__ parsing. Include AI fallback via Anthropic API when
parsing fails."
```

**Day 3-4: Airbnb search client**
```
Task for Claude Code:
"Given this cURL from Chrome DevTools inspecting Airbnb search,
build a Python client with methods:
- search_by_bbox(sw_lat, sw_lng, ne_lat, ne_lng, filters) -> List[Listing]
- get_listing_detail(listing_id) -> ListingDetail
Parameterize all the variable parts of the request.
Handle 429s with exponential backoff and a Retry-After respecting pause."
```

**Day 5: Cache layer**
```
Task for Claude Code:
"Build a Postgres-backed cache wrapper for async HTTP fetchers.
Include TTLs by source, provenance storage of raw responses in R2,
and cleanup of expired entries."
```

### Week 2: Calibration from design partner data

**Day 1-3: Ingest design partner CSVs**
Airbnb CSV parsing, join against listing IDs, populate `contributed_reservations`.

**Day 4-5: Fit the review-velocity model**
For each design partner listing, compare real nights booked (from CSV) against public review count deltas over the same period. Fit per-market review rate and review-to-booking lag. Store in `model_calibration`.

### Week 3: The forecast engine

Rules-based revenue forecast using the direct-HTTP comps + calibrated review velocity + AirROI-free baseline from comp distribution.

### Week 4: End-to-end integration + Apify fallback wiring

User pastes URL → extract property → search comps → build forecast → display results. Apify fallback wired in behind a feature flag.

---

## 11. Summary (v2.2)

| | v2.0 (Rabbu) | v2.1 (Apify) | v2.2 (Direct HTTP) |
|---|---|---|---|
| Phase 1 infra cost | $780–1,100/mo | $435–545/mo | $295–365/mo |
| Comp data cost | $500–800/mo | $150–250/mo | $0–50/mo (fallback) |
| Market coverage | 3 launch markets | 3 launch markets | **Nationwide from day one** |
| Eng maintenance | None | None | ~4 hrs/quarter |
| Legal posture | Cleanest | Very defensible | Defensible; more active |
| Vendor lock-in | Rabbu ToS | Apify availability | Own your pipeline |
| Time to moat | 12-18 mo | 6-9 mo | 6-9 mo |

The v2.2 approach is what you actually want for a Claude Code build with design partner data. It's scrappy, it's cheap, it removes the market-coverage constraint, and it owns the entire data pipeline. It's more engineering work upfront (measured in days, not weeks), less ongoing vendor cost, and more flexible when you want to add new data sources or markets.

The single judgment call: whether the slightly more active legal posture is acceptable. If yes, this is the right architecture. If no, stay on v2.1.

---

## Appendix A — Location Signals Data Sources

Every property report includes qualitative location signals across five categories. This section documents the free data sources that power that layer. All sources below are public or scrapable at zero marginal cost. The total incremental infrastructure cost for location signals is approximately **$0–30/mo**.

### Why every source here is free

During the product design process, we evaluated paid alternatives: Walk Score API ($200/mo), GreatSchools ($500/mo), FirstStreet Foundation climate data ($200–500/mo), AreaVibes ($50–200/mo). Each was rejected in favor of a free alternative that produces equivalent or more defensible output. The free stack isn't a compromise — it's the right architecture.

### The full data source list

| Signal category | Data source | Type | Refresh | Engineering cost |
|---|---|---|---|---|
| Crime (city-level) | FBI Crime Data API | Free API | Annual | 1 day |
| Crime (neighborhood) | SpotCrime / LexisNexis Community Crime Map | Scraped | Monthly | 2–3 days |
| Walkability | OpenStreetMap + Overture Maps | Free bulk download | Quarterly | 3–4 days (one-time) |
| Amenity density | OpenStreetMap (amenity tags) | Derived from OSM | Quarterly | (bundled with walkability) |
| Destination proximity | OSM POIs + hand-curated anchor list per market | Free + manual | As markets added | ~1 hr per market |
| Price trends | Redfin Data Center CSVs | Free download | Monthly | 1 day |
| Price trends (secondary) | Zillow Research CSVs | Free download | Monthly | 0.5 day |
| New business openings | OSM `start_date` tags + scraped city business licenses | Free + scraped | Weekly | 2 days base + per-city scrapers |
| Construction permits | Per-city permit office scrapers | Scraped | Weekly | 3 hrs per city |
| Demographics | Census ACS API | Free API | 5-year lag | 1 day |
| Flood zone | FEMA National Flood Hazard Layer API | Free API | As FEMA updates | 0.5 day |
| Wildfire risk | USGS Fire Occurrence + NIFC Historic Fire Perimeter | Free | Annual | 1 day |
| HOA detection | County assessor parcel data | Scraped per-county | Quarterly | 2–4 hrs per county |
| STR regulation risk | Existing regulatory data (see main spec) | Reused | — | 0 (already built) |
| Geocoding | Google Geocoding API (first 200/day free) | Mostly free | On-demand, cached permanently | 0.5 day |

### Data architecture for location signals

Same principles as the comp data stack. Cache aggressively. Store provenance. Self-heal when parsers break.

```sql
location_signals (
  id uuid pk,
  property_id uuid fk,
  category text,                 -- safety | walkability | trajectory | destination | risk
  metric_name text,              -- e.g. crime_rate_vs_metro, walk_score, flood_zone
  metric_value jsonb,            -- numeric, tier, or structured depending on metric
  source text,                   -- fbi_crime_api | osm | fema | census_acs | etc
  source_snapshot_r2_key text,
  computed_at timestamptz,
  model_version text,
  unique (property_id, category, metric_name, computed_at)
)
-- Indexes: (property_id, category), (source, computed_at)

destination_anchors (
  id uuid pk,
  market_id text,                -- nashville_tn | scottsdale_az | gatlinburg_tn
  name text,                     -- "Broadway entertainment district"
  lat numeric(10,7),
  lng numeric(10,7),
  anchor_type text,              -- entertainment | beach | downtown | attraction | airport | transit
  weight numeric,                -- relative importance (0–1)
  notes text,
  created_at, updated_at
)
```

### The Location Verdict AI task

```
File: packages/ai/tasks/location_verdict.py
Model: Claude Sonnet 4
Retrieval: all location_signals for the property + destination_anchors for the market
Output schema:
  {
    "verdict_tier": "strong" | "solid" | "mixed" | "caution",
    "one_sentence_summary": str,       // used in free Basic Report
    "full_narrative": str,              // 2-3 paragraphs, used in paid Full Report
    "watch_items": List[str],
    "positive_signals": List[str],
    "citations": List[{metric_name, value, source}]
  }

Critical: the prompt includes an explicit fair housing safety instruction.
Golden-file tested against FHA edge cases (high/low income tracts, 
varied demographic compositions). Deploy blocked on failing test.
```

### Market onboarding checklist

When adding a new market to Parcel, the location signals layer requires:

1. **Destination anchors curated** — 5–10 anchors per market, maintained by the founder or a market-specific contributor. Cost: ~1 hour per market.
2. **City permit scraper configured** — adapter for the specific city clerk or permit office. Cost: ~3 hours per city.
3. **County assessor parcel data ingested** — for HOA detection. Cost: ~3 hours per county.
4. **Crime data source verified** — confirm SpotCrime / Community Crime Map covers the geography. If not, flag the market as "city-level crime only."
5. **Walkability data refreshed** — download OSM for the metro, compute walkability grid, store results. Runs as part of quarterly refresh.

Total incremental cost of adding a new market: roughly a single day of setup work.

### What we deliberately don't include in v1

- **School ratings** — GreatSchools data has fair housing complexity and costs $500/mo. Use Census education attainment as a free proxy ("% adults with bachelor's in this tract") if any signal is needed. Revisit GreatSchools only if LTR conversion becomes strategically important.
- **Climate projections** — FirstStreet Foundation at $200–500/mo. Current risk (flood zone + wildfire band) covers 95% of the financial risk that matters for a buy decision today. Skip.
- **Real-time insurance quotes** — integrate Steadily or Proper only when we can collect a referral fee. Estimate costs via rule-based calculator until then.
- **Real-time crime** — neighborhood-level crime data is inherently lagged. Pretending otherwise damages trust. We disclose the lag.

### The fair housing guardrail (reminder)

This is repeated in CLAUDE.md and the Product Vision v3 because it's non-negotiable. Location signals can become legally problematic if handled wrong. The AI prompt that generates the Location Verdict must enforce Fair Housing Act compliance, and the test suite must catch violations before deploy. No exceptions.

