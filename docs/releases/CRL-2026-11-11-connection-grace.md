# CRL-App release note: 2026-11-11, connection recovery guard

## Problem

An interrupted teacher or learner application could retain an unfinished host long
after its device connection had stopped. That left assessment invitations or partial
sessions available for recovery even when the teacher needed to start over.

## Changes in this branch

- The teacher and learner now each track the time of the last *verified peer*
  message with a durable, role- and code-specific wall-clock timestamp.
- A temporary loss of connectivity allows 60 seconds from the last verified
  teacher/learner response, without a visible countdown. An existing recovery
  dialog may still appear after the earlier presence timeout.
- A verified response received inside the allowance renews the lease. A network
  indicator alone never renews the peer lease.
- After expiry, the teacher requests an idempotent host cancellation, with the
  `auto_timeout` flag. The API closes any other *unfinished host* in that same
  teacher's class section inside a transaction and never deletes completed
  assessment rows. Other sections/teachers are outside its scope.
- The offline runtime mirrors the timed-out section's host state locally. An
  interrupted teacher's app can queue cancellation for later ordered cloud sync.
- An expired learner session returns to the learner entry state and clears its
  stale peer timer. Expired teacher recovery is resolved or queued on reopen.
- The automatic cancellation retains the reconnect dialog if the server cannot
  confirm a cancellation, then retries rather than showing a fatal error screen.

## Regression coverage

`npm run verify:assessment` includes
`scripts/verify-disconnect-lease.mjs`. The test exercises the exact 59,999ms and
60,000ms boundaries, renewed responses, role isolation and integration markers.
`verify-assessment-transitions.cjs` exercises owned class-wide cancellation,
idempotence and the unfinished-only deletion guard. Existing connectivity,
offline pairing, sync, recovery, scoring and export verifications remain in place.

## Field checks still required on real tablets

Test both online service and peer-to-peer operation on Huawei MatePad SE 11:

1. Disconnect for less than 60 seconds and verify an acknowledged reconnection.
2. Disconnect for more than 60 seconds and confirm the teacher's assessment and
   active sessions in the same section close and permit a new run.
3. Close either PWA and reopen before/after the lease deadline.
4. Test loss of internet while the local peer link *continues to work*. Internet
   state alone must not cause an assessment cancellation.
5. Test two teachers with separate class sections, saved completed results,
   and offline cancellation synchronization after the internet returns.

## Operational boundary

If both devices are powered off and no service can receive a request, neither a
browser-only timer nor a cloud server can forcibly modify unreachable local
storage. The next launch or cloud reconciliation checks expiry and retires the
stale host. Cloud presence alone cannot prove that a peer-to-peer offline
connection has stopped, so the system does not infer peer loss solely from
internet unavailability.

## Deployment policy

Merge to the Git-integrated production branch only after the full preview build
passes. Verify the resulting production deployment is READY and its SHA matches
the merged commit. Retain the preceding production deployment for rollback.
