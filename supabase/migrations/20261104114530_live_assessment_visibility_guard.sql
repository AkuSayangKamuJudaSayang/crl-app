-- One server-clock predicate for database guards, admin status and live views.
-- Fresh checkpoints still represent a conducting/reconnecting teacher. An idle
-- or abandoned browser cannot hold the library beyond the bounded activity lease.
CREATE OR REPLACE FUNCTION public.crl_live_assessment_hosts()
RETURNS TABLE(host_id integer) LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,public AS $$
 SELECT h.id FROM public.host_sessions h
 LEFT JOIN public.assessment_presence p ON p.host_session_id=h.id
 WHERE NOT h.ended AND h.assessment_session_id IS NOT NULL
 AND h.stage NOT IN ('ended','completed','terminated')
 AND (p.teacher_seen_at>statement_timestamp()-interval '30 seconds'
      OR (p.host_session_id IS NULL AND h.created_at>statement_timestamp()-interval '30 seconds'));
$$;
CREATE OR REPLACE FUNCTION public.crl_library_has_live_assessment()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.crl_live_assessment_hosts());
$$;
REVOKE ALL ON FUNCTION public.crl_live_assessment_hosts() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crl_library_has_live_assessment() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.crl_order_teacher_activity_with_library()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(177631,1);
 IF NOT EXISTS(SELECT 1 FROM public.host_sessions h WHERE h.id=NEW.host_session_id AND NOT h.ended) THEN RETURN NULL; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.crl_order_teacher_activity_with_library() FROM PUBLIC,anon,authenticated;
