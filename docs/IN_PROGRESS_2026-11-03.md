# In-progress recovery checkpoint: CRL-2026-11-03.1

Recorded 3 November 2026, Asia/Manila. THIS IS NOT A COMPLETED RELEASE.
Production implementation remained at main commit 1a241f99233f1172b22708367910ecbb47cd7619.
Two workspace resets erased the unpublished implementation. A GitHub upload stalled;
the source tree 9c27e17f100ec3c1b5638f87c50c34803593d29c was NOT created (GitHub returned
422 Tree SHA does not exist). Do not report these app changes as deployed.

## Externally persisted work

- Main capstone Google Doc: 1gEgaLiW9vji6YKbHxPBkDY16mclt15Vussr7VAwzdUg, tab t.0.
  Scoped implementation/note updates and Figures 14, 15 and 23 with continuations
  were applied. Software table says Next.js 15.5.28. Last exported PDF had 106 pages;
  53 TOC/section entries matched, notes were justified, no em dashes or "will".
  Approved objectives/scope and Form 06 were untouched. This describes the intended
  pending app release; it is not evidence that production contains those changes.
- Supabase project yzmvacgteadehhqrcvwo: migration
  20261102171106_coordinator_recovery_indexes was applied and read back.
  SQL:
  CREATE INDEX class_archives_recovery_page_idx
    ON public.class_archives(created_at DESC,id DESC) WHERE purged_at IS NULL;
  DROP INDEX public.class_archives_school_year_key;
  CREATE UNIQUE INDEX class_archives_school_year_key
    ON public.class_archives(teacher_id,source_school_year_id)
    WHERE kind='school_year' AND purged_at IS NULL;
  Mirror the existing applied migration under Supabase and Prisma; do not reapply it.
  No browser grants were added. Final readback found no synthetic user -2147480000.
  Server-only class_archives remained inaccessible to anon/authenticated.
- Diagram PNG blobs were partly uploaded but no branch/commit contains the source.
  Figure 14 PNG blob f6203e96602a705b9f83b5aa19b4aaf0fe7df1a2 exists.
  Do not infer a complete source backup from that blob.

## Reconstruct and verify these implementation changes

1. Fix coordinator deletion/create-year/library-publication raw lock queries in
   lib/classWorkspaces.js, lib/coordinatorAdmin.js and lib/coordinatorPolicy.js:
   SELECT pg_advisory_xact_lock(177631,3)::text AS locked
   and publication lock (177631,1) with the same cast. Bare void results are
   unsupported by Prisma. Existing other lock helpers already use text.
   Global-year deletion must reuse an existing unpurged school-year archive,
   preserve encryptedSnapshot, retain an existing expiry and start 30 days only
   for an indefinite archive. A purged archive must allow a distinct fresh one.
   Preserve role/password, active-test, ownership, version and atomic rollback checks.

2. ClassDialog: outer flex column, overflow hidden, padding zero; solid independent
   header; children inside min-height:0 overflow:auto body (data-dialog-scroll).
   Keep focus trap, X, Escape/back, unsaved confirmation and scroll-lock release.
   This removes the top white slit/content bleeding above story/result headers.

3. Teacher: remove empty-year text from ClassScopeSidebar itself and replace the
   main Choose your class notice after selecting an empty year, including Analytics.
   Unassessed View says "This learner has no completed assessment yet."
   Green Start is left of blue View, with sufficiently specific theme selectors
   after legacy roster CSS. EoSY status must take precedence over BoSY+MoSY.
   Preserve eligible timeline choice, scoring and offline journals.

4. Coordinator Classes: keep initial searched/sorted actual teacher cards/photos.
   Selected teacher uses top school-year/section dropdowns and teacher-style roster:
   LRN, Last name, First name, Middle initial, Suffix, Sex, Status, Actions.
   Search, sex/status filters, A-Z/Z-A/LRN sort, selection, add/delete, read-only
   View, Print/Export. No Start, no editable scores/teacher remarks.
   Remove Archives/manual school-year archive/import controls from Classes.
   Add section dialog offers New section (optional XLSX/XLS/CSV file) or Existing
   section import. Combine new section creation and learner import atomically in
   /api/teacher/import-learners, retaining existing parser/size/security checks.
   Lock owner/year, validate duplicate section/name/LRN, stable operation UUID,
   same-request retries cannot duplicate. Invalid file/failed learner insert must
   not leave a partial new section. Avoid reloading a deleted section report.

5. Main admin Recovery: page all unpurged, unexpired class/year/learner archives
   with original teacher name on EACH item/group, stable createdAt/id keyset 50+1.
   Select only metadata, never encrypted snapshots for lists. Group by teacher+groupID.
   Year counts must consider available same-owner child archives after removal.
   Reuse ArchiveList, ClassArchiveRestore, LearnerArchiveRestore and existing
   coordinator archive APIs for selective/group restore, download, password purge.
   Preserve original ownership, 30-day countdown, legacy manual archives, backups,
   encrypted evidence, receipts and restore/import checks. Move downloaded archive
   import here with original teacher and destination choice. Keep generic older
   Recovery backup/history tools, also showing teacher_name from the relation rather
   than depending on the first 500 teachers in Overview.

6. Library: centered larger accessible spinner/label, no Retry while loading
   (retry on actual errors remains). Same pattern for years/classes/report loads.
   Fixed default/Random are equal full-width two-column cards with short subtitles,
   not dropdowns/small segmented buttons. Compact story fields/question spacing,
   remove "Enter the passage and its six comprehension questions." introduction.
   Retain three-way unsaved changes, 100 words, six manual question/answer pairs,
   canonical originals for every period, immutable published version bindings.
   Refresh must not discard dirty library drafts.

7. Photo: avatar is the browse button; remove Change picture. Pencil hover/focus
   and touch affordance. Crop dialog before upload: square canvas preview, drag,
   arrow keys and zoom 1..3. Crop side=min(width,height)/zoom, clamp source rect
   to image bounds, no white pixels. Validate JPEG/PNG/WebP <=2MB and <=16MP,
   release object URLs and ignore stale decode callbacks. Export 512px JPEG to
   existing authenticated /api/profile-photo, which normalizes to 256px and strips
   metadata. Cancel must preserve old picture. Refresh directory/selected teacher
   picture so Classes reflects changes.

8. Restore editable diagram sources in docs/diagrams/class-workspaces and manifest:
   Figure 14 profile/crop/recovery; 15 class dropdowns/combined import plus learner
   continuation; 23 Recovery/deletion and retention continuation (Coordinator actor,
   shorter diamond labels). Blue/purple/green lanes, white actions, yellow decisions,
   navy arrows, readable separate outgoing labels, final nodes under last actions.
   Existing general use cases/ERD relations remain valid; only partial indexes changed.
   Match native document images. Do not invent entities or scoring rules.

9. Add CHANGELOG and PROJECT_HANDOFF release entries with actual validation and
   limitations, mirror migration, teacher cache v55->v56 and build verifier.
   Learner remains v28, no learner protocol change. No new dependency required.

## Prior tests, which must be repeated on reconstructed source

Before erasure, clean npm ci, all-severity audit (0 known findings), full
verify:assessment suite and optimized build passed. Synthetic API tests covered
atomic section/import rollback, invalid files, duplicate/lost-ack retries, owner
checks, Recovery keyset/expiry/private metadata, year backup reuse and crop bounds.
Actual AdminDashboard QA passed 320/390/800/1440px in light/dark; teacher production
browser checks passed those widths including actual crop/upload/Print handlers,
empty-year and unassessed notices, Start/View order/colors and result scrolling.
These results do NOT validate newly reconstructed source automatically.
No physical hotspot/tablet or school acceptance testing was performed.

Optional browser tests already exist in main: verify-coordinator-console-browser.cjs
and verify-coordinator-dashboard-browser.cjs. Update fixtures for new dropdowns,
Recovery response, question answer guides and crop. Use a fresh production .next.
Use an unused local port and verify current teacher chunk in startup response;
stale local servers previously caused misleading old-build results. Browser env:
CRL_PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright
CRL_BROWSER_EXECUTABLE=/workspace/scratch/e5c3adf7d7db/browser-tools/runtime/chromium
LD_LIBRARY_PATH=/workspace/scratch/e5c3adf7d7db/browser-tools/runtime
FONTCONFIG_PATH=/etc/fonts
FONTCONFIG_FILE=/etc/fonts/fonts.conf
NODE_USE_ENV_PROXY=0 for local synthetic requests.

## Publish only after verification

Follow AGENTS.md. Preserve canonical stories, teacher-only guides, ownership,
assessment flow, immutable versions, local persistence and ordered sync.
Do not commit credentials, learner data, screenshots or database exports.
GitHub repo AkuSayangKamuJudaSayang/crl-app; production crl-app-tau.vercel.app.
Vercel project prj_CFgNzjloaKhddbNV3OJkh41jirMe, team team_Qz3mfEextBiODCiLKwSUQAXC.
Push verified main and confirm deployment READY, exact Git SHA and production alias.
Save source durably BEFORE a long binary upload. Never claim deployment based on
a partial blob upload or the capstone document alone.
