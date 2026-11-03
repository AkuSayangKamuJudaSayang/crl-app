import {importSection} from '../../../../lib/coordinatorSections';
import {getAdminUser} from '../../../../lib/adminAuth';
import { learnerNameKey } from "../../../../lib/classWorkspace.mjs";
import { requireClass, lockClass, assertRosterVersion } from "../../../../lib/classWorkspaces";
import JSZip from "jszip";
import { Readable } from "node:stream";
import { logSecureError } from "../../../../lib/security";
import { writeAudit } from "../../../../lib/adminHistory";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    let suffixCol = -1;

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

      if (suffixCol === -1 && /SUFFIX|NAME EXTENSION/.test(h)) suffixCol=colIndex;
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
        suffixCol,
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

  const separateNames = columns.lastCol >= 0 && columns.firstCol >= 0 && columns.lastCol !== columns.firstCol;
  if (columns.nameCol >= 0 && !separateNames) {
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
    suffix: columns.suffixCol >= 0 ? String(row[columns.suffixCol] ?? "").trim() : "",
    sex,
  };
}

function meaningfulLearner(candidate) {
  return (
    /^\d{10,12}$/.test(candidate.lrn) &&
    candidate.lastName.length > 0 &&
    candidate.firstName.length > 0 && candidate.firstName.length <= 50 && candidate.lastName.length <= 50 && candidate.middleName.length <= 50 &&
    String(candidate.suffix || "").length <= 20
  );
}

export async function POST(request) {
  const admin = await getAdminUser(request);
  if(!admin)return json({error:"Only the Reading Coordinator can import learners."},403);
  let auth;

  let file, classSectionId, rosterVersion, newSection;
  try {
    const formData = await request.formData();
    file = formData.get("file");
    classSectionId = String(formData.get("class_section_id") || "");
    rosterVersion = Number(formData.get("roster_version") || 0);
    newSection=formData.get("create_section_id")?{id:String(formData.get("create_section_id")),schoolYearId:String(formData.get("school_year_id")||""),name:String(formData.get("section_name")||"")}:null;
    const owner=await prisma.user.findFirst({where:{id:Number(formData.get("teacher_id"))||0,role:"teacher"},select:{id:true}});
    if(!owner)return json({error:"Choose a registered teacher."},400);
    auth=owner;
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
    if (lowerName.endsWith(".xlsx")) {
      const zip = await JSZip.loadAsync(buffer);
      const entries = Object.values(zip.files).filter(entry => !entry.dir);
      if (entries.length > 250) throw new Error("Workbook has too many entries.");
      let expanded = 0;
      for (const entry of entries) {
        const stream = new Readable().wrap(entry.nodeStream("nodebuffer"));
        let entryBytes = 0;
        for await (const chunk of stream) {
          expanded += chunk.length; entryBytes += chunk.length;
          if (expanded > 40 * 1024 * 1024 || entryBytes > 20 * 1024 * 1024) {
            stream.destroy(); throw new Error("Workbook expanded size is too large.");
          }
        }
      }
    }
    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: false,
      sheetRows: HEADER_SCAN_ROWS + MAX_IMPORTED_ROWS + 1000,
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
      class_section_id: importedResult.classSectionId,
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

    const importedResult=await prisma.$transaction(async tx=>{
      await assertRosterVersion(tx,auth.id,rosterVersion);
      const selectedClass=newSection?await importSection(tx,auth.id,newSection):await lockClass(tx,auth.id,classSectionId);
      const existing=await tx.learner.findMany({where:{teacherId:auth.id},select:{lrn:true,firstName:true,middleName:true,lastName:true,suffix:true}}),lrns=new Set(existing.map(r=>r.lrn)),names=new Set(existing.map(learnerNameKey));
      const upper=v=>String(v??'').trim().toUpperCase();
      const data=extracted.filter(r=>{const key=learnerNameKey(r);if(lrns.has(r.lrn)||names.has(key))return false;lrns.add(r.lrn);names.add(key);return true;}).map(r=>({lrn:r.lrn,firstName:upper(r.firstName),lastName:upper(r.lastName),middleName:upper(r.middleName)||null,suffix:upper(r.suffix)||null,sex:r.sex||null,gradeLevel:3,teacherId:teacher.id,classSectionId:selectedClass.id,section:selectedClass.name}));
      const result=await tx.learner.createManyAndReturn({data,skipDuplicates:true});if(result.length)await writeAudit(tx,{actorId:admin.id,teacherId:teacher.id,event:'learners.imported',count:result.length,detail:{learners:result}});
      return {count:result.length,classSectionId:selectedClass.id};
    },{timeout:30000});

    const duplicateCount = extracted.length - importedResult.count;

    return json({
      status: "ok",
      sheet: bestSheet,
      class_section_id: importedResult.classSectionId,
      extractedCount: extracted.length,
      importedCount: importedResult.count,
      skippedCount: skipped.length + duplicateCount,
      duplicateCount,
      skippedRows: skipped.slice(0, 50),
      maxRowsReached: extracted.length >= MAX_IMPORTED_ROWS,
      message:
        importedResult.count === 0
          ? "No new learners were added because the extracted names or LRNs are already registered."
          : `Imported ${importedResult.count} learner${importedResult.count === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    if ([400,403,404,409,413].includes(error?.status)) return json({error:error.message},error.status);
    logSecureError('Class-record learner import failed:', typeof error !== "undefined" ? error : null);
    return json(
      {
        error:
          "The class record could not be processed. Make sure it is a valid Excel workbook and contains the learner roster.",
      },
      500
    );
  }
}
