-- CRL-2026-11-06.5: preserve deleted section definitions for 30 days.
BEGIN;
ALTER TABLE public.school_sections ADD COLUMN expires_at timestamptz,
 ADD COLUMN recovery_class_id uuid, ADD COLUMN recovery_archive_id uuid;
UPDATE public.school_sections SET expires_at=deleted_at+interval '30 days' WHERE deleted_at IS NOT NULL;
CREATE FUNCTION crl_private.section_retention_dates() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.deleted_at IS NULL THEN NEW.expires_at=NULL;
 ELSIF NEW.expires_at IS NULL THEN NEW.expires_at=NEW.deleted_at+interval '30 days'; END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION crl_private.section_retention_dates() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION crl_private.section_retention_dates() TO crl_school;
CREATE TRIGGER section_retention_dates BEFORE INSERT OR UPDATE OF deleted_at,expires_at ON public.school_sections FOR EACH ROW EXECUTE FUNCTION crl_private.section_retention_dates();
ALTER TABLE public.school_sections ADD CONSTRAINT school_sections_retention_state
 CHECK ((deleted_at IS NULL AND expires_at IS NULL) OR (deleted_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at>deleted_at));
CREATE INDEX school_sections_expiry_idx ON public.school_sections(expires_at) WHERE deleted_at IS NOT NULL;
-- The scheduler owns this private function; app roles cannot invoke or grant it.
CREATE FUNCTION crl_private.expire_school_sections() RETURNS void LANGUAGE plpgsql
 SECURITY INVOKER SET search_path='' AS $$
DECLARE item record;
BEGIN
 PERFORM pg_advisory_xact_lock(177631,3);
 FOR item IN SELECT id FROM public.school_sections WHERE deleted_at IS NOT NULL AND expires_at<=now() FOR UPDATE LOOP
  UPDATE public.class_sections SET school_section_id=NULL WHERE school_section_id=item.id;
  DELETE FROM public.school_sections WHERE id=item.id;
 END LOOP;
END;$$;
REVOKE ALL ON FUNCTION crl_private.expire_school_sections() FROM PUBLIC,anon,authenticated,crl_school;
SELECT cron.schedule('crl-expire-school-sections','* * * * *','SELECT crl_private.expire_school_sections();');
COMMIT;
