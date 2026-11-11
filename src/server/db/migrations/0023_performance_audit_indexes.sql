-- Evidence: docs/performance/10.7-before.json and 10.7-after.json.
-- Query 1ca0c97f09: range-bound entity history, 74.808 -> 47.345 ms.
-- The replacement retains the old index's complete equality prefix.
DROP INDEX "audit_events_user_id_entity_idx";--> statement-breakpoint
CREATE INDEX "audit_events_user_entity_time_idx" ON "audit_events" USING btree ("user_id","entity_type","entity_id","occurred_at","id");--> statement-breakpoint
-- Query 4a2e4e71f8: planned-date range lookup, 1.361 -> 0.105 ms.
CREATE INDEX "audit_events_task_planned_date_idx" ON "audit_events" USING btree ("user_id",("changes" -> 'plannedDate' ->> 'to'),"entity_id") WHERE "audit_events"."entity_type" = 'task' and "audit_events"."event_type" in ('task.created', 'task.planned');
