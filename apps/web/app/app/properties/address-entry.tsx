"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertCircle, ArrowRight, Loader2, MapPin, X } from "lucide-react";

import { AddressAutocomplete } from "@/components/address-autocomplete";
import { createPropertyAction } from "@/app/app/properties/actions";
import type { ParsedAddress } from "@/lib/address";

/**
 * AddressEntry — paste-an-address hero block at the top of
 * `/app/properties`. Refreshed in M3.1 to match mockup 03's
 * focused layout: terracotta-eyebrow chip, serif headline, sub
 * copy, then a single boxed row containing the pin icon, the
 * Google Places input, and a "Generate verdict" CTA button.
 *
 * Two-step flow per the mockup. Picking a suggestion stages the
 * address (preview shown inline, CTA enabled). The CTA click
 * commits via `createPropertyAction` and navigates to the new
 * property's detail page where verdict generation kicks off.
 *
 * Behavior preserved from the prior version: rate-limit handling,
 * inline error surface, transition pending UI, remount-on-failure
 * via `resetKey` so the user can re-pick without stale state.
 */
export function AddressEntry() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [staged, setStaged] = useState<ParsedAddress | null>(null);

  const handleSelect = (address: ParsedAddress) => {
    setError(null);
    setStaged(address);
  };

  // M3.5: property creation no longer charges a report slot or
  // creates a verdict. The wizard at /intake handles both. This
  // submit just creates the property row and routes onward — the
  // property detail page redirects to /intake or /verdicts/[id]
  // depending on intake state.
  const handleSubmit = () => {
    if (!staged || pending) return;
    const address = staged;
    startTransition(async () => {
      const result = await createPropertyAction(address);
      if (!result.ok) {
        setError(
          result.message ??
            (result.error === "invalid_address"
              ? "That address didn't look right. Try again with a full street address."
              : "Please sign in again."),
        );
        setStaged(null);
        setResetKey((k) => k + 1);
        return;
      }
      router.push(`/app/properties/${result.propertyId}`);
      router.refresh();
    });
  };

  const handleClearStaged = () => {
    setStaged(null);
    setResetKey((k) => k + 1);
  };

  const ctaDisabled = !staged || pending;

  return (
    <section className="flex flex-col items-center gap-6 py-4 md:py-8">
      <div className="max-w-[640px] text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-terracotta-border bg-terracotta-soft px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-terracotta">
          <span className="size-[5px] rounded-full bg-terracotta" />
          New verdict
        </div>
        <h2 className="mt-5 font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.02em] text-ink md:text-[44px]">
          Paste any address to begin.
        </h2>
        <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-[1.55] text-ink-muted md:text-[16px]">
          Any U.S. residential property. Scout generates a verdict with cited
          evidence in under a minute.
        </p>
      </div>

      <div className="w-full max-w-[720px]">
        <div
          className={`flex items-center gap-3 rounded-[14px] border-2 bg-card-ink py-1 pl-5 pr-1 transition-colors focus-within:border-terracotta focus-within:shadow-[0_0_0_4px_rgba(197,90,63,0.08)] md:gap-3.5 md:pl-[22px] ${
            staged ? "border-terracotta" : "border-hairline-strong"
          }`}
        >
          <MapPin
            aria-hidden
            className="size-5 shrink-0 text-ink-muted"
            strokeWidth={1.8}
          />

          {staged ? (
            <StagedAddress
              address={staged}
              onClear={handleClearStaged}
              disabled={pending}
            />
          ) : (
            <AddressAutocomplete
              key={resetKey}
              onSelect={handleSelect}
              onInvalid={(msg) => setError(msg)}
              disabled={pending}
              placeholder="295 Bend Ave, Kings Beach, CA"
            />
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={ctaDisabled}
            className="inline-flex shrink-0 items-center gap-2 rounded-[10px] bg-ink px-5 py-3.5 text-sm font-medium text-paper transition-colors hover:bg-ink-70 disabled:cursor-not-allowed disabled:opacity-50 md:px-[22px]"
          >
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span className="hidden sm:inline">Continue&hellip;</span>
              </>
            ) : (
              <>
                <span className="hidden sm:inline">Continue to intake</span>
                <span className="sm:hidden">Continue</span>
                <ArrowRight className="size-3.5" strokeWidth={2} />
              </>
            )}
          </button>
        </div>

        <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
          Google Places confirms the address before submission.
        </p>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-pass-border bg-pass-soft px-3 py-2 text-sm text-pass">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StagedAddress({
  address,
  onClear,
  disabled,
}: {
  address: ParsedAddress;
  onClear: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex w-full flex-1 items-center gap-2 py-4">
      <div className="min-w-0 flex-1 truncate text-[18px] tracking-[-0.005em] text-ink">
        {address.addressFull}
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={disabled}
        aria-label="Clear address and pick a different one"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-paper-warm hover:text-ink disabled:opacity-50"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
