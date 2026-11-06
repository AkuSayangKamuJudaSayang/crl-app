# CRL-App version and change notes

## CRL-2026-11-06.4 — School section assignments and coordinator-controlled timelines

Date: 6 November 2026, Asia/Manila. Each school now has one administrator. The
existing administrator belongs to Amihan; the other two school administrators were
provisioned on explicit instruction. Required user school IDs, a partial unique
admin index, restricted request transactions and school policies prevent cross-school
access. Public admin signup, new-school creation from a school admin session and
admin invitations are retired. Admins retain same-school staff access controls and
coordinator invitations, with a new Sections menu for school-year section settings.
No passwords or account hashes are included in source.

Coordinators create school years, assign administrator-created sections to a teacher
in the same school, and create school-year BoSY/MoSY/EoSY assessments as drafts.
Go live and Pause control future starts. Main contains School Year, Assessment,
Records and Assessment Contents; Classes and coordinator roster mutations are removed.
Records reuses Teacher Scoresheet, Class Summary and Class Record with Print/Export
and no score or remark editing. Occupied sections cannot move to another teacher.
Teacher Conduct restores multi-row learner entry, class-record/SF1 import and protected
learner deletion for the assigned class. Duplicate LRN/name checks are class-specific,
permitting enrollment in another school year. Year menus show newest active years
first. Normal and transactional start checks require a live eligible timeline.

SchoolSection and SchoolAssessment are new school-scoped entities. Preserving
migrations add composite constraints, lookup indexes, assignment validation and the
one-admin rule. Existing Jupiter ownership and the single learner entry were retained;
no assessment, archive, backup or journal reset was performed. Nested mutation callbacks
use real savepoints to avoid partially committing handled validation errors. Signed
offline timeline authorities last 24 hours. A fully disconnected device cannot receive
a pause immediately; its last synced lease bounds new starts. Already-conducted valid
offline captures replay their immutable version. Pre-cutover signed journal entries
retain compatibility; unsigned catalog-only offline starts are rejected. Worker79
updates assets without erasing device work.

Affected: access/auth/assessment/import APIs; teacher Conduct and OfflineRuntime;
CoordinatorConsole plus SchoolYearAssignments/SchoolAssessmentActivation; admin
SchoolSections/SchoolStaff; school context, policy and assignment helpers; Prisma;
four docs/migrations scripts; regression fixtures; worker and editable diagrams.
The main native capstone now matches these roles and activation rules. Thirteen
activity/use-case/ERD placements include two new continuations and retain consistent
palettes and shapes. Native PDF QA: 114 pages, 61 named destinations, revised figure
notes kept with their figures and the full release baseline on one page.

Validation: clean npm ci; zero vulnerabilities from the full dependency audit; all
58 verification gates; offline packaging and optimized production build. Responsive
real-component browser checks at 320/390/768/1024/1440 px cover assignment, draft/live
activation, read-only reports, admin drawer, staff, invitations, logs and section
add/edit/delete dialogs. Rolled-back database checks reject duplicate assignment,
a second same-school admin and foreign-school access/writes. DB readback retains one
active admin per school, one learner and no temporary 2099 year. Security advisors
report no warning/error, only the pre-existing closed assessment_windows INFO.
Physical device installation and peer Wi-Fi transport remain device checks.

Rollback: these are additive preserving schema changes; retain the new tables/columns
and assigned admin school IDs. Do not restore global admin access or replay account
provisioning. Deactivating a trigger pauses future online starts; synchronize devices
before judging offline revocation. Credentials are delivered privately in the reply.

## CRL-2026-11-06.3 — Administrator school staff and scoped activity review

Date: 6 November 2026, Asia/Manila. Admin login uses the supplied administrator
SVG (artwork preserved, empty viewport trimmed), centered logo/Hello and a white
card on sky blue. School creation stays in the directory. A selected school has
an arrow back control, centered name and separate staff categories with pictures,
independent search/name sorts and teacher learner-count sorts. Dark avatar hover
retains a visible ring. Coordinator teacher cards add a section shortcut beside
Class Record, reuse the protected section form with school-year selection, and
show “0 section”. Main worker78 refreshes assets without erasing device journals.

Platform Logs requires one school or the separate Administrator access category;
there is no combined all-school feed. Ten-entry pages, scoped cursor/detail/staff
checks and an explicit detail allowlist protect account and learner data. New
signup logs the claimed invitation, redeemer name and role in the same transaction.
Portal sign-in, school registration and coordinator/admin invitation changes are
recorded. Additive platform_log_scope migration adds nullable routing/name
snapshots and a composite page index; an invoker trigger captures names/schools.
All 63 prior log entries were retained and scoped. Existing RLS remains intact;
seven-day activity retention remains separate from recovery/backup retention.
No accounts, learner records, assessments, archives or backups were reset.

Affected areas: PortalAccess, SystemAdminDashboard/Logs/SchoolStaff, coordinator
class UI, access API, registration, platformLogs, Prisma, worker and tests.
Clean npm ci, zero-vulnerability all-dependency audit, 57 regression scripts and
optimized build passed. Real-component browser checks passed at 320/390/768/1024/
1440px, including staff switching/search, log/redemption detail and the actual
section shortcut save payload. Database trigger/RLS insertion was verified in a
rolled-back transaction; no synthetic activity persisted. Native capstone prose,
data dictionary and Figures 7/19/26 continued were updated and exported to PDF for
visual verification with the established diagram palette/typography. Rollback can
restore presentation/API source while retaining the harmless additive columns;
never remove log records or replay the earlier school cleanup.

## CRL-2026-11-06.2 — Consistent headers, theme controls and invitation rows

Date: 6 November 2026, Asia/Manila. Admin/coordinator theme controls match the
Teacher 62px target, 56×28px track and 24px thumb; logos become white in dark mode.
Coordinator switch and sign-out share one right-aligned action group. Teacher
main-menu DOM order is switch then Logout, preserving keyboard and visual order.
Dark selected coordinator tabs are white with black text and keep their selected
appearance on hover. Admin content is white with its sky-blue sidebar retained.
Only the sidebar picture opens Profile; name/username remain non-interactive.
Coordinator invitation creation no longer adds a duplicate dismiss card. Each
active invitation has a separated school label, code/Copy group and Revoke action;
clipboard failure provides an accessible manual-copy message. No invitation,
account, assessment, offline journal or schema mutation is part of this UI change.
Validation: clean npm ci, zero reported audit vulnerabilities, all 56
regression scripts and optimized build passed. Responsive admin/coordinator
checks passed at 320–1440px; Teacher header checks passed at nine widths in both
themes. Copy uses the actual displayed code; selected dark navigation was checked
after transitions settled. Capstone implementation prose is updated; diagram scope,
relationships and established palette are unchanged. Main worker77 refreshes assets
without erasing device data. Rollback is presentation-only.


## CRL-2026-11-06.1 — Administrator school directory and responsive sidebar

Date: 6 November 2026, Asia/Manila. Platform administration uses a sky-blue
sidebar, accessible mobile drawer with outside/Escape dismissal, profile identity
entry, bottom red sign-out, combined school/coordinator/teacher directory and
school-bound coordinator invitations. Admin roles remain invitation-only.
The explicitly authorized Tuyan school, its legacy coordinators, teacher and
linked records were permanently removed in a scoped transaction; the existing
platform.admin was already the sole administrator. Other schools were preserved.
Coordinator themes, actual lock icons, profile picture frame cleanup, aligned wider
Logs directory and bounded atomic generation of 1–50 teacher codes are included.
Generating a batch retains other valid codes; reset remains explicit. Teacher
filter wrappers have no extra underline. No assessment scoring changes. Mobile theme icons retain their visible knob even
where the coordinator header hides other small-screen subtitle spans.
Clean npm ci and all-severity audit passed with zero vulnerabilities. The 55
existing regression scripts and new batch-invitation regression passed; browser
checks at 320/390/768/1024/1440px covered the actual admin drawer, staff lists,
invitation dialog and theme. Production compilation gates deployment. Native capstone prose
reflects school management, batch invitations and removal of obsolete test entries.
Destructive cleanup is not automatically replayed by builds or migrations.


## CRL-2026-11-05.5 — Automatic coordinator verification and consistent school workspace

Date: 5 November 2026, Asia/Manila. Coordinator sign-in automatically requests
configured 2FA after valid credentials on an unrecognized browser. Five-minute,
single-use random challenges store only SHA-256 tokens, reserve at most five code
attempts atomically and recheck role, account status, school and session version.
Signed HttpOnly browser recognition lasts 30 days and is bound to the account,
role, browser agent and security version; cleared cookies require verification.
Password/security changes revoke recognition. There is no optional authenticator
login disclosure. Eye icons and sliding Sign In / Sign Up selectors are shared in
appearance with Teacher access, with reduced-motion support.

Main opens School Year first. Year deletion keeps password, concurrency, archive,
transaction and ownership checks but no longer asks for a synchronized-device
checkbox. Classes lists all school teachers without paging, using bordered hover
cards, circular avatars, a section pill beside the name and blue Class Record.
Logs replaces Audit Log; assigned-class counts use one filtered relation selection
in Classes and Logs, instead of obsolete teacher.section text. Repeated tab titles
are visually hidden while preserving page headings for assistive technology.
Codes retains Teachers/Active invites only and removes the second teacher list.
New invitation redemptions retain the teacher's name as well as their account FK;
older used codes lacking a redeemer remain explicitly unavailable, never inferred.
Coordinator profile panels have explicit borders and spacing independent of broad
admin button styles. Teacher Conduct filters occupy one compact row with local
scrolling on narrow screens; scoresheet cells keep visible grid lines.

Applied additive migrations 20261105144134 (closed-RLS login challenges) and
20261105144648 (nullable invitation redeemer name). No accounts, assessment evidence,
offline journals or previous backups were reset. Main capstone and editable
Figures 13/26 describe automatic verification and actual account relationships.
Validation: clean npm ci; full regression suite including single-use/attempt/expiry,
role/version/lock and browser-recognition tests; responsive real-component browser
checks at 320–1440px. The all-dependency audit reported zero vulnerabilities; all 55 verification
scripts and the optimized production build passed. Live deployment is verified
against its GitHub commit before handoff. Rollback must preserve the new nullable columns and challenge table;
never bypass enabled 2FA or infer legacy invitation users.


## CRL-2026-11-05.4 — Correct installer startup registration export

Date: 5 November 2026, Asia/Manila. Final live verification of .3 caught a learner
installer startup failure: InstallRuntime imported a registration function that was
still local to LearnerPwaShell. Next reported the unresolved named import as a build
warning while completing compilation. The live browser check correctly blocked handoff.

Move the existing registration function into lib/learnerWorker.js and import that
same exported function in both consumers. Registration retains the Teacher worker,
removes only an obsolete root-scoped Learner worker, and uses /learner scope. No DB,
credential, learner evidence or offline journal changes. New regression checks invoke
the exported registration with real module loading and mount the actual InstallRuntime
in browser QA so an unresolved import cannot hide behind server-only HTML checks.
The build wrapper now treats Next's unresolved-export warning as a failure, even if
Next exits zero; its regression verifies maintenance never runs after that failure.
Clean install, zero-vulnerability audit, 54 regression scripts, optimized build and
responsive runtime checks are required before the deployed-browser check. This supersedes .3's installer startup, with its other
approved changes retained.

## CRL-2026-11-05.3 — Separate app installation, staff signup and school workspace polish

Date: 5 November 2026, Asia/Manila. Request: correct iPhone learner/teacher identity,
provide clear Android installation, simplify coordinator navigation and teacher-row
Records, refine profiles/security, replace native dropdowns, and move legal agreement
to registration. The supplied crl-app-ra.svg is used for coordinator access.

Root metadata is neutral. Teacher/login, learner and dedicated /install/teacher and
/install/learner pages serve one role manifest and matching Apple title/icon. Stable
manifest IDs remain /teacher and /learner; distinct labeled PNG icons reinforce the
role. Install events are accepted only for a matching current route plus one manifest.
No cookie-consent redirect can send a learner install to Teacher/landing metadata.
Android help offers browser install or Home-screen shortcut without clearing journals.
Native WebAPK installation and icon placement remain under browser/OS control.

Coordinator Main replaces Coordination and comes first; Codes replaces Overview.
Teacher cards show section counts and their own Records button. The separate Records
tab is retired; report components, ownership and print/export behavior are retained.
Coordinator profiles use Edit and an animated Security & Privacy section for password
and local TOTP setup. Password/2FA changes revoke stale sessions, require password and
current TOTP where applicable, and use actor/version-bound ten-minute setup tokens.
Teacher Edit name exposes structured name fields only, and its profile install panel
is removed. Both role QR setup views generate locally; no authenticator key is sent
to an external QR service. A shared accessible Select supplies animated menus,
keyboard/typeahead controls, bounded popovers and reduced-motion support across pages.

Detailed Terms/Privacy overlays are linked beside unchecked signup agreement controls.
UI and registerAccount reject missing/false/stale acceptance for new registrations.
Applied additive migration 20261105104955 records policy version/server acceptance time;
legacy accounts remain null. Staff agreement does not substitute for learner/guardian
consent or the school's lawful basis. Original records and device journals are retained.

Validation: clean dependency install and all-severity audit (zero vulnerabilities),
53 verification scripts and optimized build; actual public HTML verifies one matching
manifest/Apple identity on six routes. Browser QA at 320/390/768/1024/1440px checks terms,
required agreement, custom-select pointer/keyboard/closing, teacher-row Records/counts,
and profile/security overlays with no page errors or horizontal overflow. New server
security tests cover TOTP tampering, wrong actor/version, bad code, enable/replay,
password plus TOTP, disable and session rotation, plus profile school/role allowlisting.
The local Prisma binary download was blocked by environment network policy, so local
compile/unit checks used Prisma's no-engine generation; production must regenerate
its normal engine and pass deployed API checks. No dependency versions changed.

Capstone implications: Figures 13/14/16/26 and editable sources use the established
palette/typography and now reflect agreement, profiles/security, per-teacher Records
and acceptance fields. Main document prose is updated to the same behavior. Physical
iPhone/Android Home-screen creation and physical offline pairing are not proven by
browser emulation. Rollback may retain the nullable acceptance columns; never infer
legacy consent, change stable installed app IDs, or erase unsynchronized device data.

## CRL-2026-11-05.2 — Complete the approved preserving school-role release

Date: 5 November 2026, Asia/Manila. Request: finish the approved multi-school role
separation, demo accounts, live database, deployment and capstone updates.

PR #17's role architecture is deployed. The exact approved preserving migration
20261104160712 applied successfully, retaining all 27 table count/content invariants.
Existing records and local journals remain. Three new schools, five coordinators,
ten teachers and one separate platform administrator are live; all demo 2FA is off.
Old coordinator shared passwords were individually rotated. The original teacher
credentials and 2FA setting were retained. No destructive reset was performed.

Final fix: app/api/coordinator/route.js serializes the actor through adminProfileSelect,
excluding passwordHash/twoFactorSecret; scripts/verify-admin-security.cjs asserts this.
The applied SQL is recorded in supabase/migrations; migration/handoff/README and main
capstone documentation now distinguish this live release from the superseded blocked
reset. Editable diagrams retain the consistent existing palette, type and geometry.

Validation: clean npm ci; npm run build including the all-severity dependency audit
(zero vulnerabilities), 52 verification suites and optimized compilation passed.
Earlier live school-RLS checks and responsive role portals (320–1440px) passed.
No credentials or data exports are committed. Physical Android installation and
physical offline pairing are outside what browser verification can demonstrate.
Rollback: retain the expanded schema and records; do not revert to the former
unscoped admin APIs or reset local journals. Coordinate any schema reversal separately.

## CRL-2026-11-04.11 — Data-preserving school-role cutover (prepared; exact approval pending)

Date: 4 November 2026, Asia/Manila. Follow-up fad98cec-2a71-4150-8f35-514ce3be538c.

Replaces .10's reset-dependent migration with a preserving upgrade. The proposed
`preserve_records_school_role_separation` migration maps the existing single school,
converts former administrator accounts into that school's Reading Coordinators,
retains user/teacher/class/learner/assessment/archive/backup IDs and content, and
adds school composite keys, constraints, triggers and restricted-role RLS. No
TRUNCATE, DELETE or operational reset is present. It refuses a live assessment,
uses a bounded lock timeout, and compares row counts and normalized content digests
for all 27 existing tables before commit. Only role/session/school metadata and
new school columns are excluded from those content comparisons. Identity, evidence,
enrollments and encrypted archives/backups are retained byte-for-byte.

Removed the candidate client data-epoch boundary: this rollout must not clear local
offline stores or pending journals. Existing teachers may sign in again online to
refresh versioned authorization; their saved work is retained. Fixed offline-session
bootstrap to authenticate the current teacher, check account status/session version,
and mint app-scoped versioned bearer tokens for subsequent synchronization. Teacher
password changes now increment session version; teacher sign-out/2FA no longer clears
the separate platform-admin cookie.

Validation: clean npm ci; live all-severity audit with zero vulnerabilities; full
npm run build and all 52 gates passed. Expanded school-role tests exercise the real
offline-token bootstrap, bearer acceptance, disabled-account rejection, no client
reset boundary, and absence of entry deletion in the preserving SQL. Independent
PostgreSQL rehearsal verifies all 27 preservation checks, original account/class/
learner retention, legacy coordinator mapping and cross-school denial. The three
new demo schools, 5 demo coordinators, 10 demo teachers and separate new platform
administrator remain privately prepared, not created live. Two existing coordinator
accounts will retain IDs/history and receive unique replacement passwords at the
approved rollout; no account is deleted. Existing-school workspace is additional to
the three demo schools. Existing 2FA settings are preserved; demo 2FA remains off.

PRODUCTION BLOCK: automatic approval review rejected this second, non-destructive
migration because exact approval of the production DDL/RLS/trigger/role-conversion
cutover and table-lock blast radius was not explicit. No schema, backfill, role
conversion, password rotation, account seed or production deployment ran. Preflight
readback still showed 3 accounts, 33 learners, 4 assessments, 1 archive, 4 recovery
items and 8 audit events; no live host and no pending roster purge. These counts are
validation evidence only, not a promise that ordinary concurrent activity stops.
The only earlier applied change remains additive role-enum migration 20261104142646.

PR #17 contains the concrete migration and reviewable source. Do not split, disguise
or indirectly execute the rejected action. Obtain explicit approval for migration
`preserve_records_school_role_separation`, including table locks, backfill, role
conversions, triggers and RLS, before applying it. The requested production rollout
and working demo credentials remain outstanding. No secrets or learner records are
committed. The native capstone distinguishes this preserving candidate from .9's
production baseline; role/ERD figures are still the intended schema design.

## CRL-2026-11-04.10 — School roles and account enrollment (candidate; cutover blocked)

Date: 4 November 2026, Asia/Manila. Request a651a953-5802-4541-967e-4fb2c7f29065.

The candidate separates `/coordinator` from the platform `/admin` console.
Coordinators share their assigned school's assessment workspace; schools are
isolated through an AsyncLocalStorage-scoped PostgreSQL transaction, restricted
role and RLS. Years and library heads use school composite keys. Teacher ownership
and saved assessment versions remain. Administrator-issued coordinator/admin
invitations and coordinator-issued teacher invitations bind role, school, issuer,
expiry and single redemption. Registered schools replace free-text teacher school
entry. Teacher/coordinator login accepts email or username. Coordinator Profile
supports picture cropping, names and password changes. Current-account checks,
active-school checks and session versions reject deleted/disabled/stale identities.
The explicit bootstrap has no built-in administrator password. Portal requests
never inherit teacher offline bearer tokens. Cache versions are teacher73/learner33;
updated clients check a reset epoch before restoring CRL operational journals.

Validation completed: clean `npm ci`; live all-severity audit reported zero
vulnerabilities; full `npm run build` passed all 52 verification scripts and the
optimized compilation. Added current-account/role/audience, concurrent school-context
and composite-key tests. A separate PGlite PostgreSQL rehearsal applied the proposed
schema, denied cross-school reads/writes and role escalation, and provisioned years
only in the selected school. A private original-content/demo seed rehearsal verified
three schools, one administrator, five coordinators, ten teachers, nine timeline
catalogs, active status and disabled 2FA. No demo credentials/hashes were committed.
Chromium checked both role sign-in/signup pages at 320,390,768,1024,1440px with no
horizontal overflow/client errors. Native capstone prose and four editable figures
were updated; PDF rendering checked diagram readability and caption pagination.
Physical devices, production account flows and live RLS are not verified yet.

PRODUCTION BLOCK: automatic approval review rejected the production-wide TRUNCATE
as major irreversible destruction despite the user's explicit authorization. No
reset, school schema, seed or production deployment followed that rejection. A
readback confirmed all three existing accounts remain, schools is absent and the
reset migration is absent. Only additive migration
20261104142646_add_reading_coordinator_role was applied. Source school migration
remains an unapplied draft under docs/migrations; do not run or merge this candidate
against the current database. Production remains .9. The requested live dummy
accounts/credentials and deletion of prior credentials are therefore outstanding.
Do not retry through an indirect deletion, soft-delete bypass or split destructive
statements. Obtain a separately approved safer cutover approach first.

The native document explicitly labels .10 an isolated-tested candidate and keeps
.9 as deployed baseline. No claim of a completed reset or educational effectiveness
is made. Disconnected devices cannot be remotely cleared; new clients enforce an
epoch on next update/reconnection, while server identity checks reject stale replay.
Rollback cannot restore permanently erased records; the destructive plan must remain
blocked until an acceptable data-preserving migration/cutover is established.

## CRL-2026-11-04.9 — Protected contents and administrator live assessments

Date: 4 November 2026, Asia/Manila.

Supersedes .3's exclusion of all recovering/interrupted presence from the content
lock. One backend-only database predicate now supplies library guards, status/counts
and live views. Unfinished nonterminal hosts with a fresh teacher heartbeat remain
protected during reconnecting/recovering states; a new host gets a bounded startup
grace. Ended/completed/terminated hosts are excluded; silent activity expires after
30 seconds. Presence/publication retain advisory-lock ordering, including reconnecting
presence. Immutable content versions, evidence, ownership, 24-hour recovery and offline
journals are unchanged. No running session was forcibly ended or results rewritten.
Live inspection found no unfinished cloud host at inspection time; this does not
establish the reported device's exact state or visibility of a disconnected local run.

Applied 20261104114530_live_assessment_visibility_guard. The security-invoker function
has a fixed search path and no PUBLIC/anon/authenticated execution grants. The existing
library revision/head triggers use it through crl_library_has_live_assessment. The
administrator's status uses the same server clock instead of a separate JavaScript
cutoff. Status counts distinct teachers independently of concurrent assessment count.
All live endpoints remain behind administrator authentication, with no write actions,
assessment codes, nonces, LRNs, cookies or device secrets in their payloads.

Assessment Contents displays a locked design, the conducting-teacher count and Open
Live Assessments. Add/import/edit/delete, mode/default changes and Save are disabled;
already-open editor fields are blocked. Locked stories expose their passage/questions
for viewing. Failed status checks remain fail-closed and drafts survive. Shared request
ordering prevents an older initial library response from undoing newer lock status.
Publication remains protected even before a UI polling cycle detects a new run.

The new main Live Assessments tab lists conducting teachers with search and profile
images/initials. Selecting a teacher shows their current timeline, task/displayed item
or passage, recorded correctness and passage miscue count. Multiple simultaneous runs
remain grouped under their owning teacher. Data refreshes every three seconds; ended
or lease-expired activity disappears. A failed request clears stale content, identifies
the failure and offers Retry. This is a read-only cloud-state view, not video/screen
streaming; disconnected offline-only progress cannot be observed before reaching the
server. Its selection is separate from Classes and Records. Responsive cards stack on
mobile and retain dark styling, accessible controls and section-shaped loading.

Affected: administrator navigation, shared contents UI, LiveAssessments and styles,
coordinator API/policy, live query module, migration, regression scripts, teacher cache72
and maintenance/diagram sources. Learner cache32 and dependencies are unchanged.

Validation: clean npm ci; full npm run build with all assessment gates and live
all-severity dependency audit reporting zero known vulnerabilities. Actual deployed
Postgres rollback tests verify fresh active/recovering detection, direct publication
rejection, ended/expired exclusion and private function grants. The fixture transaction
was rolled back without retaining an attempt. Database security advisories were
unchanged: 13 informational backend-table RLS/no-policy notices, no new findings.
Module checks cover distinct teachers, concurrent runs, selection boundaries, no secret
fields, ended removal and authenticated read-only routing. Actual AdminDashboard and
coordinator browser checks pass at 320/390/800/1440px in both themes, including the
locked count/link, teacher live view and ended removal. Final narrow/wide runs also
verify failed-request stale-data removal and Retry. Shared library/policy and existing
coordinator assessment/recovery/import/record workflows pass. Synthetic screenshots
were inspected. These tests do not constitute physical school/device acceptance.

The native capstone baseline and Figures 7/17 plus notes were updated in place. The
new administrator live-view goal uses the established use-case design; shared-content
activity retains the established lane colors, white process nodes and yellow decision.
Editable SVG/drawio sources and PNGs are synchronized. No new entity/relationship was
introduced, so the ERDs remain accurate with their consistent styling. Rendered PDF QA
retained 106 pages and 56 valid named navigation destinations; changed figures/notes
and the full baseline on page 92 were inspected. Objectives, scope and references are
preserved. Rollback: restore prior UI/query code and prior predicate/trigger function
bodies together; retain attempts, results and immutable revisions. Do not roll back
this release by clearing teacher or learner device storage.

## CRL-2026-11-04.8 — Android install recovery and learner offline upgrades

Date: 4 November 2026, Asia/Manila.

Follow-up: Android Chrome remained at its native “Installing CRL-App Learner” stage
without a launcher icon after accepting installation. The deployed learner document,
manifest and three icons returned HTTP 200 with correct content types; Chromium's
manifest parser reported no errors and its installability check reported no errors.
This did not reproduce or establish the cause of the physical Android package stall.
Chrome's appinstalled/userChoice acceptance precedes Android WebAPK completion; a
website cannot finish/cancel that native installer or observe launcher icon creation.
Supersedes the learner worker comment implying that nonblocking worker activation
alone prevents Chrome's native installation from stalling. No claim of a verified
Android launcher fix is made from desktop/mobile-emulated browser tests.

The install dialog now offers Android Chrome-specific Check app files and Add
Home-screen shortcut guidance. A 30-second post-acceptance reminder exposes the
shortcut steps without declaring failure or success. The file check validates the
role's unchanged manifest identity/scope/start URL, three public PNG responses and
actual dimensions, plus the correct active worker. It omits credentials and private
assessment data, bounds network checks to eight seconds and the worker lookup to
1.5 seconds, and remains retryable. It explicitly cannot confirm a Home-screen icon.
Chrome's current Install and create shortcut > Create shortcut flow offers an icon
that opens the same app in Chrome, using its existing browser storage. Guidance
retains old-menu alternatives and does not recommend clearing unsynced site data.
Teacher, learner, Safari and desktop install identities/prompt handling stay intact.

Learner registration no longer awaits an update request before warming and observes
its exact scoped worker instead of serviceWorker.ready, which can return the root
worker during activation. Online reconnection retries warming; subscriptions clean
up on unmount. Install/activate no longer waits on CacheStorage or downloads. Cached
learner assets return immediately; network-only navigation has an eight-second
fallback. Warm-ups coalesce, and previous offline documents/chunks survive failed
or incomplete replacements. Successful full warming preserves prior immutable
chunks for open tabs before removing old learner caches. Teacher caches and APIs
are untouched. Assessment results, IndexedDB, frozen contents and ordered sync are
unchanged. Teacher cache71 / learner32. No database migration/data correction or
dependency change was needed for this device/browser flow.

Affected: AppInstallButton/styles, pwaInstall, new pwaReadiness/learnerWorker helpers,
LearnerPwaShell, learner/teacher worker versions, build gate, download browser checks,
new learner PWA regressions and maintenance notes. Validation: clean npm ci; full npm
run build and assessment gates; live all-severity dependency audit with zero known
vulnerabilities. VM tests verify exact-worker activation despite a hanging update,
listener cleanup, cache/network-independent install, retained old offline documents,
immediate cached chunks, complete/coalesced replacement and API bypass. File checks
cover invalid role, bad icon responses, dimensions, deadlines and retry. Actual
browser checks pass 320/390/768/1024/1440px in both themes, including accepted-but-no-icon
reminder, file checks, shortcut help, prompt recovery and repeated CSV/backup handoffs.
A real browser worker activates with blocked downloads and boots its prior shell
offline. The optimized application passes landing-to-learner navigation with both
root/scoped workers, one correct learner manifest, zero Chromium installability errors,
file/worker checks and a complete offline reload. Responsive help was visually inspected.
These checks do not reproduce Google Play/WebAPK minting or physical launcher placement.

The main native capstone baseline was updated in place to .8. PDF QA retained 106
pages and all 56 valid named navigation destinations; the complete revised baseline
fits page 92 and was rendered/inspected. Activity/use-case/ERD actor goals, business
processes and data relationships are unchanged, so their consistent designs/colors
and editable sources remain intact. Scope, objectives, references and Form 06 were
preserved. Rollback: revert this release's browser/worker changes without clearing
IndexedDB, queues, working offline caches or existing installations.

Primary platform references reviewed for the distinction and fallback:
https://web.dev/learn/pwa/detection
https://support.google.com/chrome/answer/15085120?co=GENIE.Platform%3DAndroid
https://chromium.googlesource.com/chromium/src.git/+/main/components/webapps/docs/android_architecture.md

## CRL-2026-11-04.7 — Reliable mobile installation and file handoffs

Date: 4 November 2026, Asia/Manila.

Teacher landing, teacher sidebar compatibility controls, Profile and learner install
controls now share one role-aware install controller/dialog. It captures early prompts,
consumes each browser event once and calls prompt synchronously from the user's tap.
Dismissal, rejection, missing prompts and a 45-second unresolved-choice deadline return
to usable retry/manual help. A newer event cannot be erased by an older attempt. Teacher
and learner prompts are bound to their current manifest identity; their existing distinct
IDs/start URLs/scopes remain unchanged. Browser-tab controls no longer disappear after
appinstalled or rely on historical installation flags. Only actual standalone display
hides them, including the Profile panel. Device-specific steps include Safari/iPhone/iPad,
regular-browser guidance and finding an Android launcher icon. An accepted browser request
is not reported as proof that an icon reached the Home screen. The obsolete cache-only
preparation action, OS blacklist and instructions hidden by compact dialog overrides
are superseded. Root metadata supplies a real Apple touch icon.

Teacher worker installation/activation no longer waits for routes, workbook files,
fonts or chunks. Registration schedules warming after activation and on reconnection;
worker warm-up requests coalesce, asset fetches have eight-second deadlines, and failed
warm-ups remain retryable. Supersedes activation-time deletion of old teacher caches:
the working offline copy stays until the new core teacher/login/assessment documents
exist. Successful warming removes old documents while retaining immutable chunks for
open tabs and leaving learner caches alone. APIs remain network-only. This preserves
existing offline assessment data, account boundaries and ordered synchronization.

A shared downloadBlob helper now appends its anchor before clicking and retains each
object URL for 60 seconds for mobile browser handoff. It cleans up after failure, rejects
empty files and removes path/control characters from filenames. Archive, backup, class
archive, CSV and teacher Excel exports use it; payloads, encryption and authorization
are unchanged. Server-streamed coordinator Excel exports remain intact. Browser handoff
cannot establish that a user completed the OS Save dialog.

Affected: install controller/shared control/styles, teacher/learner wrappers and Profile,
PwaRegister, root icon metadata, worker/cache/build checks, file-export callers, regression
scripts and maintenance notes. Teacher cache70 / learner31; no dependency or database
schema/data changes. The new controller/file tests join the normal build gates.

Validation: clean npm ci; full npm run build and all regression gates; live all-severity
dependency audit reported zero known vulnerabilities. Controller tests cover early events,
click activation, one-shot use, duplicate attempts, newer-event retention, role boundaries,
rejection/dismissal/reinstall and hung-choice recovery. Worker tests cover network-free
installation, retained offline fallback, successful later cleanup, coalesced warming and
API bypass. Actual browser tests pass five widths in both themes, including 320px short
viewport reachability, dark input contrast, a hung-prompt deadline, standalone exit/retry,
role isolation and repeated real CSV/backup downloads with verified payloads. An actual
browser worker activates while shell responses are deliberately blocked. iPhone and
desktop-UA iPad guidance passes; responsive install dialogs were visually inspected.
Existing optimized teacher checks pass eight widths; coordinator UI/download/recovery
checks pass four widths in both themes. All test accounts/files are synthetic.
These checks do not prove physical Android/iOS launcher placement or certify every
browser/device combination; the browser and OS still control actual installation.

The native baseline was updated in place to .7. PDF QA retained 106 pages and all 56
named navigation destinations; the full revised paragraph fits on page 92 and was
rendered/inspected. Diagram actor goals, processes and data relationships are unchanged;
existing activity/use-case/ERD palettes, geometry and editable sources remain consistent.
Scope, objectives, references and Form 06 were untouched. No database migration or
record correction was needed. Rollback: revert the install/download/worker/cache changes;
retain current IndexedDB records and queue contents rather than clearing device storage.

## CRL-2026-11-04.6 — Section-specific skeletons and a plain startup screen

Date: 4 November 2026, Asia/Manila.

Supersedes .5's skeletons on the shared opening screen and its generic table shapes.
AppLoadingScreen again contains only the original brand, real progress milestones
and status. Consent/startup on administrator, teacher and learner routes has no ghost
containers. The teacher's later authentication fallback uses the same branded screen.
No minimum display timer or new data dependency was introduced.

In-page placeholders now match their owning UI. Teacher home has six overview metrics,
a five-row/two-column latest-learner table and six icon/menu cards. It follows the real
1280/1024/720px bento breakpoints, including the mobile collapsed Overview. Class scope
shows its title and two selector fields; coordinators get their section action row.
Teacher directories have avatar/name rows; school years have compact year/action rows.
Contents has timeline/category controls and item rows, with editing/mode/default shapes
only in the administrator version. Rosters use their desktop columns and mobile labelled
cards. Records follows the shared scoresheet column count/widths and timeline/view/action
groups. Evidence uses summary cells and answer lists. Audit, reports, unlock requests,
archives, backups and recovery choices each have their own structure. Learner passage
loading uses text lines inside the existing readiness veil; reading-clock and stage
safeguards are unchanged. Root variant classes are separate from inner layout classes
so placeholders cannot overflow into neighboring sections. Decoration is noninteractive,
with accessible status text, dark colors and reduced-motion support.

Affected: DashboardSkeleton/CSS, shared/startup loaders, administrator and teacher
pages, learner passage fallback, class/library/recovery components, browser/VM checks,
cache/build verifier and maintenance notes. Teacher cache69 / learner cache30.
Dependencies, database schema/data, assessment scoring and ordered synchronization
are unchanged. No migration or production data correction was necessary.

Validation: clean npm ci; full npm run build with all assessment gates and a live
all-severity dependency audit reporting zero known vulnerabilities. Actual component
browser checks passed at 320/390/720/768/800/1024/1280/1440px in both themes: six admin
pending tabs, delayed list/teacher/year/library requests, real failure/Retry and 22
section shapes with horizontal/vertical bounds, noninteractive elements and reduced
motion. The optimized teacher build passed at the same eight widths, including delayed
startup/data, six ghost menu cards, matching placeholder/loaded menu widths and horizontal
positions, matching overview widths and existing Conduct/Records/Contents/Analytics/profile
flows. Existing loaded-menu browser checks passed nine widths in both themes. Startup
browser checks passed five widths in both themes, with no skeleton, real milestones,
recovery, fast and offline paths. Synthetic screenshots were visually inspected; these
checks do not establish physical-device or school acceptance outcomes.

The native implementation baseline was updated in place to .6, distinguishing branded
startup from section-shaped in-page loading. The exported PDF retained 106 pages;
all 56 named navigation destinations resolve, and the revised page was rendered and
inspected. Use-case, activity and ERD capabilities/relations did not change, so their
consistent designs, palettes and editable sources remain intact. Scope, objectives,
references and Form 06 were untouched. Roll back presentation/cache changes only;
no database rollback is needed.

## CRL-2026-11-04.5 — Responsive dashboard skeleton loading

Date: 4 November 2026, Asia/Manila.

The administrator overview and paginated lists now track their requests separately.
An unrelated list effect previously cleared the shared loading flag before overview
finished, briefly rendering Dashboard unavailable. Pending overview requests now
show ghost containers on every admin tab; a settled failure retains an actual error
and Retry. List scope tracking also prevents stale rows or false empty notices when
switching Audit Log/Unlock filters or tabs. Existing rows remain during load-more.

DashboardSkeleton supplies responsive cards, fields, lists, chart and inline shapes.
WorkspaceLoading now uses these placeholders across coordination, contents and
recovery. Teacher startup retains its logo and real progress milestones while adding
empty field containers; teacher authentication, learner overview, class selectors,
roster and analytics detail use skeletons until their existing requests settle.
Pending class/learner data no longer flashes empty notices or zero summary counts.
Light/dark themes, reduced motion, screen-reader status and noninteractive decorative
shapes are supported. No minimum display delay or data-fetch dependency was added.

Affected: AdminDashboard, TeacherPage, AppLoadingScreen, DashboardSkeleton/CSS,
WorkspaceLoading, class pickers, browser/VM fixtures, teacher cache68/build verifier
and maintenance notes. Learner cache29 and dependencies are unchanged. An existing
probabilistic tamper test now flips a decoded ciphertext byte rather than replacing
base64 suffix characters that could leave the bytes unchanged; encryption is unchanged.

Validation: clean npm ci; full npm run build with all assessment regression gates;
live all-severity dependency audit reported zero known vulnerabilities. Actual admin
component tests hold responses across all six tabs, audit/unlock lists and genuine
failure/Retry at 320/390/800/1440 px in both themes; skeleton gallery checks include
reduced motion and viewport bounds. Optimized teacher browser tests hold auth and
learner requests, expand the mobile overview and verify class loading, then exercise
existing Conduct/Records/Contents/Analytics/profile flows at the same four widths.
Startup browser checks pass at 320/390/800/1280/1440 px in both themes, including real
milestones, recovery handoff and fast/offline paths without a minimum timer. Rendered
mobile/light and desktop/dark skeletons were inspected. All browser data was synthetic.
These checks do not establish physical-device or school acceptance outcomes.

The native implementation baseline was updated in place to .5 and describes pending
skeletons versus genuine failures. PDF QA retained 106 pages and all 54 TOC destinations;
the revised page was rendered and inspected. Existing activity/use-case/ERD designs,
colors and relationships remain accurate and unchanged. No schema or production data
mutation was needed for this UI fix. Scope, objectives, references and Form 06 were
untouched. Rollback: revert these UI/cache changes; no database rollback is required.

## CRL-2026-11-04.4 — Independent Classes and Records selections

Date: 4 November 2026, Asia/Manila.

Classes and Records now own separate teacher, school-year, section, search, sort,
pagination and loaded-data state. Opening Records for the first time shows its
teacher list even when Classes already has a selected teacher. Returning to either
tab restores that tab's own choices. Back clears only the current tab's teacher/class
selection. Setters and asynchronous responses retain their owning tab; the class
workspace is keyed by tab so local form state cannot cross between them. This
supersedes the shared coordinator workspace selection. API authorization, actual
classes/results and coordinator read-only report behavior are unchanged.

Affected: CoordinatorConsole, coordinator browser coverage, teacher cache67/build
verifier and maintenance notes. Learner cache29 is unchanged. No database migration
or data correction was necessary; these are in-memory UI choices.

Validation: clean npm ci; full npm run build and all assessment gates; live audit
reported zero known vulnerabilities. Actual component browser tests cover distinct
teachers, fresh Records selection, per-tab year/section restoration, independent
Records search/sort, Back isolation and existing coordinator workflows at
320/390/800/1440 px in both themes. Synthetic checks do not establish physical-device
or school acceptance outcomes.

The native design paragraph and implementation baseline were updated in place.
PDF QA retained 106 pages and all 54 TOC destinations; changed pages were rendered
and inspected. Use cases, activity flow and ERD relationships remain accurate:
no actor capability, entity, relation or business process changed. Existing diagram
colors/designs were preserved. Scope, objectives, references and Form 06 were untouched.

Rollback: revert the scoped UI/cache changes; no database rollback is required.

## CRL-2026-11-04.3 — Live activity leases, bounded recovery and abandoned-attempt cleanup

Date: 4 November 2026, Asia/Manila.

Supersedes .2's rule that every unfinished host blocked the content library.
Live activity and recoverable progress are now separate: a fresh active teacher
heartbeat holds a 30-second lease, with a short no-presence grace for new starts.
Interrupted/recovering/stale presence does not hold the library lock. Teacher HTTP
presence now persists even when peer acknowledgements are fresh. Page hide/hidden
visibility sends best-effort interrupted presence, pauses learner-dependent control
and the passage timer; network/process failure is bounded by lease expiry.
Cloud detection still requires connectivity; offline attempts keep frozen contents.

Interrupted recovery is eligible for 24 hours after its checkpoint, with existing
ownership/deletion/End/final-save safeguards. Expired checkpoints are not offered
Continue. Offline host expiry queues End atomically and preserves its ordinary
recorded evidence/journal; server expiry ends stale hosts without deleting scores.
This general recovery policy is separate from the user's explicit cleanup request:
one identified abandoned attempt and all linked results, metrics and presence were
permanently deleted from the live database. No enrollment or other attempt was
removed. Disconnected device copies cannot be remotely erased by a database change.

Applied migration 20261104034130_assessment_activity_lease adds invoker functions
for live lease detection/expiry and serializes presence activation with publication.
The existing library triggers use the new predicate. Fixed search paths and revoked
public/anon/authenticated execution preserve backend-only access. No entity/column
or declared relationship changed. Teacher cache66 / learner29; dependencies unchanged.

Validation: clean npm ci; final full npm run build, all assessment checks and live
all-severity audit with zero known vulnerabilities. New recovery boundary and offline
expiry tests confirm End journaling without losing ordinary recorded answers. Actual
DB rollback probes checked fresh activity locks, interruption release, 31-second
staleness and 24-hour host expiry; probe changes were rolled back. Actual cleanup
readback found zero related host/session/answer/metric/presence rows and no unfinished
host. Real teacher/learner browser integration completed letters, words, timed passage,
six questions, ratings and a local final record while cloud access failed; presence
stayed live beyond the timeout. Physical-device Wi-Fi testing remains separate.

The native baseline and Figures 17/22 notes/images were updated in place. Editable
SVG/drawio use the same activity colors, lanes and arrowheads. PDF QA retained
106 pages and all 54 TOC destinations; revised pages were visually inspected.
General use cases/ERD structure remained valid; scope, objectives, references and
Form 06 were unchanged.

Rollback: retain the applied guard functions unless deliberately replacing the lease
policy. Reverting the app alone restores the overbroad unfinished-row lock. The
explicit permanent cleanup has no restoration copy made by this task.

## CRL-2026-11-04.2 — Read-only teacher contents and active-assessment publication lock

Date: 4 November 2026, Asia/Manila.

Teacher Contents shares the administrator's timeline/category visuals, with plain
story titles, visible passages and comprehension questions/teacher guides. There
are no import, item editing, deletion, default or mode controls. All timelines
read the shared published library. Existing item-by-item online resolver/offline
selection tests retain exact 10/10/2 runs, seeded Random, edited guides, deleted
items, original passages and immutable prior versions; no learner guides leak.

Known unfinished host sessions globally lock administrator management, including
Add, Import, editing, Delete, mode/default changes and Save. Independent status
polling freezes controls without replacing a draft; failed status checks suspend
editing. Navigation and cancellation remain available. Server publication checks
under the same transaction advisory lock used before assessment-start policy
resolution. Applied migration 20261103172740_library_active_assessment_guard also
protects library heads/revisions and orders host activation. Its invoker functions
have fixed search paths and no public/anon/authenticated execution grants. Existing
RLS, records and catalog versions were preserved. There is one pre-existing
unfinished host; it was not ended or modified. Completion or explicit teacher End
releases the lock; no age-based timeout silently unlocks recoverable assessments.

A disconnected offline-only device cannot announce its live state to the cloud.
Its frozen version remains usable and replays through the existing synchronization
path. This supersedes unrestricted coordinator publication during known active
attempts; it does not force offline devices to contact the cloud before starting.
Teacher cache65 / learner28. No dependency change.

Validation: clean npm ci, full npm run build and all regression gates, live audit
with zero known vulnerabilities. Publication-lock tests rejected every timeline
without writes, retained read access and unlocked after ending. The actual DB guard
rejected an update probe without catalog changes; three triggers and installed
migration were verified. Synthetic browser checks passed 320/390/800/1440 px in both
themes, covering teacher passages/questions without dropdowns or write controls,
viewport fit, admin lock/unlock, and existing management/record/recovery flows.
These checks do not establish physical-device pairing or school acceptance.

Native capstone baseline and Figure 17 note/image were updated in place, with the
established activity colors/geometry and editable SVG/drawio. Actor permissions,
entities and relationships did not change, so general use cases/ERDs needed no new
structure. Form 06, objectives, scope and references were preserved.

PDF QA retained 106 pages and all 54 TOC destinations; revised pages were visually inspected.

Rollback: revert application/cache changes only with a reviewed decision about the
editing policy. Preserve immutable history. Keep database guards unless deliberately
retiring this protection; dropping the three named triggers/functions removes the
DB enforcement without changing stored records.

## CRL-2026-11-04.1 — Temporary content prompts and distinct selection controls

Date: 4 November 2026, Asia/Manila.

Request: remove permanent draft/count/validation and publication-success text from
Assessment Contents; explain incomplete drafts briefly at the lower right when
leaving; remove the toolbar Discard action; distinguish choice groups and Add/Import
actions, with responsive layouts.

This supersedes .8's inline publication guidance and validation messages. A scoped,
accessible five-second notification now explains incomplete contents on category,
timeline, coordination-tab, main-menu and installed-app Back attempts, or failed
saving. It can be dismissed and stays above dialogs within the viewport safe area.
Save, Keep editing and Discard still protect unsaved work. Publication errors use
the notification rather than adding text inside that dialog. Native browser unload
protection remains; a browser controls its own reload/close confirmation. Installed
Back from the contents page returns to Classes while retaining class selection;
Back first closes an already-open overlay. The main toolbar has Save but no Discard,
and successful publication adds no persistent banner. Local editor/import errors
and genuine data-loading failures retain their appropriate feedback.

Timeline choices use blue, category choices purple and Fixed/Random green, including
dark mode and selected-hover exclusion. Add item is blue, Add story teal and Import
purple, distinct from green Save. No dependency, server, publication validator,
assessment selector, scoring, synchronization, immutable version or recovery rule
changed. Save remains disabled for incomplete drafts and guarded saving still rejects
invalid sets before any API call. Teacher cache64 / learner28. This presentation-only
release needed no database migration or data replacement; current stored materials
and historical evidence were preserved.

Affected: AssessmentLibrary, CoordinatorConsole, AdminDashboard, the optional
UnsavedChangesDialog error callback, scoped coordinator styles, service-worker/build
verifier, browser regression harness and Figure 17 sources.

Validation: clean npm ci; full npm run build and assessment regression gates; live
all-severity dependency audit reported zero known vulnerabilities. Actual admin UI
passed 320/390/800/1440 px in light/dark themes, including prompt positioning above
dialogs, dismissal/expiry, invalid publication without an API call, absent inline
messages/toolbar Discard, all navigation guards, installed Back routing, three
distinct choice colors and separate Add/Import/Save colors. Existing all-period,
mode, story-editor/import, roster, records and recovery checks passed. Optimized
teacher UI passed all four widths; the content layout check passed. These synthetic
checks do not establish physical-device or school acceptance outcomes.

The native capstone baseline and Figure 17 note/image were updated in place. The
targeted generator retained the established activity colors, geometry and arrows;
SVG/drawio remain editable. Export QA retained 106 pages and all 54 TOC destinations;
the figure and implementation pages were rendered and inspected. General use cases
and selected-key ERDs needed no structural change because permissions, entities and
relationships were unchanged. Objectives, scope, references and Form 06 were untouched.

Rollback: revert source/cache generation; no schema or data rollback is required.
Keep .8's server validation and immutable historical materials intact.

## CRL-2026-11-03.8 — Enforce complete publication sets and mode-specific defaults

Date: 3 November 2026, Asia/Manila.

Request: prevent saving fewer than ten selected letters/words or two selected
stories in Fixed default; require full pools in Random; hide Default controls in
Random; remove expandable story titles from the administrator list.

AssessmentLibrary now disables the shared Save button whenever the selected
period has an invalid category, and displays its counts and validation messages.
One shared pure publication validator also guards imperative/unsaved-dialog saves
and the server before any revision/head/audit write. Fixed default requires at
least 10/10/2 distinct, valid selected identities. Extra selected items are allowed;
existing list-order selection still administers exactly 10/10/2. Duplicate pools,
duplicate or foreign fixed choices and short pools are rejected. Existing item,
100-word passage, six-question and answer-guide checks remain.

Random requires pools of at least 10 letters, 10 words and 2 stories, without a
fixed-selection minimum. Its Default column and checkboxes are absent from the DOM;
three-column desktop and compact mobile tracks keep number/content/actions aligned.
Switching back to Fixed shows any incomplete retained choices and blocks publication
until repaired. Random publication retains only still-valid hidden fixed choices;
it does not silently fill a fixed selection. Invalid local drafts remain editable
so deleting/replacing an item can be completed before publishing. Busy publication
disables row controls. Admin story titles are plain text with word counts; Edit
still opens the full editor. Teacher read-only story viewing is preserved.

Affected: AssessmentLibrary/Coordinator styles, assessmentContent publication
helpers, coordinatorPolicy, library server/browser regression checks, teacher
cache63, and Figure 17 sources. Learner cache28 and the run selector/protocol are
unchanged. Read-only actual-database checks found all three published periods with
10 letters, 10 words, 2 stories and complete fixed choices. No data replacement or
schema migration was needed; approved passages, historical revisions, saved evidence
and current head references were preserved. Existing backend-only RLS remained.

Validation: clean npm ci; full npm run build and all regression gates; live
all-severity dependency audit reported zero known vulnerabilities. Actual server
publication tests cover each category/period in both modes, rejected publication
without writes, duplicate/foreign choices, empty random defaults, extra fixed
selections, stable standard run counts and online/offline frozen-version parity.
Actual coordinator UI passed 320/390/800/1440 px in both themes: disabled Save,
mode switching, absent random defaults, column layout, plain story titles and
existing editor/unsaved workflows. The desktop functional matrix also covers all
three categories and timelines, undersized random pools, and guarded unsaved Save
without an API call. Optimized teacher UI passed all four widths. Synthetic tests
do not establish physical-device or school acceptance outcomes.

Native capstone baseline .8 and Figure 17 note/image were updated in place.
Editable SVG/drawio and PNG keep the established blue/purple/green swimlanes,
white actions, yellow decision and solid arrowheads. A targeted generator avoids
rewriting unrelated diagrams. PDF QA retained 106 pages and all 54 TOC destinations;
the figure and baseline pages were rendered and inspected, with justified note text
and only the Note label italic. General use cases and selected-key ERDs remain
accurate because actor permissions, entities and relationships did not change.
Scope/objectives, references and Form 06 were untouched.

Rollback: revert source/cache generation. No schema/data rollback is required.
Keep previously published immutable versions; do not alter historical materials
or run counts. Restoring the prior server would again require exactly 10/10/2
fixed choices, so normalize any later larger Fixed selections through a new
publication rather than overwriting history.

## CRL-2026-11-03.7 — Single-record archive dialogs and aligned recovery actions

Date: 3 November 2026, Asia/Manila.

Request: remove selection checkboxes when restoring one deleted learner; clearly
show the selected record in Download/Delete too; align fields, gaps and actions in
all Archive and Backup overlays across screen sizes.

A one-learner restore now shows a noninteractive selected-record preview and Restore
learner action. It has no Select all or learner checkbox. Genuine groups retain
individual/all selection, destination checks and the same archived-ID submission.
Single-record Download and permanent Delete show the same preview, owner and expiry.
Download has Close/Download in its own footer; permanent deletion retains password
confirmation. Class restoration uses the same preview and spaced action footer.
Archive Import and all backup forms use a scoped spacing rhythm; backup Create,
Rename, Download and Delete actions have consistent separation and responsive sizes.
Original server-adjusted countdowns, 30-day deadlines, restoration validation,
immutable evidence, owner checks and backup rules are unchanged.

Affected: ArchiveRecordPreview, LearnerArchiveRestore, ClassArchiveRestore,
CoordinatorArchives/Backups, ArchiveImport, scoped ClassWorkspace/Coordinator styles, archive
render/browser checks and teacher cache62. Learner cache28 is unchanged. This is
presentation of existing records: no migration or actual database mutation was
needed. Preserve the .6 metadata migration and all existing encrypted snapshots.

Validation: clean npm ci; full npm run build with the complete regression suite
and live all-severity dependency audit, zero known vulnerabilities. Actual admin
components passed 320/390/800/1440 px in both themes. Checks covered no single-record
checkboxes, single-ID restore payload, protected Delete, retained group selection,
separate Download, at least 24px from preceding content to action buttons, 44px
button targets and no dialog horizontal overflow. Actual optimized teacher pages
passed all four widths. Screenshots used synthetic records; this is not physical-
device or school acceptance evidence.

Native capstone baseline .7 and Figure 20 note were updated in place. The diagram's
existing selected-record restore flow, general use cases and ERD relationships
remain accurate, so no new nodes/relationships or theme changes were needed.
PDF QA retained 106 pages and all 54 TOC destinations; both revised pages were
rendered and inspected. Note formatting stayed justified with only its label italic.
Scope/objectives, references and Form 06 were untouched.

Rollback: revert this source release and teacher cache generation. No schema/data
rollback is required. Do not remove group restoration or reintroduce checkboxes
for a single selected record.

## CRL-2026-11-03.6 — Separate Archives and named teacher-record Backups

Date: 3 November 2026, Asia/Manila.

Request: optional administrator deletion reasons; spaced Recovery heading; two
responsive menu choices; separate Restore and Download dialogs; compact Deleted
Learners / Classes categories; named backups for one, multiple or all teachers,
with Rename, Download and Delete, without Restore.

Recovery now opens two icon cards. Archives uses independent category pages with
original teacher labels, days-only retention, right-aligned actions and category
empty states. Restore and Download use separate dialogs; learner Restore supports
whole-group or selected restoration and destination classes. Opening a deletion
group fetches its complete available membership (up to the existing 500-item
operation limit), independent of the 50-row list page. Archive downloads stay in
the original importable format. The requested offline/ownership explanatory footer
was removed. The existing password, synchronized-device acknowledgement, active-test,
ownership, restore-conflict and atomic 30-day deletion safeguards remain intact.
Administrator learner, section and shared-year reasons are optional, with a
300-character limit. Legacy teacher offline proof validation remains unchanged.

Backups stores only explicit manual snapshots, excluding automatic learner/content
recovery copies. Create resolves one/multiple selected teachers or every registered
teacher on the server and copies current active classes, enrollments, full assessment
evidence, remarks and referenced immutable revisions. Names and teacher selection
are persisted separately from encrypted evidence. Rename changes metadata only;
Download creates an encrypted file; Delete removes only the saved snapshot. Backup
restoration is rejected by the server, and former create/import backup routes are
retired. Existing manually created backups remain available with an earlier-backup
name. Existing 90-day manual-backup retention stays visible. Files downloaded before
expiry remain on the device. Very large selections fail explicitly rather than
truncate: at most 1,000 learners and 3 MiB of encrypted payload per new backup.
Choose fewer teachers when the server reports that limit. Create uses a stable
request UUID, transaction lock/digest and repeatable snapshot; retries do not create
duplicate backups or audit events. No passwords or authentication tokens are copied.

Affected implementation: AdminDashboard/admin route, coordinator Recovery/Archives/
Backups/list components and styles, coordinator roster/class confirmations, optional
reason helper, recovery/backup services, audit metadata, Prisma schema, regression
fixtures and teacher cache61. Learner cache28, assessment scoring and sync protocol
are unchanged. Additive migration 20261103115836_coordinator_backup_metadata was
applied to the actual database: backup_name, backup_teacher_ids and a partial paging
index. Existing ciphertext, archival deadlines and live records were preserved.
Read-only checks confirmed both columns, index and RLS. Security advisors retained
only existing informational backend-only RLS/no-policy notices, with no WARN/ERROR.

Validation: clean npm ci; Prisma generation; full npm run build including all
regression checks and live all-severity audit with zero known vulnerabilities.
Actual backup server tests cover authorization, selected/all scope, active-only
copies, immutable evidence, duplicate retries, conflicts, size/audit rollback,
metadata-only rename, safe download, cursor pages and isolated deletion. Actual
administrator UI passed 320/390/800/1440 px in both themes, separate dialogs,
categories, group restoration controls, names, selected/all teacher controls,
rename/download/delete and existing coordinator/records/content safeguards.
Optimized teacher prerender/chunks passed all four widths. Synthetic browser checks
do not establish physical-device or school acceptance outcomes.

The native capstone baseline, recovery procedures, optional-reason descriptions and
Table 8 metadata were updated in place. Figures 15 continuation, 20 and 23 were
revised with matching blue/purple/green swimlanes, white actions, yellow decisions
and solid arrowheads. SVG, PNG and editable diagrams.net sources are retained.
General use cases and selected-key ERDs remain accurate: additive metadata created
no new entity or declared relationship. PDF QA retained 106 pages and all 54 TOC
destinations; revised figures and data-structure table were rendered and inspected.
Notes remain justified with only the Note label italic. Scope, objectives,
references and Form 06 were not changed.

Rollback: revert source and teacher cache generation. Keep additive DB columns and
index; removing them would discard saved names/teacher-selection metadata. New
records_backup snapshots must remain exportable rather than be interpreted by the
legacy restoration path. Do not roll back password/archive safeguards or erase
existing encrypted evidence. Production deployment must match the GitHub release
commit before completion is reported.

## CRL-2026-11-03.5 — Unified profile progress and stable selected controls

Date: 3 November 2026, Asia/Manila.

Request: keep the learner-deletion action but label it Delete; bring Content next
to #; keep selected controls steady on hover; combine Profile Comparison with
Reading Profile Progress.

Coordinator learner confirmations now say Delete, including bulk deletion, while
the same password/reason checks and teacher-labelled 30-day archival run unchanged.
Assessment Contents keeps its narrow number gutter and aligns the Content heading
and values immediately beside it. Default and Actions retain aligned tracks. Story
expansion and compact mobile controls are unchanged.

Reading Profile Progress is now the only analytics chart card. Its existing bar
graphs include All 3 and the three timeline-pair choices, percentage/count modes,
period enlargement and the profile-color legend. The separate Profile Comparison
card is superseded. Single-section and All Sections views share these controls;
All Sections still has no learner list. Desktop groups and mobile cards honor the
same selected periods. Unassessed timelines show a distinct empty state rather
than fabricated zero results. Count axes use a common integer scale with unique
ticks, including small classes. The full enrolled roster, completed-only metrics,
class ownership and scoring remain unchanged.

Hover selectors exclude selected/active controls and the explicitly requested
Export Excel action while preserving ordinary unselected hover and keyboard focus.
This covers coordinator tabs/selection cards, teacher tabs/report controls and
selected passage words. Teacher cache60 ships the updated styles; learner cache28
and the pairing/synchronization protocol remain unchanged.

Validation: clean npm ci; npm run build passed its full regression suite and live
audit with zero known vulnerabilities. Actual coordinator components passed
320/390/800/1440 px in both themes, checking adjacent number/content text, distinct
action colors, Delete wording, protected deletion, selected-hover stability and
ordinary Random-card hover. The optimized teacher prerender/current chunks passed
at all four widths with synthetic API data: one progress card, all/pair filtering,
missing-period states, unique 1/0 count ticks, selected report/timeline controls,
Export hover, existing Conduct eligibility, records, stories, Print and profile
cropping. The fixture reads the exact built HTML/chunks from disk to avoid stale
local-server responses. These checks do not establish physical-device or school
acceptance results.

The native capstone baseline and Figure 16 note/diagram were updated in place.
SVG/drawio/PNG sources retained the established colored swimlanes, white actions,
yellow decisions and solid arrowheads. PDF verification retained 106 pages and all
54 TOC destinations; the diagram page was rendered and inspected, notes remained
justified, and no em dashes were introduced. Scope/objectives, references and Form
06 were untouched. No database migration or production record mutation is needed:
this revision changes presentation of existing data and control labels. General
use-case goals and ERD relationships therefore remain accurate.

Rollback: restore the previous release and teacher cache generation. No schema or
data rollback is required. Keep the 30-day archival behavior behind Delete and do
not reintroduce duplicate chart cards or missing-period zero assumptions.

## CRL-2026-11-03.4 — Admin audit previews, Recovery reads and report formatting

Date: 3 November 2026, Asia/Manila.

Request: center Assessment Contents columns and row controls; distinguish Edit and
Delete; repair empty audit previews and Recovery loading; remove the Records notice;
match the teacher Class Summary tables.

Assessment Contents now uses common centered tracks for #, Content, Default and
Actions. Edit uses blue and Delete uses red. Mobile keeps content above a compact
checkbox/actions line; expanded story passages remain readable. Shared report CSS
now targets html:root rather than requiring a teacher-only theme attribute. This
retains the teacher workbook cell borders, gray headers, green profile cells,
column widths and internal scroll areas in the admin console too. The redundant
Records notice was removed; scores and teacher remarks remain read-only.

Recovery's legacy query selected a nonexistent Prisma teacher relation. The actual
production runtime reported PrismaClientValidationError; schema inspection confirmed
the mismatch. Recovery now reads valid fields and batch-resolves original teacher
labels through User IDs. Failed archive loads no longer display a false empty state.
No schema migration or production record mutation was needed. Read-only live checks
confirmed the existing recovery rows and valid owner links. Retention, encrypted
snapshots, ownership, restore, backup and purge rules are unchanged.

Audit View now renders explicit event metadata and supported record details. Shared
library saves read the immutable revision recorded by the event, in pages of 25,
rather than the latest catalog. This includes the saved letters, words, passages,
question guides and settings. Events without snapshots explain that only metadata
was stored; unavailable revisions have an explicit state. No missing history is
invented. Auth checks and encrypted-history integrity remain enforced. Teacher
cache59 ships the shared report and content styles; learner protocol is unchanged.

Validation: clean npm ci and npm run build passed, including all regression gates
and a live audit with zero known vulnerabilities. The actual route tests validate
Recovery selections against Prisma's generated schema and test owner labels,
immutable audit item paging, unavailable revisions and rejected tampered history.
Actual coordinator components passed 320/390/800/1440 px in both themes, with
center-track geometry, distinct action colors, no horizontal page overflow, 25
visible audit item records and Class Summary computed cell styles without a theme
attribute. Production-build teacher checks passed at all four widths. Tests used
synthetic records; no physical peer-device or school acceptance claim is implied.

The native capstone baseline and Figure 19 note/diagram were updated in place.
Editable SVG/drawio and PNG sources retained the existing swimlane colors, white
actions, yellow decisions and solid arrowheads. PDF verification retained 106 pages,
all 54 TOC destinations, justified notes and figure placement, with no em dashes.
General use cases and ERD relationships remain accurate; no data-model change was
introduced. Approved scope, objectives, references and Form 06 were untouched.

Rollback: restore the prior app release and cache generation; no database rollback
is required. Do not reintroduce the nonexistent recovery relation, theme-dependent
workbook formatting or empty previews for shared library events.

## CRL-2026-11-03.3 — Scoped school-year messages and profile-comparison chart

Date: 3 November 2026, Asia/Manila.

Request: remove lingering school-year messages from Coordination; keep duplicate
year validation inside Add school year; replace numeric profile comparison with
a responsive chart.

Root fix: year add/delete dialogs previously reused the page error state, so a
duplicate error became visible in the page after closing the dialog. These
operations now use a separate yearError state. Open/close paths clear validation,
including X, Cancel, Escape and PWA Back via the shared dialog. School-year
success operations update the list without leaving inline success messages.
Other page/load errors and shared-content notices remain independently handled.
Duplicate-year enforcement and nonempty deletion safeguards are unchanged.

Profile Comparison now uses a grouped horizontal bar chart with five reading
profiles, a common integer count scale, subtle gridlines, and distinct blue,
purple and green timeline colors. All 3 and the existing two-period choices
remain. Legend totals and labelled series describe assessed learners. Missing
timelines display Not assessed and a dash, while measured zero remains zero.
A selection with no completed assessments has a meaningful empty state. The
chart uses responsive SVG bars and accessible labels without a new dependency,
API, schema or change to scoring/aggregation. All Sections retains the existing
single year-wide graph. Teacher cache58 ships the updated resources.

Affected: CoordinatorConsole, ProfileComparisonChart and scoped styles, pure
profileComparison model, teacher page wrapper, teacher SW, chart/model/browser
regressions, release notes and the coordinator diagram generator/Figure 16.
No database migration or production record mutation was required: this changes
dialog state and presentation of existing class-scoped assessment data only.

Validation: clean npm ci; npm run build passed, including the full regression
suite, the new chart/model checks and a live audit reporting zero known
vulnerabilities. Actual admin components passed at 320/390/800/1440 px in both
themes, including duplicate errors remaining in the overlay, X/Cancel/Escape
cleanup, empty-year deletion with no lingering message, and existing class,
records and content flows. Chart browser checks passed at the same widths and
themes for exact proportional widths, all/pair choices, missing versus zero,
empty state and no overflow/runtime errors. Production-build teacher browser
checks passed all four widths, including actual BoSY-only Analytics data and
period switches. Tests used synthetic records; physical peer/network and school
acceptance were not re-established by these presentation checks.

The native capstone was updated in place in the analytics description, class
validation note, Figure 16 note and release baseline. Figure 16 retained the
existing colored swimlanes, white actions, yellow decisions and solid heads;
editable SVG/drawio sources and generator were updated together. General use-case
goals and ERD relationships were unchanged. The PDF remained 106 pages; all 54
TOC references matched, the revised diagram page was rendered and inspected,
figure indents and justified notes were retained, and no em dashes were added.
Approved objectives/scope, references and Form 06 were untouched.

Rollback: restore the previous app release and teacher cache generation; no data
or schema rollback is needed. Do not reintroduce missing-period zero/delta
assumptions or reuse page errors for modal-only validation.


## CRL-2026-11-03.2 — Coordinator Records and batch enrollment

Date: 3 November 2026, Asia/Manila.

Request: right-align section controls; separate named-section creation from import;
make section deletion reasons optional; add a read-only coordinator Records tab;
restore horizontal multi-learner entry, immediate duplicate-LRN prompts and SF1
import beside Add learner.

Coordination now has School Year, Classes, Records and Assessment Contents. Both
Classes and Records use the searchable/sorted teacher directory and top owned
year/section dropdowns. Classes keeps section controls at the right. Add new
section contains one name input and no import/destination selector. Nonempty
section deletion permits a blank reason while retaining account-password and
synchronization confirmation, active-assessment checks, atomic archives and the
30-day deadline. Nonempty year and learner deletion reasons remain required.

Add learner opens responsive batch rows (up to 100) with LRN, last/first name,
optional middle name/initial and suffix, and sex. A debounced owner-scoped lookup
warns immediately about existing LRNs across that teacher's school years and
sections; duplicate rows are blocked. The server validates all names/LRNs under
owner/class locks and saves the entire batch and encrypted audit together. The
existing audit group-key receipt prevents duplicate creation on lost replies
within audit retention; after receipt expiry, identity constraints still prevent
recreating an existing learner. Changed payloads cannot reuse a saved receipt.
Import next to Add learner reuses the existing XLS/XLSX/CSV and SF1 parser, file
limits, required-field extraction and atomic duplicate/ownership protections.

Records uses the same AssessmentRecordViews renderer, workbook column widths,
colors, summary calculations and enrolled-only rows as teacher Records. All three
views and BoSY/MoSY/EoSY are available, with bounded inner scrolling, zoom, Print
and official workbook Export. Coordinator remark controls/inputs are absent,
including if edit mode is supplied accidentally. Targeted exports require the
separate verified coordinator session; ordinary teachers remain owner-scoped.
No coordinator Start or teacher enrollment-write permission was added.

Affected: CoordinatorConsole/ClassWorkspace/Roster, new learner/records views,
shared record rendering/model/styles, coordinator roster/identity/report API,
class lifecycle validation, protected Excel export, importer button accessibility,
regressions, teacher SW cache57, and editable diagrams. No dependencies changed.
Live schema inspection confirmed teacher-wide name/LRN unique indexes and the
existing audit group-key unique index. No migration or production learner-data
mutation was needed; ERD entities/relations and general use-case goals are valid.

Validation: clean npm ci; npm run build passed, including audit with zero known
vulnerabilities, full assessment/offline/archive suite, workbook-grid parity and
new actual-handler tests for batch rollback, identity conflicts, changed-payload
retries, roles, class scope, reset version, read-only views and export authorization.
Actual admin components passed synthetic browser QA at 320/390/800/1440 px in
light/dark themes, including batch checks/save, Import, three report views across
all periods, and no page overflow/runtime errors. The production-build teacher
regression passed at the same four widths. These checks did not use production
learner records and do not claim physical two-device or classroom acceptance.

The native main capstone was edited in place: relevant Chapter 1 significance,
Chapter 3 design/procedures, role explanation, validation and delivery baseline.
Figures 15, 15 continuation, 16 and 23 retained their established colors, white
actions, yellow decisions, solid heads and editable SVG/drawio sources. Notes
remained justified and left indents aligned. Exported PDF retained 106 pages;
all 54 TOC page references matched and changed diagram pages were rendered for
inspection. Approved objectives/scope, references and Form 06 were untouched.

Rollback: restore the previous app commit if required; no schema downgrade or
record deletion is necessary. Shared teacher report rendering is intentionally
reused, so preserve the grid/model tests when changing it. Deployment must be
verified against this release's GitHub SHA before completion is reported.



## CRL-2026-11-03.1 — Class workspaces, Recovery, dialogs and cropping

Date: 3 November 2026, Asia/Manila.

Request: repair global-year deletion and empty-year notices; simplify coordinator
class selection and roster; combine Add section/import; centralize teacher-labelled
archives in Recovery; improve loading, item selection, scrolling and profile images.

Coordinator Classes now uses top school-year/section dropdowns and teacher-style
roster columns with search, sex/status and name/LRN filters. Add section supports
optional XLSX/XLS/CSV upload or import into an existing section. Creation/import
is atomic and owner/version locked, duplicate safe and idempotent on retry.
No coordinator assessment Start or editable result evidence was added. Manual
archive/Archives/import controls are absent from Classes; Recovery contains class,
year and learner archives across teachers, labelled with original owner. Restore,
group/selective learner restore, download, archive-file import, password-confirmed
permanent removal and 30-day expiry remain. Older backup/history tools and manual
archives remain available. Year totals exclude unavailable child archives.

Root fixes: coordinator advisory locks now cast PostgreSQL void results to text,
which Prisma can decode. Global-year deletion reuses an unpurged year backup
without replacing encrypted evidence, starts expiry only for indefinite manual
archives and never extends an existing deadline. Applied migration
20261102171106_coordinator_recovery_indexes was read back and mirrored locally;
it indexes Recovery and excludes purged year archives from the uniqueness key.
Archive tables remain server-only. No production learner/year was deleted for QA.

Dialogs use solid fixed headers and independent scroll bodies. Story/question
spacing is tighter; redundant introduction is removed. Full-width Fixed default
and Random cards include explanations. Loading is centered with a larger spinner
and no Retry until an actual error. Empty-year notices replace Choose your class;
unassessed results are explicit. Conduct puts green Start before blue View.
Teachers select their avatar to browse/crop an image with drag, keyboard and zoom.
Cancel preserves the prior photo; authenticated server normalization remains 256px
metadata-free JPEG. Refresh updates the coordinator directory picture/initial.
No dependency was added; PWA teacher cache v56, learner v28.

Native capstone updates persisted across workspace resets and were read back at
this baseline. Figures 14, 15 and 23 with continuations have editable SVG/drawio
sources using the established palette and geometry. General use cases and ERD
relationships remain valid; only partial indexes changed. Approved objectives,
scope, scoring, canonical stories and Form 06 were untouched. Native PDF checks
before reconstruction retained 106 pages, all 53 TOC locations, aligned captions,
justified notes and no em dashes or 'will'. This is not school evaluation evidence.

Validation: actual-code regression tests cover empty/nonempty year deletion,
password/owner checks, active-test rollback, retained prior encrypted year backup,
Prisma-safe lock projections, Recovery keyset pages/labels/expiry/private metadata,
atomic combined section/import failure, duplicate retry and existing CSV/XLS/XLSX
parsers. Admin browser checks cover 320/390/800/1440px in both themes, dropdowns,
combined import, no Start, no-result notices, filters, unsaved choices, story
header scrolling and labelled Recovery. Clean npm ci and the full assessment verification/optimized build passed; the live
all-severity npm audit reported zero known vulnerabilities. Teacher production
browser checks passed all four widths, including crop/zoom/keyboard/upload,
square image bytes, normalized photo reflection, result scrolling, empty-year
notices and actual printing. The final build includes all preserved report metrics.
Physical device/hotspot and school acceptance require separate recorded testing.

Rollback: retain additive indexes, encrypted archives, original ownership,
immutable content versions, journals and receipts. Do not restore bare-void lock
queries or the old purged-year uniqueness rule. Publish only the verified commit
and confirm Vercel production uses that exact SHA.

## CRL-2026-11-02.1 — Canonical shared assessment library and coordination polish

Date: 2 November 2026, Asia/Manila.

Request: restore the actual original passages for all timelines; verify that
admin materials and saved changes drive assessments; clean library editors,
unsaved choices, imports, teacher cards, coordinator tabs, and audit pagination
and retention. Remove class selection from teacher Assessment Contents. Apply
the actual database changes and update the main capstone and editable diagrams.

Behavior: BoSY, MoSY and EoSY each use the original 100-word Para the Parrot and
A Day in the Fields with six question/possible-answer pairs per passage. The
source is the existing canonical assessmentContent/storyComprehension/answer
GUIDES, not generated replacement prose. Four locally authored period stories
remain historical source only, superseded as default materials by this request.
New saved coordinator publications apply to every teacher's new attempts.
Running/historical hosts and prepared offline attempts retain their immutable
version. Scoring, teacher ownership, prerequisites, checkpoint and ordered
journal behavior are unchanged. Incomplete older downloads cannot start a new
run; the prompt directs teachers to synchronize or contact the coordinator.

Coordination now has School Year, Classes, and Assessment Contents. Shared years
are listed with Add and protected Delete; Classes starts with paginated actual
teacher cards, horizontal search/sort, and a picture or initial. A selected
teacher opens year cards, then sections, enrollment and read-only results.
Deleting a shared year atomically archives affected teacher-owned classes with
the existing 30-day policy; active tests/conflicts roll back the whole operation.
Empty years need secondary confirmation; nonempty years need coordinator password,
reason and synchronization acknowledgement. Re-adding a deleted shared year
provisions fresh containers and does not revive deleted enrollments.

Teacher Assessment Contents is shared/read-only with no class selector. Editors
use consistent portable dialogs, plain text/word blocks, six manual question and
answer pairs, and drag/drop or browse imports. Fixed default and Random are
horizontal choices. Local item edits remain drafts until Save; Save, Keep editing,
and Discard have green, blue and red buttons, including parent-tab navigation.
Optional teacher photos are authenticated own-account updates, decoded/resized to
256px JPEG and stripped of metadata; absent photos use initials. No new dependency.

Audit Log uses stable event-time/ID keyset pages of ten, including when an anchor
was removed between loads. Seven elapsed days is the retention boundary, enforced
on reads and by a private minute cron job. This replaces the earlier 180-day
audit policy only; class archives and backups keep their separate retention.

Database: actual Supabase migration 20261102135718_library_integrity_and_coordination,
mirrored under Prisma. Adds users.profile_photo and global_school_years.deleted_at,
updates security-invoker provisioning, and creates audit index/retention job.
The initial centralization had copied incomplete legacy teacher rows: BoSY had
17/15-word placeholders and MoSY/EoSY lacked stories. The repair creates new
complete immutable version-2 revisions (25 rows each), including settings and
questions; old rows and host bindings remain intact. It aborts instead of
replacing a concurrently published later revision. Readback confirmed both
100-word passages and two guide sets in all three heads, no expired logs, active
separate retention jobs, no missing year assignments and no browser table grants.
A rolled-back synthetic DB trial checked provisioning, deleted-year exclusion
and reactivation without retaining test accounts or records. Security advisors
reported only existing INFO notices for intentionally server-only RLS tables
without browser policies.

Documentation: 16 scoped native paragraph changes and four diagram replacements
align Chapters 1–3 with the current baseline, canonical passage reuse, navigation,
three unsaved choices, audit retention and optional photo/deletion fields.
Figures 12, 15, 19 and 26 continuation retain the established diagram theme and
editable SVG/diagrams.net sources. The 106-page native PDF retained TOC pagination,
figure/caption/note alignment and justified notes, with no em dashes or 'will'.
Approved objectives/scope and Form 06 remain unchanged. Repeating passages does
not establish alternate-form equivalence or independent reading-growth evidence.

Affected areas: CoordinatorConsole, AssessmentLibrary and reusable story/photo/
unsaved components; teacher/AdminDashboard pages; shared defaults; global-year,
audit, profile and coordinator APIs/helpers; Prisma and mirrored migration;
cache versions teacher55/learner28; regression/browser scripts and diagram sources.

Validation: clean npm ci, zero known vulnerabilities in the live all-severity
npm audit, full assessment regressions and optimized production build. Targeted
actual-code tests covered all-period edits/deletion/defaults/random selection,
online/offline item parity, immutable prior versions and answer-free learner
payloads; 10+10+5 audit paging and expiry; global-year rollback/idempotence and
password scope; image normalization and authentication. Actual AdminDashboard
and coordinator components passed 320/390/800/1440px in light/dark themes with
parent styles, horizontal tools, initials, protected deletion, three-way Save,
all-period original stories, word blocks and import. Actual teacher production
browser checks passed those widths including no class controls in Contents.
Native PDF pages and readback were inspected. Physical device/hotspot acceptance
was not performed; synthetic checks do not establish school evaluation findings.

Rollback: retain additive fields, archived evidence, new and prior immutable
revisions, current journals and retention jobs. Do not roll back to corrupted
first-generation shared heads or teacher-management/activation clients. GitHub
and Vercel production must match the verified release SHA.

## CRL-2026-11-01.3 — Coordinator enrollment and shared school years

Date: 1 November 2026, Asia/Manila.

Request: repair and close learner results, place class selection above teacher
workspaces, move enrollment and Archives to the coordinator, share school years,
remove activation and review tabs, unify coordinator class reports, and revise
the native capstone and editable diagrams.

Behavior: teacher Conduct, Records, Contents and Analytics use a horizontal class
selector above their content, with padded empty notices and responsive controls.
Conduct results use a wider, scroll-locked, keyboard-accessible dialog with X.
Teachers search/filter learners, conduct eligible assessments, view shared
contents/results, edit permitted remarks, print and export. Teacher Add, Import,
selection, learner deletion and Archives are removed; server and offline handlers
also reject new teacher management writes. The coordinator Classes area begins
with shared years and a searchable, paginated teacher list with ascending or
descending name order. Selecting a teacher opens sections, enrollment, import,
bulk selection, password-confirmed deletion, Archives and read-only score/remark
reports together. Deleted learners retain independent 30-day archives. Password
checks precede archival transactions so failed-attempt counters survive rollback.

Assessment periods require no activation. Teachers explicitly choose an eligible
BoSY/MoSY/EoSY timeline. Prerequisites, completed-period guards, immutable content
versions, scoring and ordered offline journals remain. Shared contents retain
100-word story and six question/answer validation; aligned category/timeline
controls and compact rows work in light/dark themes. Save applies the version to
all teachers while running attempts keep their original version. The separate
Assessment periods, Assessment reports and Pending changes panels are retired.

Database: applied additive Supabase migration 20261101140448_shared_school_years,
mirrored under Prisma. GlobalSchoolYear defines each start year; a foreign key
links existing owned SchoolYear rows without changing their IDs. Security-invoker
triggers provision years for existing/future teachers. A database transaction
with synthetic account/year inserts verified both triggers and was rolled back.
Readback found no missing teacher-year assignments and no public/browser grants.
RLS remains enabled; advisory INFO notices for server-only tables without public
policies are intentional. No real learner or assessment was deleted for testing.

Compatibility: retained window/request tables and old signed grants are not
required for current activation or review. Current offline starts carry the
teacher-selected timeline and saved library version. Old class drafts reconcile
only to existing assigned containers; encrypted original proposals are retained.
Old enrollment journals reconcile only to a matching coordinator-enrolled learner
and never grant creation rights. Missing assignments keep dependent work queued
with a coordinator-action explanation. Do not clear local data or resurrect
removed Saved offline items. Teacher-side archived metadata may remain stored for
compatibility but is not exposed by the teacher read API or controls.

Documentation: 35 scoped native paragraph revisions and ten diagram replacements
aligned Chapters 1–3 with these roles, the global-year relation, and timeline
choice. The 106-page PDF retained the existing TOC page numbers, figure/caption
indents and justified notes. Editable SVG/diagrams.net/PNG sources are in
`docs/diagrams/class-workspaces`. Approved objectives, scope, scoring, and Form 06
were not changed. Protocol text does not invent classroom or physical-device
acceptance results.

Affected areas: teacher page and OfflineRuntime; CoordinatorConsole/Roster,
AssessmentLibrary, shared dialogs/class controls; coordinator policy/admin/roster,
assessment/admin/import routes, class archival and audit helpers; Prisma/schema
and mirrored migration; cache versions v54/v27; regression/browser scripts and
repository handoff.

Validation: clean npm ci; live all-severity dependency audit reported zero
vulnerabilities; full assessment regression suite and optimized production build.
Actual teacher production-build browser checks passed at 320/390/800/1440 with
representative 10-letter/10-word/six-question results, X-close, eligible timeline
choice, forbidden enrollment controls, class dropdowns, and isolated Print.
Actual coordinator components passed at the same widths in light and dark themes,
covering year duplicates, roster add/delete confirmation, Import, unified reports,
and shared contents. Targeted tests checked owner scope, global-year triggers,
password attempts outside archive rollback, offline management denial, and existing
archive evidence/version preservation. Native PDF/readback checks retained TOC
pages, justified notes, and zero future wording or em dashes. No destructive
production UI tests or real learner deletions occurred. Physical tablet-to-tablet
hotspot acceptance was not performed.
Rollback: retain additive schema, all immutable versions, existing queues and
archives. Do not roll back to activation-gated or teacher-write clients. GitHub
and Vercel production must match the final verified release SHA.

## CRL-2026-11-01.2 — Reading Coordinator governance

Date: 1 November 2026, Asia/Manila.

Request: centralize class/content management and assessment activation, simplify
teacher navigation, move individual results to Conduct, add Print, and revise the
main capstone. The user chose per-teacher class ownership, activation shared by
school-year start, and one shared assessment library.

Behavior: administrator is the Reading Coordinator. Only its separately scoped,
verified account manages years/sections, with explicit duplicate prompts. Teacher
class navigation uses responsive in-page dropdowns. Teacher contents are read-only;
coordinator publication validates items, defaults, 100-word stories and six manual
question/possible-answer pairs. New attempts bind immutable content revisions and
the coordinator-active period, retaining prerequisites and completion guards.
Teacher Conduct has View results, including unassessed learners. Records supports
Print alongside Excel export and existing class-record import. Coordinator reports
are read-only by teacher/year/section, with scores, metrics, remarks and export.

Persistence: additive assessment_windows, assessment_library_revisions,
assessment_library_heads, coordinator_change_requests and host catalog revision FK.
Migration was applied as Supabase 20261101095746 and mirrored under Prisma and
Supabase migrations. Existing classes, sessions and legacy teacher catalogs were
retained. Initial shared versions copied the existing catalog internally in SQL.
No timeline was autoactivated. New tables use RLS with browser/public grants
revoked; the application retains custom Prisma/JWT authorization.

Offline: cached signed teacher/year/period/version grants and immutable copies
permit previously authorized replay after later coordinator changes. Ongoing
assessment snapshots and ordered journals remain intact. A disconnected device
uses its last synchronized policy. Legacy queued management changes require
coordinator review, retain encrypted proposals, and block dependent replay while
unresolved. Explicit approval may map old provisional year/section IDs to existing
owned containers. Section mapping updates journal, roster and host references
without deleting unrelated work. Declined requests can be reconsidered. Passwords
and unrelated fields are excluded from proposals. Teacher archive restoration
cannot create new class containers; an existing assigned section is required.
Only the coordinator recreates school-year containers. Learner deletion and
30-day retention rules remain unchanged.

Documentation: native main capstone Chapters 1–3 were revised for these roles and
flows. General use cases separate Teacher and Reading Coordinator; Learner has
only View assessment. Future statements became past-tense implementation/protocol
descriptions without invented participant results. Objectives and scope remain.
Revised colored activities, use cases and ERD continuations have editable SVG and
diagrams.net files under docs/diagrams/class-workspaces; notes are justified and
TOC numbers were PDF-verified. Form 06 was untouched.

Validation: clean npm ci; Prisma schema generation/validation; full assessment
regression suite and production build, gated by live npm audit at every severity.
Archive restoration also retained original host/content-version metadata. Reports
resolved the exact archived story and guide from the frozen full version, so a
new restoration code did not redraw random materials. New tests cover pre-DB teacher denials, signed authority tampering/ownership,
old-version replay, stale publication, immutable content, guide/default validation
and section-ID reconciliation. Actual production-build teacher browser checks were repeated at
320/390/800/1440, including dropdowns, learner results, completed-period blocking,
class-record import, an isolated report Print handler and page overflow. Coordinator
controls passed at 390/800/1440 before restoration; permission and replay logic
were checked again after restoration. Native document
readback found no will/shall/proposed/would wording and no unjustified figure
notes. No destructive production QA or real learner deletion was performed.
Physical Huawei/tablet-to-tablet pairing and school acceptance are not claimed.

Operations: activate a period explicitly in Coordination > Assessment periods
before new assessments. Main/learner service workers are v53/v26. Do not roll back
to teacher-write clients, drop new tables, clear IndexedDB, or discard queued work.
The transient workspace reset on resumption; intermediate source checkpoints are
Git objects only and were not assigned to production. Final release identity is
verified against GitHub and Vercel before reporting deployment.

This is the maintained release history starting on 17 October 2026. Dates use
Asia/Manila. Older entries were reconstructed from the repository's commit
history and the working context available when this file was introduced.
They are not a claim that all earlier releases were independently re-tested.

Use `git log --oneline --all` for the authoritative commit sequence. To find a
dated release, use `git log --all --grep='CRL-2026-10-17.1'`. Each future change
must have an entry here, including small UI fixes. See `../AGENTS.md`.

## CRL-2026-11-01.1 | Thirty-day retention for deletion archives

- **Policy/UI:** Supersedes indefinite retention for archives created by deleting
  learners, nonempty sections or school years. Every deleted enrollment has its
  own days-only countdown, beginning at 30 and changing after each elapsed day.
  Lists and counts update without reload and refresh on focus/visibility. Deletion
  confirmations and Archives explain the deadline, Restore/Download and permanent
  removal. Manually archived completed records remain outside automatic expiry.
  Offline pending deletions receive a full 30-day window after cloud archival;
  no local journal is erased merely because connectivity was delayed.
- **Removal/recovery:** Current-account password confirmation protects permanent
  removal, including selected members of a learner group. Ownership, roster and
  batch checks run before any erase; failure rolls back the batch. A school-year
  removal also removes its linked section backups. Erasure clears encrypted
  snapshots and display names, removes matching administrative recovery copies,
  and retains only minimal identifier/restore receipts to prevent stale retries.
  It does not remove records that were already restored. Downloaded files stay
  under the teacher's control and can be explicitly imported with original owner,
  integrity, roster and one-time restore checks. No password enters an outbox.
- **Storage design:** ClassArchive adds deletedAt, expiresAt, purgedAt and
  memberArchiveIds. School-year headers reference separately retained section
  archives rather than embedding extra recoverable copies; downloads assemble
  the same portable version-1 file format. A removed section is therefore absent
  from later year downloads. Learner administrative recovery uses a matching
  per-enrollment ID and deadline; deletion audit retains IDs/counts rather than a
  second full assessment snapshot. Existing manual archive behavior, scoring,
  eligibility, global identity checks and ordered offline assessment sync remain.
- **Database:** Additive migration deleted_archive_retention applied to the actual
  database after schema/RLS inspection. No archives existed at rollout. Private
  SECURITY INVOKER functions and compatibility triggers enforce deadlines without
  Data API grants. pg_cron runs bounded, skip-locked erasure every minute; endpoint
  checks deny expired reads/restores immediately, independent of cleanup timing.
  Scheduler runs were verified successful. Rollback-only synthetic SQL verified
  deadline calculation, expiry/content erasure, administrative-copy removal,
  protection of future/manual archives and revoked public function execution.
  Existing informational no-policy notices are intentional for server-only tables
  whose public/anon/authenticated privileges remain revoked.
- **Validation:** Clean npm ci, production build/full regression suite and live
  all-dependency audit passed with zero reported vulnerabilities. Extended archive
  tests cover 30/29/zero-day boundaries, expiry/ownership/password denial, atomic
  batch failure, receipt/idempotency protection, independent downloaded files,
  direct restoration and member-removal races. Actual component browser QA passed
  light/dark at 320/390/800/1440: per-item counters, day changes/expiry without
  reload, pending/manual preservation, direct restore and wrong-password retry
  before group purge. Screenshots use synthetic data. No real learner was deleted
  for QA. Physical tablet/hotspot validation remains separate; transport unchanged.
- **Documentation/release:** Main Chapter 3 now explains retention, expiry,
  restoration, independent downloads and password-confirmed permanent removal.
  Figure 23 has a matching-theme continuation; Figure 24 shows retention fields
  and references, using the existing native ERD colors/crow's feet. Editable SVG
  and drawio sources are committed. Figure numbering, approved objectives/scope
  and scoring are retained; notes remain justified and the TOC is updated for
  changed pagination. Main cache v52, learner cache v25. No dependency added.
  Preserve migration, receipts, local records and journals on rollback. Older
  servers cannot safely interpret reference-only year headers; do not downgrade
  archive handling or disable expiry without reviewing this storage change.

## CRL-2026-10-31.1 | Account-password confirmation for deletions

- **Request/result:** Single and selected learner deletions now ask for the
  teacher's account password instead of a first-name or bulk phrase. Nonempty
  school-year and section deletions use the same password requirement. Existing
  reasons, synchronization acknowledgement, ownership checks, active-session
  guards and atomic encrypted archive-before-delete remain. Empty years/sections
  retain simple Cancel/Delete confirmation, with server-locked emptiness checks.
  Manual Archive confirmation is unchanged. Failed confirmation keeps the dialog
  open, clears its password and performs no deletion; bulk closes only on success.
- **Server/offline authorization:** Current-password checks use the existing
  persistent seven-failure account lock. Signed learner-deletion approvals bind
  the owning account, exact record ID/LRN pairs, action, reason, roster version
  and nonce. Verification occurs inside the archive/delete transaction. Online
  sign-in or explicit password confirmation prepares a P-256 key, encrypted with
  PBKDF2-SHA256 (600,000 iterations) and AES-GCM. Its separate-purpose server
  certificate expires in 30 days and cannot act as a login token or bypass 2FA.
  Passwords and plaintext private keys never enter the outbox, archives or audit.
  The queue rejects password fields. Cloud checks the current account lock and
  password stamp again; changed passwords or expired approvals cannot authorize
  a replay. Offline counters remain device-local, as with offline sign-in.
- **Pending-work compatibility:** Older phrase-only pending deletions stay queued
  until Confirm deletion in the main-menu sync prompt obtains a password. Proof
  replacement preserves sequence, canonical IDs and unrelated work, and cannot
  recreate an acknowledged entry. Offline provisional-ID remapping also requires
  fresh confirmation after synchronization. This prevents an old approval from
  deleting a newly enrolled learner that reuses an LRN. Existing app installations
  must update and sign in online once to prepare offline password confirmation.
  Pending work must never be cleared to install this release.
- **Validation:** Clean npm ci, full production build and assessment regression
  suite passed, including the live all-dependency audit with zero vulnerabilities.
  Real bcrypt/WebCrypto tests cover encrypted preparation, online/offline proof,
  seven-attempt locks, expiry, password changes, account/action/record/reason/nonce
  tampering and authoritative rejection. Actual dialog browser QA passed light
  and dark themes at widths 320/390/800/1440, online/offline single/bulk deletion,
  nonempty year/section wrong-password retry, empty confirmation, real IndexedDB
  pending reauthorization, queue secret rejection and acknowledgement races.
  Business/archive rollback fixtures retain explicit auth doubles; crypto tests
  exercise actual checks separately. No production learner was deleted for QA.
  Physical tablet/hotspot and native WebRTC behavior is not established by this
  synthetic browser test; assessment transport/scoring is unchanged.
- **Documentation/files:** Main capstone Chapter 3 deletion, synchronization,
  evaluation and orientation wording updated. Figures 11, 15 and 23 now show
  password authorization, preserve the current colored swimlanes/solid heads,
  and have matching editable SVG/drawio sources. Export remains 104 pages with
  unchanged figure pages, left indents and justified notes; no TOC update needed.
  No objective, scope, scoring, ERD/entity or database migration is required.
  Affected code includes deletion dialogs, authentication preparation, class
  lifecycle, archive transaction, offline journal/prompt and verifiers. Main cache
  v51 and learner cache v24. No new dependency. Roll back clients and server
  together only after reviewing the security regression to phrase checks. Preserve
  encrypted keys, local records and journals; never clear site data as rollback.

## CRL-2026-10-30.1 | Explicit assessment timeline and atomic offline saves

- **Request/start gate:** A prepared teacher/learner link must not choose or
  start a learner's timeline. The existing roster action already opened a
  confirmation, but it preselected a period and enabled Start immediately.
  The chooser now opens with no selection, shows the learner and all three
  periods, and requires an explicit eligible BoSY/MoSY/EoSY choice. Pairing is
  transport preparation only. This removes implicit timeline selection in both
  online and offline flows; it is not a claim of reproducing a physical tap
  bypass. Completed periods and missing prerequisites remain disabled.
- **Start safety/retry:** The dashboard requires its open confirmation to match
  the learner, rechecks current eligibility, and retains its synchronous pending
  guard. The chooser stays mounted while startup is pending, blocks repeated
  submission and cancellation, and remains available after a failed start.
  Escape/PWA Back use the same pending guard. It closes after successful creation
  and transition. Reachable cloud requests remain primary, and an existing
  paired window remains alive for later connection loss.
- **Persistence finding/fix:** OfflineRuntime formerly saved the host checkpoint
  separately from enqueueing its replay. The final record was also projected
  before its journal write. Starts, answers and queued stage changes now commit
  the host and ordered replay in the existing IndexedDB transaction. Final review
  commits its completed host, class-record snapshot and replay together, inside
  the existing serialized snapshot writer. A failed journal write cannot leave
  an advanced checkpoint or a falsely completed record. The allocator checks the
  owning teacher/code, including offline_code for host_start; invalid final
  projections are rejected. Storage format, DB version and replay payloads remain
  compatible. Read-only presence handling and cloud acknowledgement rules remain.
- **Validation:** Clean npm ci, full build/regression suite, and live audit of all
  dependency groups passed with zero vulnerabilities. Actual chooser/dashboard
  callbacks cover all eligible periods online/offline, paired/unpaired routing,
  repeated or cancelled starts, changing eligibility and failure/retry. Runtime
  fault injection covers start, answer and final-save failures; staged transaction
  tests verify rollback of host/record/journal and ownership guards. Full local
  flows retain distinct BoSY/MoSY/EoSY records and replay entries. Existing failover
  and replay checks pass for dead Wi-Fi, lost internet, failed authentication,
  concurrent edits and retained pending work. Actual-component browser QA passed
  chooser geometry/cancel/reopen at 390/800/1440 widths, followed by the final
  letter, all ten words, timed passage, six questions, rating, learner return and
  final local record save, using real IndexedDB/BroadcastChannel with cloud HTTP
  unavailable and live presence beyond timeout. Browser QA does not prove native
  WebRTC/physical hotspot acceptance; quota failures were injected test conditions.
- **Files/docs/rollback:** Teacher dashboard, AssessmentStartConfirmation,
  OfflineRuntime, teacherOfflineDb, new startup verifier plus existing control,
  connectivity, flow, failover, sync and browser verifiers; main cache v50 and
  learner cache v23. No dependency/schema migration. Fresh main-capstone read
  already requires choosing an eligible period and ordered acknowledged offline
  replay; no approved objective/scope/workflow/diagram revision is needed. Roll
  back implementation together if necessary, preserving offline answers, records,
  checkpoints and journals. Do not clear site data to update the application.

## CRL-2026-10-29.1 | Coherent offline item positions across task transitions

- **Reproduced defect:** Offline record_letter moved the durable host from the
  last letter to Word 1 but retained item_index/itemIndex = 9. A subsequent
  authoritative reply could overwrite the teacher's optimistic index 0. The
  learner then treated the real next word (index 1) as older than index 9 and
  rejected it. A production-handler regression failed with 9 instead of 0; a
  real-component browser reproduction showed teacher jump while learner clap.
  Prior peer fixtures used current_item_index, which is not the production
  protocol field; the tests now use both actual position aliases.
- **Fix:** Offline letter/word advances set both aliases together, resetting
  position at the next task boundary. Reads, recovery and mutation projections
  reconcile metadata against the session's own administered items. Learner
  reconciliation normalizes incoming and cached offline positions before stale
  guards, allowing older inconsistent snapshots to recover without clearing
  answers, checkpoints or pending work. Genuine backward states stay rejected.
- **Integrity:** Valid explicit positions for repeated items are retained. An
  unknown/absent pool or ambiguous position is not guessed from default content.
  Read repair changes derived response metadata, without enqueueing answers or
  recomputing their correctness. Late persist_only writes retain the current
  stage/item. Existing teacher ownership, deletion guards, score/stop rules,
  ordered sync, fresh-nonce presence and passage timing gates are unchanged.
  The learner imports the helper from the safe item-position module; it does not
  gain a new dependency on teacher-only story content or possible-answer guides.
- **Validation:** Clean npm ci, full build/regressions and live all-dependency
  audit passed with zero vulnerabilities. Offline flow tests cover the boundary,
  legacy reads, delayed writes, repeated/unknown content, all 20 answers, passage,
  comprehension, rating and final records. Independent peer/RTC-double fixtures
  cover fixed/random runs, malformed legacy Word 1, a malformed cached current
  item, stale polls/sequences and connection reuse. Optional real-component
  browser integration passed with both UIs, real IndexedDB and BroadcastChannel
  while all cloud HTTP failed: final letter, all ten words, story selection,
  timed reading, six questions, rating and automatic learner code-entry return.
  It retained all task/question/rating data and pending outbox work, with live
  nonce presence beyond the 15-second interruption timeout and no page errors.
  This environment supplies no usable native RTC ICE candidate, so browser UI
  tests are not physical hotspot/tablet-to-tablet or native WebRTC acceptance.
- **Files/docs/rollback:** OfflineRuntime, learner reconciliation, shared item
  helper/re-export, regression scripts, main cache v49, learner cache v22 and
  maintenance notes. No dependency/schema change. A fresh read of the main
  capstone's existing sequence, connectivity, recovery and matching-item checks
  already covers this invariant; no objective/scope/workflow/diagram edit needed.
  Roll back code as one unit if required; retain saved answers, journals and
  checkpoints. Do not clear offline data to address a display-position defect.

## CRL-2026-10-28.10 | Toolbar gaps, chooser sizing and overlay/header alignment

- **Roster actions:** Add 12px top padding between the filter-toolbar border and
  the mobile Select All/Deselect All/Delete Selected group. The padding stays
  inside the existing native sticky slot, so fast swipes do not need JavaScript
  positioning and the sticky top/selection/delete guards remain unchanged.
- **Class chooser:** Assessment Records school-year and section chooser actions
  use equal-width grid tracks and stretch to the tallest wrapped label. Mobile
  targets have a 60px minimum height, preserving readable labels and equal sizes
  without fixing a height that could clip enlarged text. Only chooser actions
  are scoped; dialog actions and the selected-class toolbar retain their layout.
  Section menus/dialog titles now say Rename in both Conduct and Records;
  internal edit operations, validation and archived-section restrictions remain.
- **Reports:** Put What would you like to do in the existing top toolbar beside
  Close instead of below a separate mostly empty toolbar. Keep its original
  accessible title ID, existing choice/form navigation, drafts and send behavior.
- **Mobile menu header:** Use a shared centered grid row, 48px brand/action slots
  and aligned 44px logo/logout/theme-switch controls. Keep the original logo asset,
  theme handlers and desktop layout; no image regeneration or cropping is needed.
- **Validation:** Clean npm ci, full regression/build and live all-dependency
  security audit passed with zero reported vulnerabilities. Actual menu JSX/CSS
  browser tests passed at nine widths in light/dark, including decoded-logo,
  Logout and theme-track center alignment and viewport bounds. Actual chooser
  and reports components passed five widths in both themes: three equal button
  sizes, Rename for both modes, original section value, heading placement,
  Back/Close and draft retention. Native sticky scrolling/gap checks passed at
  five widths in both themes, including rapid swipes, resize and selection changes. Browser QA uses synthetic data and does not prove physical-device behavior.
- **Files/docs/rollback:** Teacher dashboard, ClassWorkspace, TeacherReports and
  their styles, roster action styles, existing browser verifiers, main cache v48
  and maintenance notes. No dependency, database, assessment, sync or authorization
  change; no capstone workflow/ERD revision needed. Roll back presentation only,
  preserving shared scroll locks, native sticky flow and current archive guards.

## CRL-2026-10-28.9 | Overview spacing and centered content controls

- **Overview table:** Center Name/Assessment Status headings and cells, with
  14px outer cell padding and 10px inner padding. Completed-period labels center
  and wrap together. Names no longer touch the left border; the two-column
  fixed-layout preview still fits narrow screens without horizontal scrolling.
- **Mobile main menu:** Increase the full-width Overview disclosure target from
  48px to 64px vertically. Keep its borderless chevron, keyboard/tap behavior and
  smooth native grid expansion. Menu labels and Overview title now use Arial
  medium weight 500 instead of 800, retaining their existing sizes and icons.
- **Assessment Contents:** Center category and period selector groups together
  on wide screens, replacing the opposing-edge layout from 28.7. On phones at
  640px and below, period controls appear above the category controls. Remove the
  redundant visible period pill beside Item selection; the radiogroup still has
  its period/category accessible name. Rename Import file to Import and put it
  directly before Add Story in the same action group, followed by Save. Narrow
  Stories uses one full-width action row below its heading, superseding 28.7's
  title/Import first row. Existing Save guards and import/add callbacks stay intact.
- **Validation:** Clean npm ci; actual JSX control/callback checks and responsive
  browser runs for content controls at seven widths and main menu at nine widths
  passed in light/dark themes. Checks cover centered groups/cells, outer padding,
  mobile order, adjacent Import/Add/Save, 64px header, lighter font, navigation and
  no horizontal overflow. Renders were visually inspected. Full build/regressions
  passed; the live all-dependency npm audit found zero vulnerabilities. Screenshots
  use synthetic data only.
- **Files/docs/rollback:** Teacher dashboard, existing layout/menu verification,
  main cache v47 and maintenance notes. No dependency, database, assessment,
  synchronization or authorization changes. No approved scope/workflow/diagram
  revisions needed. Roll back presentation only, preserving drafts, selected
  periods/categories, default item validation and full-roster statistics.
  Browser tests do not establish physical-device acceptance.

## CRL-2026-10-28.8 | Compact Overview and polished main menu

- **Overview disclosure:** The mobile Home card is now Overview. Its full-width,
  borderless header is one button, including its plain chevron without a shaft.
  The chevron rotates and a CSS grid row smoothly extends/collapses the existing
  content, with no measured-height timer or scroll handler. Keyboard activation,
  focus visibility, aria-expanded/controls and reduced-motion support are kept.
  Above 720px the overview remains visible regardless of mobile disclosure state.
- **Latest Learner Update:** Replaces Latest Learner Overview. The read-only
  table now has only Name and Assessment Status. Completed BoSY/MoSY/EoSY periods
  appear as green checkmarked labels, wrapping as needed; no completed period
  means Not assessed. LRN, sex and Latest Profile are omitted from this preview.
  Long names wrap instead of requiring horizontal scrolling. The existing five
  most recently added learners limit and full-roster statistics are unchanged.
- **Menu choices:** Six matching stroke SVG icons replace font-dependent glyphs.
  Icons are more prominent; Arial labels are larger/bolder with multiword labels
  on two lines. Accessible full names, original IDs and all navigation/report
  overlay callbacks remain unchanged. Dark-mode completion labels use a lighter
  green for contrast. No external icon package or dependency was added.
- **Validation:** Clean npm ci. Actual JSX render/callback tests cover the two
  columns, completed-only states, no-result and empty states, full-roster totals,
  recent-five selection and all six menu callbacks. Optional browser mode uses
  actual dashboard JSX/CSS and synthetic state at 320/390/600/720/768/800/1024/
  1280/1440px, light/dark, checking intermediate expansion height, arrow/header/
  keyboard toggles, text bounds, no horizontal scrolling and reduced motion.
  All 18 browser width/theme cases and the reduced-motion check passed; renders
  were visually inspected. Full build/regressions and the live all-dependency
  security audit passed with zero reported vulnerabilities.
- **Files/docs/rollback:** Teacher dashboard, TeacherMenuIcon, verify-main-menu
  in the build verification chain, main cache v46 and maintenance notes. No
  database, authentication, assessment, persistence or sync changes. No approved
  scope, workflow or ERD changes, so no capstone diagram revision is needed.
  Roll back presentation only; retain the full-roster calculations and the
  existing authorization, offline and recovery guards. Browser fixtures do not
  establish physical phone/tablet or authenticated production-account acceptance.

## CRL-2026-10-28.7 | Assessment Contents labels and responsive controls

- **Labels:** The activities menu and expanded-tab title now read Assessment
  Contents. The repeated Assessment Content heading inside the main panel is
  removed. The unsaved-content confirmation uses the same terminology. Internal
  activities IDs, storage keys, API routes and ownership scopes remain unchanged.
- **Selectors:** Content categories and BoSY/MoSY/EoSY now share one aligned
  horizontal toolbar on tablet/desktop widths above 640px, using consistent
  44-pixel buttons and grouped borders. Phones stack the two three-button groups
  with equal-width columns. Pressed states are exposed to assistive technology.
- **List headings/actions:** Letters, Words and Stories use consistent, larger
  Arial h2 headings in a grid with their action controls. Add and Save remain
  adjacent and at least 44px high at every width. On narrow Stories screens, the
  import button aligns with the title and Add Story/Save share the next row;
  the extra control no longer forces cramped or overflowing content. Existing
  item rows, default checkboxes, edit/delete and save/import behavior are retained.
- **Validation:** Clean npm ci; real JSX render/callback checks verify all three
  categories, period/category switching, Add, story Import, successful Save and
  disabled-save guards. Optional browser mode uses the actual control JSX and
  full dashboard CSS with synthetic state at 320/390/600/768/800/1280/1440px,
  light/dark: selector row alignment, mobile wrapping, heading/action centers,
  viewport bounds, touch sizes and the callbacks all pass. Mobile and desktop
  renders were visually inspected. Full build/regression passed, and the live
  all-dependency npm audit reported zero vulnerabilities. These are controlled browser checks, not physical
  Huawei/phone acceptance or authenticated production-account tests.
- **Files/database/docs:** Teacher dashboard, new verification script and npm
  verification chain, main worker cache v45 and maintenance notes. No dependency,
  database/schema, assessment rule or synchronization change. Fresh readback of
  the main capstone document found no exact legacy Manage Assessment menu label;
  its assessment-content workflow and relationships remain accurate, so no native
  document/diagram revision was needed. Approved objectives/scope are preserved.
  Roll back presentation only, keeping data/route keys, dirty drafts, default
  selection rules, six-question stories and save validation intact.

## CRL-2026-10-28.6 | Visible teacher startup before consent resolution

- **Final live check:** The 28.5 loader correctly covered recovery, but the root
  PolicyConsentGate still returned a blank placeholder in the initial teacher
  HTML. This prevented the branded screen from appearing before hydration.
- **Fix:** While teacher-route consent is pending, the gate now renders the same
  public logo/loading screen at zero completed recovery checks, with Checking your
  privacy preferences. No protected child is rendered until the original consent
  check allows it. Missing consent still redirects to the landing page immediately.
  The gate then hands off to the existing real-work recovery loader without a
  timer or second independent overlay. Static-text selection/logo dragging stay
  disabled even before the app-wide guard mounts. Login/learner placeholders are
  unchanged.
- **Validation:** Actual compiled consent-boundary tests verify branded server
  markup, withheld protected children, denied-consent redirects, allowed handoff
  and nested teacher routes. Existing real-work progress, recovery, offline logo,
  expiry/deletion guards and browser visual tests remain applicable. Clean npm ci,
  full build/regression and live zero-vulnerability audit passed. Built teacher
  HTML was inspected for the logo and privacy-phase loader. Physical installed-device acceptance remains separate.
- **Files/rollback:** PolicyConsentGate, loader text/drag styling, startup verification, main cache v44 and
  these notes. No consent policy, storage keys, authorization, database or scoring
  changes. Keep the pending view public and preserve the original decision gate;
  never expose the workspace to make the splash visible earlier. No capstone/ERD
  revision is needed for this presentation correction.

## CRL-2026-10-28.5 | Branded startup tied to actual recovery checks

- **UI:** The plain Checking assessment progress message is replaced with one
  centered, full-screen CRL-App startup screen using /crl-app-logo.png, a slim
  loading bar and the current check's message after consent resolution (the earlier
  initial-HTML claim is corrected by 28.6). It has responsive Arial text, safe-area
  spacing, saved dark-theme support and
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
