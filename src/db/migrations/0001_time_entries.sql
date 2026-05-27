-- =============================================================
-- time_entries — real clock-in / clock-out punches backing the
-- Timesheets view. Distinct from job_slots.hours (planned duration).
--
-- NOTE: this hand-trimmed migration only contains the additive
-- delta for the new table + enum + index. The drizzle-kit
-- generator also tried to add a fistful of pre-existing columns
-- (zuperJobUid, title, …) that have been live on the DB since the
-- Zuper integration landed — those statements are intentionally
-- omitted to keep this file safely replayable. The 0000_snapshot
-- in meta/ trails the live schema for a few historical add-column
-- changes that were applied via `drizzle-kit push` rather than the
-- migration flow.
-- =============================================================

CREATE TYPE "public"."time_entry_source" AS ENUM('zuper', 'native');--> statement-breakpoint

CREATE TABLE "time_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"personId" text NOT NULL,
	"jobId" text,
	"clockIn" timestamp with time zone NOT NULL,
	"clockOut" timestamp with time zone,
	"source" time_entry_source DEFAULT 'zuper' NOT NULL,
	"zuperLogId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_personId_people_id_fk"
  FOREIGN KEY ("personId") REFERENCES "public"."people"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_jobId_jobs_id_fk"
  FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "time_entries_person_clockin_idx"
  ON "time_entries" USING btree ("personId","clockIn");
