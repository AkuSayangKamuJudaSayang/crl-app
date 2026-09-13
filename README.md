# CRL-App Learner PWA

The learner download page is `/learner/download`.

The installed PWA is named **CRL-App Learner** and starts at `/learner`.

`/learner` is the assessment application in standalone display mode and redirects normal browser visits to `/learner/download`.

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
