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
