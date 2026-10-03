/*
 * Guards the Excel scoresheet export.
 *
 * The report fills the official CRLA3 template, which ships with formulas that
 * Excel can only show as an error: `_xludf.IFNA` (an unrecognised function
 * namespace, displayed as "#NAME?") on the Filipino scoresheet's merged story
 * legends, and "#REF!" formulas left behind by a deleted range. A teacher who
 * exports the workbook must never be handed a legend that reads "#NAME?" or a
 * cell that reads "#REF!".
 *
 * This builds a real workbook from the shipped template and reads it back.
 *
 * Runs as part of npm run verify:assessment, so it gates every build.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");
const XLSX = require("xlsx");
const { buildScoresheetWorkbook } = await import("../lib/excelExport.js");

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const TEMPLATE = "public/templates/CRLA3_Grade3Scoresheet_v3.xlsx";
const CHART_PACK = "public/templates/CRLA3_Grade3Scoresheet_v3.class-summary-charts-v2.gz.b64";

const teacher = {
  schoolId: "123456",
  schoolName: "Bagong Silang Elementary School",
  fullName: "Juana Dela Cruz",
  section: "Grade 3 - Rizal",
};

const learnerNames = ["ALONZO, MARIA", "BAUTISTA, JOSE", "CASTRO, LINA"];
const rows = learnerNames.map((name, index) => ({
  sn: index + 1,
  lrn: `1234567890${index}`,
  name,
  sex: index % 2 === 0 ? "Female" : "Male",
  date: new Date(2026, 5, 12),
  task1: 9,
  task2: 8,
  total: 17,
  part1: "Light Refresher",
  story: 2,
  miscues: 4,
  wordsRead: 96,
  minutes: 2,
  seconds: 30,
  wpm: 38,
  readingPctFraction: 0.96,
  comprehensionScore: 5,
  experience: 4,
  observation: "Reads with confidence",
  readingProfile: "Transitioning Reader",
  remarks: "Needs practice on long vowels",
  totalFraction: 17 / 30,
  compFraction: 5 / 6,
}));

const enrolled = { Male: 13, Female: 11, Total: 24 };

const summary = {};
for (const sex of ["Male", "Female", "Total"]) {
  summary[sex] = {
    count: sex === "Total" ? rows.length : rows.filter((row) => row.sex === sex).length,
    part1Counts: [0, 1, 2, 0],
    profileCounts: [0, 1, 2, 0, 0],
    avgFluency: 92,
    avgComp: 5,
    avgWpm: 38,
  };
}

const chartPack = readFileSync(CHART_PACK, "utf8").trim();
const chartParts = JSON.parse(
  (await import("node:zlib")).gunzipSync(Buffer.from(chartPack, "base64")).toString("utf8")
);

const output = await buildScoresheetWorkbook({
  templateData: readFileSync(TEMPLATE),
  chartParts,
  teacher,
  rows,
  enrolled,
  summary,
  outputType: "nodebuffer",
});

check("a workbook is produced", Buffer.isBuffer(output) && output.length > 100000, `${output.length} bytes`);

/* ------------------------------------------------------------------ */
/* Nothing may ship as an Excel error                                  */
/* ------------------------------------------------------------------ */
const zip = await JSZip.loadAsync(output);
const sheetPaths = Object.keys(zip.files).filter((name) =>
  /^xl\/worksheets\/sheet\d+\.xml$/.test(name)
);

let udfLeft = 0;
let refLeft = 0;
let errorTyped = 0;
const errorCells = [];

for (const path of sheetPaths) {
  const xml = await zip.file(path).async("string");
  udfLeft += (xml.match(/_xludf\./g) || []).length;
  errorTyped += (xml.match(/<c\b[^>]*\st="e"/g) || []).length;

  const cells = xml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || [];
  for (const cell of cells) {
    const formula = /<f[^>]*>([\s\S]*?)<\/f>/.exec(cell)?.[1];
    if (formula && /#REF!/.test(formula)) {
      refLeft += 1;
      if (errorCells.length < 5) errorCells.push(`${path} ${/r="([A-Z]+\d+)"/.exec(cell)[1]} = ${formula.slice(0, 60)}`);
    }
  }
}

check("no cell uses an unknown function namespace", udfLeft === 0, `${udfLeft} left`);
check("no formula is left holding a deleted range", refLeft === 0, errorCells.join(" | "));
check("no cell ships as an Excel error value", errorTyped === 0, `${errorTyped} left`);

/* The repaired legends keep their formula, without the error they cached. */
const filXml = await zip.file("xl/worksheets/sheet1.xml").async("string");
for (const address of ["M7", "P7", "X9"]) {
  const cell = (filXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []).find((entry) =>
    new RegExp(`r="${address}"`).test(entry)
  );
  check(
    `the ${address} legend keeps a real Excel function`,
    Boolean(cell) && /<f[^>]*>IFNA\(|<f[^>]*>IF\(IFNA\(/.test(cell) && !/#NAME\?/.test(cell),
    cell
  );
}

/* ------------------------------------------------------------------ */
/* The workbook still parses, and every sheet is present               */
/* ------------------------------------------------------------------ */
const workbook = XLSX.read(output, { type: "buffer" });
check(
  "every worksheet still parses",
  workbook.SheetNames.length === 6,
  workbook.SheetNames.join(", ")
);
for (const name of ["G3 FIL Reading Scoresheet", "G3 ENG Reading Scoresheet", "Class Record", "Class Summary"]) {
  check(`"${name}" is present`, workbook.SheetNames.includes(name));
}

/* ------------------------------------------------------------------ */
/* The legends the teacher reads                                       */
/* ------------------------------------------------------------------ */
const eng = workbook.Sheets["G3 ENG Reading Scoresheet"];
check(
  "the English scoresheet is filled with the class",
  eng.C4?.v === teacher.schoolId && eng.C5?.v === teacher.schoolName && eng.C6?.v === teacher.fullName,
  `${eng.C4?.v} / ${eng.C5?.v}`
);
check(
  "the enrolment header reflects the class",
  eng.D6?.v === enrolled.Male && eng.E6?.v === enrolled.Female && eng.F4?.v === enrolled.Total,
  `M${eng.D6?.v} F${eng.E6?.v} T${eng.F4?.v}`
);
check("the assessed count is real", eng.H4?.v === rows.length, String(eng.H4?.v));

const fil = workbook.Sheets["G3 FIL Reading Scoresheet"];
check(
  "the Filipino scoresheet header is no longer an error",
  fil.D6?.v === enrolled.Male && fil.E6?.v === enrolled.Female && fil.F4?.v === enrolled.Total,
  `M${fil.D6?.v} F${fil.E6?.v} T${fil.F4?.v}`
);

/*
 * The strongest reading of the requirement: no cell a teacher can see may be an
 * Excel error, whether it is a live error or a stale cached one.
 */
const EXCEL_ERRORS = /^#(NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NULL!|NUM!|GETTING_DATA)$/;
const errorLegend = [];
for (const name of workbook.SheetNames) {
  const sheet = workbook.Sheets[name];
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    const cell = sheet[address];
    if (typeof cell?.w === "string" && EXCEL_ERRORS.test(cell.w.trim())) {
      errorLegend.push(`${name}!${address}=${cell.w.trim()}`);
    }
  }
}
check(
  "no cell in the workbook reads as an Excel error",
  errorLegend.length === 0,
  errorLegend.slice(0, 6).join(", ")
);

const record = workbook.Sheets["Class Record"];
check("the class record names the school and teacher", record.C4?.v === teacher.schoolName && record.C5?.v === teacher.fullName, `${record.C4?.v} / ${record.C5?.v}`);
check("the class record carries each learner", record.C8?.v === learnerNames[0], String(record.C8?.v));
check("the class record carries the remark", record.Q8?.v === rows[0].remarks, String(record.Q8?.v));

console.log(failures ? `\n${failures} EXCEL EXPORT CHECK(S) FAILED` : "\nVerified Excel export: the scoresheet legends reflect the class and no cell ships as an Excel error.");
process.exit(failures ? 1 : 0);
