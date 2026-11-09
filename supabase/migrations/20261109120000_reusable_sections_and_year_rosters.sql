BEGIN;

-- A section definition belongs to the school, not to one school year.
-- Existing class assignments keep their school_year_id and historical records.
ALTER TABLE public.school_sections
  DROP COLUMN IF EXISTS start_year;

ALTER TABLE public.school_sections
  ADD COLUMN IF NOT EXISTS recovery_assignments jsonb;

-- The same learner can be enrolled in multiple school years. Uniqueness is
-- retained within a class through learners(class_section_id, lrn).
DROP INDEX IF EXISTS public.learners_teacher_lrn_key;
DROP INDEX IF EXISTS public.learners_teacher_name_key;

COMMIT;
