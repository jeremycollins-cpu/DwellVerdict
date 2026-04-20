# Neon setup

Filled in during Milestone 2. This file will document:

- Project/branch structure (`main` = prod, `dev` = shared development branch, per-PR branches via Neon GitHub integration).
- Connection string templates for `apps/web` (Drizzle) and `apps/modeling` (asyncpg/SQLAlchemy).
- Migration workflow (`drizzle-kit generate` locally → review SQL → apply to `dev` → apply to `main` on release).
- Row-level scoping conventions (`org_id` enforced in application code per `docs/CLAUDE.md`).

Do not add the actual DATABASE_URL here — secrets belong in Vercel env vars (web) and Fly.io secrets (modeling).
