-- =============================================================
-- Outbox triggers — hand-written follow-up to 0000_init.sql.
--
-- Every UPDATE (and INSERT) on the dispatcher-critical tables
-- enqueues a row in `outbox` with the new row encoded as JSON.
-- Phase 13's HubSpot push consumer + Phase 12's Supabase Realtime
-- channel both subscribe to this single table.
--
-- We use BEFORE-UPDATE only on `updatedAt` bumping, but the outbox
-- emit fires AFTER INSERT OR UPDATE so we capture the post-commit
-- payload. Topics:
--   jobs.updated      — INSERT or UPDATE on jobs
--   slots.updated     — INSERT or UPDATE on job_slots
--   crews.updated     — INSERT or UPDATE on crews
--   timeoff.updated   — INSERT or UPDATE on time_off
-- =============================================================

-- ---------- helper: bump updatedAt on every UPDATE ----------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$;

-- ---------- helper: enqueue an outbox event ----------
CREATE OR REPLACE FUNCTION public.enqueue_outbox(p_topic text)
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "outbox" ("topic", "payloadJson")
  VALUES (p_topic, to_jsonb(NEW));
  RETURN NEW;
END;
$$;

-- Per-table wrappers so AFTER triggers can pass the topic as a literal.
CREATE OR REPLACE FUNCTION public.outbox_jobs() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "outbox" ("topic", "payloadJson") VALUES ('jobs.updated', to_jsonb(NEW));
  RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION public.outbox_slots() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "outbox" ("topic", "payloadJson") VALUES ('slots.updated', to_jsonb(NEW));
  RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION public.outbox_crews() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "outbox" ("topic", "payloadJson") VALUES ('crews.updated', to_jsonb(NEW));
  RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION public.outbox_timeoff() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "outbox" ("topic", "payloadJson") VALUES ('timeoff.updated', to_jsonb(NEW));
  RETURN NEW;
END;$$;

-- ---------- updatedAt triggers ----------
CREATE TRIGGER touch_jobs_updated_at
BEFORE UPDATE ON "jobs"
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_crews_updated_at
BEFORE UPDATE ON "crews"
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_people_updated_at
BEFORE UPDATE ON "people"
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_trucks_updated_at
BEFORE UPDATE ON "trucks"
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_customers_updated_at
BEFORE UPDATE ON "customers"
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_projects_updated_at
BEFORE UPDATE ON "projects"
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_regions_updated_at
BEFORE UPDATE ON "regions"
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_timeoff_updated_at
BEFORE UPDATE ON "time_off"
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_checklists_updated_at
BEFORE UPDATE ON "checklists"
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_jobtemplates_updated_at
BEFORE UPDATE ON "job_templates"
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_profiles_updated_at
BEFORE UPDATE ON "profiles"
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- outbox triggers ----------
CREATE TRIGGER outbox_jobs_changed
AFTER INSERT OR UPDATE ON "jobs"
FOR EACH ROW EXECUTE FUNCTION public.outbox_jobs();

CREATE TRIGGER outbox_jobslots_changed
AFTER INSERT OR UPDATE ON "job_slots"
FOR EACH ROW EXECUTE FUNCTION public.outbox_slots();

CREATE TRIGGER outbox_crews_changed
AFTER INSERT OR UPDATE ON "crews"
FOR EACH ROW EXECUTE FUNCTION public.outbox_crews();

CREATE TRIGGER outbox_timeoff_changed
AFTER INSERT OR UPDATE ON "time_off"
FOR EACH ROW EXECUTE FUNCTION public.outbox_timeoff();
