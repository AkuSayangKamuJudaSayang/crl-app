-- Per-teacher school years and class enrollment records. Existing evidence is retained.
ALTER TABLE public.users ADD COLUMN learner_data_version integer NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN learner_purge_pending boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN last_learner_purge_at timestamp(3);
CREATE TABLE public.school_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  start_year integer NOT NULL CHECK (start_year BETWEEN 2000 AND 2100),
  label varchar(9) NOT NULL,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT school_years_id_teacher_id_key UNIQUE (id, teacher_id),
  CONSTRAINT school_years_teacher_id_start_year_key UNIQUE (teacher_id, start_year),
  CONSTRAINT school_year_label_check CHECK (label = start_year::text || '-' || (start_year + 1)::text)
);
CREATE TABLE public.class_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_year_id uuid NOT NULL,
  name varchar(50) NOT NULL CHECK (length(btrim(name)) > 0),
  name_key varchar(50) NOT NULL,
  archived_at timestamp(3),
  restored_archive_id uuid,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT class_sections_year_owner_fkey FOREIGN KEY (school_year_id, teacher_id) REFERENCES public.school_years(id, teacher_id) ON DELETE CASCADE,
  CONSTRAINT class_sections_id_teacher_id_key UNIQUE (id, teacher_id),
  CONSTRAINT class_sections_school_year_id_name_key_key UNIQUE (school_year_id, name_key),
  CONSTRAINT class_section_name_key_check CHECK (name_key = lower(name))
);
CREATE INDEX class_sections_teacher_id_school_year_id_idx ON public.class_sections(teacher_id, school_year_id);
CREATE TABLE public.class_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_section_id uuid NOT NULL,
  school_year_label varchar(9) NOT NULL,
  section_name varchar(50) NOT NULL,
  learner_count integer NOT NULL CHECK (learner_count >= 0),
  encrypted_snapshot text NOT NULL,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX class_archives_teacher_id_created_at_idx ON public.class_archives(teacher_id, created_at);
ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_archives ENABLE ROW LEVEL SECURITY;
-- These tables use the authenticated application server's ownership checks.
-- Custom application JWTs are not Supabase Auth identities.
REVOKE ALL ON public.school_years, public.class_sections, public.class_archives FROM PUBLIC, anon, authenticated;
ALTER TABLE public.learners ADD COLUMN class_section_id uuid;
INSERT INTO public.school_years(teacher_id, start_year, label)
SELECT DISTINCT teacher_id, 2026, '2026-2027' FROM public.learners;
INSERT INTO public.class_sections(teacher_id, school_year_id, name, name_key)
SELECT l.teacher_id, sy.id, min(coalesce(nullif(btrim(l.section), ''), 'Unassigned')), lower(coalesce(nullif(btrim(l.section), ''), 'Unassigned'))
FROM public.learners l JOIN public.school_years sy ON sy.teacher_id=l.teacher_id AND sy.start_year=2026
GROUP BY l.teacher_id, sy.id, lower(coalesce(nullif(btrim(l.section), ''), 'Unassigned'));
UPDATE public.learners l SET class_section_id=c.id, section=c.name
FROM public.class_sections c JOIN public.school_years sy ON sy.id=c.school_year_id
WHERE c.teacher_id=l.teacher_id AND sy.start_year=2026
AND c.name_key=lower(coalesce(nullif(btrim(l.section), ''), 'Unassigned'));
ALTER TABLE public.learners ALTER COLUMN class_section_id SET NOT NULL;
ALTER TABLE public.learners ADD CONSTRAINT learners_class_owner_fkey FOREIGN KEY(class_section_id, teacher_id) REFERENCES public.class_sections(id, teacher_id) ON DELETE CASCADE;
ALTER TABLE public.learners DROP CONSTRAINT IF EXISTS learners_lrn_key;
DROP INDEX IF EXISTS public.learners_lrn_key;
CREATE UNIQUE INDEX learners_class_section_id_lrn_key ON public.learners(class_section_id, lrn);
CREATE INDEX learners_class_section_id_teacher_id_idx ON public.learners(class_section_id, teacher_id);
-- Compatibility during rolling deployment: older clients may omit the class.
-- After an authorized roster reset, such stale writes must never recreate it.
CREATE FUNCTION public.assign_legacy_learner_class() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE year_id uuid; section_id uuid; display_name text;
BEGIN
  IF NEW.class_section_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE id=NEW.teacher_id AND learner_data_version>0) THEN
      RAISE EXCEPTION 'Refresh the application after the roster reset' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.school_years(teacher_id,start_year,label) VALUES(NEW.teacher_id,2026,'2026-2027')
    ON CONFLICT(teacher_id,start_year) DO UPDATE SET label=EXCLUDED.label RETURNING id INTO year_id;
    display_name := coalesce(nullif(btrim(NEW.section),''),'Unassigned');
    INSERT INTO public.class_sections(teacher_id,school_year_id,name,name_key) VALUES(NEW.teacher_id,year_id,display_name,lower(display_name))
    ON CONFLICT(school_year_id,name_key) DO UPDATE SET name=public.class_sections.name RETURNING id INTO section_id;
    NEW.class_section_id := section_id;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.assign_legacy_learner_class() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER assign_legacy_learner_class BEFORE INSERT ON public.learners
FOR EACH ROW EXECUTE FUNCTION public.assign_legacy_learner_class();
