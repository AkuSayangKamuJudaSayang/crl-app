# Chapter 3 class workspace diagrams

Current release: CRL-2026-11-06.3. The school-role separation is deployed.
Figures 7 and 19 now include school-specific platform activity review and named
invitation redemption. Figure 26 (continued) includes audit school/name snapshots;
actor/teacher and school routing snapshots are application references, not new
foreign keys. Its declared account/library keys remain unchanged. Use the common
Arial type, blue/purple/green activity lanes, yellow decisions and existing ERD
entity headers. Run the school-role generator last; do not replace figures with
unrelated styles. Assets contain synthetic labels only, never credentials.

Older notes below are historical; read current release/handoff first.

CRL-2026-10-25.5. These diagrams describe the implemented teacher-led Grade 3
assessment workflow. They do not change the adopted scoring decision tree.

Each figure has an editable diagrams.net `.drawio` file, an editable vector
`.svg`, and a high-resolution `.png` for Google Docs. Open a `.drawio` file in
https://app.diagrams.net/ and edit its shapes, connectors, text and colors.
The `.drawio` files contain diagram objects, not flattened screenshots.

`manifest.json` maps the final figure numbers to the files. Figure 23 adds the
section archive/import activity inside section 3.3.3. The three existing ER
figures consequently become Figures 24, 25 and 26; Figure 25's assessment-evidence
model is unchanged. Other unaffected diagrams retain their numbering.

## Rebuild

Run `python docs/diagrams/class-workspaces/build_diagrams.py` to produce SVG and
diagrams.net files from shared geometry. Rasterize the SVG files with the
repository's installed Sharp at density 144. Editing a generated file directly
is supported, but do not run the generator afterward unless those edits have
also been transferred to the source. No learner data or production credentials
are included.

## Model boundaries

- SchoolYear belongs to one teacher. ClassSection references SchoolYear and
  teacher together. Learner is a class enrollment, with uniqueness on class +
  LRN; the same child can have separate enrollments in another class/year.
- Learner references ClassSection and teacher together. AssessmentSession
  references its learner and teacher. Existing task/evidence/metrics relations
  remain in Figure 25 and the Prisma schema.
- ClassArchive belongs to its teacher. Its source section identifier is retained
  metadata, deliberately not a foreign key: deleting source learners must not
  delete the manually retained encrypted archive.
- Figure 26 is a selected-key view of account administration. Invite issuer and
  redeemer are separate nullable user foreign keys. Unlock requester is required;
  resolving administrator is nullable. AssessmentContent belongs to its teacher.
- The deployed database retains the nullable legacy HostSession ->
  AssessmentContent foreign key. Its other declared links are required teacher,
  nullable learner and nullable AssessmentSession. Figure 26 labels its host box
  as a selected view rather than implying these other keys do not exist.
- Crow's-foot notation uses a double bar for exactly one, a circle and bar for
  zero or one, and a circle and fork for zero or many. Numeric multiplicities are
  intentionally omitted.
- Activities show human-level responsibilities, colored swimlanes, visible
  decision borders and separate branch labels. A final node ends the depicted
  path, including rejection/retained-local-work paths, rather than promising
  that an assessment or synchronization has succeeded.

The authoritative physical schema remains the migrations and live declared
foreign keys. Archives require reachable cloud service and an empty active
destination class; assessment/roster/remarks work retains ordered offline sync.

CRL-2026-10-25.5 adds School Year bundles alongside Section and Learner
archives. Figure 6 names year archives, Figure 16 includes Records class-record
import, Figure 23 includes the year bundle and empty-year/section destinations,
and Figure 24 includes nullable retained source year/section metadata and section
count. SchoolYear also has a nullable restore marker, omitted from the selected
key view. The original year backup reconstructs separate classes once inside an
empty active year. These retained identifiers are not foreign keys. Figure 8
uses the established solid blue/purple/green swimlane theme with white actions,
yellow decisions and unchanged assessment rules. Native Chapter 3 retains all
26 figure numbers and justified notes. Later behavior supersedes older notes
below that describe year operations only as individual section backups.

## Class menu refinement

Figures 15, 23 and 24 reflect chronological vertical menus, top-left Back,
records-only Archives, and confirmed year/section archive-before-delete. Year
operations retain one authenticated snapshot per section. Lifecycle tombstones
prevent stale offline work from recreating deleted containers. Active years and
section names use partial unique SQL indexes; historical deleted identifiers are
retained and must never be reused. Empty sections remain valid archive payloads.
Teacher-level section input is removed without erasing old compatibility data.

CRL-2026-10-24.3 supersedes universal typed container deletion: an empty year
(no remaining sections) or empty section (no enrolled learners) uses secondary
confirmation only. The server verifies emptiness under locks. Nonempty class
containers retain phrase, reason and synchronization confirmation. Empty deletion
creates no empty backup and preserves existing archives. Figure 23 includes the
separate empty branch. Figure 15 shows one encrypted teacher archive per deleted
learner before any source removal, including bulk deletions. Archives are labeled
Section or Learner; pending offline learner archives are metadata only until cloud
acknowledgement. Figure 24 includes archive kind, nullable retained learner ID and
learner name. A retained source ID is not a foreign key. Import remains explicit,
teacher-owned and limited to an empty active destination; sync never restores a
deleted enrollment automatically. The older Saved offline items feature remains
removed. Only new explicitly requested deletions produce the new learner archives.

CRL-2026-10-24.4 applies the compact school-year/section selector to Analytics,
not Manage Assessment. Figure 6 names class Analytics. Figure 16 separates its
read-only charts/comparison/evidence path from Records remarks and exports. Class
context is independent of Conduct/Records; enrollment IDs prevent repeated names
or LRNs from mixing years or sections. No ERD/schema change is needed. No add,
edit, delete or archive action is available in the Analytics chooser.

CRL-2026-10-24.5 supersedes the paired Analytics dropdowns with the same
school-year-first, section-second vertical selection used in Conduct and Records.
The existing top-left Back moves one level at a time. Figure 16 now includes an
explicit All Sections decision: one combined reading-profile graph for the chosen
year, with no learner list, result panel or comparison table. Individual sections
retain their class charts, comparisons and evidence. Aggregation uses owned,
nondeleted section enrollment IDs within one year, including read-only archived
classes; it never combines years or treats empty selection as All Sections.
No schema or ERD change is required. Sources, SVG and PNG share the same geometry.

CRL-2026-10-24.6 clarifies assessment entry in Figure 8: scanning the teacher's
assessment QR or entering its six-character code goes directly to the online
join and current task when service is reachable. An embedded pairing offer does
not force Offline Mode Settings; the existing offline exchange remains a fallback
when the network is unavailable. Only the learner entry node changes; scoring,
period eligibility, task progression and storage paths remain as diagrammed.
No database/ERD change is needed. Figures 9 and 10 retain the offline exchange
and transport-health flows.

CRL-2026-10-25.1 repairs implementation of the already diagrammed actions:
Figure 8's online QR/code entry returns the configured first item, Figure 15's
learner deletion requires explicit confirmation, Figure 16's class reports use
bounded row/column viewports, and Figure 22's recovery choice is centered. The
public API path and renderer changes add no human-level process, actor, entity
or relationship. Diagram geometry and figure numbering remain unchanged; the
corresponding Chapter 3 narrative and evaluation conditions are updated.

CRL-2026-10-31.1 supersedes deletion phrases in Figures 11, 15 and 23 with
account-password authorization. Reasons, encrypted archives and synchronization
checks remain; empty containers still use secondary confirmation. Manual Archive
retains its archive phrase. Figure 11 includes pending-password reauthorization.
These three sources use the current native Chapter 3 palette (blue/purple/green
lanes, white processes, yellow decisions, navy solid arrowheads, Arial). Figure
23 is 1000 by 1320 with separate empty-delete routing and a failed-confirmation
branch. Export it at 500pt high without cropping. No entity or relationship changes
are introduced. Main-document export remains 104 pages, with Figures 11/15/23 on
PDF pages 59/65/74; notes remain justified and figure paragraph indents preserved.

CRL-2026-11-01.1 adds `figure-23b-archive-retention` as Figure 23 (continued)
in Activity Diagrams, before 3.3.4. It covers the 30-day deadline, days-only
labels, restore/download validation and password-confirmed permanent erasure.
Manual archives are outside the automatic deadline; pending offline deletion
starts retention after cloud archival. Figure 24 retains the current native ERD
palette and crow's feet while adding retention timestamps, section references,
and the current teacher-wide learner identity constraint. No numeric cardinality
legend is reintroduced. `build_retention_diagrams.py` regenerates only these two
editable SVG/drawio assets; rasterize at density 144 with Sharp. The original
bulk generator has older geometry for Figure 24 and must not overwrite this revision.


CRL-2026-11-01.2: build_coordinator_diagrams.py supersedes the old bulk generator
for Figures 4, 6, 7, 8, 12, 15, 16, 17 and 23, and the Figure 15 learner and Figure
26 policy ERD continuations. SVG and diagrams.net share coordinates; PNGs use
Sharp at density 180. The coordinator and teacher are distinct use-case actors;
Learner has View assessment only. Activities retain the established blue/purple/
green swimlanes, white actions, yellow decisions and solid attached heads. ERD
uses geometric crow's-foot marks without cardinality legends. The continuation
correctly treats start_year as a policy key rather than a foreign key to a
nonunique teacher-owned school-year row. Do not overwrite current assets with the
older whole-file build_diagrams.py. SVG and .drawio are editable source files.

## CRL-2026-11-01.3

The coordinator generator now reflects coordinator-only enrollment and Archives,
shared school years for existing/future teachers, teacher-selected eligible
timelines, and reports inside Classes. It no longer presents activation or a
pending-review use case. Figure 26 continuation shows the actual global-year FK
and immutable-library relationships; retired tables remain compatibility storage.
Figures 11 and 23 continuation retain their existing layout with corrected actor
and task labels. Generate PNGs from the revised SVGs after running the targeted
generator. Do not run the obsolete full generator over these revised sources.

## CRL-2026-11-02.1

Figures 12, 15 and 19 reflect Save / Keep editing / Discard, separate School Year
and Classes navigation, and ten-entry audit pages with seven-day erasure. The
Figure 26 continuation adds the shared definition's deletion marker and optional
normalized profile photo. Reused the existing Arial, blue/purple/green swimlanes,
white actions, yellow decisions, solid navy heads and pastel crow's-foot ERD.
SVG and diagrams.net remain editable. Figure 12 routes both save choices to
separate incoming points to avoid shared opposing arrows. Figure 19 separates
the scheduled retention path from user-triggered invitation and audit actions.
Original school-provided passages were restored from the repository, not
regenerated; all three periods currently use the same pair. Existing immutable
versions and learner evidence remain unchanged. Native figure/caption/note
indents and justified notes were retained; the exported document remained 106 pages.

## CRL-2026-11-03.2

Figures 15, its learner-management continuation, 16, and 23 reflect named-only
section creation, separate batch entry and SF1 import, immediate LRN checks, the
coordinator Records tab with the same three read-only teacher report layouts,
and optional section-deletion reasons. The established Arial, three colored
swimlanes, white action nodes, yellow decisions and solid navy arrowheads were
retained. Figure captions and native object dimensions were unchanged. SVG and
diagrams.net sources remain editable. Use the targeted generator blocks rather
than overwriting current unrelated figures with the older bulk generator. No
entity or relationship changed, so the use-case goals and ERDs remain valid.

## CRL-2026-11-03.3

Figure 16 names profile-comparison charts in the existing review action. Its
geometry, colors, arrows, caption and native dimensions remain consistent.
SVG and diagrams.net remain editable; the targeted generator was updated too.
No actor capability or database relationship changed, so use-case and ERD
models needed no structural revision.

## CRL-2026-11-03.6

`build_recovery_diagrams.py` regenerates only Figure 15 continuation, Figure 20 and
Figure 23 using the existing activity theme and shared geometry. Figure 20 separates
Archives from named record Backups, with no backup restoration. Deletion reasons
are optional; password/device/retention protections remain. Metadata columns were
added to the existing administrative recovery structure (Table 8); the selected-key
ERDs have no new entity or declared relationship to draw. General use cases remain
unchanged. Native PDF QA retained 106 pages and all 54 TOC destinations.

## CRL-2026-11-03.7

Single-learner restoration now shows a selected-record preview without checkboxes;
groups retain choices. Figure 20's selected-record restore path already covers
both. Its native note and the implementation baseline were updated; no diagram
geometry, colors, arrowheads, actor permissions or ERD relationships changed.
PDF QA retained 106 pages and all 54 TOC destinations.

## CRL-2026-11-03.8

`build_library_diagram.py` regenerates only Figure 17 using the shared activity
theme/geometry. Publication requires complete pools and mode-appropriate fixed
choices before an immutable version is saved. The native note specifies 10/10/2
minimums and standard run sizes. Actor permissions, selected-key ERD relationships
and all other figures remain unchanged. PDF QA retained 106 pages and all 54 TOC
destinations; both revised pages were rendered and inspected.

## CRL-2026-11-04.1

Figure 17's invalid-draft action now says “Show brief prompt; keep editable draft”.
The native note describes temporary lower-right feedback and the protected unsaved
choices. The targeted library generator retained the activity theme, geometry and
solid arrowheads; SVG/drawio sources remain editable. No actor permission, entity or
relationship changed, so use cases and selected-key ERDs needed no structural edits.
The native baseline was updated; PDF QA retained 106 pages and all 54 TOC destinations,
with both revised pages rendered and inspected.

## CRL-2026-11-04.2

Figure 17 checks the run lock before shared publication and retains saved versions
for online/offline attempts. The native note explains teacher view-only contents,
known active-run locking and disconnected-device limits. Existing colors, geometry,
arrowheads and editable sources remain consistent. Database triggers add no entity
or declared relationship; general use cases and selected-key ERDs remain accurate.

Release .2 PDF QA retained 106 pages and all 54 TOC destinations; revised pages were visually inspected.

## CRL-2026-11-04.3

The targeted build_lifecycle_diagrams.py regenerates Figures 17 and 22 in the same
activity theme. A live lease gates shared publication; recovery distinguishes the
24-hour checkpoint window from retained evidence and the 30-second activity lease.
Native object sizes, captions, justified notes and editable sources are preserved.
No entity, actor goal or declared ERD relationship changed. PDF QA retained 106 pages
and all 54 TOC destinations; revised pages were inspected.

## CRL-2026-11-04.4

Classes and Records retain separate browser selection contexts. Existing activity
flows already select a teacher/class within each workspace; no actor goal, entity
or declared ERD relationship changed. Diagram geometry/colors remain unchanged.
The native design description and baseline clarify independent selections. PDF QA
retained 106 pages and all 54 TOC destinations.

## CRL-2026-11-04.5

Pending requests display responsive skeletons and settled failures display actual
error feedback. This presentation change adds no actor capability, business process,
entity or relationship; existing use cases, activity flows and ERDs remain accurate.
Their consistent colors, geometry and editable sources are preserved. The native
implementation baseline documents the loading behavior. PDF QA retained 106 pages
and all 54 TOC destinations; the revised page was rendered and inspected.

## CRL-2026-11-04.6

Startup now uses only the existing brand/progress/status display; in-page skeletons
mirror each section's responsive controls and content geometry. This is presentation
behavior, with no new actor capability, workflow, entity or relationship. The consistent
activity, use-case and ERD palettes/geometry and editable sources are preserved. The
native baseline was updated in place; PDF QA retained 106 pages, with all 56 named
navigation destinations resolving and the changed page rendered and inspected.

## CRL-2026-11-04.7

Browser installation now uses one consumed prompt per tap or device-specific help;
worker activation precedes background warming, and file links remain alive during
mobile handoff. These fixes add no actor goal, business process, entity or relationship.
Existing download/recovery activities and use-case/ERD designs remain accurate with
their consistent palettes, geometry and editable sources. The native baseline was
updated in place. PDF QA retained 106 pages and all 56 named navigation destinations;
the full revised baseline fits on page 92 and was rendered and inspected.

## CRL-2026-11-04.8

The native implementation baseline now distinguishes Android install acceptance from
launcher creation and documents public-file checks/shortcut guidance plus safe learner
offline updates. These browser/device details do not add a business-process branch,
actor goal, entity or relationship. Existing activity/use-case/ERD palettes, geometry
and editable sources stay consistent and structurally accurate. Native PDF QA retained
106 pages and 56 valid named navigation destinations; the full revised baseline fits
page 92 and was rendered/inspected. Physical Android launcher installation remains a
separate device-verification boundary, not a claimed result of browser emulation.

## CRL-2026-11-04.9

Figures 7 and 17 now include administrator live online assessment observation and
shared lock/count/list behavior. Run build_live_diagrams.py to regenerate only these
figures; SVG/drawio share the established geometry and PNGs use Sharp density180.
Use-case styles and activity lane/process/decision colors remain consistent. There
are no new entity relationships, so existing ERDs remain accurate. Main native notes
and baseline .9 distinguish read-only cloud snapshots from offline-only or streamed
screens. PDF QA retained 106 pages and 56 valid destinations; Figures 7/17 and the full
page-92 baseline were rendered/inspected.


Release CRL-2026-11-05.3 updates Figures 13, 14, 16 and 26 for signup agreement,
role-specific profile/security, teacher-row Records and stored acceptance fields.
The established Arial typography, swimlane palette, white actions and yellow decisions
are retained. CRL_DIAGRAM_TARGETS optionally selects comma-separated figure stems
when regenerating subsets; leave it unset for a complete generation. Run the
coordinator generator for profile/record views, then school_roles for authentication
and account/school ERDs so the later school model remains authoritative.

CRL-2026-11-05.5 updates Figures 13/26 for automatic configured MFA on new browsers,
single-use expiring login challenges and retained invitation redeemer names.
