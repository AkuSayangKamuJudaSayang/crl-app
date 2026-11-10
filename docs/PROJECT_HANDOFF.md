# CRL-App maintenance and capstone documentation notes

Last reviewed: 10 November 2026, Asia/Manila. Read `CHANGELOG.md` for the dated
release history and `../AGENTS.md` for the required maintenance workflow.
Verify the current source before changing behavior. These notes intentionally
exclude identifying school context, device inventories and deployment details.

## Current release — CRL-2026-11-10.11

A currently live Coordinator Assessment timeline cannot enter Edit
schedule, and Clear Schedule is not available until Stop has been
pressed. The backend must additionally reject schedule edits and clears
of a currently live period with 409, even if the UI request was sent
from a stale tab. Keep the saved schedule and all results intact.
Clear confirmation now asks only: "Are you sure you want to clear this
schedule?"

The Reading Coordinator's Records tab is "Learner Records", not a
teacher directory. The initial view contains School year and Section
dropdowns plus a prompt to choose both. A chosen section reads all
teacher-owned learners through the new read-only
coordinator_learner_records endpoint, including classes where the
teacher has been unassigned. A View overlay uses
coordinator_learner_result for each learner and displays the actual
completed BoSY/MoSY/EoSY letter/word/comprehension/miscue evidence and
saved metrics. No Coordinator assessment administration, import,
learner edits or deletion path is exposed. Do not fabricate absent
question/passage source text, or treat incomplete work as completed.

Both endpoints require a selected, active school-year insertion,
owning-school checks and the server's authenticated coordinator
school scope. Reuse teacher-owned learner rows without transferring
or rewriting class ownership and keep all historical completed
assessment evidence. If year/section context changes, discard stale
responses. No schema migration is required.

## Previous release — CRL-2026-11-10.10

Coordinator Assessment calendar: when reopening an enabled timeline
with a saved start but no stop, the active header field should be Stop
date immediately. New/unsaved timelines still begin with Start date
active. Header buttons remain independently selectable. If Start date
is active, its already selected date must be blocked, and attempting
to choose it must not switch the active header to Stop date. Selecting
a different permitted start may switch to the Stop date header. While
choosing Stop date, block the start date itself and every earlier day.
Dates reserved for other timelines stay blocked; no inclusive-day
overlap or school-year validation is weakened. Do not silently alter
stored schedule timestamps when changing editor focus.

Only the Go live button that the user actually pressed shows a circle
spinner and "Please wait" while activation is in flight. Do not show
"Saving…" on the other two Go live buttons. Keep global input locks
to prevent conflicting parallel activations, but tie the visible
loading label to period and request kind. The spinner must remain
accessible, honor reduced-motion settings and cease after success
or failure. Stop, Edit schedule, Clear Schedule and other actions
retain their prior behavior and server-backed authoritative state.

Mandatory and synthetic browser tests cover these UX transitions.
No schema migration or database data correction is necessary.

## Previous release — CRL-2026-11-10.9

Exact-time start/stop schedule updates must never assign startsOn:null
or endsOn:null while schedule_enabled=true. Postgres
crl_private.sync_assessment_schedule_state() is a BEFORE UPDATE trigger
that derives date-only starts_on and ends_on from the precise instants.
On a previously saved open-ended schedule, explicitly clearing starts_on
when starts_at is unchanged causes the trigger to set starts_at to NULL
and raise the school-year constraint, surfaced as a generic Prisma unknown
request error. This is the cause of the edit-with-new-stop failure.

For exact-time saves, include only startsAt and endsAt plus state and
revision fields. Omit both Prisma legacy date fields. Legacy date-only
requests still supply Date objects in startsOn/endsOn for compatibility.
The existing trigger will update date-only values automatically whenever
a precise timestamp is changed. Never modify learner results, archived
assessment evidence, or previous start values to fix this write path.
The underlying BoSY record was confirmed unchanged after ROLLBACK tests.

Mandatory regression tests must cover saving a start-only schedule,
adding a stop later, changing the stop, and removing it again. Check that
trigger-managed date-only columns are omitted in each exact-time update,
not simply that a mocked Prisma update returns success. Production
database operations were explicitly rolled back after reproducing the
original 23514 failure and validating the corrected updates.

## Previous release — CRL-2026-11-10.8

Reading Coordinator Main > Assessment button naming follows saved schedule
presence, not activation: Set schedule is used only if there is no enabled
schedule with a valid start. Immediately after Save dates, show Edit schedule
even before Go live. Keep Edit schedule while a future start is armed,
while live, and after Stop (a stopped timeline retains its saved schedule).
Only Clear Schedule returns the button to Set schedule. The editor dialog
title follows the same saved/not-saved distinction. Go live and Stop still
control activation separately. Do not clear schedule fields when stopping.

This change is deliberately UI-only. Preserve inclusive reserved-date
rules, future scheduling, one-live-per-school protection, secondary
Clear Schedule confirmation, learner results, server revision checking,
and offline behavior. Regression and browser tests cover saved-but-not-live
and stopped-but-still-scheduled states.

## Previous release — CRL-2026-11-10.7

In Reading Coordinator > Main > Assessment, timeline dates are
whole-calendar-day reservations for BoSY, MoSY, EoSY within a selected
school year. For a new unscheduled period, start with Philippine today,
then move to the next calendar day after the latest scheduled prior
period's end. No date in another period's inclusive [start,end] range
may be preselected or selected, including both endpoints. The default
must also precede any later period, and never exceed the chosen
school-year boundary. If the previous period has no stop time/date,
there is no later valid default until that prior schedule is given
an end. Day suggestions must use only the selected school year's
rows. Calendar navigation opens on the suggested date's month.

Show reserved BoSY, MoSY and EoSY days in pale green, yellow and
purple respectively, including disabled start/end days and dates in
between. Preserve server-side calendarConflict and order validation.
Exact-time edits clear stale legacy date-only columns; still support
legacy inclusive end-of-day rows already in storage.

Use Set schedule when a timeline is unarmed/stopped, Edit schedule
while armed or live, and a deep red Stop action to pause an armed/live
timeline. Stop must not delete a schedule, session, learner result or
assessment content. Clear Schedule appears only for saved schedules
and must open an explicit second confirmation dialog; Cancel leaves
the schedule unchanged. The clear operation retains the existing
live-preservation semantics. Do not relax school-wide one-live rules,
revision checks, calendar order, offline assessment recovery or
historical results. Preserve the existing two actions side by side.

## Previous release — CRL-2026-11-10.6

The Administrator School Years and Sections remove, assign and unassign
write paths all call assignSchoolSection(). A production-only Prisma validation
error blocked all three: nested classes.include was trying to include the
ClassSection.archivedAt scalar as if it were a relation. Scalar fields are
returned automatically when Prisma uses include; remove archivedAt:true from
the nested include and keep schoolYear and _count.learners as relational
includes. The neighboring schoolSetup() request uses classes.select and may
correctly select archivedAt:true. Do not remove that valid selection.

All teacher/section role, active-host, historical-learner/result preservation
and school-year inclusion rules stay in force. Avoid destructive shortcuts,
permission broadening or a bulk reset to make section removal pass.

The mandatory verify-school-management-fixes.cjs test now checks the actual
query passed to Prisma against Prisma.dmmf, and proves that a scalar nested
in include is rejected. The previous mocked Prisma client accepted this bad
shape, falsely passing tests. Future changes to nested Prisma queries should
be tested against generated Prisma metadata, not mock outcomes alone.

## Previous release — CRL-2026-11-10.5

The Administrator section options icon is a plain vertical triple-dot SVG
inside an accessible button without a visible box. The shared
Coordinator.module.css .panel button rule has greater specificity than the
old .sectionMenuButton selector, so styling the menu button alone does not
remove the inherited rounded-square surface. Use
.panel .sectionMenuButton after the shared declaration, including transparent
hover and expanded states. Keep keyboard focus visible and the same click
target; do not modify the generic panel button rules or the Remove action.
This is only a CSS specificity correction; it requires no database migration.

## Previous release — CRL-2026-11-10.4

Administrator School Years and Sections uses a plain vertical three-dot
section menu with a Remove action. Teacher unassignment is a separate
confirmed action below the teacher selector. Do not conflate them:
Unassign leaves the section inserted in the chosen school year, retains
the same class id, learners and assessment evidence, and sets only
class_sections.unassigned_at. Remove also updates
school_year_section_insertions.removed_at for the selected year. Both
must reject a linked in-progress host session, and both write a properly
scoped audit. Unassign returns safely when already unassigned and must
not make a second change to the insertion. The assigned-teacher dropdown
continues to exclude a selectable "No assigned teacher" option.

The /api/access POST write handler must keep an action label outside the
try block. A previous catch referenced a block-scoped body variable and
threw a secondary ReferenceError, hiding the real error from section
removal, school-year deletion and unassignment. Preserve user-visible
400/401/403/409 messages from the existing role, password, stale-count
and active-assessment validations. Never turn these into a generic 503
by throwing from the catch, and keep genuine unexpected errors logged
without personally identifying payloads.

Do not relax the school-year deletion password, expected-section count,
host-active checks, archive retention or existing single-unit transaction
rules to make a notice disappear. The exact school-scope SQL operations
were tested in rollback-only production DB trials; there was no permanent
database write. The separate server tests include the API error path.
No schema migration was required.

## Previous release — CRL-2026-11-10.3

A paused and unscheduled assessment can retain a legacy manual starts_at
value from an earlier activation. That timestamp must not be shown as a
freshly scheduled start or used to prefill Set schedule. On the Coordinator
Assessment card, show Not set unless schedule_enabled=true or the
assessment is currently live. In the scheduling overlay, read saved
start/end values only when schedule_enabled=true. Otherwise default the
start day/time to the actual Philippine day/time at overlay opening,
provided that day is inside the chosen school year; outside that school
year, the user must select an eligible start date.

One specific inactive, unscheduled BoSY record in SY 2026–2027 had its
obsolete starts_at reset to null in Supabase using an exact-row guarded
UPDATE. No learner result, archived record or assessment evidence was
changed. Never bulk-reset historic live sessions to fix display-only
staleness. Preserve existing schedule-first Go live, explicit activation,
future scheduling, optional stop, overlap protection, and live-state
semantics. The server's existing Clear code clears a non-live start.

## Previous release — CRL-2026-11-10.2

The Reading Coordinator Main > Assessment timeline card must present
Set schedule (left) then Go live (right) as equal-width horizontal actions.
A saved start date/time is required before Go live is accepted; the button
starts disabled for timelines without a schedule, and the API independently
enforces that prerequisite. On opening Set schedule, preselect the current
Philippine day and time only when that day falls inside the chosen school
year. The stop date/time is optional; no stop means an open-ended schedule,
not an automatic end-of-day expiry. The existing calendar prevents overlap
and enforces the BoSY, MoSY, EoSY order. A future school year outside
today requires the coordinator to choose an eligible day manually.

Newly saved schedules must NOT automatically become live: set
schedule_enabled=true, schedule_paused=true and is_live=false. This is
compatible with the existing database schedule sync trigger and minute
job: paused rows are not auto-activated. Go live explicitly removes the
pause. For a future start it arms the schedule with is_live=false so the
clock worker can enable it on time, subject to the school-wide one-live
guard; for a due start it activates immediately. Old live or armed
schedules being edited remain armed, and Pause continues to block new
activation. Clearing while live retains the existing manual live state
but does not allow a subsequent activation without first saving a
schedule. No schema/data migration is needed.

Do not change reading scores, learner/teacher ownership, assessment
contents, offline authorities or recovery as part of schedule UI fixes.
Preserve accurate revision checking, server-local time validation,
school-year limits, single-live behavior and clock/trigger semantics.
Capstone flow diagrams should show Set schedule -> Save schedule ->
Go live, rather than Go live before setting a schedule. Existing release
history below remains relevant.

## Previous release — CRL-2026-11-10.1

Administrator Logs now has three role category buttons with General
showing all non-login school events, with the extra inner Refresh and
account dropdown removed. Existing audit retention and school-scoping
remain.

## Previous release — CRL-2026-11-09.14

The school Administrator Logs page opens directly to one unified activity feed.
It no longer asks the administrator to select their school or the separate
Administrator access category. The API still restricts every list, detail,
cursor and optional account query to the authenticated administrator's own
school_id; no cross-school or unknown legacy rows are joined into the feed.
School, coordinator, teacher and administrator audit actions appear together
within the existing seven-day retention window. Reading Coordinator and teacher
login events remain stored for security auditing but are hidden from this feed
and its detail endpoint. Administrator sign-ins remain visible for accountability.
No audit or learner records are deleted by this change.

A single optional account selector replaces the category navigation and account
card grid. The feed loads automatically, offers Refresh, View and Load more,
and retains the ten-entry cursor pagination and encrypted metadata allowlist.
Account choices include administrators, Reading Coordinators and teachers from
the same school. No database migration, changes to scoring, assessment flow,
section management or offline persistence are required.

For the capstone paper, distinguish underlying security audit retention from the
simplified operational activity view. This is a presentation/query filter only,
not removal of login logging or permission to read other schools.

## Previous release — CRL-2026-11-09.13

The Insert Sections overlay uses compact horizontally aligned cards with the
section name on the left and checkbox on the right. Section selection, class
ownership, year inclusion and saved assessment evidence are unchanged.

## Previous release — CRL-2026-11-09.12

Assessment archival must block only a genuinely active assessment: an open host
that has linked to a learner and is outside the terminal `completed`,
`terminated` and `teacher_review` stages. An unlinked `waiting` host is an
abandoned creation shell and must not prevent section or school-year archival.
Keep this definition aligned with teacher deletion, reassignment and library
locking checks.

The abandoned Jupiter waiting host in S.Y. 2027-2028 was terminated on explicit
instruction. It had no completed assessment or dependent result rows. Its
learner, assessment shell and host record remain available to the archive path.
Do not recreate the abandoned shell. A truly linked in-progress assessment must
still block deletion until it is completed or explicitly ended.

## Previous release — CRL-2026-11-09.11

Deleting a whole school year must include dormant teacher-owned classes created
by earlier section removal. Those classes are intentionally hidden from active
section lists but may still contain learners and assessment evidence. The
year-deletion archival lock therefore allows dormant classes only for its
read-only path. Normal `requireClass` access remains active-only, and requesting
writable access with the dormant override must fail.

Keep this distinction when changing class lifecycle code. A dormant class is not
available to teachers, reports or writable mutations, but full-year archival
must retain it as a member archive before soft-deleting the teacher year and
class. A hidden class must never cause the delete-year dialog to return a class
404. No schema or operational-data migration is needed for this correction.

For the capstone paper, describe section removal as a soft visibility state and
school-year deletion as an archival operation that includes hidden membership
records without making them available through normal class access.

## Previous release — CRL-2026-11-09.10

School-year section inclusion is separate from teacher assignment. The
school_year_section_insertions table stores which reusable definitions are
present in a year and whether that insertion was removed. Insert Sections saves
one or more checkbox selections without a teacher. Teacher-owned class sections
remain the record container for learners and assessments and are created,
reactivated or transferred only when a teacher is assigned.

Removing a section from a year marks both its inclusion and its teacher-owned
class dormant. It must never delete the class, learners, assessment sessions or
dependent evidence. Reinserting the same definition into the same year restores
the inclusion marker; assigning a teacher later reactivates the original class
or transfers it without losing records. The three-dot menu is the section-level
Remove action and must keep its hover/focus treatment.

The school-year list uses `0 section`, `1 section`, then plural `sections` from
two onward. The administrator navigation label is Coordinators and Teachers.
Keep the section-inclusion table synchronized with its RLS policy and production
migration ledger. Migration 20261109132132 evaluates the request-scoped school
value once in that policy. Delete-year counts use active inclusion rows,
including sections that do not yet have a teacher.

Jupiter was removed only from S.Y. 2027-2028 at the user's request. Its class is
dormant and its learner plus empty assessment shell were retained for a later
same-year reinsertion; there were no completed or dependent result rows. Do not
treat that dormant class as an active teacher assignment.

For the capstone paper, distinguish reusable definition, school-year inclusion,
teacher assignment and year-specific enrollment. Removal changes inclusion, not
historical evidence; reinsertion does not create a duplicate learner roster.

## Previous release — CRL-2026-11-09.9

Administrator section assignment and unassignment run directly on the
school-scoped request transaction established by withSchoolScope. Do not wrap
`assignSchoolSection` in another interactive Prisma transaction in API requests:
the previous nested transaction returned a successful response and then failed
at the outer scoped commit, which surfaced as Unable to complete this school
request. There must be one commit boundary for the request.

The unassign statement locks the exact class, checks active linked hosts,
updates only `unassigned_at`, and requires one changed row. Its audit insert uses
the same transaction and previous teacher. Outer transaction diagnostics are
sanitized and must remain free of learner data. Keep completed assessment
evidence and the class ID unchanged.

For the capstone paper, describe this as a single unit-of-work transaction:
visibility change and audit either commit together or both roll back.

## Previous release — CRL-2026-11-09.8

Teacher unassignment is one atomic PostgreSQL statement plus its same-transaction
audit insert. Do not restore the former split Prisma relation-count,
class-section update and audit-create sequence: a production 503 path passed the
database checks but still failed inside that application sequence. The current
statement locks the exact class, checks active hosts, updates only
`class_sections.unassigned_at`, and reports both the active-assessment state and
whether one row changed. The audit insert uses the previous teacher as
`teacher_id` and the authenticated administrator as actor.

The unassign operation never deletes or transfers learners, assessments or host
history. Completed results remain attached to the same class and school year.
Only an actively linked host outside completed, terminated and teacher-review
states blocks the operation. Keep unexpected write diagnostics sanitized and
free of learner identifiers. The production rollback trial and full regression
suite must remain green before another release.

For the capstone paper, describe unassignment as an atomic visibility change
whose audit event commits with the state change, not as deletion or enrollment
transfer.

## Previous release — CRL-2026-11-09.7

The administrator Create Sections directory shows learner and school-year totals
under every name with singular/plural grammar. Its actions are ordered View,
Rename, Delete. View calls the administrator-only section_view endpoint and
opens two horizontally arranged categories: School Year first, then Learners.
Keep the categories exclusive so year assignments and learner records are not
mixed in one list. The School Year category summarizes year, teacher/unassigned
state and learner count. The Learners category shows learner identity, LRN,
year label and teacher assignment.

The rename overlay has no extra rounded row around its field; batch Create
Sections rows retain that reusable row treatment. Do not reintroduce a
dark-only padding, margin, border radius or sizing declaration on the shared
Coordinator root. Theme changes alter colors only, so administrator and Reading
Coordinator containers must retain the same geometry in light and dark modes.

Section totals count active year assignments and their enrolled learner rows.
Unassigned dormant classes remain included because their learners and assessment
evidence are retained. The View overlay remains read-only and does not expose
assessment answer content or provide mutation controls. This release needs no
schema migration.

For the capstone paper, describe section details as categorized read-only
administrative summaries and describe theme switching as a presentation-only
change with stable layout geometry.

## Previous release — CRL-2026-11-09.6

The administrator section-definition view is labeled exactly Create Sections.
Its directory uses a top-right Create + action, name search, and shared Select
controls for choosing Name or Date created and the corresponding A–Z/Z–A or
newest/oldest direction. Keep the Create action at the right edge of that
control row on desktop/tablet and in the right column on narrow two-column
layouts. Do not restore the removed explanatory sentences.

Create Sections is a batch draft. Numbered rows can be added or removed, with
one Save action sent as section_action add_many. Compare normalized,
case-folded names against active saved sections and all other rows in the open
draft before enabling Save. Keep the server's atomic 1-to-50-name validation as
the race authority even when the interface already blocks duplicates. Saved
rows show their creation date. Assigned section names use the larger directory
font size.

The result boundary remains year-specific. Unassignment and same-year
reassignment keep one class ID and all learner assessment evidence. Reusing a
section in another year creates a separate enrollment class and copies learner
identity/enrollment fields only. Never copy AssessmentSession or dependent
evidence during cross-year reuse. No schema migration is involved in this
release.

For the capstone paper, describe Create Sections as an atomic batch-definition
workflow and distinguish same-year assignment continuity from a fresh,
result-free enrollment when the reusable section is inserted into another year.

## Previous release — CRL-2026-11-09.5

Unassigning a section toggles `class_sections.unassigned_at`; it does not delete
or detach its learners. The class keeps its original teacher owner while
dormant, but every teacher-facing catalog, class authorization, active-section
count and coordinator backup excludes it. The administrator can choose the
original teacher to reactivate the same records or another teacher to transfer
the class, learners, assessments and hosts transactionally. A later transfer
back preserves the same records. Do not restore the earlier unassign behavior
that deleted empty classes or rejected any class containing learners/results.

Only an actively linked host outside completed, terminated and teacher-review
stages blocks unassign/reassign. Completed assessment evidence never blocks the
operation. Migration 20261109090620 adds the nullable dormant marker and
20261109090914 replaces the assignment guard that incorrectly referenced
`school_sections.start_year`. Both are applied in production and synchronized
with Supabase's migration ledger. Keep the additive column, transactions and
ownership updates together; an older application build must not run while
dormant classes retain a visible teacher owner.

Administrator dark mode defines the shared `--crl-surface`, `--crl-surface-2`,
`--crl-line`, `--crl-text`, `--crl-muted` and `--crl-bg` variables at the admin
shell boundary. Embedded coordinator and profile panels depend on these values.
Keep the variables at this boundary so every administrator tab and dialog stays
on the dark palette. Theme persistence, the title-adjacent toggle, centered
sidebar logo and responsive navigation are unchanged.

Plain-text and WinAnsi PDF story imports decode Windows-1252 punctuation with a
local byte map rather than relying on runtime support for the
`windows-1252` TextDecoder label. Keep that fallback deterministic because the
Node version used by a build can differ from the browser that performs an
offline import.

For the capstone paper, describe unassignment as a reversible ownership and
visibility state, not deletion. A completed assessment remains attached to the
same class and learner evidence when an administrator changes or temporarily
removes the assigned teacher.

## Previous release — CRL-2026-11-09.4

The administrator theme toggle belongs beside the active main-content tab title,
not in the sidebar. Keep the sidebar logo centered. Staff authentication and the
theme persistence mechanism are unchanged.

School Years and Sections has three views: Create sections, Assign Sections and
Deleted Sections. Create sections manages the reusable section list and has its
own Create dialog. Assign Sections shows only definitions with an assignment in
the selected school year. Its Insert section dialog chooses one currently
unassigned definition and one teacher. Do not restore a global list of every
created section inside each year.

Roster reuse still occurs after explicit insertion into a later school year:
the newest earlier roster is copied, while assessment results remain empty in
the destination year. Keep this behavior even though the explanatory reuse
sentence is removed from the assignment workspace.

## Previous release — CRL-2026-11-09.3

School-year creation and section assignment are administrator responsibilities.
The administrator navigation item School Years and Sections exposes Assign
Sections and Deleted Sections. Assign Sections uses the left/right workspace:
school years on the left and teacher assignments on the right. Its top-right
Create sections dialog accepts one name per line and commits all valid names
through Add created sections. The Reading Coordinator has no School Year panel;
coordinator year/assignment write actions return an administrator-only error.

Keep school-year and assignment authorization enforced on the server, not only
by hiding navigation. Coordinator Assessment, Records and Assessment Contents
remain available. Section edit/delete actions in the assignment workspace keep
their existing archive-before-delete and multi-year recovery behavior.

Keep supabase/migrations synchronized with the production migration ledger.
CRL-2026-11-09.3 reconciled 50 recorded versions, including older files whose
reference timestamps differed and migrations that previously existed only
remotely. Do not delete or rename these synchronized files without checking
production history; doing so reactivates the Supabase Preview mismatch.

The roster reuse rules from CRL-2026-11-09.2 remain unchanged: each assignment is
a distinct year-specific class, the newest earlier non-deleted roster is copied,
and no assessment results transfer. See the previous note below for schema and
migration details.

For the capstone paper, describe the administrator as the staff role that owns
school-year setup, reusable section definitions, and teacher assignment. The
Reading Coordinator configures assessment timelines and reviews school records.
All roles still operate within the same school scope.

## Previous release — CRL-2026-11-09.2

Sections are reusable across school years and belong to the school rather than
to a school year. Admin Add/Edit Section has no school-year input. The Reading
Coordinator selects a school year when assigning a section to a teacher. Older
school-section definitions remain usable because migration
20261109120000_reusable_sections_and_year_rosters removes their start_year
column. Apply that migration before deploying an application build that uses the
new Prisma schema. It is applied in production for CRL-2026-11-09.2. The
temporary production-target migration function was removed after schema
readback, and it is not part of the released source.

Each assignment remains a distinct teacher-owned ClassSection under one
SchoolYear. Assigning a reusable section creates that class and copies the newest
earlier non-deleted roster for the same school section. Only learner identity and
enrollment fields are copied. AssessmentSession and all dependent evidence are
never copied, so reuse starts with empty results. Earlier classes and results
remain unchanged. An identical assignment is idempotent; an assignment with no
earlier roster starts empty.

The teacher-wide learner identity rule is superseded: the same name/LRN may
appear in different school years, while application checks reject duplicates
within the selected school year, including online and offline add/import paths,
and the database retains LRN uniqueness within a class. Do not restore
learners_teacher_lrn_key or learners_teacher_name_key without a reviewed
migration and duplicate reconciliation.

A section may now have assignments in several years. Admin deletion archives and
records recovery metadata for every assignment. Restore is all-or-nothing and
checks every original school year before changing data. Preserve
recovery_assignments and the existing single-assignment recovery columns for
compatibility. Deleting or restoring a school year still follows the existing
archive-before-delete and ownership rules.

For the capstone paper, describe section templates as reusable across years,
class enrollment as year-specific, and assessment evidence as belonging to the
new year's enrollment. A copied roster is not a copied assessment and contributes
zero assessments until new work is completed. Do not claim a copied roster is a
permanent learner identity shared across years; the current schema intentionally
creates independent enrollment records.

## Previous release — CRL-2026-11-09.1

Keep section mutation errors inside the section dialog, separate from catalog
load errors. Add/Edit derives duplicates while typing from active sections in the
captured school year using sectionName normalization and case folding, excluding
the edited ID. Disable Save for a duplicate and retain the server's transactional
guard for races. Cancel, Escape and reopen clear only form errors. Worker96 keeps
local journals. No database or operational-data change is required.

Clean install, full build and 60 verification scripts passed; live all-severity
audit reported zero vulnerabilities. Synthetic browser checks passed at
320/768/1440px, light/dark: immediate validation, normalized duplicates, year
scope, rename exclusion, submission blocking, server race and overlay cleanup.
No overflow or browser runtime errors were observed. The capstone diagram fixes
change presentation only and retain its existing schema meaning, figure theme,
and paragraph/note formatting. Section 3.5 describes general future delivery
activities instead of a technical release log.

## Previous release — CRL-2026-11-08.3

The landing access section now has Go to Teacher (/login), Go to Learner
(/learner), Go to Reading Coordinator (/coordinator) and Go to Administrator
(/admin). Keep the existing protected staff routes and middleware redirects;
these links do not grant privileges. Preserve the Teacher download control.
The four-card grid has two equal columns above 820px and one below, using the
existing landing palette and accessible touch targets. Worker95 retains journals.
No database schema, operational record or authorization change was necessary.

The native capstone account-access note and latest release summary reflect the
four destinations. Existing activity/use-case/ERD roles, schema and established
figure design remain accurate. The 116-page PDF's account-access page and mobile/
desktop landing screenshots were visually reviewed. Clean install, full build
(60 verification scripts), all-severity audit with zero vulnerabilities and browser
checks at 320/390/768/1024/1440px passed, including actual four-link navigation,
staff sign-in redirects, no horizontal overflow and no page runtime errors.
Rollback changes landing presentation only; preserve auth, records and journals.
No physical-tablet result is established.

## Previous release — CRL-2026-11-08.2

Clear requires a second Confirm/Cancel dialog. Cancel sends nothing and retains
the draft. Confirm closes both overlays before the pending save, with progress/
success on the main panel and Okay-only background failure notices. Keep the
pending/revision guard and effective live state. Clearing does not pause a live
assessment or erase its recorded actual start; configured boundaries are removed.

Overview display is school-wide via schoolAssessmentTimelines, independent of
owned years/sections. Keep that display-only list separate from signed class/year
start authorities. No grants/revision content belong in it. Offline catalog merge
must preserve authoritative empty metadata. Existing focus/15-second refresh keeps
Overview current. Enrollment, learner ownership and Start class checks remain.

All normal school-year menus honor deleted shared definitions. The provisioning
trigger previously recreated teacher-year rows during deletion. Applied migration
20261108030059_skip_deleted_school_year_provisioning.sql returns early for deleted
parents, pauses their timelines on future deletion, and still provisions explicit
recreation/new teachers from active years only. Existing falsely provisioned owned
rows are retained and hidden by parent status. classCatalog returns visible years/
sections and hidden identity tombstones; class/year access rejects deleted parents.
Catalog merge and offline reads exclude deleted starts/IDs even with legacy pending
work; an authoritative recreated active identity clears stale cached tombstones.
The shared chooser uses the prompt for invalid selections, and Records reloads on
panel entry. Preserve Recovery records and stored ownership; do not erase data to
fix a menu. School-wide timeline display/grants also exclude deleted definitions.

One live slot now spans every year/period in a school. This supersedes per-year
exclusivity. UI checks all rows; server excludes only the exact year/period target.
Applied migration 20261108023331 adds one_live_assessment_per_school and changes
trigger plus both schedulers to school-wide occupancy, rechecked per due candidate.
Keep the old per-year index for compatibility. Calendar reservations/order remain
per year; manual label independence and past-start guards remain. Other schools
retain separate slots. Preflight/readback showed no duplicates or operational row
changes; temporary DB trials rolled back. Do not reset records or auto-reactivate
paused rows on rollback.

Admin SVG intrinsic dimensions now match its wide viewBox; 200px responsive login
branding and automatic height match coordinator visibility/spacing. Vector artwork
and authentication are unchanged. Worker94 retains journals. Native capstone and
editable use-case/activity/ERD sources reflect these behaviors; Clear has a matching
activity continuation. Keep established figure colors and native typography.

Clean install, full build/audit (60 scripts, zero vulnerabilities), six responsive
width/theme cases, isolated DB trials, migration/readback, and visual review of
six pages of the 116-page native PDF plus relevant UI screenshots passed. Failure,
cancel, pending closure, no-assignment Overview, cross-year rejection and deleted-year
menu/recreation cases are tested.
No physical-tablet result is established by these checks.

## Previous release — CRL-2026-11-08.1

Start/stop hour/minute controls opt in to loopOptions. Their visual lists wrap both
directions over 01–12 and 00–59; recenter native scrolling by whole-cycle height so
adjacent values remain continuous. Scrolling alone saves nothing. All displayed
copies select the corresponding real value; typing, Enter/click/blur, Escape and
caret behavior stay intact. The native select and accessible middle band retain
one option per value, with unique IDs. Decorative bands are hidden from AT. Keep
keyboard wrap, native touch pan and contained scroll; no scrollbar hard endpoints.
Other selects, including AM/PM and date selectors, remain ordinary lists.

Worker93 retains journals. No database change is required; retain the past-start
migration, recorded times, manual activation, ownership and assessment state. The
main capstone scheduling note and current summary now describe circular drawers;
existing diagram structures, colors and permissions remain accurate. The updated
native PDF scheduling page was rendered and visually checked. Clean install and
full build/audit passed (60 scripts, zero vulnerabilities). All six 320/768/1440px light/dark browser cases and an additional 320px mobile
visual run passed, including wrapped-row selection and bidirectional wheel/keyboard
boundary checks. No physical-tablet
result is established.

## Previous release — CRL-2026-11-07.10

Newly selected start dates must be today or later in Philippine time, within the
school-year pair. Disable past Start days/months/years and previous-month navigation;
normalize a past displayed month when switching back to the current year. Future-
year January remains valid. Keep current-month opening, eligible visual-only day
preset, reserved colors, stop order and one-live rules. Do not rewrite historical
starts: an unchanged recorded instant remains valid for stop edits, pause, clear
and scheduler work. Manual Go live remains independent of year labels. Earlier
times today are allowed; this is a date floor rather than a future-instant rule.

Dialog and API use startDateIssue; the private invoker trigger independently rejects
inserted/changed past scheduled starts. Applied migration 20261107155451 is tracked
in supabase/migrations/20261107155451_reject_past_assessment_starts.sql. It preserves
prior trigger guards and permissions and changes no operational rows. Rollback-only
DB trials and production fingerprint/count readback passed. Keep the manual-start
policy, recorded times, ownership, attempts and journals on rollback.

Numeric time controls collapse automatic selection to a caret on focus/click. Keep
live drawer previews, Enter/click/blur commit, valid numeric ranges, centered text,
and deliberate user selection. Admin access branding is 260px maximum with a 136px
image box and 12px gap before Hello!; responsive maximum prevents overflow. Worker92
retains journal state. Other login behavior is unchanged.

Main capstone notes/summary and scheduling activity/ERD sources are updated with
the established designs; use-case actors/permissions remain accurate. Clean install,
full build/audit (60 scripts, zero vulnerabilities), six width/theme browser cases,
DB rollback trials and visual checks of the two native PDF pages/mobile login passed.
The access fixture is isolated from the other synthetic fetch responses. These
checks do not establish physical-tablet performance.

## Previous release — CRL-2026-11-07.9

Date controls on cards and dialogs follow effective live state: Edit while live,
Set while paused or otherwise non-live. Saved boundaries survive Pause. Clearing
while live retains Edit. Do not revert to using scheduleEnabled for these labels.

Open calendars in the Philippine current month, clamping only the opening year to
the selected pair. Highlight the eligible current day number only when no boundary
is set; this is visual and does not fill or persist a date. Saved boundary controls
still navigate to their actual dates. Leap-day projection clamps to month length.
Keep school-year/order/overlap validation, period-colored reserved disabled days,
stop-only server start and explicit-save behavior. Manual live event times remain
actual timestamps, independent of the school-year label.

School-year rows match Records teacher hover surface/border for fine-pointer hover;
keep reduced-motion support and keyboard focus. Worker91 retains journals. Production
readback confirms schedule constraints and scheduler; no migration or record change
is needed. Preserve learner, assignment, assessment and timeline state on rollback.

Native capstone notes and activation/scheduling activity sources are updated with
the established diagram palette and format. ERD/use-case structures remain accurate.
Clean install, full build/audit (60 scripts, zero vulnerabilities), six responsive
width/theme combinations and visual review of the two native PDF figure pages
passed. The synthetic navigation fixture waits for the completed tab change; no
production navigation timing was altered. No physical-tablet result is established.

## Previous release — CRL-2026-11-07.8

Teacher selection is a confirmation draft. Show the chosen teacher and section in
an Assign teacher? dialog with Confirm/Cancel before writing. Capture its year and
IDs at selection; Cancel/Escape sends nothing and retains the committed teacher.
Use the existing pending guard and disable controls during acknowledgement. Keep
same-teacher selection a no-op. Assignment/unassignment rejection uses Okay-only
NoticeDialog, without an inline panel error or changed ownership. Post-save refresh
failure must distinguish the acknowledged save from the failed refresh. Year form
errors retain their existing handling.

Center the school-year heading in the right assignment panel. Unassign is a red
button on the left under its dropdown in both themes. Worker90 retains journals.
The server's school, learner and assessment ownership guards remain authoritative.
Production readback confirms active-assignment uniqueness and school RLS; no schema
or operational-data write is needed. ERD/use-case structures remain accurate.

Native capstone and editable assignment activity sources include confirmation,
cancellation and Okay-only rejection with the established colors and lanes. Clean
install, full build/audit and six responsive combinations passed; the native PDF
activity page was rendered and visually checked. Preserve records on rollback.
No physical-tablet evaluation is established by these software checks.

## Previous release — CRL-2026-11-07.7

Placeholder options are explicitly hidden in shared Select popups and keyboard
navigation, while retained in the native options for closed display and validity.
Only mark prompts: keep meaningful empty-valued All filters, backup defaults and
recreate/create-or-match restore choices. Teacher assignment controls have an
Assigned Teacher title and display No assigned teacher for empty assignments.
Menus begin with actual teachers. A separate Unassign action retains existing
server transfer/enrollment guards. Admin Section List starts unselected; refresh
preserves a valid explicit year choice. Other teacher/coordinator/admin prompts
follow the same display-only behavior. No auto-selection or assignment from prompts.

Manual Go live is independent of the school-year label. This supersedes .6's
Outside school year status and manual API/database year blocking. Keep year/day/
order validation for configured schedules, their actual timing, and one live row
per school/year. Manual start timestamps remain actual event times; do not prefill
them into a calendar outside the selected year pair. Teacher catalogs and signed
manual authorities stay eligible independent of the label. Apply year-end lease
clamping only to configured schedules. Clear/Pause, revisions and ownership remain.

The applied manual_activation_independent_year migration is 20261107115735, source
in docs/migrations/manual_activation_independent_year.sql. It changes the trigger
and both schedulers without changing operational rows. Rollback-only DB trials
verified manual activation survives reconciliation and one-live/calendar guards
remain. Timestamp fingerprints and learner/assignment counts are retained. Do not
reactivate previously paused rows or rewrite their recorded starts automatically.

Worker89 retains journals. Native capstone text, assignment/activation activity
sources and ERD notes are updated in the established design; use-case actors and
permissions remain valid. Clean install, full build/audit, six responsive theme/
width combinations and native PDF visual checks passed. No physical-tablet result.

## Previous release — CRL-2026-11-07.6

School-year eligibility is now enforced in calendar, API and database. Use the
selected two calendar years in Philippine time, not an inherited manual timestamp.
Blank-start/server-now and Go live must also be in that range; future years need an
explicit scheduled start. Invalid historical starts do not prefill new schedules.
Keep BoSY, MoSY, EoSY order and distinct reserved calendar days. The entire selected
stop day is reserved even when stopping at midnight; actual stop remains exact.
starts_on/ends_on are calendar projections as well as compatibility fields. Legacy
inclusive-end writes retain their final selected day. Reservations keep their own
green/yellow/purple colors in all calendars and are disabled. Open ends reserve the
remainder of the school year. Preserve one-live, Clear/Pause and tenant scope.

The applied assessment_calendar_eligibility migration is 20261107104609, source in
docs/migrations/assessment_calendar_eligibility.sql. It pauses out-of-year activation
without changing its timestamp, adds year/day constraints and ordered-period
validation, and bounds scoped/private reconciliation by school year. Fingerprints
confirm timestamp preservation; learner rows and attempts are retained. Rollback-only
DB trials and scheduler readback passed. New signed authority expiry is clamped to
school-year end; existing disconnected lease revocation remains bounded.

Hours are 01–12 with AM/PM, superseding .5's 00–11. Typed numeric drafts keep the
menu open and highlight/scroll to the matching option; Enter, option click or blur
commits valid input, while Escape discards it. Reject zero hours and invalid input.
Time values remain centered and calendar selects have no blue ring; keyboard focus
uses a darker border. Worker88 retains journals. Native capstone, activity and ERD
sources use the same established design; use-case actors/permissions remain valid.
Clean install, full build/audit, six responsive combinations and native PDF visual
checks passed. Do not claim physical-tablet evaluation from these checks.

## Previous release — CRL-2026-11-07.5

Start/Stop date boxes select a calendar boundary again; direct date entry from .4
is superseded. Preserve its selected-year navigation bounds, visible-month clamp,
current-clock preset, larger context label and vertical time rows. Hours accept
00–11 and minutes 00–59 through typing or dropdown choices; AM/PM is separate.
00 maps to midnight/noon in the selected half-day. Leading digits that cannot begin
a two-digit value finish padded immediately; a subsequent appended digit is ignored.
Reject invalid characters/paste; Backspace/Delete resets to 00. All time values,
including menu labels and full AM/PM text on phones, are centered. Select numeric
and centered props are opt-in; ordinary dropdowns retain established behavior.

Worker87 retains journals. No schema or operational-data change is needed; production
timestamp columns, valid ranges, one-live state and the minute job were verified.
The native capstone and editable scheduling activity sources use calendar selection
and bounded typed times with the existing palette. ERD/use-case relationships remain
accurate. Clean install, full build/audit and six responsive theme/width combinations
passed; the native PDF scheduling page was visually checked.

## Previous release — CRL-2026-11-07.4

The date overlay now has direct month/day/year controls plus the calendar. New year
choices follow the selected school-year pair; clamp the visible month into that
range if today is outside it so the calendar opens with selectable days. This
supersedes .3's unrestricted UI year navigation. Existing timestamps remain
preserved; an out-of-range saved year is shown as disabled, and explicit new edits
use the allowed years. Input validity is tracked separately from optional empty
dates so partial/invalid day edits cannot silently trigger an automatic start.

Start time is above Stop time on all widths. A new start defaults to the Philippine
clock at dialog opening, with the server offset applied; editing retains the saved
time and its seconds unless changed. The period/SY heading is 17px semibold (16px
on phones). The bottom helper sentence is removed. Worker86 retains journals.

No schema/data mutation is needed. Exact timestamp scheduling, one-live and overlap
constraints, saved authorities, manual starts and Clear/Pause stay authoritative.
The production database and scheduler were verified. Native capstone text/activity
sources and figure notes are updated; ERD/use-case relationships remain unchanged.
Clean install, full build/audit and six responsive light/dark combinations passed.

## Previous release — CRL-2026-11-07.3

Scheduling dates are independent of the school-year label. The old label-based
calendar disabling is removed. Exact Philippine date/time instants are configured
through AM/PM controls. Missing start with an end uses current server time; manual
Go live records the start. Future activation waits for its instant and a free live
slot. Stop is exclusive: no new starts at or after that instant. Start-only open-
ended schedules remain possible. Overlap now means timestamp intersection, allowing
adjacent ranges on the same day. Preserve one-live, school RLS and revision locks.

The preserving timestamp migration is applied as 20261107063336. Readback confirms
the new columns, recorded manual live start and active scheduler. Rolled-back DB
trials preserved real records and activation while verifying exact-time rules,
exclusive activation, Clear, Pause and waiting-to-live reconciliation. Full build,
all-dependency audit and six responsive light/dark checks passed.
The migration source is docs/migrations/assessment_timeline_clock.sql.
It adds starts_at/ends_at, backfills enabled date ranges preserving inclusive final
days, and replaces date checks with timestamp exclusion. Legacy dates remain a
projection for older clients. Existing manual live rows use updated_at as a fallback;
new manual starts use actual server time. Trigger and request reconciliation must
agree; the private minute job remains backend-only. Offline grant expiry uses the
exact stop, not a date-only extension. Existing disconnected-revocation limits stay.

Assessment renders a year-selection message before showing cards. Each timeline
has its meaning and stacked Start/End. Teacher Overview stacks period/SY left and
Start/End right. Set/Edit stays enabled before Go live. Small calendars stack their
month/year menus; short time popups retain enough space for their checkmark. Escape
on an expanded Select closes only that menu. Worker85 retains local journals.
The main capstone, activity and ERD sources document these flows consistently.

## Previous release — CRL-2026-11-07.2

School Year uses one Search / year sort / Create row, a wider search and matching
sort/button widths. The directory stays moderately wider than assignments, with a
14px panel gap. Assigned-section sorting is removed. Date overlays open on today's
Philippine month/year, retain saved fields and use matching year-menu widths.
All intervening calendar years remain selectable for distant school years.
BoSY/MoSY/EoSY selected dates are green/yellow/purple. Set becomes Edit when dates
exist; Clear resets the label and removes automation while preserving live state.
The clear_schedule_preserves_live migration is already applied. Do not restore
the earlier Clear dates and pause behavior or a backend that always sets isLive
false when clearing. Manual Pause and automatic stop dates remain separate.

manageSchoolAssessment returns the committed row and server time; date cards apply
that result directly. Other save forms separate server acknowledgement from list
refresh; never claim persistence before acknowledgement or suppress refresh errors.
Teacher catalog assessmentTimelines is display metadata, distinct from signed
assessmentAuthorities. Overview may display Scheduled/Waiting dates without issuing
permission to start. Current eligible live rows alone issue start grants. Preserve
this distinction in online/offline merging, RLS and documentation. Worker84 retains
local journals. A future configured range is expected to be inactive before its
start day; show it as upcoming instead of only an empty live notice.

The main native capstone and scheduling activity continuation describe these flows;
existing ERD relationships and use-case permissions remain unchanged. Sources retain
the established diagram palette. Clean install, full build/audit, focused catalog
policy tests and six responsive light/dark browser combinations passed. No absolute
network performance or physical-tablet result is established by those checks.

## Previous release — CRL-2026-11-07.1

The unreleased Overview/date overlay work is completed with these added fixes.
Live status now matches Overview statistics (white surface, thin border, shared
label typography, 16px corners and no extra grid margin). Set start/stop dates opens
a compact dialog; verbose paragraphs are removed, year popup width is bounded at
132px, and cancellation discards its draft. The dialog captures its opening revision
so a background refresh cannot silently overwrite edits. Existing date semantics
remain inclusive Philippine days. Worker83 retains device journals.

Coordinator Assessment and teacher Conduct/Records/Analytics initially show Choose
school year, including reopening from the main menu. Hydration preserves valid
explicit choices but never picks the newest year. Direct learner View remains an
explicit scoped navigation. The Conduct toolbar is sticky: filters first, then right-
hand Add, Import, Select all, Deselect all, Delete selected. One action row stays
stable during selection. Profile file validation and timeline conflicts share an
Okay-only NoticeDialog. Circular crop/upload behavior remains.

The applied single_live_assessment_timeline.sql adds a partial unique index on
(school_id,start_year) WHERE is_live and serializes trigger mutations. Only one live
period is allowed in each school/year, whether manually or automatically activated.
Future non-overlapping schedules can be prepared while a timeline is live. A due
schedule waits while that timeline remains live and activates after it is paused.
The private owner-only minute job closes ended rows before opening waiting ones.
refresh_current_school_assessment_schedules is a restricted invoker function: it
requires the request's crl.school_id and operates only within that school under RLS.
Catalogs and online starts call it and require stored live state plus eligible dates.
No active-row conflict was present during the migration; no existing records were
chosen for deactivation or reset. The older independent-live interpretation is
superseded. Signed offline leases still cannot receive immediate remote revocation.

The main capstone, scheduling activity diagram and school-flow ERD were updated in
place with consistent native colors and editable sources. Existing use-case actors
and goals remain correct. Clean install, policy regression, database rollback trials
and responsive browser checks passed. The final production build and full dependency
audit passed with zero vulnerabilities. Updated native activity/ERD pages were
exported and visually checked.
Keep the one-live index and compatible backend when rolling UI changes back.

## Previous release — CRL-2026-11-06.7

School Year supersedes .6's wide split with a moderate 1.2:1 directory/detail
ratio on desktop. The Create school year button is shorter, bounded and centered.
Search is wider than either horizontal sort dropdown; narrow layouts preserve
internal horizontal scrolling. The selected-year empty state is “No sections for
this school year yet.” Worker82 refreshes interface assets and retains journals.
This change has no database schema/data impact. Existing records and successful
schedule job execution were verified. The native capstone navigation description,
Figure 15 note and release summary were updated; diagram relationships/palettes
remain accurate. All .6 scheduling, authority and recovery policies below remain.

## Previous release — CRL-2026-11-06.6

Coordinator School Year now allocates more width to its compact year directory.
Search and both sort controls share a horizontal row (internally scrollable on
narrow screens). Per-row trash icons carry their own target year, independent of
the currently selected detail; registered teacher dropdowns remain direct.

Optional inline calendar schedules supersede manual-only timeline activation.
SchoolAssessment adds scheduleEnabled, schedulePaused, startsOn and endsOn; the
migration `assessment_timeline_schedules.sql` was applied to the live database.
Date ranges are inclusive Philippine calendar days and must stay within the two
calendar years of the selected school year. A GiST exclusion constraint prevents
enabled timelines from sharing any day in the same school/year. The shared-library
advisory lock and expected revision protect application mutations. Saving enables
automation and clears pause; Pause persists until resumed/resaved. An enabled
schedule cannot Go live outside its range. Removing its schedule pauses activation;
manual Go live is available again afterwards. No existing timeline was rescheduled.

A private invoker pg_cron job runs every minute, independent of open browsers.
The database trigger derives stored live state and increments revision on policy
changes. Catalogs and online starts also evaluate the actual Asia/Manila date, so
a job boundary delay cannot authorize late starts. Newly issued offline authority
expires at min(now + 24 hours, midnight after endsOn). Already captured attempts
retain immutable versions/replay. Disconnected clients cannot immediately receive
later pauses or shorter edited deadlines; reconnection refreshes authority. This
limitation remains explicit in the capstone. Existing school isolation is retained.

Teacher Overview lists live timelines and end dates for active assigned years,
with “Not set by your coordinator” for manual activations. Main-menu and Conduct
catalogs refresh on focus and every 15 seconds while visible. Admin Sections uses
a hover/click flyout with a pointer bridge and arrowhead; mobile placement opens
below the trigger. Deleted Sections centers its empty state. Worker81 retains all
local journals. Previous click-only flyout, repeated card year labels and detail-
header school-year deletion are superseded.

The main capstone was edited in place: role/navigation and lease text, Figure 7,
new Figure 15 scheduling continuation, recycle labels and Figure 26c fields. Native
SVG/drawio/PNG sources share the existing activity/use-case/ERD styles. The exported
115-page document was inspected at the changed figure pages. Clean installation,
zero-vulnerability audit, full production build, schedule regression, database
rollback checks and responsive light/dark browser trials passed. Future policy
changes must preserve signed captured attempts and avoid resetting records.

## Previous release — CRL-2026-11-06.5

School Year has separate searchable/sortable directory and assignment panels;
registered teacher dropdowns persist directly. Timeline cards invoke activate with
expected revision 0 for a missing trigger, creating it live under the shared-library
lock. Existing create/toggle compatibility remains; content validation, prerequisites,
immutable attempts and school isolation remain authoritative.

SchoolSection stores expiresAt, recoveryClassId and recoveryArchiveId. Admin Sections
opens Section list / Deleted Sections. Deletion retains the definition for 30 days;
restore uses its original teacher/class and existing protected archive route. Name,
year, expiry and archive conflicts abort the request savepoint. The private invoker
cron function is executable by the scheduler owner only; each minute it detaches
expired historical assignment links and removes due definitions. Existing encrypted
archive expiry remains separate. Application users cannot invoke cleanup. Migration
section_recycle_bin.sql is additive and its date trigger supports older delete code.

Teacher Start opens a checking state before refreshing authority and cannot submit
until that refresh succeeds. Request generations prevent cancelled dialogs reopening.
The live eligible period is preselected and named in the notice. Teacher username edits
are canonicalized, validated and checked for case-insensitive collisions while school
ownership stays fixed. Records import uses the same assigned-class learner importer.
Revoked coordinator invitations stay labelled in their original admin container;
the coordinator teacher-code list is unchanged. Worker80 preserves device journals.
Capstone implications: direct dropdown assignment, card activation, immediate start
feedback, username updates and a consistent Section recycle activity/ERD continuation.

## Previous release — CRL-2026-11-06.4

School administration is now tenant-bound, with exactly one admin per school;
users.school_id is required and a partial unique index enforces the admin rule.
The former global account is assigned to the existing school; two other school
admins were provisioned on explicit instruction. Credentials must never be stored
here. Public teacher/coordinator signup remains invitation-bound; administrator
self-registration and cross-school administration are retired. Every authenticated
access API operation runs inside the same restricted school connection as coordinator
and teacher requests. Nested mutation callbacks use savepoints to prevent partial
writes when an API handler returns a validation error.

SchoolSection stores admin-created section definitions by school/year. The existing
ClassSection remains a teacher-owned assignment and enrollment container; its optional
school_section_id links migrated and newly assigned sections to the definition. One
active assignment per definition is enforced by a partial unique index and a trigger
checks school/year ownership. Coordinators create school years, assign these sections
to same-school teachers, manage live timeline triggers, and view Records. Sections
with learner records cannot be reassigned, preserving teacher ownership. Teachers
again add/import/delete learners in their assigned class. LRN/name duplicate checks
apply within the enrollment class, permitting re-enrollment in another school year.
Coordinator Main has School Year, Assessment, Records and Assessment Contents; the
Classes/roster management UI and coordinator import/enrollment API are retired.

SchoolAssessment stores one draft/live trigger per school/year/timeline and the
published content revision. Only live timelines appear at Teacher Start; both normal
and transactional start checks enforce activation. Publishing new contents updates
future activation versions; attempts retain their immutable revision. Offline starts
need a synchronized live authority with a 24-hour signed lease. Pausing cannot reach a
fully disconnected device instantly; its last synchronized lease bounds new offline
starts. Already-conducted signed offline attempts can replay their original version;
legacy pre-cutover journals use the retained capture time, never a new unsigned bypass.
Worker79 refreshes UI assets without resetting device journals. Migrations in
school_assignments_and_live_timelines.sql, offline_timeline_cutover_policy.sql,
school_flow_lookup_indexes.sql and require_school_for_all_staff.sql are preserving.

## Previous release — CRL-2026-11-06.3

Platform Logs is separate from coordinator Logs: select one school or the
Administrator access category; never add an all-schools feed. lib/platformLogs
checks category, staff, detail and cursor on the server after current admin auth.
Audits retain nullable school_id/actor_name snapshots through an invoker trigger,
so later account removal does not lose category/name. The additive migration is
in docs/migrations/platform_log_scope.sql. Signup records encrypted invitation
redemption within its existing transaction; no code/account inference is allowed.
School staff data is explicitly allowlisted (photo and real relation counts).
SchoolStaff keeps each role's search/sort separate. Teacher section shortcuts open
the existing class form, choose an active year and retain server authorization.
Admin login uses crl-app-admin.svg; this does not change installed app manifests.
Figures 7/19/26 continued and the native capstone now include platform activity
review and audit snapshots. Worker78 supersedes77 without clearing offline data.

## Previous release — CRL-2026-11-06.2

Header switches share the Teacher dimensions. Coordinator header actions must stay
in their explicit group; do not restore auto margins on both buttons. Dark logos
use the Teacher white filter. Teacher DOM order is switch before Logout. Only the
administrator avatar button opens Profile; identity text is deliberately static.
Coordinator invitations render once in the active list, with Copy beside the code
and explicit spacing after the school name. Main worker77 supersedes worker76.
No schema or operational-data change is needed for this visual revision.

## Previous release — CRL-2026-11-06.1

SystemAdminDashboard is the separate platform admin UI. Schools and Coordinators
combines school counts and categorized staff lists; Invite Coordinator creates
single-use school-bound invitations. Profile is reached from sidebar identity,
not a menu tab. Mobile drawer owns focus/Escape/outside dismissal and scroll lock.
Themes persist with the Teacher-compatible crla_theme key. Coordinator code batches
accept integers 1–50 and preserve existing valid codes. Admin signup still requires
an administrator-issued role-specific invitation. Tuyan operational records were
explicitly erased once on user instruction; never replay cleanup on deployment.
The sole remaining platform administrator is unchanged.

## Previous release — CRL-2026-11-05.5

Coordinator Main opens School Year, then Classes and Assessment Contents. Teacher
rows list all assigned-school teachers, with a current relation-based section count
beside the name, circular avatar and Class Record action. Logs uses the same count
selection; do not read legacy users.section for assigned classes. Main/Codes/Logs
and other tab titles remain accessible headings without repeated visible titles.
Profile panel/button CSS must not inherit generic admin borders. Codes has no teacher
list or audit/recovery statistics. New invitation redemptions persist used_by_name;
legacy missing users cannot be reconstructed without source evidence.

Coordinator/admin login now uses lib/portalLogin.js: password first, automatic MFA
challenge where enabled and browser recognition is absent. The database stores only
a token hash, account/security version, expiry and bounded attempts. Verification
consumes the challenge once; five tries and five-minute expiry are enforced atomically.
HttpOnly signed recognition lasts 30 days, bound to role/account/user-agent/version.
Clearing browser data or changing password/2FA requires verification again. Keep the
existing school/status/session guards. Migrations 20261105144134 and 20261105144648
are additive. There is no legacy consent backfill or reset. Sign-in mode switches
use a moving surface and reduced-motion fallback. Teacher records keep grid borders;
Conduct filters remain one row with local scrolling on phones.

The prior .4 learner registration repair remains: both learner surfaces import the
same exported worker helper; failed imports block the build. Root metadata remains
neutral, /install/teacher and /install/learner retain separate identities, and no
landing-consent gate is mounted. Staff signup agreement/version remains mandatory.
Teacher profile can edit only structured names, not school. Coordinator profile adds
username/password/local TOTP setup. Main worker75 refreshes cached pages while
preserving device journals; learner worker34 is unchanged. Physical mobile install
and device-to-device offline pairing remain outside browser-emulation proof.

## Live preserving school-role release — CRL-2026-11-05.2

The explicitly approved preserving rollout is live. PR #17 merged to main. Migration
20261104160712_preserve_records_school_role_separation applied with all 27 table
count/content checks passing. Original user IDs, 33 learners, 4 assessments, 1 archive
and 4 recovery items were retained. Former administrators became the original
school's Reading Coordinators; shared passwords were replaced with unique credentials.
The original teacher and local offline journals were retained. No reset epoch or
cache-erasure boundary was introduced. The blocked destructive reset is superseded.

/admin is separate platform administration; /coordinator is school coordination.
Same-school coordinators share their workspace. Request-local school transactions,
restricted database role and RLS enforce school boundaries alongside teacher ownership.
Registered-school, role-bound single-use invitations govern signup. Teacher/coordinator
login accepts email or username. Current status/session-version checks apply to portal
sessions and offline bootstrap. Profiles use the existing photo/crop workflow.

Three demo schools, five new coordinators, ten new teachers and one platform admin
are actual active accounts, with demo 2FA off. The original school remains additional
to those three. Demo .example email identifiers are not delivery mailboxes. Credentials
are delivered separately and must never enter git or the capstone. The two converted
coordinators retain their IDs/history and receive unique replacement credentials.

This finishing patch allowlists coordinator overview account fields: password hashes
and authenticator secrets cannot be serialized. Regression assertions cover both.
Clean npm ci, zero-vulnerability audit, 52 gates and optimized build passed. Responsive
portal checks cover 320–1440px; software/browser checks do not prove physical mobile
installation or device-to-device Wi-Fi pairing. Capstone prose and matching role,
authentication and school/account diagrams describe the deployed preserving design.

## Current product decisions

- CRL-2026-11-04.9 supersedes .3's recovering/interrupted presence exclusion.
  crl_live_assessment_hosts supplies the DB guard, status/counts and admin live view.
  Fresh teacher presence protects reconnecting work; silence expires after 30 seconds.
  Ended/terminal hosts never hold the lock. Keep advisory ordering for all presence
  writes, fixed search paths and backend-only grants. Applied migration
  20261104114530_live_assessment_visibility_guard; no result/evidence rewrites.
- Contents has blocked editing, a distinct-teacher count and Live Assessments link.
  Preserve drafts and fail closed on status errors; older loads cannot undo newer
  status. Main Live Assessments is an admin-only 3-second cloud snapshot with a teacher
  list, current task/content and recorded results, no mutation or pairing secrets.
  Clear stale data on failure and exclude ended/expired activity. Offline-only work
  cannot be observed until it reaches the server; do not claim screen/video streaming.
  Its selection is separate from Classes/Records. Teacher cache72 / learner32.
  Native baseline .9 and Figures 7/17 record this; ERD relationships are unchanged.

- CRL-2026-11-04.8: Android Chrome's native Installing stage belongs to its WebAPK
  installer, not the worker. Acceptance/appinstalled does not confirm icon creation.
  Keep bounded public manifest/icon checks and explicit Create shortcut guidance;
  never clear unsynced site data to retry or claim native success from emulation.
- Learner warming watches its exact registration, never root serviceWorker.ready;
  update checks run independently. Install/activate waits on neither cache storage
  nor network. Keep previous learner documents until the complete replacement shell
  exists, preserve open-tab immutable chunks, and serve cached assets immediately.
  Eight-second navigation fallback, coalesced warming and online retry remain.
  Teacher cache71 / learner32; no DB/dependency changes. Native baseline .8 records
  device-install limits and retained offline updates; diagram designs remain valid.

- CRL-2026-11-04.7: one manifest-scoped PWA install controller serves teacher and
  learner buttons. Consume each native prompt once, invoke during the tap, preserve
  newer events and keep browser-tab retry/manual help after rejection/dismissal or
  appinstalled. A 45-second unresolved choice returns to guidance. Hide installation
  controls only in actual standalone display, never from a remembered flag. Keep
  teacher/learner manifest IDs and scopes separate. Profile supplies an in-app retry.
- Teacher SW installation/activation does not wait for shell downloads. PwaRegister
  warms after activation/on reconnect; warm-ups coalesce and fetches time out after
  eight seconds. Preserve old offline documents until current core pages exist,
  then migrate immutable build chunks and remove old caches. This supersedes immediate
  activation-time cleanup; do not regress offline upgrades or touch learner caches.
- Client files use downloadBlob: attached anchor, independent URL per download,
  60-second handoff lifetime, failure cleanup and safe filenames. Keep encryption,
  byte contents and server authorization unchanged. OS Save/launcher placement cannot
  be confirmed from a simulated browser. Teacher cache70 / learner31; no DB changes.
  Native baseline .7 records installation and file handoff; diagram designs remain.

- CRL-2026-11-04.6 supersedes .5's startup skeleton and generic page placeholders.
  Keep AppLoadingScreen logo/progress/status only. Page skeletons belong to the
  section that is fetching: teacher bento overview/menu, selector fields, directory/
  year lists, editable versus teacher-only library, roster/cards, canonical-width
  scoresheet, evidence lists, audit and recovery/report structures. Mirror teacher
  bento breakpoints at 1280/1024/720px, with collapsed Overview on mobile. Root variant
  classes must not reuse inner layout class names. Keep real status labels, dark/
  reduced-motion styling and noninteractive shapes. Existing request ownership and
  genuine failure/Retry from .5 remain. Teacher cache69 / learner30; no DB changes.
  Native baseline .6 describes this presentation; diagram structure/colors remain.

- CRL-2026-11-04.5: administrator overview and list requests own independent loading
  flags; list scope hides prior-tab/filter rows until the current request settles.
  Keep genuine failure/Retry distinct from pending state. Shared DashboardSkeleton
  now renders responsive noninteractive placeholders through WorkspaceLoading,
  teacher startup/data/class/roster/detail loading and administrator workspaces.
  Preserve real startup milestones, dark/reduced-motion support and existing data
  refresh behavior; do not add artificial delays. Teacher cache68 / learner29.
  No DB migration/data correction. Native baseline .5 records skeleton loading;
  diagram actor/entity/business-process relationships and shared styling are unchanged.

- CRL-2026-11-04.4: Classes and Records have independent in-memory teacher,
  year, section, search/sort, pagination and loaded-data contexts. Returning to a tab
  restores its own choices; Back clears only that tab. Keep asynchronous setters
  bound to their owner and key CoordinatorClassWorkspace by tab to isolate forms.
  Do not restore the shared selection. Teacher cache67 / learner29; no DB changes.
  Native design/baseline .4 describe this behavior; diagrams need no structural edit.

- CRL-2026-11-04.3 supersedes .2's indefinite unfinished-host lock. Content editing
  follows a 30-second persisted active/not-recovering teacher presence lease; fresh
  starts get the same short grace. Missing/stale/interrupted presence releases it.
  Do not skip HTTP presence merely because peer acknowledgements are fresh.
- Recovery uses a 24-hour checkpoint window. Preserve explicit End, ownership,
  deleted-learner and saved-review checks. Offline expiry queues End atomically;
  ordinary expiry keeps evidence. Page hide/hidden visibility reports interruption
  best-effort; kill/network failure relies on bounded lease expiry. Offline progress
  and completed-result synchronization retain frozen catalog versions.
- Applied 20261104034130_assessment_activity_lease keeps lease activation/publication
  ordered under advisory key (177631,1), fixed search paths and backend-only invoker
  functions. One abandoned attempt was explicitly purged with all associated results
  at the user's request; do not restore it. Remote cleanup cannot erase disconnected
  device storage. Teacher cache66 / learner29; native baseline .3 and Figures 17/22.

- CRL-2026-11-04.2: teacher Contents is a read-only shared-library viewer with
  passages/questions directly visible, no story dropdown or write controls. Keep
  teacher guides off learner payloads and keep frozen online/offline versions.
- Known unfinished hosts globally lock content editing/publication. Independent
  status checks fail closed without replacing a draft. Start and publish share
  advisory key (177631,1); acquire it before resolving the current start revision.
  Applied migration 20261103172740_library_active_assessment_guard protects heads,
  revisions and host activation. Do not silently expire an unfinished host: a teacher
  must complete or end it. One existing unfinished attempt was preserved at release.
- Offline-only sessions cannot report cloud status while disconnected; immutable
  snapshots protect them until sync. Do not introduce online-only start requirements.
  Teacher cache65 / learner28. Native baseline .2 and Figure 17 explain the lock;
  no use-case actor, entity or declared ERD relationship changed.

- CRL-2026-11-04.1 supersedes .8's inline publication counts/warnings and permanent
  success notice. Incomplete content drafts use a dismissible five-second lower-right
  prompt on navigation/failed saving. Keep the client/server publication gate and
  disabled main Save. Save / Keep editing / Discard remain in the unsaved-work dialog;
  there is no separate toolbar Discard. Optional onSaveError routes only these dialog
  failures to the library prompt; unrelated callers retain their existing feedback.
- Library validation is checked on category, period, coordination tab, main menu,
  installed-app Back and browser unload attempts. Keep native browser unload guards;
  do not replace them with unbounded history entries. Installed Back closes an open
  overlay first; otherwise it guards the draft and returns to Classes, retaining
  teacher/class selection. The scoped event listener and notification timer clean up
  on unmount. Notifications are portaled above overlays and respect safe-area insets.
- Timeline selection is blue, category selection purple and mode selection green.
  Add item / Add story / Import have distinct action colors; retain selected-hover
  exclusion, light/dark contrast and compact-width layouts. Teacher cache64 / learner28.
  No database migration or record rewrite. Native baseline CRL-2026-11-04.1 and Figure
  17 explain the temporary prompt; general use cases/ERDs remain structurally accurate.

- CRL-2026-11-03.8: getAssessmentPublicationIssues is the common client/server
  publication boundary. Fixed needs at least 10/10/2 distinct valid selected
  identities; Random needs complete 10/10/2 pools and no fixed-choice minimum.
  Save is disabled for invalid drafts; imperative/unsaved Save revalidates before
  any API/write. Do not replace the historical run-recovery fallback: old frozen
  attempts retain their behavior and every new run still uses exactly 10/10/2.
- Random has no Default heading/checkboxes. Switching to Fixed exposes retained
  choices and blocks incomplete selections. Admin stories have plain titles and
  Edit; preserve teacher read-only story details. New Random publication prunes
  stale hidden choices rather than fabricating selected defaults.
- Teacher cache63 / learner28. Live published periods were already complete;
  no database correction or migration was needed. Native baseline .8 and Figure
  17 describe the publication gate; use cases/ERD relationships remain accurate.
  Targeted build_library_diagram.py regenerates only the affected activity figure.

- CRL-2026-11-03.7: single-learner archive actions show a selected-record preview,
  without Select all / learner checkboxes. Genuine groups retain selection and
  full-group loading. Restore submits the original single archive ID; expiry,
  password, ownership and destination validation remain server-enforced.
- Archive/Backup dialogs use scoped vertical spacing and separate action footers.
  Preserve this scope rather than changing unrelated ClassDialog overlays. The
  record preview retains server-adjusted time. Teacher cache62 / learner28; no DB
  mutation or migration. Native baseline .7 and Figure 20 note describe this UI;
  existing activity/use-case/ERD semantics and consistent themes remain valid.

- CRL-2026-11-03.6 supersedes combined Recovery/legacy backup controls. Recovery
  opens Archives and Backups cards. Archives has Deleted Learners / Classes pages,
  compact original-teacher lists and separate Restore/Download dialogs. Group
  actions load all available members independently of list pagination. Keep
  destination validation, immutable evidence and the original 30-day deadline.
- All admin deletion reasons are optional (0–300 trimmed characters). Password,
  synchronized-device acknowledgement, active-test checks and atomic archival remain
  required where applicable. Legacy teacher offline proof rules are unchanged.
- Backups contains explicit named snapshots only, never automatic deletion copies.
  Select one/multiple/all teachers; snapshot only active classes and current
  enrollments, full assessment evidence/remarks and referenced revisions. Rename is
  metadata-only; Download is encrypted; Delete affects the saved copy only. No
  Restore, including the backend legacy route. Existing manual 90-day retention
  remains. New snapshots use kind records_backup, stable request UUID/digest and a
  transaction lock. Limit 1,000 learners / 3 MiB encrypted payload; fail without
  truncation and ask for a smaller teacher selection. No account secrets are copied.
- Applied migration 20261103115836_coordinator_backup_metadata adds backup_name,
  backup_teacher_ids and a partial paging index. Existing encrypted snapshots and
  deadlines are preserved. RLS remains backend-only. Keep these additive columns on
  rollback; legacy backup restoration must not process new snapshots.
- Teacher cache61 / learner28. Native baseline .6 updates Figures 15 continuation,
  20 and 23, optional reasons, distinct recovery purposes and Table 8 metadata.
  ERD relationships/use-case goals are unchanged; no new entity or foreign key was
  introduced. PDF QA: 106 pages, 54 TOC destinations, revised pages inspected.

- CRL-2026-11-03.5 supersedes the separate Profile Comparison card. Reading Profile
  Progress includes all/pair controls and percentage/count bars in one card for a
  section or All Sections. Missing periods remain distinct; count ticks are unique
  integers. Preserve period enlargement, full-roster scope and profile colors.
- Coordinator learner confirmation says Delete; password checks and 30-day
  archival remain. Content starts directly beside the number gutter; Default and
  Actions retain aligned columns and compact mobile controls.
- Selected controls retain their resting colors/transforms on hover; unselected
  hover and keyboard focus remain. Preserve hover media queries when editing
  selectors. Teacher cache60 applied to .5; .6 uses cache61. Learner28 is unchanged.
- Native baseline .5 and editable Figure 16 describe the unified progress chart.
  General use cases/ERDs, approved scope and Form 06 remain unchanged. Optimized
  teacher UI QA uses exact built HTML/chunks with synthetic API fixtures; physical
  device and school acceptance require separate evidence.

- CRL-2026-11-03.4: admin content rows/header share centered tracks; blue Edit and
  red Delete. Shared workbook styles apply without a teacher theme attribute.
  Coordinator report scores/remarks remain read-only despite removal of the notice.
- Legacy AdminRecoveryItem has no Prisma teacher relation. Select scalar fields
  and resolve labels by batched User lookup; do not add an artificial relation.
  Failed central archive reads must not masquerade as an empty archive list.
- Audit previews render metadata and shared library items from the immutable
  revision recorded by each event, with 25-item detail pages. Preserve encrypted
  integrity and explicit missing-history states; never substitute current contents.
- Teacher cache59; no DB migration, scoring, offline protocol or learner change.
  Native baseline .4 and Figure 19 updated. Use cases/ERDs remain valid. Synthetic
  responsive/UI and route tests do not establish physical-device acceptance.

- CRL-2026-11-03.3: school-year editor validation uses local yearError and clears
  on close/reopen; year success updates leave no inline page message. Keep
  genuine page/load errors separate and retain duplicate/deletion enforcement.
- Profile Comparison uses responsive grouped horizontal SVG bars for each reading
  profile and selected timeline, with one integer count scale and assessed totals.
  Not assessed differs from a recorded zero; no missing-period negative deltas.
  All Sections still renders only its year-wide graph. Cache58; no data model or
  assessment/offline protocol change.
- Main capstone baseline .3 and Figure 16 reflect chart presentation and scoped
  validation. General use cases/ERDs and approved scope remain valid; Form 06
  untouched. Keep functional browser QA distinct from physical/school validation.


- CRL-2026-11-03.2 supersedes combined Add section/import and report navigation.
  Named-only Add new section is right-aligned with Rename/Delete; optional section
  reason retains password/sync/archive safeguards. Year/learner reasons remain.
- Coordinator Records has the same teacher directory/class dropdowns and shared
  Scoresheet/Class Summary/Class Record renderer/model, all periods, Print/Export.
  Scores and remarks are read-only; export teacher_id requires coordinator auth.
- Classes has batch Add learner with immediate cross-class LRN checks and separate
  SF1/class-record Import. Final server batch is atomic, owner/class/version locked,
  name/LRN validated and idempotent via the existing encrypted audit receipt.
  No schema migration; live unique indexes were verified. Teacher cache57.
- Main capstone baseline .2 and Figures 15/15 continuation/16/23 reflect this split.
  General use cases and ERDs need no relationship change; Form 06 remains untouched.
  Physical-device and field acceptance evidence remains distinct from synthetic QA.

Earlier decisions below are retained for history; .2 supersedes contradictory
Add section/import and Classes-report descriptions.


- CRL-2026-11-03.1 supersedes the year/section cards and class Archives controls.
  Coordinator Classes uses top dropdowns and teacher-style roster columns/filters.
  Add section combines optional import atomically; coordinator cannot Start.
- Main Recovery centralizes owner-labelled year/section/learner archives and
  archive-file import. Preserve original teacher, 30-day deadlines, manual
  indefinite backups, selective restore, download, purge and retry receipts.
- Advisory-lock raw queries must cast void to text for Prisma. Applied/mirrored
  migration 20261102171106 indexes Recovery and excludes purged year backups from
  uniqueness. Reuse unpurged encrypted evidence; never extend an existing expiry.
- Shared dialogs have fixed opaque headers and independent scrolling. Full-width
  selection cards have descriptions. Empty-year/unassessed notices are explicit.
  Profile photo selection opens a crop preview before normalized authenticated
  upload. Teacher cache56/learner28, no scoring/learner protocol change.
- Capstone baseline .1 and editable Figures 14/15/23 reflect these changes; no new
  entities/relationships or approved objective/scope change. Form 06 untouched.
  Distinguish browser/synthetic tests from physical hotspot and school acceptance.
- Workspace resets erased two unpublished versions. Recovery branch stores source
  patches and restoration scripts; do not rely on scratch for unfinished work.


- CRL-2026-11-02.1 supersedes .3 navigation and period-story defaults. Coordination
  has School Year / Classes / Assessment Contents. School Year lists/adds/deletes
  global definitions; Classes begins with searchable/sorted teacher cards and
  optional photos/initials, then teacher year cards and sections. Teacher Contents
  has no class controls. Conduct/Records/Analytics keep horizontal class controls.
- All three timelines currently use the original Para the Parrot and A Day in
  the Fields (100 words, six guides each), restored from canonical repo sources.
  Actual migration 20261102135718 repaired incomplete centralization by creating
  immutable version-2 heads, preserving all prior revisions and host references.
  Later coordinator saves, including modes/defaults, drive new attempts online
  and from matching downloaded offline versions. Do not reinsert placeholder or
  custom-story defaults; do not substitute materials in an existing attempt.
- Library dialogs retain local drafts; Save publishes, Keep editing retains and
  Discard abandons only the unsaved draft. Explicit top Save follows local item
  saves; import uses drag/drop/browse and plain-text/word-block story editing.
- Global-year deletion is coordinator-only and atomic across affected teachers.
  Nonempty deletion requires password/reason/ack; empty deletion requires a
  secondary confirmation. Deleted class archives keep 30 days. Deleted global
  definitions are excluded from new-teacher provisioning; re-adding provisions
  fresh owned rows without reviving removed learners.
- Audit events are permanently erased after seven elapsed days, replacing the
  former 180-day policy. API reads filter/purge and private cron runs each minute.
  Stable keyset pages start with ten and load ten more. Archive/backup retention
  is separate. Own-account profile photos are normalized server-side to 256px
  metadata-free JPEG. Optional users.profile_photo is not a new storage bucket.
- Main capstone .1 updated 16 paragraphs and Figures 12/15/19/26 continuation,
  preserving approved objectives/scope, consistent colors/editable sources,
  justified notes and 106-page TOC positions. Repeated original passages do not
  establish alternate-form equivalence or independent reading growth. Form 06
  was untouched. Keep physical hotspot and school acceptance claims separate.

### Previous .3 baseline (read with the superseding decisions above)

- CRL-2026-11-01.3 supersedes activation, teacher enrollment/Archives and separate
  coordinator review/report panels from .2. Only the Reading Coordinator manages
  class enrollment, import, selection, deletion and Archives. Teachers retain
  search/filter, eligible timeline choice, assessment, read-only contents/results,
  remarks, printing and export. Results have a wide responsive X-close dialog.
- Teacher class controls run horizontally above Conduct/Records/Contents/Analytics.
  Coordinator Classes begins with shared years and a searchable, sorted, paginated
  teacher list. Its selected teacher/section contains both enrollment and read-only
  assessment reports. Shared library controls are aligned, with explicit Save and
  unchanged 100-word/six-guide validation and immutable versions.
- GlobalSchoolYear and database triggers provision the same definitions for all
  existing and future teachers; owned SchoolYear IDs remain stable. Applied and
  mirrored migration: 20261101140448. Section ownership, score evidence, retention,
  CAS publication and ordered sync remain. Imported year backups can add a shared
  definition within the existing checked transaction; they do not overwrite classes.
- AssessmentWindow and CoordinatorChangeRequest remain compatibility storage;
  active-period and pending-review UI/API operations are retired. Any eligible
  timeline can start online or from cached shared materials. All-period grants
  and explicit revision IDs keep offline runs stable after library updates.
  Old class drafts alias only assigned containers; old enrollment writes can only
  match coordinator-enrolled identities. Retain unresolved journals and encrypted
  drafts, never auto-publish teacher drafts or recreate deleted learners.
- Coordinator password approval occurs outside archive transactions so failed
  checks retain the existing seven-attempt account lockout counters. The transaction
  rechecks the current coordinator role/password stamp. Teacher mutation/archive
  reads are denied or empty even through direct API/offline calls.
- Capstone .3: Chapters 1–3 and ten affected figures now match global years,
  coordinator enrollment/Archives and teacher timeline choice. Editable sources and
  consistent colors/endpoints are preserved. No objective/scope or Form 06 change.
  Existing TOC page numbers still match the exported 106-page document. Physical
  tablet/hotspot testing remains separate from synthetic browser and regression QA.

### Superseded .2 decisions (historical context)

- CRL-2026-11-01.2 supersedes teacher class/content management and teacher-chosen
  assessment periods. Admin means Reading Coordinator; its separate scoped
  session and current DB role are mandatory. Class ownership stays per teacher.
  Only the coordinator manages year/section containers and their archives.
  Duplicate active years or section names produce 409 prompts; exact same
  operation IDs remain idempotent. Teachers manage their learners and learner
  archives, conduct the active assessment, view shared contents/results, edit
  remarks, print and export. Coordinator section reports are read-only.
- AssessmentWindow is global by startYear. Migration activated no periods.
  Coordinator must use Coordination > Assessment periods before new starts.
  Running assessments retain their period after later activation. Shared library
  revisions are immutable JSON snapshots; CAS heads reject stale publication.
  HostSession.catalogRevisionId binds each new run. Original teacher catalogs
  remain for legacy sessions and historical recovery, not current publication.
  Teacher/administrator archives retain host story/version metadata; restoration
  creates an ended report host. Detailed results read the original full version
  by title rather than drawing a new random set using the restoration code.
- Offline preparation caches signed teacher/year/period/version authority and
  matching copies indexed by revision ID. Current online starts enforce the DB
  window. Offline replay accepts its previously authorized period/version after
  subsequent changes, using stable year identity even after a label rename.
  A disconnected device cannot receive instant policy updates. Never expire a
  pending result solely because upload was delayed. Keep snapshots, timer and
  review checkpoints, ordered response journals, ownership and prerequisites.
- CoordinatorChangeRequest preserves whitelisted encrypted legacy proposals under
  stable teacher/outbox keys. Pending/declined entries keep dependent work locally.
  Coordinator can reconsider declined requests. Approved creation collisions may
  explicitly alias a provisional class ID to an existing owned class; runtime
  reconciles queued bodies, local learners and host references atomically.
  Do not silently apply new teacher management writes or discard old drafts.
- Teacher Conduct/Records/Analytics and content viewing use in-page dropdowns.
  Conduct View opens detailed results, including empty results for unassessed
  learners. Analytics keeps aggregate comparisons and a graph-only All Sections
  view. Historical report period filters do not activate/start periods. Teacher
  archive restoration requires an existing assigned destination and cannot
  create school-year or section containers. Password, reason, atomic archival
  and 30-day deletion expiry remain. Coordinator class deletion verifies the
  coordinator's own password, never the teacher's.
- Server-only RLS tables and additive migration are mirrored in both migration
  directories. Actual Supabase migration version: 20261101095746. Preserve all
  legacy catalogs and assessment evidence. No environment secrets are new.
- Native Chapters 1–3 were revised in place, with general distinct actors,
  consistent colored activities, version-policy ERD continuation and updated TOC.
  Future statements became past-tense protocol descriptions without manufactured
  validation results. Objectives/scope remain, including exclusion of AI and
  remediation. Editable sources live in docs/diagrams/class-workspaces; use
  build_coordinator_diagrams.py instead of rerunning the obsolete bulk generator.
  This revision did not touch Form 06. Physical-device claims need actual evidence.


- Deleted-item retention (CRL-2026-11-01.1): Deletion archives expire 30 days
  after authoritative cloud archival, with ceil(remaining milliseconds/day) labels.
  Pending offline removal gets its full window after sync. Manual completed-class
  archives remain indefinite. Server time plus its client receipt timestamp assists
  the display; server checks, not device clocks, enforce availability. Automatic
  erasure uses a private pg_cron function every minute and skip-locked batches.
  Expired restore/download requests are denied even before a cleanup pass.
  Retain minimal purged rows as retry/restore receipts, clearing actual ciphertext
  and display labels. Matching per-learner administrative recovery IDs are erased
  too. Deletion audit stores metadata rather than full assessment copies.
  Year archives now reference memberArchiveIds; exports assemble complete version-1
  files. Never preserve an embedded hidden section copy after child removal.
  Permanent year removal erases linked section backups atomically, with account
  password, ownership and roster checks. Independently downloaded files remain
  importable under original ownership/integrity/roster/restore-receipt checks.
  Direct restore rechecks the source and year members under transaction locks;
  a concurrent removal cannot restore a stale captured member. Preserve current
  scoring and offline journal behavior. Applied SQL is mirrored in Supabase and
  Prisma migrations. Do not roll archive handling back to a server that expects
  embedded year snapshots. Chapter 3, Figure 23 continuation and selected-key
  Figure 24 describe these fields and lifecycle; objectives/scope are unchanged.

- Password deletion (CRL-2026-10-31.1): Supersedes typed first-name/bulk and
  nonempty-class deletion phrases. Learners require password + reason; nonempty
  years/sections also retain synchronized-devices acknowledgement. Empty containers
  keep secondary confirmation, checked under locks. Manual Archive keeps its own
  phrase. Server requireDeletionPassword uses existing account counters; deletion
  proofs use a separate-purpose JWT-derived secret, P-256 signature and current
  password-hash stamp. Verify exact ID/LRN/action/reason/roster/nonce before archive
  writes. Certificate expiry is 30 days. Client encrypted private key preparation
  is optional at password login and cannot grant a session or bypass 2FA. Keep
  passwords out of journal/archive/audit; teacherOfflineDb rejects password fields.
  Offline learner removal requires prior online preparation. Existing pending
  deletions, expired approvals and provisional-ID remapping require fresh password
  confirmation in the teacher-menu sync prompt. Never discard their journals.
  updatePendingDeletionProofs patches existing entries only, preserving ordering
  and canonical IDs without resurrecting acknowledgements. Offline failure counters
  are local to a device; server rechecks current lock/password on sync. Class
  deletion still requires cloud connectivity. No schema migration or new package.
  Synthetic crypto + actual browser/IndexedDB tests accompany the existing archive
  rollback and offline assessment checks. Main Chapter 3 and editable Figures
  11/15/23 describe password approval; approved scope/objectives/ERDs unchanged.

- Explicit timeline/atomic saves (CRL-2026-10-30.1): A ready peer link never
  selects a timeline. Start opens the learner chooser with no selected period;
  an explicit eligible radio choice enables Start Assessment. This supersedes
  automatic next-period preselection. Keep the dialog mounted and busy through
  startup; cancellation is guarded synchronously. Failed starts retain it for
  retry, and the dashboard rejects mismatched/cancelled/duplicate requests while
  rechecking eligibility. Keep cloud primary when reachable and preserve paired
  in-page assessment navigation. OfflineRuntime now uses enqueueOfflineMutation
  to commit host/checkpoint + journal together for starts and queued stage/answer
  updates. Final review also passes the complete teacher snapshot, serialized by
  updateSnapshot, into that same transaction. Do not publish completion or advance
  a stored host before its journal is durable. The optional snapshot is restricted
  to owned completed final-review writes; host_start ownership uses offline_code.
  No schema/version change is required. Startup callbacks, injected write failures,
  period isolation, ordered replay and actual browser local saves are covered by
  the release checks. Physical hotspot/native RTC acceptance remains separate.
  Main-capstone eligibility and acknowledged-journal descriptions already apply;
  no objective/scope or diagram changes are implied.

- Offline stage positions (CRL-2026-10-29.1): A last-letter durable response
  used to carry index 9 into Word 1, making subsequent true word updates look
  stale. Offline advances now update item_index and itemIndex together; Letter
  -> Word resets to zero. normalizeAssessmentItemPosition reconciles only the
  run's own known, unambiguous content, retaining valid explicit repeated-item
  positions. OfflineRuntime uses it for read/recovery/mutation projections and
  the learner applies it to incoming/current offline state before stale guards.
  Do not globally weaken regressive-state checks or reconstruct positions from
  fallback pools. Read repair must not queue answers or change scores. Preserve
  late persist_only semantics, checkpoints, nonce presence and ordered journals.
  The helper lives in assessmentLearnerItems and is re-exported by assessmentContent;
  learner code must not import the teacher's default story/answer catalogue.
  Peer tests now use real item_index aliases rather than current_item_index.
  verify-offline-stage-browser.cjs is optional real-UI/IndexedDB/BroadcastChannel
  integration with blocked cloud HTTP. It passed the last letter, all ten words,
  timed passage, six questions, rating and return to code entry, retaining local
  answers/outbox and live nonce presence beyond timeout. Peer/RTC doubles cover
  separate contexts. The browser fixture must include the same story available
  flags as getOfflineAssessmentContent; await durable writes between actions.
  This environment cannot gather native ICE candidates, so physical LAN/WebRTC
  validation remains separate. No database or approved capstone flow changes.

- Header/chooser polish (CRL-2026-10-28.10): Mobile roster actions have 12px
  top padding inside the existing native sticky slot. Do not move the gap into
  scroll-tracked positioning. Records chooser actions alone use equal-width
  grid tracks with stretched heights and mobile minimum 60px targets. Section
  editing is labelled Rename in menus/dialog titles in Conduct and Records;
  internal edit keys/validation are unchanged. The reports choice question now
  lives in its top toolbar next to Close, retaining the same accessible ID and
  mounted draft forms. Mobile main-menu logo/logout/theme controls share a
  centered row and 44px boxes. Existing browser QA covers actual header geometry,
  sticky scrolling/gap and synthetic chooser/report interactions. No schema,
  scoring, approved objective or documentation diagram change is implied.

- Spacing refinements (CRL-2026-10-28.9): Overview preview columns/cells are
  centered with real outer padding; status checks wrap centrally. Mobile Overview
  header is 64px tall; main menu/Overview labels use medium Arial weight 500.
  Content selectors now center as a pair on wide screens; period controls are
  above category controls at <=640px. This supersedes 28.7's opposing-edge layout.
  Remove only the visible Item selection period pill, retaining accessible scope.
  Import/Add Story/Save share one ordered action group; on narrow Stories it is
  below the heading, superseding 28.7's Import-alongside-heading layout. Existing
  verification scripts check these geometries and original callbacks. No schema,
  assessment workflow, approved objectives or capstone diagram changes are needed.

- Main menu (CRL-2026-10-28.8): Home is labelled Overview. Mobile uses one
  full-width native button with a shaftless chevron and CSS 0fr/1fr disclosure;
  no height measurement, timers or scroll effects. Above 720px the body is always
  visible; do not aria-hide the body based only on the mobile state. The Latest
  Learner Update preview is Name + Assessment Status, with completed-period checks
  and an explicit Not assessed state. No LRN, sex or profile column in this short
  preview; preserve the existing recent-five selector and full-roster statistics.
  TeacherMenuIcon supplies matching, dependency-free SVGs. Stacked Arial labels
  and original full accessible names/IDs preserve navigation and report behavior.
  verify-main-menu.cjs exercises real JSX callbacks; optional --browser checks
  expansion/interactions/layout at nine widths in both themes with synthetic data.
  No schema, scoring, objective, workflow or capstone diagram revision is implied.

- Assessment Contents presentation (CRL-2026-10-28.7): The activities tab/menu is
  labelled Assessment Contents; retain its existing activities IDs and data keys.
  There is no repeated main-panel title. Categories and periods share one row
  above 640px; phones stack equal-width selector groups. Per-category h2 headings
  align with actions; Add/Save remain adjacent, with a deliberate second action
  row for narrow Stories import controls. Keep 44px actions and Arial labels.
  verify-assessment-content-layout.cjs renders the actual JSX and tests callbacks;
  optional --browser mode checks real dashboard CSS at seven widths, light/dark.
  No schema, workflow or scoring change is implied by this label/layout change.
  The main capstone has no exact old menu label and needs no text/ERD revision.

- First-frame startup (CRL-2026-10-28.6): PolicyConsentGate must show the same
  public startup loader while consent is pending on teacher routes. Its old blank
  SSR placeholder hid the 28.5 screen before hydration. Do not bypass the gate:
  protected children remain withheld until consent is valid; denied consent still
  redirects immediately. The initial count is zero with a privacy-check message,
  then recovery advances its real work as before. Learner/login pending views are
  unchanged. Preserve this boundary when modifying startup rendering.

- Startup screen (CRL-2026-10-28.5): TeacherAssessmentRecovery owns the single
  visible startup loader. AppLoadingScreen is now presentation driven by completed
  recovery checks (0..4) and a phase message, with the existing CRL-App logo. A null
  count means indeterminate return navigation. Do not introduce an elapsed-time
  progress pump, minimum display duration or completion hold. The gate is the
  existing checked/finally/pathname flow, not window.load or an independent timer.
  Preserve the six-second network deadlines, valid offline fallback, authorization,
  owner/deletion/final-save guards and paused recovery semantics. The logo must
  remain in the main worker APP_SHELL. Theme styling is local to the loader, with
  reduced motion and readable branding; it does not rewrite theme preferences.
  verify-startup-loader.cjs executes actual startup effects with deferred IO;
  verify-startup-loader-browser.cjs optionally compiles real components with
  controlled synthetic IO (320/390/800/1280/1440, light/dark). Browser QA requires
  a working Chromium with its rendering libraries, and does not establish physical
  installed-device behavior. No schema, approved scope or diagram change is needed.

- Native roster selection (CRL-2026-10-28.4): The phone video exposed lag in
  28.3's JavaScript-tracked body portal. Mobile actions now stay after the filters
  as a direct child of the long Conduct panel and use native sticky/safe-area top
  positioning. Conduct-only mobile overflow must stay visible through the page
  ancestors so the sticky bar can reach the actual scroller. Wide tables keep
  local horizontal scrolling. Do not reintroduce per-scroll getBoundingClientRect,
  fixed coordinates, measured placeholders or body portals. Desktop reuses one
  action group in the original toolbar via a breakpoint-only portal. Keep
  selection/counts, deletion confirmation, suspension and mobile 44px controls.
  Optional verify-roster-sticky-browser.cjs uses the actual component/dashboard
  CSS with synthetic data; Chromium verified rapid jumps/touch gestures and
  light/dark widths 320/390/768/1024/1440. Browser fixture tests do not prove physical
  phone/MatePad or real authenticated assessment acceptance. No schema or capstone
  diagram change is required for this presentation correction.

- Text policy (CRL-2026-10-28.3, retained): Enrolled rows have no hover background;
  selected rows use the same subtle surface before/after hover. Shared
  AppTextSelectionGuard applies in teacher routes and every learner display mode,
  superseding installed-only protection. Code markers and editable fields remain
  selectable/copyable. Never block file drops, paste or passage contextmenu events:
  right-click disarms armed miscue hotkeys. Other view text cannot be highlighted/
  copied. This is a UI policy; authorization and data protection are unchanged.

- Start/Conduct polish (CRL-2026-10-28.2): ClassDialog and dashboard busy/analytics
  use pageScrollLock.mjs. Independent overflow snapshots caused a layout/passive
  cleanup race after cancelling Start. Shared ownership restores original styles
  and scroll only when the final owner releases, regardless of cleanup order.
  Do not add a second independent lock for the confirmation. The roster header
  now combines Back/centered context/Refresh in one compact symmetric row; desktop
  cells/headings/actions center together and phone labelled cards remain intact.
  This is presentation/lifecycle maintenance, requiring no schema, capstone text
  or diagram change. Actual effect tests cover cancellation and busy handover;
  browser and physical-device visual acceptance remain separate.

- Roster/navigation/comparison (CRL-2026-10-28.1): Internal arrow-only Back
  controls move class -> sections -> years; the topbar returns to the main menu.
  Keep the shared dirty-remarks guard and PWA classBack path. Roster cells now
  separate names, display a derived middle initial and optional suffix, and use
  bordered 44-pixel actions; phone labels must stay aligned with all nine cells.
  Never replace full stored names with derived initials. Existing nullable
  middle_name/suffix and initial-aware parsers need no schema migration; missing
  fields remain empty and no full name is fabricated. Compare profile count
  deltas only across periods with completed assessment data; measured zeros and
  absent periods are different. Native Chapter 3 has scoped clarifications;
  unchanged relationships/nullable fields require no ERD redraw. No objectives
  or scoring rules change. Automated render/build tests do not establish physical
  tablet, browser or LAN acceptance.

- Records and learner identity (CRL-2026-10-26.2): The selected Records class
  header owns the shared Conduct class-record Import control, with no second
  toolbar import. Backup imports remain separate in chooser/options paths. Use
  stacked School Year and Section labels and the balanced compact header style.
  Teacher-wide LRN and normalized full-name indexes now supersede per-section
  identity duplication, including archived enrollments. All manual/import/offline
  paths must inspect the full teacher roster; do not filter duplicate detection
  to the selected class. Retain middle names and suffixes in identity keys, with
  NFKC/case/whitespace normalization. Other teacher accounts remain isolated.
  Restoring a backup whose identity still exists must fail without partial writes;
  backups remain available. No existing learners were removed by this release.
  Migration 20261026143944 records both unique indexes; preserve them on rollback.
  For capstone documentation, this changes the enrollment uniqueness constraint,
  not the assessment rules or approved objectives. Browser/device QA is separate.

- Assessment completion and explicit restoration (CRL-2026-10-26.1): Suppress
  only synchronization presentation during route and embedded assessments; never
  pause persistence/outbox processing. Learner terminal packets use a one-shot
  three-second effort-based message at early stop or teacher review, independent
  of teacher final save. Do not restart its timer from polling. Rating replays
  after review/completion acknowledge the existing matching rating without
  rewriting older evidence. Keep the short owned-host write lock shared with
  final review; scoring calculation remains outside it. Final review is locked
  against background scroll/dismissal, and timeout confirmation requires an
  explicitly selected passage word. Existing scoring rules remain unchanged.
  Archive import is scoped to the chooser level, with per-file independent atomic
  commits and visible failures. Group IDs classify new multi-learner deletions;
  each member retains its encrypted backup. Explicit selective restoration into
  an active chosen class appends rather than overwrites, validates duplicate LRNs,
  and records per-archive receipts atomically. This supersedes only the old
  empty-section-only restriction for individually deleted learner backups.
  Year/section whole backups still require empty destinations. Preserve owner,
  roster-reset, read-only, tamper and pending-sync guards. Older ungrouped entries
  stay individual. Migration 20261026124644 is additive retained metadata, not
  cascading foreign keys. No old deleted learners are recovered automatically.
  Browser visual QA was unavailable due truncated browser downloads; automated
  handler, component-render and complete build/regression checks passed. Physical
  device acceptance remains separate. Capstone implications: effort-based learner
  closure, quiet background sync and explicit selective archive restoration;
  approved objectives/scope do not change.

- School-year bundles and Records roster import (CRL-2026-10-25.5): Archives
  distinguishes `school_year`, `section` and `learner`. A year operation keeps
  independently usable section snapshots plus one encrypted School Year bundle.
  `sourceSchoolYearId` and `sourceSectionId` are retained metadata, not cascading
  relations. `sectionCount` belongs to year entries. Unique teacher/source-year
  metadata prevents duplicate bundles. An empty active year can explicitly import
  its owner's original bundle, reconstructing separate sections and evidence.
  `SchoolYear.restoredArchiveId` acknowledges retries without duplicate enrollment.
  Preserve owner, roster epoch, emptiness, active-test, transaction and sync guards.
  Existing archived years without a bundle may use Archive again; do not silently
  reconstruct already-deleted classes. A 3 MiB sealed year-bundle limit protects
  hosted request/response bounds; oversized operations retain all source records
  and section backups must be used separately. The applied migration is
  `20261025134013_school_year_archive_bundles`. Do not roll its kind check back
  over retained year entries. No production record rewrite or fixture creation.
  Records and Conduct mount the same ClassRecordImport with the selected class
  and roster epoch, then reload the same roster. Imported enrollments have blank
  unassessed results, never invented zero scores. Read-only classes reject import.
  Both parsers prefer distinct first/last-name columns over accidental combined
  header matches. Combined-name files remain supported. JSZip's legacy stream
  must be wrapped in Node Readable for bounded async XLSX entry inspection.
  `verify-class-record-import.cjs` executes both real parsers for CSV/XLSX/XLS.
  Capstone Chapter 3 and editable Figures 6/8/16/23/24 reflect the change; Figure 8
  matches the established solid swimlane theme. Objectives, scope, actors and
  CRLA scoring rules are unchanged. Verification used actual built teacher pages
  and actual server importer/class-workspace helpers against isolated synthetic
  storage at 1440/768/390/320px, light/dark. CSV imports appeared in Records and
  Conduct, all enrolled report views refreshed, year archival produced an encrypted
  entry and imports became disabled in the archived class. No production fixture
  records were created. Native Google Doc readback retains Figures 1-26, justified
  notes and its heading hierarchy. Exported PDF QA confirms 105 pages, all five
  updated figures with their notes, and unchanged page locations for all 55
  headings, so the existing table of contents needs no page-number changes.
  Physical-device acceptance remains separate from these automated checks.

- Teacher join/presence coordination (CRL-2026-10-25.4) completes the server-side
  entry work from 25.1. Do not put teacher host_get back on the 1.8s generic GET
  deadline; a mirrored waiting host is not cloud join authority. Use 15s with
  immediate offline-event abort and the genuinely one-row owned lean projection.
  Preserve omitted journals/metrics/content in the client. First connected claims
  must escape a future-dated cached waiting snapshot without weakening subsequent
  item/stage monotonicity. The HTTP presence fallback uses fresh expiring nonces
  and one-use ACKs via an independent private assessment_presence table; ordinary
  status/poll success or stored connected flags are NOT live presence proof.
  Direct/realtime packets remain primary, pure offline uses only the direct link,
  and HTTP presence never enters persistence/outbox replay. Keep live interruption
  detection and recovered passage pause/acknowledgement safeguards. The applied
  migration is 20261025070254_assessment_presence_relay, additive with RLS and no
  public grants. Never update HostSession.updated_at, stage, timers or scores for
  liveness. For capstone implementation documentation, the optional one-to-one
  HostSession presence relation supports the existing recovery workflow and adds
  no new assessment task. Physical LAN testing remains separate; this environment
  had no native ICE route. SQL/HTTP/browser tests use isolated synthetic fixtures,
  not production learner/account creation.

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
