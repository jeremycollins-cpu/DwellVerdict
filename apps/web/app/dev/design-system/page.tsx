import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { MapPin, Search, ShieldCheck, Sparkles } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { GlanceTile } from "@/components/ui/glance-tile";
import { Sidebar } from "@/components/ui/sidebar";
import { brandColors } from "@/lib/brand-tokens";
import { ChipFilterDemo } from "./chip-filter-demo";
import { DesignSystemToggleRow } from "./toggle-row";

export const metadata: Metadata = {
  title: "Design System · DwellVerdict",
  robots: { index: false, follow: false },
};

/**
 * Developer-facing playground that renders every M1.1 primitive so the
 * design system can be visually verified. Lives at `/dev/design-system`.
 *
 * Auth gate: must be signed in. Anyone not signed in gets a 404 — we
 * return notFound() rather than redirecting so the page's existence
 * isn't leaked publicly.
 *
 * Server / client boundary pattern (used here, applies to every later
 * milestone with mixed static + interactive content):
 *
 *   - The page itself is a Server Component so the auth gate can run
 *     server-side and serializable data (user info) reaches the page
 *     directly without an extra round-trip.
 *   - Static demos (color swatches, GlanceTile, signal/status/tag
 *     Chip variants, Avatar) render directly on the page — they have
 *     no event handlers and need no client runtime.
 *   - Each interactive demo is extracted into a small "use client"
 *     component co-located with the page (`chip-filter-demo.tsx`,
 *     `toggle-row.tsx`). The page imports them like any other
 *     component, but state lives inside the client island.
 *   - Components like `<Sidebar />` that are themselves "use client"
 *     can be rendered directly from the page as long as the props
 *     crossing the boundary are serializable (no functions).
 *
 * Rule of thumb: never pass an `onClick` (or any function) from a
 * Server Component to a Client Component. Wrap the interactive bit
 * in a small client component and pass plain data instead.
 *
 * This is NOT user-facing UI. Function over form.
 */
export default async function DesignSystemPage() {
  const { userId } = await auth();
  if (!userId) notFound();

  const user = await currentUser();
  const initials =
    `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase() ||
    user?.emailAddresses[0]?.emailAddress?.[0]?.toUpperCase() ||
    "DV";
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.emailAddresses[0]?.emailAddress ||
    "DwellVerdict";

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-10 border-b border-hairline pb-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            DwellVerdict · Internal
          </div>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Design System</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            M1.1 foundation. Every primitive here is the source of truth for
            later milestones. Resize the window to verify mobile behavior.
          </p>
        </header>

        <Section title="Brand tokens">
          <Subsection title="Colors">
            <ColorGrid />
          </Subsection>
          <Subsection title="Typography">
            <TypographyGrid />
          </Subsection>
        </Section>

        <Section title="Sidebar">
          <p className="mb-3 text-xs text-ink-muted">
            Rendered standalone in a 232px column. The mobile drawer trigger
            (hamburger, top-left of the viewport) appears only below 768px.
          </p>
          <div className="overflow-hidden rounded-md border border-hairline">
            <div className="flex">
              <div className="w-[232px] shrink-0 border-r border-hairline">
                <div className="h-[600px]">
                  <Sidebar
                    user={{ name, initials, plan: "Pro · $40/mo" }}
                    activeRoute="/app/dashboard"
                  />
                </div>
              </div>
              <div className="flex-1 bg-paper-warm p-6">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
                  Page content
                </div>
                <p className="mt-2 max-w-prose text-sm text-ink-70">
                  Sidebar is sticky on desktop and collapses to an off-canvas
                  drawer below 768px. Active item is wired via{" "}
                  <code className="font-mono text-xs text-ink">activeRoute</code>{" "}
                  — here it points at <code className="font-mono text-xs">/app/dashboard</code>.
                </p>
              </div>
            </div>
          </div>
        </Section>

        <Section title="GlanceTile">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <GlanceTile label="Total verdicts" value="12" unit="all time" delta="+3 vs Mar" deltaTone="positive" />
            <GlanceTile label="Properties" value="8" unit="active" />
            <GlanceTile label="Avg confidence" value="74%" delta="−2 pts" deltaTone="negative" accent />
            <GlanceTile label="Buy signals" value="5" unit="of 12" signal="buy" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <GlanceTile label="Watch" value="4" signal="watch" />
            <GlanceTile label="Pass" value="3" signal="pass" />
            <GlanceTile label="Reports this month" value="34 / 50" delta="68% used" deltaTone="neutral" />
          </div>
        </Section>

        <Section title="Chip — filter">
          <p className="text-xs text-ink-muted">
            Interactive — click a chip to set it active. Lives in
            <code className="mx-1 font-mono text-ink">chip-filter-demo.tsx</code>
            so the page can stay a Server Component.
          </p>
          <ChipFilterDemo />
        </Section>

        <Section title="Chip — signal">
          <div className="flex flex-wrap items-center gap-2">
            <Chip variant="signal" signal="buy">Buy</Chip>
            <Chip variant="signal" signal="watch">Watch</Chip>
            <Chip variant="signal" signal="pass">Pass</Chip>
            <Chip variant="signal" signal="buy" size="md">Strong Buy</Chip>
            <Chip variant="signal" signal="watch" size="md" leadingIcon={<Sparkles />}>
              Conditional
            </Chip>
          </div>
        </Section>

        <Section title="Chip — status">
          <div className="flex flex-wrap items-center gap-2">
            <Chip variant="status">Estimated</Chip>
            <Chip variant="status">Committed</Chip>
            <Chip variant="status">Paid</Chip>
            <Chip variant="status">Pending</Chip>
            <Chip variant="status">Accepted</Chip>
            <Chip variant="status">Rejected</Chip>
            <Chip variant="status">Expired</Chip>
          </div>
        </Section>

        <Section title="Chip — tag">
          <div className="flex flex-wrap items-center gap-2">
            <Chip variant="tag" leadingIcon={<ShieldCheck />}>Regulatory</Chip>
            <Chip variant="tag">Financial</Chip>
            <Chip variant="tag" leadingIcon={<MapPin />}>Location</Chip>
            <Chip variant="tag">Comps</Chip>
            <Chip variant="tag" leadingIcon={<Search />}>Diligence</Chip>
          </div>
        </Section>

        <Section title="Toggle">
          <DesignSystemToggleRow />
        </Section>

        <Section title="Avatar">
          <Subsection title="Default — initials, four sizes">
            <div className="flex flex-wrap items-end gap-4">
              <AvatarSample initials="DV" size="sm" label="sm · 24" />
              <AvatarSample initials="DV" size="md" label="md · 30" />
              <AvatarSample initials="DV" size="lg" label="lg · 40" />
              <AvatarSample initials="DV" size="xl" label="xl · 64" />
            </div>
          </Subsection>
          <Subsection title="Role variants">
            <div className="flex flex-wrap items-end gap-4">
              <AvatarSample initials="JL" size="lg" variant="role" role="agent" label="Agent" />
              <AvatarSample initials="MR" size="lg" variant="role" role="lender" label="Lender" />
              <AvatarSample initials="SK" size="lg" variant="role" role="inspector" label="Inspector" />
              <AvatarSample initials="TT" size="lg" variant="role" role="title" label="Title" />
            </div>
          </Subsection>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-ink-muted">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-ink-70">{title}</div>
      {children}
    </div>
  );
}

function ColorSwatch({ name, value }: { name: string; value: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-hairline bg-card-ink">
      <div className="h-12" style={{ background: value }} />
      <div className="px-3 py-2">
        <div className="font-mono text-[11px] text-ink">{name}</div>
        <div className="font-mono text-[10px] text-ink-muted">{value}</div>
      </div>
    </div>
  );
}

function ColorGrid() {
  const entries = Object.entries(brandColors);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {entries.map(([name, value]) => (
        <ColorSwatch key={name} name={name} value={value} />
      ))}
    </div>
  );
}

function TypographyGrid() {
  return (
    <div className="space-y-3 rounded-md border border-hairline bg-card-ink p-5">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
          Geist Sans · 32 / 24 / 16 / 14
        </div>
        <div className="font-sans text-[32px] leading-tight tracking-tight text-ink">
          Verdict-grade clarity.
        </div>
        <div className="font-sans text-2xl tracking-tight text-ink">
          Verdict-grade clarity.
        </div>
        <div className="font-sans text-base text-ink-70">
          Verdict-grade clarity.
        </div>
        <div className="font-sans text-sm text-ink-muted">
          Verdict-grade clarity.
        </div>
      </div>
      <div className="border-t border-hairline pt-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
          Geist Mono · 12 / 10
        </div>
        <div className="font-mono text-xs text-ink">
          dwellverdict / property #c84a31
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
          dwellverdict / property #c84a31
        </div>
      </div>
      <div className="border-t border-hairline pt-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
          Instrument Serif · editorial
        </div>
        <div
          className="text-3xl italic text-ink"
          style={{ fontFamily: "var(--font-instrument-serif), serif" }}
        >
          A property is a five-stage record.
        </div>
      </div>
    </div>
  );
}

function AvatarSample({
  initials,
  size,
  variant,
  role,
  label,
}: {
  initials: string;
  size: "sm" | "md" | "lg" | "xl";
  variant?: "default" | "role";
  role?: "agent" | "lender" | "inspector" | "title";
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Avatar initials={initials} size={size} variant={variant} role={role} />
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </div>
    </div>
  );
}
