-- Serialize catalog publication with newly registered assessment starts.
-- Existing materials, attempts and snapshots are not rewritten. RLS/grants stay intact.
CREATE OR REPLACE FUNCTION public.crl_guard_library_during_assessment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(177631, 1);
  IF EXISTS (SELECT 1 FROM public.host_sessions WHERE ended = false AND assessment_session_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSESSMENT_IN_PROGRESS: Shared assessment contents are locked until all active assessments end.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.crl_order_assessment_start_with_library()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.ended = false AND NEW.assessment_session_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM pg_advisory_xact_lock(177631, 1);
    ELSIF OLD.ended = true OR OLD.assessment_session_id IS NULL THEN
      PERFORM pg_advisory_xact_lock(177631, 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.crl_guard_library_during_assessment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crl_order_assessment_start_with_library() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER crl_library_revisions_active_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.assessment_library_revisions
FOR EACH ROW EXECUTE FUNCTION public.crl_guard_library_during_assessment();
CREATE TRIGGER crl_library_heads_active_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.assessment_library_heads
FOR EACH ROW EXECUTE FUNCTION public.crl_guard_library_during_assessment();
CREATE TRIGGER crl_host_library_start_order
BEFORE INSERT OR UPDATE OF ended, assessment_session_id ON public.host_sessions
FOR EACH ROW EXECUTE FUNCTION public.crl_order_assessment_start_with_library();
;
