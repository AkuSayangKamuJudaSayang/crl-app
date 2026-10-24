-- Apply only after the class-menu application is READY. Create and verify the
-- replacement uniqueness protections in the SAME migration before removing
-- their superseded full-history constraints. No table or learner data is deleted.
CREATE UNIQUE INDEX IF NOT EXISTS school_years_active_year_key
ON public.school_years(teacher_id,start_year) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS class_sections_active_name_key
ON public.class_sections(school_year_id,name_key) WHERE deleted_at IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index i
    WHERE i.indexrelid='public.school_years_active_year_key'::regclass
      AND i.indrelid='public.school_years'::regclass
      AND i.indisunique AND i.indisvalid AND i.indisready
      AND pg_catalog.pg_get_indexdef(i.indexrelid,1,true)='teacher_id'
      AND pg_catalog.pg_get_indexdef(i.indexrelid,2,true)='start_year'
      AND pg_catalog.pg_get_expr(i.indpred,i.indrelid)='(deleted_at IS NULL)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index i
    WHERE i.indexrelid='public.class_sections_active_name_key'::regclass
      AND i.indrelid='public.class_sections'::regclass
      AND i.indisunique AND i.indisvalid AND i.indisready
      AND pg_catalog.pg_get_indexdef(i.indexrelid,1,true)='school_year_id'
      AND pg_catalog.pg_get_indexdef(i.indexrelid,2,true)='name_key'
      AND pg_catalog.pg_get_expr(i.indpred,i.indrelid)='(deleted_at IS NULL)'
  ) THEN
    RAISE EXCEPTION 'Active uniqueness replacement is missing or invalid; constraints are retained';
  END IF;
END; $$;
ALTER TABLE public.school_years DROP CONSTRAINT school_years_teacher_id_start_year_key;
ALTER TABLE public.class_sections DROP CONSTRAINT class_sections_school_year_id_name_key_key;
