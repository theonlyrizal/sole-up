CREATE TABLE "life_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"sort_order" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "life_areas_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "life_areas_status_check" CHECK ("life_areas"."status" in ('active', 'archived')),
	CONSTRAINT "life_areas_name_length_check" CHECK (char_length("life_areas"."name") between 1 and 60),
	CONSTRAINT "life_areas_description_length_check" CHECK ("life_areas"."description" is null or char_length("life_areas"."description") between 1 and 500),
	CONSTRAINT "life_areas_color_check" CHECK ("life_areas"."color" is null or "life_areas"."color" in ('gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'))
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "life_area_starters" text;--> statement-breakpoint
ALTER TABLE "life_areas" ADD CONSTRAINT "life_areas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "life_areas_user_id_active_name_key" ON "life_areas" USING btree ("user_id",lower("name")) WHERE "life_areas"."status" = 'active';--> statement-breakpoint
CREATE INDEX "life_areas_user_id_sort_order_idx" ON "life_areas" USING btree ("user_id","sort_order");--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_life_area_starters_check" CHECK ("user_preferences"."life_area_starters" is null or "user_preferences"."life_area_starters" in ('accepted', 'dismissed'));