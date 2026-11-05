# Registered-school role upgrade: concrete preserving rollout

Release: CRL-2026-11-05.2. PR #17 merged; preserving cutover applied.

The user explicitly approved the exact preserving cutover after the destructive reset
was rejected. Existing records and account IDs are retained. No operational reset ran.

## Applied migration

Name: `preserve_records_school_role_separation`.
Version: `20261104160712`.
Source: `supabase/migrations/20261104160712_preserve_records_school_role_separation.sql`.
The reviewed source is also retained in `docs/migrations/school_scope_preserving.sql`.

- Refuse migration while a live assessment is conducting.
- Lock the 27 existing public operational tables within one transaction, with a
  15-second acquisition timeout. This can temporarily delay concurrent requests.
- Snapshot row counts and content digests in a temporary table.
- Register the existing single school from its current teacher profile.
- Convert former administrator accounts to Reading Coordinators in that school,
  preserve their IDs/names/history, and revoke old role sessions by version.
- Bind the existing teacher to that school's coordinator; retain teacher ownership.
- Backfill school identifiers on existing invitations, years, library versions,
  reports and feedback. Keep their original payloads/identifiers/timestamps.
- Add school foreign/composite keys, account/invitation/content guards, a restricted
  database role and school RLS policies. Same-school coordinators share management;
  each teacher retains individual class/learner/assessment ownership too.
- Compare all 27 counts/content digests before commit. Only intended account role,
  session/school metadata and newly added columns are excluded. Any mismatch aborts.
- Store a schema-version marker; do not write a reset epoch or erase device stores.

There is no TRUNCATE, DELETE, soft-delete reset, or operational entry removal.
The temporary preservation snapshot is transaction-local, not a retained data export.
Do not apply the superseded .10 empty-database migration.

## Subsequent approved rollout actions

1. Add three new demo schools (separate from the retained existing school).
2. Create 5 demo Reading Coordinators, 10 demo Teachers and one new platform admin
   with unique generated passwords; 2FA off for these demo accounts only.
3. Seed each demo school's BoSY/MoSY/EoSY library with original standardized letters,
   words, Para the Parrot and A Day in the Fields; retain existing school revisions.
4. Rotate each former administrator's shared/default password to a unique replacement;
   preserve the accounts, records and existing 2FA setting. Deliver credentials privately.
5. Verify live role/login/invitation flows, school denial, retained entries, versioned
   offline authorization and responsive UI; then promote matching GitHub/Vercel commit.

## Completed validation

Clean npm ci, zero-vulnerability live all-severity audit, all 52 gates and optimized
build. Real offline bootstrap/bearer token validation, status/version rejection,
concurrent school context and composite-key injection tests. Independent PostgreSQL
rehearsal verifies preservation of populated legacy users/classes/learners and all
27 row/content checks, then rejects another school's access. Previous candidate UI
checks covered coordinator/admin sign-in/signup at 320–1440px. Capstone/diagrams describe the deployed preserving schema.

## Production status and limits

The preserving schema, school backfill, role conversion, replacement passwords and
demo seed are live. All 27 preservation checks passed in the migration transaction.
Original 33 learners, 4 assessments, 1 archive and 4 recovery items remain. The original
teacher retains credentials and 2FA; the two converted coordinators retain their IDs.
Four registered schools now exist: the original and three additional demo schools.
Five demo coordinators, ten demo teachers and one new platform administrator are active.

Current-account login and school-isolation checks supplement the isolated rehearsals.
There is no data_epoch or automatic erasure of existing device journals. Physical
phone/tablet installation and offline pairing still require actual-device verification.
Never apply the superseded empty-database reset or roll back to unscoped role APIs.
