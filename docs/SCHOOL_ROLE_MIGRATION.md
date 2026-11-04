# School and account separation (implementation in progress)

Authorized request: separate platform Administrator, Reading Coordinator and Teacher;
shared coordinator workspace within a school; complete operational-entry reset;
10 real demo teachers, 5 real demo coordinators in three schools, no enabled 2FA.

## Decisions

- `/coordinator` owns the former assessment-management dashboard. `/admin` is a
  separate platform account/school/invitation console. Sessions are role-specific.
- School ID is a registered six-digit identifier. Coordinators in one school share
  management; other schools are isolated. Teachers remain individually owned too.
- Platform administrators issue school-bound coordinator invitations. Coordinators
  issue teacher invitations bound to their school and issuer. Signup consumes one
  invitation atomically. Email and username are unique normalized login identifiers.
- Operational coordinator requests run inside a school-scoped database transaction
  with a restricted PostgreSQL role and RLS, including raw SQL and nested operations.
  Shared years and libraries become school-specific, with composite unique keys.
- Reset only at cutover after isolated verification. Preserve standardized original
  assessment materials and functionality; remove operational users/entries, old
  administrator credentials, assessments, learners, classes, archives, backups,
  history, feedback, invitations and security sessions. Never reuse old user IDs.
- Disconnected device storage cannot be erased remotely. A public reset epoch lets
  reconnecting clients discard obsolete CRL data and queues before authentication.
  Deleted-account checks prevent old credentials or outboxes from replaying.
- Demo passwords are generated outside git, stored only as bcrypt hashes remotely,
  and delivered directly to the requesting user. Demo email identifiers have no
  claim of a working inbox or completed email verification.

## Current status: production cutover blocked

Automatic approval review rejected the production-wide reset as irreversible
production destruction even though the user authorized it. The statement did not
run: all three existing accounts remain, `schools` does not exist and no reset
migration is recorded. Only additive enum migration 20261104142646 was applied.
Do not bypass this rejection through indirect or split deletions. The school schema
and demo accounts have been rehearsed privately but are not live. Do not deploy
this branch against the current database or deliver its private candidate passwords
as usable credentials. Production remains release .9.

## Completed candidate checks

- Clean install, zero-vulnerability live audit, all 52 gates, optimized build.
- Separate portal cookies/audience/roles; current account/version/school revocation.
- Bound invitations and one-use conflict validation, canonical school identity.
- Concurrent request-context isolation and scoped composite-key injection.
- Independent PostgreSQL schema/RLS rehearsal and private 16-account/9-catalog seed.
- Both role login/signup UIs at five widths (320–1440px), no overflow/client errors.
- Native capstone role prose and four consistent editable diagrams; PDF inspection.

## Outstanding production checks (blocked)

1. Schema, role/school constraints, RLS and scoped queries, including raw functions.
2. Coordinator/admin/teacher auth, invitation atomicity, email login, profiles.
3. Signup school directory and responsive account/management interfaces.
4. Cross-school/cross-teacher denial for every management/recovery/live path.
5. Original assessment flow, content, offline continuity, records and exports.
6. Reset epoch, revoked/deleted accounts, no stale outbox resurrection.
7. Clean install, full build and live all-severity audit; browser checks.
8. Native capstone roles/use cases/activity/ERD changes and rendered verification.
9. Reviewed atomic production reset + demo bootstrap; login checks for all accounts.
10. GitHub/Vercel same-commit verification; credentials delivered, limitations stated.
