/**
 * Founder quote — M2.5 platform-vision pass. Draft text is shipped
 * pending Jeremy's revision; refine in a small follow-up if the
 * wording isn't quite right (PROMPT_M2.5 Option A).
 */
export function FounderQuote() {
  return (
    <section className="mx-auto max-w-[940px] px-6 py-20 text-center md:py-24">
      <p className="font-serif text-[26px] font-normal leading-[1.4] tracking-[-0.015em] text-ink md:text-[32px]">
        <span className="text-terracotta">&ldquo;</span>
        I built DwellVerdict because every real estate decision touches
        twenty other decisions. The verdict tells you whether to buy. Then
        you have to actually buy it, renovate it, optimize the taxes, manage
        it, and decide what&rsquo;s next. We&rsquo;re the platform that walks
        you through all of it.
        <span className="text-terracotta">&rdquo;</span>
      </p>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
        Jeremy Collins · Founder, DwellVerdict
      </p>
    </section>
  );
}
