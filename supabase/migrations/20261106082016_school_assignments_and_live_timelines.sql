-- CRL-2026-11-06.4: school-owned administrators, section settings and live timelines.
-- Preserves existing teacher ownership, enrollments, results and offline journals.
BEGIN;
SELECT pg_advisory_xact_lock(177631,3);
CREATE TEMP TABLE crl64_preserved AS SELECT (SELECT count(*) FROM public.learners) learners,(SELECT count(*) FROM public.assessment_sessions) assessments,(SELECT count(*) FROM public.class_archives) archives;
UPDATE public.users SET school_id='418726',school_name=(SELECT name FROM public.schools WHERE id='418726'),admin_session_version=admin_session_version+1 WHERE role='admin' AND school_id IS NULL;
ALTER TABLE public.users ADD CONSTRAINT users_all_roles_school_required CHECK(school_id IS NOT NULL);
CREATE UNIQUE INDEX users_one_admin_per_school ON public.users(school_id) WHERE role='admin';
INSERT INTO public.users(username,email,password_hash,full_name,first_name,last_name,role,school_id,school_name,is_active,two_factor_enabled) VALUES ('bayani.admin','bayani.admin@crl-demo.example','$2b$12$XD5bpqw6MYeiGg2UHz4k2eDiyLRblA6wLyydh8phla4lGrUjp0f52','Celina Ramos','Celina','Ramos','admin','573914','Bayani Elementary School',true,false),('silangan.admin','silangan.admin@crl-demo.example','$2b$12$isS8.Enz0Bhe.6jMk.4L.OANASDTYBBlid9lc7q03/UJByYJgpTwS','Marco Dela Cruz','Marco','Dela Cruz','admin','826305','Silangan Integrated School',true,false);
CREATE TABLE public.school_sections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id varchar(6) NOT NULL,
 start_year integer NOT NULL, name varchar(50) NOT NULL, name_key varchar(50) NOT NULL,
 deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id), FOREIGN KEY(school_id,start_year) REFERENCES public.global_school_years(school_id,start_year),
 CHECK(length(trim(name)) BETWEEN 1 AND 50),CHECK(name_key=lower(trim(name)))
);
CREATE UNIQUE INDEX school_sections_active_name ON public.school_sections(school_id,start_year,name_key) WHERE deleted_at IS NULL;
ALTER TABLE public.class_sections ADD COLUMN school_section_id uuid REFERENCES public.school_sections(id);
INSERT INTO public.school_sections(id,school_id,start_year,name,name_key)
 SELECT c.id,y.school_id,y.start_year,c.name,c.name_key FROM public.class_sections c JOIN public.school_years y ON y.id=c.school_year_id WHERE c.deleted_at IS NULL AND y.deleted_at IS NULL;
UPDATE public.class_sections c SET school_section_id=c.id WHERE EXISTS(SELECT 1 FROM public.school_sections s WHERE s.id=c.id);
CREATE UNIQUE INDEX class_sections_one_assignment ON public.class_sections(school_section_id) WHERE school_section_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX class_sections_school_section_id_idx ON public.class_sections(school_section_id);
CREATE TABLE public.school_assessments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id varchar(6) NOT NULL,start_year integer NOT NULL,
 period public."AssessmentPeriod" NOT NULL,is_live boolean NOT NULL DEFAULT false,revision integer NOT NULL DEFAULT 1,
 catalog_revision_id uuid NOT NULL,created_by integer NOT NULL REFERENCES public.users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,start_year,period),FOREIGN KEY(school_id,start_year) REFERENCES public.global_school_years(school_id,start_year),
 FOREIGN KEY(school_id,catalog_revision_id) REFERENCES public.assessment_library_revisions(school_id,id)
);
CREATE INDEX school_assessments_year_live_idx ON public.school_assessments(school_id,start_year,is_live);
ALTER TABLE public.school_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_sections,public.school_assessments FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.school_sections,public.school_assessments TO crl_school;
CREATE POLICY school_boundary ON public.school_sections TO crl_school USING(school_id=current_setting('crl.school_id',true)) WITH CHECK(school_id=current_setting('crl.school_id',true));
CREATE POLICY school_boundary ON public.school_assessments TO crl_school USING(school_id=current_setting('crl.school_id',true)) WITH CHECK(school_id=current_setting('crl.school_id',true));
CREATE FUNCTION crl_private.guard_section_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.school_section_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.school_sections d JOIN public.school_years y ON y.school_id=d.school_id AND y.start_year=d.start_year WHERE d.id=NEW.school_section_id AND y.id=NEW.school_year_id AND y.teacher_id=NEW.teacher_id AND d.deleted_at IS NULL) THEN RAISE EXCEPTION 'Section and teacher must belong to the same school year and school';END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION crl_private.guard_section_assignment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crl_private.guard_section_assignment() TO crl_school;
CREATE TRIGGER class_section_assignment_boundary BEFORE INSERT OR UPDATE OF school_section_id,school_year_id,teacher_id ON public.class_sections FOR EACH ROW EXECUTE FUNCTION crl_private.guard_section_assignment();
CREATE OR REPLACE FUNCTION crl_private.guard_school_invitation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE issuer public.users;
BEGIN
 SELECT * INTO issuer FROM public.users WHERE id=NEW.generated_by;
 IF issuer.id IS NULL OR NOT issuer.is_active OR NEW.school_id IS DISTINCT FROM issuer.school_id THEN RAISE EXCEPTION 'Invitations must belong to their issuer school';END IF;
 IF NEW.invite_role='teacher' AND issuer.role='reading_coordinator' THEN RETURN NEW;END IF;
 IF NEW.invite_role='reading_coordinator' AND issuer.role='admin' THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'This account cannot issue that invitation role';
END;$$;
INSERT INTO public.system_state(key,value) VALUES('school_flow_cutover',extract(epoch from now())::bigint::text) ON CONFLICT(key) DO NOTHING;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM crl64_preserved p WHERE p.learners<>(SELECT count(*) FROM public.learners) OR p.assessments<>(SELECT count(*) FROM public.assessment_sessions) OR p.archives<>(SELECT count(*) FROM public.class_archives)) THEN RAISE EXCEPTION 'Existing record preservation check failed'; END IF;END;$$;
COMMIT;
