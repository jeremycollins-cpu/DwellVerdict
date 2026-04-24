"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * POSTs to /api/stripe/portal and redirects the browser to the
 * returned portal URL. Kept small — the page itself is a server
 * component and this is the only interactive bit.
 */
export function ManageBillingButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.url) {
        setError(body.message ?? body.error ?? `Portal failed (${res.status})`);
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
      <Button onClick={onClick} disabled={pending} className="w-full">
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Opening portal…
          </>
        ) : (
          "Manage billing"
        )}
      </Button>
      {error ? (
        <span className="font-mono text-xs text-signal-pass">{error}</span>
      ) : null}
    </div>
  );
}
