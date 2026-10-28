ALTER TABLE "user_preferences" ADD COLUMN "reminders_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "reminders_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "quiet_hours_start" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "quiet_hours_end" text;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "held_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_quiet_hours_check" CHECK (("user_preferences"."quiet_hours_start" is null and "user_preferences"."quiet_hours_end" is null)
        or ("user_preferences"."quiet_hours_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and "user_preferences"."quiet_hours_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and "user_preferences"."quiet_hours_start" <> "user_preferences"."quiet_hours_end"));