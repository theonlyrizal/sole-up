CREATE TABLE "calendar_event_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"original_start_at" timestamp with time zone,
	"original_start_date" date,
	"kind" text NOT NULL,
	"title" text,
	"description" text,
	"location" text,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"start_date" date,
	"end_date" date,
	"goal_id" uuid,
	"life_area_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_exceptions_event_id_original_start_at_key" UNIQUE("event_id","original_start_at"),
	CONSTRAINT "calendar_event_exceptions_event_id_original_start_date_key" UNIQUE("event_id","original_start_date"),
	CONSTRAINT "calendar_event_exceptions_kind_check" CHECK ("calendar_event_exceptions"."kind" in ('cancelled', 'modified')),
	CONSTRAINT "calendar_event_exceptions_original_check" CHECK (("calendar_event_exceptions"."original_start_at" is null) <> ("calendar_event_exceptions"."original_start_date" is null)),
	CONSTRAINT "calendar_event_exceptions_override_check" CHECK (case when "calendar_event_exceptions"."kind" = 'cancelled'
        then "calendar_event_exceptions"."title" is null and "calendar_event_exceptions"."description" is null and "calendar_event_exceptions"."location" is null
          and "calendar_event_exceptions"."start_at" is null and "calendar_event_exceptions"."end_at" is null
          and "calendar_event_exceptions"."start_date" is null and "calendar_event_exceptions"."end_date" is null
          and "calendar_event_exceptions"."goal_id" is null and "calendar_event_exceptions"."life_area_id" is null
        else "calendar_event_exceptions"."title" is not null and case when "calendar_event_exceptions"."original_start_at" is not null
          then "calendar_event_exceptions"."start_at" is not null and "calendar_event_exceptions"."end_at" is not null
            and "calendar_event_exceptions"."start_date" is null and "calendar_event_exceptions"."end_date" is null
          else "calendar_event_exceptions"."start_date" is not null and "calendar_event_exceptions"."end_date" is not null
            and "calendar_event_exceptions"."start_at" is null and "calendar_event_exceptions"."end_at" is null
          end
        end),
	CONSTRAINT "calendar_event_exceptions_end_check" CHECK (("calendar_event_exceptions"."start_at" is null or "calendar_event_exceptions"."end_at" > "calendar_event_exceptions"."start_at")
        and ("calendar_event_exceptions"."start_date" is null or "calendar_event_exceptions"."end_date" > "calendar_event_exceptions"."start_date")),
	CONSTRAINT "calendar_event_exceptions_title_length_check" CHECK ("calendar_event_exceptions"."title" is null or char_length("calendar_event_exceptions"."title") between 1 and 200),
	CONSTRAINT "calendar_event_exceptions_description_length_check" CHECK ("calendar_event_exceptions"."description" is null or char_length("calendar_event_exceptions"."description") between 1 and 2000),
	CONSTRAINT "calendar_event_exceptions_location_length_check" CHECK ("calendar_event_exceptions"."location" is null or char_length("calendar_event_exceptions"."location") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "rrule" text;--> statement-breakpoint
ALTER TABLE "calendar_event_exceptions" ADD CONSTRAINT "calendar_event_exceptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_exceptions" ADD CONSTRAINT "calendar_event_exceptions_event_id_user_id_fk" FOREIGN KEY ("event_id","user_id") REFERENCES "public"."calendar_events"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-edited: SET NULL ("goal_id" / "life_area_id") clears only the link, never user_id (needs PostgreSQL 15+).
ALTER TABLE "calendar_event_exceptions" ADD CONSTRAINT "calendar_event_exceptions_goal_id_user_id_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE SET NULL ("goal_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_exceptions" ADD CONSTRAINT "calendar_event_exceptions_life_area_id_user_id_fk" FOREIGN KEY ("life_area_id","user_id") REFERENCES "public"."life_areas"("id","user_id") ON DELETE SET NULL ("life_area_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_event_exceptions_user_id_goal_id_idx" ON "calendar_event_exceptions" USING btree ("user_id","goal_id");--> statement-breakpoint
CREATE INDEX "calendar_event_exceptions_user_id_life_area_id_idx" ON "calendar_event_exceptions" USING btree ("user_id","life_area_id");--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_rrule_length_check" CHECK ("calendar_events"."rrule" is null or char_length("calendar_events"."rrule") between 1 and 200);