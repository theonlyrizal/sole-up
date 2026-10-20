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
- [Deploying](docs/DEPLOY.md): production on Render and Neon, environment, OAuth callbacks, deploy, rollback, backup and restore
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

3. Create your env file. The defaults in `.env.example` match the local Postgres. Set `BETTER_AUTH_SECRET` to a random value of at least 32 characters (the second command prints one). OAuth credentials are optional; without them the sign-in page says no provider is configured (see [Authentication](#authentication)).

   ```bash
   cp .env.example .env.local
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

4. Run the app and open http://localhost:3000:

   ```bash
   pnpm dev
   ```

The server validates its environment at startup (`src/server/env.ts`). If a variable is missing or malformed, it prints which ones and exits instead of starting. Server-only variables stay in `src/server/env.ts`; browser-visible `NEXT_PUBLIC_*` variables go in `src/lib/client-env.ts`.

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`. The build does not need env variables: during `next build` only, missing required values get inert placeholders, and the real environment is validated when the server starts. `pnpm format` fixes formatting.

## Authentication

Sign-in uses [Better Auth](https://www.better-auth.com) (`src/server/auth/`) with Google and GitHub OAuth and database sessions; see [ADR 0002](docs/decisions/0002-auth.md). Its tables (`users`, `sessions`, `accounts`, `verifications`) are in `src/server/db/schema/auth.ts`, with UUID IDs.

- **In code:** call `requireUser()` from `@/server/auth/session` first in every authenticated page and route handler. It returns the user or redirects to `/sign-in`. The `(app)` layout also checks the session, but a layout is not an authorization boundary.
- **Server Actions:** wrap each one in `authedAction(schema, handler)` from `@/server/auth/authed-action`. It authenticates (an anonymous call gets an `UNAUTHENTICATED` result and the handler never runs), validates the input with the Zod schema (failures return `fieldErrors`), runs `handler(input, { userId })`, and returns an `ActionResult` (`@/lib/result`). Services throw `NotFoundError`, `ValidationError` or `ConflictError` (`@/server/errors`) with fixed, user-safe messages; anything else is logged (see [Logging and errors](#logging-and-errors)) and becomes a generic `INTERNAL` error whose message ends with `Reference: <request ID>`.
- **Proxy:** `src/proxy.ts` gives every request an ID (see below) and redirects requests without a session cookie away from `(app)` routes. It checks only that the cookie exists, so it is a convenience, not a security check. Add each new top-level `(app)` folder to `APP_ROUTE_SEGMENTS` in `src/lib/protected-paths.ts`; a unit test fails until you do.
- **Account linking:** signing in with a second provider joins the existing account only when that provider reports the same email as verified, and the existing account's email is verified too. Otherwise the sign-in page explains what happened.
- **Rate limiting:** Better Auth's limiter (in memory) runs on every request through `/api/auth/*`: 100 requests a minute per IP and path, and 10 a minute for sign-in and OAuth callbacks. Sign-in and sign-out go through the Better Auth client for this reason; server-side `auth.api.*` calls are not limited.
- **Providers** are enabled only when both their ID and secret are set. Setting only one of the pair stops the server at boot with a clear message.

### Creating the OAuth apps

Create one app per provider for each environment and put the local credentials in `.env.local`. Production apps and their callback URLs are in [DEPLOY.md](docs/DEPLOY.md#oauth-production-callback-urls). Never commit them. The callback URL is always `<BETTER_AUTH_URL>/api/auth/callback/<provider>`.

| Provider | Local callback URL |
|---|---|
| Google | `http://localhost:3000/api/auth/callback/google` |
| GitHub | `http://localhost:3000/api/auth/callback/github` |

**Google** ([Google Cloud console](https://console.cloud.google.com)):

1. Create a project (for example `soleup-dev`) and select it.
2. Open **Google Auth Platform** (APIs & Services > OAuth consent screen) and click **Get started**. Enter the app name `SoleUp` and your support email, choose **External** as the audience, add your contact email, and accept the policy.
3. Under **Audience**, keep the publishing status **Testing** and add your own Google account as a **test user**. Only test users can sign in while testing.
4. Under **Data Access**, add nothing. Better Auth asks only for `openid`, `email` and `profile`.
5. Under **Clients**, click **Create client**, choose **Web application**, and name it `SoleUp local`.
   - **Authorized JavaScript origins:** `http://localhost:3000`
   - **Authorized redirect URIs:** `http://localhost:3000/api/auth/callback/google`
6. Click **Create**, then copy the client ID and client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Copy the secret right away: the console may not show it again.

**GitHub** ([Developer settings > OAuth Apps](https://github.com/settings/developers)):

1. Click **New OAuth app**.
   - **Application name:** `SoleUp (local)`
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`
   - Leave **Enable Device Flow** unchecked.
2. Click **Register application**, copy the **Client ID** into `GITHUB_CLIENT_ID`, then click **Generate a new client secret** and copy it into `GITHUB_CLIENT_SECRET`.

GitHub links to an existing SoleUp account only when your GitHub primary email is verified and matches that account's email.

Restart `pnpm dev` after editing `.env.local`.

## UI shell and components

- **Shell:** `src/app/(app)/layout.tsx` owns the page's `<main id="main">`, a "Skip to content" link, and the navigation (`src/components/shell/`): a sidebar from the `md` breakpoint up, a bottom bar on phones. Pages under `(app)` render their content without their own `<main>`. Add a destination to `NAV_ITEMS` only when its page exists.
- **Primitives** in `src/components/ui/`: `Button` (and `buttonClass` for links), `Input`, `Textarea`, `Select` (styled native select), `FormField` (label, hint and errors wired with `aria-describedby`), `Dialog`, `ConfirmDialog` (for destructive actions; stays open until the action settles and shows a failed `ActionResult`'s message), `toast()` with the `<Toaster />` in the (app) layout, `EmptyState`, `ErrorState`, `Skeleton` and `LoadingState`. Dialogs and toasts are built on Radix (`radix-ui`).
- **Root states:** `src/app/error.tsx` (fixed text, never the error's message, plus `ErrorReference` with the error's digest), `not-found.tsx` and `loading.tsx`.
- **Web app manifest:** `src/app/manifest.ts`. Icons are generated from the SVG artwork in `scripts/generate-icons.mts` (run `node scripts/generate-icons.mts` after changing it). Installing as an app also needs the service worker, which comes in Phase 5.

## Logging and errors

- **Logger:** pino (`src/server/logging/logger.ts`), JSON lines on stdout. Inside a request use `await getRequestLogger()` (or `loggerFor(requestId)`) from `@/server/logging/request`, so each line carries `requestId`. Messages are fixed text; put details in fields.
- **Redaction:** every finished line is passed through `redactDeep()` (`src/server/logging/redact.ts`): any key in `REDACTED_KEYS` (auth headers, cookies, `body`, `content`, `note`, `reason`, …) or ending in `token`/`secret` is replaced with `[Redacted]` at any depth, child bindings included. Errors are reduced to their class, Postgres code/constraint/table, stack frames and causes; their messages are never logged. Add a key there before logging a new kind of sensitive field. `src/server/logging/logger.test.ts` asserts redacted values never appear in the output.
- **Request IDs:** the proxy gives every page, Server Action and API request a fresh UUID in `x-request-id` (on the request and the response). A client-sent ID is always replaced.
- **What the user sees:** an unexpected Server Action error shows the generic message plus `Reference: <request ID>`, the same ID as its log line. A rendering error shows the route's `error.tsx` with `Reference: <digest>`: Next.js sends only the error's digest to the browser, so `onRequestError` (`src/instrumentation.ts`) logs the digest next to the request ID.
- **Health:** `GET /api/health` answers `200 {"status":"ok","database":"ok"}`, or `503` with `"unavailable"` when the database doesn't answer `select 1` within 2 seconds. It is public, never cached, and reports no details.
- **Test-only pages:** `/test-errors/action` and `/test-errors/render` fail on purpose for `tests/e2e/errors.spec.ts`. Like the test sign-in route, they exist only when `NODE_ENV=test` and `SOLEUP_TEST_SIGN_IN=1`.

## Feature modules

Life areas (`src/server/modules/life-areas/`, chunk 0.11) are the reference slice. Copy their shape for each new entity:

- **Schema** (`src/server/db/schema/life-areas.ts`): `user_id` cascading from `users`, `unique (id, user_id)` for composite child foreign keys, CHECK constraints for enums and lengths, and a partial unique index for "unique among active" rules. Shared constants (statuses, limits) live in a pure `src/lib/<entity>.ts`, which the schema imports with a relative path (drizzle-kit has no `@/` alias).
- **`validation.ts`**: `z.strictObject` inputs with user-facing messages; blank optional text becomes `null`.
- **`service.ts`**: every function takes `userId` and filters by it together with the record ID; a missing record and someone else's record are the same `NotFoundError`. Each mutation runs in one transaction with its audit event. Map unique violations with `isUniqueViolation(error, constraint)` (`src/server/db/errors.ts`) to a `ValidationError` (a field) or `ConflictError`, never the raw error.
- **`queries.ts`**: read models for pages. **`actions.ts`**: `authedAction(schema, …)` → service → `refresh()`.
- **UI**: the server page reads inside `<Suspense fallback={<LoadingState />}>`, a route `error.tsx` shows `ErrorState`, and a client component handles empty, pending, error and success states, with destructive actions behind `ConfirmDialog`.
- **Tests**: an integration file covering domain rules, validation through the actions, a cross-user test, and that audit events hold no user content; an e2e journey with an axe check (`tests/e2e/helpers.ts`).

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

**Audit log**

Every service mutation records a content-free audit event in the same transaction ([ADR 0005](docs/decisions/0005-history-and-audit-log.md)):

- Add the event type to `AUDIT_EVENTS` in `src/server/audit/types.ts`, named `<entity_type>.<verb>`, with its entity type and a `z.strictObject()` schema for `changes` (use `auditChange(...)` for `{ from, to }` pairs). Only structured fields: status, dates as ISO strings, parent IDs, priority, ordering. Never titles, descriptions, notes or reasons. Loose objects, records, `unknown` and `Date` are rejected when the module loads.
- Call `recordAudit(tx, { type, userId, entityId, changes })` from `src/server/audit/record.ts` inside the transaction that makes the change. It only accepts a transaction handle; an unknown type or an extra key throws `InvalidAuditEventError`, which rolls the change back.
- A hard delete calls `deleteAuditEventsForEntity(tx, { userId, entityType, entityId })` in the same transaction: `audit_events.entity_id` has no foreign key. Account deletion cascades through `user_id`.

**Dates and time zones**

- Use the helpers in `src/lib/dates.ts` ([ADR 0008](docs/decisions/0008-dates-and-time-zones.md)): `todayFor(tz)`, `localDateOf`, `localDateTimeOf`, `instantFromLocal`, `startOfLocalDay`, `localDayRange`, `addDays`, `startOfWeek`. Never use the server clock's date or UTC's date as "today".
- Local dates are `YYYY-MM-DD` strings (Postgres `date`, string mode); instants are `Date` (`timestamptz`); zones are IANA names. Only `src/lib/dates.ts` imports `temporal-polyfill`.
- The user's zone, locale and week start come from `getUserPreferences(userId)` (`src/server/modules/preferences/service.ts`). `timezone` is `null` until the user confirms it; the (app) layout shows the confirmation form until then.

## Testing

| Command | Runs |
|---|---|
| `pnpm test:unit` | Vitest `unit` project: `src/**/*.test.ts`, pure code, no database |
| `pnpm test:integration` | Vitest `integration` project: `*.integration.test.ts` in `src/` or `tests/integration/`, against the real test database |
| `pnpm test:e2e` | Playwright tests in `tests/e2e/`. Starts its own server on port 3100 in test mode against the test database (`pnpm dev`, or a build plus `pnpm start` when `CI` is set). It uses the build folder `.next-e2e/`, so it can run next to `pnpm dev`, and reuses a server already on port 3100 locally |
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

Test users and sessions:

- **Integration tests:** `createTestUser()` and `asUser(userId)` from `tests/integration/helpers/users.ts`. `asUser` creates a real database session and returns `{ userId, headers }`: pass `userId` to services and `headers` to code that reads the session.
- **End-to-end tests:** `POST /api/test/sign-in` with `{ email?, name? }` signs the browser in without OAuth (see `tests/e2e/auth.spec.ts`). It works only when `NODE_ENV=test` and `SOLEUP_TEST_SIGN_IN=1` are both set, which the Playwright config does. In any other mode it answers 404. Never set `SOLEUP_TEST_SIGN_IN` anywhere else.

`server-only` is replaced by a no-op in Vitest, so server modules can be tested directly. A module that parses the environment on import (like `src/server/env.ts`) needs the variables stubbed before it is imported; see `src/server/env.test.ts`.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`, in two jobs:

- **Lint, test and build**, in this order: install (`--frozen-lockfile`), lint, format check, typecheck, unit tests, migrate from zero (`pnpm db:migrate` against an empty Postgres 18.3 service container), integration tests, build, then the e2e tests (Playwright builds and starts the app itself with `CI` set). The Playwright report is uploaded when the job fails.
- **Migration drift**: runs `pnpm db:generate` and fails if it changes anything in `src/server/db/migrations`, meaning a schema change was committed without its migration.

The pnpm store is cached by `actions/setup-node`. Actions are pinned to commit SHAs (the version is in a comment next to each).

To reproduce CI locally, run the same commands in that order with `CI=true` and `TEST_DATABASE_URL` pointing at an empty local `_test` database, then `pnpm db:generate` and `git status`. With `CI` set, `pnpm test:e2e` builds into `.next-e2e/` with `NODE_ENV=test`, and port 3100 must be free (no server is reused).
