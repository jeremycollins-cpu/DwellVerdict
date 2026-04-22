import { auth } from "@clerk/nextjs/server";

import { checkHealth } from "@/lib/modeling-client";

export default async function PropertiesPage() {
  await auth.protect();

  // Call the modeling service after the auth gate clears. checkHealth
  // never throws — on any failure it returns
  // { ok: false, version: "unreachable" }, which the footer renders as
  // "Modeling: unavailable". Page loads regardless.
  const health = await checkHealth();

  return (
    // flex-1 fills the authed layout's <main> which is flex flex-col,
    // so this wrapper stretches to the viewport's remaining height and
    // the footer sits flush at the bottom regardless of empty-state
    // size.
    <div className="flex flex-1 flex-col">
      <section className="container flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">No properties yet</h1>
        <p className="max-w-md text-balance text-sm text-muted-foreground">
          Paste-an-address, reports, and Scout arrive in a later milestone. For
          now this is the empty state of your DwellVerdict dashboard.
        </p>
      </section>

      <footer className="border-t border-border/60 bg-muted/30">
        <div className="container flex h-10 items-center justify-end gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${
              health.ok ? "bg-green-500" : "bg-amber-500"
            }`}
          />
          {health.ok ? `Modeling: v${health.version}` : "Modeling: unavailable"}
        </div>
      </footer>
    </div>
  );
}
