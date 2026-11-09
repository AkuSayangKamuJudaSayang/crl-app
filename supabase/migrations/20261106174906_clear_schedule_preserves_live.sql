-- CRL-2026-11-07.2. Clear removes automation and preserves the live state.
BEGIN;
CREATE OR REPLACE FUNCTION crl_private.sync_assessment_schedule_state() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE today date := (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date; policy_change boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(177631,1);
 IF TG_OP='UPDATE' THEN
  IF OLD.schedule_enabled AND NOT NEW.schedule_enabled THEN NEW.is_live=OLD.is_live; END IF;
 END IF;
 IF NEW.schedule_enabled THEN
  IF NEW.schedule_paused OR today NOT BETWEEN NEW.starts_on AND NEW.ends_on THEN NEW.is_live=false;
  ELSE
   policy_change=TG_OP='INSERT';
   IF TG_OP='UPDATE' THEN policy_change=NEW.schedule_enabled IS DISTINCT FROM OLD.schedule_enabled OR NEW.schedule_paused IS DISTINCT FROM OLD.schedule_paused OR NEW.starts_on IS DISTINCT FROM OLD.starts_on OR NEW.ends_on IS DISTINCT FROM OLD.ends_on; END IF;
   IF policy_change THEN NEW.is_live=true; END IF;
  END IF;
 END IF;
 IF NEW.is_live AND EXISTS(SELECT 1 FROM public.school_assessments a WHERE a.school_id=NEW.school_id AND a.start_year=NEW.start_year AND a.id<>NEW.id AND a.is_live) THEN
  RAISE EXCEPTION USING ERRCODE='23505',CONSTRAINT='one_live_assessment_per_school_year',MESSAGE='Only one timeline can be live at a time. Pause the live timeline first.';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.is_live IS DISTINCT FROM OLD.is_live OR NEW.schedule_enabled IS DISTINCT FROM OLD.schedule_enabled OR NEW.schedule_paused IS DISTINCT FROM OLD.schedule_paused OR NEW.starts_on IS DISTINCT FROM OLD.starts_on OR NEW.ends_on IS DISTINCT FROM OLD.ends_on) THEN
  IF NEW.revision=OLD.revision THEN NEW.revision=OLD.revision+1; END IF;
  NEW.updated_at=clock_timestamp();
 END IF;
 RETURN NEW;
END;$$;
COMMIT;
