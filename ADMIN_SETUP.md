# CRL-App administrator access

Administrator access is **sign-in only**. There is no administrator sign-up: the
public registration form was removed from `/admin/login`, and the server-side
`admin_signup` handler refuses every request unless both `ADMIN_ALLOWED_USERNAMES`
and `ADMIN_SIGNUP_KEY` are configured (they are deliberately unset).

## Signing in

An existing row in `public.users` with `role = 'admin'` signs in at:

```
/admin/login
```

Only a username and a password are required. The administrator API re-verifies
the role from the database on every protected request, so a teacher session can
never reach `/admin`.

The built-in administrator account is:

| Field    | Value                        |
| -------- | ---------------------------- |
| Username | `adminCRL-APP_2026`          |
| Password | `zq=Si$+yA=DJ)Sn@G#omJENSFm(` |

Sign-in is case-insensitive, so the username can be typed in any casing.

## Creating or rotating administrators

Because self-registration is disabled, use the provisioning script. It is
idempotent — an existing username is updated instead of duplicated.

```bash
# Provision (or reset) the built-in administrator
node --env-file=.env.local scripts/seed-admin.mjs

# Provision a different administrator
node --env-file=.env.local scripts/seed-admin.mjs <username> <password> "Full Name"
```

The same values can be supplied through `ADMIN_USERNAME`, `ADMIN_PASSWORD` and
`ADMIN_FULL_NAME`. Passwords are hashed with bcrypt at 12 rounds, and the script
re-reads the stored hash with `bcrypt.compare` before exiting so a bad seed can
never ship silently.

To revoke administrator access, delete the row or set its `role` back to
`teacher`:

```sql
UPDATE public.users SET role = 'teacher' WHERE username = 'adminCRL-APP_2026';
```

## Teacher sign-up codes

The dashboard at `/admin` generates one temporary teacher sign-up code at a
time. The code:

- is single-use — it is marked used the moment a teacher registers;
- replaces the previous code, which is retired immediately;
- can be copied to the clipboard and reset at any time.

Codes live in the existing `public.invite_codes` table.

## Landing-page inbox

The landing-page menu sends **Report a Bug** and **Feedback** to `/api/public/report`.
They are stored in two separate tables and shown as two separate fields in the
dashboard, so the two are never mixed:

| Section       | Table         | Model       |
| ------------- | ------------- | ----------- |
| Report a Bug  | `bug_reports` | `BugReport` |
| Feedback      | `feedback`    | `Feedback`  |

Both submissions accept an optional name and contact, are rate-limited to one
per IP every 20 seconds, and can be marked resolved or deleted from `/admin`.
