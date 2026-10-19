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

## Setup

Requires Node 24 (see `.nvmrc`) and pnpm 11 (`corepack enable` picks up the version in `package.json`).

```bash
pnpm install
pnpm dev
```

Then open http://localhost:3000.

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`. `pnpm format` fixes formatting. Database and environment setup arrive in chunk 0.3.
