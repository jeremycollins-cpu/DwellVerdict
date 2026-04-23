"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Client-side button that kicks off a Stripe Checkout session for
 * the signed-in user. If the user isn't signed in, the button
 * instead sends them to the sign-in page — Clerk's middleware
 * then redirects them back to /pricing post-auth where they can
 * click again.
 */
export function CheckoutButton({
  plan,
  label,
  variant = "default",
  isSignedIn,
}: {
  plan: "starter" | "pro";
  label: string;
  variant?: "default" | "outline";
  isSignedIn: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!isSignedIn) {
      window.location.href = "/sign-in?redirect_url=/pricing";
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.url) {
        setError(body.message ?? body.error ?? `Checkout failed (${res.status})`);
        setPending(false);
        return;
      }
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={variant}
        className="w-full"
        onClick={onClick}
        disabled={pending}
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Redirecting to Stripe…
          </>
        ) : (
          label
        )}
      </Button>
      {error ? (
        <span className="font-mono text-xs text-signal-pass">{error}</span>
      ) : null}
    </div>
  );
}
