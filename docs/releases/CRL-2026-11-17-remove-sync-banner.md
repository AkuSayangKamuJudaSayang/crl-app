# CRL-2026-11-17 — Remove obstructive teacher sync banner

## Issue

Conduct Assessment displayed a persistent floating bottom-right **Changes saved
on this device** notification, including a pending `0/38` queue and an old
`End assessment` label, covering learner rows and controls.

## Changes

- Remove the `OfflineSyncPrompt` component from the teacher layout and delete
  its obsolete implementation. No sync banner is mounted over the teacher
  dashboard, enrolled learners, or an active assessment.
- Leave the `OfflineRuntime` durable outbox, pending assessment records,
  automatic synchronization, serialized replay, cloud acknowledgements,
  retries, and deletion safeguards unchanged.
- Show *verified* pending offline changes only when the teacher deliberately
  opens **Offline Mode Settings**. The settings panel retains **Retry sync**
  and the **Confirm pending deletions** password-protection route.
- Keep existing device pairing, QR/code dialogs, teacher navigation, scoring,
  assessment content and records intact.
- Rewrite the mandatory sync-notice regression test to prove the popup is absent
  while outbox and recovery controls remain available.

## Privacy and data safety

The `0/38` number could represent real unsynchronized assessment operations.
Hiding the obstructive notice is **not** evidence those operations have been
acknowledged by the server. This change deliberately does not bulk-clear
IndexedDB or discard assessment results. The queue continues to retry, and
verified status is accessible in Offline Mode Settings.

## Validation

Run `npm run build` (includes `verify:assessment`) in GitHub CI before
merging. Confirm the resulting Railway deployment reaches **SUCCESS** and
its production replica is online. A browser-side manual check remains useful:
Conduct Assessment should no longer show any fixed sync popup; Offline Mode
Settings should still expose pending count, Retry sync and deletion
authorization when applicable.

## 2026-11-17 follow-up: cancellation is destructive and terminal

The teacher specifically authorized deletion of the mistaken, already-ended
assessment. The connected database was inspected before modifying records:
the unfinished MoSY session was deleted, its host was closed, and the
separately completed BoSY session was verified still intact.

For future manual End Session and the one-minute reconnection timeout:

- The browser marks a canceled run terminal and removes its letter/word
  marks, passage miscues, comprehension, locally staged score records, and
  queued mutations. Only one idempotent host_end cancellation may remain
  until the cloud acknowledges it. Other learners' queued work is preserved.
- Legacy devices whose journals still contain a queued host_end behind
  dozens of results are compacted before synchronization on the next app
  startup. They do **not** replay those invalid answers.
- A terminal local host refuses delayed answer saves and attempts to record
  further progress. The separate assessment IndexedDB store is purged with
  a deleted-session guard that prevents old-tab writes from reviving data.
- The cloud host_end operation serializes against final save and deletes
  only unfinished assessment sessions. Intentionally saved final assessments
  must be preserved.
- The pending work indicator remains in Offline Mode Settings, not over
  Conduct Assessment. A pending cancellation is only removed once the
  server has acknowledged it.

This action does not erase the learner or their valid completed assessments.
