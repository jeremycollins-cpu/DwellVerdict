/**
 * Centralized user-agent strings for outbound requests.
 *
 * Two profiles:
 *
 *   BOT — identified ParcelBot tag for free public APIs that welcome
 *         (or require) identifiable traffic: FEMA NFHL, USGS, Census,
 *         FBI Crime Data, OSM Overpass, Yelp, Google Places. Using a
 *         real browser UA on these endpoints is rude and increases
 *         the chance of a rate-limit pushback.
 *
 *   BROWSER — realistic Chrome UA for public HTML scrapes where
 *         the upstream blocks bot UAs at the Akamai / Cloudflare
 *         layer (Zillow, Redfin, Airbnb). These endpoints return
 *         public pages that every browser can fetch; presenting as
 *         a browser is what lets the scrape work at all.
 *
 * Update the browser UA every few months to stay within a couple of
 * major Chrome releases. Drift by >6 major versions and bot filters
 * start flagging the mismatch.
 */

export const USER_AGENTS = {
  bot: "ParcelBot/1.0 (+https://dwellverdict.com/bot)",
  browser:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
} as const;
