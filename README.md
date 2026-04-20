# DwellVerdict

Property-specific lifecycle app for real estate investors. Paste an address, get a CarFax-style report, then follow the property through evaluation, buying, renovating, and managing — all in one app, with Scout (the AI assistant) drafting work for you to approve.

- **DwellVerdict** — the product, company, and subscription brand.
- **Scout** — the AI assistant that lives inside the product.

The canonical product rules live in [`docs/CLAUDE.md`](docs/CLAUDE.md). Read that file first.

## Repo layout

```
apps/
  web/          Next.js 15 App Router — user-facing app
  modeling/     FastAPI service — forecast engine + AI retrieval
packages/
  db/           Drizzle schema + migrations (source of truth)
  types/        Shared TypeScript types
  ui/           Shared React components
  ai/           Scout prompts and task registry
infra/          Deployment config (Fly.io, Neon notes)
docs/           CLAUDE.md, ADRs, runbooks
prompts/        Versioned AI prompts (markdown)
```

Two deployable services (`web` on Vercel, `modeling` on Fly.io). Everything else is a shared package.

## Prerequisites

- Node.js `>=20.11.0` (run `nvm use` — `.nvmrc` pins to 20)
- pnpm `9.12.0` (pinned via `packageManager`; run `corepack enable` then `corepack prepare pnpm@9.12.0 --activate`)
- Python `3.12`
- [uv](https://docs.astral.sh/uv/) for Python env/dependency management (`curl -LsSf https://astral.sh/uv/install.sh | sh`)

## First-time setup

```bash
# JS workspaces
corepack enable
pnpm install

# Python modeling service
cd apps/modeling
uv sync
cd ../..
```

## Day-to-day

| Command | What it does |
|---|---|
| `pnpm dev` | Run every workspace's `dev` task via Turborepo (Next.js dev server) |
| `pnpm build` | Build every workspace |
| `pnpm lint` | Lint every workspace |
| `pnpm typecheck` | Typecheck every TS workspace |
| `pnpm test` | Run all tests |
| `pnpm --filter web dev` | Run only the web app |
| `cd apps/modeling && uv run uvicorn dwellverdict_modeling.main:app --reload` | Run the FastAPI service locally on `:8000` |
| `cd apps/modeling && uv run pytest` | Run modeling tests |

## Environment variables

Each service has a `.env.example` at its root. Copy to `.env.local` (web) or `.env` (modeling) and fill in. **Never commit `.env*` files.** Production secrets live in Vercel (web) and Fly.io secrets (modeling).

## What ships in Phase 0

Skeleton only — auth, navigation, deployed services. No property reports, no scraping, no Scout integration yet. See `docs/DECISIONS.md` (added in M6) for locked architectural choices.
