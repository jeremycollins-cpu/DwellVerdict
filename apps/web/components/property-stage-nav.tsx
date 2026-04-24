import Link from "next/link";
import {
  FileCheck,
  ClipboardList,
  Hammer,
  Building2,
  Compass,
} from "lucide-react";

/**
 * Five-stage nav shown on every property page per ADR-7.
 *
 * All five stages are real product surfaces (Finding, Evaluating,
 * Buying, Renovating, Managing). Stages the user hasn't opened
 * yet still render — clicking loads an empty state, not a waitlist.
 */

const STAGES = [
  { key: "finding", label: "Finding", Icon: Compass, href: "" },
  { key: "evaluating", label: "Evaluating", Icon: ClipboardList, href: "" },
  { key: "buying", label: "Buying", Icon: FileCheck, href: "/buying" },
  { key: "renovating", label: "Renovating", Icon: Hammer, href: "/renovating" },
  { key: "managing", label: "Managing", Icon: Building2, href: "/managing" },
] as const;

export function PropertyStageNav({
  propertyId,
  active,
}: {
  propertyId: string;
  active: "finding" | "evaluating" | "buying" | "renovating" | "managing";
}) {
  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b border-hairline pb-0">
      {STAGES.map((stage) => {
        const isActive = stage.key === active;
        const href = `/app/properties/${propertyId}${stage.href}`;
        return (
          <Link
            key={stage.key}
            href={href}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-[2px] px-3 pb-2 pt-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] transition-colors ${
              isActive
                ? "border-signal-buy text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <stage.Icon className="h-3.5 w-3.5" />
            {stage.label}
          </Link>
        );
      })}
    </nav>
  );
}
