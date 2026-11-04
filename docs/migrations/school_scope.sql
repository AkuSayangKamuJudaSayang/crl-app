-- CUTOVER ONLY: run after the separately approved operational-entry reset.
-- No passwords or demo records belong in this migration.
CREATE TABLE public.schools(id varchar(6) PRIMARY KEY CHECK(id~'^[0-9]{6}$'),name varchar(150) NOT NULL,is_active boolean NOT NULL DEFAULT true,created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE public.system_state(key varchar(50) PRIMARY KEY,value text NOT NULL,updated_at timestamp NOT NULL DEFAULT now());
ALTER TABLE public.users ADD COLUMN is_active boolean NOT NULL DEFAULT true,ADD COLUMN coordinator_id integer REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.users ALTER COLUMN school_id TYPE varchar(6);
ALTER TABLE public.users ADD CONSTRAINT users_school_fkey FOREIGN KEY(school_id) REFERENCES public.schools(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX users_school_id_identity ON public.users(school_id,id);
CREATE UNIQUE INDEX users_username_normalized ON public.users(lower(username));
CREATE UNIQUE INDEX users_email_normalized ON public.users(lower(email)) WHERE email IS NOT NULL;
ALTER TABLE public.invite_codes ADD COLUMN school_id varchar(6) REFERENCES public.schools(id),ADD COLUMN invite_role public."UserRole" NOT NULL DEFAULT 'teacher';
ALTER TABLE public.school_years DROP CONSTRAINT school_years_global_definition_fkey;
ALTER TABLE public.global_school_years DROP CONSTRAINT global_school_years_pkey,ADD COLUMN school_id varchar(6) NOT NULL REFERENCES public.schools(id),ADD PRIMARY KEY(school_id,start_year);
ALTER TABLE public.school_years ADD COLUMN school_id varchar(6) NOT NULL REFERENCES public.schools(id),ADD CONSTRAINT school_years_global_definition_fkey FOREIGN KEY(school_id,start_year) REFERENCES public.global_school_years(school_id,start_year),ADD CONSTRAINT school_years_teacher_school_fkey FOREIGN KEY(school_id,teacher_id) REFERENCES public.users(school_id,id);
ALTER TABLE public.assessment_library_heads DROP CONSTRAINT assessment_library_heads_pkey,ADD COLUMN school_id varchar(6) NOT NULL REFERENCES public.schools(id),ADD PRIMARY KEY(school_id,period);
ALTER TABLE public.assessment_library_revisions DROP CONSTRAINT assessment_library_revisions_period_version_key,ADD COLUMN school_id varchar(6) NOT NULL REFERENCES public.schools(id),ADD UNIQUE(school_id,period,version),ADD UNIQUE(school_id,id);
ALTER TABLE public.assessment_library_heads DROP CONSTRAINT assessment_library_heads_revision_id_fkey,ADD CONSTRAINT assessment_library_heads_revision_id_fkey FOREIGN KEY(school_id,revision_id) REFERENCES public.assessment_library_revisions(school_id,id);
ALTER TABLE public.bug_reports ADD COLUMN school_id varchar(6) REFERENCES public.schools(id);
ALTER TABLE public.feedback ADD COLUMN school_id varchar(6) REFERENCES public.schools(id);

CREATE OR REPLACE FUNCTION crl_private.provision_global_school_year() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(177631,3);
 IF TG_TABLE_NAME='global_school_years' THEN
  INSERT INTO public.school_years(id,teacher_id,school_id,start_year,label,created_at)
  SELECT gen_random_uuid(),u.id,NEW.school_id,NEW.start_year,NEW.label,now() FROM public.users u
  WHERE u.role='teacher' AND u.school_id=NEW.school_id AND NOT EXISTS(SELECT 1 FROM public.school_years y WHERE y.teacher_id=u.id AND y.start_year=NEW.start_year AND y.deleted_at IS NULL);
 ELSIF NEW.role='teacher' THEN
  INSERT INTO public.school_years(id,teacher_id,school_id,start_year,label,created_at)
  SELECT gen_random_uuid(),NEW.id,NEW.school_id,g.start_year,g.label,now() FROM public.global_school_years g
  WHERE g.school_id=NEW.school_id AND g.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.school_years y WHERE y.teacher_id=NEW.id AND y.start_year=g.start_year AND y.deleted_at IS NULL);
 END IF;
 RETURN NEW;
END;$$;
CREATE FUNCTION crl_private.guard_account_school() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user='crl_school' THEN
  IF TG_OP='INSERT' AND NEW.role<>'teacher' THEN RAISE EXCEPTION 'Account role change is not permitted'; END IF;
  IF TG_OP='UPDATE' AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.school_id IS DISTINCT FROM OLD.school_id OR NEW.coordinator_id IS DISTINCT FROM OLD.coordinator_id) THEN RAISE EXCEPTION 'Account school/role changes require platform administration'; END IF;
 END IF;
 IF NEW.role IN('teacher','reading_coordinator') AND NEW.school_id IS NULL THEN RAISE EXCEPTION 'An assigned school is required'; END IF;
 IF NEW.role='teacher' AND (NEW.coordinator_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.users c WHERE c.id=NEW.coordinator_id AND c.role='reading_coordinator' AND c.school_id=NEW.school_id)) THEN RAISE EXCEPTION 'The teacher invitation coordinator must belong to the selected school'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER users_school_boundary BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION crl_private.guard_account_school();
CREATE FUNCTION crl_private.guard_content_school() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.catalog_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users u JOIN public.assessment_library_revisions r ON r.school_id=u.school_id WHERE u.id=NEW.teacher_id AND r.id=NEW.catalog_revision_id) THEN RAISE EXCEPTION 'Assessment contents belong to a different school'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER host_catalog_school BEFORE INSERT OR UPDATE OF catalog_revision_id,teacher_id ON public.host_sessions FOR EACH ROW EXECUTE FUNCTION crl_private.guard_content_school();

DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='crl_school') THEN CREATE ROLE crl_school NOLOGIN NOBYPASSRLS; END IF;END$$;
GRANT crl_school TO postgres;
GRANT USAGE ON SCHEMA public,crl_private TO crl_school;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO crl_school;
DO $policies$
DECLARE t text; predicate text;
BEGIN
 FOREACH t IN ARRAY ARRAY['schools','users','invite_codes','global_school_years','school_years','class_sections','learners','host_sessions','assessment_sessions','assessment_presence','letter_task_results','word_task_results','passage_miscues','comprehension_results','session_metrics','assessment_content','assessment_library_heads','assessment_library_revisions','class_archives','admin_audit_events','admin_recovery_items','account_unlock_requests','coordinator_change_requests','bug_reports','feedback','recovery_email_otps'] LOOP
  predicate=CASE
   WHEN t='schools' THEN 'id=current_setting(''crl.school_id'',true)'
   WHEN t IN('users','invite_codes','global_school_years','school_years','assessment_library_heads','assessment_library_revisions','bug_reports','feedback') THEN 'school_id=current_setting(''crl.school_id'',true)'
   WHEN t IN('class_sections','learners','host_sessions','assessment_sessions','assessment_content','class_archives','coordinator_change_requests') THEN 'EXISTS(SELECT 1 FROM public.users u WHERE u.id=teacher_id AND u.school_id=current_setting(''crl.school_id'',true))'
   WHEN t IN('admin_audit_events','admin_recovery_items') THEN 'EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor_id AND u.school_id=current_setting(''crl.school_id'',true))'
   WHEN t='assessment_presence' THEN 'EXISTS(SELECT 1 FROM public.host_sessions h WHERE h.id=host_session_id)'
   WHEN t IN('letter_task_results','word_task_results','passage_miscues','comprehension_results','session_metrics') THEN 'EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=session_id)'
   WHEN t='account_unlock_requests' THEN 'EXISTS(SELECT 1 FROM public.users u WHERE u.id=teacher_id AND u.school_id=current_setting(''crl.school_id'',true))'
   WHEN t='recovery_email_otps' THEN 'EXISTS(SELECT 1 FROM public.users u WHERE u.id=user_id AND u.school_id=current_setting(''crl.school_id'',true))'
  END;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO crl_school',t);
  EXECUTE format('CREATE POLICY crl_school_boundary ON public.%I FOR ALL TO crl_school USING(%s) WITH CHECK(%s)',t,predicate,predicate);
 END LOOP;
END;$policies$;
ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schools,public.system_state FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.security_rate_buckets TO crl_school;
CREATE POLICY crl_school_rate_buckets ON public.security_rate_buckets FOR ALL TO crl_school USING(true) WITH CHECK(true);
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA crl_private TO crl_school;
GRANT EXECUTE ON FUNCTION public.crl_live_assessment_hosts(),public.crl_library_has_live_assessment(),public.crl_expire_assessment_hosts() TO crl_school;

-- Invitations carry both the destination role and its registered school.
CREATE FUNCTION crl_private.guard_school_invitation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE issuer public.users;
BEGIN
 SELECT * INTO issuer FROM public.users WHERE id=NEW.generated_by;
 IF issuer.id IS NULL THEN RAISE EXCEPTION 'An invitation issuer is required'; END IF;
 IF NEW.invite_role='teacher' THEN
  IF issuer.role<>'reading_coordinator' OR NEW.school_id IS DISTINCT FROM issuer.school_id THEN RAISE EXCEPTION 'Teacher invitations belong to their coordinator school'; END IF;
 ELSIF NEW.invite_role IN('reading_coordinator','admin') THEN
  IF issuer.role<>'admin' OR current_user='crl_school' THEN RAISE EXCEPTION 'Platform administrator invitation required'; END IF;
  IF NEW.invite_role='reading_coordinator' AND NEW.school_id IS NULL OR NEW.invite_role='admin' AND NEW.school_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid invitation school'; END IF;
 ELSE RAISE EXCEPTION 'Invalid invitation role';
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER school_invitation_boundary BEFORE INSERT OR UPDATE OF generated_by,school_id,invite_role ON public.invite_codes FOR EACH ROW EXECUTE FUNCTION crl_private.guard_school_invitation();
GRANT EXECUTE ON FUNCTION crl_private.guard_school_invitation() TO crl_school;
