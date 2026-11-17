# CRL-2026-11-17 — Part 1 review correction safety and teacher UI

## Scope

Targeted changes to the teacher's live Letter Sounds / Word Recognition
assessment only. The assessment protocol, random/fixed content configuration,
coordinator permissions, stop rules, learner display, and final scoring criteria
remain unchanged.

## Fixes

- Previous-item **Correct/Incorrect** revisions now call the same durable
  Part 1 result journal, recovery checkpoint, and local IndexedDB snapshot
  as a first response. A correction replaces the original response at its
  configured item index rather than creating another marked item.
- The review cursor moves to the next history item as soon as a correction
  is entered, without waiting for the network. The matching answer button is
  disabled on returning to that item; the opposite choice remains available.
- Server writes to the same letter or word are serialized so a slower earlier
  answer cannot overwrite a later correction. Stale in-memory outbox entries
  are ignored and obsolete queued answer payloads are discarded safely.
- Background and foreground writes continue to use durable retry and a
  bounded HTTP timeout. The server is not asked to rewind the live learner.
- Previous and Next buttons use a blue base state. Teacher live assessment
  page uses scoped dark-mode variables for its primary surfaces and key text.
  Using overflow-x:clip instead of hidden avoids introducing a nested vertical
  scroll container.

## Data safety

No learner result tables, IndexedDB databases, saved local sessions, or
pending offline assessment work were bulk deleted. A generic
"Changes saved on this device" notice is not proof that the queue is
corrupt, and clearing unsynchronized assessment data could lose scores.

## Regression verification

Added scripts/verify-part1-review-corrections.cjs to the mandatory
verify:assessment chain. Tests cover reversing Incorrect to Correct and vice
versa, configured shuffled word order, immediate next-item review navigation,
per-item write serialization, and base styling invariants. Production build
and live Railway rollout must pass separately from these source-level tests.

## Remaining device validation

A real Huawei MatePad SE 11 offline/online reconnection and a live teacher
dark-mode switch should be checked on school hardware. Do not clear browser
site data while an assessment has outstanding writes.
