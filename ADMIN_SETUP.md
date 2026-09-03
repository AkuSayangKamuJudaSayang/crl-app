# CRL-App administrator access

Administrator access is now managed through the application. The old `scripts/promote-admin.sql` bootstrap mechanism is intentionally removed from this package.

## Existing administrators

An existing row in `public.users` with `role = 'admin'` can sign in at:

`/admin/login`

The administrator API verifies the role again from the database on every protected request.

## Creating future administrators

Set these two server-side environment variables in Vercel:

```env
ADMIN_ALLOWED_USERNAMES=theo,approvedadmin2,approvedadmin3
ADMIN_SIGNUP_KEY=use-a-long-random-private-value
```

Only a username present in `ADMIN_ALLOWED_USERNAMES` AND the private `ADMIN_SIGNUP_KEY` can create an administrator account through `/admin/login?mode=signup`.

Do not expose `ADMIN_SIGNUP_KEY` to the browser, commit it to Git, or place it in `NEXT_PUBLIC_*` variables.

An existing username cannot be promoted through this registration flow. Administrator role changes happen only when a newly created account is explicitly assigned role `admin` by the application.

## Teacher invitations

The administrator dashboard at `/admin` remains focused on generating/resetting teacher invite codes. Those codes continue to live in the existing `public.invite_codes` table.
