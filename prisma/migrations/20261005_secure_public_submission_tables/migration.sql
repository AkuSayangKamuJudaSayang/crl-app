-- Keep all sensitive and user-submitted data server-only.
--
-- The application writes bug reports, feedback, and recovery OTPs through
-- authenticated Next.js API routes backed by Prisma. Browser clients must not
-- be able to access these tables directly through Supabase's Data API.

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bug_reports_deny_public ON public.bug_reports;
CREATE POLICY bug_reports_deny_public
  ON public.bug_reports
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS feedback_deny_public ON public.feedback;
CREATE POLICY feedback_deny_public
  ON public.feedback
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS recovery_email_otps_deny_public ON public.recovery_email_otps;
CREATE POLICY recovery_email_otps_deny_public
  ON public.recovery_email_otps
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.bug_reports FROM anon, authenticated;
REVOKE ALL ON TABLE public.feedback FROM anon, authenticated;
REVOKE ALL ON TABLE public.recovery_email_otps FROM anon, authenticated;

REVOKE ALL ON SEQUENCE public.bug_reports_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.feedback_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.recovery_email_otps_id_seq FROM anon, authenticated;
