# CRL-App release CRL-2026-11-12.40: Staff signup approval

## Coordinator-requested change

Teacher and Reading Coordinator registrations no longer require a Reading Coordinator/Admin invitation code.

- A **Teacher** selects an active registered school, enters their name, username, email and password, acknowledges the existing privacy policy and submits an account request. The new user is **inactive**, with approval status `pending`. **The school's Reading Coordinator or Administrator can approve or reject** the signup in **Account approvals**.
- A **Reading Coordinator** signs up from the coordinator portal without an invitation code. Their new account is also inactive/pending. **Only the school's Administrator** can approve or reject Reading Coordinator requests.
- Sign-up returns `202 pending_approval` with an explanation. It **does not create a session or set an authentication cookie**. A pending applicant who attempts to log in with correct credentials receives an explicit pending-approval message.
- Approving a pending request is a school-restricted, audited atomic update. It enables the account and increments its session version. Rejecting retains the account as inactive/rejected so it cannot sign in. Duplicate/concurrent reviews and wrong-school/role reviews are refused.
- The existing password strength requirements, registration consent, account security, administrator and coordinator authentication, 2FA, signup rate limits and school permissions remain unchanged.
- Existing active staff accounts remain approved and operational. Existing deliberately disabled accounts are **not** treated as pending requests. No learner, school year, section, assessment score, story, offline journal or archive is changed.

## Decommissioned signup codes

- Teacher and Reading Coordinator signup forms no longer render invitation-code inputs.
- Coordinator navigation replaces **Codes** with **Account approvals**.
- Administrator navigation replaces **Invite Coordinator** with **Account approvals**.
- Creation/revocation and validation endpoints for new signup invitations return HTTP 410 (retired). Existing historical invite records remain in the database for audit history; invitation values are no longer usable for staff registration.
- Approval lists refresh only while the review tab is visible, not on assessment pages.

## Database migration

- Applied and verified: Supabase migration `20261112055938_staff_signup_approval_state`.
- Additive column: `public.users.approval_status varchar(16) NOT NULL DEFAULT 'approved'`, constrained to `approved`, `pending`, `rejected`.
- Indexed pending school/role/time values for responsive approval lists. Existing users retain `approved` as a default, with no account/session/learner reset.
- Mirrored in `prisma/schema.prisma`, `prisma/migrations` and `supabase/migrations`.

## Build and security regression coverage

- Updated password, structured-name, and consent signup tests.
- Added `scripts/verify-staff-signup-approval.cjs` to the required build, covering teacher/coordinator reviewer roles, cross-school denial, atomic duplicate decisions, rejected/disabled account separation, event audit, removed invitation fields, and no signup auto-login.
- Existing portal login, 2FA, teacher assessment, offline sync, coordinator/admin controls and archive/export tests stay in place.

## Acceptance checklist

1. Create a Teacher account without a code. Confirm the sign-in attempt is blocked pending approval, and the Coordinator can find and approve the request at their school.
2. Sign in as the approved Teacher using the original credentials. Confirm Conduct Assessment, section assignment and CRLA tasks still work.
3. Create a Reading Coordinator signup without a code. Confirm it appears for the school Administrator, **not** in the coordinator's approval list.
4. Approve the Coordinator as Administrator and verify a subsequent sign-in.
5. Reject another test signup, then verify that account cannot sign in and a second review returns conflict.
6. As an administrator/coordinator from a different school, verify that the request cannot be seen or acted on.
7. Verify existing teacher/coordinator/admin accounts, saved BOSY/MOSY/EOSY assessment records, and offline tablets were not reset.

## Deployment gate

Release only after the Vercel preview build is READY and the mandatory security/assessment suite has passed. Verify production deployment `main` commit and inspect initial server errors. No UI-only approval and no client-supplied role or reviewer identity are trusted.
