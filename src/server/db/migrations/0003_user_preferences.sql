CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"timezone" text,
	"locale" text DEFAULT 'en-US' NOT NULL,
	"week_start" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_week_start_check" CHECK ("user_preferences"."week_start" between 0 and 6),
	CONSTRAINT "user_preferences_timezone_length_check" CHECK ("user_preferences"."timezone" is null or char_length("user_preferences"."timezone") between 1 and 64),
	CONSTRAINT "user_preferences_locale_length_check" CHECK (char_length("user_preferences"."locale") between 2 and 35)
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;