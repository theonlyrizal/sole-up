CREATE TABLE "habit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"status" text NOT NULL,
	"value" numeric(7, 2),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_logs_habit_id_local_date_key" UNIQUE("habit_id","local_date"),
	CONSTRAINT "habit_logs_status_check" CHECK ("habit_logs"."status" in ('completed', 'skipped')),
	CONSTRAINT "habit_logs_skip_value_check" CHECK ("habit_logs"."status" <> 'skipped' or "habit_logs"."value" is null),
	CONSTRAINT "habit_logs_value_check" CHECK ("habit_logs"."value" is null or "habit_logs"."value" > 0),
	CONSTRAINT "habit_logs_note_length_check" CHECK ("habit_logs"."note" is null or char_length("habit_logs"."note") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "habit_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_pauses_date_order_check" CHECK ("habit_pauses"."end_date" is null or "habit_pauses"."end_date" > "habit_pauses"."start_date")
);
--> statement-breakpoint
CREATE TABLE "habit_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"cadence_type" text NOT NULL,
	"cadence_config" jsonb NOT NULL,
	"target" numeric(7, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_schedules_habit_id_effective_from_key" UNIQUE("habit_id","effective_from"),
	CONSTRAINT "habit_schedules_cadence_type_check" CHECK ("habit_schedules"."cadence_type" in ('daily', 'weekly_days', 'times_per_week')),
	CONSTRAINT "habit_schedules_cadence_config_check" CHECK (coalesce(case "habit_schedules"."cadence_type"
        when 'daily' then "habit_schedules"."cadence_config" = '{}'::jsonb
        when 'weekly_days' then jsonb_typeof("habit_schedules"."cadence_config" -> 'days') = 'array'
          and "habit_schedules"."cadence_config" - 'days' = '{}'::jsonb
        when 'times_per_week' then jsonb_typeof("habit_schedules"."cadence_config" -> 'timesPerWeek') = 'number'
          and "habit_schedules"."cadence_config" - 'timesPerWeek' = '{}'::jsonb
        else true end, false)),
	CONSTRAINT "habit_schedules_target_check" CHECK ("habit_schedules"."target" is null or "habit_schedules"."target" > 0)
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"measure" text NOT NULL,
	"unit" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"goal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habits_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "habits_status_check" CHECK ("habits"."status" in ('active', 'paused', 'archived')),
	CONSTRAINT "habits_measure_check" CHECK ("habits"."measure" in ('check', 'quantity')),
	CONSTRAINT "habits_unit_check" CHECK (("habits"."measure" = 'quantity') = ("habits"."unit" is not null)),
	CONSTRAINT "habits_date_order_check" CHECK ("habits"."end_date" is null or "habits"."end_date" >= "habits"."start_date"),
	CONSTRAINT "habits_title_length_check" CHECK (char_length("habits"."title") between 1 and 200),
	CONSTRAINT "habits_description_length_check" CHECK ("habits"."description" is null or char_length("habits"."description") between 1 and 2000),
	CONSTRAINT "habits_unit_length_check" CHECK ("habits"."unit" is null or char_length("habits"."unit") between 1 and 30)
);
--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_habit_id_user_id_fk" FOREIGN KEY ("habit_id","user_id") REFERENCES "public"."habits"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_pauses" ADD CONSTRAINT "habit_pauses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_pauses" ADD CONSTRAINT "habit_pauses_habit_id_user_id_fk" FOREIGN KEY ("habit_id","user_id") REFERENCES "public"."habits"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_schedules" ADD CONSTRAINT "habit_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_schedules" ADD CONSTRAINT "habit_schedules_habit_id_user_id_fk" FOREIGN KEY ("habit_id","user_id") REFERENCES "public"."habits"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-edited: SET NULL ("goal_id") clears only the goal, never user_id (needs PostgreSQL 15+).
ALTER TABLE "habits" ADD CONSTRAINT "habits_goal_id_user_id_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE SET NULL ("goal_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "habit_logs_user_id_local_date_idx" ON "habit_logs" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "habit_pauses_habit_id_start_date_idx" ON "habit_pauses" USING btree ("habit_id","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_pauses_one_open_key" ON "habit_pauses" USING btree ("habit_id") WHERE "habit_pauses"."end_date" is null;--> statement-breakpoint
CREATE INDEX "habits_user_id_status_idx" ON "habits" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "habits_goal_id_user_id_idx" ON "habits" USING btree ("goal_id","user_id");