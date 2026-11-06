CREATE TABLE "account_closures" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"recover_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cemetery" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"closed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_closures" ADD CONSTRAINT "account_closures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cemetery" ADD CONSTRAINT "cemetery_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_closures_recover_until_idx" ON "account_closures" USING btree ("recover_until");