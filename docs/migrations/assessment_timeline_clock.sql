-- CRL-2026-11-07.3. Preserving exact-time scheduling; date columns support older clients.
BEGIN;
SELECT pg_advisory_xact_lock(177631,1);
ALTER TABLE public.school_assessments ADD COLUMN starts_at timestamptz, ADD COLUMN ends_at timestamptz;
ALTER TABLE public.school_assessments DROP CONSTRAINT assessment_schedule_dates, DROP CONSTRAINT school_timeline_dates_no_overlap;
UPDATE public.school_assessments SET starts_at=CASE WHEN schedule_enabled THEN starts_on::timestamp AT TIME ZONE 'Asia/Manila' WHEN is_live THEN updated_at ELSE NULL END,ends_at=CASE WHEN schedule_enabled THEN (ends_on+1)::timestamp AT TIME ZONE 'Asia/Manila' ELSE NULL END;
ALTER TABLE public.school_assessments ADD CONSTRAINT assessment_schedule_clock CHECK ((NOT schedule_enabled AND NOT schedule_paused AND ends_at IS NULL) OR (schedule_enabled AND starts_at IS NOT NULL AND (ends_at IS NULL OR ends_at>starts_at)));
ALTER TABLE public.school_assessments ADD CONSTRAINT school_timeline_clock_no_overlap EXCLUDE USING gist (school_id WITH =,start_year WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (schedule_enabled);
CREATE OR REPLACE FUNCTION crl_private.sync_assessment_schedule_state() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE moment timestamptz:=clock_timestamp();policy_change boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(177631,1);moment=clock_timestamp();
 IF TG_OP='UPDATE' AND OLD.schedule_enabled AND NOT NEW.schedule_enabled THEN
  NEW.is_live=OLD.is_live;NEW.ends_at=NULL;NEW.starts_at=CASE WHEN NEW.is_live THEN coalesce(OLD.starts_at,moment) ELSE NULL END;
 END IF;
 IF NEW.schedule_enabled THEN
  -- Legacy date-only writes retain inclusive end-day behavior.
  IF NEW.starts_at IS NULL THEN NEW.starts_at=NEW.starts_on::timestamp AT TIME ZONE 'Asia/Manila';END IF;
  IF TG_OP='UPDATE' THEN
   IF NEW.starts_on IS DISTINCT FROM OLD.starts_on AND NEW.starts_at IS NOT DISTINCT FROM OLD.starts_at THEN NEW.starts_at=NEW.starts_on::timestamp AT TIME ZONE 'Asia/Manila';END IF;
   IF NEW.ends_on IS DISTINCT FROM OLD.ends_on AND NEW.ends_at IS NOT DISTINCT FROM OLD.ends_at THEN NEW.ends_at=(NEW.ends_on+1)::timestamp AT TIME ZONE 'Asia/Manila';END IF;
  ELSIF NEW.ends_at IS NULL AND NEW.ends_on IS NOT NULL THEN NEW.ends_at=(NEW.ends_on+1)::timestamp AT TIME ZONE 'Asia/Manila';END IF;
  NEW.starts_on=(NEW.starts_at AT TIME ZONE 'Asia/Manila')::date;
  NEW.ends_on=CASE WHEN NEW.ends_at IS NOT NULL THEN ((NEW.ends_at-interval '1 microsecond') AT TIME ZONE 'Asia/Manila')::date ELSE NULL END;
  IF NEW.schedule_paused OR moment<NEW.starts_at OR (NEW.ends_at IS NOT NULL AND moment>=NEW.ends_at) THEN NEW.is_live=false;
  ELSE
   policy_change=TG_OP='INSERT';
   IF TG_OP='UPDATE' THEN policy_change=NEW.schedule_enabled IS DISTINCT FROM OLD.schedule_enabled OR NEW.schedule_paused IS DISTINCT FROM OLD.schedule_paused OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at;END IF;
   IF policy_change THEN NEW.is_live=true;END IF;
  END IF;
 ELSE
  NEW.starts_on=NULL;NEW.ends_on=NULL;NEW.ends_at=NULL;NEW.schedule_paused=false;
  IF NEW.is_live THEN
   IF TG_OP='INSERT' THEN NEW.starts_at=coalesce(NEW.starts_at,moment);
   ELSIF NOT OLD.is_live THEN NEW.starts_at=moment;
   ELSE NEW.starts_at=coalesce(NEW.starts_at,OLD.starts_at,moment);END IF;
  END IF;
 END IF;
 IF NEW.is_live AND EXISTS(SELECT 1 FROM public.school_assessments a WHERE a.school_id=NEW.school_id AND a.start_year=NEW.start_year AND a.id<>NEW.id AND a.is_live) THEN RAISE EXCEPTION USING ERRCODE='23505',CONSTRAINT='one_live_assessment_per_school_year',MESSAGE='Only one timeline can be live at a time. Pause the live timeline first.';END IF;
 IF TG_OP='UPDATE' AND (NEW.is_live IS DISTINCT FROM OLD.is_live OR NEW.schedule_enabled IS DISTINCT FROM OLD.schedule_enabled OR NEW.schedule_paused IS DISTINCT FROM OLD.schedule_paused OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at) THEN
  IF NEW.revision=OLD.revision THEN NEW.revision=OLD.revision+1;END IF;NEW.updated_at=moment;
 END IF;RETURN NEW;
END;$$;
CREATE OR REPLACE FUNCTION crl_private.refresh_current_school_assessment_schedules() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE moment timestamptz:=clock_timestamp();own_school text:=current_setting('crl.school_id',true);changed integer:=0;closed integer;target record;
BEGIN
 IF own_school IS NULL OR own_school !~ '^\d{6}$' THEN RAISE EXCEPTION 'An assigned school is required.' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(177631,1);moment=clock_timestamp();
 UPDATE public.school_assessments SET is_live=false WHERE school_id=own_school AND schedule_enabled AND is_live AND (schedule_paused OR moment<starts_at OR (ends_at IS NOT NULL AND moment>=ends_at));GET DIAGNOSTICS closed=ROW_COUNT;changed=closed;
 FOR target IN SELECT a.id FROM public.school_assessments a WHERE a.school_id=own_school AND a.schedule_enabled AND NOT a.schedule_paused AND NOT a.is_live AND moment>=a.starts_at AND (a.ends_at IS NULL OR moment<a.ends_at) AND NOT EXISTS(SELECT 1 FROM public.school_assessments b WHERE b.school_id=a.school_id AND b.start_year=a.start_year AND b.is_live) ORDER BY a.start_year,a.starts_at LOOP
  UPDATE public.school_assessments SET is_live=true WHERE id=target.id;changed=changed+1;
 END LOOP;RETURN changed;
END;$$;
CREATE OR REPLACE FUNCTION crl_private.refresh_assessment_schedules() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE moment timestamptz:=clock_timestamp();changed integer:=0;closed integer;target record;
BEGIN
 PERFORM pg_advisory_xact_lock(177631,1);moment=clock_timestamp();
 UPDATE public.school_assessments SET is_live=false WHERE schedule_enabled AND is_live AND (schedule_paused OR moment<starts_at OR (ends_at IS NOT NULL AND moment>=ends_at));GET DIAGNOSTICS closed=ROW_COUNT;changed=closed;
 FOR target IN SELECT a.id FROM public.school_assessments a WHERE a.schedule_enabled AND NOT a.schedule_paused AND NOT a.is_live AND moment>=a.starts_at AND (a.ends_at IS NULL OR moment<a.ends_at) AND NOT EXISTS(SELECT 1 FROM public.school_assessments b WHERE b.school_id=a.school_id AND b.start_year=a.start_year AND b.is_live) ORDER BY a.school_id,a.start_year,a.starts_at LOOP
  UPDATE public.school_assessments SET is_live=true WHERE id=target.id;changed=changed+1;
 END LOOP;RETURN changed;
END;$$;
REVOKE ALL ON FUNCTION crl_private.refresh_assessment_schedules() FROM PUBLIC,anon,authenticated,crl_school;
REVOKE ALL ON FUNCTION crl_private.refresh_current_school_assessment_schedules() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION crl_private.refresh_current_school_assessment_schedules() TO crl_school;
COMMIT;
