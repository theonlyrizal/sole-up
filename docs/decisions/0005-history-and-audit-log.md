# 0005: History and audit log

**Date:** 2026-10-20
**Status:** Accepted

## Context
Reviews and analytics need to know what changed and when (completed, rescheduled, reparented). The spec also requires keeping private content out of event logs and supporting real deletion. Event sourcing was considered first.

## Decision
- **State tables are the source of truth.** The app reads current state from them.
- **A full audit log** records every meaningful change, written **in the same transaction** as the change.
- An audit event stores `user_id`, `event_type` (from an allowlist), `entity_type`, `entity_id`, `occurred_at`, and `changes`.
- `changes` is JSON with old and new values of **structured fields only**: status, dates, parent IDs, priority, ordering.
- **No user content in events:** never titles, descriptions, note bodies, reasons or reflections.
- When an entity is hard-deleted, its events are deleted in the same transaction (explicit, since there is no foreign key to cascade). Account deletion removes all of the user's events.

## Alternatives considered
- **Event sourcing (events as the source of truth):** events would have to carry content to rebuild state, which conflicts with the privacy rule, and hard deletion would mean rewriting the log.
- **Activity events only for selected actions:** gaps would make history unreliable for reviews.
- **Database triggers:** capture everything but cannot enforce the content allowlist or carry domain event types.

## Consequences
- Every service mutation writes an audit event; tests check it.
- History shows what changed structurally, not what text said.
- This replaces the earlier `ActivityEvent` concept in DATA_MODEL.md.
