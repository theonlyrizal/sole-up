CREATE TABLE "weekly_review_priorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"goal_id" uuid,
	"task_id" uuid,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_review_priorities_review_id_goal_id_key" UNIQUE("review_id","goal_id"),
	CONSTRAINT "weekly_review_priorities_review_id_task_id_key" UNIQUE("review_id","task_id"),
	CONSTRAINT "weekly_review_priorities_review_id_sort_order_key" UNIQUE("review_id","sort_order"),
	CONSTRAINT "weekly_review_priorities_one_target_check" CHECK (num_nonnulls("weekly_review_priorities"."goal_id", "weekly_review_priorities"."task_id") = 1),
	CONSTRAINT "weekly_review_priorities_sort_order_check" CHECK ("weekly_review_priorities"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "weekly_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"wins" text,
	"blockers" text,
	"lessons" text,
	"priorities_note" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_reviews_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "weekly_reviews_user_id_period_start_key" UNIQUE("user_id","period_start"),
	CONSTRAINT "weekly_reviews_period_check" CHECK ("weekly_reviews"."period_end" = "weekly_reviews"."period_start" + 7),
	CONSTRAINT "weekly_reviews_wins_length_check" CHECK ("weekly_reviews"."wins" is null or char_length("weekly_reviews"."wins") between 1 and 5000),
	CONSTRAINT "weekly_reviews_blockers_length_check" CHECK ("weekly_reviews"."blockers" is null or char_length("weekly_reviews"."blockers") between 1 and 5000),
	CONSTRAINT "weekly_reviews_lessons_length_check" CHECK ("weekly_reviews"."lessons" is null or char_length("weekly_reviews"."lessons") between 1 and 5000),
	CONSTRAINT "weekly_reviews_priorities_note_length_check" CHECK ("weekly_reviews"."priorities_note" is null or char_length("weekly_reviews"."priorities_note") between 1 and 5000)
);
--> statement-breakpoint
ALTER TABLE "weekly_review_priorities" ADD CONSTRAINT "weekly_review_priorities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_review_priorities" ADD CONSTRAINT "weekly_review_priorities_review_id_user_id_fk" FOREIGN KEY ("review_id","user_id") REFERENCES "public"."weekly_reviews"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_review_priorities" ADD CONSTRAINT "weekly_review_priorities_goal_id_user_id_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_review_priorities" ADD CONSTRAINT "weekly_review_priorities_task_id_user_id_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weekly_review_priorities_goal_id_user_id_idx" ON "weekly_review_priorities" USING btree ("goal_id","user_id");--> statement-breakpoint
CREATE INDEX "weekly_review_priorities_task_id_user_id_idx" ON "weekly_review_priorities" USING btree ("task_id","user_id");