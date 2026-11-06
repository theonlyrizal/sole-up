# 0006: Deletion

**Date:** 2026-10-20
**Status:** Accepted

## Context
Users need a reversible way to put things away and a way to remove individual items. Account closure has its own recovery window and retention policy.

## Decision
- **Archive** is a reversible status on the entity. Archived records are hidden by default and can be restored.
- **Deleting an item** is a hard delete behind a clear confirmation.
- **Deleting a goal** deletes its milestones and moves its tasks (direct and via milestones) to the inbox (`SET NULL` on the parent column). Tasks are never deleted implicitly.
- **Deleting a milestone** moves its tasks to the inbox.
- **Closing an account** creates an `account_closures` row and revokes sessions in one transaction. The account and its foreign-key rows remain. App access, export, and push delivery are suspended.
- A user can verify a linked provider and reactivate within 30 elapsed days. The database enforces the deadline. The reminder sweep moves expired closure requests into `cemetery` and revokes recovery sessions. Closed accounts remain unavailable.
- Hard deletes also remove the entity's audit events in the same transaction (see [0005](0005-history-and-audit-log.md)).

## Alternatives considered
- **Soft delete everywhere:** easy undo, but data lingers and every query needs a filter.
- **Deleting a goal deletes its tasks:** loses work the user may still want.
- **A trash bin with delayed purge:** possible later if users ask for undo.

## Consequences
- Domain tables retain their existing foreign keys. The closure and cemetery markers restrict deletion of the referenced user.
- The account lifecycle test checks reactivation, deadline enforcement, delivery suspension, and data retention.
- Privacy notes must distinguish retained closed accounts from hard-deleted items in backups.
