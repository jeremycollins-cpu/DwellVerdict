/**
 * Editorial quote block. Centered, serif, with a terracotta open/
 * close quote treatment. Mockup placeholder copy — swap for real
 * design-partner attribution once Jeremy has one approved for
 * public use.
 */
export function FounderQuote() {
  return (
    <section className="mx-auto max-w-[940px] px-6 py-20 text-center md:py-24">
      <p className="font-serif text-[28px] font-normal leading-[1.35] tracking-[-0.015em] text-ink md:text-[36px]">
        <span className="text-terracotta">&ldquo;</span>
        Finally. A tool that thinks about property like I do — with verdicts,
        not dashboards.
        <span className="text-terracotta">&rdquo;</span>
      </p>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
        Early design partner · 14-unit STR portfolio · Colorado
      </p>
    </section>
  );
}
