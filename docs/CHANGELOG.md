# CRL-App version and change notes

This is the maintained release history starting on 17 October 2026. Dates use
Asia/Manila. Older entries were reconstructed from the repository's commit
history and the working context available when this file was introduced.
They are not a claim that all earlier releases were independently re-tested.

Use `git log --oneline --all` for the authoritative commit sequence. To find a
dated release, use `git log --all --grep='CRL-2026-10-17.1'`. Each future change
must have an entry here, including small UI fixes. See `../AGENTS.md`.

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
