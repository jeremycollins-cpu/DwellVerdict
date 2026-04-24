import { ImageResponse } from "next/og";

/**
 * Root-level OpenGraph image — generates https://dwellverdict.com/opengraph-image.
 *
 * Next.js 15 App Router convention: this file's default export renders
 * a 1200×630 PNG that's automatically attached to the og:image meta tag
 * for every page UNDER this segment that doesn't have its own
 * `opengraph-image.tsx`.
 *
 * Font rendering: Satori (which powers ImageResponse) requires at least
 * one font. With no `fonts` option passed, Next bundles Inter as the
 * fallback. The `fontFamily: 'Geist'` string in CSS below will not
 * match the bundled font, so the wordmark renders in Inter 800 — the
 * system-ui fallback you (Jeremy) explicitly approved for this
 * milestone. To upgrade to real Geist: fetch the .woff file and pass
 * it via `ImageResponse({ fonts: [{ name: 'Geist', data: ..., weight: 800 }] })`.
 *
 * SVG: the D-house + V-check paths are inlined rather than referenced
 * via `<img src="/brand/logo-mark.svg" />` because Satori's external
 * image loading is finicky in dev and can silently fall through.
 */

export const alt = "DwellVerdict — Carfax for homes.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#fafaf7",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 180, // mark top ≈ 30% from top of 630px canvas
          fontFamily:
            "'Geist', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {/* D-house mark with V-check — inline SVG paths.
            `fill="none"` on the root is required for parity with the
            Logo component and the shipped SVG files. Satori's SVG
            parser inherits default fill into children that don't have
            their own fill — without this attribute the V-check stroke
            path (fill="none") can render as solid-filled or cause the
            D-curve's Q command to break at the fill boundary. */}
        <svg width={180} height={180} viewBox="0 0 52 52" fill="none">
          <path
            d="M 8 22 L 26 6 L 44 22 Q 44 46 26 46 L 8 46 Z"
            fill="#c55a3f"
          />
          <path
            d="M 15 31 L 22 38 L 36 24"
            stroke="#fafaf7"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>

        {/* Wordmark: dwell (ink) + verdict (terracotta). Two-tone split
            via adjacent spans — Satori's flex layout composes them
            horizontally because the parent is display:flex with no
            flexDirection override (default row). */}
        <div
          style={{
            display: "flex",
            fontSize: 80,
            fontWeight: 800,
            letterSpacing: "-0.045em",
            lineHeight: 1,
            marginTop: 40,
          }}
        >
          <span style={{ color: "#1c1917" }}>dwell</span>
          <span style={{ color: "#c55a3f" }}>verdict</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: "#78716c",
            marginTop: 24,
          }}
        >
          Carfax for homes.
        </div>
      </div>
    ),
    { ...size },
  );
}
