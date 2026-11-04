-- Data-preserving school/role upgrade. No entry deletion or operational reset.
-- No passwords or demo records belong in this migration.
SET LOCAL lock_timeout='15s';
DO $$BEGIN
 PERFORM pg_advisory_xact_lock(177631,1);
 IF public.crl_library_has_live_assessment() THEN RAISE EXCEPTION 'Wait for current assessments to finish before migration';END IF;
 IF (SELECT count(DISTINCT school_id) FROM public.users WHERE role='teacher')<>1 THEN RAISE EXCEPTION 'Existing-school mapping needs review';END IF;
 IF EXISTS(SELECT 1 FROM public.users WHERE role='teacher' AND (school_id IS NULL OR school_id!~'^[0-9]{6}$' OR nullif(trim(school_name),'') IS NULL)) THEN RAISE EXCEPTION 'Existing school identity is incomplete';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE role='admin') THEN RAISE EXCEPTION 'Existing coordinator mapping needs review';END IF;
END;$$;
LOCK TABLE public.account_unlock_requests,public.admin_audit_events,public.admin_recovery_items,public.assessment_content,public.assessment_library_heads,public.assessment_library_revisions,public.assessment_presence,public.assessment_sessions,public.assessment_windows,public.bug_reports,public.class_archives,public.class_sections,public.comprehension_results,public.coordinator_change_requests,public.feedback,public.global_school_years,public.host_sessions,public.invite_codes,public.learners,public.letter_task_results,public.passage_miscues,public.recovery_email_otps,public.school_years,public.security_rate_buckets,public.session_metrics,public.users,public.word_task_results IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE crl_preservation_check(table_name text PRIMARY KEY,row_count bigint,digest text) ON COMMIT DROP;
DO $proof$
DECLARE t text;n bigint;d text;omit text[];
BEGIN
 FOREACH t IN ARRAY ARRAY['account_unlock_requests','admin_audit_events','admin_recovery_items','assessment_content','assessment_library_heads','assessment_library_revisions','assessment_presence','assessment_sessions','assessment_windows','bug_reports','class_archives','class_sections','comprehension_results','coordinator_change_requests','feedback','global_school_years','host_sessions','invite_codes','learners','letter_task_results','passage_miscues','recovery_email_otps','school_years','security_rate_buckets','session_metrics','users','word_task_results'] LOOP
  omit=CASE WHEN t='users' THEN ARRAY['school_id','school_name','role','admin_session_version','coordinator_id','is_active'] WHEN t='invite_codes' THEN ARRAY['school_id','invite_role'] ELSE ARRAY['school_id'] END;
  EXECUTE format($statement$SELECT count(*),md5(coalesce(string_agg(j::text,'' ORDER BY j::text),'')) FROM(SELECT to_jsonb(s)-$1 AS j FROM public.%I s)x$statement$,t) INTO n,d USING omit;
  INSERT INTO crl_preservation_check VALUES(t,n,d);
 END LOOP;
END;$proof$;
CREATE TABLE public.schools(id varchar(6) PRIMARY KEY CHECK(id~'^[0-9]{6}$'),name varchar(150) NOT NULL,is_active boolean NOT NULL DEFAULT true,created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE public.system_state(key varchar(50) PRIMARY KEY,value text NOT NULL,updated_at timestamp NOT NULL DEFAULT now());
ALTER TABLE public.users ADD COLUMN is_active boolean NOT NULL DEFAULT true,ADD COLUMN coordinator_id integer REFERENCES public.users(id) ON DELETE RESTRICT;
INSERT INTO public.schools(id,name) SELECT school_id,max(trim(school_name)) FROM public.users WHERE role='teacher' GROUP BY school_id;
UPDATE public.users SET role='reading_coordinator',school_id=(SELECT min(id) FROM public.schools),school_name=(SELECT min(name) FROM public.schools),admin_session_version=admin_session_version+1 WHERE role='admin';
UPDATE public.users t SET coordinator_id=(SELECT min(c.id) FROM public.users c WHERE c.role='reading_coordinator' AND c.school_id=t.school_id) WHERE t.role='teacher';
ALTER TABLE public.users ALTER COLUMN school_id TYPE varchar(6);
ALTER TABLE public.users ADD CONSTRAINT users_school_fkey FOREIGN KEY(school_id) REFERENCES public.schools(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX users_school_id_identity ON public.users(school_id,id);
CREATE UNIQUE INDEX users_username_normalized ON public.users(lower(username));
CREATE UNIQUE INDEX users_email_normalized ON public.users(lower(email)) WHERE email IS NOT NULL;
ALTER TABLE public.invite_codes ADD COLUMN school_id varchar(6) REFERENCES public.schools(id),ADD COLUMN invite_role public."UserRole" NOT NULL DEFAULT 'teacher';
UPDATE public.invite_codes i SET school_id=u.school_id FROM public.users u WHERE u.id=i.generated_by;
ALTER TABLE public.school_years DROP CONSTRAINT school_years_global_definition_fkey;
ALTER TABLE public.global_school_years DROP CONSTRAINT global_school_years_pkey,ADD COLUMN school_id varchar(6) REFERENCES public.schools(id);
UPDATE public.global_school_years SET school_id=(SELECT min(id) FROM public.schools);
ALTER TABLE public.global_school_years ALTER COLUMN school_id SET NOT NULL,ADD PRIMARY KEY(school_id,start_year);
ALTER TABLE public.school_years ADD COLUMN school_id varchar(6) REFERENCES public.schools(id);
UPDATE public.school_years y SET school_id=u.school_id FROM public.users u WHERE u.id=y.teacher_id;
ALTER TABLE public.school_years ALTER COLUMN school_id SET NOT NULL,ADD CONSTRAINT school_years_global_definition_fkey FOREIGN KEY(school_id,start_year) REFERENCES public.global_school_years(school_id,start_year),ADD CONSTRAINT school_years_teacher_school_fkey FOREIGN KEY(school_id,teacher_id) REFERENCES public.users(school_id,id);
ALTER TABLE public.assessment_library_heads DROP CONSTRAINT assessment_library_heads_pkey,ADD COLUMN school_id varchar(6) REFERENCES public.schools(id);
UPDATE public.assessment_library_heads SET school_id=(SELECT min(id) FROM public.schools);
ALTER TABLE public.assessment_library_heads ALTER COLUMN school_id SET NOT NULL,ADD PRIMARY KEY(school_id,period);
ALTER TABLE public.assessment_library_revisions DROP CONSTRAINT assessment_library_revisions_period_version_key,ADD COLUMN school_id varchar(6) REFERENCES public.schools(id);
UPDATE public.assessment_library_revisions SET school_id=(SELECT min(id) FROM public.schools);
ALTER TABLE public.assessment_library_revisions ALTER COLUMN school_id SET NOT NULL,ADD UNIQUE(school_id,period,version),ADD UNIQUE(school_id,id);
ALTER TABLE public.assessment_library_heads DROP CONSTRAINT assessment_library_heads_revision_id_fkey,ADD CONSTRAINT assessment_library_heads_revision_id_fkey FOREIGN KEY(school_id,revision_id) REFERENCES public.assessment_library_revisions(school_id,id);
ALTER TABLE public.bug_reports ADD COLUMN school_id varchar(6) REFERENCES public.schools(id);
ALTER TABLE public.feedback ADD COLUMN school_id varchar(6) REFERENCES public.schools(id);

UPDATE public.bug_reports SET school_id=(SELECT min(id) FROM public.schools);
UPDATE public.feedback SET school_id=(SELECT min(id) FROM public.schools);

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

DO $proof$
DECLARE r record;n bigint;d text;omit text[];
BEGIN
 FOR r IN SELECT * FROM crl_preservation_check LOOP
  omit=CASE WHEN r.table_name='users' THEN ARRAY['school_id','school_name','role','admin_session_version','coordinator_id','is_active'] WHEN r.table_name='invite_codes' THEN ARRAY['school_id','invite_role'] ELSE ARRAY['school_id'] END;
  EXECUTE format($statement$SELECT count(*),md5(coalesce(string_agg(j::text,'' ORDER BY j::text),'')) FROM(SELECT to_jsonb(s)-$1 AS j FROM public.%I s)x$statement$,r.table_name) INTO n,d USING omit;
  IF n<>r.row_count OR d<>r.digest THEN RAISE EXCEPTION 'Preservation check failed for %',r.table_name;END IF;
 END LOOP;
END;$proof$;
INSERT INTO public.system_state(key,value)VALUES('schema_version','school-roles-preserving-v1');
