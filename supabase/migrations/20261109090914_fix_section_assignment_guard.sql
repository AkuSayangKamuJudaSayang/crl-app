CREATE OR REPLACE FUNCTION crl_private.guard_section_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.school_section_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.school_sections d
    JOIN public.school_years y
      ON y.id = NEW.school_year_id
     AND y.teacher_id = NEW.teacher_id
     AND y.school_id = d.school_id
    WHERE d.id = NEW.school_section_id
      AND d.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Section and teacher must belong to the same school';
  END IF;
  RETURN NEW;
END;
$function$;
