# CRL-2026-11-17: Teacher Previous/Next review crash

## Observed failure

Selecting **Previous item** during a live teacher Letter Sounds or Word
Recognition assessment produced the full-page **CRL-App runtime diagnostic**
with `ReferenceError: Cannot access 'rk' before initialization`. This is a
minified identifier, not a database error.

## Root cause and patch

The React component declared `reviewedAnswer` ahead of the
`part1ResultsDraftRef = useRef(...)` it conditionally accessed. On the normal
assessment screen, `activeReview` was null so the read was skipped. Clicking
**Previous item** or **Next item** into review mode made it non-null,
triggering JavaScript's temporal dead zone on re-render.

Move the *reviewed answer calculation* below the draft ref initialization.
No hook, ref, stage, item order, scoring rule, stop rule, API, or local/offline
persistence path is otherwise modified.

## Regression checks

`scripts/verify-part1-review-corrections.cjs` now evaluates the actual
component's review-related variable declarations **in source order** so that
an out-of-order ref read fails in the build suite instead of in the classroom.

Scenarios include:
- First Previous and Next for saved letter answers, Correct/Incorrect
- Previous and Next for randomized coordinator-configured words
- Word stage reviewing the final letter in the previous stage
- Current item without review mode
- Locally revised mark overriding an older server response

This test joins the existing `npm run verify:assessment` chain.
GitHub Actions also runs the complete production build.

## Data safety

No assessment results or offline queues are erased by this patch. Completed
and unfinished assessment data, teacher/learner pairing, manual cancellation,
the one-minute disconnect timeout, and exports are unchanged.

## Device validation

Once the Railway deployment succeeds, reload the teacher app and test
Previous/Next on a fresh letter and randomized-word assessment. The automated
checks cover source execution but do not substitute for a real Huawei device
test.
