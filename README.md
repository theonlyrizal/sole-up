# SoleUp

A personal management app that helps you decide what matters, turn goals into realistic next steps, follow through, and review your progress. Core planning and tracking work without AI.

**Status:** foundation in progress. The Next.js scaffold exists; features follow the chunked plan.

**MVP at a glance:** life areas, goals and milestones, tasks with Today and Upcoming views, habits, notes, a weekly review, an internal calendar, and Web Push reminders. Built as a responsive, installable web app (PWA) with Next.js, TypeScript, PostgreSQL and Drizzle, signing in with Google or GitHub.

## Docs

- [Product spec](docs/PRODUCT_SPEC.md): principles, users, MVP scope, journeys
- [Architecture](docs/ARCHITECTURE.md): system boundaries and technical direction
- [Data model](docs/DATA_MODEL.md): entities, ownership, history and deletion rules
- [AI strategy](docs/AI_STRATEGY.md): AI boundaries, memory, safety
- [Roadmap](docs/ROADMAP.md): product phases
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md): chunk-by-chunk build order and progress log
- [Decisions (ADRs)](docs/decisions/README.md): settled architecture and product decisions
- [Agent prompts](docs/AGENT_PROMPTS.md): one session prompt per chunk

## Local setup

Requires Node 24 (see `.nvmrc`), pnpm 11 (`corepack enable` picks up the version in `package.json`), and Docker with Compose v2.

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start local Postgres (18, bound to `127.0.0.1:5432`). It creates two databases: `soleup_dev` for the app and `soleup_test` for integration tests.

   ```bash
   docker compose up -d --wait
   ```

   `--wait` returns once the healthcheck passes; `docker compose ps` should show the service as `healthy`. Data persists in the `soleup_postgres-data` volume. `docker compose down -v` deletes it, and the databases are recreated on the next start.

3. Create your env file. The defaults in `.env.example` match the local Postgres; the auth variables can stay empty until sign-in exists.

   ```bash
   cp .env.example .env.local
   ```

4. Run the app and open http://localhost:3000:

   ```bash
   pnpm dev
   ```

The server validates its environment at startup (`src/server/env.ts`). If a variable is missing or malformed, it prints which ones and exits instead of starting. Server-only variables stay in `src/server/env.ts`; browser-visible `NEXT_PUBLIC_*` variables go in `src/lib/client-env.ts`.

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`. The build does not need env variables; validation runs when the server starts. `pnpm format` fixes formatting.

## Database and migrations

The schema is defined with [Drizzle ORM](https://orm.drizzle.team) in `src/server/db/schema/` (one file per domain module, re-exported from `index.ts`). Server code uses the pooled, server-only handle from `src/server/db/client.ts`. TypeScript keys are camelCase; Drizzle maps them to snake_case columns.

| Command | Does |
|---|---|
| `pnpm db:generate` | Diffs the schema against the last snapshot and writes a new SQL migration to `src/server/db/migrations/` |
| `pnpm db:migrate` | Applies pending migrations. The journal lives in the `drizzle.__drizzle_migrations` table |
| `pnpm db:studio` | Opens Drizzle Studio to browse the database |
| `pnpm db:reset` | Drops every table in the database, then re-applies all migrations. Local only: refuses when `NODE_ENV=production` or when `DATABASE_URL` is not on `localhost` |

These commands read `DATABASE_URL` from `.env.local`; a value set in the shell wins. To target the test database:

```bash
DATABASE_URL=postgres://soleup:soleup@localhost:5432/soleup_test pnpm db:migrate
```

In PowerShell, set `$env:DATABASE_URL = "postgres://soleup:soleup@localhost:5432/soleup_test"` first, and `Remove-Item Env:DATABASE_URL` afterwards.

**Conventions**

- Change the schema in TypeScript, run `pnpm db:generate --name=<what-changed>`, and read the generated SQL before committing it.
- Commit every generated migration, together with `meta/` (the snapshots and `_journal.json`). Review migrations in the PR like any other code.
- Never edit a migration that has been merged. Fix forward with a new one.
- Hand-written SQL is allowed for what Drizzle can't express, such as `ON DELETE SET NULL (col)` on composite foreign keys, CHECK constraints it doesn't model, or data backfills. Create the file with `pnpm db:generate --custom --name=<what-it-does>` so it is registered in the journal, then cover the constraint with a test.
- Migrations must preserve user data. A destructive change needs explicit approval and a recovery plan.

## Testing

| Command | Runs |
|---|---|
| `pnpm test:unit` | Vitest `unit` project: `src/**/*.test.ts`, pure code, no database |
| `pnpm test:integration` | Vitest `integration` project: `*.integration.test.ts` in `src/` or `tests/integration/`, against the real test database |
| `pnpm test:e2e` | Playwright tests in `tests/e2e/`. Starts `pnpm dev` itself (or reuses a server already on port 3000); in CI (`CI` set) it builds and runs `pnpm start` |
| `pnpm verify` | `format:check`, `lint`, `typecheck`, `test:unit` and `test:integration`. Run it before every commit |

Before the first run:

- `docker compose up -d --wait`. Integration tests need Postgres.
- Set `TEST_DATABASE_URL` in `.env.local` (copy it from `.env.example`). It must be a local database whose name ends in `_test`; the tests refuse anything else, because they delete all data in it.
- `pnpm exec playwright install chromium`, once per machine, for the end-to-end tests.

How the integration project works:

- Before any file runs, it applies all pending migrations to the test database (same journal as `pnpm db:migrate`).
- Inside tests, the app's `db` client (`@/server/db/client`) points at the test database.
- Before each test, every table in the `public` schema is truncated (identities restart). Tests never depend on data from another test.
- Files run one at a time, because they share one database.

`server-only` is replaced by a no-op in Vitest, so server modules can be tested directly. A module that parses the environment on import (like `src/server/env.ts`) needs the variables stubbed before it is imported; see `src/server/env.test.ts`.
