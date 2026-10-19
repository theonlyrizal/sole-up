# 0001: Stack

**Date:** 2026-10-20
**Status:** Accepted

## Context
SoleUp is a greenfield, domain-heavy app with many related entities and historical queries. The first user is the developer (dogfooding), but security must be public-grade. One developer builds it, so the stack should keep UI, server logic and persistence in one codebase with strong typing end to end.

## Decision
- **Framework:** Next.js App Router, with Server Actions as the application layer. No separate API service in v1.
- **Language:** TypeScript in strict mode.
- **Database:** PostgreSQL 15 or later (needed for `ON DELETE SET NULL (column)`).
- **Data access:** Drizzle ORM and drizzle-kit migrations. Generated migrations are committed; hand-edited SQL is allowed for constraints Drizzle cannot express.
- **Validation:** Zod at every system boundary, shared by forms and Server Actions.
- **Defaults adopted with this ADR:**
  - UI: Tailwind CSS with accessible Radix-based components (shadcn/ui style).
  - Tooling: pnpm, ESLint + Prettier, Vitest (unit, and integration against a real Postgres), Playwright (end to end).
  - Logging: pino with field redaction and request IDs.

## Alternatives considered
- **React SPA + separate Node/Express API:** more moving parts and duplicated types for no current benefit.
- **Prisma:** mature, but Drizzle stays closer to SQL, which matters for composite foreign keys, CHECK constraints and analytical queries.
- **Plain JavaScript:** rejected; the domain rules benefit from strict types.

## Consequences
- Server-only code must stay out of client bundles (`server-only` imports, env split).
- Some constraints (composite `SET NULL (col)`, CHECKs) live in hand-edited migrations and need tests.
- Moving to a separate API later is possible because domain logic lives in `src/server/modules/*/service.ts`, not in route files.
