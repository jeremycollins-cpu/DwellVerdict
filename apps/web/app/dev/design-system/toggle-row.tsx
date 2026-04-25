"use client";

import * as React from "react";

import { Toggle } from "@/components/ui/toggle";

/**
 * Client-side wrapper around the Toggle primitive so the design-system
 * preview page (a Server Component) can show interactive on/off + disabled
 * states without becoming a client component itself.
 */
export function DesignSystemToggleRow() {
  const [a, setA] = React.useState(true);
  const [b, setB] = React.useState(false);
  const [c] = React.useState(true);

  return (
    <div className="rounded-md border border-hairline bg-card-ink">
      <Row label="Email digest" hint="Daily summary of new verdicts">
        <Toggle checked={a} onChange={setA} aria-label="Email digest" />
      </Row>
      <Row label="Push alerts" hint="Off">
        <Toggle checked={b} onChange={setB} aria-label="Push alerts" />
      </Row>
      <Row label="Beta features" hint="Disabled, locked on">
        <Toggle checked={c} onChange={() => {}} disabled aria-label="Beta features" />
      </Row>
      <Row label="Small variant" hint="size='sm'">
        <Toggle checked={a} onChange={setA} size="sm" aria-label="Small toggle" />
      </Row>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-hairline px-4 py-3 last:border-b-0">
      <div>
        <div className="text-sm text-ink">{label}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          {hint}
        </div>
      </div>
      {children}
    </div>
  );
}
