# CRL-App

Production role portals: `/admin` (platform administration), `/coordinator`
(Reading Coordinator) and `/teacher` (teacher). Registered schools and role-bound
invitations separate accounts and workspaces. Coordinators at one school share
school management; teacher records retain individual ownership. See
`docs/SCHOOL_ROLE_MIGRATION.md` for the applied preserving upgrade. Demo login
email identifiers ending in `.example` are not email delivery addresses.

Install pages are `/install/teacher` and `/install/learner`. Teacher starts at
`/teacher`; Learner starts at `/learner`. Each role has its own stable manifest
ID, Apple title, and labeled icon. Use the role install page before adding a Home
screen icon. The root page has no Teacher/Learner install identity. New staff
signup records acceptance of the Terms and Privacy version; app startup is not
blocked by an old device-level consent cookie.

The install button uses the browser's standard `beforeinstallprompt` event when the browser exposes it. Browsers that do not support programmatic PWA installation cannot be forced to install by webpage JavaScript.

## Run locally

CRL-App login uses the project's Postgres database through Prisma. Configure the local server before signing in:

```bash
cp .env.example .env.local
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead.

Edit `.env.local` and replace the placeholders with the connection values from the Supabase project's **Connect** panel. Set `JWT_SECRET` to a long random value; for example:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Replace every template token in the copied file, including `PROJECT_REF`,
`YOUR_DATABASE_PASSWORD`, and `YOUR_POOLER_HOST`. The app ignores connection
URLs that still contain these placeholders and uses the next valid configured
URL instead.

Then install, generate the Prisma client, and start the app:

```bash
npm ci
npx prisma generate
npm run dev
```

Run `npx prisma migrate deploy` only when the target database already uses the
repository's Prisma migration history. If Prisma reports `P3005`, the database
already contains a schema and must be baselined separately; do not reset it.

Restart the development server whenever `.env.local` changes. Real database passwords, JWT secrets, and service-role keys must never be committed.
