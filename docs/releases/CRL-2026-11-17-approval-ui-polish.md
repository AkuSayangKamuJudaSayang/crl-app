# CRL-2026-11-17.7 — Approval controls and teacher Overview

Date: 17 November 2026, Asia/Manila.

- Fix the unstyled Cancel button in the ClassDialog used by account approvals
- Apply themed hover, disabled and visible focus states to Reject, Approve,
  Cancel, Confirm approval and Confirm rejection for both reviewer roles
- Use "Please wait..." during a submitted review, not "Reviewing..."
- Show a transient green, bottom-centered role-specific approval confirmation.
  Successful registration rejection uses a neutral bottom status.
- Keep the administrator approval panel mounted through a quiet refresh so its
  prompt persists; remove the coordinator's duplicate top notice only for
  approval decisions
- Center the teacher Overview's Sections Assigned, Total Learners, BoSY
  Completed, MoSY Completed and existing full-width EoSY Completed counters
- No database migration, API, role permission, assessment, reporting or offline
  sync change, and no dependency changes
- Regression: scripts/verify-approval-ui-polish.cjs, in the full build gate
- Verify GitHub CI + Railway deployed SHA before marking production complete;
  physical-browser inspection is distinct from automated SSR verification
- Roll back by reverting this UI-only release commit and redeploying
