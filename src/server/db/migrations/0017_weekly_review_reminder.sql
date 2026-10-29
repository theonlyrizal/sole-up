ALTER TABLE "reminders" DROP CONSTRAINT "reminders_kind_check";--> statement-breakpoint
DROP INDEX "reminders_one_scheduled_key";--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "weekly_review_day" smallint;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "weekly_review_time" text;--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_one_scheduled_key" ON "reminders" USING btree (coalesce("task_id", "event_id", "user_id"),"kind") WHERE "reminders"."status" = 'scheduled' and not "reminders"."snoozed";--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_weekly_review_check" CHECK (("user_preferences"."weekly_review_day" is null and "user_preferences"."weekly_review_time" is null)
        or ("user_preferences"."weekly_review_day" is not null
          and "user_preferences"."weekly_review_time" is not null
          and "user_preferences"."weekly_review_day" between 0 and 6
          and "user_preferences"."weekly_review_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'));--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_kind_check" CHECK ("reminders"."kind" in ('task_deadline', 'event', 'daily_nudge', 'weekly_review'));