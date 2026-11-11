# CRL-App CRL-2026-11-12: Return to enrolled learners after final save

## User-visible behavior

When a teacher completes an assessment and presses **Save and Back to Enrolled Learners**, the app now closes the assessment and immediately shows the previously chosen **Conduct Assessment > School Year > Section** and the existing enrolled learner list. The teacher can start the next learner without reopening the main menu or selecting the class again. The final-save workflow still requires an acknowledged result before returning.

## Root cause

Previously, online assessments without an already-paired direct link used `router.push(assessmentUrl)`. The separate assessment route unmounted the teacher dashboard, wiping the selected school year, section and in-memory roster. The return URL only requested `?tab=conduct` and therefore created a brand-new dashboard and loaded every dataset again. Offline/paired sessions already used an embedded overlay.

## Change

- All normal **online and offline** assessment starts now open the assessment component over the *same mounted dashboard*, including online assessments without a direct peer link.
- The existing paired-device handoff still requires the learner device to acknowledge a new code. An offline session still requires a linked learner. An ordinary cloud/online session does **not** require offline pairing.
- Final Save and Back restores the Conduct tab in expanded mode and keeps the exact school year, section, and enrolled learners already in React memory. Roster selections and learner rows are not cleared.
- A completed assessment triggers only a background `get_assessments` update so the newly assessed learner's BOSY/MOSY/EOSY status becomes current without another `get_learners`, `get_classes`, or `get_activities` call just to leave the assessment.
- For exceptional standalone-route/recovery exits, a one-shot, session-scoped return hint stores only the signed-in teacher ID and school year/section IDs. After the class catalog arrives it validates ownership, class existence, active status, and expiry before restoring the view. The return hint is cleared on a normal embedded exit and never contains learner records or answers.
- No scoring, start eligibility, stop-rule, offline replay, pairing, privacy, database schema, or assessment content is changed.

## Verification

The existing teacher start, connectivity, offline browser, final review, learner and scoring regressions run during `npm run build`. Added `scripts/verify-conduct-return.cjs` for both modes, class and learner-list retention, targeted post-save refresh, paired/unpaired gates, one-shot scoped fallback and active-class validation.

## Field checklist

1. Pick a school year and section, confirm the enrolled learner list is loaded, and finish an **online** assessment.
2. After Save and Back, verify the selected school year/section and list reappear immediately. The saved learner's completion badge updates asynchronously without the list going blank.
3. Start and finish a second online learner from the same section without revisiting the main menu.
4. Repeat in **offline** mode with a paired device; ensure the peer connection survives and the local score is queued and later reconciles normally.
5. Verify a browser reopen after a standalone/recovered assessment uses the same class when it is still assigned. Deleted, archived or other-teacher classes must not be auto-restored.
6. Confirm the scoresheet shows the exact saved assessment and that no other learner's results changed.

A cold browser restart necessarily requires loading the teacher's data, but the ordinary Save and Back workflow no longer restarts the dashboard at all.
