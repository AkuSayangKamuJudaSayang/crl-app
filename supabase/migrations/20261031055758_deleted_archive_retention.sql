-- Additive rollout. Deletion archives expire; manually archived records do not.
ALTER TABLE public.class_archives
  ADD COLUMN IF NOT EXISTS deleted_at timestamp(3),
  ADD COLUMN IF NOT EXISTS expires_at timestamp(3),
  ADD COLUMN IF NOT EXISTS purged_at timestamp(3),
  ADD COLUMN IF NOT EXISTS member_archive_ids uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS class_archives_expires_at_idx ON public.class_archives(expires_at);
-- Existing deleted sources retain their original deletion date; no clock reset.
UPDATE public.class_archives a SET deleted_at = COALESCE(
  (SELECT s.deleted_at FROM public.class_sections s WHERE s.id=a.source_section_id AND s.teacher_id=a.teacher_id),
  (SELECT y.deleted_at FROM public.school_years y WHERE y.id=a.source_school_year_id AND y.teacher_id=a.teacher_id),
  CASE WHEN a.kind='learner' THEN a.created_at END)
WHERE a.deleted_at IS NULL;
UPDATE public.class_archives SET expires_at=deleted_at+interval '30 days'
WHERE deleted_at IS NOT NULL AND expires_at IS NULL;
ALTER TABLE public.class_archives ADD CONSTRAINT class_archives_retention_check
CHECK ((deleted_at IS NULL AND expires_at IS NULL AND purged_at IS NULL)
    OR (deleted_at IS NOT NULL AND expires_at=deleted_at+interval '30 days'));
-- Keep only minimal retry/restore receipts after erasing the actual archive.
-- No new Data API privileges or RLS policies are granted.
CREATE SCHEMA IF NOT EXISTS crl_private;
REVOKE ALL ON SCHEMA crl_private FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION crl_private.expire_deleted_archives()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE ids uuid[]; removed integer;
BEGIN
  SELECT array_agg(id) INTO ids FROM (
    SELECT id FROM public.class_archives
    WHERE expires_at <= timezone('UTC',clock_timestamp()) AND purged_at IS NULL
    ORDER BY expires_at,id LIMIT 500 FOR UPDATE SKIP LOCKED
  ) due;
  IF ids IS NULL THEN RETURN 0; END IF;
  UPDATE public.class_archives SET purged_at=timezone('UTC',clock_timestamp()),
    encrypted_snapshot='',learner_name=CASE WHEN kind='learner' THEN '' ELSE NULL END,
    section_name='',school_year_label=''
  WHERE id=ANY(ids);
  GET DIAGNOSTICS removed=ROW_COUNT;
  DELETE FROM public.admin_recovery_items WHERE id=ANY(ids);
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION crl_private.expire_deleted_archives() FROM PUBLIC, anon, authenticated;
-- Compatibility with a still-open older client during rollout.
CREATE OR REPLACE FUNCTION crl_private.mark_deleted_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.kind='learner' AND NEW.deleted_at IS NULL THEN NEW.deleted_at=NEW.created_at; END IF;
  IF NEW.deleted_at IS NOT NULL THEN NEW.expires_at=NEW.deleted_at+interval '30 days'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION crl_private.mark_deleted_archive() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER class_archives_set_retention BEFORE INSERT OR UPDATE OF deleted_at
ON public.class_archives FOR EACH ROW EXECUTE FUNCTION crl_private.mark_deleted_archive();
CREATE OR REPLACE FUNCTION crl_private.mark_deleted_class_archives()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF TG_TABLE_NAME='class_sections' THEN
      UPDATE public.class_archives SET deleted_at=NEW.deleted_at
      WHERE teacher_id=NEW.teacher_id AND source_section_id=NEW.id AND deleted_at IS NULL;
    ELSE
      UPDATE public.class_archives SET deleted_at=NEW.deleted_at
      WHERE teacher_id=NEW.teacher_id AND source_school_year_id=NEW.id AND deleted_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION crl_private.mark_deleted_class_archives() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER class_sections_mark_archive_retention AFTER UPDATE OF deleted_at
ON public.class_sections FOR EACH ROW EXECUTE FUNCTION crl_private.mark_deleted_class_archives();
CREATE TRIGGER school_years_mark_archive_retention AFTER UPDATE OF deleted_at
ON public.school_years FOR EACH ROW EXECUTE FUNCTION crl_private.mark_deleted_class_archives();
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('crl-expire-deleted-archives','* * * * *',
  'SELECT crl_private.expire_deleted_archives();');
