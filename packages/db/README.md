# @dwellverdict/db

Drizzle schema and migration runner for the DwellVerdict Postgres (Neon) database.

## Scripts

- `pnpm db:generate` — emit SQL migrations from the TypeScript schema (wraps `drizzle-kit generate`).
- `pnpm db:migrate` — apply pending migrations to the database at `$DATABASE_URL`.

## Why `db:migrate` isn't `drizzle-kit migrate`

We use `@neondatabase/serverless` over HTTPS instead of the `postgres` driver
over TCP because serverless environments often block outbound 5432. The
canonical migration runner is `scripts/migrate.ts`, which calls
`drizzle-orm/neon-http/migrator` and records applied migrations in the standard
`drizzle.__drizzle_migrations` table — identical end state to `drizzle-kit
migrate`, but reachable from any environment that can make HTTPS requests.

## Connecting locally

Put both connection strings in `packages/db/.env.local` (gitignored):

```
DATABASE_URL=postgres://…-pooler…/neondb?…   # pooled; use for runtime queries
DATABASE_URL_UNPOOLED=postgres://…neondb?…   # direct; use for migrations + introspection
```

Schema changes should target the unpooled URL.
