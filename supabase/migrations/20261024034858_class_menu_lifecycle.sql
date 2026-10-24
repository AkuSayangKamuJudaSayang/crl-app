-- Additive lifecycle metadata. Deleted class IDs remain tombstones, while
-- retained ClassArchive snapshots stay independent of the source enrollment.
ALTER TABLE public.school_years ADD COLUMN archived_at timestamp, ADD COLUMN deleted_at timestamp;
ALTER TABLE public.class_sections ADD COLUMN deleted_at timestamp;
CREATE UNIQUE INDEX school_years_active_year_key ON public.school_years(teacher_id,start_year) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX class_sections_active_name_key ON public.class_sections(school_year_id,name_key) WHERE deleted_at IS NULL;
CREATE INDEX school_years_teacher_id_start_year_idx ON public.school_years(teacher_id,start_year);
CREATE INDEX class_sections_school_year_id_name_key_idx ON public.class_sections(school_year_id,name_key);
CREATE OR REPLACE FUNCTION public.assign_legacy_learner_class() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE year_id uuid; section_id uuid; display_name text;
BEGIN
  IF NEW.class_section_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE id=NEW.teacher_id AND learner_data_version>0) THEN
      RAISE EXCEPTION 'Refresh the application after the roster reset' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.school_years(teacher_id,start_year,label) VALUES(NEW.teacher_id,2026,'2026-2027')
    ON CONFLICT(teacher_id,start_year) WHERE deleted_at IS NULL DO UPDATE SET label=EXCLUDED.label RETURNING id INTO year_id;
    display_name := coalesce(nullif(btrim(NEW.section),''),'Unassigned');
    INSERT INTO public.class_sections(teacher_id,school_year_id,name,name_key) VALUES(NEW.teacher_id,year_id,display_name,lower(display_name))
    ON CONFLICT(school_year_id,name_key) WHERE deleted_at IS NULL DO UPDATE SET name=public.class_sections.name RETURNING id INTO section_id;
    NEW.class_section_id := section_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.class_sections c JOIN public.school_years y ON y.id=c.school_year_id AND y.teacher_id=c.teacher_id WHERE c.id=NEW.class_section_id AND c.teacher_id=NEW.teacher_id AND c.deleted_at IS NULL AND c.archived_at IS NULL AND y.deleted_at IS NULL AND y.archived_at IS NULL) THEN
    RAISE EXCEPTION 'Choose an active school year and section' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.assign_legacy_learner_class() FROM PUBLIC,anon,authenticated;
