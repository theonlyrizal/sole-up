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
