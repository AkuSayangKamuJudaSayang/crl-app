-- Already applied: CRL-2026-11-03.1 Recovery paging and fresh backup after purge.
CREATE INDEX class_archives_recovery_page_idx ON public.class_archives(created_at DESC,id DESC) WHERE purged_at IS NULL;
DROP INDEX public.class_archives_school_year_key;
CREATE UNIQUE INDEX class_archives_school_year_key ON public.class_archives(teacher_id,source_school_year_id) WHERE kind='school_year' AND purged_at IS NULL;
