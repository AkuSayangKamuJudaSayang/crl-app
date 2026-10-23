# CRL-App version and change notes

This is the maintained release history starting on 17 October 2026. Dates use
Asia/Manila. Older entries were reconstructed from the repository's commit
history and the working context available when this file was introduced.
They are not a claim that all earlier releases were independently re-tested.

Use `git log --oneline --all` for the authoritative commit sequence. To find a
dated release, use `git log --all --grep='CRL-2026-10-17.1'`. Each future change
must have an entry here, including small UI fixes. See `../AGENTS.md`.

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
  assessment content. It creates no new backup. A monotonic roster version
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
  by the environment's registry 403; it is not a clean audit. A candidate preview
  must pass the unchanged full audited Vercel build before production release.
  Record the authoritative remote build/deployment evidence with the release.
  Automated checks do not prove physical tablet-to-tablet pairing or user
  acceptance. No new dependency versions or audit suppressions are introduced.
- **Documentation:** Added editable SVG/diagrams.net sources for class selection,
  assessment, records, synchronization, archives and affected ER views. Chapter
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
