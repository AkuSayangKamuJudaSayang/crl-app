# CRL-App Release: Reading Coordinator Assessment Contents Editor
Date: 2026-11-17

## Changes
- In **Assessment Contents > Letters**, Add/Edit uses one compact single-character input per row. Alphabetic typing is converted immediately to uppercase. Characters other than A–Z and more than one letter cannot be entered.
- In **Words**, Add/Edit uses one compact single-word input per row, permitting 1–15 Latin letters only. Spaces, digits and punctuation are filtered as the coordinator types. Existing 10-word CRLA baseline remains valid.
- **Add another row** permits staging several letters or words in one dialog. Individual rows can be removed before the coordinator presses **Add items**.
- Duplicate validation runs as inputs change, case-insensitively, against both saved content and all rows currently staged in the dialog. Each offending row shows a visible inline message. A dialog containing blank, invalid, or duplicate rows cannot be submitted.
- The multi-line instruction "Add assessment items below, one per line." and its five-row textarea are removed.
- The **Default** checkboxes are slightly larger (23px). Fixed selection now requires **exactly** 10 different letters, 10 different words and 2 distinct stories. The selected count is shown; an 11th/3rd choice is prevented without deleting any prior choice.
- The saved library is updated only through the existing explicit **Save** operation, with optimistic revision checks. Closing, switching timelines, or navigating away without saving continues to offer the existing **Discard** action, so unsaved content and default choices do not reach teachers.
- After a successful publication, the server and offline runtime continue using the published library revision to build assessments. Each *new* assessment administers exactly 10 letters, 10 words and 2 story choices. Random selection draws from the entire saved collection using the run seed; fixed selection uses only the coordinator's 10/10/2 defaults.
- A live assessment retains its frozen revision, its exact item order, and its marks. Publication remains locked while teachers are conducting assessments.

## Safety and validation
- The shared server publisher revalidates case-insensitive uniqueness and fixed default counts. Legacy lowercase letters are canonicalized to uppercase on new publication.
- The new mandatory `scripts/verify-coordinator-item-editor.cjs` exercises normalization, row conflicts, preserving unsaved originals, 15-character words, exact defaults, and deterministic 10/10/2 selection.
- Updated library consistency tests reject extra fixed defaults without rejecting extra stored content intended for random draw.
- No historical learner results, session scores, scheduled timelines, passage texts, story questions, or existing teacher/learner pairing data are deleted or modified.
- Full GitHub Actions production build and Railway deployment health are separate release gates.
