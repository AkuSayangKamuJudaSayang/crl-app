-- CRL-App administrator bootstrap
--
-- Run this only for an EXISTING account that you control.
-- Replace the username below with the account that should become the administrator.
-- The password is unchanged; this only changes the role.

UPDATE public.users
SET role = 'admin'
WHERE username = 'theo';

-- Verify the result.
SELECT id, username, full_name, section, role, created_at
FROM public.users
WHERE username = 'theo';
