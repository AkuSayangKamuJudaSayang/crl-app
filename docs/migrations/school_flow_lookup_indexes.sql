BEGIN;
CREATE INDEX school_sections_year_idx ON public.school_sections(school_id,start_year);
CREATE INDEX school_assessments_creator_idx ON public.school_assessments(created_by);
CREATE INDEX school_assessments_catalog_idx ON public.school_assessments(school_id,catalog_revision_id);
COMMIT;
