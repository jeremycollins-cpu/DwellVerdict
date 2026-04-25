# PROMPT 01 · Milestone 1.1 — Foundation: Brand Tokens + Design System Primitives

**Reference:** `docs/refactor/REFACTOR_MASTER_PLAN.md` § Phase 1 · M1.1

**Branch:** `refactor/M1.1-foundation-tokens`
**PR title:** `M1.1 — Foundation: brand tokens + design system primitives`

---

## What this milestone does

Lays the design system foundation that every subsequent milestone depends on. After this PR merges, no user-visible changes occur, but every later milestone has the shared primitives it needs.

Three things ship in this PR:

1. Brand token verification + any missing additions
2. Five new shared components added to `apps/web/components/ui/`: `Sidebar`, `GlanceTile`, `Chip` (with variants), `Toggle`, `Avatar`
3. A storybook-style preview page at `/dev/design-system` (auth-protected to org members) so the primitives can be visually verified

## Detailed scope

### Part 1: Brand token audit + additions

**Read these mockup files** to understand what colors, spacing, and patterns the design system needs. The mockups are referenced in `docs/refactor/REFACTOR_MASTER_PLAN.md`. Key files to study:

- `05-dashboard.html` (uses sidebar, glance tiles, panels — most representative)
- `v4-verdict.html` (uses confidence rings, evidence cards, signal chips)
- `12-alerts.html` (uses tabs, severity chips, toggle switches, glance tiles)
- `19-settings-landing.html` (uses setting cards, danger zone, chip patterns)

If those files aren't in the repo yet, ask me to add them or work from the descriptions in the master plan.

**Audit `apps/web/lib/brand-tokens.ts`** against the colors used in those mockups. Specifically check:

- All terracotta variants present (`terracotta`, `terracottaDeep`, `terracottaSoft`, `terracottaWash`, `terracottaBorder`)
- All ink shades present (`ink`, `ink70`, `inkMuted`, `inkSubtle`, `inkFaint`)
- All paper variants present (`paper`, `paperWarm`, `paperDeep`, `cardInk`, `sidebarBg`)
- Hairline variants (`hairline`, `hairlineStrong`)
- All signal colors with soft + border variants (`buy`/`buySoft`/`buyBorder`, `watch`/`watchSoft`/`watchBorder`, `pass`/`passSoft`/`passBorder`)

**If anything is missing**, add it to `brand-tokens.ts` and the corresponding HSL variables in `apps/web/app/globals.css`. Don't change existing values — only add missing ones.

**Verify Tailwind config** at `apps/web/tailwind.config.ts` exposes all tokens as Tailwind utility classes. The mockups use classes like `bg-paper-warm`, `text-terracotta`, `border-hairline-strong`, `text-buy`, `bg-watch-soft`, etc. If any are missing from the config, add them.

If you find the existing tokens are sufficient, document that in the PR description ("Brand tokens audit: complete, no additions required").

### Part 2: Five shared components

Each component lives at `apps/web/components/ui/{name}.tsx` and exports a typed React component. Use `class-variance-authority` (already a dependency) for variants. Use `clsx` + `tailwind-merge` for class composition.

#### 2a. `Sidebar`

The application sidebar shell from the mockups. Used in M1.3 to replace the current top-bar.

**Props:**
```typescript
interface SidebarProps {
  user: {
    name: string;
    initials: string;
    plan: string; // e.g. "Pro · $40/mo"
  };
  activeRoute?: string; // for highlighting active nav item
}
```

**Visual reference:** Look at any mockup's sidebar (every file from `05-dashboard.html` onward has one). Width: 232px. Background: `var(--sidebar-bg)`. Logo at top with bottom border. Nav items grouped into 3 sections with `Geist Mono` uppercase section labels. Active item has terracotta left-border accent + tinted background. User footer at bottom with avatar + name + plan.

**Behavior:**
- Sidebar accepts a list of nav items via children or a configured array
- Active item highlighted via `activeRoute` prop matching item href
- Mobile: collapses to drawer (off-canvas) below 768px viewport
- Desktop: sticky position, full height (`h-screen sticky top-0`)

**For this milestone**, hard-code the nav items list inside the Sidebar component. M1.3 will wire it to actual routes. Items list:

```
Primary section:
- Dashboard (icon: home) → /app/dashboard
- Properties (icon: building, badge count) → /app/properties
- Verdicts (icon: clock-circle, badge count) → /app/verdicts
- Compare (icon: columns) → /app/compare

Workspace section:
- Portfolio (icon: bar-chart) → /app/portfolio
- Briefs (icon: lines) → /app/briefs
- Alerts (icon: bell, badge count, accent) → /app/alerts

Account section:
- Settings (icon: gear) → /app/settings
```

Use `lucide-react` (already a dependency) for icons. Pick the closest matching icons.

#### 2b. `GlanceTile`

Thin metric tile used in glance metric rows on Dashboard, Verdicts, Portfolio, Alerts.

**Props:**
```typescript
interface GlanceTileProps {
  label: string;             // "Total verdicts"
  value: string | number;    // "12"
  unit?: string;             // "all time"
  delta?: string;            // "+3 vs Mar"
  deltaTone?: 'positive' | 'negative' | 'neutral';
  accent?: boolean;          // shows terracotta left-border
  signal?: 'buy' | 'watch' | 'pass'; // colors the value text
}
```

**Visual:** Card with `bg-card-ink`, border `hairline`, rounded corners, padding `14px 16px`. If `accent`, left-border 3px terracotta. Label is `Geist Mono` 10px uppercase muted. Value is 22px Geist medium with negative letter-spacing. Unit is mono 10px muted, baseline-aligned with value.

#### 2c. `Chip`

Multi-variant chip used for filters, signals, statuses, tags throughout the app.

**Props:**
```typescript
interface ChipProps {
  variant?: 'filter' | 'signal' | 'status' | 'tag';
  signal?: 'buy' | 'watch' | 'pass';
  active?: boolean;
  size?: 'sm' | 'md';
  leadingIcon?: React.ReactNode;
  count?: number;
  children: React.ReactNode;
  onClick?: () => void;
}
```

**Variants:**

- **filter** — Used in filter bars. Inactive: `bg-card-ink border-hairline-strong`, hover darken border. Active: `bg-ink text-paper border-ink`. Optional count chip on right.
- **signal** — Used for verdict signals. Pill shape, `Geist Mono` 10px uppercase 0.16em letter-spacing. Buy: green soft-bg + green text + green border. Watch: orange. Pass: red. Optional leading dot.
- **status** — Used for completion states. Like signal but with neutral colors (estimated/committed/paid, pending/accepted/rejected/expired).
- **tag** — Smaller, subtle. Used for taxonomy tags ("Regulatory", "Financial"). Mono 10px, `bg-paper-warm`, no border.

#### 2d. `Toggle`

Custom toggle switch matching the mockup style. 32×18px container, 14×14 white circle, terracotta when on, gray when off, smooth transition.

**Props:**
```typescript
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}
```

#### 2e. `Avatar`

Circular avatar with initials fallback or image.

**Props:**
```typescript
interface AvatarProps {
  initials?: string;
  imageUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl'; // 24 / 30 / 40 / 64
  variant?: 'default' | 'role'; // role uses gradient backgrounds for contact roles (agent/lender/etc)
  role?: 'agent' | 'lender' | 'inspector' | 'title'; // only when variant='role'
}
```

For the `role` variant, use the gradient backgrounds from the mockup #14 contacts grid:
- agent: `linear-gradient(135deg, #c55a3f, #a8472f)` (terracotta)
- lender: `linear-gradient(135deg, #0e9467, #0a6e4e)` (buy green)
- inspector: `linear-gradient(135deg, #c77a14, #9d6010)` (watch orange)
- title: `linear-gradient(135deg, #44403c, #1c1917)` (ink)

For the default variant, use ink gradient: `linear-gradient(135deg, #1c1917, #44403c)`.

### Part 3: Design system preview page

Create `apps/web/app/dev/design-system/page.tsx`. This is a developer-facing preview page that renders all the new primitives so they can be visually verified.

**Auth gate:** Only accessible to authenticated org members. Use existing Clerk auth. Show a 404 to anyone not signed in (don't leak that the page exists).

**Page structure:**

```
Design System

Brand tokens
  [Color swatches grid showing all tokens with their values]
  [Typography samples: Geist sans, Geist Mono, Instrument Serif at various sizes]

Components
  Sidebar (rendered standalone in a 232px column)
  GlanceTile (one of each variant)
  Chip — filter (active and inactive)
  Chip — signal (buy/watch/pass)
  Chip — status (estimated/committed/paid)
  Chip — tag
  Toggle (on/off, disabled)
  Avatar (default at 4 sizes, role variants)
```

This isn't user-facing UI. It's a working playground. Don't over-design it. Function over form.

## Files you'll touch

Probably:
- `apps/web/lib/brand-tokens.ts` (add missing tokens if any)
- `apps/web/app/globals.css` (sync HSL variables if tokens added)
- `apps/web/tailwind.config.ts` (expose new tokens if any)
- `apps/web/components/ui/sidebar.tsx` (NEW)
- `apps/web/components/ui/glance-tile.tsx` (NEW)
- `apps/web/components/ui/chip.tsx` (NEW)
- `apps/web/components/ui/toggle.tsx` (NEW)
- `apps/web/components/ui/avatar.tsx` (NEW)
- `apps/web/app/dev/design-system/page.tsx` (NEW)

Probably 6-9 files. PR should be ~600-900 lines total.

## What this milestone does NOT do

To be explicit about what's deferred:

- ❌ This does NOT replace the current top-bar nav (that's M1.3)
- ❌ This does NOT change any user-facing routes
- ❌ This does NOT touch any database schema
- ❌ This does NOT change pricing, Stripe, Clerk, or AI logic
- ❌ This does NOT add the dashboard route (M4.1)
- ❌ This does NOT replace the verdict page (M3.3)

The Sidebar component is built but not yet wired into the app layout. M1.3 will wire it.

## Smoke test plan (run before merge)

Before you merge the PR, manually verify in your local dev environment or in the Vercel preview:

1. `pnpm dev` starts cleanly with no compile errors
2. Navigate to `/dev/design-system` while signed in. All components render.
3. Resize browser to 380px width. Sidebar collapses or shows reasonable mobile behavior.
4. Click each Toggle on the page. It toggles smoothly.
5. Sign out and visit `/dev/design-system`. Returns 404.
6. Visit `/` and `/app/properties` (existing routes). They still work and look the same as before.

If any of these fail, fix before merging. If a fix is non-trivial, document the issue in the PR description and merge anyway (per the autonomous merge policy in PROMPT_00).

Include this smoke test plan in your PR description so it's easy to re-run later if a regression is suspected.

## Done definition

- All 5 components exist at the specified paths
- TypeScript compiles cleanly (`pnpm typecheck` passes)
- Lint passes (`pnpm lint` passes)
- No regressions in existing tests
- `/dev/design-system` renders all primitives correctly
- PR opened, CI green (or 3 fix attempts made), merged
- Production deploy confirmed
- PR description includes the smoke test plan and rollback command

---

When you're done and the PR is merged + deployed, reply here with the merge commit SHA and a brief summary of what shipped. Then I'll send PROMPT_02 (M1.2 — onboarding schema migration).

Ready to start. Go.
