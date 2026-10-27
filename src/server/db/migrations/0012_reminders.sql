CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"task_id" uuid,
	"event_id" uuid,
	"target_at" timestamp with time zone NOT NULL,
	"occurrence_start" timestamp with time zone,
	"fire_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"skip_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"snoozed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_kind_check" CHECK ("reminders"."kind" in ('task_deadline', 'event', 'daily_nudge')),
	CONSTRAINT "reminders_link_check" CHECK (case "reminders"."kind"
        when 'task_deadline' then "reminders"."task_id" is not null and "reminders"."event_id" is null
          and "reminders"."occurrence_start" is null
        when 'event' then "reminders"."event_id" is not null and "reminders"."task_id" is null
        else "reminders"."task_id" is null and "reminders"."event_id" is null
          and "reminders"."occurrence_start" is null
        end),
	CONSTRAINT "reminders_status_check" CHECK ("reminders"."status" in ('scheduled', 'sending', 'sent', 'skipped', 'failed')),
	CONSTRAINT "reminders_skip_reason_check" CHECK (case when "reminders"."status" = 'skipped'
        then "reminders"."skip_reason" is not null and "reminders"."skip_reason" in ('stale', 'disabled', 'no_device')
        else "reminders"."skip_reason" is null
        end),
	CONSTRAINT "reminders_sent_at_check" CHECK (("reminders"."status" = 'sent') = ("reminders"."sent_at" is not null)),
	CONSTRAINT "reminders_fire_at_check" CHECK ("reminders"."fire_at" <= "reminders"."target_at"),
	CONSTRAINT "reminders_attempts_check" CHECK ("reminders"."attempts" >= 0),
	CONSTRAINT "reminders_last_error_code_check" CHECK ("reminders"."last_error_code" is null or char_length("reminders"."last_error_code") between 1 and 64)
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "reminder_offset_minutes" integer;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "daily_nudge_time" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "reminder_offset_minutes" integer;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_task_id_user_id_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_event_id_user_id_fk" FOREIGN KEY ("event_id","user_id") REFERENCES "public"."calendar_events"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_one_scheduled_key" ON "reminders" USING btree (coalesce("task_id", "event_id", "user_id")) WHERE "reminders"."status" = 'scheduled' and not "reminders"."snoozed";--> statement-breakpoint
CREATE INDEX "reminders_status_fire_at_idx" ON "reminders" USING btree ("status","fire_at");--> statement-breakpoint
CREATE INDEX "reminders_task_id_idx" ON "reminders" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "reminders_event_id_idx" ON "reminders" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "reminders_user_id_idx" ON "reminders" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_reminder_offset_minutes_check" CHECK ("calendar_events"."reminder_offset_minutes" is null or "calendar_events"."reminder_offset_minutes" in (0, 10, 30, 60, 1440));--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_daily_nudge_time_check" CHECK ("user_preferences"."daily_nudge_time" is null or "user_preferences"."daily_nudge_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reminder_offset_minutes_check" CHECK ("tasks"."reminder_offset_minutes" is null or "tasks"."reminder_offset_minutes" in (0, 10, 30, 60, 1440));