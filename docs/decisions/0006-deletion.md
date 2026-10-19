# 0006: Deletion

**Date:** 2026-10-20
**Status:** Accepted

## Context
Users need a reversible way to put things away and a real way to remove them. Soft deletion everywhere would keep sensitive data indefinitely and complicate every query.

## Decision
- **Archive** is a reversible status on the entity. Archived records are hidden by default and can be restored.
- **Delete** is a hard delete, always behind a clear confirmation. No `deleted_at` soft deletion.
- **Deleting a goal** deletes its milestones and moves its tasks (direct and via milestones) to the inbox (`SET NULL` on the parent column). Tasks are never deleted implicitly.
- **Deleting a milestone** moves its tasks to the inbox.
- **Deleting the account** cascades every user-owned row from `users`, revokes sessions and push subscriptions, and is one transaction.
- Hard deletes also remove the entity's audit events in the same transaction (see [0005](0005-history-and-audit-log.md)).

## Alternatives considered
- **Soft delete everywhere:** easy undo, but data lingers and every query needs a filter.
- **Deleting a goal deletes its tasks:** loses work the user may still want.
- **A trash bin with delayed purge:** possible later if users ask for undo.

## Consequences
- Every user-owned table uses `on delete cascade` from `users`.
- Delete flows need confirmation UI and tests (including "no row references the user after account deletion").
- Backups still hold deleted data until they expire; the privacy notes must say so.
