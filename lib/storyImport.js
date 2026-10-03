/*
 * Story passage import.
 *
 * Teachers write their 100-word passages in Word or keep them as handouts, so
 * Manage Assessment can read a passage straight out of .txt, .docx and .pdf
 * files. Extraction is only ever a first draft: the caller shows the text back
 * to the teacher for review, editing or discarding before anything is saved,
 * and every guess this module makes is reported as a warning instead of being
 * hidden.
 *
 * Everything runs in the browser with the dependencies the app already ships:
 * .docx is a zip archive read with JSZip, and .pdf streams are inflated with
 * the platform's DecompressionStream. Nothing is uploaded and nothing is
 * fetched, so importing also works offline.
 */
import JSZip from "jszip";

export const STORY_IMPORT_FORMATS = Object.freeze({
  txt: "Plain text",
  docx: "Word document",
  pdf: "PDF",
});

/* A short first line is far more likely to be the passage's title. */
const DOCX_TITLE_WORD_LIMIT = 12;

/*
 * A heading is a label, not a sentence, so a first line that ends in sentence
 * punctuation stays part of the passage. Without this a passage saved as three
 * sentences and no heading would lose its opening sentence to the title.
 */
function looksLikeHeading(line) {
  const text = String(line || "").trim();
  if (!text) return false;
  if (/[.!?,;:]$/.test(text)) return false;
  return storyWordCount(text) <= DOCX_TITLE_WORD_LIMIT;
}

const XML_ENTITIES = Object.freeze({
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
});

export function storyImportFormatFor(fileName) {
  const name = String(fileName || "").trim().toLowerCase();
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".txt") || name.endsWith(".text")) return "txt";
  return "";
}

/*
 * The stored passage is always a single run of words, so every reader shares
 * one normaliser: whitespace collapses, stray control characters go, and the
 * result is what the 100-word rule counts.
 */
export function normalizeStoryText(value) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function storyWords(value) {
  const text = normalizeStoryText(value);
  return text ? text.split(" ") : [];
}

export function storyWordCount(value) {
  return storyWords(value).length;
}

function decodeXmlEntities(value) {
  return String(value || "").replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g,
    (match, body) => {
      if (body.startsWith("#")) {
        const code =
          body[1] === "x" || body[1] === "X"
            ? Number.parseInt(body.slice(2), 16)
            : Number.parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      const named = XML_ENTITIES[body.toLowerCase()];
      return named === undefined ? match : named;
    }
  );
}

function titleFromFileName(fileName) {
  const base = String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base;
}

function decodeTextBytes(bytes) {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  /*
   * Files saved by Notepad on a Windows machine are usually code page 1252. A
   * replacement character means the bytes were not UTF-8 at all, so the same
   * bytes read as 1252 recover the accented letters that would otherwise be
   * lost. Valid UTF-8 never produces one.
   */
  if (utf8.includes("\ufffd")) {
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

/* ---------------------------------------------------------------------- */
/* Plain text                                                              */
/* ---------------------------------------------------------------------- */

function extractPlainText(bytes) {
  return decodeTextBytes(bytes).replace(/\r\n?/g, "\n");
}

/* ---------------------------------------------------------------------- */
/* Word documents                                                          */
/* ---------------------------------------------------------------------- */

function docxParagraphs(xml) {
  const paragraphs = [];
  const paragraphPattern = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>|<w:p\b[^>]*\/>/g;
  let paragraphMatch;

  while ((paragraphMatch = paragraphPattern.exec(xml))) {
    const inner = paragraphMatch[1] || "";
    let text = "";
    const tokenPattern =
      /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:(?:br|cr)\b[^>]*\/?>/g;
    let tokenMatch;

    while ((tokenMatch = tokenPattern.exec(inner))) {
      if (tokenMatch[1] !== undefined) {
        text += decodeXmlEntities(tokenMatch[1]);
      } else if (tokenMatch[0].startsWith("<w:tab")) {
        text += " ";
      } else {
        text += "\n";
      }
    }

    paragraphs.push(text);
  }

  return paragraphs;
}

async function extractDocxText(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const entry =
    zip.file("word/document.xml") ||
    zip.file(/^word\/document[^/]*\.xml$/)[0] ||
    null;

  if (!entry) {
    throw new Error(
      "This Word file does not contain a document body. Save it again as .docx and retry."
    );
  }

  const xml = await entry.async("string");
  const paragraphs = docxParagraphs(xml)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, " ").trim())
    .filter((paragraph, index, all) => paragraph || all[index - 1]);

  return { paragraphs };
}

/* ---------------------------------------------------------------------- */
/* PDF                                                                     */
/* ---------------------------------------------------------------------- */

function bytesToBinaryString(bytes) {
  const chunkSize = 0x8000;
  let out = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    out += String.fromCharCode.apply(
      null,
      bytes.subarray(index, Math.min(index + chunkSize, bytes.length))
    );
  }
  return out;
}

function canInflate() {
  return typeof DecompressionStream === "function" && typeof Response === "function";
}

async function inflateBytes(bytes) {
  if (!canInflate()) return null;

  /*
   * The bytes between "stream" and "endstream" often carry the end-of-line
   * that precedes the keyword. That trailing byte is not part of the deflate
   * stream and the platform reader rejects it, so retry without it.
   */
  const attempts = [bytes];
  let trimmed = bytes;
  while (
    attempts.length < 3 &&
    trimmed.length > 0 &&
    (trimmed[trimmed.length - 1] === 0x0a || trimmed[trimmed.length - 1] === 0x0d)
  ) {
    trimmed = trimmed.subarray(0, trimmed.length - 1);
    attempts.push(trimmed);
  }

  for (const attempt of attempts) {
    try {
      const stream = new Blob([attempt]).stream().pipeThrough(new DecompressionStream("deflate"));
      const buffer = await new Response(stream).arrayBuffer();
      return new Uint8Array(buffer);
    } catch {
      /* Try the shorter payload, then give up. */
    }
  }

  return null;
}

function indexPdfObjects(binary, bytes) {
  const objects = new Map();
  const pattern = /(\d+)\s+(\d+)\s+obj\b/g;
  const heads = [];
  let match;

  while ((match = pattern.exec(binary))) {
    heads.push({ number: Number(match[1]), at: match.index, bodyAt: pattern.lastIndex });
  }

  heads.forEach((head, position) => {
    const limit = position + 1 < heads.length ? heads[position + 1].at : binary.length;
    const body = binary.slice(head.bodyAt, limit);
    const streamAt = /stream(?:\r\n|\n|\r)/.exec(body);

    if (!streamAt) {
      objects.set(head.number, { dict: body, stream: null });
      return;
    }

    const dataStart = head.bodyAt + streamAt.index + streamAt[0].length;
    const dict = body.slice(0, streamAt.index);
    const endAt = body.lastIndexOf("endstream");
    let dataEnd = endAt > streamAt.index ? head.bodyAt + endAt : limit;

    /*
     * A declared length is exact, while the bytes up to "endstream" include the
     * end-of-line that precedes it. Only a direct number is trusted: an
     * indirect /Length 12 0 R would read as the object number 12.
     */
    if (!/\/Length\s+\d+\s+\d+\s+R\b/.test(dict)) {
      const declared = dictNumber(dict, "Length");
      if (
        declared !== null &&
        declared > 0 &&
        dataStart + declared <= (endAt > streamAt.index ? head.bodyAt + endAt : limit)
      ) {
        dataEnd = dataStart + declared;
      }
    }

    objects.set(head.number, {
      dict,
      /*
       * Slice the original bytes, never the text: binary string offsets match
       * byte offsets one for one, and the stream has to stay bytes for the
       * tokeniser to read it as PDF syntax.
       */
      stream: bytes.slice(dataStart, dataEnd),
    });
  });

  return objects;
}

function dictNumber(dict, key) {
  const match = new RegExp(`/${key}\\b[^\\d]{0,12}?(\\d+)`).exec(dict || "");
  return match ? Number(match[1]) : null;
}

function resolveReference(dict, key) {
  const match = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(dict || "");
  return match ? Number(match[1]) : null;
}

function resolveReferenceList(dict, key) {
  const arrayMatch = new RegExp(`/${key}\\s*\\[([^\\]]*)\\]`).exec(dict || "");
  if (arrayMatch) {
    const refs = [];
    const referencePattern = /(\d+)\s+\d+\s+R/g;
    let match;
    while ((match = referencePattern.exec(arrayMatch[1]))) refs.push(Number(match[1]));
    return refs;
  }
  const single = resolveReference(dict, key);
  return single === null ? [] : [single];
}

async function decodePdfStream(entry, warnings) {
  if (!entry) return null;

  const dict = entry.dict || "";
  const hasFilter = /\/Filter\b/.test(dict);
  const flate = /\/FlateDecode\b/.test(dict);

  if (!hasFilter) return entry.stream;

  if (!flate) {
    warnings.add("Some part of this PDF is compressed in a way this app cannot read.");
    return null;
  }

  if (/\/Predictor\b/.test(dict) && !/\/Predictor\s+1\b/.test(dict)) {
    warnings.add("Some part of this PDF is compressed in a way this app cannot read.");
    return null;
  }

  if (!canInflate()) {
    warnings.add(
      "This browser cannot unpack PDF text. Try again in an up-to-date browser, or save the story as .docx or .txt."
    );
    return null;
  }

  const inflated = await inflateBytes(entry.stream);
  if (!inflated) {
    warnings.add("Part of this PDF could not be unpacked, so some words may be missing.");
    return null;
  }

  return inflated;
}

function parseHexStringToText(hex) {
  let out = "";
  for (let index = 0; index + 4 <= hex.length; index += 4) {
    out += String.fromCharCode(Number.parseInt(hex.slice(index, index + 4), 16));
  }
  return out;
}

function parseCMap(text) {
  const map = new Map();
  let codeBytes = 1;
  let sawTwoByteCode = false;

  const sections = (name) => {
    const pattern = new RegExp(`begin${name}([\\s\\S]*?)end${name}`, "g");
    const found = [];
    let match;
    while ((match = pattern.exec(text))) found.push(match[1]);
    return found;
  };

  for (const body of sections("codespacerange")) {
    const ranges = body.match(/<[0-9a-fA-F]+>\s*<[0-9a-fA-F]+>/g) || [];
    for (const range of ranges) {
      const hex = range.match(/<([0-9a-fA-F]+)>/);
      if (hex && hex[1].length >= 4) sawTwoByteCode = true;
    }
  }

  for (const body of sections("bfchar")) {
    const pairs = body.match(/<[0-9a-fA-F]+>\s*<[0-9a-fA-F]*>/g) || [];
    for (const pair of pairs) {
      const [source, target] = pair.match(/<([0-9a-fA-F]*)>/g) || [];
      if (!source || !target) continue;
      const code = Number.parseInt(source.slice(1, -1), 16);
      if (!Number.isFinite(code)) continue;
      if (source.length - 2 >= 4) sawTwoByteCode = true;
      map.set(code, parseHexStringToText(target.slice(1, -1)));
    }
  }

  for (const body of sections("bfrange")) {
    const pattern =
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[\s\S]*?\])/g;
    let match;
    while ((match = pattern.exec(body))) {
      const from = Number.parseInt(match[1], 16);
      const to = Number.parseInt(match[2], 16);
      if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 65535) {
        continue;
      }
      if (match[1].length >= 4) sawTwoByteCode = true;

      if (match[3].startsWith("[")) {
        const targets = match[3].match(/<[0-9a-fA-F]*>/g) || [];
        targets.forEach((target, offset) => {
          map.set(from + offset, parseHexStringToText(target.slice(1, -1)));
        });
      } else {
        const start = Number.parseInt(match[3].slice(1, -1), 16);
        if (!Number.isFinite(start)) continue;
        for (let code = from; code <= to; code += 1) {
          map.set(code, String.fromCharCode(start + (code - from)));
        }
      }
    }
  }

  if (sawTwoByteCode && map.size > 0) {
    const longest = Math.max(
      ...Array.from(map.keys()).map((code) => (code > 0xffff ? 3 : code > 0xff ? 2 : 1))
    );
    codeBytes = longest;
  }

  return { map, codeBytes, twoByte: sawTwoByteCode };
}

function decodeWithCMap(bytes, cMap) {
  if (!cMap || !cMap.map.size) return null;
  let out = "";

  if (cMap.codeBytes >= 2) {
    for (let index = 0; index + 1 < bytes.length; index += 2) {
      const code = (bytes[index] << 8) | bytes[index + 1];
      out += cMap.map.get(code) ?? "";
    }
  } else {
    for (const byte of bytes) {
      out += cMap.map.get(byte) ?? "";
    }
  }

  return out;
}

function decodeWithWinAnsi(bytes) {
  try {
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    return bytesToBinaryString(bytes);
  }
}

function readLiteralString(bytes, start) {
  const out = [];
  let depth = 1;
  let index = start + 1;

  while (index < bytes.length) {
    const byte = bytes[index];

    if (byte === 0x5c) {
      const next = bytes[index + 1];
      if (next === undefined) break;
      if (next === 0x6e) { out.push(0x0a); index += 2; continue; }
      if (next === 0x72) { out.push(0x0d); index += 2; continue; }
      if (next === 0x74) { out.push(0x09); index += 2; continue; }
      if (next === 0x62) { out.push(0x08); index += 2; continue; }
      if (next === 0x66) { out.push(0x0c); index += 2; continue; }
      if (next === 0x28 || next === 0x29 || next === 0x5c) {
        out.push(next);
        index += 2;
        continue;
      }
      if (next === 0x0a) { index += 2; continue; }
      if (next === 0x0d) { index += bytes[index + 2] === 0x0a ? 3 : 2; continue; }
      if (next >= 0x30 && next <= 0x37) {
        let octal = "";
        let cursor = index + 1;
        while (cursor < bytes.length && octal.length < 3) {
          const digit = bytes[cursor];
          if (digit < 0x30 || digit > 0x37) break;
          octal += String.fromCharCode(digit);
          cursor += 1;
        }
        out.push(Number.parseInt(octal, 8) & 0xff);
        index = cursor;
        continue;
      }
      out.push(next);
      index += 2;
      continue;
    }

    if (byte === 0x28) { depth += 1; out.push(byte); index += 1; continue; }
    if (byte === 0x29) {
      depth -= 1;
      index += 1;
      if (depth === 0) break;
      out.push(byte);
      continue;
    }

    out.push(byte);
    index += 1;
  }

  return [new Uint8Array(out), index];
}

function tokenizePdfContent(bytes) {
  const tokens = [];
  let index = 0;

  while (index < bytes.length) {
    const byte = bytes[index];

    if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x0c || byte === 0x00) {
      index += 1;
      continue;
    }

    if (byte === 0x25) {
      while (index < bytes.length && bytes[index] !== 0x0a && bytes[index] !== 0x0d) index += 1;
      continue;
    }

    if (byte === 0x28) {
      const [value, next] = readLiteralString(bytes, index);
      tokens.push({ type: "string", value });
      index = next;
      continue;
    }

    if (byte === 0x3c) {
      if (bytes[index + 1] === 0x3c) { tokens.push({ type: "dictStart" }); index += 2; continue; }
      let cursor = index + 1;
      let hex = "";
      while (cursor < bytes.length && bytes[cursor] !== 0x3e) {
        const character = String.fromCharCode(bytes[cursor]);
        if (/[0-9a-fA-F]/.test(character)) hex += character;
        cursor += 1;
      }
      if (hex.length % 2) hex += "0";
      const value = new Uint8Array(hex.length / 2);
      for (let at = 0; at < value.length; at += 1) {
        value[at] = Number.parseInt(hex.slice(at * 2, at * 2 + 2), 16);
      }
      tokens.push({ type: "string", value });
      index = cursor + 1;
      continue;
    }

    if (byte === 0x3e && bytes[index + 1] === 0x3e) { tokens.push({ type: "dictEnd" }); index += 2; continue; }
    if (byte === 0x5b) { tokens.push({ type: "arrayStart" }); index += 1; continue; }
    if (byte === 0x5d) { tokens.push({ type: "arrayEnd" }); index += 1; continue; }

    if (byte === 0x2f) {
      let cursor = index + 1;
      let name = "";
      while (cursor < bytes.length && !/[\s/<>\[\](){}%]/.test(String.fromCharCode(bytes[cursor]))) {
        name += String.fromCharCode(bytes[cursor]);
        cursor += 1;
      }
      tokens.push({ type: "name", value: name });
      index = cursor;
      continue;
    }

    const character = String.fromCharCode(byte);
    if (/[+\-.0-9]/.test(character)) {
      let cursor = index;
      let text = "";
      while (cursor < bytes.length && /[+\-.0-9eE]/.test(String.fromCharCode(bytes[cursor]))) {
        text += String.fromCharCode(bytes[cursor]);
        cursor += 1;
      }
      const value = Number.parseFloat(text);
      tokens.push({ type: "number", value: Number.isFinite(value) ? value : 0 });
      index = cursor;
      continue;
    }

    let cursor = index;
    let operator = "";
    while (cursor < bytes.length && !/[\s/<>\[\](){}%]/.test(String.fromCharCode(bytes[cursor]))) {
      operator += String.fromCharCode(bytes[cursor]);
      cursor += 1;
    }
    tokens.push({ type: "operator", value: operator });
    index = cursor > index ? cursor : index + 1;
  }

  return tokens;
}

function pdfContentToLines(bytes, decodeFor) {
  const tokens = tokenizePdfContent(bytes);
  const lines = [];
  let line = "";
  let currentFont = "";
  let pendingFont = "";
  const stack = [];

  const flushLine = () => {
    const trimmed = line.replace(/\s+/g, " ").trim();
    if (trimmed) lines.push(trimmed);
    line = "";
  };

  const show = (value) => {
    if (!value) return;
    line += value;
  };

  for (const token of tokens) {
    if (token.type === "string") { stack.push(token.value); continue; }
    if (token.type === "number" || token.type === "name") { stack.push(token.value); continue; }
    if (token.type === "arrayStart" || token.type === "arrayEnd") {
      /*
       * A TJ array's strings and kerns are operands like any other. Skipping
       * the brackets keeps them, which is what makes "[ (word) -250 ] TJ"
       * read as a word followed by a space.
       */
      continue;
    }
    if (token.type === "dictStart" || token.type === "dictEnd") {
      stack.length = 0;
      continue;
    }
    if (token.type !== "operator") continue;

    const operator = token.value;
    const operands = stack.slice();
    stack.length = 0;

    if (operator === "Tf") {
      const name = operands.find((operand) => typeof operand === "string");
      pendingFont = name || pendingFont;
      currentFont = pendingFont;
      continue;
    }

    if (operator === "Tj") {
      const value = operands.find((operand) => operand instanceof Uint8Array);
      show(value ? decodeFor(value, currentFont) : "");
      continue;
    }

    if (operator === "TJ") {
      let text = "";
      for (const operand of operands) {
        if (operand instanceof Uint8Array) {
          text += decodeFor(operand, currentFont);
        } else if (typeof operand === "number") {
          /* A wide negative kern is how a PDF spells a word space. */
          if (operand < -120 && text && !text.endsWith(" ")) text += " ";
        }
      }
      show(text);
      continue;
    }

    if (operator === "'" || operator === "\"") {
      const value = operands.find((operand) => operand instanceof Uint8Array);
      show(value ? decodeFor(value, currentFont) : "");
      flushLine();
      continue;
    }

    if (operator === "Td" || operator === "TD") {
      const numbers = operands.filter((operand) => typeof operand === "number");
      const y = numbers.length >= 2 ? numbers[numbers.length - 1] : 0;
      if (Math.abs(y) > 0.5) flushLine();
      continue;
    }

    if (operator === "T*") { flushLine(); continue; }
  }

  flushLine();
  return lines;
}

function parseFontResources(dict) {
  const map = new Map();
  const pattern = /\/Font\s*<<([\s\S]*?)>>/g;
  let match;

  while ((match = pattern.exec(dict || ""))) {
    const referencePattern = /\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g;
    let reference;
    while ((reference = referencePattern.exec(match[1]))) {
      map.set(reference[1], Number(reference[2]));
    }
  }

  return map;
}

async function buildFontDecoders(objects, warnings) {
  const decoders = new Map();
  let compositeWithoutMap = false;

  for (const [number, entry] of objects) {
    const dict = entry.dict || "";
    if (!/\/Type\s*\/Font\b/.test(dict) && !/\/ToUnicode\b/.test(dict)) continue;

    const isComposite = /\/Subtype\s*\/Type0\b/.test(dict);
    const toUnicode = resolveReference(dict, "ToUnicode");
    let cMap = null;

    if (toUnicode !== null) {
      const decoded = await decodePdfStream(objects.get(toUnicode), warnings);
      if (decoded) {
        cMap = parseCMap(bytesToBinaryString(decoded));
        if (!cMap.map.size) cMap = null;
      }
    }

    if (!cMap && isComposite) compositeWithoutMap = true;

    decoders.set(number, (bytes) => {
      if (cMap) {
        const mapped = decodeWithCMap(bytes, cMap);
        if (mapped !== null) return mapped;
      }
      return decodeWithWinAnsi(bytes);
    });
  }

  if (compositeWithoutMap) {
    warnings.add(
      "This PDF uses an embedded font this app cannot map back to letters, so some words may be wrong. Check the passage carefully, or save the story as .docx."
    );
  }

  return decoders;
}

async function extractPdfText(bytes, warnings) {
  const binary = bytesToBinaryString(bytes);
  const objects = indexPdfObjects(binary, bytes);
  const decoders = await buildFontDecoders(objects, warnings);

  const pageNumbers = [];
  for (const [number, entry] of objects) {
    if (/\/Type\s*\/Page\b(?!s)/.test(entry.dict || "")) pageNumbers.push(number);
  }

  const fallbackFonts = new Map();
  for (const entry of objects.values()) {
    for (const [name, number] of parseFontResources(entry.dict || "")) {
      if (!fallbackFonts.has(name)) fallbackFonts.set(name, number);
    }
  }

  const contentStreams = [];

  for (const pageNumber of pageNumbers) {
    const page = objects.get(pageNumber);
    const pageFonts = parseFontResources(page.dict || "");
    const fontFor = new Map([...fallbackFonts, ...pageFonts]);
    const contents = resolveReferenceList(page.dict || "", "Contents");

    for (const reference of contents) {
      const decoded = await decodePdfStream(objects.get(reference), warnings);
      if (decoded && decoded.length) contentStreams.push({ bytes: decoded, fontFor });
    }
  }

  if (!contentStreams.length) {
    /*
     * Page objects can live inside compressed object streams, which this
     * reader does not unpack. Every content stream is still a stream of its
     * own, so read the ones that actually draw text.
     */
    for (const entry of objects.values()) {
      if (!entry.stream || !entry.stream.length) continue;
      const decoded = await decodePdfStream(entry, warnings);
      if (!decoded || !decoded.length) continue;
      const head = bytesToBinaryString(decoded.subarray(0, 2048));
      if (!/\bBT\b/.test(head) || !/(Tj|TJ)\b/.test(head)) continue;
      contentStreams.push({ bytes: decoded, fontFor: fallbackFonts });
    }
  }

  if (!contentStreams.length) {
    return { lines: [], foundText: false };
  }

  const lines = [];

  for (const content of contentStreams) {
    const decodeFor = (value, fontName) => {
      const fontNumber = content.fontFor.get(fontName);
      const decoder = fontNumber === undefined ? undefined : decoders.get(fontNumber);
      return decoder ? decoder(value) : decodeWithWinAnsi(value);
    };
    lines.push(...pdfContentToLines(content.bytes, decodeFor));
  }

  return { lines, foundText: lines.some((line) => line.trim().length > 0) };
}

/* ---------------------------------------------------------------------- */
/* Public entry point                                                      */
/* ---------------------------------------------------------------------- */

function suspiciousCharacterRatio(text) {
  const sample = text.replace(/\s/g, "");
  if (!sample) return 0;
  const suspicious = sample.match(/[\ufffd\u0000-\u001f]|[^\p{L}\p{N}\p{P}\p{Zs}]/gu) || [];
  return suspicious.length / sample.length;
}

export async function extractStoryFromFile(file) {
  const name = String(file?.name || "");
  const format = storyImportFormatFor(name);
  const warnings = new Set();
  const base = {
    fileName: name,
    format,
    formatLabel: STORY_IMPORT_FORMATS[format] || "File",
    title: titleFromFileName(name),
    warnings: [],
    usedFirstLineAsTitle: false,
  };

  if (!format) {
    throw new Error("Choose a .txt, .docx or .pdf file.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) {
    throw new Error("That file is empty.");
  }

  let text = "";

  if (format === "txt") {
    text = extractPlainText(bytes);
  }

  if (format === "docx") {
    const { paragraphs } = await extractDocxText(bytes);
    const usable = paragraphs.filter((paragraph) => paragraph.trim().length > 0);
    /*
     * A Word document usually opens with its title on a line of its own. When
     * the first line reads like a heading it is offered as the title, and the
     * overlay says so, so a wrong guess is one edit away.
     */
    if (usable.length > 1 && looksLikeHeading(usable[0])) {
      base.title = usable[0].trim();
      base.usedFirstLineAsTitle = true;
      text = usable.slice(1).join("\n");
    } else {
      text = usable.join("\n");
    }
  }

  if (format === "pdf") {
    const { lines, foundText } = await extractPdfText(bytes, warnings);
    text = lines.join("\n");
    if (!foundText) {
      warnings.add(
        "No readable text was found in this PDF. If it is a scan or a photo, the words cannot be copied out - type the passage or save it as .docx."
      );
    }
  }

  const cleaned = text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");

  const words = storyWordCount(cleaned);
  if (words > 0 && words < 20) {
    warnings.add(
      `Only ${words} ${words === 1 ? "word was" : "words were"} found. Check that the whole passage is here.`
    );
  }

  if (suspiciousCharacterRatio(cleaned) > 0.05) {
    warnings.add(
      "Parts of this text did not read cleanly and may contain wrong letters. Compare it with the original before saving."
    );
  }

  return {
    ...base,
    text: cleaned,
    wordCount: words,
    warnings: Array.from(warnings),
  };
}
