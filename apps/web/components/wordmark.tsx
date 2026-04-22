/**
 * The DwellVerdict wordmark — Approach A, the Integrated Wordmark.
 *
 * Renders "DwellVerdict" in Instrument Serif 400 title case with a
 * small terracotta roof-peak above the V in "Verdict." The wordmark
 * itself is the brand mark; no separate icon ships in Phase C Redux.
 * Favicon / app-icon / OG-image treatments are deferred to a later
 * pass.
 *
 * Sizing: the roof-peak is positioned and scaled in em units so the
 * detail tracks the font size automatically. No per-context tuning
 * needed when the wordmark appears in the header (18px), footer
 * (14px), or display contexts (48px+).
 *
 * This is a presentation-only component — wrap it with <Link /> at
 * the caller when navigation is needed.
 */

type Props = {
  /** Font size in pixels. Default 18 (header context). */
  fontSize?: number;
  /** Extra classes composed onto the root span. */
  className?: string;
};

export function Wordmark({ fontSize = 18, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-baseline text-ink ${className}`.trim()}
      style={{
        fontFamily: "var(--font-instrument-serif)",
        fontSize: `${fontSize}px`,
        fontWeight: 400,
        letterSpacing: "0.005em",
      }}
    >
      Dwell
      <span style={{ position: "relative", display: "inline-block" }}>
        V
        <svg
          viewBox="0 0 10 5"
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: "-0.22em",
            transform: "translateX(-50%)",
            width: "0.55em",
            height: "0.28em",
          }}
        >
          <path
            d="M 0.5 4.5 L 5 0.5 L 9.5 4.5"
            stroke="hsl(var(--terracotta))"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </span>
      erdict
    </span>
  );
}
