CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid,
	"milestone_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text,
	"due_date" date,
	"due_at" timestamp with time zone,
	"due_tz" text,
	"planned_date" date,
	"estimated_minutes" integer,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "tasks_parent_check" CHECK (num_nonnulls("tasks"."goal_id", "tasks"."milestone_id") <= 1),
	CONSTRAINT "tasks_deadline_check" CHECK ("tasks"."due_date" is null or "tasks"."due_at" is null),
	CONSTRAINT "tasks_due_tz_check" CHECK (("tasks"."due_at" is null) = ("tasks"."due_tz" is null)),
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('open', 'completed', 'cancelled')),
	CONSTRAINT "tasks_priority_check" CHECK ("tasks"."priority" is null or "tasks"."priority" in ('low', 'medium', 'high')),
	CONSTRAINT "tasks_estimated_minutes_check" CHECK ("tasks"."estimated_minutes" is null or "tasks"."estimated_minutes" between 1 and 1440),
	CONSTRAINT "tasks_completed_at_check" CHECK (("tasks"."status" = 'completed') = ("tasks"."completed_at" is not null)),
	CONSTRAINT "tasks_cancelled_at_check" CHECK (("tasks"."status" = 'cancelled') = ("tasks"."cancelled_at" is not null)),
	CONSTRAINT "tasks_sort_order_check" CHECK ("tasks"."sort_order" >= 0),
	CONSTRAINT "tasks_title_length_check" CHECK (char_length("tasks"."title") between 1 and 200),
	CONSTRAINT "tasks_notes_length_check" CHECK ("tasks"."notes" is null or char_length("tasks"."notes") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-edited: SET NULL ("goal_id" / "milestone_id") clears only the parent, never user_id (needs PostgreSQL 15+).
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_user_id_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE SET NULL ("goal_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_id_user_id_fk" FOREIGN KEY ("milestone_id","user_id") REFERENCES "public"."milestones"("id","user_id") ON DELETE SET NULL ("milestone_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_user_id_status_planned_date_idx" ON "tasks" USING btree ("user_id","status","planned_date");--> statement-breakpoint
CREATE INDEX "tasks_user_id_status_due_date_idx" ON "tasks" USING btree ("user_id","status","due_date");--> statement-breakpoint
CREATE INDEX "tasks_user_id_status_due_at_idx" ON "tasks" USING btree ("user_id","status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_user_id_milestone_id_idx" ON "tasks" USING btree ("user_id","milestone_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_goal_id_idx" ON "tasks" USING btree ("user_id","goal_id");