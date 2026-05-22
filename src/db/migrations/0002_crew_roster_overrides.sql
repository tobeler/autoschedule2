-- =============================================================
-- Date-scoped crew roster overrides.
--
-- Default crews remain stable in crews + crew_members. This table records
-- temporary moves such as "Lena works with Brooks Service on Tuesday".
-- Job slots remain the final record of who was assigned to a job.
-- =============================================================

ALTER TYPE "role_key" ADD VALUE IF NOT EXISTS 'service_tech';

DO $$ BEGIN
  CREATE TYPE "crew_roster_override_reason" AS ENUM (
    'loan',
    'sick_cover',
    'training',
    'service_pair',
    'manual'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "crew_roster_overrides" (
  "id" text PRIMARY KEY,
  "date" text NOT NULL,
  "personId" text NOT NULL REFERENCES "people"("id") ON DELETE cascade,
  "sourceCrewId" text REFERENCES "crews"("id") ON DELETE set null,
  "targetCrewId" text NOT NULL REFERENCES "crews"("id") ON DELETE cascade,
  "startHour" numeric(6, 2),
  "endHour" numeric(6, 2),
  "reason" "crew_roster_override_reason" NOT NULL DEFAULT 'manual',
  "note" text,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "crew_roster_overrides_date_idx"
  ON "crew_roster_overrides" ("date");

CREATE INDEX IF NOT EXISTS "crew_roster_overrides_person_date_idx"
  ON "crew_roster_overrides" ("personId", "date");

CREATE INDEX IF NOT EXISTS "crew_roster_overrides_target_date_idx"
  ON "crew_roster_overrides" ("targetCrewId", "date");

CREATE TRIGGER touch_crew_roster_overrides_updated_at
BEFORE UPDATE ON "crew_roster_overrides"
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.outbox_crew_roster_overrides() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "outbox" ("topic", "payloadJson") VALUES ('crew_roster_overrides.updated', to_jsonb(NEW));
  RETURN NEW;
END;$$;

CREATE TRIGGER outbox_crew_roster_overrides_changed
AFTER INSERT OR UPDATE ON "crew_roster_overrides"
FOR EACH ROW EXECUTE FUNCTION public.outbox_crew_roster_overrides();
