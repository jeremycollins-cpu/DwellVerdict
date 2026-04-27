-- M3.7 fix-forward: bust stale USGS cache entries from before the
-- M3.7 fetcher repair landed in production.
--
-- Background: pre-M3.7, the USGS wildfire fetcher was pointed at
-- `services3.arcgis.com/T4QMspbfLg3qTGWY/.../US_Wildfires_v1/...`
-- which returned 400 "Invalid URL". The fetcher threw, the
-- orchestrator caught the throw, and `withCache` did not write a
-- cache entry on failure. **However**, an even-older successful
-- run had cached an empty/zero-fires payload because the canonical
-- service had degraded gradually before fully retiring — those
-- pre-degradation entries are still being served on every verdict
-- regeneration with a 30-day TTL. Kings Beach (295 Bend Ave) for
-- example shows `nearbyFireCount: 0` in cache from 2026-04-24,
-- when the actual NIFC InterAgencyFirePerimeterHistory dataset
-- has 9 fires within 5 miles (Martis 2001, etc.).
--
-- This migration force-expires every USGS cache entry written
-- before the M3.7 production deploy timestamp (PR #31 merge =
-- 2026-04-27 19:30 UTC). The next verdict regeneration on each
-- affected property will refetch from the new
-- InterAgencyFirePerimeterHistory_All_Years_View endpoint and
-- repopulate the cache with real data.
--
-- Idempotent — running twice is harmless. Read-only against rows
-- that don't match the predicate.

UPDATE data_source_cache
SET expires_at = NOW()
WHERE source = 'usgs'
  AND fetched_at < '2026-04-27 19:30:00'::timestamptz;
