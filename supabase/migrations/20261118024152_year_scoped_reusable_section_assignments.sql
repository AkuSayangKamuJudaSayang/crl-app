BEGIN;
SET LOCAL lock_timeout = '5s';

-- The calendar year is shared by teachers, while school_year_id is teacher-owned.
ALTER TABLE public.class_sections ADD COLUMN assignment_start_year integer;

UPDATE public.class_sections AS section
SET assignment_start_year = school_year.start_year
FROM public.school_years AS school_year
WHERE section.school_year_id = school_year.id AND section.school_section_id IS NOT NULL;

ALTER TABLE public.school_years ADD CONSTRAINT school_years_id_start_year_key
  UNIQUE (id, start_year);
ALTER TABLE public.class_sections
  ADD CONSTRAINT class_sections_assignment_year_required
    CHECK ((school_section_id IS NULL) = (assignment_start_year IS NULL)),
  ADD CONSTRAINT class_sections_assignment_year_fkey
    FOREIGN KEY (school_year_id, assignment_start_year)
    REFERENCES public.school_years (id, start_year) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION crl_private.guard_section_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  NEW.assignment_start_year := NULL;
  IF NEW.school_section_id IS NOT NULL THEN
    SELECT school_year.start_year INTO NEW.assignment_start_year
    FROM public.school_sections AS definition
    JOIN public.school_years AS school_year
      ON school_year.id = NEW.school_year_id
     AND school_year.teacher_id = NEW.teacher_id
     AND school_year.school_id = definition.school_id
    WHERE definition.id = NEW.school_section_id AND definition.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Section and teacher must belong to the same school';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE TRIGGER class_section_assignment_boundary
BEFORE INSERT OR UPDATE OF school_section_id, school_year_id, teacher_id, assignment_start_year
ON public.class_sections FOR EACH ROW EXECUTE FUNCTION crl_private.guard_section_assignment();

CREATE UNIQUE INDEX class_sections_one_assignment_per_year
  ON public.class_sections (school_section_id, assignment_start_year)
  WHERE school_section_id IS NOT NULL AND deleted_at IS NULL;
DROP INDEX IF EXISTS public.class_sections_one_assignment;

COMMIT;
