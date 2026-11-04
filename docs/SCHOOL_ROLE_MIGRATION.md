# Registered-school role upgrade: concrete preserving rollout

Candidate: CRL-2026-11-04.11. PR #17. Production remains .9.

The user asked to continue after the destructive reset was blocked. This revision
preserves existing records and account IDs. The exact production cutover was also
rejected by automatic approval review because its live DDL/RLS/trigger/role conversion
and table-lock effects had not been explicitly approved. No workaround is permitted.

## Concrete migration requiring approval

Name: `preserve_records_school_role_separation`.
Source: `docs/migrations/school_scope_preserving.sql` (unapplied).

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
checks covered coordinator/admin sign-in/signup at 320–1440px. Capstone/diagrams are
updated as a proposed candidate, not falsely described as deployed schema.

## Production status and limits

No preserving schema, role backfill, password rotation or demo seed has run. Existing
accounts, responses, assessments, classes, archives, backups and local journals remain.
Only the earlier additive `reading_coordinator` enum migration is applied. A physical
phone/tablet test and live end-to-end school/account tests remain outstanding.

Do not repeat either rejected migration or divide it into indirect writes. Explicit
approval must cover the named production cutover, table locks, school backfills,
role conversions, constraints, triggers and RLS. After approval, verify the latest
production schema/active-assessment state again before applying the exact reviewed SQL.
