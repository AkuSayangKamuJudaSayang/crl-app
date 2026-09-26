import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import JSZip from "jszip";

/*
 * Raw OOXML scoresheet editor.
 *
 * ExcelJS drops charts and re-anchors images when it round-trips a workbook,
 * which is why the exported scoresheet was missing its pie/bar charts and had
 * warped DepEd logos. This module instead edits the template's XML directly
 * with JSZip, so charts, drawings, media, styles and formulas stay byte-for-byte
 * intact and we only replace the cells that hold learner data.
 *
 * Sheet layout in CRLA3_Grade3Scoresheet_v3.xlsx:
 *   sheet1 = G3 FIL Reading Scoresheet   (left untouched)
 *   sheet2 = G3 ENG Reading Scoresheet   (filled)
 *   sheet3 = Class Record                (filled)
 *   sheet4 = Class Summary               (English rows filled)
 *   sheet5 = Scoring Reference           (left untouched)
 *   sheet6 = List                        (left untouched)
 */

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const PART = {
  "G3 ENG Reading Scoresheet": "xl/worksheets/sheet2.xml",
  "Class Record": "xl/worksheets/sheet3.xml",
  "Class Summary": "xl/worksheets/sheet4.xml",
};

const PART1_COLUMNS = ["H", "I", "J", "K"];
const PART1_DETAIL_COLUMNS = ["D", "E", "F", "G"];
const PROFILE_COLUMNS = ["O", "P", "Q", "R", "S"];
const PROFILE_DETAIL_COLUMNS = ["K", "L", "M", "N", "O"];

const SUMMARY_TOP_ROWS = { Male: 10, Female: 11, Total: 14 };
const SUMMARY_DETAIL_ROWS = { Male: 22, Female: 23, Total: 24 };

const SCORESHEET_COLUMNS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K",
  "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U",
];

const CLASS_RECORD_FIL_COLUMNS = ["E", "F", "G", "H", "I", "J"];

const CLASS_SUMMARY_CHART_PACK =
  "CRLA3_Grade3Scoresheet_v3.class-summary-charts-v2.gz.b64";

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXml(value) {
  return String(value)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function formatNumber(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(parseFloat(value.toFixed(6)));
}

function dateToSerial(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const utc = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  return Math.round(utc / 86400000) + 25569;
}

/*
 * sharedStrings.xml editor. Existing entries keep their original rich markup;
 * new entries are appended as plain <t> runs.
 */
class SharedStrings {
  constructor(xml) {
    this.raw = [];
    this.texts = [];

    if (xml) {
      const re = /<si>([\s\S]*?)<\/si>/g;
      let match;
      while ((match = re.exec(xml))) {
        this.raw.push(match[1]);
        this.texts.push(this.extractText(match[1]));
      }
    }
  }

  extractText(inner) {
    const parts = [
      ...inner.matchAll(/<t(?:[^>]*)>([\s\S]*?)<\/t>/g),
    ].map((match) => match[1]);
    return parts.map((part) => decodeXml(part)).join("");
  }

  getOrAdd(text) {
    const value = String(text == null ? "" : text);
    const index = this.texts.indexOf(value);
    if (index >= 0) {
      return index;
    }

    const needsSpacePreserve = /^\s|\s$|[\n\r]/.test(value);
    this.raw.push(
      `<t${needsSpacePreserve ? ' xml:space="preserve"' : ""}>${escapeXml(value)}</t>`
    );
    this.texts.push(value);
    return this.raw.length - 1;
  }

  toXml() {
    const items = this.raw.map((inner) => `<si>${inner}</si>`).join("");
    return (
      `${XML_DECL}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `count="${this.raw.length}" uniqueCount="${this.raw.length}">${items}</sst>`
    );
  }
}

class SheetEditor {
  constructor(xml, sharedStrings) {
    this.xml = xml;
    this.sharedStrings = sharedStrings;
  }

  getStyle(address) {
    const match = this.xml.match(
      new RegExp(`<c\\s+r="${address}"([^>]*)`)
    );
    if (!match) {
      return null;
    }
    const style = match[1].match(/\bs="(\d+)"/);
    return style ? parseInt(style[1], 10) : null;
  }

  buildCell(address, value, style) {
    const styleAttribute = style != null ? ` s="${style}"` : "";
    const blank =
      value === null ||
      value === undefined ||
      value === "" ||
      (typeof value === "number" && !Number.isFinite(value));

    if (blank) {
      return `<c r="${address}"${styleAttribute}/>`;
    }

    if (typeof value === "number") {
      return `<c r="${address}"${styleAttribute}><v>${formatNumber(value)}</v></c>`;
    }

    if (typeof value === "boolean") {
      return `<c r="${address}"${styleAttribute} t="b"><v>${value ? 1 : 0}</v></c>`;
    }

    const index = this.sharedStrings.getOrAdd(value);
    return `<c r="${address}"${styleAttribute} t="s"><v>${index}</v></c>`;
  }

  setCell(address, value, options = {}) {
    const style =
      options.style != null ? options.style : this.getStyle(address);
    const replacement = this.buildCell(address, value, style);
    const re = new RegExp(
      `<c\\s+r="${address}"[^>]*/>|<c\\s+r="${address}"[^>]*>[\\s\\S]*?<\\/c>`,
      "s"
    );

    if (!re.test(this.xml)) {
      /*
       * Some template columns only materialise a cell where a value once
       * existed (e.g. Class Record column R only has R8). Callers that are
       * merely clearing stray content can opt out of the strict check.
       */
      if (options.optional) {
        return;
      }
      throw new Error(`Cell ${address} was not found in the worksheet`);
    }

    this.xml = this.xml.replace(re, replacement);
  }
}

function populateScoresheet(editor, teacher, rows, enrolled) {
  /*
   * Clear sample header text the template ships with, then write the real
   * teacher identity and the male/female enrollment counts (the template's
   * D6/E6 cells ship as a broken shared "#REF!" formula).
   */
  editor.setCell("C5", "");
  editor.setCell("C6", teacher.fullName || "");
  editor.setCell("C8", teacher.section || "");
  editor.setCell("D6", enrolled.Male);
  editor.setCell("E6", enrolled.Female);

  /*
   * The template's "Total Enrolment" (F4) and "Assessed" (H4) header cells
   * cache stale results (F4 was even cached as a #REF! error). Write the
   * values directly so the header is correct even before Excel recalculates.
   */
  editor.setCell("F4", enrolled.Total);
  editor.setCell("H4", rows.length);

  for (let index = 0; index < 100; index += 1) {
    const row = rows[index] || null;
    const rowNumber = 11 + index;

    editor.setCell(`A${rowNumber}`, row ? row.sn : null);
    editor.setCell(`B${rowNumber}`, row ? row.lrn || "" : "");
    editor.setCell(`C${rowNumber}`, row ? row.name || "" : "");
    editor.setCell(`D${rowNumber}`, row ? row.sex || "" : "");
    editor.setCell(`E${rowNumber}`, row ? dateToSerial(row.date) : null);
    editor.setCell(`F${rowNumber}`, row ? row.task1 : null);
    editor.setCell(`G${rowNumber}`, row ? row.task2 : null);
    editor.setCell(`H${rowNumber}`, row ? row.total : null);
    editor.setCell(`I${rowNumber}`, row ? row.part1 || "" : "");
    editor.setCell(`J${rowNumber}`, row ? row.story : null);
    editor.setCell(`K${rowNumber}`, row ? row.miscues : null);
    editor.setCell(`L${rowNumber}`, row ? row.wordsRead : null);
    editor.setCell(`M${rowNumber}`, row ? row.minutes : null);
    editor.setCell(`N${rowNumber}`, row ? row.seconds : null);
    editor.setCell(`O${rowNumber}`, row ? row.wpm : null);
    editor.setCell(`P${rowNumber}`, row ? row.readingPctFraction : null);
    editor.setCell(`Q${rowNumber}`, row ? row.comprehensionScore : null);
    editor.setCell(`R${rowNumber}`, row ? row.experience : null);
    editor.setCell(`S${rowNumber}`, row ? row.observation || "" : "");
    editor.setCell(`T${rowNumber}`, row ? row.readingProfile || "" : "");
    editor.setCell(`U${rowNumber}`, row ? row.remarks || "" : "");
  }
}

function populateClassRecord(editor, teacher, rows) {
  editor.setCell("C5", teacher.fullName || "");

  for (let index = 0; index < 100; index += 1) {
    const row = rows[index] || null;
    const rowNumber = 8 + index;

    editor.setCell(`A${rowNumber}`, row ? row.sn : null);
    editor.setCell(`B${rowNumber}`, row ? row.lrn || "" : "");
    editor.setCell(`C${rowNumber}`, row ? row.name || "" : "");
    editor.setCell(`D${rowNumber}`, row ? row.sex || "" : "");

    // Filipino columns are not assessed by this app: leave them blank.
    CLASS_RECORD_FIL_COLUMNS.forEach((column) => {
      editor.setCell(`${column}${rowNumber}`, "");
    });

    editor.setCell(`K${rowNumber}`, row ? row.part1 || "" : "");
    editor.setCell(`L${rowNumber}`, row ? row.totalFraction : null);
    editor.setCell(`M${rowNumber}`, row ? row.readingPctFraction : null);
    editor.setCell(`N${rowNumber}`, row ? row.compFraction : null);
    editor.setCell(`O${rowNumber}`, row ? row.wpm : null);
    editor.setCell(`P${rowNumber}`, row ? row.readingProfile || "" : "");
    editor.setCell(`Q${rowNumber}`, row ? row.remarks || "" : "");
    editor.setCell(`R${rowNumber}`, "", { optional: true });
  }
}

function buildClassSummaryCells(teacher, summary, enrolled) {
  const cells = {};

  ["Male", "Female", "Total"].forEach((sex) => {
    const stats = summary[sex];
    const enrolledCount = enrolled[sex] || 0;
    const topRow = SUMMARY_TOP_ROWS[sex];
    const detailRow = SUMMARY_DETAIL_ROWS[sex];

    // Upper block: enrolment, level counts and averages.
    cells[`A${topRow}`] = "Grade 3";
    cells[`B${topRow}`] = teacher.section || "";
    cells[`C${topRow}`] = teacher.fullName || "";
    cells[`D${topRow}`] = "English";
    cells[`E${topRow}`] = sex;
    cells[`F${topRow}`] = enrolledCount;
    cells[`G${topRow}`] = stats.count;

    PART1_COLUMNS.forEach((column, i) => {
      cells[`${column}${topRow}`] = stats.part1Counts[i];
    });

    cells[`L${topRow}`] =
      stats.avgFluency == null ? null : stats.avgFluency / 100;
    cells[`M${topRow}`] = stats.avgComp == null ? null : stats.avgComp / 6;
    cells[`N${topRow}`] = stats.avgWpm;

    PROFILE_COLUMNS.forEach((column, i) => {
      cells[`${column}${topRow}`] = stats.profileCounts[i];
    });

    // Lower block: percentages. The cells are formatted as 0%, so the values
    // stored must be fractions (this is what previously rendered as 10000%).
    cells[`A${detailRow}`] = "English";
    cells[`B${detailRow}`] = sex;
    cells[`C${detailRow}`] = enrolledCount
      ? Number((stats.count / enrolledCount).toFixed(6))
      : 0;

    PART1_DETAIL_COLUMNS.forEach((column, i) => {
      cells[`${column}${detailRow}`] = stats.count
        ? Number((stats.part1Counts[i] / stats.count).toFixed(6))
        : 0;
    });

    cells[`H${detailRow}`] =
      stats.avgFluency == null
        ? null
        : Number((stats.avgFluency / 100).toFixed(6));
    cells[`I${detailRow}`] =
      stats.avgComp == null ? null : Number((stats.avgComp / 6).toFixed(6));
    cells[`J${detailRow}`] = stats.avgWpm;

    PROFILE_DETAIL_COLUMNS.forEach((column, i) => {
      cells[`${column}${detailRow}`] = stats.count
        ? Number((stats.profileCounts[i] / stats.count).toFixed(6))
        : 0;
    });
  });

  return cells;
}

function populateClassSummary(editor, cells) {
  Object.keys(cells).forEach((address) => {
    editor.setCell(address, cells[address]);
  });
}

/*
 * The v3 workbook's Class Summary charts were previously saved with helper
 * columns such as Sex included as numeric series, blank series names and a
 * compressed header row. Install the official v2 chart definitions on top of
 * the v3 Filipino/English layout before inserting live values. The compact
 * chart pack contains only OOXML chart/style/color parts, not learner data.
 */
async function applyOfficialClassSummaryCharts(zip, templatePath) {
  const chartPackPath = path.join(
    path.dirname(templatePath),
    CLASS_SUMMARY_CHART_PACK
  );
  const encoded = (await fs.readFile(chartPackPath, "utf8")).trim();
  const chartParts = JSON.parse(
    gunzipSync(Buffer.from(encoded, "base64")).toString("utf8")
  );

  for (let index = 1; index <= 6; index += 1) {
    zip.file(`xl/charts/chart${index}.xml`, chartParts[`chart${index}`]);
    zip.file(`xl/charts/style${index}.xml`, chartParts[`style${index}`]);
    zip.file(`xl/charts/colors${index}.xml`, chartParts[`colors${index}`]);
    zip.file(
      `xl/charts/_rels/chart${index}.xml.rels`,
      `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId2" Type="http://schemas.microsoft.com/office/2011/relationships/chartColorStyle" Target="colors${index}.xml"/>` +
        `<Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2011/relationships/chartStyle" Target="style${index}.xml"/>` +
        "</Relationships>"
    );
  }

  const contentTypesPath = "[Content_Types].xml";
  let contentTypes = await zip.files[contentTypesPath].async("string");
  for (let index = 1; index <= 6; index += 1) {
    const parts = [
      [
        `/xl/charts/style${index}.xml`,
        "application/vnd.ms-office.chartstyle+xml",
      ],
      [
        `/xl/charts/colors${index}.xml`,
        "application/vnd.ms-office.chartcolorstyle+xml",
      ],
    ];
    parts.forEach(([partName, contentType]) => {
      if (!contentTypes.includes(`PartName="${partName}"`)) {
        contentTypes = contentTypes.replace(
          "</Types>",
          `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`
        );
      }
    });
  }
  zip.file(contentTypesPath, contentTypes);
}

function normalizeClassSummaryLayout(xml) {
  const rowHeights = new Map([
    [16, 15],
    [17, 14.4],
    [18, 36],
  ]);

  let updated = xml;
  rowHeights.forEach((height, row) => {
    updated = updated.replace(
      new RegExp(`<row\\b([^>]*\\br="${row}"[^>]*)>`),
      (whole, attributes) => {
        const cleaned = attributes
          .replace(/\sht="[^"]*"/g, "")
          .replace(/\scustomHeight="[^"]*"/g, "");
        return `<row${cleaned} ht="${height}" customHeight="1">`;
      }
    );
  });

  return updated;
}

/*
 * The template's male/female pie chart originally read the Filipino summary
 * rows. Since this app only assesses English, keep both its category labels
 * and values on the English rows so the chart is self-contained and clean in
 * viewers that do not recalculate chart metadata.
 */
async function repointPieChart(zip) {
  const chartPath = "xl/charts/chart2.xml";
  const entry = zip.files[chartPath];
  if (!entry) {
    return;
  }

  const xml = await entry.async("string");
  zip.file(
    chartPath,
    xml
      .replace(
        "'Class Summary'!$E$8:$E$9",
        "'Class Summary'!$E$10:$E$11"
      )
      .replace(
        "'Class Summary'!$G$8:$G$9",
        "'Class Summary'!$G$10:$G$11"
      )
  );
}

/*
 * Expand an A1-style reference such as "'Class Summary'!$K$19:$K$24" into the
 * list of addresses it covers.
 */
function expandRange(reference) {
  const match = String(reference).match(
    /!?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/
  );
  if (!match) {
    return null;
  }

  const startColumn = match[1];
  const startRow = Number(match[2]);
  const endColumn = match[3] || startColumn;
  const endRow = match[4] ? Number(match[4]) : startRow;

  if (startColumn !== endColumn) {
    return null;
  }

  const addresses = [];
  for (let row = startRow; row <= endRow; row += 1) {
    addresses.push(`${startColumn}${row}`);
  }
  return addresses;
}

/*
 * Every chart keeps a cached copy of its series values. Rebuild each cache
 * from the exact range length instead of only replacing existing points.
 * This matters for the Filipino-and-English profile chart: its source range
 * is shorter than the old three-language chart, and stale extra cache points
 * otherwise appear as phantom categories in non-recalculating viewers.
 */
async function refreshChartCaches(zip, cells) {
  const chartParts = Object.keys(zip.files).filter((name) =>
    /^xl\/charts\/chart\d+\.xml$/.test(name)
  );

  await Promise.all(
    chartParts.map(async (part) => {
      const xml = await zip.files[part].async("string");

      const updated = xml.replace(
        /<c:numRef>([\s\S]*?)<\/c:numRef>/g,
        (whole, inner) => {
          const reference = inner.match(/<c:f>([^<]*)<\/c:f>/);
          if (!reference) {
            return whole;
          }

          const addresses = expandRange(reference[1]);
          if (!addresses || !addresses.length) {
            return whole;
          }

          const formatCode =
            inner.match(
              /<c:numCache>[\s\S]*?<c:formatCode>([^<]*)<\/c:formatCode>/
            )?.[1] || "General";
          const withoutCache = inner.replace(
            /<c:numCache>[\s\S]*?<\/c:numCache>/,
            ""
          );
          const points = addresses
            .map((address, index) => {
              const value = cells[address];
              const numericValue =
                typeof value === "number" && Number.isFinite(value)
                  ? value
                  : 0;
              return `<c:pt idx="${index}"><c:v>${formatNumber(
                numericValue
              )}</c:v></c:pt>`;
            })
            .join("");
          const cache =
            `<c:numCache><c:formatCode>${escapeXml(formatCode)}</c:formatCode>` +
            `<c:ptCount val="${addresses.length}"/>${points}</c:numCache>`;

          return `<c:numRef>${withoutCache}${cache}</c:numRef>`;
        }
      );

      zip.file(part, updated);
    })
  );
}

/*
 * Remove the stale calcChain (we replace formulas with literal values) and
 * force a full recalculation on open so the summary charts pick up the new
 * numbers immediately.
 */
async function prepareWorkbookMeta(zip) {
  if (zip.files["xl/calcChain.xml"]) {
    zip.remove("xl/calcChain.xml");
  }

  const relsPath = "xl/_rels/workbook.xml.rels";
  if (zip.files[relsPath]) {
    let rels = await zip.files[relsPath].async("string");
    rels = rels.replace(
      /<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/,
      ""
    );
    zip.file(relsPath, rels);
  }

  const contentTypesPath = "[Content_Types].xml";
  if (zip.files[contentTypesPath]) {
    let contentTypes = await zip.files[contentTypesPath].async("string");
    contentTypes = contentTypes.replace(
      /<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/,
      ""
    );
    zip.file(contentTypesPath, contentTypes);
  }

  const workbookPath = "xl/workbook.xml";
  if (zip.files[workbookPath]) {
    let workbook = await zip.files[workbookPath].async("string");
    workbook = workbook.replace(
      /<calcPr[^>]*\/>/,
      '<calcPr calcId="191029" fullCalcOnLoad="1"/>'
    );
    zip.file(workbookPath, workbook);
  }
}

export async function buildScoresheetWorkbook({
  templatePath,
  teacher,
  rows,
  enrolled,
  summary,
}) {
  const data = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(data);
  await applyOfficialClassSummaryCharts(zip, templatePath);

  const sharedStringsXml = await zip.files["xl/sharedStrings.xml"].async(
    "string"
  );
  const sharedStrings = new SharedStrings(sharedStringsXml);

  const scoresheet = new SheetEditor(
    await zip.files[PART["G3 ENG Reading Scoresheet"]].async("string"),
    sharedStrings
  );
  const classRecord = new SheetEditor(
    await zip.files[PART["Class Record"]].async("string"),
    sharedStrings
  );
  const classSummary = new SheetEditor(
    normalizeClassSummaryLayout(
      await zip.files[PART["Class Summary"]].async("string")
    ),
    sharedStrings
  );

  populateScoresheet(scoresheet, teacher, rows, enrolled);
  populateClassRecord(classRecord, teacher, rows);

  const summaryCells = buildClassSummaryCells(teacher, summary, enrolled);
  populateClassSummary(classSummary, summaryCells);

  await repointPieChart(zip);
  await refreshChartCaches(zip, summaryCells);
  await prepareWorkbookMeta(zip);

  zip.file("xl/sharedStrings.xml", sharedStrings.toXml());
  zip.file(PART["G3 ENG Reading Scoresheet"], scoresheet.xml);
  zip.file(PART["Class Record"], classRecord.xml);
  zip.file(PART["Class Summary"], classSummary.xml);

  const output = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return Buffer.from(output);
}
