-- Activity and recoverability are separate. Never modify answer/result tables.
CREATE OR REPLACE FUNCTION public.crl_library_has_live_assessment()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.host_sessions h LEFT JOIN public.assessment_presence p ON p.host_session_id=h.id
 WHERE NOT h.ended AND h.assessment_session_id IS NOT NULL AND
 ((p.teacher_status='active' AND NOT p.recovering AND p.teacher_seen_at>statement_timestamp()-interval '30 seconds')
 OR (p.host_session_id IS NULL AND h.created_at>statement_timestamp()-interval '30 seconds')));
$$;
CREATE OR REPLACE FUNCTION public.crl_expire_assessment_hosts()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE changed integer;
BEGIN
 PERFORM pg_advisory_xact_lock(177631,1);
 UPDATE public.host_sessions h SET ended=true,stage='ended',linked_at=NULL,current_content='Assessment recovery window expired.',updated_at=statement_timestamp()
 WHERE NOT h.ended AND h.assessment_session_id IS NOT NULL AND
 greatest(h.updated_at,h.created_at,coalesce((SELECT p.teacher_seen_at FROM public.assessment_presence p WHERE p.host_session_id=h.id),h.created_at))<statement_timestamp()-interval '24 hours';
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END;
$$;
CREATE OR REPLACE FUNCTION public.crl_guard_library_during_assessment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(177631,1);
 IF public.crl_library_has_live_assessment() THEN
 RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ASSESSMENT_IN_PROGRESS: Shared assessment contents are locked while an assessment is active.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.crl_order_teacher_activity_with_library()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.teacher_status='active' AND NOT NEW.recovering THEN
 PERFORM pg_advisory_xact_lock(177631,1);
 IF NOT EXISTS(SELECT 1 FROM public.host_sessions h WHERE h.id=NEW.host_session_id AND NOT h.ended) THEN RETURN NULL; END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.crl_library_has_live_assessment() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crl_expire_assessment_hosts() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crl_order_teacher_activity_with_library() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crl_teacher_activity_library_order BEFORE INSERT OR UPDATE ON public.assessment_presence
FOR EACH ROW EXECUTE FUNCTION public.crl_order_teacher_activity_with_library();
