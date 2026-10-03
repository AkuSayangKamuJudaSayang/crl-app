/*
 * Guards that Assessment Records' scoresheet is the exported workbook.
 *
 * The teacher reads the scoresheet in the app and the same sheet in Excel, so
 * the two must place the same heading over the same cell. This reads the
 * shipped template's English sheet and the scoresheet markup, walks both as a
 * spreadsheet would (honouring colSpan/rowSpan and the workbook's mergeCells)
 * and requires every label to sit at the same anchor with the same extent.
 *
 * Runs as part of npm run verify:assessment, so it gates every build.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const TEMPLATE = "public/templates/CRLA3_Grade3Scoresheet_v3.xlsx";
const SHEET = "xl/worksheets/sheet2.xml";
const HEADER_ROWS = 10;
const COLUMNS = 21;

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

/* ---------------------------------------------------------------- */
/* The workbook                                                      */
/* ---------------------------------------------------------------- */
const zip = await JSZip.loadAsync(readFileSync(TEMPLATE));
const sharedXml = await zip.file("xl/sharedStrings.xml").async("string");
const shared = (sharedXml.match(/<si>[\s\S]*?<\/si>/g) || []).map((item) =>
  (item.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
    .map((run) => run.replace(/<[^>]+>/g, ""))
    .join("")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
);

const sheetXml = await zip.file(SHEET).async("string");
const columnIndex = (letters) =>
  letters.split("").reduce((total, letter) => total * 26 + (letter.charCodeAt(0) - 64), 0) - 1;

const workbookCells = new Map();
for (const cellXml of sheetXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []) {
  const reference = /r="([A-Z]+)(\d+)"/.exec(cellXml);
  if (!reference) continue;
  const row = Number(reference[2]);
  if (row > HEADER_ROWS) continue;
  const type = /t="([^"]+)"/.exec(cellXml)?.[1] || "";
  const raw = /<v>([\s\S]*?)<\/v>/.exec(cellXml)?.[1];
  const value = raw === undefined ? "" : type === "s" ? shared[Number(raw)] : raw;
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text) workbookCells.set(`${reference[1]}${row}`, text);
}
const workbookMerges = new Map();
for (const merge of sheetXml.match(/<mergeCell ref="([^"]+)"/g) || []) {
  const range = merge.replace(/<mergeCell ref="|"/g, "");
  const [from, to] = range.split(":");
  const fromMatch = /^([A-Z]+)(\d+)$/.exec(from);
  const toMatch = /^([A-Z]+)(\d+)$/.exec(to);
  if (!fromMatch || !toMatch) continue;
  if (Number(fromMatch[2]) > HEADER_ROWS) continue;
  workbookMerges.set(from, {
    columns: columnIndex(toMatch[1]) - columnIndex(fromMatch[1]) + 1,
    rows: Number(toMatch[2]) - Number(fromMatch[2]) + 1,
  });
}

/* ---------------------------------------------------------------- */
/* The scoresheet in the app                                         */
/* ---------------------------------------------------------------- */
const teacherPage = readFileSync("app/teacher/page.jsx", "utf8").replace(/\r\n/g, "\n");
const gridStart = teacherPage.indexOf('<table className="scoresheetGrid">');
const headerStart = teacherPage.indexOf('<tr className="ssTitleRow">', gridStart);
const columnRowStart = teacherPage.indexOf('<tr className="ssColumnRow">', headerStart);
const headerEnd = teacherPage.indexOf("</tr>", columnRowStart) + "</tr>".length;
if (gridStart < 0 || headerStart < 0 || columnRowStart < 0) {
  throw new Error("Unable to find the scoresheet grid in the teacher page");
}
const headerMarkup = teacherPage.slice(headerStart, headerEnd);

const CELL_PATTERN = /<(th|td)\b([^>]*?)(\/?)>([\s\S]*?)(?:<\/\1>|(?=<(?:th|td)\b))/g;
const appRows = [];
for (const rowXml of headerMarkup.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || []) {
  const cells = [];
  let match;
  CELL_PATTERN.lastIndex = 0;
  while ((match = CELL_PATTERN.exec(rowXml))) {
    const attributes = match[2];
    const body = match[4] || "";
    const text = body
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      /* Workbook logos and its floating title/reference artwork do not occupy
         worksheet cells, so they are intentionally excluded from cell text. */
      .replace(/<span className="ssBranding">[\s\S]*?<\/span>/g, "")
      .replace(/<span className="ssWorkbookTitle">[\s\S]*?<\/span>/g, "")
      .replace(/<img\b[\s\S]*?\/>/g, "")
      .replace(/\{[^{}]*\}/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    cells.push({
      colSpan: Number((/colSpan=\{(\d+)\}/.exec(attributes) || [])[1] || 1),
      rowSpan: Number((/rowSpan=\{(\d+)\}/.exec(attributes) || [])[1] || 1),
      text,
    });
  }
  appRows.push(cells);
}

/* Walk both grids, recording where each label is anchored and how far it spans. */
function layout(rows) {
  const anchors = [];
  const occupied = new Set();
  rows.forEach((cells, rowIndex) => {
    let column = 0;
    for (const cell of cells) {
      while (occupied.has(`${rowIndex}:${column}`)) column += 1;
      for (let r = rowIndex; r < rowIndex + cell.rowSpan; r += 1) {
        for (let c = column; c < column + cell.colSpan; c += 1) occupied.add(`${r}:${c}`);
      }
      if (cell.text) {
        anchors.push({ row: rowIndex + 1, column: column + 1, ...cell });
      }
      column += cell.colSpan;
    }
  });
  return anchors;
}

const appAnchors = layout(appRows);
const workbookAnchors = [];
{
  const occupied = new Set();
  for (let row = 1; row <= HEADER_ROWS; row += 1) {
    let column = 0;
    while (column < COLUMNS) {
      if (occupied.has(`${row}:${column}`)) {
        column += 1;
        continue;
      }
      const reference = `${String.fromCharCode(65 + column)}${row}`;
      const merge = workbookMerges.get(reference) || { columns: 1, rows: 1 };
      for (let r = row; r < row + merge.rows; r += 1) {
        for (let c = column; c < column + merge.columns; c += 1) occupied.add(`${r}:${c}`);
      }
      const text = workbookCells.get(reference);
      if (text) {
        workbookAnchors.push({
          row,
          column: column + 1,
          colSpan: merge.columns,
          rowSpan: merge.rows,
          text,
        });
      }
      column += merge.columns;
    }
  }
}

/*
 * Three labels in the template carry a misspelling. The app spells them
 * correctly, so the comparison carries the same correction.
 */
const SPELLING = new Map([
  ["Schoo Name:", "School Name:"],
  ["Date of Asessment", "Date of Assessment"],
  ["Leaner Experience (Rating 1-5)", "Learner Experience (Rating 1-5)"],
]);

/*
 * These cells hold the template's own samples or a value it cannot compute -
 * a sample school name, a broken "#REF!" enrolment formula, a cached zero.
 * The app fills them from the teacher's account and roster, so their position
 * is what has to match, not their text.
 */
const APP_FILLED = new Set(["C3", "C4", "C5", "C6", "C8", "D6", "E6", "F4", "H4"]);
const referenceFor = (row, column) =>
  `${String.fromCharCode(64 + column)}${row}`;

const expected = workbookAnchors
  .filter((anchor) => !APP_FILLED.has(referenceFor(anchor.row, anchor.column)))
  .map((anchor) => ({
    ...anchor,
    text: SPELLING.get(anchor.text) || anchor.text,
    /* The title row is drawn across the sheet, as a sheet title is. */
    colSpan: anchor.row === 1 ? COLUMNS : anchor.colSpan,
  }));

console.log("=== the app's scoresheet header against the workbook ===");
check(
  "the workbook header was read",
  expected.length >= 25,
  `${expected.length} labels`
);
check(
  "the app draws the workbook's ten header rows",
  appRows.length === HEADER_ROWS,
  `${appRows.length} rows`
);

const expectedKeys = new Set(expected.map((anchor) => `${anchor.row}:${anchor.column}`));
const actualKeys = new Set(appAnchors.map((anchor) => `${anchor.row}:${anchor.column}`));
const missing = expected.filter((anchor) => !actualKeys.has(`${anchor.row}:${anchor.column}`));
const extra = appAnchors.filter((anchor) => !expectedKeys.has(`${anchor.row}:${anchor.column}`));

check(
  "every workbook label sits in the same cell",
  missing.length === 0,
  missing.map((anchor) => `${anchor.row}:${anchor.column} "${anchor.text.slice(0, 30)}"`).join(", ")
);
check(
  "the app adds no label the workbook does not have",
  extra.length === 0,
  extra.map((anchor) => `${anchor.row}:${anchor.column} "${anchor.text.slice(0, 30)}"`).join(", ")
);

const mismatched = [];
for (const anchor of expected) {
  const actual = appAnchors.find(
    (candidate) => candidate.row === anchor.row && candidate.column === anchor.column
  );
  if (!actual) continue;
  const sameText = actual.text.replace(/\s+/g, " ").trim() === anchor.text.replace(/\s+/g, " ").trim();
  const sameSpan = actual.colSpan === anchor.colSpan && actual.rowSpan === anchor.rowSpan;
  if (!sameText || !sameSpan) {
    mismatched.push(
      `${anchor.row}:${anchor.column} expected "${anchor.text.slice(0, 34)}" (${anchor.colSpan}x${anchor.rowSpan}), found "${actual.text.slice(0, 34)}" (${actual.colSpan}x${actual.rowSpan})`
    );
  }
}
check(
  "every label keeps the workbook's text and merged extent",
  mismatched.length === 0,
  mismatched.slice(0, 4).join(" | ")
);

/* The block above the data is rows 1-10, so a record row starts the grid's data. */
check(
  "the data columns are one per workbook column",
  (teacherPage
    .slice(
      teacherPage.indexOf("<tr key={assessment.id}>", gridStart),
      teacherPage.indexOf("</tr>", teacherPage.indexOf("<tr key={assessment.id}>", gridStart))
    )
    .match(/<td\b/g) || []).length === COLUMNS,
  `${COLUMNS} expected`
);

console.log(
  failures
    ? `\n${failures} SCORESHEET GRID CHECK(S) FAILED`
    : "\nVerified the scoresheet grid: the app places every workbook heading in the workbook's own cell."
);
process.exit(failures ? 1 : 0);
