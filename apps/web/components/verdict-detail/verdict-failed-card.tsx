import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";

import { VerdictLoader } from "@/app/app/properties/[propertyId]/verdict-loader";

/**
 * Failed-state card with FHA-aware copy. The fair-housing lint
 * blocks narratives that include protected-class characterizations;
 * those failures need a separate explanation from generic AI /
 * data-source errors.
 */
interface VerdictFailedCardProps {
  verdictId: string;
  propertyId: string;
  addressFull: string;
  errorMessage: string | null;
}

const FHA_BLOCK_MARKER = "fair_housing_lint_blocked";

export function VerdictFailedCard({
  verdictId,
  propertyId,
  addressFull,
  errorMessage,
}: VerdictFailedCardProps) {
  const isFhaBlock =
    typeof errorMessage === "string" && errorMessage.includes(FHA_BLOCK_MARKER);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/app/properties/${propertyId}`}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3" />
        Back to property
      </Link>

      <div className="rounded-2xl border border-pass-border bg-pass-soft p-7 md:p-8">
        <div className="flex items-start gap-3">
          <AlertCircle
            className="mt-0.5 size-5 shrink-0 text-pass"
            strokeWidth={2}
          />
          <div className="flex-1">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-pass">
              Generation failed
            </p>
            <h2 className="mt-1 font-mono text-[18px] font-medium tracking-[-0.005em] text-ink">
              Scout couldn&rsquo;t render a verdict for {addressFull}
            </h2>

            {isFhaBlock ? (
              <p className="mt-4 max-w-[640px] text-[15px] leading-[1.6] text-ink-70">
                Our fair-housing safety check flagged the underlying data and
                paused this verdict before it was written. This usually
                happens when neighborhood descriptions reference protected
                characteristics (race, religion, familial status, etc.). The
                generation didn&rsquo;t go through; you can retry — sometimes
                a re-fetch of the upstream signals produces clean data. If
                this persists for the same address, please email{" "}
                <a
                  href="mailto:support@dwellverdict.com"
                  className="text-terracotta underline-offset-2 hover:underline"
                >
                  support@dwellverdict.com
                </a>{" "}
                and we&rsquo;ll investigate.
              </p>
            ) : (
              <p className="mt-4 max-w-[640px] text-[15px] leading-[1.6] text-ink-70">
                Generation hit an error before completing. You can retry —
                failures don&rsquo;t count against your monthly quota.
                {errorMessage ? (
                  <>
                    {" "}
                    Error detail:{" "}
                    <span className="font-mono text-[12px] text-ink-muted">
                      {errorMessage}
                    </span>
                  </>
                ) : null}
              </p>
            )}

            <div className="mt-6">
              <VerdictLoader verdictId={verdictId} label="Retry verdict" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
