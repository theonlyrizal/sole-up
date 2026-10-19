# 0003: Hosting and jobs

**Date:** 2026-10-20
**Status:** Accepted

## Context
Reminders and periodic reviews need reliable background execution that does not depend on an open browser tab. Serverless hosting makes long-lived workers and scheduling awkward. The app is small, so operational simplicity matters more than scale.

## Decision
- **Host:** one Node host running two processes from the same codebase: the Next.js web app and a job worker.
- **Jobs:** pg-boss, using the same PostgreSQL as its queue. Job handlers are idempotent and retried within limits.
- **Database:** managed PostgreSQL (15 or later) with automated backups.
- **Encryption:** the database provider's at-rest encryption for v1, documented in the privacy notes.

## Alternatives considered
- **Serverless (e.g. Vercel) + external cron/queue:** more vendors and cold-start limits for the worker.
- **Redis-backed queue (BullMQ):** an extra stateful service for no benefit at this scale.
- **Managed scheduler only:** fine for periodic jobs, weak for per-reminder scheduling.
- **Application-level field encryption:** deferred; it complicates search and queries and needs key management.

## Consequences
- One provider bill and one database to back up and restore.
- Queue load shares the database; revisit if job volume grows.
- The worker arrives in Phase 5; until then the host runs only the web app.
