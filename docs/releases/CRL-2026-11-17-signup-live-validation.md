# Staff signup live validation and approval labels

Release ID: CRL-2026-11-17.5
Date: 17 November 2026, Asia/Manila

- Both staff signup screens debounce username availability for 450ms, cancel
  stale requests, and check against all user accounts including pending roles.
- Email has immediate format feedback and final server validation.
- Teacher button uses Request Approval and retains Reading Coordinator review.
  Coordinator applications retain System Administrator review.
- Registered-school placeholder is disabled and hidden from the drawer, while
  remaining the required initial value in both forms.
- Public username lookup uses normal security rate buckets. A failed lookup
  does not mean the name is available. Database uniqueness remains authoritative.
- No migration or data/permission mutation, and no assessment/UI changes beyond
  the two signup screens.
- Added verify-signup-live-validation.cjs to the complete assessment build
  regression suite. Verify live production CI/build and HTTP health separately.
- Revert this release commit and redeploy to roll back UI/lookup changes.
