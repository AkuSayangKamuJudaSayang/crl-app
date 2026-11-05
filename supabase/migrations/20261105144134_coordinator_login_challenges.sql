CREATE TABLE public.portal_login_challenges (token_hash varchar(64) PRIMARY KEY, user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, session_version integer NOT NULL, attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5), expires_at timestamp(3) NOT NULL);
CREATE INDEX portal_login_challenges_expires_at_idx ON public.portal_login_challenges(expires_at);
CREATE INDEX portal_login_challenges_user_id_idx ON public.portal_login_challenges(user_id);
ALTER TABLE public.portal_login_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_login_challenges FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_login_challenges TO service_role;
CREATE POLICY portal_login_challenges_service ON public.portal_login_challenges TO service_role USING (true) WITH CHECK (true);
