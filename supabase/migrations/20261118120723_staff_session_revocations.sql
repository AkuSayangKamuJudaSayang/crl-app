BEGIN;

CREATE TABLE public.revoked_staff_sessions (
  session_key varchar(64) PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE INDEX revoked_staff_sessions_expires_at_idx ON public.revoked_staff_sessions (expires_at);

ALTER TABLE public.revoked_staff_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.revoked_staff_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.revoked_staff_sessions TO crl_school;
CREATE POLICY crl_school_session_revocation_read ON public.revoked_staff_sessions
  FOR SELECT TO crl_school USING (true);

COMMIT;
