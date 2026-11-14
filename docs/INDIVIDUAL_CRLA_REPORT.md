# Individual learner print format - CRL-2026-11-13.5

Updated by CRL-2026-11-14.1: the teacher and coordinator now use the same result
panel and print renderer. Coordinator access is school/year/section scoped and
supplies the current assigned teacher rather than the signed-in coordinator as
the signature name. Shared teacher/coordinator analytics also has a formal
landscape report with vector comparison graph, count/percentage table, school/
year/section and assigned-teacher signature context. These remain supporting
CRL-App records, not newly prescribed DepEd submission forms.

Reviewed 13 November 2026. This is a CRL-App supporting individual record for
Grade 3 English. It is an adaptation, not a newly prescribed DepEd submission
form. Do not label it an official DepEd form or replace school/class submissions.

## Primary references and design decisions

1. DepEd, DM-CT-2024-284, administration of RMA and CRLA, 20 August 2024,
   including the CRLA FAQ annex. Official regional-hosted copy:
   https://region8.deped.gov.ph/wp-content/uploads/2024/08/MEMO-DM-CT-2024-284.pdf
   The FAQ identifies decoding/word recognition and reading fluency/comprehension
   components. Its submission guidance describes automated classroom scoresheets,
   class records, class summaries and a consolidated school summary. An individual
   printout is therefore supporting learner evidence rather than that submission.
2. DepEd Schools Division of Dipolog City, Division Memorandum 174, 15 April
   2024, Enclosure 1, School Consolidated Report for CRLA Posttest:
   https://depeddipolog.com/wp-content/uploads/2024/04/DIV.MEMO174-r174-April-15-2024-CONDUCT-OF-CRLA-AND-PHIL-IRE-POSTFEST-FOR-SY-2023-2024.pdf
   The CRLA enclosure uses a government/department/school heading, grade,
   language, reading categories and signature-over-printed-name blocks. It is a
   division-specific consolidated report, not an individual learner form. Adapt
   its formal identification/signature convention only. The requested individual
   report uses the currently assigned teacher's name and an empty wet-signature
   area. It does not invent a coordinator/head approval or copy their signatories.
3. DepEd Bureau of Learning Delivery, National Learning Assessment submission
   portal, accessed on the review date: https://bld.deped.gov.ph/submission
   This provides current toolkit/scoresheet links. Schools should continue using
   the appropriate prescribed tools for their official submissions.

The scanned official PDF pages were rendered and their CRLA text checked during
research. Enclosure 1 is the CRLA template; Enclosure 2 is Phil-IRI and is not the
source for this report's assessment content. No scoring thresholds or toolkit
versions are changed by this presentation feature.

## Printed contents

Portrait A4, 12 mm margins, readable monochrome Arial, with a formal summary
followed by item-level supporting evidence. The summary identifies the school
and school ID from the teacher profile, full learner name, LRN, sex, school year,
Grade 3/section, English, selected assessment period and Manila assessment date.
Unknown school metadata remains a writable blank; missing saved results are
explicitly labeled, never fabricated. Only the selected saved BoSY/MoSY/EoSY
result is printed, with its period shown prominently.

Results include letter/word scores, Part 1 total and reading level, passage title,
word count, correctly read words, recorded miscues, accuracy, rate, elapsed time,
comprehension, recorded experience/observation fields, final reading profile and
teacher remarks. Existing application score/profile and stop rules are preserved.
Skipped tasks say Not administered, rather than suggesting a failed zero score.
The name line uses the currently assigned teacher, not an imported assessment's
previous assessor. Its blank space is for a physical signature and signing date.

The appendix includes recorded letters, words, comprehension question judgments,
the available historical passage and a textual miscue ledger. A saved time-limit
cutoff is represented using the existing final-review helper. Unavailable historic
question/passage text is identified, never replaced with current question content.
Teacher-only possible-answer guides are excluded. Long content can paginate;
table rows and the signature block are kept together where possible. A full-sized
synthetic example with ten letters, ten words, 100 passage words and six questions
fits a signed summary sheet plus one evidence sheet in the checked A4 renderer.

## Operation and safeguards

Conduct Assessment -> Enrolled Learners -> View -> select a completed period ->
Print individual summary. The browser print dialog also allows Save as PDF when
supported. Full saved detail must finish loading first. Learner, record ID, period,
class, year and teacher ownership must all match before printing is enabled.
This prevents a stale in-flight detail response from being printed for another
selected learner. Printing performs no database mutation or external data fetch.
All report strings use DOM text nodes; imported metadata cannot become HTML.

Existing class-record and analytics prints keep their landscape defaults. The
generic print helper has opt-in portrait CSS/title suppression for this report.
The teacher service worker is v101 so updated app assets are warmed for offline
use. This feature does not change how missing assessment details are downloaded;
an uncached result still needs connectivity to load before it can be printed.

Validation uses synthetic records only. Physical printer/HarmonyOS print-service
availability is device/browser dependent and was not tested on the user's tablet.
No database migration is needed. Roll back the UI/helper/test/worker change
together; existing data, class exports and signatures are unaffected.
