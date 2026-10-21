CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "milestones_status_check" CHECK ("milestones"."status" in ('open', 'completed', 'dropped')),
	CONSTRAINT "milestones_completed_at_check" CHECK (("milestones"."status" = 'completed') = ("milestones"."completed_at" is not null)),
	CONSTRAINT "milestones_sort_order_check" CHECK ("milestones"."sort_order" >= 0),
	CONSTRAINT "milestones_title_length_check" CHECK (char_length("milestones"."title") between 1 and 200),
	CONSTRAINT "milestones_description_length_check" CHECK ("milestones"."description" is null or char_length("milestones"."description") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_goal_id_user_id_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "milestones_goal_id_user_id_sort_order_idx" ON "milestones" USING btree ("goal_id","user_id","sort_order");