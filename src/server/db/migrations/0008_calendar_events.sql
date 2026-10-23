CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid,
	"life_area_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"all_day" boolean NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"tz" text,
	"start_date" date,
	"end_date" date,
	"source" text DEFAULT 'internal' NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "calendar_events_shape_check" CHECK (case when "calendar_events"."all_day"
        then "calendar_events"."start_date" is not null and "calendar_events"."end_date" is not null
          and "calendar_events"."start_at" is null and "calendar_events"."end_at" is null and "calendar_events"."tz" is null
        else "calendar_events"."start_at" is not null and "calendar_events"."end_at" is not null and "calendar_events"."tz" is not null
          and "calendar_events"."start_date" is null and "calendar_events"."end_date" is null
        end),
	CONSTRAINT "calendar_events_end_check" CHECK (case when "calendar_events"."all_day"
        then "calendar_events"."end_date" > "calendar_events"."start_date"
        else "calendar_events"."end_at" > "calendar_events"."start_at"
        end),
	CONSTRAINT "calendar_events_source_check" CHECK ("calendar_events"."source" in ('internal')),
	CONSTRAINT "calendar_events_title_length_check" CHECK (char_length("calendar_events"."title") between 1 and 200),
	CONSTRAINT "calendar_events_description_length_check" CHECK ("calendar_events"."description" is null or char_length("calendar_events"."description") between 1 and 2000),
	CONSTRAINT "calendar_events_location_length_check" CHECK ("calendar_events"."location" is null or char_length("calendar_events"."location") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-edited: SET NULL ("goal_id" / "life_area_id") clears only the link, never user_id (needs PostgreSQL 15+).
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_goal_id_user_id_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE SET NULL ("goal_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_life_area_id_user_id_fk" FOREIGN KEY ("life_area_id","user_id") REFERENCES "public"."life_areas"("id","user_id") ON DELETE SET NULL ("life_area_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_user_id_start_at_idx" ON "calendar_events" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE INDEX "calendar_events_user_id_start_date_idx" ON "calendar_events" USING btree ("user_id","start_date");--> statement-breakpoint
CREATE INDEX "calendar_events_user_id_goal_id_idx" ON "calendar_events" USING btree ("user_id","goal_id");--> statement-breakpoint
CREATE INDEX "calendar_events_user_id_life_area_id_idx" ON "calendar_events" USING btree ("user_id","life_area_id");