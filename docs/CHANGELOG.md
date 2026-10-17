# CRL-App version and change notes

This is the maintained release history starting on 17 October 2026. Dates use
Asia/Manila. Older entries were reconstructed from the repository's commit
history and the working context available when this file was introduced.
They are not a claim that all earlier releases were independently re-tested.

Use `git log --oneline --all` for the authoritative commit sequence. To find a
dated release, use `git log --all --grep='CRL-2026-10-17.1'`. Each future change
must have an entry here, including small UI fixes. See `../AGENTS.md`.

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
