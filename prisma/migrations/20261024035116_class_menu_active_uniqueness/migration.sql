-- Finalize after the class-menu application release is READY.
-- Retained tombstone IDs cannot block a fresh active class with the same name.
ALTER TABLE public.school_years DROP CONSTRAINT school_years_teacher_id_start_year_key;
ALTER TABLE public.class_sections DROP CONSTRAINT class_sections_school_year_id_name_key_key;
