BEGIN;

ALTER TABLE public.school_sections
  DROP COLUMN IF EXISTS start_year;

ALTER TABLE public.school_sections
  ADD COLUMN IF NOT EXISTS recovery_assignments jsonb;

DROP INDEX IF EXISTS public.learners_teacher_lrn_key;
DROP INDEX IF EXISTS public.learners_teacher_name_key;

COMMIT;
