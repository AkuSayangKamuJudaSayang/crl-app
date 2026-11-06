-- CRL-2026-11-06.3: additive audit routing and actor snapshots; no operational reset.
BEGIN;
ALTER TABLE public.admin_audit_events ADD COLUMN IF NOT EXISTS school_id varchar(6);
ALTER TABLE public.admin_audit_events ADD COLUMN IF NOT EXISTS actor_name varchar(100);
UPDATE public.admin_audit_events e SET
 school_id=COALESCE((SELECT u.school_id FROM public.users u WHERE u.id=e.teacher_id),(SELECT u.school_id FROM public.users u WHERE u.id=e.actor_id)),
 actor_name=(SELECT u.full_name FROM public.users u WHERE u.id=e.actor_id)
WHERE e.school_id IS NULL OR e.actor_name IS NULL;
CREATE INDEX IF NOT EXISTS admin_audit_events_school_id_created_at_id_idx ON public.admin_audit_events(school_id,created_at DESC,id DESC);
CREATE OR REPLACE FUNCTION public.crl_audit_scope_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 NEW.school_id=COALESCE(NEW.school_id,(SELECT u.school_id FROM public.users u WHERE u.id=NEW.teacher_id),(SELECT u.school_id FROM public.users u WHERE u.id=NEW.actor_id));
 NEW.actor_name=COALESCE(NEW.actor_name,(SELECT u.full_name FROM public.users u WHERE u.id=NEW.actor_id));
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.crl_audit_scope_snapshot() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS crl_audit_scope_snapshot ON public.admin_audit_events;
CREATE TRIGGER crl_audit_scope_snapshot BEFORE INSERT ON public.admin_audit_events FOR EACH ROW EXECUTE FUNCTION public.crl_audit_scope_snapshot();
COMMIT;
