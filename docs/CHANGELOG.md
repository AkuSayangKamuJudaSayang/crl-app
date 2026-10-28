# CRL-App version and change notes

This is the maintained release history starting on 17 October 2026. Dates use
Asia/Manila. Older entries were reconstructed from the repository's commit
history and the working context available when this file was introduced.
They are not a claim that all earlier releases were independently re-tested.

Use `git log --oneline --all` for the authoritative commit sequence. To find a
dated release, use `git log --all --grep='CRL-2026-10-17.1'`. Each future change
must have an entry here, including small UI fixes. See `../AGENTS.md`.

## CRL-2026-10-28.5 | Branded startup tied to actual recovery checks

- **UI:** The plain Checking assessment progress message is replaced with one
  centered, full-screen CRL-App startup screen using /crl-app-logo.png, a slim
  loading bar and the current check's message. It renders from the initial HTML,
  with responsive Arial text, safe-area spacing, saved dark-theme support and
  reduced-motion styling. The original logo stays legible on a quiet light plate
  in dark mode. Screen-reader progress exposes completed startup checks, not an
  invented network/download percentage.
- **Actual progress:** The bar advances after saved sign-in is read, account
  verification completes, local recovery eligibility is checked, and the latest
  cloud/local assessment state is resolved. It holds at the current completed
  milestone while work is pending. Not-applicable branches finish immediately.
  The existing finally/checked handoff removes it as soon as checks resolve;
  there is no minimum display duration, countdown, progress interval or completion
  hold. Return-to-workspace navigation uses an indeterminate bar until the existing
  pathname handoff completes. CSS animation/transition never delays dismissal.
- **Preserved:** Original six-second network deadlines, verified-account/valid
  offline-session fallback, signed-out/expired-session rejection, owner scope,
  deleted/final-saved/cloud-ended guards, recovery merge, paused timer and learner
  acknowledgement requirements. No startup mutation or recovery decision changes.
  The old independent window-load spinner/160ms removal timer is superseded;
  TeacherAssessmentRecovery now owns the one visible startup screen. The logo is
  explicitly precached for offline startup. Main service-worker cache is v43.
- **Validation:** Clean npm ci, full assessment regression suite and production
  build passed; live all-dependency npm audit reported zero vulnerabilities. New
  actual-effect tests hold/release storage/auth/host promises, verify immediate
  fast handoff, offline fallback, invalid/deleted/cloud-ended paths and cancellation.
  Actual service-worker tests serve the precached logo without internet. New
  optional browser test compiles the real recovery/loader components with controlled
  synthetic IO: Chromium checks pass at 320/390/800/1280/1440px, light/dark, including
  image decode, viewport fit, pending phase stability, reduced motion and immediate
  ready/recovery handoff. The rendered mobile screen was visually inspected.
  Browser fixtures are not a physical installed-device or production-account test.
- **Files/rollback:** AppLoadingScreen, teacher layout/recovery progress wiring,
  startup and optional browser tests, offline-shell test, verification chain/cache
  and these maintenance notes. No dependency, database, assessment/scoring or
  capstone/ERD change. Keep recovery decisions and bounded offline fallback intact
  when reverting presentation; do not restore independent competing splash timers.

## CRL-2026-10-28.4 | Stable native mobile selection actions

- **Issue/evidence:** The supplied seven-second phone video shows the selection
  card separating from its toolbar slot and moving inconsistently during quick
  swipes. The 28.3 implementation positioned a body portal from bounding rectangles
  on scroll animation frames. Its synchronous geometry tests did not establish
  compositor/momentum-scroll behavior on a phone.
- **Fix:** Mobile selection actions now remain in normal document flow as a direct
  child of the long Conduct learner panel, after the filters. The browser handles
  position:sticky with a safe-area top inset while selection exists. There are no
  scroll listeners, animation-frame measurements, fixed coordinates, placeholders
  or body portal for the mobile bar. This explicitly supersedes the 28.3 tracking
  design. Conduct-only mobile overflow overrides let sticky reach the actual page
  scroller; the wide table retains its own horizontal scrolling. The header keeps
  rounded top corners. Desktop uses the same action group in its original inline
  toolbar target via a breakpoint-only portal, without duplicating buttons.
- **Preserved:** Select All/Deselect All and typed-confirmation deletion callbacks,
  learner selection/counts, 44-pixel controls, dark theme, static-text/code policy,
  assessment suspension, scoring, persistence and sync. The bar returns naturally
  to its original position when scrolling to the top. Deselecting/suspending turns
  sticky off; leaving the view removes its single media-query listener.
- **Validation:** Clean npm ci, native-component/breakpoint tests, existing roster
  render, scroll-lock and full assessment regression gates. New optional
  scripts/verify-roster-sticky-browser.cjs compiles the real action component and
  dashboard CSS into an isolated synthetic fixture. Chromium checks pass at
  320/390/768/1024/1440px, light/dark: large alternating scroll jumps, 8,000px/s touch
  gestures with per-frame position sampling, viewport bounds/no page overflow,
  exactly one action group, selection/clearing, the deletion callback, breakpoint
  changes and suspension. The mobile screenshot uses synthetic
  learners only. This is browser-fixture QA, not a physical phone/MatePad test or
  an authenticated production assessment. No production fixture records created.
- **Files/release:** Teacher dashboard, selection component/styles, component and
  optional browser tests, these notes and main service-worker cache v42. The full
  production build and live all-dependency audit passed with zero vulnerabilities. No dependency, database, assessment rule or capstone/ERD changes.
  Roll back application presentation only; retain the nontracking mobile design
  when addressing future layout changes rather than restoring 28.3 coordinates.

## CRL-2026-10-28.3 | Quiet roster rows, reachable mobile selection and text-selection policy

- **Conduct roster:** Hover no longer changes the row/cell background. Selected
  rows retain the same subtle theme-surface background both with and without
  hover; individual Start/Delete button feedback is preserved. Only the enrolled
  learner roster is targeted, not report grids or other tables.
- **Mobile selection:** Select All, Deselect All and Delete Selected share one
  action group. With selected learners at widths up to 768px, it follows its
  toolbar slot until the viewport top, then remains accessible while scrolling.
  Scrolling up carries it continuously back to its original location. A measured
  placeholder prevents layout jumps; one body portal avoids clipped/transformed
  dashboard ancestors. Resize/visual-viewport changes and inner scrolling update
  its bounds through a coalesced animation frame. Deselecting, leaving the class
  or opening an assessment removes the floating presentation/listeners. Desktop
  flow, filtered selection and the existing deletion confirmation stay intact.
  The bar has safe-area spacing, theme colors and 44-pixel controls, with two
  columns and a full-width deletion action on narrow screens.
- **Text policy:** Teacher routes and learner browser/PWA routes suppress static
  text highlighting and ordinary clipboard copying. Assessment-code displays
  and offline connection/response code fields explicitly remain selectable and
  copyable, including keyboard copy. Editable inputs, textareas and editable
  content retain native editing, selection, cut, copy and paste. Read-only view
  text has no general exemption. Mixed code/view-text selections cannot be copied.
  Shared guard ownership prevents duplicate listeners or premature cleanup across
  route transitions. File drops, paste, clicks, passage miscue hotkeys and the
  existing right-click disarm handler are not intercepted by the shared policy.
  This supersedes the old installed-only learner clipboard scope. The legacy
  strict helper option remains available for explicit code-only consumers.
- **Validation:** Clean npm ci, targeted shared-guard events and actual action-bar
  lifecycle/geometry tests (scroll down/up, resize, desktop, deselect, suspension,
  cleanup), existing real roster/header renders and full assessment regression
  suite and production build passed. The live all-dependency npm audit reported
  zero vulnerabilities. Browser visual and physical-device
  acceptance are separate and not claimed. Main cache v41; learner cache v21.
- **Files/rollback:** Teacher dashboard/layout and assessment-code marker, shared
  selection-action and text-guard components, learner guard wrapper, clipboard
  helper, verification chain, caches and maintenance notes. No schema, assessment
  rules, ownership, sync ordering or learner-data changes. Keep clipboard edits
  and code exceptions when reverting presentation. No capstone/ERD change needed.

## CRL-2026-10-28.2 | Restore Start-dialog scrolling and align the Conduct roster

- **Scroll fix:** The Start confirmation and dashboard transition previously
  saved/restored body overflow independently. A layout-effect cleanup followed
  by the dialog passive cleanup could restore stale hidden overflow, preventing
  scrolling after Cancel or Back. ClassDialog and dashboard busy/analytics
  overlays now share a document-scoped, reference-counted scroll lock. Only the
  final owner restores original inline styles, priorities and scroll position.
  Releasing twice is safe. ClassDialog owns its confirmation lock; dashboard
  does not acquire a duplicate confirmation lock. Focus returns without moving
  the restored page. Keep focus trapping, Escape, PWA Back and period eligibility.
- **Conduct UI:** One compact three-column header places Back at left, the
  centered school-year/section/Enrolled Learners text in the middle, and Refresh
  at right. The previous separate back row and its empty vertical space are
  removed. Symmetric 44-pixel controls keep the heading centered. Tablet/desktop
  roster headings, cells and action groups share center alignment; phones retain
  labelled rows and readable 44-pixel Start/Delete controls. Wrapping is retained
  for narrow screens and long section names. Theme colors remain inherited.
- **Files:** app/teacher/page.jsx, components/ClassDialog.jsx, new shared
  lib/pageScrollLock.mjs, scroll lifecycle and roster render verification scripts,
  package verification chain, service-worker cache and these maintenance notes.
- **Validation:** Clean npm ci; regression tests execute the actual ClassDialog
  effects and dashboard layout effect for Cancel, Escape, PWA Back, repeated
  opening, busy handover and overlapping analytics in both cleanup orders.
  Actual roster/header rendering verifies the controls and optional name cells.
  Full assessment verification and production build passed with the live dependency
  audit reporting zero vulnerabilities. Browser visual and physical tablet
  testing are separate and not claimed.
  Service-worker cache advances to v40.
- **Database/documentation/rollback:** Presentation/lifecycle only, with no schema,
  ownership, scoring, persistence, sync or learner-data changes. No database
  migration or capstone/diagram revision is necessary because the documented
  workflows and relationships are unchanged. The shared-lock cleanup supersedes
  independent snapshots for ClassDialog and dashboard transitions. Keep both
  consumers on the shared helper on rollback; do not restore the stale-overflow
  race. Release only after the full build and zero-vulnerability audit pass.

## CRL-2026-10-28.1 | Container navigation, readable roster and missing-period comparisons

- **Navigation:** Conduct, Records and Analytics now have labelled, arrow-only
  44-pixel Back controls inside their main containers. They return from a class
  to its section chooser and from sections to years. At the year chooser, the
  top-left app Back returns to the main menu. Existing classBack/PWA navigation,
  scope clearing and unsaved-remarks confirmation are retained.
- **Roster:** Selected school year and section context and Enrolled Learners are
  larger. The roster retains selection, then LRN, Last Name, First Name, Middle
  Initial, optional Suffix, Sex, Status and Actions. Initials are derived for
  display; full stored middle names are preserved. Missing/legacy placeholder
  middle values and missing suffixes display a dash. Actions have full borders,
  readable type and at least 44-pixel touch heights, overriding the old text-link
  rules. Updated phone card labels match all nine cells; tablet/desktop keep a
  scrollable aligned table. Counts, selection, period eligibility and deletion
  confirmation are unchanged.
- **Analytics:** Periods without completed assessments display Not assessed/dashes,
  with no signed delta. Compare counts only when both adjacent selected periods
  contain assessed data. A measured profile count of zero is still comparable;
  an absent period is never interpreted as zero or a decline. Existing section
  scope and All Sections graph-only behavior remain.
- **Database/docs:** Live inspection confirms middle_name and suffix already
  accept null. Both importers already support Middle Initial headers, and store
  supplied initials without inventing names. No migration, data rewrite or ERD
  redraw is needed. Teacher-wide uniqueness and existing keys remain intact.
  Updated three scoped sentences in Chapter 3 for container arrows, optional
  names/initials/suffixes and current teacher-wide identity. Approved objectives,
  scope, figures, references and paragraph formatting are preserved. Native
  readback and PDF QA retain 104 pages, with updated paragraphs visually checked.
- **Validation:** Clean npm ci with documented telemetry opt-outs; full regression
  suite and production build with live all-dependency npm audit reporting zero
  vulnerabilities. Added actual roster/comparison render tests, optional/full/
  initial-only name tests and CSV/XLSX/XLS importer cases with missing or initial-
  only middle columns. Existing navigation, ownership, offline replay, security,
  reports and scoring checks remain. Browser/device visual testing is separate;
  no physical Huawei/tablet or LAN acceptance is claimed. Cache advances to v39.
- **Rollback:** Application-only change; preserve all data and existing indexes.
  Restore the previous presentation only if necessary, keeping the rule that
  missing assessment periods cannot produce a measured decline.

## CRL-2026-10-26.2 | Compact Records header and account-wide learner identity

- **UI:** Records now has one Import control in its class header, using the same
  ClassRecordImport as Conduct for learner/class-record files. The duplicate
  report-toolbar control is removed. Section backup import remains available in
  the selected section's options menu; chooser-level year/section backups remain
  separate. Selected class headings put School Year above Section: name. Header
  padding and the gap before reports are reduced, and its trailing header margin
  is removed so the bottom is balanced. Shared styles retain phone/dark-theme
  behavior and Arial labels. Conduct's context follows the stacked naming.
- **Identity:** A teacher account can no longer enroll a duplicate LRN or normalized
  full learner name across any school year or section, including archived classes.
  Normalization folds case, compatibility characters and whitespace, retaining
  complete middle names and suffixes. Names displayed as initials do not define
  identity. Other teacher accounts stay independent. Manual saves, online/offline
  imports and local additions check the full account roster; imports skip matching
  names/LRNs and accurately report skips. Database unique indexes enforce every
  write path, concurrent insertion and archive restoration. Conflicting restores
  fail atomically rather than overwrite or duplicate an enrollment. This explicitly
  supersedes the earlier per-section LRN uniqueness rule. A source enrollment
  still retained in an archived class must be removed before it can be restored
  as another enrollment; encrypted backups remain untouched.
- **Database:** Applied 20261026143944_teacher_wide_learner_identity with matching
  Prisma/Supabase migrations, teacher/LRN uniqueness and a normalized full-name
  expression index. A read-only aggregate preflight found zero duplicate groups;
  no learner, assessment or archive was edited/deleted. Both live indexes are
  valid and unique. Existing ownership/RLS protections remain unchanged. The
  Prisma declaration also records teacher/LRN uniqueness; the expression index
  remains in SQL because Prisma cannot express it. No dependency changes.
- **Validation:** Clean npm ci with telemetry disabled, full regression suite,
  live npm audit with zero vulnerabilities and production build. Expanded actual
  importer/manual-entry tests reject existing names with different LRNs and LRNs
  in another class. Actual rendered controls verify stacked headings, the single
  import slot and compact class scope. Existing offline failover, sync, grading,
  recovery, archives and report tests remain required. Browser visual and physical
  device testing are not claimed. Service-worker cache advances to v38.
- **Documentation/rollback:** Capstone implementation notes should describe account-
  wide identity uniqueness rather than per-enrollment duplicates. Native documents
  and diagrams were not edited in this system UI request. Keep the indexes on an
  application rollback; removing them would weaken the requested uniqueness rule.

## CRL-2026-10-26.1 | Assessment completion, quiet synchronization and archive restoration

- **Assessment:** The sync prompt is visible only in the teacher dashboard and
  suppressed on assessment routes and embedded offline assessments. Background
  persistence and ordered synchronization continue unchanged. Final review has
  a blue question-mark help button with mouse hover and keyboard focus, and
  highlights each miscue with the same palette as the passage controls. The
  results dialog traps focus, blocks dismissal and locks background scrolling.
  Timeout confirmation is visibly disabled and cannot advance until a passage
  word has been selected; the handler also rejects missing or zero selection.
- **Completion:** Three effort-based messages distinguish the letter-sound stop,
  the letters/words stop and full completion. All transports use one guarded
  three-second timer at termination or teacher review, before final teacher save.
  Frequent polling previously restarted this timer indefinitely. A terminal
  learner view clears recovery and returns to code entry without ending the
  teacher's independent review or discarding its journal.
- **Rating integrity:** The previous stage guard rejected already-saved ratings
  before its duplicate branch. A short owned-host transaction now serializes
  rating writes with final review. Identical ratings in review/completed sessions
  are acknowledged without rewriting older answer, miscue or timer snapshots.
  Conflicting ratings, wrong accounts/learners and premature stages stay rejected;
  failures roll back the entire write. Metrics calculation stays outside the
  transaction. Existing blocked retries can drain normally after deployment.
- **Archives:** School-year import belongs to the school-year chooser; section
  import belongs to the section chooser. The responsive Arial dialogs support
  single/multiple JSON files through drop or browse, per-file results and safe
  retries. Each file commits separately and successful files are not resubmitted.
  School-year imports can create their missing year; section imports create or
  reuse an empty matching section in the selected active year. Existing evidence
  is never overwritten. Archived/occupied targets remain guarded.
- **Learner restoration:** New multi-learner deletions retain a common group ID
  while keeping an independent encrypted backup per learner. Archives separates
  years, sections, individual learners and groups. A teacher may select one,
  several or all available group members and choose an active destination year
  and section, including when source containers were deleted. Restoration may
  append to an occupied class but rejects duplicate LRNs. Per-archive receipts
  make retries idempotent and preserve newer records. The complete selection
  commits atomically; owner, roster-reset, tamper and read-only checks remain.
  Older archives without a group ID remain individually available; no historical
  group membership is guessed and no automatic deleted-learner recovery returns.
- **Database/files:** Applied additive migration
  `20261026124644_learner_archive_restore_receipts` adds nullable deletion-group
  and restore-receipt metadata, checks and an index. Private RLS and revoked
  public privileges are verified. No production records were rewritten or test
  learners created. Changed assessment clients/API, offline prompt/runtime,
  class workspace/import/restore dialogs, archive helpers, Prisma schema,
  regression scripts and service-worker cache v37. No dependency/version change.
- **Validation:** Clean npm ci with Prisma's documented telemetry opt-out, live
  all-dependency npm audit (zero vulnerabilities), full assessment verification,
  Prisma generation and optimized Next production build passed. Added executable
  tests for actual completion handlers across all transports, repeated terminal
  updates, concurrent/finalized rating retries, rollback and conflicts; chooser
  imports, selective/group restoration, evidence, receipts and destination
  collisions; actual component rendering, file controls and theme/responsive
  rules. Browser installation returned truncated downloads, so browser visual QA
  and physical tablet-to-tablet acceptance are not claimed. Existing full offline
  failover/outbox, scoring, enrollment, security and export tests pass.
- **Documentation/rollback:** These changes refine completion and explicit archive
  restoration within the existing approved scope; maintain capstone descriptions
  of background sync, effort-based learner closure and selective recovery. No
  native capstone document or diagram was edited in this system-only request.
  Keep additive metadata and encrypted backups when rolling back application code;
  do not replay old journals over completed assessments or resurrect tombstones.

## CRL-2026-10-25.5 | School-year archives and class-record import in Records

- **Request/result:** A teacher can archive an entire school year from its
  Assessment Records row menu. Archives now distinguishes School Year, Section
  and Learner entries. A year entry retains an encrypted bundle of its remaining
  section backups, section/learner totals and retained source year identity.
  Section and individual learner downloads remain available. Empty years can
  also be archived. This supersedes year operations appearing only as separate
  Section entries. Existing archived years without a bundle can use Archive once
  more to create that entry from their retained section snapshots.
- **Restore/safety:** The original year backup restores its separate sections,
  learners, assessment evidence and remarks into an empty active year owned by
  the same teacher. A restoration marker makes retries idempotent. Wrong-owner,
  reset-era, tampered, archived/deleted or occupied destinations are rejected.
  Year archive creation and source lifecycle changes commit in one transaction;
  active assessments or backup failure prevent partial removal. Source deletion
  retains backups. Empty-container deletion still uses secondary confirmation
  only and creates no empty deletion backup. Nonempty deletion retains its
  phrase, reason and synchronization acknowledgement. Offline pending work must
  finish syncing before archive/import. A year bundle is bounded to 3 MiB of
  sealed data for the hosting request limit; oversized operations fail without
  removing data and direct the teacher to retain individual section backups.
- **Records import:** Inside an active section, Records uses the SAME
  ClassRecordImport component and selected class identity as Conduct. Importing
  adds enrollments to their shared roster and blank unassessed report rows;
  it does not fabricate scores or move learners across classes. Archived classes
  remain read-only. Testing also found existing separate-name column detection
  and XLSX legacy-stream iteration defects. Both online/offline parsers now
  prefer distinct first/last-name columns; combined-name workbooks remain valid.
  The online ZIP entry stream is wrapped in Node's Readable before async
  iteration, retaining entry/expanded-size limits.
- **Database/affected:** Applied additive migration
  20261025134013_school_year_archive_bundles, with matching Prisma/Supabase
  files. Source section is nullable for year entries; retained source year,
  section count and a year restore marker are added. Kind checks and a partial
  unique index protect the new shape. Private RLS/revoked public privileges
  remain. No existing learner, score or archive payload was rewritten. Other
  files: class workspace helper/UI, teacher Records toolbar, import route and
  offline parser, mandatory regression scripts, service-worker cache v36 and
  maintenance notes. No runtime dependency or npm package version change.
- **Documentation:** Updated Chapter 3 directly in the main Google Doc, including
  school-year bundle/import behavior, the shared roster import, evaluation tasks
  and implementation baseline. Figure 8 now uses the established solid blue,
  purple and green swimlanes, white actions and yellow decisions. Figures 6, 16,
  23 and 24 reflect the new archive/import behavior and selected schema fields.
  Editable diagrams.net/SVG sources and the generator are in this repository.
  Figure numbering, justified notes, heading hierarchy and approved objectives/
  scope are preserved. No external claim or reference was added.
- **Validation:** Clean npm ci and full production build passed; live npm audit
  reported zero vulnerabilities across all dependencies/severities. Executed
  encrypted year/section restoration, owner/reset/tamper/occupied-target and
  active-assessment rollback checks. Actual PostgreSQL migration QA preserves a
  legacy backup, enforces kind/source/count/unique-year constraints and retains
  private access. Actual CSV/XLSX/XLS server and offline parsers pass separate/
  combined/middle-name, duplicate, ownership and archived-class checks. Browser
  checks passed at 1440/768/390/320px, light/dark, using isolated synthetic
  storage, actual built pages and the actual server import/class helpers. They
  confirm shared roster visibility, blank report rows, year archive labels and
  archived import rejection. Native readback preserves Figures 1-26 and justified
  notes. PDF QA confirms 105 pages, changed figures/notes together, and unchanged
  page positions for all 55 headings. No TOC page edits are needed. These checks
  do not claim physical-device testing or production test-data creation.
- **Rollback:** Keep the additive columns and retained backups when reverting
  code. Do not restore an older restrictive kind constraint or erase year
  archives. Do not resurrect deleted enrollments during synchronization.

## CRL-2026-10-25.4 | Coordinate teacher joins and resilient live presence

- **Problem/evidence:** A cloud learner could successfully claim its invitation
  and display the first item while the teacher still read the mirrored waiting
  host. OfflineRuntime aborted all assessment GETs at 1.8 seconds, shorter than
  realistic host reads; the teacher then reused the stale local waiting copy.
  The learner's existing 15-second crash detector also depended entirely on
  realtime/direct presence, so blocked WebSockets could produce an interruption
  overlay even while both apps were open. A future-dated cached waiting copy
  could additionally reject the real first claim through its clock comparison.
- **Teacher reads:** host_get has a 15-second bounded deadline, still aborting
  immediately on the browser's offline event. lean=1 now reads exactly one owned
  host row and omits evidence, metrics and the content catalogue, preserving the
  teacher's journal and previously hydrated pool. A proven first connected claim
  may advance a cached waiting view despite clock skew and resets the version
  baseline to that authoritative snapshot. Stage/item regression guards remain.
  Poll errors consult the live session ref instead of a stale captured state.
- **Live presence:** Existing fresh-nonce realtime and direct peer messages stay
  primary. After five seconds without fresh proof, both screens use a bounded
  HTTP challenge/acknowledgement fallback. Only an authenticated owning teacher
  can publish; a learner can read and acknowledge only a live claimed code.
  Short-lived challenges are consumed atomically once; late overlapping ACKs
  are permitted, while stale/replayed/foreign proofs do not release recovery.
  /api/assessment/presence accepts only these operations, strips learner-side
  credentials and rejects caller commands/replay flags. Public learner presence
  bypasses teacher IndexedDB. Successful live HTTP responses restore reachability
  without surrendering pending local write authority. The fallback never answers
  from saved hosts, caches or the outbox, and never queues presence for replay.
- **Database:** Applied assessment_presence_relay to the live project as
  20261025070254. Matching Supabase and Prisma migration files use that applied
  version (the initially CLI-created draft was renamed to match the actual
  migration ledger). assessment_presence is a one-to-one, cascade-deleted support
  table for HostSession, carrying only transient challenges/status/ACK timestamps.
  RLS is enabled and anon/authenticated table privileges are revoked. Backend SQL
  is parameterized and checks code ownership, claimed/assigned/live state and
  expiry. No learner, answer, timer, assessment stage or HostSession.updated_at
  was rewritten. Existing unfinished attempts remain available to their owners.
- **Affected:** assessment API/presence wrapper, independent server/client relay
  helpers, OfflineRuntime, both assessment clients, Prisma model/migrations,
  regression scripts, cache v35 and these maintenance notes. No runtime
  dependency upgrade. PGlite 0.5.11 is used only for isolated SQL QA, outside the
  application dependencies; verify-presence-postgres.mjs documents its module path.
- **Validation:** Clean npm ci and the full npm run build passed. The live
  all-dependency/all-severity npm audit reported zero vulnerabilities. Actual
  PostgreSQL tests cover the migration, owner
  isolation, live/claimed-only proof, overlapping/concurrent one-use ACKs, expiry,
  interruption, parameterization, unchanged progress timestamps, RLS/revoked
  access and FK cleanup. Source-executing API/client/runtime tests cover auth,
  narrow reads, skewed cached waiting state, credential/action stripping and
  never caching/queueing presence. The failover regression delays a teacher read
  beyond 1.8 seconds, observes the other device's claim, marks offline and syncs
  that answer exactly once. Rendered QR and typed-code trials block realtime,
  delay host reads to 3.2 seconds and include a failed initial read/future-dated
  local mirror; both screens advance, marking propagates, false interruption
  stays absent, and actual teacher closure still triggers learner recovery.
  A final rendered paired-link fixture keeps both apps active without cloud
  requests, saves a marked letter locally and reconnects/synchronizes it exactly
  once with an empty outbox. This fixture emulates the already-confirmed peer
  transport and does not claim native ICE negotiation.
  Native WebRTC ICE could not obtain a LAN candidate in this execution runtime;
  physical device/hotspot acceptance must not be claimed from these trials.
- **Documentation/rollback:** This strengthens existing connection/recovery
  behavior and preserves approved objectives, scope, CRLA criteria and reports.
  An implementation ERD appendix may show HostSession's optional one-to-one
  presence support relation; no new user actor or assessment task is introduced.
  Deploy the additive table before the app. Rolling code back can leave this
  private support table in place; do not erase assessment data or recovery
  checkpoints as a rollback step.

## CRL-2026-10-25.3 | Restore desktop content placement and compact mobile defaults

- **Request/result:** Desktop Manage Assessment content is left-aligned beside
  the number column again. The Default column heading is visible, while each
  desktop checkbox remains free of repeated label text. Action placement stays
  consistent with the preceding release.
- **Mobile:** Every checkbox has a visible Default label. Number, content,
  default selection and Edit/Delete share one compact horizontal list row,
  including at 320px. This explicitly supersedes 25.2's two-row phone layout.
  Long titles/words use visual ellipsis in narrow content cells with their full
  original text retained in the DOM, title and existing edit overlay. Checkbox
  accessible names, selection limits, fixed/random modes, drafts and saving are
  unchanged. The shared Save/Add group and item heading styles now apply at all
  widths, retaining their gap and theme contrast on desktop as well as phones.
- **Affected:** app/teacher/page.jsx, service-worker cache v34 and its build
  assertion, CHANGELOG.md and PROJECT_HANDOFF.md. No dependency, API, database,
  scoring, roster, persistence or synchronization behavior changes.
- **Validation:** Clean npm ci and full npm run build passed; the live
  all-dependency/all-severity audit reported zero vulnerabilities. Real Chromium
  viewport checks passed at 1440, 1024, 768, 760, 390 and 320px, in light/dark
  themes, using isolated synthetic API/store fixtures. They verify desktop
  content/header positioning, absence of repeated desktop Default text, mobile
  Default labels, single-line center alignment of every row's content/checkbox/
  actions, compact row height, no overlap/overflow, full retained title text,
  keyboard toggling, actual Save/selection requests, fixed/random switching and
  adjacent Save/Add controls. A general 15px table-cell padding override was
  explicitly reset for mobile item rows to keep their height compact. Existing
  assessment, archive, authentication and offline gates passed. No production
  records were used or modified; physical-device acceptance remains separate.
- **Documentation/rollback:** This is presentation-only, with no change to
  approved objectives, scope, workflow diagrams or data relations. No migration
  is needed; reverting this release restores the 25.2 layout.

## CRL-2026-10-25.2 | Compact content controls, class context and mobile analytics

- **Request/result:** Conduct Assessment now displays the selected school year
  and section together directly above Enrolled Learners, using wrapping context
  text rather than restoring the old class-management toolbar.
- **Manage Assessment:** Save moves beside Add Item, and beside Import file and
  Add Story for passages. Removed saved/used counts, the redundant fixed-default
  count/instruction block and visible Default table/checkbox labels. Checkboxes
  retain descriptive accessible names, focus indicators and larger hit targets.
  Desktop content and actions are centered within their columns. Mobile item
  rows use a single aligned grid for index, content, checkbox and Edit/Delete,
  replacing detached absolute-position controls. A scoped width override keeps
  item toolbar buttons adjacent despite the general full-width mobile rule.
  Add and Save are grouped so Import can wrap above them at 320px without
  separating Save from Add Story. Item headings use the theme's readable color,
  and long story titles wrap within their own cell instead of crossing controls.
  At 430px and below, content spans the top of each card; the checkbox and actions
  share a second aligned row so titles stay readable even on a 320px screen.
  Existing fixed/random choices, selection limits, period drafts, validation,
  Save requests and teacher-only story guides remain unchanged.
- **Analytics:** All Sections uses the same vertical BoSY/MoSY/EoSY period-card
  layout as an individual section on phones, including each card's enlarge
  action. Desktop retains the grouped chart. This explicitly supersedes the
  24.5 decision to force the desktop horizontal canvas on small screens. The
  year view remains graph-only, with no learner list or comparison/results panel;
  no aggregation, enrollment ownership or year-isolation logic changes.
- **Affected:** app/teacher/page.jsx, service-worker cache v33, updated analytics
  rendering checks/cache assertion, and PROJECT_HANDOFF.md. No dependency,
  database, API, migration, scoring, persistence or synchronization changes.
- **Validation:** Clean npm ci and full npm run build passed, including the live
  all-dependency/all-severity audit with zero vulnerabilities and existing
  scoring, content-selection, recovery, archive and offline regression checks.
  Real Chromium checks used isolated API/store fixtures and synthetic learners
  at 1440, 820, 768, 390 and 320px, in light/dark themes. All ten combinations
  passed: class context above the roster; no redundant labels/counts; Save beside
  Add in all content tabs; checkbox/action center alignment; long-title bounds;
  actual Save plus selection requests; all three mobile period charts inside
  the viewport; enlarge/close; identical mobile chart dimensions for All Sections
  and a single section; no individual results in the combined view. No production
  learner records were used or mutated. Physical-device acceptance is separate.
- **Documentation/rollback:** Presentation-only changes introduce no new actor,
  data relation or assessment activity, so no capstone workflow/ERD change is
  needed. Reverting this release restores the prior UI without a database
  rollback; retain the newer online-entry/recovery fixes from 25.1.

## CRL-2026-10-25.1 | Online entry, centered recovery, safe bulk confirmation and bounded records

- **Supersedes the incomplete 24.6 join fix:** Normal learner entry now posts to
  the credential-free /api/assessment/join route, which shares the main route's
  atomic single-use claim. OfflineRuntime sends this public request directly to
  the cloud before reading teacher IndexedDB, cached bearer tokens or local host
  projections; it uses a 15-second entry deadline instead of the teacher mutation
  deadline. A transport error triggers a fresh reachability check. A reachable
  server failure stays an inline online error, not automatic Offline Mode Settings.
  Known offline and genuinely unreachable Wi-Fi retain existing offline setup,
  supplied offers and confirmed device-link reuse. No assessment data is erased
  to install this release; prepared clients receive service worker v32.
- **Server/teacher consistency:** Join reads a small host/learner/period selection,
  prepares current learner-safe content before consuming the invitation, and
  atomically replaces waiting text with the configured first letter. The response
  and teacher's next host read use the same item. A genuine in-progress item is
  retained. Removing the second deep host read avoids unnecessary evidence/teacher
  loading. Content-read failure leaves the invitation unconsumed. A final live
  aggregate check found older joined letter placeholders. Ten legacy active host
  shells had neither a learner nor an assessment reference and were explicitly
  retired in the live database without deleting rows or touching actual records.
  Owned teacher host
  reads repair those only when an atomic predicate proves no letter answers,
  completion, ending or newer item exists; valid/scored progress is untouched. Single-use,
  ended/completed-session and rate controls remain enforced. The public wrapper
  strips cookies, bearer headers, replay flags and caller-supplied action changes.
  Teacher-only question answers remain excluded. No schema change is required.
- **Recovery:** The compiled styled-jsx selectors did not match the dialog's
  classes, leaving it without fixed centering. AssessmentRecoveryDialog now uses
  a dedicated CSS module and a body portal, avoiding ancestor positioning effects.
  Centering, constrained phone size, light/dark contrast, focus trapping, scroll
  lock and the explicit Continue/End choice remain; Escape/backdrop do not dismiss.
- **Bulk deletion:** A React click event had been interpreted as skipConfirm.
  Delete Selected now calls an explicit opener; only literal true from the typed
  confirmation enters deletion. Opening or canceling sends no delete request and
  shows no deletion progress. Server phrase/reason validation and one encrypted
  archive per deleted learner remain unchanged.
- **Records:** Scoresheet and Class Record have bounded 65vh/65dvh viewports capped
  at 640px, with internal two-axis scrolling, keyboard focus, touch panning and
  native scrollbar access. This intentionally supersedes the old page-only scroll
  invariant. Class Summary retains page flow; exports and the full roster are not
  truncated. No score, remarks, class isolation or report-content rules change.
- **Validation:** Clean npm ci and full npm run build passed. Live all-dependency,
  all-severity npm audit reported zero vulnerabilities. New source-executing tests
  cover canonical/legacy atomic claims, actual configured items, private guides,
  concurrent/expired/rate-limited entry, unconsumed invitations after content
  failure, the bulk click handler and bypass of teacher storage for public entry.
  Existing scoring, recovery, archive, authentication and ordered offline gates
  also passed. Local real-browser trials used isolated API/store fixtures and 80
  synthetic enrollments: teacher-generated QR decoded through a virtual camera,
  a 6.2-second online join, no offline overlay, and the same configured first item
  on both interfaces. Recovery portal geometry and both table axes passed at
  1280x900, 768x1024 and 375x812, in light and dark modes. Bulk Cancel sent no request.
  Physical tablets/cameras and production-data acceptance were not exercised.
- **Database/test limits:** Production approval review rejected a proposed
  multi-record test-data setup as not explicitly authorized. Verification used
  isolated local fixtures instead. The one temporary setup account was removed;
  no synthetic learner/class/session records were created in production, and no
  real learner record was modified by the test setup. The guarded legacy
  placeholder initialization runs on an owned teacher read after deployment,
  without changing scores. The only live data repair retires the ten already
  orphaned invitation shells; verification found no dangling active invitations.
  RLS/grants/schema are unchanged.
- **Documentation:** Chapter 3 clarifies direct online entry, verified fallback,
  centered recovery, confirmation and bounded tables. Approved objectives/scope
  and Chapters 1-2 are preserved. Figures 8, 15, 16 and 22 already depict the same
  human-level actions; their editable geometry needs no structural change. The
  exported document remains 104 pages; all 54 TOC headings retain their body
  pages, Figures 1-26 remain sequential and Chapter 3 notes remain grouped.
- **Rollback:** Revert public route/client/runtime handling together with the cache
  gate; preserve the server invitation safeguards and keep orphan shells retired.
  Revert viewport and CSS-module
  changes together if needed. No database rollback or learner cleanup is needed.

## CRL-2026-10-24.6 | Direct online learner assessment QR and code entry

- **Cause:** Learner join treated any embedded pairing offer as an instruction
  to open Offline Mode Settings, even when cloud service was reachable. A stale
  failed reachability probe also diverted a normal typed/scanned code into that
  branch before attempting the assessment join.
- **Fix:** QR scans, invitation URLs and the normal six-character field now use
  the existing host_join endpoint when the browser has a network route. A
  successful response loads/persists the current task, closes connection settings,
  clears the pending-offer UI and marks online reachability for normal updates.
  An offer is retained only for actual network failure. Known browser-offline
  devices keep immediate offline setup; dead Wi-Fi still uses the bounded request
  failure/fallback. An offline:true reply from the existing local runtime remains
  marked offline, retaining its offer rather than masquerading as cloud success.
  Reusing a teacher-confirmed local assessment remains unchanged.
- **Error and concurrency safeguards:** Invalid, used and rate-limited codes stay
  errors rather than being converted by stale offline status into pairing. A
  per-code in-flight guard avoids duplicate single-use claims. Existing stale
  response isolation, installed-app-only offline setup, confirmed device reuse,
  pairing mismatch checks and server claim/ownership/period rules remain intact.
- **Scope/database:** No API or schema changes, production data rewrite, learner
  removal, scoring changes, period-rule changes or authentication changes. Existing
  direct links, recovery, local persistence and ordered synchronization remain.
  Service worker advances to v31 to deliver the updated learner bundle.
- **Affected files:** LearnerAssessmentPage join callback/ref, actual-callback
  connectivity regression checks, explicit offline pairing fixture, service-worker
  cache gate, maintenance notes and Figure 8 learner-entry label/source exports.
- **Validation:** Clean npm ci and full npm run build passed. Live npm audit over
  development, optional and peer dependencies at all severities reported zero
  vulnerabilities. Tests execute actual QR and join callbacks for online/offline,
  installed/browser, embedded offer, stale probe, first-task persistence, cloud
  errors and simultaneous submission. Existing offline RTC/codec/hub, assessment,
  recovery, archive, authorization and synchronization gates passed. No physical
  camera/device session was exercised; these are automated callback/API/transport
  tests, not a claim of tablet acceptance.
- **Documentation:** Native Chapter 3 entry/connectivity/evaluation prose and the
  delivery baseline are updated. Figure 8 now names QR/code entry, with its same
  editable source, colors, connectors and geometry; no figure renumbering or ERD
  change is needed. Exported PDF remains 104 pages; all 54 TOC headings retain
  their pages and Figures 1-26 retain order and grouped notes. Figure 8 was visually
  reviewed; captions/images/notes retain the 36pt indent and notes are justified.
  Approved objectives/scope and Chapters 1-2 are unchanged.
- **Rollback:** Revert the learner callback/ref and cache/gate together. No database
  rollback or data deletion is required. Do not restore offer-forces-offline logic.

## CRL-2026-10-24.5 | Sequential Analytics navigation and year-wide graph

- **Request and superseded UI:** Replaces the paired Analytics dropdowns from
  24.4 with school-year-first, section-second vertical lists using the same
  ClassWorkspace styles as Conduct and Records. The selected year heads Choose
  Section. The shared top-left/PWA Back returns from results to sections, then
  school years, then the main menu. No extra navigation buttons or class mutation
  controls are added. Loading/empty notices and chronological ordering remain.
- **All Sections:** An explicit option inside the chosen year displays one
  combined Reading Profile Progress graph for that year's owned, nondeleted
  sections, including retained read-only archived classes. It has no comparison
  table, learner list or individual results beneath it. On narrow screens the
  same canvas scrolls horizontally rather than becoming separate period cards.
  Count/percentage modes and period enlargement remain available. A specific
  section retains its charts, comparison and learner evidence.
- **Isolation and compatibility:** Scope uses section and enrollment IDs within
  the selected year, never names/LRNs. Foreign, deleted and orphaned data remain
  excluded. Empty/invalid selection never means all classes. The explicit all
  option requires at least one valid section. Existing class detail API/offline
  boundaries and scope-change dialog/request cancellation are preserved. Conduct,
  Records, Manage Assessment, scoring, authentication and sync writes are unchanged.
- **Database:** No migration, production data rewrite, enrollment removal or
  credentials change is necessary. Existing year/section ownership relationships
  support this read-only aggregation. Service worker advances to v30.
- **Affected files:** AnalyticsClassPicker now reuses ClassWorkspace.module.css;
  obsolete picker CSS is removed. Analytics scope, teacher Back/render bindings,
  chart-only mobile rendering, service worker cache check, scope/navigation/view
  regression tests, Figure 16 sources/SVG/PNG and diagram README are updated.
- **Validation:** Clean npm ci and full npm run build passed. Live all-dependency,
  all-severity npm audit reported zero vulnerabilities. Actual chooser callbacks,
  Back transitions, class-vs-year rendering and single-canvas markup passed.
  Year/class boundaries, repeated LRNs, foreign/deleted/orphan rejection, empty
  selection, archived history, existing API and offline evidence checks passed.
  Existing assessment, recovery, archive, offline-sync and authentication gates
  passed. A browser viewport run could not start because the runtime browser was
  absent and its download failed; do not claim physical/mobile browser testing.
- **Documentation:** Native Chapter 3 prose, evaluation/orientation and Figure 16
  now distinguish a class view from the explicit graph-only year view. Approved
  objectives/scope and other chapters are unchanged. The exported PDF remains
  104 pages; all 54 native TOC headings retain their body pages, Figures 1-26 are
  sequential, and each Chapter 3 figure retains its note on the image page.
  Figure 16 was visually reviewed, with colored swimlanes, white processes,
  yellow decisions, separated branches and notes justified at the existing indent.
- **Rollback:** Revert this release's UI/helper/cache changes together. Existing
  API, database and stored records remain compatible; no data rollback is needed.

## CRL-2026-10-24.4 | Compact class selection for Analytics only

- **Confirmed scope:** The user corrected Manage Assessment to Analytics before
  implementation. Manage Assessment content, controls and persistence remain
  unchanged. No per-class assessment-material feature or new database table is
  introduced by this release.
- **UI:** Analytics has a compact pair of native School year / Section selectors,
  with Arial typography, 44px touch targets, separated focus outlines, stacked
  mobile layout and useful loading/empty notices. Years remain chronological;
  sections sort by name. There are no add, edit, delete, archive or class-management
  actions in this chooser. Existing archived classes may be selected for read-only
  analysis. Archives remain accessible only in Assessment Records.
- **Data isolation:** Analytics requires a valid selected year and section before
  displaying charts or learner results. Its own selection is independent of the
  last class opened in Conduct or Records. Charts, profile comparison, learner
  directory, selected periods and detailed evidence use only matching enrollment
  IDs from that class, including when names or LRNs repeat in another class/year.
  Missing, foreign, orphaned or tombstoned rows cannot fall back to combined totals.
  Changing class clears search, learner selection and chart/mobile result dialogs;
  the existing cancelled-request guard rejects late evidence responses.
- **API/offline:** The optional class_section_id on get_assessment_detail checks
  owned class availability and constrains the database relation. The offline read
  applies the same enrollment boundary. Older owned requests without this optional
  parameter remain compatible. No scoring, remarks, content-editing, live pairing
  or synchronization-write behavior is changed. Service worker cache advances to
  v29 so prepared clients receive the updated Analytics controls.
- **Database:** Existing school_years, class_sections and enrollment ownership
  relations already support this read-only feature. No schema migration or data
  rewrite is necessary. Do not create or modify teacher material sets for this
  request. No existing learners, results, archives or authentication settings are
  deleted or changed by this release.
- **Affected files:** AnalyticsClassPicker JSX/CSS, analyticsClassScope.mjs,
  teacher Analytics bindings, assessment detail query, offline detail reads,
  service worker, regression gate and class-scope tests. Existing Manage Assessment
  editor JSX was compared with the prior release and is byte-for-byte identical.
- **Validation:** Clean npm ci completed with the locked dependencies. Full build
  and live npm audit passed with zero reported vulnerabilities. Behavior checks
  passed separate years/classes with repeated LRNs, foreign/orphan/tombstone
  rejection, archived read-only selection, no-selection empty results, native
  selection-only markup, empty notices, the actual API detail handler and offline
  evidence boundaries. Actual database integrity inspection found no invalid
  class/year/teacher links and retained the existing enrollment count; no data was
  rewritten. Chapter 3 PDF QA verified all 54 TOC entries against body pages,
  sequential Figures 1-26 and image/caption/note grouping. Revised notes remain
  justified at the matching left indent. Approved objectives and scope were
  compared unchanged. GitHub/Vercel delivery must match the release commit.
  Physical mobile/tablet interaction is not claimed as tested.
- **Documentation:** Chapter 3 describes selection-only Analytics, independent
  class context and scoped descriptive statistics. Figures 6 and 16 are updated
  with matching editable diagrams.net, SVG and PNG sources. Figure 16 retains the
  Records remarks/export path and a separate read-only Analytics path. Approved
  objectives, scope, assessment criteria and Manage Assessment remain unchanged.

## CRL-2026-10-24.3 | Empty-container confirmation and individual learner archives

- **Request/behavior:** Deleting a school year with no remaining sections, or a
  section with no enrolled learners, now opens only Cancel/Delete confirmation.
  No phrase, reason or synchronization checkbox appears for these empty targets.
  The server counts records under the existing owner/class locks; a target that
  became nonempty rejects the lightweight request and asks for the stronger
  confirmation. Years with any section still require their exact phrase/reason,
  even if that section has no learners. Nonempty sections and all explicit
  learner deletions retain the existing phrase/reason safeguards. Empty deletion
  creates no empty backup and never removes existing archives.
- **Learner archives:** Single and bulk learner deletion creates one separate
  encrypted teacher archive per learner, with assessment evidence, metrics,
  remarks and passage title. Each entry is labeled Learner and names its source
  school year/section. Existing class archives are labeled Section. Teacher
  archive creation, the existing grouped private admin recovery/audit and source
  deletion commit together. Any failure rolls the whole batch back. Serializable
  isolation, owner/class locks and active-assessment checks protect the snapshot;
  concurrent conflicts return a safe retry response. Lost acknowledgements do
  not duplicate archives. This intentionally adds the requested downloadable
  learner archives; the obsolete Saved offline items and automatic deleted-
  learner recovery features remain removed. Old permanent deletions are not
  recreated or backfilled. Explicit backup import remains teacher-owned and
  requires an empty active section, with no automatic restoration by sync.
- **Offline:** A local learner deletion retains its ordered journal and shows a
  separate pending Learner archive label in Assessment Records. Only metadata is
  cached in that list, not a duplicate plaintext assessment snapshot. The server
  acknowledgement replaces the pending label before confirmed deletion cleanup.
  Offline-created learner IDs remap before archive reconciliation. Failed work
  remains queued; other classes and teacher accounts are retained. Confirmed
  unavailable learners remove only their obsolete pending metadata. Account roster
  resets clear old cached archive metadata as well as obsolete learner work.
  Container deletion remains online-only for authoritative emptiness checks.
- **Database:** Additive migration 20261024071118_learner_archives adds kind,
  retained source_learner_id and learner_name to class_archives. Existing rows
  default to Section. A check constrains learner entries to one learner with
  identifying metadata. Retained source IDs intentionally have no deletion FK.
  RLS remains enabled and public/anon/authenticated Data API grants are revoked;
  teacher-scoped authenticated server routes remain the access path. No roster
  purge or legacy learner restoration is requested by this release. Apply before
  deployment; prefer forward fixes while learner archive rows exist.
- **Affected files:** ClassWorkspace and DeleteLearnersDialog, shared class
  lifecycle and private-history helpers, assessment endpoint, teacher API wrapper,
  OfflineRuntime/deletion cleanup, Prisma schema and mirrored SQL migrations,
  service worker v28, regression scripts and diagram sources.
- **Validation:** Clean npm ci installed 109 locked packages. Live audit and full
  production build passed with zero reported vulnerabilities. Regressions passed
  authoritative empty deletion, race-to-nonempty rejection, retained safeguards,
  separate learner archive evidence, rollback, pending/acknowledged offline archive
  metadata, direct online deletion, class/account isolation and roster resets.
  Actual database migration applied; security advisors retained only seven
  informational notices for intentionally private server tables, with no warning
  or error findings. Production smoke checks passed empty-year/section
  confirmation without phrase/reason, nonempty safeguards, single/bulk learner
  archives, idempotent deletion replay, authenticated download, repeated import
  without duplicates, exact score/remarks preservation, and cross-account denial.
  SQL verification confirmed that letter evidence and passage title survived the
  learner backup round trip. Empty source-section deletion preserved all three
  individual learner archives. Both synthetic accounts and all dependent test
  data were removed after verification; the existing learner count was retained.
  The tested code is commit 72a0f7b. Final delivery adds only this verification
  record, a passage-title regression assertion and long-label wrapping in dialogs.
  The matching final GitHub/Vercel SHA is identified by the release commit.
  Chapter 3 PDF review verified all 54 TOC entries, sequential Figures 1-26 and
  caption/image/note page grouping. Notes remain justified at the matching left
  indent; approved objectives and scope text are unchanged. Physical mobile/tablet and local Wi-Fi
  interaction are not claimed as verified by these automated checks.
- **Documentation:** Update Chapter 3's deletion rules, archive types, offline
  pending state, data model, evaluation and orientation tasks. Figures 6, 15, 23
  and 24 have matching editable diagrams.net, SVG and PNG sources. Figure 15
  separates incoming decision arrows from outgoing No branches. Approved project
  objectives, scope, assessment scoring and period prerequisites are unchanged.

## CRL-2026-10-24.2 | Refine class menus and protect class lifecycle changes

- **Request/UI:** Use Arial throughout the new controls, separate field labels
  from focus rings, and make the whole row respond to pointer hover. School years
  and sections are vertical lists with empty states. Years sort by ascending
  start year, including after offline edits. Titles are Choose School Year, then
  the selected S.Y. heading above Choose Section. The shared top-left Back moves
  from roster/records to sections, then school years, then the main menu, while
  preserving the existing unsaved-remarks guard. Removed the extra Change class
  and School years buttons. The selected-class toolbar is hidden in Conduct;
  archives, archive actions and backup import are available in Assessment Records.
- **Menus:** Both year and section rows have a vertical-ellipsis menu. Edit is
  available for active containers; Delete requires an exact scope-specific phrase,
  a reason and confirmation that devices have synchronized. Current records are
  encrypted into independent section archives before the source enrollments are
  removed. A failed snapshot or active assessment rolls the operation back. Year
  operations cover all its remaining sections. Empty sections can be archived;
  empty years have no section data to back up. Repeated deletion requests do not
  create duplicate snapshots. Archived containers remain read-only in Records.
- **Account fields:** Teacher registration and profile editing no longer ask for
  section, and neither endpoint requires it. New teachers store no account-level
  section. Existing nullable legacy values remain for compatibility with old
  offline snapshots; class ownership and reporting use ClassSection exclusively.
- **Offline integrity:** Teacher-owned deleted-year/section tombstones block stale
  queued additions and edits from recreating a removed class. Reconciliation
  removes only the affected class's obsolete learner work, retains other classes
  and accounts, and rejects delayed reads for deleted classes. Concurrent creation
  of the same year returns a canonical year alias and remaps queued sections.
  Archive/delete/import requires online service and an acknowledged local queue;
  disconnected devices cannot be remotely checked, so explicit synchronization
  confirmation remains necessary. A sealed archive is capped at 3 MiB to remain
  within deployment request/response limits; oversize operations remove nothing.
- **Database rollout:** 20261024034858_class_menu_lifecycle adds nullable lifecycle
  timestamps, partial active-name/year unique indexes, and a compatibility trigger
  that rejects enrollment in archived or deleted containers. Existing full unique
  constraints are retained during rolling deployment. Apply
  20261024035116_class_menu_active_uniqueness only after the new application is
  READY, explicitly creating and validating the active unique indexes in the same
  migration before removing those old full constraints, so an active container may reuse
  a deleted name or year without reusing its identifier. Prisma cannot describe
  partial uniqueness, so preserve these explicit SQL indexes in future migrations.
  Existing classes and learner data are not deleted by these migrations. No new
  account-level roster purge is authorized or flagged by this release.
- **Diagnostics:** Server error logs include only sanitized error codes and class
  names, never ORM arguments, submitted values or provider messages.
- **Build privacy:** The cross-platform runtime build wrapper disables optional
  Prisma checkpoint and Next.js usage telemetry. Live npm audit and all regression
  gates remain required; failures stop compilation/deployment.
- **Validation:** Clean npm ci --offline installed all 109 cached packages. Live
  npm run audit:security reported zero vulnerabilities. Full npm run build passed,
  including the assessment/offline/recovery/auth suite, class lifecycle and archive
  tests, registration without section, ordered sync, tombstone isolation, year
  alias remapping, hub packaging, Prisma generation and production compilation.
  An isolated synthetic responsive fixture was prepared, but Vercel preview
  sign-in prevented browser inspection. It and its preview-only embedding rule
  were removed before production. Narrow-screen CSS was reviewed; physical
  mobile/tablet interaction is not claimed as verified. Deployment and
  API smoke checks on the deployed application verified profile
  fields without a teacher section, chronological years, actual year changes in
  both directions, section rename, owned enrollment, typed archive-before-delete,
  reuse of a deleted name, whole-year cleanup and empty-section backups. An
  initial year-edit smoke request returned a generic error; after the validated
  uniqueness rollout and fresh build, repeated edits succeeded with no runtime
  errors. Sanitized diagnostic types are retained to investigate recurrence.
  Live checks also passed encrypted archive download/import, idempotent import
  retry, archived-year write rejection and cross-account archive/year access
  rejection. Temporary synthetic accounts and their dependent data were removed;
  the existing non-test learner count remained unchanged. Chapter 3's updated
  figures were visually checked in PDF export, figure numbering remained 1-26,
  image/caption/note grouping was retained, and TOC page numbers were refreshed.
  Approved objectives and scope text remained unchanged.
  Final deployment evidence must identify the matching GitHub/Vercel SHA.
  Physical tablet pairing and school acceptance remain separate from these checks.
- **Documentation:** Update Chapter 3's class navigation, lifecycle, data model
  and validation procedures; replace Figures 15, 23 and 24 using the accompanying
  editable sources. Preserve approved objectives, scope and scoring conditions.
- **Rollback:** Prefer a forward fix. After deleted names are reused, the former
  full unique constraints cannot be recreated without resolving those historical
  duplicates. Retain tombstone IDs and independent archives. Do not reintroduce
  teacher Saved offline items or silently restore deleted enrollments.

## CRL-2026-10-24.1 | School-year classes, safer learner actions and retained archives

- **Request:** Organize Conduct Assessment and Assessment Records by school year
  and section; use one Start action with sequential period choices; protect
  deletion; permit only remarks edits; show all enrolled learners in reports;
  retain manually archived section backups and align the capstone diagrams.
- **Behavior:** Teachers choose/add school years, add/rename sections and select
  their class before opening its roster or records. One learner Action opens a
  single-selection BoSY/MoSY/EoSY dialog. MoSY requires completed BoSY and EoSY
  requires completed MoSY, checked in the UI, API and offline runtime. Completed
  periods cannot be started again through this action. Scoresheet Edit Remarks
  accepts only remarks; stored scores, dates and evidence remain authoritative.
  Scoresheets and class records include unassessed enrollments with blank result
  cells, while assessment statistics exclude these placeholders.
- **Deletion:** One enrollment requires its exact first name, bulk deletion
  requires DELETE N LEARNERS, and both require a reason. Ownership and active
  assessment checks remain on the server. Identical LRNs in different classes
  must never delete or merge one another's enrollments.
- **Archives:** Teachers explicitly confirm a completed class and type its
  archive phrase. An authenticated encrypted snapshot survives source learner
  deletion and can be downloaded later. The same teacher may import an original
  backup into an empty active class; retries do not duplicate records. Tampered
  and foreign backups are rejected. These actions require cloud reachability and
  cleared pending local work; they are not silently queued offline. A permanent
  account roster reset invalidates archives made before that reset.
- **Database:** Applied additive migration 20261023155504_class_workspaces.
  SchoolYear/ClassSection/ClassArchive are server-only with RLS and revoked
  public Data API grants. Composite ownership foreign keys protect class
  membership. Learner uniqueness is now class + LRN. Existing enrollments were
  backfilled into S.Y. 2026-2027, preserving their original sections. Legacy
  unscoped cached/queued enrollment work is assigned only to its uniquely
  matching backfilled class. Already scoped work is never moved automatically.
- **Authorized maintenance:** A private production-build worker processes only
  explicitly flagged teacher accounts after all release checks and compilation.
  It atomically removes their learners/results/hosts/section archives and learner
  copies in application recovery/backup history, preserving other accounts and
  assessment content. Delayed pre-reset roster/result reads are rejected in
  normal loading, background warming and sync preflight. It creates no new backup. A monotonic roster version
  prevents stale device queues from recreating deleted enrollments. Login,
  authenticator and account protections are preserved. This is irreversible;
  do not re-flag accounts without a new explicit user instruction. Existing
  disconnected devices receive the reset after reconnecting with the new app.
- **Files:** Teacher workspace/dialogs, assessment/import/export routes, offline
  runtime, reporting helpers, schema and matching migrations, maintenance worker,
  service-worker shell versions, regression scripts and editable Chapter 3
  diagrams under docs/diagrams/class-workspaces.
- **Validation:** Fresh npm ci passed. Full assessment regression suite passed,
  including class ownership, prerequisite periods, typed deletion, remarks-only
  rejection, repeated-LRN isolation, archive authentication/retry/restore and
  permanent-reset cleanup scope/rollback. Next.js production compilation and
  Prisma validation/generation passed. Rolled-back live SQL fixtures verified
  cross-year LRN reuse, same-class duplicate rejection and cross-owner FK
  rejection. Security advisor reports only the seven informational no-policy
  notices for intentionally server-only tables. Local live npm audit is blocked
  by the environment's registry 403; it is not a clean audit. The unchanged full audited Vercel preview build passed for candidate a7aae3a,
  reporting zero vulnerabilities. Deployed synthetic API checks verified class
  creation/rename, repeated-LRN isolation, prerequisite rejection, typed intent,
  score-edit rejection, Start/cancel, encrypted archival, download after source
  deletion and idempotent import. The final production build must repeat this
  gate. Keep its exact GitHub SHA and Vercel deployment in delivery evidence.
  Automated checks do not prove physical tablet-to-tablet pairing or user
  acceptance. No new dependency versions or audit suppressions are introduced.
- **Documentation:** Added editable SVG/diagrams.net sources for class selection,
  assessment, records, synchronization, archives, administrator unlock-review
  goals and affected ER views. Chapter
  3 must place the new archive activity in 3.3.3, renumber ER figures 24-26,
  preserve matching caption/image/note left indents, justify notes and describe
  class-scoped enrollments and remarks-only editing. Approved objectives and
  assessment scoring rules remain unchanged.
- **Rollback:** Do not drop class columns or restore the old global LRN unique
  index after separate enrollments exist. The legacy insert trigger supports
  pre-upgrade clients but rejects stale unscoped additions after a roster reset.
  Prefer a forward fix. A source rollback cannot undo permanent data removal.

## CRL-2026-10-20.2 | Patch Next.js and Sharp, require clean release audits

- **Request:** Fix the two reported npm vulnerabilities and require clean audits
  for subsequent fixes and features.
- **Dependencies:** Upgrade Next.js from 15.5.24 to 15.5.28 and Sharp from
  0.35.4 to 0.35.5, including matching SWC and native image libraries in the
  lockfile. Next.js 15.5.28 explicitly supports Sharp ^0.35.5. The Sharp override
  prevents dependency resolution from falling back to its vulnerable 0.34 line.
  Keep existing PostCSS/deepmerge fixes and the vendor-patched SheetJS build.
  No forced major framework update or npm package version bump was performed.
- **Advisories:** [Next.js cache poisoning](https://github.com/advisories/GHSA-4jqv-mc3x-m676),
  [Next.js SSG/ISR substitution](https://github.com/advisories/GHSA-mcj8-r9mp-w47p)
  and [Sharp/librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
- **Release gate:** `npm run audit:security` audits development, optional and peer
  dependencies and fails on any low or higher vulnerability. Every production
  build runs it first, including Vercel. Registry errors also block the build.
  The GitHub validation workflow now uses Node 24 and reproducible `npm ci`,
  checks main pull requests as well as pushes, and has read-only contents access.
  AGENTS.md requires a fresh install, zero findings and appropriate regressions
  for every future fix or feature. Do not omit dependency groups or suppress
  findings to release.
- **Files:** Package manifest/lockfile, dependency security version checks,
  deployment validation workflow, AGENTS.md and project handoff/change notes.
- **Validation before release:** Fresh `npm ci --offline` from the package cache
  passed. Online plain `npm audit` and the full `npm run audit:security` both
  reported zero vulnerabilities. Native Sharp 0.35.5 reports librsvg 2.63.2;
  synthetic SVG resize/conversion to PNG, JPEG and WebP and application-logo
  conversion passed. A simulated unreachable registry stopped `npm run build`
  before regression, packaging or compilation steps, confirming audit failures
  do not silently continue. Full `npm run build` passed, including the complete
  assessment/offline/sync/recovery/auth regression suite, offline hub packaging
  and trusted-certificate checks, Prisma generation and Next.js production
  compilation, type checks and page generation. Local production HTTP smoke
  checks passed for the landing, teacher/admin login pages, unauthenticated admin
  API rejection and the Next.js image optimizer returning a 256px WebP logo.
  `git diff --check` passed.
- **Migration / limits / rollback:** No database or browser-storage migration,
  assessment rule or application feature change. Known advisory data can change
  after an audit; this gate cannot prove that all application vulnerabilities
  are absent. Physical classroom devices were not re-tested for this dependency
  patch. A rollback to the previous dependencies restores the reported findings;
  preserve patched dependencies and audit enforcement when reverting other code.

## CRL-2026-10-20.1 | Account login lockouts and teacher unlock requests

- **Request:** Seven wrong-password attempts lock a teacher for 30 minutes or
  an administrator for five minutes. Only teachers can request early unlocking.
- **Behavior:** Persist failure counts and lock deadlines in the account row.
  Serialize password checks and unlocks with a parameterized row lock, shared
  across devices and deployments. The seventh failed password starts the lock;
  further attempts cannot extend it, and a correct password cannot bypass it.
  Expiry starts a fresh set of tries. A successful password check resets failures.
  The existing IP budget and separate authenticator-code limiter remain active;
  the old fixed account request bucket no longer delays an expired admin lock.
- **Unlock workflow:** A locked teacher can send one request per lock episode.
  A short-lived, purpose-bound receipt uses a derived signing key distinct from
  session/2FA keys. It authorizes request submission only. The admin dashboard’s
  Unlock requests tab shows requests, refreshes while open, and offers confirmed
  Unlock or Dismiss. Approval clears only the matching current teacher lock,
  records the reviewing administrator and writes an audit event atomically.
  Old, duplicate, expired, forged or already reviewed approvals cannot unlock a
  later lock. Admin accounts cannot submit unlock requests.
- **Identity and integrity:** Requests are explicitly unverified. Administrators
  must confirm teacher identity through a trusted school contact before approval.
  No password is stored in requests; unlocking does not reset a password, bypass
  2FA, revoke a current assessment session or change assessment records. Pending
  2FA challenges are checked against the current account lock before completion.
  Both login pages show an accessible, responsive lock overlay and retry timer.
- **Offline:** Server security rejections no longer fall back to cached passwords.
  Only unreachable/502/503/504 service conditions can use prepared offline login.
  A local mirror retains observed locks; offline password attempts have their own
  seven-failure limit. A wholly disconnected device cannot learn a new lock or
  early unlock on another device until it reconnects. Local browser state is not
  a tamper-proof global security authority. Existing offline assessments, recovery,
  saved work and synchronization are retained.
- **SQL protection:** New input uses Prisma filters or tagged parameterized SQL.
  Login throttling addresses password guessing; it is not a substitute for SQL
  parameterization. No unsafe raw-query interpolation was introduced.
- **Files:** Login pages/dialog, authentication compatibility bridge, auth/admin
  API routes, `lib/loginSecurity.js`, `lib/offlineLoginSecurity.js`, offline auth,
  shared rate limiter, Prisma schema, matching Supabase/Prisma migrations,
  `scripts/verify-login-lockout.cjs`, build verification command and these notes.
- **Validation before release:** Full `npm run build` passed with the existing
  assessment/offline/security regression suite and optimized Next.js build.
  Focused synthetic tests cover exact thresholds/durations, concurrency, expiry,
  password resets of counters, duplicate requests, stale/tampered receipts,
  session-key isolation, admin-only listing/resolution, rollback on audit failure,
  dismissal, pending-2FA rejection and durable local counters. Applied the additive
  migration and verified constraints with a rolled-back synthetic SQL transaction.
  Verified new-table RLS and denied anon/authenticated table grants. Security
  Advisor reports only informational no-policy notices on server-only tables,
  including this deliberately inaccessible request table. No classroom/device
  testing or perfect resistance to every attack is claimed.
- **Migration / rollback:** Add three default-safe user fields and the server-only
  `account_unlock_requests` table. Apply the SQL before deploying the generated
  Prisma client. No credential, learner-data, scoring, dependency or npm version
  change. A code rollback can leave the additive fields/table intact; do not drop
  requests or reset existing accounts as part of rollback.

## CRL-2026-10-18.1 | Resume assessments after app closure

- **Request:** Recover an assessment after an unexpected teacher or learner app
  closure, ask the teacher whether to continue, and detect the absent device.
- **Recovery:** Add a synchronous, teacher-scoped local checkpoint alongside the
  existing IndexedDB answer journals. Save stage/item position, administered
  content, answers, miscues, passage elapsed time, last-word review and unsaved
  final-review inputs during normal use, without depending on an unload event.
  Reopening the teacher workspace asks Continue assessment or End assessment.
  Reuse the same attempt/code/period; never create a second assessment to resume.
- **Timer and connection:** Freeze recovered passage time at its checkpoint.
  Require a fresh learner acknowledgement before reopening recovered controls;
  the teacher explicitly resumes reading. Lightweight presence packets run on
  the existing direct, same-device and realtime transports. Missing presence
  after 15 seconds causes a waiting/reconnect prompt; the teacher pauses passage
  reading when the learner stops responding. Page closure sends a best-effort
  immediate interruption notice. Network-mode changes do not close presence.
  Reopened learner apps restore their current attempt and wait for the teacher.
  A destroyed WebRTC connection requires a fresh QR/response exchange offline;
  saved connection flags cannot establish a live connection.
- **Integrity and access:** Recovery remains within authenticated teacher and
  learner ownership. The recovery API changes controller position/timer only,
  with compare-and-set protection; it does not calculate scores or finalize an
  assessment. Restore the host projection and its ordered replay entry in one
  IndexedDB transaction to prevent a reconnect race. Preserve local answer
  evidence while rejecting older cloud positions. Exclude saved final reviews,
  explicit End actions and deleted learners. Minimal resolved markers block late
  callbacks from recreating a closed/deleted recovery. Offline-created learner
  IDs remain supported. Storage failures show an explicit checkpoint warning.
- **UI:** Minimal non-dismissable recovery dialogs, keyboard focus containment,
  inactive background controls, mobile/tablet sizing and saved dark-theme colors.
  Ending during reconnect requires confirmation. No Saved offline items feature
  or deleted-learner recovery is reintroduced.
- **Files:** Teacher layout/controller, learner controller, assessment API and
  offline runtime; `components/TeacherAssessmentRecovery.jsx`,
  `components/AssessmentRecoveryDialog.jsx`, `lib/assessmentRecovery.mjs`,
  `lib/teacherOfflineDb.js`, assessment channel/peer transports, recovery and
  existing regression scripts, `package.json`, and these handoff/release notes.
- **Validation:** Focused synthetic runtime-loss, owner/deletion/late-write,
  timer-freeze, API authentication/idempotency, presence/acknowledgement and atomic
  replay tests passed. A fresh teacher JS realm also re-paired the same assessment
  with the surviving learner using RTC browser doubles and no cloud. Full
  `npm run build` passed, including the existing assessment verification suite,
  offline setup packaging checks, Prisma generation and optimized Next.js build.
  No real learner records were used in tests.
- **Migration / limits / rollback:** No database migration, dependency update,
  scoring-rule change or npm version bump. Applies to assessments checkpointed
  by this release; old unscoped session pointers are intentionally not revived.
  Both devices need the new app code. Browser storage clearing or device damage
  cannot be recovered by a local checkpoint; up to the last timer tick may be
  rounded to a whole second. Physical Huawei tablet force-stop/re-pairing tests
  remain necessary. Browser automation was unavailable in this environment
  because its Chromium download failed; no visual or physical-device success is
  claimed. Revert the release commit to roll back; journals/outboxes are retained.

## CRL-2026-10-17.5 | Repair failed ICE and show connection-check progress

- **Request:** Remove sticky dark button hovers on touch devices, soften desktop
  hovers, and make Check connection visibly check and repair a paired link after
  a device disconnects and rejoins its network.
- **Cause addressed:** The earlier Check connection action only queued a ping
  and returned cached status immediately. A terminal ICE failure needs fresh
  offer/answer negotiation; waiting or sending more pings cannot perform it.
- **Connection check:** Display a disabled Checking connection control with a
  spinner, await fresh peer activity or a bounded timeout, then show the result.
  A reset invalidates an old check's UI callback. Background wake probes remain
  lightweight and separate from a user-requested check.
- **Recovery:** Established peers can exchange fresh ICE descriptions through
  the existing realtime service when internet is available again. The teacher
  coordinates offers in either original pairing order to prevent offer glare.
  Retries reuse a pending exchange, preserve peer/run identity and replay the
  latest assessment state after actual channel recovery. SDP acknowledgement
  alone never declares connection success. Pure offline initial QR/code pairing
  and direct assessment traffic still work without this optional relay.
- **Signalling privacy:** Derive separate room and AES-GCM keys from the original
  pairing exchange. Relay only encrypted connection metadata, with a random IV,
  role and sequence validation, replay protection, bounded inputs and pinned
  remote DTLS fingerprints. Assessment content and learner data are excluded.
  Dispose of the signalling channel when the pairing is retired. No new database
  table, authentication policy, public data access or service credential is added.
- **Buttons:** Apply hover styles only with a fine pointer and actual hover
  support. Secondary controls keep a light/theme-aware background; primary and
  danger hovers brighten slightly. Remove touch tap overlays without blurring
  buttons or removing keyboard focus indication. Cover settings footer controls.
- **Files:** `lib/assessmentPeer.js`, `lib/assessmentPeerRecovery.js`,
  `components/LocalAssessmentPairing.jsx`, `components/TeacherOfflineSettings.jsx`,
  `scripts/verify-offline-pairing.cjs`, `docs/CHANGELOG.md`,
  `docs/PROJECT_HANDOFF.md`.
- **Validation:** `npm run build` passed with all 109 reported checks and the
  optimized production build. Focused tests pass using RTC doubles
  whose failed channels require an ICE offer/answer exchange, covering both
  initial pairing orders, unilateral failure, latest-state replay, unchanged
  peers, invalid/replayed/wrong-identity signals, timeout without a LAN path and
  visible check progress on both apps. A live two-client Supabase check passed:
  an encrypted synthetic frame was acknowledged and decrypted by the second
  client. No learner data or database records were used in that live check.
- **Limits and rollback:** Both apps must run this release to use encrypted ICE
  recovery. Automatic signalling requires both devices to regain internet; the
  direct link still needs a reachable LAN route. With no signalling path after
  terminal ICE failure, fresh QR/code exchange remains the recovery option.
  Physical tablet Wi-Fi recovery is not claimed as verified. Reverting restores
  .4's probe-only check and manual re-pairing. No data migration is involved.

## CRL-2026-10-17.4 | Bound link recovery and identify paired devices

- **Request:** Stop Offline Mode Settings staying in recovery after connectivity
  returns, keep pairing usable on Wi-Fi without internet and across internet
  changes, and show useful device names on both teacher and learner devices.
- **Cause addressed:** Recovery previously depended on an RTC connection-state
  event or a matching scheduled heartbeat. There was no silence detection,
  explicit wake check or recovery deadline. Failed ICE can retain an open-looking
  data channel even when it cannot carry packets. A generic client-hints platform
  could also overwrite a more useful device model.
- **Recovery behavior:** Probe the existing transport on online/offline, focus,
  pageshow, network-change and visible-document events, as well as heartbeats and
  ICE state changes. Internet availability alone never declares the LAN link
  connected. Authenticated peer traffic or a matched reply confirms recovery;
  replay the latest teacher state without allocating replacement peers or
  repeating the learner join callback. Detect silent loss after nine seconds.
  After 30 seconds of unsuccessful recovery, stop the spinner and show Check
  connection / Reconnect device. Continue listening and probing so a later
  recovery can still reuse the same link. Reconnection remains confirmed and
  saved assessment/sync work is preserved.
- **Initial setup:** Offline settings remains independent of internet heuristics.
  After a route/setup error, Retry setup is available; returning to the app or a
  network event retries an empty failed invitation without replacing a valid one.
- **Device names:** Show this device's current name with an inline editor on both
  apps. Store the chosen name under a dedicated local preference key and send it
  to the paired peer immediately and after recovery. Prefer real model hints
  over reduced Android placeholders. Generic platform hints never overwrite a
  chosen name. Browsers do not expose a desktop's configured hostname; enter that
  exact name in the editor rather than claiming the OS label is an exact name.
- **Files:** `lib/assessmentPeer.js`, `components/LocalAssessmentPairing.jsx`,
  `scripts/verify-offline-pairing.cjs`, `docs/CHANGELOG.md`,
  `docs/PROJECT_HANDOFF.md`.
- **Validation:** `npm run build` passed with all 106 reported checks and the
  optimized production build. Regression covers both pairing orders without
  cloud requests, failed and silent channels, one-sided wake, visibility recovery,
  the bounded recovery UI, return after its deadline, initial setup retry while
  online remains true, state replay, and device-name persistence/live updates.
  Browser/live-network limits remain as described below.
- **Limitations:** Automatic recovery needs a usable local network path and a
  transport the browser can resume. A terminal ICE failure or changed LAN route
  may require exchanging fresh codes; restoring internet alone cannot repair
  that path. This supersedes .2's indefinite retained-link loading state.
  No physical tablet/network verification is claimed. References:
  https://www.w3.org/TR/webrtc/ and
  https://developer.chrome.com/docs/privacy-security/user-agent-client-hints.
- **Data/rollback:** No migration or change to scoring, authorization, results
  persistence or ordered synchronization. Device labels are a separate local
  preference. Reverting restores the earlier recovery UI and name detection.

## CRL-2026-10-17.3 | Confirm Back before resetting pending pairing

- **Request:** On both teacher and learner devices, Back after entering a
  connection code must ask a short question below the button, then reset the
  pending connection only if confirmed.
- **Behavior:** Back opens an inline, theme-aware “Reset connection?” panel with
  Cancel and Confirm. Cancel or Escape keeps the invitation and response intact;
  Escape does not close the settings overlay. Confirm retires pending peers,
  clears entry/response/QR state, rotates the setup identity and prepares a fresh
  invitation. Old responses cannot complete the reset attempt. The panel fits
  narrow screens with wrapping controls and 44-pixel minimum button heights.
- **Connection safeguard:** Confirm checks current transport state immediately
  before resetting. If the peer connects while the panel is open, retain that
  established link. Explicit disconnection still uses its existing confirmation.
- **Superseded:** Release .2's non-destructive Back shortcut is replaced by this
  explicitly confirmed reset. Cancel retains the previous progress.
- **Files:** `components/LocalAssessmentPairing.jsx`,
  `scripts/verify-offline-pairing.cjs`, `docs/CHANGELOG.md`,
  `docs/PROJECT_HANDOFF.md`.
- **Validation:** `npm run build` passed, including all 103 reported regression
  checks and the optimized production build. The pairing suite also passed after
  adding the final automatic-preparation assertion. Actual component-handler
  regression covers both roles, Cancel/Escape, fresh invitations, expired response rejection,
  new pairing after reset, and successful connection racing with confirmation.
  A completion guard also prevents an unresolved asynchronous test from exiting
  early with a success status.
- **Data and limitations:** No database migration, scoring, persistence or sync
  change. No claim of physical tablet/network verification. Reverting this
  release restores the previous Back behavior.

## CRL-2026-10-17.2 | Retain offline pairing through internet loss

- **Request:** Keep an established teacher/learner link when internet access
  drops, show the full Finish Connection response automatically after accepting
  an invitation, and rename the incoming field to connection or response code.
- **Cause addressed:** An RTC `failed` event immediately closed the peer, while
  settings could switch to the old setup identity and prepare a new invitation
  during a transient reconnect. Recovery could also repeat a learner-join
  callback. These paths are now guarded using the retained established channel.
- **Behavior:** Internet status alone does not determine local-link status.
  Retain an established open channel through transient disconnected/failed states,
  preserve its assessment transport code after handoff, and prevent setup effects
  from replacing it. A matched heartbeat or RTC connected event confirms recovery.
  Replay the latest teacher state after recovery. Genuine channel closure and
  confirmed disconnection still end the link; recovery never erases local work.
- **Pairing UI:** After an invitation is accepted, hide the own-invitation button
  and incoming field, and display Finish Connection with response QR, code and
  copy control already visible. The separate Show response button is removed.
  Back permits correcting an exchange or entering a crossed response without
  losing the original invitation. Initial fields read Enter teacher/learner
  connection or response code, as appropriate to the device.
- **Files:** `lib/assessmentPeer.js`, `components/LocalAssessmentPairing.jsx`,
  `scripts/verify-offline-pairing.cjs`, `docs/CHANGELOG.md`,
  `docs/PROJECT_HANDOFF.md`.
- **Validation:** `npm run build` passed, including all 102 reported regression
  checks and the production build. The new regression uses mounted settings effects in independent device contexts and simulated RTC
  channels, covering both pairing orders, internet loss before/during assessment,
  transient RTC states, heartbeat recovery, state replay and return online.
- **Limitations:** Devices still need a shared local Wi-Fi/hotspot path. Disabling
  Wi-Fi entirely or changing network routes is different from losing internet
  access. No claim of physical tablet or all-network-condition verification.
  WebRTC references: https://www.w3.org/TR/webrtc/ and
  https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine.
- **Data and rollback:** No database migration or scoring change. Reverting the
  release restores the previous transport/UI behavior without a data migration.
- **Capstone implication:** Document internet-off/local-network-on testing
  separately from local-network loss. Retained pairing and confirmed live
  connectivity are distinct states, and simulation is not a field evaluation.

## CRL-2026-10-17.1 | Teacher dashboard overview and maintenance notes

- **Request:** Add space before the LRN column, show only the latest five
  learners, remove overview row hover effects, and use green checks for
  completed BoSY/MoSY/EoSY assessments. Maintain notes for future agents and
  capstone documentation.
- **Behavior:** Latest means most recently added, ordered by learner creation
  timestamp descending, with descending numeric ID as a tie-breaker. Missing
  or invalid dates sort last. The preview supports locally created learners.
  Full roster data, completion counts and reading-profile totals stay intact.
  The first and last columns have 14 px inset padding. Overview rows retain
  their background on hover in both themes. Completed periods show an
  accessible green check; incomplete periods keep a neutral dash.
- **Files:** `app/teacher/page.jsx`, `scripts/verify-teacher-controls.cjs`,
  `AGENTS.md`, `docs/CHANGELOG.md`, `docs/PROJECT_HANDOFF.md`.
- **Validation:** The focused teacher-controls check passed, including recency,
  five-row limit, missing dates, offline IDs, original roster order and
  full-roster totals. The production build and all 101 reported regression checks
  passed. Post-deployment inspection confirmed five rows, 14 px LRN padding,
  green checks, unchanged hovered backgrounds, full-roster totals and both themes.
  Released in `5dbd9bc`.
- **Data and rollback:** No database migration, deletion, API filtering or
  scoring change. Revert the release commit to restore the previous UI; this
  does not require restoring learner data.
- **Release target:** GitHub `AkuSayangKamuJudaSayang/crl-app`, branch `main`;
  Vercel project `crl-app`, production alias `crl-app-tau.vercel.app`.
- **Capstone implication:** The home overview is a recent-registration preview,
  while the statistics describe the whole authorized class. Checkmarks indicate
  completed assessment periods, not pass/fail or reading classification.

## Verified earlier commit history

| Date | Commit | Change and current relevance |
| --- | --- | --- |
| 2026-10-16 | `efa62e3` | Clean offline settings: invitation and response QR/text in separate overlays, visible role-specific incoming code entry, and confirmed device disconnection followed by fresh pairing credentials. Reset preserves assessment and sync stores. |
| 2026-10-16 | `b633f1d` | Keep return-response instructions during local ICE checking; local network checking alone does not mean a response was accepted by the other device. |
| 2026-10-16 | `14863a2` | Compact pairing feedback and a green success notice inside settings only after the data channel opens. Delayed and disconnected channels must not announce success. |
| 2026-10-16 | `3c08b63` | Preserve each device's own invitation separately from a response to the other device. Support either pairing order and crossed invitations without replacing teacher/learner identity. |
| 2026-10-16 | `5961a00` | Permanently clear obsolete deleted-learner offline work and remove Saved offline items/recovery UI. Late callbacks cannot restore deleted work. This supersedes the recovery approach below. |
| 2026-10-16 | `8a67e46`, `1f1f947` | Historical deleted-learner recovery/quarantine work and overlay styling. **Superseded by `5961a00`; do not reintroduce recovery, export or restore controls.** |
| 2026-10-15 | `3717aae` | Scope sync prompts to the teacher workspace and safely replay cancellations; no teacher sync notice on the public landing page. |
| 2026-10-15 | `4c8d424` | Improve story word-count contrast in dark mode. |
| 2026-10-15 | `bf9449b` | Protect unsaved passage drafts with save/discard confirmation, prevent backdrop dismissal, improve responsive overlays and the Save Story action. |
| 2026-10-15 | `73833f8` | Show item-specific offline sync progress, including learner/content identity, and preserve edits made while an earlier version is syncing. |
| 2026-10-15 | `dc644bd` | Preserve pre-paired assessments across internet loss, prioritize the available online path, keep local results for reconnect sync, and correct dark-theme controls. |
| 2026-10-15 | `e9f8fc5` | Add/edit stories with exactly six teacher-entered question/answer-guide pairs; persist guides through offline and results flows, exclude guides from learner payloads, and publish original period stories as shared defaults through an idempotent migration. |
| 2026-10-15 | `1b7876e` | Prepare two original 100-word Grade 3 stories each for MoSY and EoSY, route six questions per story, and display possible-answer subtitles to teachers. These are original content, not official DepEd passages. |
| 2026-10-15 | `19e76a2` | Preserve report-menu focus before disabling the background for its overlay. |
| 2026-10-15 | `cf84d16` | Report and Feedback menu opens a choice overlay, followed by the relevant form, with back/close navigation. |
| 2026-10-14 | `a0587d9` | Refine compact admin confirmation overlays and teacher directories; separate reporting forms. The reporting presentation was later refined by `cf84d16`. |
| 2026-10-14 | `96fe15b` | Align the new-device login authenticator overlay with the minimal dialog design. |
| 2026-10-14 | `85e552c` | Earliest commit available in this checkout: admin overview/audit directory changes and teacher reporting. Much of the existing assessment application is already present here; its earlier development dates cannot be reconstructed from this git history. |

## Earlier context without a verified release commit

Earlier discussions included fixing Save Learner, retaining middle names while
displaying middle initials, and improving teacher dashboard sizing. These are
historical requests, not evidence of an independently identified July release.
Inspect the current implementation and tests before documenting them as
completed work. Do not fabricate commit IDs, deployment dates or test results.

Additional handoff, architecture, verification limitations and capstone writing
guidance are maintained in `PROJECT_HANDOFF.md`.
