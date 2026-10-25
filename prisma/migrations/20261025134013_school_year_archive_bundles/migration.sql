-- Retained source identifiers are metadata, not cascading foreign keys.
ALTER TABLE public.class_archives
  ALTER COLUMN source_section_id DROP NOT NULL,
  ADD COLUMN source_school_year_id uuid,
  ADD COLUMN section_count integer;
ALTER TABLE public.school_years ADD COLUMN restored_archive_id uuid;

ALTER TABLE public.class_archives DROP CONSTRAINT class_archives_kind_check;
ALTER TABLE public.class_archives ADD CONSTRAINT class_archives_kind_check CHECK (
  (kind = 'section' AND source_section_id IS NOT NULL AND source_school_year_id IS NULL AND section_count IS NULL AND source_learner_id IS NULL AND learner_name IS NULL)
  OR (kind = 'learner' AND source_section_id IS NOT NULL AND source_school_year_id IS NULL AND section_count IS NULL AND source_learner_id IS NOT NULL AND learner_name IS NOT NULL AND learner_count = 1)
  OR (kind = 'school_year' AND source_section_id IS NULL AND source_school_year_id IS NOT NULL AND section_count IS NOT NULL AND section_count >= 0 AND source_learner_id IS NULL AND learner_name IS NULL)
);
CREATE UNIQUE INDEX class_archives_school_year_key
  ON public.class_archives (teacher_id, source_school_year_id) WHERE kind = 'school_year';
