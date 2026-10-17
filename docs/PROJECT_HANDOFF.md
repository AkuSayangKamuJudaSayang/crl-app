# CRL-App maintenance and capstone documentation notes

Last reviewed: 17 October 2026, Asia/Manila. Read `CHANGELOG.md` for the dated
release history and `../AGENTS.md` for the required maintenance workflow.
Verify the current source before changing behavior. These notes intentionally
exclude identifying school context, device inventories and deployment details.

## Current product decisions

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

`npm run build` includes the assessment regression suite and production build.
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
