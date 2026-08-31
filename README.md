# CRL-App

CRL-App is a Progressive Web App for conducting and recording the
Comprehensive Rapid Literacy Assessment (CRLA) for Grade 3 learners.

## Technology

- Next.js 15.5.24 with the App Router
- React
- Prisma ORM
- PostgreSQL/Supabase
- JWT authentication
- bcrypt password hashing
- ExcelJS for CRLA Excel report generation
- Service worker for PWA behavior

## Project structure

```text
crl-app/
├── app/
│   ├── api/
│   │   ├── assessment/
│   │   │   └── route.js
│   │   ├── auth/
│   │   │   └── route.js
│   │   ├── db-test/
│   │   │   └── route.js
│   │   └── reports/
│   │       └── excel/
│   │           └── route.js
│   ├── components/
│   │   └── PwaRegister.jsx
│   ├── learner/
│   │   └── page.jsx
│   ├── login/
│   │   └── page.jsx
│   ├── teacher/
│   │   ├── assessment/
│   │   │   ├── page.jsx
│   │   │   └── AssessmentClient.jsx
│   │   └── page.jsx
│   ├── layout.jsx
│   ├── manifest.js
│   └── page.jsx
├── lib/
│   ├── auth.js
│   └── prisma.js
├── prisma/
│   └── schema.prisma
├── public/
│   ├── templates/
│   │   └── CRLA3_Grade3Scoresheet_v3.xlsx
│   └── sw.js
├── package.json
├── package-lock.json
└── .env
```

## Requirements

Use Node.js 20.9.0 or newer.

The application requires a PostgreSQL database. The current Prisma schema
uses:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
JWT_SECRET="your-long-random-secret"
```

Do not commit `.env` to Git.

## Supabase connection

For Supabase, use the connection strings supplied by the project's
Supabase Connect panel.

The application uses:

- `DATABASE_URL` for the normal Prisma connection
- `DIRECT_URL` for direct/migration operations

Keep the password URL-encoded if it contains reserved URL characters.

## Installation

From the project root:

```bash
npm install
```

Generate Prisma Client:

```bash
npx prisma generate
```

Synchronize the current database schema:

```bash
npx prisma db push
```

Start development:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000/login
```

## Production build

Always verify the application locally before deployment:

```bash
npm run build
```

A successful build should show the application routes and finish without
Prisma, Next.js, JSX, or module-resolution errors.

Start the production build with:

```bash
npm start
```

## Database health check

The application includes:

```text
/api/db-test
```

For example:

```text
http://localhost:3000/api/db-test
```

A successful response reports that the PostgreSQL connection and Prisma
query are working without exposing application records.

## Authentication

The authentication API uses the `crla_token` HttpOnly cookie.

The main flow is:

```text
/login
   ↓
POST /api/auth?action=login
   ↓
Prisma User lookup
   ↓
bcrypt password verification
   ↓
JWT creation
   ↓
crla_token cookie
   ↓
/teacher
```

Teacher and admin users can access the teacher dashboard.

## Assessment workflow

The teacher-led assessment flow is backed by PostgreSQL through Prisma.

```text
Teacher
   ↓
Start BoSY/MoSY/EoSY
   ↓
Host session created
   ↓
Waiting for learner
   ↓
Learner enters assessment code
   ↓
Learner connection/heartbeat established
   ↓
Task 1: Letter Sounds
   ↓
Task 2: Words
   ↓
Passage Reading
   ↓
Comprehension
   ↓
Learner finishes
   ↓
Assessment marked completed
```

Ending the teacher host controller is intentionally different from completing
the assessment. `host_end` ends the teacher controller session without
automatically setting the corresponding assessment to completed.

## Excel reports

The Excel export endpoint is:

```text
/api/reports/excel
```

The application uses the supplied:

```text
public/templates/CRLA3_Grade3Scoresheet_v3.xlsx
```

as the workbook template.

Keep that template in the exact location above when deploying.

## PWA

The PWA manifest is:

```text
app/manifest.js
```

The service worker is:

```text
public/sw.js
```

The root layout registers the PWA client helper.

The service worker intentionally does not cache `/api/*` responses because
assessment state, authentication, learner connection state, and report
generation must remain live.

## Deployment to Vercel

1. Add the required environment variables to the Vercel project.
2. Confirm the Supabase PostgreSQL URLs are correct.
3. Push the current `main` branch to GitHub.
4. Wait for the Vercel build to complete.
5. Test `/login`, `/teacher`, `/learner`, `/teacher/assessment`, and
   `/api/db-test`.

For an updated PWA deployment, a browser may need to replace an older service
worker before the new client assets appear.

## Git

Do not commit:

```text
.env
.next/
node_modules/
```

A normal update is:

```bash
git status
git add app lib prisma public package.json package-lock.json
git commit -m "Update CRL-App"
git push origin main
```

## Important safety rule

Do not use:

```bash
npx prisma migrate reset
```

on the live database.

That command can delete existing development data. Use the project's intended
migration/synchronization workflow instead.

## Current status

The project is structured as a database-backed PWA rather than a static
prototype. The assessment, authentication, learner, teacher, and report
routes communicate through Next.js API routes and Prisma.
