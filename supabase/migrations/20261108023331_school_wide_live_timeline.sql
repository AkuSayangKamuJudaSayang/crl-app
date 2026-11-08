-- CRL-2026-11-08.2: one live timeline per school across every school year.
-- No operational rows or recorded timestamps are rewritten.
BEGIN;
SELECT pg_advisory_xact_lock(177631,1);
CREATE OR REPLACE FUNCTION crl_private.refresh_assessment_schedules()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE moment timestamptz:=clock_timestamp();changed integer:=0;closed integer;target record;
BEGIN
 PERFORM pg_advisory_xact_lock(177631,1);moment=clock_timestamp();
 UPDATE public.school_assessments SET is_live=false WHERE schedule_enabled AND is_live AND ((moment AT TIME ZONE 'Asia/Manila')::date<make_date(start_year,1,1) OR (moment AT TIME ZONE 'Asia/Manila')::date>make_date(start_year+1,12,31) OR schedule_paused OR moment<starts_at OR (ends_at IS NOT NULL AND moment>=ends_at));GET DIAGNOSTICS closed=ROW_COUNT;changed=closed;
 FOR target IN SELECT a.id,a.school_id FROM public.school_assessments a WHERE a.schedule_enabled AND NOT a.schedule_paused AND NOT a.is_live AND (moment AT TIME ZONE 'Asia/Manila')::date BETWEEN make_date(a.start_year,1,1) AND make_date(a.start_year+1,12,31) AND moment>=a.starts_at AND (a.ends_at IS NULL OR moment<a.ends_at) AND NOT EXISTS(SELECT 1 FROM public.school_assessments b WHERE b.school_id=a.school_id AND b.is_live) ORDER BY a.school_id,a.start_year,a.starts_at LOOP
  IF NOT EXISTS(SELECT 1 FROM public.school_assessments WHERE school_id=target.school_id AND is_live) THEN
   UPDATE public.school_assessments SET is_live=true WHERE id=target.id;changed=changed+1;
  END IF;
 END LOOP;RETURN changed;
END;$function$;
CREATE OR REPLACE FUNCTION crl_private.refresh_current_school_assessment_schedules()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE moment timestamptz:=clock_timestamp();own_school text:=current_setting('crl.school_id',true);changed integer:=0;closed integer;target record;
BEGIN
 IF own_school IS NULL OR own_school !~ '^\d{6}$' THEN RAISE EXCEPTION 'An assigned school is required.' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(177631,1);moment=clock_timestamp();
 UPDATE public.school_assessments SET is_live=false WHERE school_id=own_school AND schedule_enabled AND is_live AND ((moment AT TIME ZONE 'Asia/Manila')::date<make_date(start_year,1,1) OR (moment AT TIME ZONE 'Asia/Manila')::date>make_date(start_year+1,12,31) OR schedule_paused OR moment<starts_at OR (ends_at IS NOT NULL AND moment>=ends_at));GET DIAGNOSTICS closed=ROW_COUNT;changed=closed;
 FOR target IN SELECT a.id,a.school_id FROM public.school_assessments a WHERE a.school_id=own_school AND a.schedule_enabled AND NOT a.schedule_paused AND NOT a.is_live AND (moment AT TIME ZONE 'Asia/Manila')::date BETWEEN make_date(a.start_year,1,1) AND make_date(a.start_year+1,12,31) AND moment>=a.starts_at AND (a.ends_at IS NULL OR moment<a.ends_at) AND NOT EXISTS(SELECT 1 FROM public.school_assessments b WHERE b.school_id=a.school_id AND b.is_live) ORDER BY a.start_year,a.starts_at LOOP
  IF NOT EXISTS(SELECT 1 FROM public.school_assessments WHERE school_id=target.school_id AND is_live) THEN
   UPDATE public.school_assessments SET is_live=true WHERE id=target.id;changed=changed+1;
  END IF;
 END LOOP;RETURN changed;
END;$function$;
CREATE OR REPLACE FUNCTION crl_private.sync_assessment_schedule_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE moment timestamptz:=clock_timestamp();policy_change boolean;first_day date;last_day date;my_first date;my_last date;my_rank integer;other record;legacy_end boolean:=false;
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
   IF NEW.ends_on IS DISTINCT FROM OLD.ends_on AND NEW.ends_at IS NOT DISTINCT FROM OLD.ends_at THEN NEW.ends_at=(NEW.ends_on+1)::timestamp AT TIME ZONE 'Asia/Manila';legacy_end=true;END IF;
  ELSIF NEW.ends_at IS NULL AND NEW.ends_on IS NOT NULL THEN NEW.ends_at=(NEW.ends_on+1)::timestamp AT TIME ZONE 'Asia/Manila';legacy_end=true;END IF;
  NEW.starts_on=(NEW.starts_at AT TIME ZONE 'Asia/Manila')::date;
  IF NEW.ends_at IS NULL THEN NEW.ends_on=NULL;
  ELSIF legacy_end THEN NEW.ends_on=((NEW.ends_at-interval '1 microsecond') AT TIME ZONE 'Asia/Manila')::date;
  ELSIF TG_OP='INSERT' THEN NEW.ends_on=(NEW.ends_at AT TIME ZONE 'Asia/Manila')::date;
  ELSIF NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.ends_on IS NULL THEN NEW.ends_on=(NEW.ends_at AT TIME ZONE 'Asia/Manila')::date;END IF;
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

 first_day=make_date(NEW.start_year,1,1);last_day=make_date(NEW.start_year+1,12,31);
 IF NEW.schedule_enabled THEN
  IF NEW.starts_at IS NULL OR (NEW.starts_at AT TIME ZONE 'Asia/Manila')::date<first_day OR (NEW.starts_at AT TIME ZONE 'Asia/Manila')::date>last_day OR (NEW.ends_on>last_day) OR (NEW.ends_at IS NOT NULL AND NEW.ends_at>((last_day+1)::timestamp AT TIME ZONE 'Asia/Manila')) THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='assessment_schedule_school_year',MESSAGE='Choose start and stop dates within the selected school year.';
  END IF;
 END IF;
 IF NEW.schedule_enabled AND (NEW.starts_at AT TIME ZONE 'Asia/Manila')::date<(moment AT TIME ZONE 'Asia/Manila')::date THEN
  IF TG_OP='INSERT' THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='assessment_schedule_start_not_past',MESSAGE='Choose a start date on or after today.';
  ELSIF NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='assessment_schedule_start_not_past',MESSAGE='Choose a start date on or after today.';
  END IF;
 END IF;
 IF NEW.schedule_enabled THEN
  my_first=(NEW.starts_at AT TIME ZONE 'Asia/Manila')::date;
  my_last=CASE WHEN NEW.ends_at IS NULL THEN last_day ELSE NEW.ends_on END;
  my_rank=array_position(ARRAY['BoSY','MoSY','EoSY'],NEW.period::text);
  FOR other IN SELECT a.period,(a.starts_at AT TIME ZONE 'Asia/Manila')::date AS first_date,coalesce(a.ends_on,last_day) AS last_date FROM public.school_assessments a WHERE a.school_id=NEW.school_id AND a.start_year=NEW.start_year AND a.id<>NEW.id AND a.schedule_enabled LOOP
   IF my_first<=other.last_date AND other.first_date<=my_last THEN RAISE EXCEPTION USING ERRCODE='23P01',CONSTRAINT='school_timeline_calendar_no_overlap',MESSAGE='These calendar days are reserved for another timeline.';END IF;
   IF (my_rank>array_position(ARRAY['BoSY','MoSY','EoSY'],other.period::text) AND my_first<=other.last_date) OR (my_rank<array_position(ARRAY['BoSY','MoSY','EoSY'],other.period::text) AND my_last>=other.first_date) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='school_timeline_calendar_order',MESSAGE='Keep timeline dates in BoSY, MoSY, EoSY order.';END IF;
  END LOOP;
 END IF;
 IF NEW.is_live AND EXISTS(SELECT 1 FROM public.school_assessments a WHERE a.school_id=NEW.school_id AND a.id<>NEW.id AND a.is_live) THEN RAISE EXCEPTION USING ERRCODE='23505',CONSTRAINT='one_live_assessment_per_school',MESSAGE='Only one timeline can be live at a time. Pause the live timeline first.';END IF;
 IF TG_OP='UPDATE' AND (NEW.is_live IS DISTINCT FROM OLD.is_live OR NEW.schedule_enabled IS DISTINCT FROM OLD.schedule_enabled OR NEW.schedule_paused IS DISTINCT FROM OLD.schedule_paused OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at) THEN
  IF NEW.revision=OLD.revision THEN NEW.revision=OLD.revision+1;END IF;NEW.updated_at=moment;
 END IF;RETURN NEW;
END;$function$;
CREATE UNIQUE INDEX IF NOT EXISTS one_live_assessment_per_school ON public.school_assessments (school_id) WHERE is_live;
-- Retain the older per-year index for compatibility; the school index is stronger.
REVOKE ALL ON FUNCTION crl_private.sync_assessment_schedule_state() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crl_private.refresh_assessment_schedules() FROM PUBLIC,anon,authenticated,crl_school;
REVOKE ALL ON FUNCTION crl_private.refresh_current_school_assessment_schedules() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION crl_private.refresh_current_school_assessment_schedules() TO crl_school;
COMMIT;
