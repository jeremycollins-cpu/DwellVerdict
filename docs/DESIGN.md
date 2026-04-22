# DwellVerdict Design System

Locked during Phase 1 Sprint 1 Phase A / B (2026-04-22). Update this
document whenever a token or primitive changes. See `globals.css` for
CSS variable definitions and `tailwind.config.ts` for the utility
bindings.

---

## Typography

Three fonts, three distinct jobs. Never overlap roles.

- **Serif (brand only)** — Instrument Serif 400. Used exclusively by
  `<Wordmark />` in `apps/web/components/wordmark.tsx`. One weight,
  one style. Never in body copy, never in interface, never in data.
- **Sans (interface, headlines, body)** — Geist 400/500/600/700.
  Default via `font-sans` on `<body>`. All UI copy, all headlines, all
  button labels, all form fields.
- **Mono (data, addresses, numbers)** — Geist Mono 400/500. Applied
  via `font-mono` utility. Addresses, comp figures, verdict data,
  report numerals, step numbers ("01", "02", "03"), tiny eyebrow
  labels.

All three loaded via `next/font/google` in `apps/web/app/layout.tsx`.
Next self-hosts the `.woff2`, strips unused weights, and eliminates
the FOUT chain.

CSS variables available on `<html>`:
- `--font-instrument-serif`
- `--font-geist-sans`
- `--font-geist-mono`

**Why Geist + Instrument Serif (not Inter, not Fraunces):** Inter is
SaaS default-mode — the `frontend-design` skill flagged it as
overused. Fraunces has become the 2024-26 AI-startup serif —
we want the serif to read "considered" not "on trend." Instrument
Serif is less-used, high-contrast humanist character pairs cleanly
with Geist's geometric sans, and gives the brand a mark that
reads as authored rather than picked-from-Google-Fonts.

## Brand wordmark — Approach A, Integrated Wordmark

**Component:** `apps/web/components/wordmark.tsx` · `<Wordmark fontSize={18} />`

"DwellVerdict" in Instrument Serif 400 title case, +0.005em tracking,
ink color. A small terracotta roof-peak (SVG chevron) is positioned
above the V in "Verdict" using em-based sizing so the detail scales
with font size automatically.

**Usage:**
- Public landing top bar — 18px
- Public landing footer — 14px
- Authed dashboard top bar — 18px
- Anywhere else the brand identifies itself (pages, emails, exports)

**Never:**
- Replace the terracotta peak color with anything else
- Set the peak at a fixed pixel size (breaks em-based scaling)
- Use the Wordmark component below 12px or above 96px without a
  design review
- Render "dwellverdict" or "DWELLVERDICT" in plain text as a logo
  substitute

**Favicon / OG image / app icon:** deferred to a later pass. Current
production ships with the default Vercel favicon. When we revisit,
the mark will be derived from the Wordmark's V-with-peak detail as
the atomic visual asset.

---

## Deal Signals

Status-bar style — **subtle colored indicators, not consumer-badge
loud.** The signals are semantic, not decorative. A verdict is either
communicated via a small colored dot + typographic label, or through
a thin accent stripe on a verdict panel. Full-bleed backgrounds in
signal colors are forbidden: they read as alarms, not signals.

| Token | Purpose | Light (hex) | Light (HSL) | Dark (hex) | Dark (HSL) |
|---|---|---|---|---|---|
| `--signal-buy` | Strong investment thesis; CarFax green | `#10b981` | `160 84% 39%` | `#34d399` | `158 64% 52%` |
| `--signal-watch` | Mixed / deserves human review | `#f59e0b` | `38 92% 50%` | `#fbbf24` | `43 96% 56%` |
| `--signal-pass` | Caution; don't touch without mitigation | `#dc2626` | `0 72% 51%` | `#ef4444` | `0 84% 60%` |

**Tailwind usage:**
- `text-signal-buy` / `text-signal-watch` / `text-signal-pass`
- `bg-signal-buy` / etc. — **only for 1.5–2px dots or 1px borders**
- `border-signal-buy` / etc.

**Never**: `bg-signal-pass p-6` (full red panel), `bg-signal-buy text-white` (loud button), or any combination that makes the signal color the dominant visual weight.

---

## Verdict Surface

The property report verdict panel uses restrained neutrals so the
signal dot does all the color work.

| Token | Light | Dark |
|---|---|---|
| `--verdict-background` | `#fafafa` (near-white) | `#141414` (near-black) |
| `--verdict-border` | `#e3e3e3` (subtle gray) | `#2e2e2e` (subtle dark) |

**Tailwind usage:** `bg-verdict border border-verdict-border`.

The verdict panel's typography should be `font-mono` for any numeric
figures (price, revenue, cap rate) and `font-sans` for narrative copy.

---

## Motion

**CSS-only for Phase 1.** No Motion / Framer / GSAP / Reanimated.

- Interactive state transitions: `transition-colors duration-150`
- Hover: opacity shifts, border-color shifts. No transforms.
- **Forbidden for Phase 1:** bouncy springs, entrance animations,
  scroll-triggered reveals, decorative motion.
- **Allowed:** fade-in on route change (Next default), focus ring
  animations, dropdown reveal (Radix handles these with CSS).

Dependency budget: adding a motion library requires an ADR in
`DECISIONS.md`.

---

## Dark Mode

Tokens are defined **now** under `.dark` in `globals.css`. No UI
toggle ships in Phase 1 / Sprint 1. When we ship dark mode:

1. Add a toggle in the top bar next to `<UserButton />`.
2. Use `next-themes` (ships with shadcn docs) — minimal surface area.
3. Default to system preference.
4. Persist choice in localStorage.

Cost to defer: zero — tokens are already there, just unused.

---

## Component Primitives (shadcn/ui)

Installed in `apps/web/components/ui/` as of Phase 1 Sprint 1:

| Component | File | Primary use |
|---|---|---|
| Button | `button.tsx` | Already shipped M1 |
| Card | `card.tsx` | Property report panels, dashboard empty states |
| Input | `input.tsx` | Address input, form fields |
| Label | `label.tsx` | Form field labels |
| Badge | `badge.tsx` | Stage indicators (finding / evaluating / etc.), signal labels |
| Separator | `separator.tsx` | Section dividers in reports |
| Dialog | `dialog.tsx` | Confirmations, detail modals |
| DropdownMenu | `dropdown-menu.tsx` | Table row actions, filters |
| Command | `command.tsx` | ⌘K address search (Sprint 2+) |

**Rule:** consume these primitives; compose them into feature
components. Don't modify `components/ui/*` files directly unless
you're changing the design system globally.

---

## Authoring Rules (non-negotiable)

1. **Never hardcode hex values in components.** Use tokens (`bg-signal-buy`, `text-verdict-foreground`). If a new color is genuinely needed, add it to `globals.css` + `tailwind.config.ts` in the same PR.

2. **Never add new signal colors.** If a new state emerges, map it to buy / watch / pass or surface it for design review. Three signals cover every verdict we've scoped for Phase 1-3.

3. **Never install a new font.** Geist sans + mono cover every typographic need for Phase 1-3. Additions require a `DECISIONS.md` entry explaining why.

4. **Never override shadcn primitives inline.** If a `Card` needs a different border, update the token or the `card.tsx` primitive. Drive-by className overrides on primitives are a design-system smell.

5. **Never mix icon libraries.** `lucide-react` is installed. Stick to it.

6. **Component requests go through `components/ui/`.** Feature-level composition (e.g., `PropertyVerdictCard`) lives in `components/` at the app root, not inside `components/ui/`.

7. **`font-mono` earns its place on data.** Numbers, addresses, API IDs, verdict figures. Body copy stays `font-sans`.
