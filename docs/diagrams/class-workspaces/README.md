# Chapter 3 class workspace diagrams

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
