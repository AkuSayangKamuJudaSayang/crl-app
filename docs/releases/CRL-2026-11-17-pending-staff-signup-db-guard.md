# CRL-2026-11-17.6 — Signup 503 fix

The old `crl_private.guard_account_school` trigger required every teacher's
coordinator_id on INSERT. The approval-based signup (introduced 12 Nov) inserts
inactive pending teachers with NULL coordinator_id, so live teacher requests
failed with HTTP 503 and no pending account or approval audit was saved.

The fix permits NULL for inactive pending/rejected teachers only, and retains
same-school coordinator validation for any assigned teacher. Restricted
`crl_school` updates may assign a coordinator only when converting an
unassigned pending/inactive teacher to approved/active. Other role, school, and
coordinator rewrites remain prohibited. Teacher registration and Reading
Coordinator registration use their existing atomic pending-account+audit write.
Unexpected failures log only safe error type/code. No real account data or
assessment data is reset.

Migration: `supabase/migrations/20261117213000_allow_pending_staff_signup_approval.sql`
Release: CRL-2026-11-17.6, 17 Nov 2026 Asia/Manila.
Validation: source regression, existing approval and full build tests, live
rolled-back SQL insert/review smoke for both roles, GitHub/Railway status.
Rollback: replace the function with the prior version (not recommended for
approval-based signup); application rollback alone does not revert the trigger.
