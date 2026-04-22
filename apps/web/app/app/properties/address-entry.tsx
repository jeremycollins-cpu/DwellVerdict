"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { AddressAutocomplete } from "@/components/address-autocomplete";
import { createPropertyAction } from "@/app/app/properties/actions";
import type { ParsedAddress } from "@/lib/address";

/**
 * AddressEntry — the paste-an-address card at the top of /app/properties.
 *
 * Owns the short UI state (selected address pending submission, error
 * message, loading flag) and delegates the actual mutation to the
 * `createPropertyAction` server action. On success, navigates to the
 * new property's detail page where verdict generation kicks off.
 *
 * We navigate client-side (router.push) instead of letting the server
 * action `redirect()` so the pending UI is instant and the inline
 * error handling surface stays under the client's control.
 */
export function AddressEntry() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState<{ resetAt: string } | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const handleSelect = (address: ParsedAddress) => {
    setError(null);
    setRateLimited(null);
    startTransition(async () => {
      const result = await createPropertyAction(address);
      if (!result.ok) {
        if (result.error === "rate_limited" && result.resetAt) {
          setRateLimited({ resetAt: result.resetAt });
        } else {
          setError(
            result.message ??
              (result.error === "invalid_address"
                ? "That address didn't look right. Try again with a full street address."
                : result.error === "unauthorized"
                  ? "Please sign in again."
                  : "Something went wrong. Please try again."),
          );
        }
        // Remount the input so the user can re-pick without stale state.
        setResetKey((k) => k + 1);
        return;
      }
      router.push(`/app/properties/${result.propertyId}`);
      router.refresh();
    });
  };

  return (
    <div className="relative overflow-hidden rounded-[14px] bg-card shadow-card">
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] bg-terracotta"
      />
      <div className="flex flex-col gap-4 p-6 pl-8 md:p-8 md:pl-10">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            New verdict
          </p>
          <h2 className="mt-1 text-lg font-medium tracking-[-0.01em] text-ink">
            Paste an address
          </h2>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="flex-1">
            <AddressAutocomplete
              key={resetKey}
              onSelect={handleSelect}
              onInvalid={(msg) => setError(msg)}
              disabled={pending}
            />
          </div>

          {pending ? (
            <div className="flex h-12 items-center gap-2 font-mono text-xs text-ink-muted md:px-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Creating property…</span>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-signal-pass/30 bg-signal-pass/5 px-3 py-2 text-sm text-signal-pass">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        {rateLimited ? (
          <div className="rounded-md border border-signal-watch/30 bg-signal-watch/5 px-3 py-2.5 text-sm text-ink">
            <p className="font-medium">
              You've used your 3 free verdicts this month.
            </p>
            <p className="mt-1 text-ink-muted">
              Quota resets {new Date(rateLimited.resetAt).toLocaleDateString()}.
              Upgrade to Pro for unlimited verdicts — coming in Sprint 3.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
