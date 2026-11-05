-- Applied through Supabase migration record_staff_signup_policy_acceptance.
-- Existing staff have no inferred acceptance; only new signup records set these.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS policy_accepted_at timestamp(3), ADD COLUMN IF NOT EXISTS policy_version varchar(32);
ALTER TABLE public.users ADD CONSTRAINT users_policy_acceptance_pair CHECK ((policy_accepted_at IS NULL AND policy_version IS NULL) OR (policy_accepted_at IS NOT NULL AND policy_version IS NOT NULL));
COMMENT ON COLUMN public.users.policy_accepted_at IS 'Server time at new staff signup when Terms were accepted and Privacy Notice acknowledged; not learner/guardian consent.';
COMMENT ON COLUMN public.users.policy_version IS 'Terms and privacy version acknowledged at staff registration. Legacy accounts remain null; never backfill inferred agreement.';
