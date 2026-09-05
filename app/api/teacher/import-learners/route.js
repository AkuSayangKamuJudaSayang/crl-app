import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import * as XLSX from "xlsx";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JWT_SECRET =
  process.env.JWT_SECRET || process.env.AUTH_SECRET || "";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMPORTED_ROWS = 500;
const HEADER_SCAN_ROWS = 40;

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeLrn(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\D/g, "")
    .trim();
}

function normalizeSex(value) {
  const v = normalizeText(value);
  if (!v) return "";
  if (["M", "MALE", "BOY"].includes(v)) return "Male";
  if (["F", "FEMALE", "GIRL"].includes(v)) return "Female";
  return "";
}

function headerScore(value, terms) {
  const normalized = normalizeText(value);
  return terms.some((term) => normalized.includes(term)) ? 1 : 0;
}

function detectColumns(rows) {
  let best = null;

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, HEADER_SCAN_ROWS); rowIndex += 1) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
    let lrnCol = -1;
    let sexCol = -1;
    let nameCol = -1;
    let lastCol = -1;
    let firstCol = -1;
    let middleCol = -1;

    row.forEach((cell, colIndex) => {
      const h = normalizeText(cell);

      if (lrnCol === -1 && /\bLRN\b|LEARNER REFERENCE NUMBER/.test(h)) {
        lrnCol = colIndex;
      }

      if (sexCol === -1 && /\bSEX\b|\bGENDER\b/.test(h)) {
        sexCol = colIndex;
      }

      if (
        nameCol === -1 &&
        h.includes("NAME") &&
        (h.includes("LAST NAME") || h.includes("LAST, FIRST") || h.includes("FIRST NAME") || h.includes("MIDDLE NAME"))
      ) {
        nameCol = colIndex;
      }

      if (lastCol === -1 && /LAST NAME|SURNAME|FAMILY NAME/.test(h)) {
        lastCol = colIndex;
      }

      if (firstCol === -1 && /FIRST NAME|GIVEN NAME/.test(h)) {
        firstCol = colIndex;
      }

      if (middleCol === -1 && /MIDDLE NAME|MIDDLE INITIAL/.test(h)) {
        middleCol = colIndex;
      }
    });

    const score =
      (lrnCol >= 0 ? 4 : 0) +
      (sexCol >= 0 ? 2 : 0) +
      (nameCol >= 0 ? 4 : 0) +
      (lastCol >= 0 ? 2 : 0) +
      (firstCol >= 0 ? 2 : 0) +
      (middleCol >= 0 ? 1 : 0);

    if (!best || score > best.score) {
      best = {
        rowIndex,
        score,
        lrnCol,
        sexCol,
        nameCol,
        lastCol,
        firstCol,
        middleCol,
      };
    }
  }

  if (!best || best.lrnCol < 0 || (best.nameCol < 0 && (best.lastCol < 0 || best.firstCol < 0))) {
    return null;
  }

  return best;
}

function parseCombinedName(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { lastName: "", firstName: "", middleName: "" };

  const pieces = raw
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean);

  if (pieces.length >= 3) {
    return {
      lastName: pieces[0],
      firstName: pieces[1],
      middleName: pieces.slice(2).join(", "),
    };
  }

  if (pieces.length === 2) {
    return {
      lastName: pieces[0],
      firstName: pieces[1],
      middleName: "",
    };
  }

  return {
    lastName: "",
    firstName: pieces[0],
    middleName: "",
  };
}

function buildLearnerFromRow(row, columns) {
  const lrn = normalizeLrn(row[columns.lrnCol]);
  const sex = columns.sexCol >= 0 ? normalizeSex(row[columns.sexCol]) : "";

  let lastName = "";
  let firstName = "";
  let middleName = "";

  if (columns.nameCol >= 0) {
    const parsed = parseCombinedName(row[columns.nameCol]);
    lastName = parsed.lastName;
    firstName = parsed.firstName;
    middleName = parsed.middleName;
  } else {
    lastName = String(row[columns.lastCol] ?? "").trim();
    firstName = String(row[columns.firstCol] ?? "").trim();
    middleName = columns.middleCol >= 0 ? String(row[columns.middleCol] ?? "").trim() : "";
  }

  return {
    lrn,
    lastName,
    firstName,
    middleName,
    sex,
  };
}

function meaningfulLearner(candidate) {
  return (
    /^\d{10,12}$/.test(candidate.lrn) &&
    candidate.lastName.length > 0 &&
    candidate.firstName.length > 0
  );
}

async function authenticate(request) {
  if (!JWT_SECRET) return null;

  const cookieToken = request.cookies.get("crla_token")?.value;
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;
  const token = cookieToken || bearer;

  if (!token) return null;

  try {
    const verified = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET)
    );

    const id = Number(verified.payload.id ?? verified.payload.sub ?? 0);
    const role = String(verified.payload.role ?? "").toLowerCase();

    if (!Number.isInteger(id) || id <= 0) return null;
    if (role !== "teacher" && role !== "admin") return null;

    return { id, role };
  } catch {
    return null;
  }
}

export async function POST(request) {
  const auth = await authenticate(request);
  if (!auth) {
    return json({ error: "Authentication required." }, 401);
  }

  let file;
  try {
    const formData = await request.formData();
    file = formData.get("file");
  } catch {
    return json({ error: "Unable to read the uploaded file." }, 400);
  }

  if (!file || typeof file.arrayBuffer !== "function") {
    return json({ error: "Please choose an Excel class record file." }, 400);
  }

  if (file.size > MAX_FILE_BYTES) {
    return json({ error: "The Excel file is too large. Maximum allowed size is 10 MB." }, 413);
  }

  const lowerName = String(file.name || "").toLowerCase();
  if (!/\.(xls|xlsx|csv)$/.test(lowerName)) {
    return json({ error: "Unsupported file type. Please upload .xls, .xlsx, or .csv." }, 415);
  }

  try {
    // The upload is read directly into memory and is never written to disk or object storage.
    // Once this request completes, the temporary file object is discarded by the runtime.
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: false,
      raw: true,
    });

    let bestSheet = null;
    let bestRows = [];
    let bestColumns = null;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: true,
        defval: "",
        blankrows: false,
      });

      const columns = detectColumns(rows);
      if (!columns) continue;

      const sampleRows = rows.slice(columns.rowIndex + 1);
      const meaningful = sampleRows.filter((row) => meaningfulLearner(buildLearnerFromRow(row, columns))).length;

      if (!bestSheet || meaningful > bestRows.length) {
        bestSheet = sheetName;
        bestRows = sampleRows;
        bestColumns = columns;
      }
    }

    if (!bestColumns) {
      return json(
        {
          error:
            "No relevant learner information was found. The file must contain an LRN column and learner name information. No records were added.",
          code: "NO_RELEVANT_LEARNER_DATA",
        },
        422
      );
    }

    const extracted = [];
    const skipped = [];
    const seen = new Set();

    for (let index = 0; index < bestRows.length; index += 1) {
      const row = bestRows[index];
      const rowNumber = bestColumns.rowIndex + index + 2;
      const candidate = buildLearnerFromRow(row, bestColumns);

      const rowHasSomething = Object.values(candidate).some((value) => String(value).trim() !== "");
      if (!rowHasSomething) continue;

      if (!meaningfulLearner(candidate)) {
        skipped.push({
          row: rowNumber,
          reason: "Missing valid LRN or learner name.",
        });
        continue;
      }

      if (seen.has(candidate.lrn)) {
        skipped.push({
          row: rowNumber,
          reason: "Duplicate LRN inside the uploaded file.",
        });
        continue;
      }

      seen.add(candidate.lrn);
      extracted.push(candidate);

      if (extracted.length >= MAX_IMPORTED_ROWS) break;
    }

    if (extracted.length === 0) {
      return json(
        {
          error:
            "The workbook was readable, but no learner records with a valid 10–12 digit LRN and learner name were found. No records were added.",
          code: "NO_IMPORTABLE_LEARNERS",
          sheet: bestSheet,
          skippedCount: skipped.length,
        },
        422
      );
    }

    const teacher = await prisma.user.findUnique({
      where: { id: auth.id },
      select: { id: true, section: true },
    });

    if (!teacher) {
      return json({ error: "Authenticated teacher account not found." }, 401);
    }

    const lrns = extracted.map((item) => item.lrn);
    const existing = await prisma.learner.findMany({
      where: { lrn: { in: lrns } },
      select: { lrn: true },
    });
    const existingSet = new Set(existing.map((item) => item.lrn));

    const toCreate = extracted
      .filter((item) => !existingSet.has(item.lrn))
      .map((item) => ({
        lrn: item.lrn,
        firstName: item.firstName,
        middleName: item.middleName || null,
        suffix: null,
        lastName: item.lastName,
        sex: item.sex || null,
        gradeLevel: 3,
        section: teacher.section || null,
        teacherId: teacher.id,
      }));

    const importedResult = await prisma.learner.createMany({
      data: toCreate,
      skipDuplicates: true,
    });

    const duplicateCount = extracted.length - toCreate.length;

    return json({
      status: "ok",
      sheet: bestSheet,
      extractedCount: extracted.length,
      importedCount: importedResult.count,
      skippedCount: skipped.length + duplicateCount,
      duplicateCount,
      skippedRows: skipped.slice(0, 50),
      maxRowsReached: extracted.length >= MAX_IMPORTED_ROWS,
      message:
        importedResult.count === 0
          ? "No new learners were added because all extracted LRNs are already registered."
          : `Imported ${importedResult.count} learner${importedResult.count === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    console.error("Class-record learner import failed:", error);
    return json(
      {
        error:
          "The class record could not be processed. Make sure it is a valid Excel workbook and contains the learner roster.",
      },
      500
    );
  }
}
