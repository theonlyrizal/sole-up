CREATE TABLE "time_block_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"original_start_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_block_exceptions_block_id_original_start_at_key" UNIQUE("block_id","original_start_at"),
	CONSTRAINT "time_block_exceptions_kind_check" CHECK ("time_block_exceptions"."kind" in ('cancelled', 'modified')),
	CONSTRAINT "time_block_exceptions_override_check" CHECK (case when "time_block_exceptions"."kind" = 'cancelled'
        then "time_block_exceptions"."start_at" is null and "time_block_exceptions"."end_at" is null and "time_block_exceptions"."status" is null
        else "time_block_exceptions"."start_at" is not null and "time_block_exceptions"."end_at" is not null and "time_block_exceptions"."status" is not null
        end),
	CONSTRAINT "time_block_exceptions_end_check" CHECK ("time_block_exceptions"."start_at" is null or "time_block_exceptions"."end_at" > "time_block_exceptions"."start_at"),
	CONSTRAINT "time_block_exceptions_duration_check" CHECK ("time_block_exceptions"."start_at" is null or "time_block_exceptions"."end_at" <= "time_block_exceptions"."start_at" + interval '1440 minutes'),
	CONSTRAINT "time_block_exceptions_status_check" CHECK ("time_block_exceptions"."status" is null or "time_block_exceptions"."status" in ('scheduled', 'done', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "time_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"tz" text NOT NULL,
	"rrule" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_blocks_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "time_blocks_end_check" CHECK ("time_blocks"."end_at" > "time_blocks"."start_at"),
	CONSTRAINT "time_blocks_duration_check" CHECK ("time_blocks"."end_at" <= "time_blocks"."start_at" + interval '1440 minutes'),
	CONSTRAINT "time_blocks_status_check" CHECK ("time_blocks"."status" in ('scheduled', 'done', 'skipped')),
	CONSTRAINT "time_blocks_series_status_check" CHECK ("time_blocks"."rrule" is null or "time_blocks"."status" = 'scheduled'),
	CONSTRAINT "time_blocks_rrule_length_check" CHECK ("time_blocks"."rrule" is null or char_length("time_blocks"."rrule") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "time_block_exceptions" ADD CONSTRAINT "time_block_exceptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_block_exceptions" ADD CONSTRAINT "time_block_exceptions_block_id_user_id_fk" FOREIGN KEY ("block_id","user_id") REFERENCES "public"."time_blocks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_task_id_user_id_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_blocks_user_id_start_at_idx" ON "time_blocks" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE INDEX "time_blocks_user_id_task_id_idx" ON "time_blocks" USING btree ("user_id","task_id");