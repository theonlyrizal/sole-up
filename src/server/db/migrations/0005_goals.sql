CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"life_area_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"reason" text,
	"status" text DEFAULT 'active' NOT NULL,
	"priority" text,
	"start_date" date,
	"target_date" date,
	"completed_at" timestamp with time zone,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "goals_status_check" CHECK ("goals"."status" in ('active', 'paused', 'completed', 'dropped', 'archived')),
	CONSTRAINT "goals_priority_check" CHECK ("goals"."priority" is null or "goals"."priority" in ('low', 'medium', 'high')),
	CONSTRAINT "goals_date_order_check" CHECK ("goals"."start_date" is null or "goals"."target_date" is null or "goals"."target_date" >= "goals"."start_date"),
	CONSTRAINT "goals_completed_at_check" CHECK (("goals"."status" <> 'completed' or "goals"."completed_at" is not null) and ("goals"."completed_at" is null or "goals"."status" in ('completed', 'archived'))),
	CONSTRAINT "goals_title_length_check" CHECK (char_length("goals"."title") between 1 and 200),
	CONSTRAINT "goals_description_length_check" CHECK ("goals"."description" is null or char_length("goals"."description") between 1 and 2000),
	CONSTRAINT "goals_reason_length_check" CHECK ("goals"."reason" is null or char_length("goals"."reason") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-edited: SET NULL ("life_area_id") clears only the area, never user_id (needs PostgreSQL 15+).
ALTER TABLE "goals" ADD CONSTRAINT "goals_life_area_id_user_id_fk" FOREIGN KEY ("life_area_id","user_id") REFERENCES "public"."life_areas"("id","user_id") ON DELETE SET NULL ("life_area_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_user_id_status_idx" ON "goals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "goals_life_area_id_user_id_idx" ON "goals" USING btree ("life_area_id","user_id");