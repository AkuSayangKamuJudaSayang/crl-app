# CRL-App maintenance and capstone documentation notes

Last reviewed: 25 October 2026, Asia/Manila. Read `CHANGELOG.md` for the dated
release history and `../AGENTS.md` for the required maintenance workflow.
Verify the current source before changing behavior. These notes intentionally
exclude identifying school context, device inventories and deployment details.

## Current product decisions

- Content-list refinement (CRL-2026-10-25.3) supersedes only the corresponding
  25.2 presentation: desktop content is left-aligned beside the number column,
  with a Default header and no repeated checkbox text. At 760px and below, show
  Default beside every checkbox and keep number, content, checkbox/label and
  Edit/Delete in one aligned horizontal row. Do not restore the two-row phone
  layout. Narrow content cells use ellipsis without changing stored content;
  preserve full DOM/title text and the existing full-text edit overlay. Keep
  accessible names and fixed/random selection/save behavior. Save/Add grouping
  and item-heading theme colors apply at every width. This adds no capstone
  workflow, schema, privacy or assessment-rule change. Analytics/class-context
  improvements from 25.2 remain intact.

- Responsive UI refinement (CRL-2026-10-25.2): Conduct displays the selected
  school year and section above Enrolled Learners without restoring the removed
  class-management toolbar. Manage Assessment keeps its fixed/random rules and
  period-scoped draft/save behavior; Save now shares the item toolbar with Add
  Item or Import file/Add Story. Remove visible Default headings/row labels,
  saved/used counts and the redundant selection summary. Keep each checkbox's
  descriptive accessible name and existing selection limits. Desktop content
  and action cells are centered; phone rows align index, content, checkbox and
  actions using grid rather than detached absolute positioning. All Sections
  now uses the SAME mobile period-card stack as individual sections, with all
  three periods available and existing enlargement. This supersedes the 24.5
  mobile horizontal-canvas decision; desktop still uses its grouped graph.
  All Sections remains graph-only, and enrollment/year ownership and counts
  remain unchanged. No migration, data rewrite or new workflow/ERD diagram is
  required. Capstone documentation can describe this as responsive presentation
  of the same scoped descriptive analytics, not new assessment functionality.

- Entry and interaction repair (CRL-2026-10-25.1) supersedes the incomplete 24.6
  approach. Learner QR/code/URL entry uses /api/assessment/join and bypasses the
  teacher offline interceptor before IndexedDB/token/local-host handling. The
  public wrapper delegates to the same atomic main-route join with a reduced
  lookup and pre-claim content preparation. Seed waiting/placeholder content with
  the configured first letter; return that exact item to both screens. Existing
  joined letter placeholders heal on owned host_get reads only through an atomic
  no-letter-results/unfinished/unchanged-item predicate. Ten legacy active host
  shells with both learner_id and assessment_session_id null were retired in the
  live database; no learner, score or legitimate active attempt was removed.
  Never reseed scored or
  valid in-progress positions. Retain
  genuine in-progress content, private answer stripping, ended/completed checks,
  rate limits and single-use semantics. Never forward replay flags or teacher
  credentials from the public endpoint. Use the longer entry deadline and fresh
  reachability check to distinguish a slow server from real offline operation.
  Confirmed peer reuse and offline synchronization remain unchanged. No migration.
  Recovery uses CSS-module styling and a body portal; the old scoped selectors
  did not match compiled classes. Bulk deletion must use an explicit opener and
  strict true confirmation, because a click event is truthy. Keep phrase/reason
  and individual archives. Scoresheet/Class Record use bounded two-axis panes;
  this supersedes page-only scroll checks, without truncating roster or exports.
  Local browser verification covers virtual-camera QR, delayed online response,
  paired screen content, six viewport/theme combinations and Cancel without a
  request. Production fixture creation was rejected by automatic approval review;
  do not bypass that rejection. A temporary setup account was removed with no
  synthetic learner/session creation. Physical-device trials remain separate.
  Chapter 3 prose is updated; existing activity diagrams already express these
  actions and need no new actors/figures or ERD changes.

- Online learner entry (CRL-2026-10-24.6): A QR pairing offer is fallback data,
  not a forced offline-mode selection. Normal assessment QR, URL and six-character
  entry attempt the existing cloud join whenever the browser has a network route,
  even if a prior learner ping failed. Server success is proof of reachability;
  load/persist its task and close pending pairing UI. A local runtime response
  marked offline:true must retain offline reachability/offer state. A known disconnected browser
  still enters offline setup immediately; network/abort failure retains the offer
  for the existing exchange. Do not turn invalid, used or rate-limited responses
  into pairing due to stale networkSnapshot state. Preserve single-use claims,
  per-code in-flight suppression, late-response guards, installed-app offline
  restriction and teacher-confirmed local assessment reuse. No API/schema/data
  changes are needed. Chapter 3/Figure 8 distinguish direct online entry from the
  separate offline exchange; scoring and approved objectives/scope are unchanged.

- Analytics navigation and aggregation (CRL-2026-10-24.5) supersedes the paired
  selects from 24.4. Use the existing ClassWorkspace vertical card styling with
  year-first, section-second navigation and the shared top-left/PWA Back. This
  chooser remains read-only, with no add/edit/delete/archive controls. All Sections
  is an explicit sentinel from analyticsClassScope.mjs, available only within a
  valid year with sections. It aggregates that year's valid owned enrollments,
  including archived read-only classes, without mixing years or repeated LRNs.
  Its view is one Reading Profile Progress canvas with no comparison table,
  learner list or individual result panel. Preserve the single horizontally
  scrollable canvas on mobile; section views retain existing results. Empty or
  invalid scope never implies All Sections. Clear learner state/dialogs when
  navigating, and retain existing late-request cancellation. No schema or data
  rewrite is required. Figure 16 and Chapter 3 describe this branch; approved
  objectives/scope and Manage Assessment remain unchanged. Browser viewport QA
  was unavailable in this runtime; automated markup/navigation/build checks do
  not substitute for device acceptance.

- Analytics class selection (CRL-2026-10-24.4): The confirmed request applies
  only to Analytics. Keep Manage Assessment teacher-wide and unchanged. Analytics
  initially used paired native school-year/section selects; 24.5 supersedes those
  controls with sequential cards and an explicit graph-only year view.
  Its context is independent of Conduct/Records and requires an explicit valid scope before
  showing data. Use analyticsClassScope with enrollment IDs, never labels or LRNs,
  for charts, comparisons and learner evidence. Include archived classes as
  read-only history, exclude tombstones/foreign rows, and clear overlays on scope
  changes. Detail queries send the optional owned class ID; offline reads enforce
  the same boundary. No schema migration or learner rewrite is needed. Capstone
  implications: scoped descriptive Analytics, selection-only navigation and the
  separate Analytics/Records branches in Figure 16. This does not add predictive
  analytics, AI, content partitioning or class-management controls to Analytics.

- Deletion/archive refinement (CRL-2026-10-24.3): Empty school years (zero
  nondeleted sections) and empty sections (zero learners) require only explicit
  Cancel/Delete confirmation. Authoritative locked counts decide the rule. A year
  containing even one empty section is nonempty for this purpose. Keep phrase,
  reason and synchronization acknowledgement for nonempty containers, and phrase
  and reason for learner deletion. Empty container deletion creates no empty
  archive and preserves all old archives. Every explicitly deleted learner gets
  its own teacher ClassArchive entry, kind learner, before source deletion; bulk
  deletion is atomic across all entries. Existing admin recovery/audit remains
  grouped and private. Class archives default to kind section. Retained source
  learner/section IDs are metadata, not foreign keys. Only metadata for pending
  offline learner archives is added to the Records list; queued evidence syncs
  first, and cloud acknowledgement replaces that label before local cleanup.
  Preserve provisional ID remapping, roster epochs and teacher/account isolation.
  No deleted learner is restored by synchronization or historical backfill.
  Explicit teacher-owned backup import still requires an empty active class.
  This supersedes universal typed container deletion in 24.2; Saved offline items
  and automatic deleted-learner recovery remain removed. Capstone implications:
  distinguish empty confirmation from destructive record deletion, individual
  learner vs section archives, pending acknowledgement and atomic preservation.

- Class menu refinement (CRL-2026-10-24.2): Years and sections are chronological
  vertical lists, with stepwise top-left Back navigation and ellipsis Edit/Delete
  controls. Archive access/actions and the selected-class toolbar belong only to
  Assessment Records. Conduct hides the toolbar after class selection. Teacher
  profiles and registration have no editable section. ClassSection remains the
  enrollment authority; legacy User.section is compatibility metadata only.
  Year/section deletion takes an authenticated encrypted section snapshot before
  removing source enrollments, and retains tombstone IDs. Archive/delete requires
  cloud service and cleared local pending work. Keep canonical year aliases,
  class-specific queue cleanup and delayed-read filtering intact. Active names
  and years are unique through partial SQL indexes, while deleted labels can be
  reused under new IDs. Apply the compatibility migration before deploy and the
  final uniqueness migration only after the new server is READY. Do not roll back
  to code that upserts against the superseded full unique constraints. Capstone
  implications: records-only Archives, parent-year operations, archive-before-
  delete, lifecycle timestamps/active uniqueness, and no account-level section
  input. The optional telemetry opt-outs do not weaken audit or regression gates.

- Class workspaces (CRL-2026-10-24.1): Conduct Assessment and Assessment Records
  require a selected teacher-owned school year and section. Learner is a class
  enrollment, not a globally unique LRN. Preserve the class + LRN unique key and
  composite class/teacher foreign keys. Reports include enrolled learners without
  results as blanks, but do not classify or count them as assessed. One Start
  action selects a single eligible period; MoSY follows completed BoSY, EoSY
  follows completed MoSY. Scoresheet editing is remarks-only on both server and
  offline paths. Typed deletion intent and a reason are mandatory.
  Manually archived sections become read-only; retained encrypted backups belong
  to the teacher and restore once into an empty active class. Archive/import
  requires online synchronization first. Never silently merge another class.
  The private production maintenance worker consumes explicitly authorized DB
  flags, scrubs that account's learner copies from app recovery/backup history,
  and increments its roster epoch without changing login or 2FA. It creates no
  backup. Epoch reconciliation clears only obsolete learner work for that teacher,
  retaining assessment content, class metadata and other accounts' pending work.
  Do not reintroduce Saved offline items or deleted-learner recovery controls.
  A cloud purge cannot erase a disconnected browser until it reconnects, or an
  independently downloaded file. Older archives are rejected after permanent
  reset. Capstone implications: class selection before assessment/records,
  blank enrolled rows, sequential periods, safer deletion, remarks-only editing,
  independent archive entity and a new archive activity inside 3.3.3. Editable
  sources and model boundaries are in diagrams/class-workspaces/README.md.

- Dependency release policy (CRL-2026-10-20.2): Next.js is pinned to 15.5.28
  and Sharp is overridden to ^0.35.5, which Next.js 15.5.28 explicitly supports.
  Keep the package lock synchronized. Every build starts with `npm run
  audit:security`, including all development, optional and peer dependencies and
  failing on low or higher findings or registry errors. The GitHub workflow uses
  Node 24 and `npm ci` on main pushes and pull requests. Future fixes/features
  require a fresh install, clean audit and appropriate regressions before release.
  Do not bypass the gate to deploy. An audit describes known npm advisories at
  the time of checking, not all possible application flaws or future disclosures.
  For capstone documentation, record this as dependency risk management and
  reproducible release validation, not proof of complete system security.

- Account login protection (CRL-2026-10-20.1): seven wrong passwords lock a
  teacher for 30 minutes or an admin for five minutes. The account row is the
  server authority; parameterized row locks serialize concurrent attempts and
  approvals. Do not replace it with an IP-only or browser-only counter. Successful
  passwords reset failures; a locked account cannot bypass the timer with the
  right password or a pending authenticator challenge. Existing authenticated
  assessment sessions remain intact. Only teachers may send early-unlock requests.
  The request receipt is not proof of identity, a login token or a password reset.
  Admin-only approval must verify teacher identity and match the current lock
  episode, with transactional audit recording. Public Data API roles have no
  access to the request table. Preserve the purpose-specific derived signing key.
  Server rejections must never activate cached offline login. Offline attempts
  have a local limit and mirror observed server locks, but disconnected devices
  cannot discover lock/unlock changes elsewhere until reconnection. Do not claim
  tamper-proof global offline lockouts. Capstone documentation should describe
  this as password-guessing protection and supervised account unlock, separately
  from parameterized queries for SQL injection prevention. The additive migration
  must precede application deployment; do not delete learner data or sessions.

- The application supports teacher-led Grade 3 English reading assessment.
  Keep assessment progression, scoring, timing, completion, reading-profile
  classification and exports consistent when changing the interface.
- The home overview shows five most recently added learners, determined by
  creation timestamp rather than alphabetical order or assessment date. This
  preview must not truncate the full roster, statistics, analytics or exports.
- A green period check means that the period's assessment is completed. It
  does not mean the learner passed or reached a particular reading profile.
  Incomplete periods remain distinguishable to assistive technology.
- The original MoSY/EoSY stories added during development are Grade 3 materials
  with 100 words and six questions. They are not official DepEd passages.
  Teacher-entered possible answers support manual comprehension marking and
  must not be displayed to learners.
- Story editing requires exactly six question/possible-answer pairs. Preserve
  unsaved-change confirmation and prevent backdrop dismissal of edited drafts.
- Keep offline assessment work and pending edits until synchronization succeeds.
  Preserve changes made during sync and prevent duplicate results or attribution
  to the wrong learner. Sync feedback belongs to the teacher workspace.
- Deleted-learner work must not return through late callbacks or retry forever.
  Saved offline items and recovery controls were deliberately removed. The
  earlier recovery approach in the history table is obsolete.
- Receiving a pairing code is not the same as a confirmed connection. The
  green success notice appears only after connection confirmation. Either
  device may initiate pairing; the required return response must remain usable.
- After accepting an invitation, show only Finish Connection with the response
  QR/code already visible. Hide the original invitation button and incoming
  field. As of CRL-2026-10-17.3, Back opens a small inline “Reset connection?”
  panel below its button, not another overlay. Confirm resets pending peers and
  rotates the invitation; Cancel/Escape preserves progress. This supersedes .2's
  Back shortcut that retained the old invitation while returning to entry.
  Re-check actual transport state before a pending reset: a newly connected or
  recovering established link must stay connected. Incoming fields say connection
  or response. Document confirmed setup reset separately from live disconnection
  and from assessment-data deletion in the capstone workflow.
- Internet availability and the local device link are separate. Keep an
  established open data channel through transient RTC disconnection/failure,
  retain its assessment code after handoff, and do not automatically create a
  replacement invitation. A matching heartbeat or RTC connected event confirms
  recovery; replay the latest teacher state and avoid repeating join callbacks.
  A genuinely closed channel or explicit confirmed disconnect still ends the link.
  As of CRL-2026-10-17.4, wake/network/ICE events actively probe the retained
  transport. Nine seconds of silence starts recovery; after 30 seconds without
  recovery the UI offers Check connection / Reconnect device instead of spinning
  indefinitely. Background probes remain active, so later valid traffic can
  recover the same link. A failed initial route can be retried even when the
  browser continues reporting online. Do not confuse restored WAN access with
  successful local transport recovery.
  CRL-2026-10-17.5 supersedes the probe-only Check connection action: it now
  shows bounded progress and awaits fresh traffic. For a failed ICE transport,
  an optional encrypted realtime channel exchanges new offer/answer descriptions
  once both devices regain internet. Teacher-coordinated offers avoid glare in
  both original pairing orders. Preserve the peer, assessment identity and latest
  state; require actual local channel traffic before announcing success.
  The relay carries encrypted connection metadata only, with pairing-derived
  keys, replay checks and pinned remote DTLS identity. No learner/assessment
  content is added to this channel and no database/auth policy changes are needed.
  Initial pure offline pairing still uses QR/text. If both devices cannot reach
  the relay after terminal ICE failure, a fresh offline QR/code exchange is still
  necessary. Explain this network boundary accurately in capstone documentation.
- Device names are shown on both sides using a model when exposed, or an inline
  editable name saved as a separate local preference. A user-selected exact name
  is sent to the paired device and must never be replaced by a generic OS hint.
  Web browsers do not expose a desktop hostname automatically. Explain this
  distinction in usability documentation; these labels are not authentication.
- Pure offline communication requires both devices on a shared local Wi-Fi or
  hotspot network. Turning that local network off removes the communication path;
  changing its route/address can require pairing again. Do not promise automatic
  recovery for every physical network change merely because simulator tests pass.
- Disconnecting a device requires a second confirmation. It prepares a fresh
  connection without deleting assessment drafts, saved results or sync work.
  Cancel leaves the current connection intact.
- Maintain readable light/dark themes, mobile/tablet overflow handling,
  touch-sized controls, keyboard access and focus return in nested overlays.

## Working with future changes

Inspect the current implementation and the focused checks in `package.json`.
Do not apply old file-copy instructions over current source. Historical notes
are context, not instructions to restore superseded behavior.

Every system modification must update `CHANGELOG.md` in the same commit.
Record the request, resulting behavior, affected files, tests actually run,
limitations and whether data migration is involved. Update this handoff when a
product decision changes. Use dated release IDs in commit messages so another
agent can locate the exact revision without depending on a conversation.

`npm run build` includes the live dependency audit, assessment regression suite
and production build.
A successful build is not proof that every physical tablet, camera, Wi-Fi
network or browser combination was tested. Automated pairing checks use
simulated devices; physical-device testing remains a separate activity.

Never put credentials, learner identifiers, database exports or screenshots of
learner records into these notes. Use synthetic examples in tests. Keep changes
within the user's authorized scope and verify a release actually succeeds
before reporting deployment completion.

## Guidance for the capstone paper

1. Describe the implemented assessment and teacher-review scope using current
   source and verified behavior. Check exact timing, scoring and classification
   descriptions against authoritative CRLA guidance before submitting the paper.
2. Use the release history as evidence of iterative prototyping: user feedback,
   specific issue, resulting change and validation. A commit date is not a field
   study date. Document participants, consent, devices, procedures and actual
   observations separately when an evaluation occurs.
3. Distinguish automated regression checks, live UI inspection and real-device
   evaluation. Do not turn passing tests into claims of perfect reliability,
   zero data loss in every condition or successful classroom deployment.
4. Earlier project discussions proposed AI only for post-evaluation diagnostic
   assistance. Do not describe a validated AI model, recommendation engine or
   tutoring system without identifying its implementation and evaluation evidence.
5. Describe the actual approved hosting and privacy arrangements from current
   evidence. Do not repeat older proposals as facts about the deployed system.
6. Label the added stories as original assessment materials. Any coordinator
   acceptance or formal instrument validation needs separate documented evidence;
   the release history does not establish national DepEd approval.
7. Earlier discussions included Save Learner behavior, middle-name storage with
   middle-initial display, and dashboard sizing. These are historical requests
   without an identified earlier release commit in this checkout. Inspect the
   implementation before documenting their completion.
8. The owner's writing preferences include concise numbered paragraphs, future
   tense for proposed methodology, and avoiding em dashes. Implementation and
   results sections should reflect completed work. Use accessible authoritative
   sources and APA 7 citations for external claims. Repository notes do not
   replace official assessment references.


## Assessment crash recovery (CRL-2026-10-18.1)

Teacher layout now checks authenticated ownership and an unfinished controller
checkpoint before mounting the dashboard/assessment. `assessmentRecovery.mjs`
stores one active run per teacher in `crl-assessment-recovery-v1:<teacherId>`;
`AssessmentClient` checkpoints synchronously after UI commits and immediately
when journaling answers or publishing stage transitions. Existing IndexedDB
answer journals/outboxes remain authoritative for durable result submission.
A Continue decision restores the same session, saves the host projection and
`host_recover` replay entry atomically in the existing teacher database, and
keeps passage time paused at the saved elapsed second. `host_recover` is behind
the existing teacher authentication/ownership checks and uses compare-and-set;
it cannot alter scores or reopen an ended attempt. An unsaved final-review
screen can be restored without reopening the completed host. Successful Save
or explicit End resolves the checkpoint. Deleted-session cleanup replaces it
with a minimal terminal marker so late callbacks cannot recreate learner data.
Do not migrate legacy `crla_host_session` pointers into the new recovery feature.

The learner's current code points to its existing `learner:<code>` journal.
Reload restores that attempt with no assumed live connection. Application
presence uses a separate `assessment_presence` message, not assessment-state
replay or REST connected flags, on BroadcastChannel, WebRTC and the existing
Supabase broadcast room. Presence contains only code/nonce/status/recovery
metadata. A fresh challenge acknowledgement releases teacher recovery controls;
repeated or unrelated acknowledgements cannot. Absence for 15 seconds blocks the
learner display; the teacher also pauses and offers reconnection after learner
presence is lost. Ordinary online/offline switching leaves the presence lifecycle
running. These messages are liveness hints, not authorization; authenticated API
checks remain mandatory. No answer guide is included in presence packets.

A browser crash destroys its live peer object. Realtime can reconnect online;
a wholly offline restart needs a fresh QR/response exchange on the same local
network. Do not promise automatic survival of the destroyed WebRTC object.
Neither device disappearance nor a waiting screen completes or discards scores.
Recovery dialogs do not dismiss on backdrop or Escape. Final-review Save and
confirmed End retain their established result/sync behavior. Both apps should be
refreshed to this release before testing. No storage migration is required.

Capstone documentation may describe checkpoint-based interruption recovery,
explicit teacher resumption, a paused clock excluding closure time, device
liveness detection, and transactional replay of recovery metadata. Distinguish
these automated/synthetic tests from an observed tablet force-stop study. The
feature cannot recover browser storage that was erased or a physically damaged
device, and does not establish zero data loss under every hardware failure.
