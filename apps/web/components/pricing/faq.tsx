/**
 * Pricing FAQs. Answers verified against actual product behavior:
 *   - Free tier = 1 lifetime verdict (consumeReport, free branch)
 *   - Cancel = end of current billing period
 *     (apps/web/app/api/webhooks/stripe/route.ts)
 *   - Caps = hard, no overage billing (CLAUDE.md § Pricing)
 *   - Scout = pro-only, 30/day, 300/month
 *     (apps/web/app/api/scout/message/route.ts)
 *   - Stripe = PCI-DSS Level 1, all payment data lives there
 */

const FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "How does the free tier work?",
    a: "Every account gets one full verdict. It's the real product — no degraded preview, no watermark. Once you've used it, you'll need to subscribe to generate more. Spend it on a property you're seriously evaluating.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from Settings → Billing whenever you want. Your subscription stays active until the end of the current billing period; after that, your account remains but new verdict generation and Pro features are paused until you re-subscribe.",
  },
  {
    q: "Do you offer refunds?",
    a: "We don't offer refunds on subscription payments. You can cancel anytime to prevent the next charge. If something specific went wrong, email us — we'd rather hear it directly.",
  },
  {
    q: "Can I switch between DwellVerdict and Pro?",
    a: "Yes. Upgrade or downgrade anytime from Settings → Billing. Upgrades prorate immediately. Downgrades take effect at the end of the current billing period — you keep Pro features until then.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Your account, properties, verdicts, and history all stay intact. You lose the ability to run new verdicts and use Pro features, but everything you generated while subscribed remains accessible. Re-subscribe anytime to resume.",
  },
  {
    q: "Are there usage caps on Pro?",
    a: "Pro includes 200 verdicts per calendar month — well above what an active investor will use. Scout AI chat is capped at 30 messages per day and 300 per month to keep costs sustainable. Other Pro features (Compare, Briefs, Alerts, Portfolio) have no usage caps.",
  },
  {
    q: "What happens if I hit a monthly cap?",
    a: "You'll see a clear \"cap reached, resets on the 1st\" message. We don't auto-charge overages — caps are hard. If you regularly hit the DwellVerdict cap (50/month), upgrading to Pro (200/month) is usually the right call.",
  },
  {
    q: "Do you have a team or agency plan?",
    a: "Not yet. Current plans are designed for individual investors. Team accounts and agency features are on the post-launch roadmap — let us know what you'd need at hello@dwellverdict.com.",
  },
  {
    q: "How is my payment data secured?",
    a: "Payments are processed by Stripe, who is PCI-DSS Level 1 certified. Your card details never touch our servers — we only store an opaque customer reference for billing lookups.",
  },
  {
    q: "Is this investment advice?",
    a: "No. DwellVerdict provides research summaries and data — not investment, legal, or tax advice. Verify regulatory status, insurance, and market specifics with the relevant professionals before any real decision.",
  },
];

export function FAQ() {
  return (
    <section
      id="faq"
      className="mx-auto max-w-[1080px] scroll-mt-20 px-6 py-20 md:px-12 md:py-24"
    >
      <div className="mx-auto mb-10 max-w-[680px] text-center md:mb-12">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-terracotta">
          Answers
        </div>
        <h2 className="mt-4 font-serif text-[32px] font-normal leading-[1.15] tracking-[-0.02em] text-ink md:text-[40px]">
          Common pricing questions.
        </h2>
      </div>

      <div className="grid gap-x-12 gap-y-8 md:grid-cols-2">
        {FAQS.map((item) => (
          <div key={item.q} className="flex flex-col gap-2.5">
            <h3 className="text-[16px] font-medium tracking-[-0.01em] text-ink">
              {item.q}
            </h3>
            <p className="text-[14px] leading-[1.6] text-ink-70">{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
