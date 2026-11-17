# CRL-App Release Note: Class Summary Profile-Only Green Fill
Date: 2026-11-17

## Scope
Correct the **Class Summary** worksheet styling shared by teacher and reading coordinator assessment-record **XLSX export and A4 printing**.

## Reference
User-provided `CRLA3_Grade3Scoresheet_v3-Copy.xlsx` and screenshot of a previously generated BoSY Class Summary. The original template restricts its green-highlighted area to the reading-profile sections, while the generated report incorrectly painted the entire Filipino/English table rows blue and green.

## Exact change
- **Top Class Summary:** only reading profile **O:S** (Low Emerging Reader, High Emerging Reader, Developing Reader, Transitioning Reader, Reading At Grade Level) receives light-green `#E2EFD9`.
- **Bottom percentage table:** only reading profile **K:O** receives the same light-green fill.
- All **other Class Summary data cells** are white `#FFFFFF`. Total rows have neutral light-gray `#F2F2F2` outside the reading profile.
- All Class Summary totals, counts, percentages, formulas, chart data, merged headers, borders, wrapping, score references and print geometry remain unchanged.
- **Class Record, Filipino/English Reading Scoresheets, Assessment Records behavior, offline exports, pairing and scoring logic remain unchanged.** In particular, the existing color bands of the separate Class Record worksheet have not been modified.

## Shared teacher/coordinator path
The shared workbook builder `lib/excelExport.js` provides the workbook to the teacher and reading coordinator flows. `lib/workbookPrint.mjs` renders the same workbook cell styles to printable SVG/A4 pages, so the spreadsheet and printed report stay consistent.

## Regression coverage
Updated `scripts/verify-workbook-print-export.mjs` to confirm the exact fill of profile and non-profile Class Summary cells across BoSY, MoSY and EoSY, including printed SVG styles, and to ensure the separate Class Record colors remain unchanged. All existing workbook/worksheet, charts, export, print and assessment tests remain in the build pipeline.
