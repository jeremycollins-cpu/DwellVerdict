const STEPS = [
  {
    step: "Step 01",
    title: "Paste any address.",
    body:
      "Type, paste from Zillow, or drop a listing URL. Works for any U.S. residential property — single family, condo, STR, long-term rental.",
  },
  {
    step: "Step 02",
    title: "Watch the verdict form.",
    body:
      "Scout pulls regulatory rules, comparable properties, revenue projections, and location signals — all grounded in cited sources. Usually under 30 seconds.",
  },
  {
    step: "Step 03",
    title: "Make the call.",
    body:
      "BUY, WATCH, or PASS with a confidence score. Every claim is traceable. Ask Scout to stress-test the analysis.",
  },
];

export function ThreeStepExplainer() {
  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-[1280px] scroll-mt-20 px-6 py-20 md:px-12 md:py-24"
    >
      <div className="mx-auto mb-12 max-w-[680px] text-center md:mb-14">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-terracotta">
          How it works
        </div>
        <h2 className="mt-4 font-serif text-[36px] font-normal leading-[1.15] tracking-[-0.02em] text-ink md:text-[44px]">
          Three steps. One verdict.
        </h2>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-muted md:text-[17px]">
          Built to mirror how experienced investors actually think. No
          spreadsheets. No fragmented tools. Just the answer.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.step}
            className="rounded-[10px] border border-hairline bg-card-ink p-7 transition-colors hover:border-hairline-strong md:p-8"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-terracotta">
              {step.step}
            </div>
            <h3 className="mt-3 text-[22px] font-medium leading-[1.25] tracking-[-0.02em] text-ink">
              {step.title}
            </h3>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
