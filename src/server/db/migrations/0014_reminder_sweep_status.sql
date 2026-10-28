CREATE TABLE "reminder_sweep_status" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_sweep_at" timestamp with time zone NOT NULL,
	CONSTRAINT "reminder_sweep_status_single_row_check" CHECK ("reminder_sweep_status"."id" = 1)
);
