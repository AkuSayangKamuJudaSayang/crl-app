# CRL-App release: 2026-11-17 comprehension review and teacher assessment UI

## Requested changes

1. **Comprehension Previous / Next.** The teacher may step backward and
   forward through *already scored* comprehension questions. The answer
   matching the recorded mark is disabled; the opposite mark corrects the
   same question index. A correction advances the teacher to the next review
   question or returns them to the live unanswered question.
2. **Learner experience confirmation.** Selecting a face/number opens a
   secondary confirmation dialog with Cancel and Confirm. It does not submit
   to the backend until Confirm is pressed. The existing duplicate-submit
   guard stays intact.
3. **Saving notice.** While the teacher presses the final review's "Save and
   Back to Enrolled Learners," a bottom-centered status says "Saving BOSY
   assessment…" (or MOSY/EOSY) until save succeeds or fails. It does not
   claim success before the backend responds; on failure the existing error
   message remains available.
4. **One vertical scrollbar.** During a teacher assessment, document
   viewport scrolling is authoritative. The body and main workspace cannot
   form a second vertical scroll context. Scoped root/body classes and all
   corresponding styles are removed on unmount.

## Preservation safeguards

- The learner's current question is **not rewound** when a teacher reviews
  previous comprehension answers. Only the teacher's display cursor moves.
  The coordinator's original question order, question content, and current
  progress index are preserved.
- Corrections update the existing index in the local comprehension journal
  and recovery checkpoint. Per-index server writes are serialized so a slow
  original answer cannot overwrite a later correction. Fallback outbox
  entries are rejected if obsolete. The final experience/rating flow waits
  for the pending correction journal.
- Changes do **not** alter CRLA scoring or thresholds, stop rules,
  completed assessment exports, offline pairing, or End Session/60-second
  timeout cancellation behavior.
- No learner or assessment records were manually erased.

## Validation

Mandatory `scripts/verify-comprehension-navigation.cjs` runs in
`npm run verify:assessment`. It exercises real navigation handler code,
answer reversal, immediate review progression, server-write ordering,
UI button disabled states, shuffled question ordering, rating confirmation,
the period-specific saving status, and the single-scroll lifecycle.

Production GitHub Actions build and Railway deployment must also pass.
Real tablet/browser interaction remains a separate on-device check.
