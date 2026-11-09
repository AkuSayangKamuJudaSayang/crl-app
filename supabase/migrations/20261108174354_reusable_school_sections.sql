-- Preserve every existing class, enrollment ID and assessment. Catalog rows are
-- reusable definitions; school_sections remain separate school-year assignments.
CREATE TABLE public.school_section_catalog (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id varchar(6) NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 name varchar(50) NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 50),
 name_key varchar(50) NOT NULL CHECK (name_key=lower(btrim(name))),
 deleted_at timestamptz,
 expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),
 CHECK ((deleted_at IS NULL AND expires_at IS NULL) OR
        (deleted_at IS NOT NULL AND expires_at>deleted_at))
);
CREATE UNIQUE INDEX school_section_catalog_active_name ON public.school_section_catalog(school_id,name_key) WHERE deleted_at IS NULL;
CREATE INDEX school_section_catalog_expiry ON public.school_section_catalog(expires_at) WHERE deleted_at IS NOT NULL;
ALTER TABLE public.school_section_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_section_catalog FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.school_section_catalog TO crl_school;
CREATE POLICY school_boundary ON public.school_section_catalog TO crl_school
 USING(school_id=current_setting('crl.school_id',true))
 WITH CHECK(school_id=current_setting('crl.school_id',true));
ALTER TABLE public.school_sections ADD COLUMN catalog_id uuid;
ALTER TABLE public.school_sections ADD CONSTRAINT school_sections_catalog_school_fkey
 FOREIGN KEY(school_id,catalog_id) REFERENCES public.school_section_catalog(school_id,id) ON DELETE RESTRICT;
CREATE INDEX school_sections_catalog_idx ON public.school_sections(catalog_id,start_year);
CREATE UNIQUE INDEX school_sections_active_catalog_year ON public.school_sections(school_id,catalog_id,start_year) WHERE deleted_at IS NULL;
INSERT INTO public.school_section_catalog(school_id,name,name_key)
 SELECT DISTINCT ON(school_id,name_key) school_id,name,name_key
 FROM public.school_sections WHERE deleted_at IS NULL
 ORDER BY school_id,name_key,start_year DESC,created_at DESC,id;
UPDATE public.school_sections s SET catalog_id=c.id
 FROM public.school_section_catalog c
 WHERE s.school_id=c.school_id AND s.name_key=c.name_key AND s.deleted_at IS NULL;

-- A learner is enrolled independently in each owned school year. Derive the
-- year from the verified class, including for legacy clients and offline replay.
ALTER TABLE public.learners ADD COLUMN school_year_id uuid;
UPDATE public.learners l SET school_year_id=c.school_year_id FROM public.class_sections c WHERE c.id=l.class_section_id AND c.teacher_id=l.teacher_id;
ALTER TABLE public.learners ALTER COLUMN school_year_id SET NOT NULL;
ALTER TABLE public.class_sections ADD CONSTRAINT class_sections_id_teacher_year_key UNIQUE(id,teacher_id,school_year_id);
ALTER TABLE public.learners ADD CONSTRAINT learners_class_year_owner_fkey
 FOREIGN KEY(class_section_id,teacher_id,school_year_id) REFERENCES public.class_sections(id,teacher_id,school_year_id) ON DELETE CASCADE;
ALTER TABLE public.learners DROP CONSTRAINT learners_class_owner_fkey;
CREATE FUNCTION crl_private.derive_learner_school_year() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target_year uuid;
BEGIN
 SELECT school_year_id INTO target_year FROM public.class_sections WHERE id=NEW.class_section_id AND teacher_id=NEW.teacher_id;
 IF target_year IS NULL THEN RAISE EXCEPTION 'Choose an owned class for this enrollment'; END IF;
 IF NEW.school_year_id IS NOT NULL AND NEW.school_year_id<>target_year THEN RAISE EXCEPTION 'Enrollment year does not match its class'; END IF;
 NEW.school_year_id:=target_year;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION crl_private.derive_learner_school_year() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION crl_private.derive_learner_school_year() TO crl_school;
CREATE TRIGGER learners_school_year BEFORE INSERT OR UPDATE OF class_section_id,teacher_id,school_year_id ON public.learners FOR EACH ROW EXECUTE FUNCTION crl_private.derive_learner_school_year();
DROP INDEX public.learners_teacher_lrn_key;
DROP INDEX public.learners_teacher_name_key;
CREATE UNIQUE INDEX learners_teacher_year_lrn_key ON public.learners(teacher_id,school_year_id,lrn);
CREATE UNIQUE INDEX learners_teacher_year_name_key ON public.learners(teacher_id,school_year_id,(lower(regexp_replace(btrim(normalize(coalesce(first_name,'') || ' ' || coalesce(middle_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(suffix,''), NFKC)), '\s+', ' ', 'g'))));
