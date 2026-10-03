/*
 * Guards the story import readers.
 *
 * Manage Assessment can read a passage out of a .txt, .docx or .pdf file. The
 * .docx and .pdf readers are hand-written so the app needs no extra dependency
 * and importing also works offline, which means their behaviour has to be
 * pinned down here rather than trusted. Every case below is a file shape a real
 * teacher's passage arrives in:
 *
 *   - plain text, UTF-8 and code page 1252
 *   - a Word document with a heading and without one
 *   - a PDF with a plain, a Flate-compressed and a kerned TJ content stream
 *   - a PDF whose text needs a composite font's ToUnicode map
 *   - a PDF whose page objects are not readable at all
 *   - a scanned PDF, which must produce nothing and say so
 *
 * Runs as part of npm run verify:assessment, so it gates every build.
 */
import { createRequire } from "node:module";
import zlib from "node:zlib";
import { extractStoryFromFile, storyWordCount, normalizeStoryText } from "../lib/storyImport.js";
import { BOSY_DEFAULT_STORIES } from "../lib/assessmentContent.js";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const PASSAGE = BOSY_DEFAULT_STORIES[0].text;
const TITLE = BOSY_DEFAULT_STORIES[0].title;
check("the fixture is a real 100-word passage", storyWordCount(PASSAGE) === 100, String(storyWordCount(PASSAGE)));

const file = (name, bytes) => new File([bytes], name);

function wordsToLines(words, perLine) {
  const lines = [];
  for (let index = 0; index < words.length; index += perLine) {
    lines.push(words.slice(index, index + perLine).join(" "));
  }
  return lines;
}

/* ---------------------------------------------------------------- TXT --- */
console.log("=== plain text ===");
{
  const result = await extractStoryFromFile(file("para-the-parrot.txt", Buffer.from(PASSAGE, "utf8")));
  check("format detected", result.format === "txt");
  check("passage read exactly", normalizeStoryText(result.text) === PASSAGE);
  check("word count is 100", result.wordCount === 100, String(result.wordCount));
  check("title guessed from the file name", result.title === "para the parrot", result.title);
  check("no warnings", result.warnings.length === 0, result.warnings.join(" | "));
}
{
  /* Notepad on Windows writes code page 1252, not UTF-8: 0x92 is a curly quote. */
  const utf8 = Buffer.from(PASSAGE.replace("Para", "Para's"), "utf8");
  const at = utf8.indexOf(0x27);
  const latin = Buffer.from(utf8);
  latin[at] = 0x92;
  const result = await extractStoryFromFile(file("windows.txt", latin));
  check("a code page 1252 file keeps its punctuation", result.text.includes("Para\u2019s"), result.text.slice(0, 20));
}

/* --------------------------------------------------------------- DOCX --- */
console.log("\n=== Word document ===");
function buildDocx(paragraphs) {
  const escape = (value) =>
    String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = paragraphs
    .map((paragraph) => `<w:p><w:r><w:t xml:space="preserve">${escape(paragraph)}</w:t></w:r></w:p>`)
    .join("");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}
{
  const bytes = await buildDocx([TITLE, ...wordsToLines(PASSAGE.split(" "), 12)]);
  const result = await extractStoryFromFile(file("Para the Parrot.docx", bytes));
  check("format detected", result.format === "docx");
  check("the heading became the title", result.usedFirstLineAsTitle && result.title === TITLE, result.title);
  check("passage read exactly", normalizeStoryText(result.text) === PASSAGE);
  check("word count is 100", result.wordCount === 100, String(result.wordCount));
}
{
  /* Without a heading the whole document is the passage. */
  const long = `${PASSAGE} ${PASSAGE}`.split(" ").slice(0, 100).join(" ");
  const bytes = await buildDocx(long.split(/(?<=\.)\s+/));
  const result = await extractStoryFromFile(file("no-heading.docx", bytes));
  check("a document without a heading keeps every word", result.wordCount === 100, String(result.wordCount));
  check("the title falls back to the file name", result.title === "no heading", result.title);
}
{
  const bytes = await buildDocx(["Para & friends <fly>", PASSAGE]);
  const result = await extractStoryFromFile(file("entities.docx", bytes));
  check("xml entities are decoded", result.title === "Para & friends <fly>", result.title);
}

/* ---------------------------------------------------------------- PDF --- */
console.log("\n=== PDF ===");
function buildPdf({ objects, compress, type0 }) {
  const parts = ["%PDF-1.4\n"];
  for (const [number, body] of objects) {
    if (typeof body === "string") {
      parts.push(`${number} 0 obj\n${body}\nendobj\n`);
    } else {
      const raw = body.stream;
      const data = compress ? zlib.deflateSync(raw) : raw;
      parts.push(
        `${number} 0 obj\n<< /Length ${data.length}${compress ? " /Filter /FlateDecode" : ""} >>\nstream\n`
      );
      parts.push(data);
      parts.push("\nendstream\nendobj\n");
    }
  }
  parts.push(`trailer\n<< /Root 1 0 R >>\n%%EOF\n`);
  return Buffer.concat(parts.map((part) => (Buffer.isBuffer(part) ? part : Buffer.from(part, "latin1"))));
}

function simpleContent() {
  const lines = wordsToLines(PASSAGE.split(" "), 10);
  const body = lines
    .map((line, index) => {
      const escaped = line.replace(/([()\\])/g, "\\$1");
      return index === 0
        ? `BT /F1 12 Tf 72 720 Td (${escaped}) Tj`
        : `0 -14 Td (${escaped}) Tj`;
    })
    .join("\n");
  return Buffer.from(`${body}\nET`, "latin1");
}

for (const compress of [false, true]) {
  const pdf = buildPdf({
    compress,
    objects: [
      [1, "<< /Type /Catalog /Pages 2 0 R >>"],
      [2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
      [3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"],
      [4, { stream: simpleContent() }],
      [5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"],
    ],
  });
  const result = await extractStoryFromFile(file(`para-${compress ? "flate" : "plain"}.pdf`, pdf));
  check(`${compress ? "compressed" : "plain"} pdf: format detected`, result.format === "pdf");
  check(`${compress ? "compressed" : "plain"} pdf: passage read exactly`, normalizeStoryText(result.text) === PASSAGE, normalizeStoryText(result.text).slice(0, 60));
  check(`${compress ? "compressed" : "plain"} pdf: word count is 100`, result.wordCount === 100, String(result.wordCount));
  check(`${compress ? "compressed" : "plain"} pdf: no warnings`, result.warnings.length === 0, result.warnings.join(" | "));
}

/* A PDF whose text uses a TJ array with kerning, as most writers emit. */
{
  const words = PASSAGE.split(" ");
  const body = words
    .map((word, index) =>
      index === 0
        ? `BT /F1 12 Tf 72 720 Td [(${word}) -250] TJ`
        : `[(${word}) -250] TJ`
    )
    .join("\n");
  const pdf = buildPdf({
    objects: [
      [1, "<< /Type /Catalog /Pages 2 0 R >>"],
      [2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
      [3, "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"],
      [4, { stream: Buffer.from(`${body}\nET`, "latin1") }],
      [5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"],
    ],
  });
  const result = await extractStoryFromFile(file("kerned.pdf", pdf));
  check("a kerned TJ array keeps its word spaces", result.wordCount === 100, String(result.wordCount));
  check("a kerned TJ array reads exactly", normalizeStoryText(result.text) === PASSAGE);
}

/* A composite font that needs its ToUnicode map, the hard case. */
{
  const cmapEntries = [];
  /* Keep the space: it needs a code of its own or the words run together. */
  const unique = Array.from(new Set(PASSAGE.split("")));
  unique.forEach((character, index) => {
    cmapEntries.push(`<${(index + 1).toString(16).padStart(4, "0")}> <${character.charCodeAt(0).toString(16).padStart(4, "0")}>`);
  });
  const codeFor = new Map(unique.map((character, index) => [character, index + 1]));
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${Math.ceil(cmapEntries.length / 100)} beginbfchar\n${cmapEntries.join("\n")}\nendbfchar\nendcmap\nend\nend`;
  const hexFor = (text) =>
    Array.from(text)
      .map((character) => (codeFor.get(character) || 0).toString(16).padStart(4, "0"))
      .join("");
  const lines = wordsToLines(PASSAGE.split(" "), 10);
  const body = lines
    .map((line, index) =>
      index === 0
        ? `BT /F2 12 Tf 72 720 Td <${hexFor(line)}> Tj`
        : `0 -14 Td <${hexFor(line)}> Tj`
    )
    .join("\n");
  const pdf = buildPdf({
    objects: [
      [1, "<< /Type /Catalog /Pages 2 0 R >>"],
      [2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
      [3, "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F2 5 0 R >> >> /Contents 4 0 R >>"],
      [4, { stream: Buffer.from(`${body}\nET`, "latin1") }],
      [5, "<< /Type /Font /Subtype /Type0 /BaseFont /Subset+Serif /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>"],
      [6, "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Subset+Serif >>"],
      [7, { stream: Buffer.from(cmap, "latin1") }],
    ],
  });
  const result = await extractStoryFromFile(file("identity-h.pdf", pdf));
  check("an Identity-H pdf is mapped through ToUnicode", normalizeStoryText(result.text) === PASSAGE, normalizeStoryText(result.text).slice(0, 70));
  check("an Identity-H pdf counts 100 words", result.wordCount === 100, String(result.wordCount));
}

/* A pdf whose pages are hidden inside object streams still yields its text. */
{
  const pdf = buildPdf({
    objects: [
      [1, "<< /Type /Catalog /Pages 2 0 R >>"],
      [4, { stream: simpleContent() }],
      [5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"],
    ],
  });
  const result = await extractStoryFromFile(file("no-page-object.pdf", pdf));
  check("a pdf without readable page objects still finds the text", result.wordCount === 100, String(result.wordCount));
}

/* A scanned pdf has no text at all and must say so. */
{
  const pdf = buildPdf({
    objects: [
      [1, "<< /Type /Catalog /Pages 2 0 R >>"],
      [2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
      [3, "<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>"],
      [4, { stream: Buffer.from("q 612 0 0 792 0 0 cm /Im0 Do Q", "latin1") }],
    ],
  });
  const result = await extractStoryFromFile(file("scan.pdf", pdf));
  check("a scan reports no readable text", result.warnings.some((warning) => /No readable text/.test(warning)), result.warnings.join(" | "));
  check("a scan yields no words", result.wordCount === 0, String(result.wordCount));
}

/* ------------------------------------------------------------ errors --- */
console.log("\n=== rejected input ===");
for (const name of ["story.docx.bak", "story.png", "story"]) {
  let threw = false;
  try {
    await extractStoryFromFile(file(name, Buffer.from("x")));
  } catch {
    threw = true;
  }
  check(`${name} is rejected`, threw);
}
{
  let message = "";
  try {
    await extractStoryFromFile(file("empty.txt", Buffer.alloc(0)));
  } catch (error) {
    message = error.message;
  }
  check("an empty file is rejected", /empty/i.test(message), message);
}

console.log(failures ? `\n${failures} IMPORT CHECK(S) FAILED` : "\nVerified story import: txt, docx and pdf passages are read for review.");
process.exit(failures ? 1 : 0);
