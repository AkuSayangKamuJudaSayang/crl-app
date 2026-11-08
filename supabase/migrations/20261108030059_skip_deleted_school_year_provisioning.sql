-- CRL-2026-11-08.2: do not re-provision a deleted shared school year.
-- Existing owned rows are hidden by the authoritative parent status; no data is erased.
BEGIN;
SELECT pg_advisory_xact_lock(177631,3);
CREATE OR REPLACE FUNCTION crl_private.provision_global_school_year()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 PERFORM pg_advisory_xact_lock(177631,3);
 IF TG_TABLE_NAME='global_school_years' THEN
  IF NEW.deleted_at IS NOT NULL THEN
   -- Deletion must not provision replacements or leave future starts enabled.
   UPDATE public.school_assessments SET is_live=false,schedule_paused=schedule_enabled WHERE school_id=NEW.school_id AND start_year=NEW.start_year;
   RETURN NEW;
  END IF;
  INSERT INTO public.school_years(id,teacher_id,school_id,start_year,label,created_at)
  SELECT gen_random_uuid(),u.id,NEW.school_id,NEW.start_year,NEW.label,now() FROM public.users u
  WHERE u.role='teacher' AND u.school_id=NEW.school_id AND NOT EXISTS(SELECT 1 FROM public.school_years y WHERE y.teacher_id=u.id AND y.start_year=NEW.start_year AND y.deleted_at IS NULL);
 ELSIF NEW.role='teacher' THEN
  INSERT INTO public.school_years(id,teacher_id,school_id,start_year,label,created_at)
  SELECT gen_random_uuid(),NEW.id,NEW.school_id,g.start_year,g.label,now() FROM public.global_school_years g
  WHERE g.school_id=NEW.school_id AND g.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.school_years y WHERE y.teacher_id=NEW.id AND y.start_year=g.start_year AND y.deleted_at IS NULL);
 END IF;
 RETURN NEW;
END;$function$;
REVOKE ALL ON FUNCTION crl_private.provision_global_school_year() FROM PUBLIC,anon,authenticated;
COMMIT;
