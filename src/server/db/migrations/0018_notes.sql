CREATE TABLE "note_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_goals_note_id_goal_id_key" UNIQUE("note_id","goal_id")
);
--> statement-breakpoint
CREATE TABLE "note_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_tasks_note_id_task_id_key" UNIQUE("note_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"body" jsonb NOT NULL,
	"body_text" text NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("title", '')), 'A') || setweight(to_tsvector('english', "body_text"), 'B')) STORED NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "notes_title_length_check" CHECK ("notes"."title" is null or char_length("notes"."title") between 1 and 200),
	CONSTRAINT "notes_body_text_length_check" CHECK (char_length("notes"."body_text") <= 100000)
);
--> statement-breakpoint
ALTER TABLE "note_goals" ADD CONSTRAINT "note_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_goals" ADD CONSTRAINT "note_goals_note_id_user_id_fk" FOREIGN KEY ("note_id","user_id") REFERENCES "public"."notes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_goals" ADD CONSTRAINT "note_goals_goal_id_user_id_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tasks" ADD CONSTRAINT "note_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tasks" ADD CONSTRAINT "note_tasks_note_id_user_id_fk" FOREIGN KEY ("note_id","user_id") REFERENCES "public"."notes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tasks" ADD CONSTRAINT "note_tasks_task_id_user_id_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_goals_goal_id_user_id_idx" ON "note_goals" USING btree ("goal_id","user_id");--> statement-breakpoint
CREATE INDEX "note_tasks_task_id_user_id_idx" ON "note_tasks" USING btree ("task_id","user_id");--> statement-breakpoint
CREATE INDEX "notes_user_id_updated_at_idx" ON "notes" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "notes_search_vector_idx" ON "notes" USING gin ("search_vector");