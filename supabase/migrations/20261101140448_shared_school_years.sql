-- CRL-2026-11-01.3: shared definitions; existing owned IDs and evidence remain.
CREATE TABLE public.global_school_years (
 start_year integer PRIMARY KEY CHECK (start_year BETWEEN 2000 AND 2100),
 label varchar(9) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.global_school_years(start_year,label)
 SELECT DISTINCT start_year, start_year::text||'-'||(start_year+1)::text FROM public.school_years;
ALTER TABLE public.school_years ADD CONSTRAINT school_years_global_definition_fkey
 FOREIGN KEY(start_year) REFERENCES public.global_school_years(start_year) ON DELETE RESTRICT;
ALTER TABLE public.global_school_years ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.global_school_years FROM PUBLIC,anon,authenticated;
CREATE SCHEMA IF NOT EXISTS crl_private;
REVOKE ALL ON SCHEMA crl_private FROM PUBLIC,anon,authenticated;
CREATE FUNCTION crl_private.provision_global_school_year() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(177631,3);
 IF TG_TABLE_NAME='global_school_years' THEN
  INSERT INTO public.school_years(id,teacher_id,start_year,label,created_at)
  SELECT gen_random_uuid(),u.id,NEW.start_year,NEW.label,now() FROM public.users u
  WHERE u.role='teacher' AND NOT EXISTS (SELECT 1 FROM public.school_years y WHERE y.teacher_id=u.id AND y.start_year=NEW.start_year AND y.deleted_at IS NULL);
 ELSIF NEW.role='teacher' THEN
  INSERT INTO public.school_years(id,teacher_id,start_year,label,created_at)
  SELECT gen_random_uuid(),NEW.id,g.start_year,g.label,now() FROM public.global_school_years g
  WHERE NOT EXISTS (SELECT 1 FROM public.school_years y WHERE y.teacher_id=NEW.id AND y.start_year=g.start_year AND y.deleted_at IS NULL);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION crl_private.provision_global_school_year() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER provision_year_for_all_teachers AFTER INSERT ON public.global_school_years
 FOR EACH ROW EXECUTE FUNCTION crl_private.provision_global_school_year();
CREATE TRIGGER provision_years_for_new_teacher AFTER INSERT ON public.users
 FOR EACH ROW EXECUTE FUNCTION crl_private.provision_global_school_year();
INSERT INTO public.school_years(id,teacher_id,start_year,label,created_at)
 SELECT gen_random_uuid(),u.id,g.start_year,g.label,now() FROM public.users u
 CROSS JOIN public.global_school_years g WHERE u.role='teacher'
 AND NOT EXISTS (SELECT 1 FROM public.school_years y WHERE y.teacher_id=u.id AND y.start_year=g.start_year AND y.deleted_at IS NULL);
-- Keep retired window/review tables and old grants for recovery compatibility.
-- No assessment, learner, archive or immutable content revision is erased.
