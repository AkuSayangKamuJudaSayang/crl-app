-- CRL-2026-11-07.1. No record deletion or automatic choice among existing live rows.
BEGIN;
-- Fails safely if an older workspace already has conflicting live triggers.
CREATE UNIQUE INDEX one_live_assessment_per_school_year ON public.school_assessments(school_id,start_year) WHERE is_live;
CREATE OR REPLACE FUNCTION crl_private.sync_assessment_schedule_state() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE today date := (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date; policy_change boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(177631,1);
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
-- App requests reconcile only the currently authenticated school under its RLS role.
CREATE FUNCTION crl_private.refresh_current_school_assessment_schedules() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE today date := (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date; own_school text:=current_setting('crl.school_id',true); changed integer:=0; closed integer; target record;
BEGIN
 IF own_school IS NULL OR own_school !~ '^\d{6}$' THEN RAISE EXCEPTION 'An assigned school is required.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(177631,1);
 UPDATE public.school_assessments SET is_live=false WHERE school_id=own_school AND schedule_enabled AND is_live AND (schedule_paused OR today NOT BETWEEN starts_on AND ends_on);
 GET DIAGNOSTICS closed=ROW_COUNT;changed=closed;
 FOR target IN SELECT a.id FROM public.school_assessments a WHERE a.school_id=own_school AND a.schedule_enabled AND NOT a.schedule_paused AND NOT a.is_live AND today BETWEEN a.starts_on AND a.ends_on AND NOT EXISTS(SELECT 1 FROM public.school_assessments b WHERE b.school_id=a.school_id AND b.start_year=a.start_year AND b.is_live) ORDER BY a.start_year,a.period LOOP
  UPDATE public.school_assessments SET is_live=true WHERE id=target.id;changed=changed+1;
 END LOOP;
 RETURN changed;
END;$$;
REVOKE ALL ON FUNCTION crl_private.refresh_current_school_assessment_schedules() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION crl_private.refresh_current_school_assessment_schedules() TO crl_school;
-- Scheduler keeps a manually live period until explicitly paused. A due schedule waits.
CREATE OR REPLACE FUNCTION crl_private.refresh_assessment_schedules() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE today date := (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date; changed integer:=0;closed integer;target record;
BEGIN
 PERFORM pg_advisory_xact_lock(177631,1);
 UPDATE public.school_assessments SET is_live=false WHERE schedule_enabled AND is_live AND (schedule_paused OR today NOT BETWEEN starts_on AND ends_on);
 GET DIAGNOSTICS closed=ROW_COUNT;changed=closed;
 FOR target IN SELECT a.id FROM public.school_assessments a WHERE a.schedule_enabled AND NOT a.schedule_paused AND NOT a.is_live AND today BETWEEN a.starts_on AND a.ends_on AND NOT EXISTS(SELECT 1 FROM public.school_assessments b WHERE b.school_id=a.school_id AND b.start_year=a.start_year AND b.is_live) ORDER BY a.school_id,a.start_year,a.period LOOP
  UPDATE public.school_assessments SET is_live=true WHERE id=target.id;changed=changed+1;
 END LOOP;
 RETURN changed;
END;$$;
REVOKE ALL ON FUNCTION crl_private.refresh_assessment_schedules() FROM PUBLIC,anon,authenticated,crl_school;
COMMIT;
