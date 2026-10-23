# Chapter 3 class workspace diagrams

CRL-2026-10-24.1. These diagrams describe the implemented teacher-led Grade 3
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
