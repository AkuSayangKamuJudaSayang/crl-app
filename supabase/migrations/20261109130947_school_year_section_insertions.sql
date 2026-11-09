BEGIN;

CREATE TABLE public.school_year_section_insertions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id varchar(6) NOT NULL,
  school_section_id uuid NOT NULL,
  start_year integer NOT NULL,
  included_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  UNIQUE (school_section_id, start_year),
  FOREIGN KEY (school_id, school_section_id)
    REFERENCES public.school_sections (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, start_year)
    REFERENCES public.global_school_years (school_id, start_year) ON DELETE CASCADE,
  CHECK (removed_at IS NULL OR removed_at >= included_at)
);

CREATE INDEX school_year_section_insertions_year_idx
  ON public.school_year_section_insertions (school_id, start_year, removed_at);

ALTER TABLE public.school_year_section_insertions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_year_section_insertions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.school_year_section_insertions TO crl_school;

CREATE POLICY school_boundary
  ON public.school_year_section_insertions TO crl_school
  USING (school_id = current_setting('crl.school_id', true))
  WITH CHECK (school_id = current_setting('crl.school_id', true));

INSERT INTO public.school_year_section_insertions (
  school_id,
  school_section_id,
  start_year,
  included_at,
  removed_at
)
SELECT DISTINCT ON (class.school_section_id, year.start_year)
  section.school_id,
  class.school_section_id,
  year.start_year,
  class.created_at,
  CASE
    WHEN class.unassigned_at IS NOT NULL
      THEN GREATEST(class.unassigned_at, class.created_at)
    ELSE NULL
  END
FROM public.class_sections AS class
JOIN public.school_years AS year
  ON year.id = class.school_year_id
 AND year.teacher_id = class.teacher_id
JOIN public.school_sections AS section
  ON section.id = class.school_section_id
WHERE class.deleted_at IS NULL
  AND year.deleted_at IS NULL
  AND class.school_section_id IS NOT NULL
ORDER BY class.school_section_id, year.start_year, class.created_at DESC
ON CONFLICT (school_section_id, start_year) DO NOTHING;

COMMIT;
