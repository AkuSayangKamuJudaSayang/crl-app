-- CRL-2026-11-06.6: optional school-year schedules; preserves manual activations.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions,pg_catalog;
ALTER TABLE public.school_assessments ADD COLUMN schedule_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN schedule_paused boolean NOT NULL DEFAULT false, ADD COLUMN starts_on date, ADD COLUMN ends_on date;
ALTER TABLE public.school_assessments ADD CONSTRAINT assessment_schedule_dates CHECK (
 (NOT schedule_enabled AND starts_on IS NULL AND ends_on IS NULL AND NOT schedule_paused) OR
 (schedule_enabled AND starts_on IS NOT NULL AND ends_on IS NOT NULL AND starts_on<=ends_on
 AND starts_on>=make_date(start_year,1,1) AND ends_on<=make_date(start_year+1,12,31)));
ALTER TABLE public.school_assessments ADD CONSTRAINT school_timeline_dates_no_overlap EXCLUDE USING gist
 (school_id WITH =,start_year WITH =,daterange(starts_on,ends_on,'[]') WITH &&) WHERE (schedule_enabled);
CREATE FUNCTION crl_private.sync_assessment_schedule_state() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE today date := (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
 IF NEW.schedule_enabled THEN NEW.is_live=NOT NEW.schedule_paused AND today BETWEEN NEW.starts_on AND NEW.ends_on; END IF;
 IF TG_OP='UPDATE' AND (NEW.is_live IS DISTINCT FROM OLD.is_live OR NEW.schedule_enabled IS DISTINCT FROM OLD.schedule_enabled OR NEW.schedule_paused IS DISTINCT FROM OLD.schedule_paused OR NEW.starts_on IS DISTINCT FROM OLD.starts_on OR NEW.ends_on IS DISTINCT FROM OLD.ends_on) THEN
  IF NEW.revision=OLD.revision THEN NEW.revision=OLD.revision+1; END IF;
  NEW.updated_at=clock_timestamp();
 END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION crl_private.sync_assessment_schedule_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION crl_private.sync_assessment_schedule_state() TO crl_school;
CREATE TRIGGER assessment_schedule_state BEFORE INSERT OR UPDATE ON public.school_assessments FOR EACH ROW EXECUTE FUNCTION crl_private.sync_assessment_schedule_state();
CREATE FUNCTION crl_private.refresh_assessment_schedules() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE changed integer; today date := (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
 PERFORM pg_advisory_xact_lock(177631,1);
 UPDATE public.school_assessments SET is_live=NOT schedule_paused AND today BETWEEN starts_on AND ends_on
 WHERE schedule_enabled AND is_live IS DISTINCT FROM (NOT schedule_paused AND today BETWEEN starts_on AND ends_on);
 GET DIAGNOSTICS changed=ROW_COUNT;RETURN changed;
END;$$;
REVOKE ALL ON FUNCTION crl_private.refresh_assessment_schedules() FROM PUBLIC,anon,authenticated,crl_school;
SELECT cron.schedule('crl-refresh-assessment-schedules','* * * * *','SELECT crl_private.refresh_assessment_schedules();');
COMMIT;
