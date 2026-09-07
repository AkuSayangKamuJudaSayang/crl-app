-- Add recovery email and authenticator-based 2FA support.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email varchar(254),
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_secret varchar(255),
  ADD COLUMN IF NOT EXISTS reset_token_hash varchar(128),
  ADD COLUMN IF NOT EXISTS reset_token_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key
  ON public.users (lower(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_reset_token_hash_key
  ON public.users (reset_token_hash)
  WHERE reset_token_hash IS NOT NULL;
