# 0009: Production hosting providers

**Date:** 2026-10-20
**Status:** Accepted. The Phase 5 gate kept these free plans and settled reminders without a worker in [ADR 0013](0013-reminders-sweep-and-delivery.md).

## Context
[ADR 0003](0003-hosting-and-jobs.md) settled the shape of production: one Node host and managed PostgreSQL with backups. Chunk 0.14 needs actual providers. The app is dogfooded by its developer, and the requirement is free services that need no payment card.

## Decision
- **Web app:** Render, free web service, Singapore, defined in `render.yaml`. Deploys a commit on `main` only after CI passes. Migrations (`pnpm db:migrate:deploy`) run as the last build command, because the pre-deploy command is paid-only. The health check is `/api/health`.
- **Database:** Neon Free, Postgres 18 (or 17), AWS ap-southeast-1, direct connection with `sslmode=verify-full`.
- **Backups:** Neon's point-in-time restore (6-hour window on Free) plus a manual `pg_dump` to the developer's machine, weekly and before risky migrations.

Procedures are in [DEPLOY.md](../DEPLOY.md).

## Alternatives considered
- **Render Free Postgres:** deleted after 30 days, no backups.
- **Supabase Free:** no point-in-time recovery; pauses after a week of inactivity.
- **Koyeb, Fly.io:** now generally require a card.
- **Vercel Hobby:** free, but serverless conflicts with ADR 0003's single Node host and worker.

## Consequences
- The app sleeps after 15 idle minutes, and the first request then takes about a minute.
- Only 6 hours of point-in-time recovery. Older mistakes can be restored only from the latest manual dump.
- **No worker on this plan.** Render's background workers are paid, and a sleeping service can't fire reminders on time. Decision gate 5.0 must revisit hosting before Phase 5 ships reminders.
- Moving to paid plans needs only config changes: `plan` and `preDeployCommand` in `render.yaml`, and Neon's history window.
