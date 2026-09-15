"use client";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMPORTED_ROWS = 500;
const HEADER_SCAN_ROWS = 40;

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeLrn(value) {
  return String(value ?? "").replace(/\D/g, "").trim();
}

function normalizeSex(value) {
  const normalized = normalizeText(value);
  if (["M", "MALE", "BOY"].includes(normalized)) return "Male";
  if (["F", "FEMALE", "GIRL"].includes(normalized)) return "Female";
  return "";
}

function detectColumns(rows) {
  let best = null;

  for (
    let rowIndex = 0;
    rowIndex < Math.min(rows.length, HEADER_SCAN_ROWS);
    rowIndex += 1
  ) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
    const columns = {
      rowIndex,
      score: 0,
      lrnCol: -1,
      sexCol: -1,
      nameCol: -1,
      lastCol: -1,
      firstCol: -1,
      middleCol: -1,
    };

    row.forEach((cell, columnIndex) => {
      const header = normalizeText(cell);
      if (columns.lrnCol < 0 && /\bLRN\b|LEARNER REFERENCE NUMBER/.test(header)) {
        columns.lrnCol = columnIndex;
      }
      if (columns.sexCol < 0 && /\bSEX\b|\bGENDER\b/.test(header)) {
        columns.sexCol = columnIndex;
      }
      if (
        columns.nameCol < 0 &&
        header.includes("NAME") &&
        (
          header.includes("LAST NAME") ||
          header.includes("LAST, FIRST") ||
          header.includes("FIRST NAME") ||
          header.includes("MIDDLE NAME")
        )
      ) {
        columns.nameCol = columnIndex;
      }
      if (columns.lastCol < 0 && /LAST NAME|SURNAME|FAMILY NAME/.test(header)) {
        columns.lastCol = columnIndex;
      }
      if (columns.firstCol < 0 && /FIRST NAME|GIVEN NAME/.test(header)) {
        columns.firstCol = columnIndex;
      }
      if (columns.middleCol < 0 && /MIDDLE NAME|MIDDLE INITIAL/.test(header)) {
        columns.middleCol = columnIndex;
      }
    });

    columns.score =
      (columns.lrnCol >= 0 ? 4 : 0) +
      (columns.sexCol >= 0 ? 2 : 0) +
      (columns.nameCol >= 0 ? 4 : 0) +
      (columns.lastCol >= 0 ? 2 : 0) +
      (columns.firstCol >= 0 ? 2 : 0) +
      (columns.middleCol >= 0 ? 1 : 0);

    if (!best || columns.score > best.score) best = columns;
  }

  if (
    !best ||
    best.lrnCol < 0 ||
    (best.nameCol < 0 && (best.lastCol < 0 || best.firstCol < 0))
  ) {
    return null;
  }
  return best;
}

function parseCombinedName(value) {
  const pieces = String(value ?? "")
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
    return { lastName: pieces[0], firstName: pieces[1], middleName: "" };
  }
  return { lastName: "", firstName: pieces[0] || "", middleName: "" };
}

function buildLearner(row, columns) {
  const combined =
    columns.nameCol >= 0 ? parseCombinedName(row[columns.nameCol]) : null;
  return {
    lrn: normalizeLrn(row[columns.lrnCol]),
    lastName: combined?.lastName || String(row[columns.lastCol] ?? "").trim(),
    firstName: combined?.firstName || String(row[columns.firstCol] ?? "").trim(),
    middleName:
      combined?.middleName ||
      (columns.middleCol >= 0 ? String(row[columns.middleCol] ?? "").trim() : ""),
    sex: columns.sexCol >= 0 ? normalizeSex(row[columns.sexCol]) : "",
  };
}

function isImportable(learner) {
  return (
    /^\d{10,12}$/.test(learner.lrn) &&
    learner.lastName.length > 0 &&
    learner.firstName.length > 0
  );
}

async function extractLearners(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("Please choose an Excel class record file.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("The Excel file is too large. Maximum allowed size is 10 MB.");
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: false,
    raw: true,
  });
  let selected = null;

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: "",
      blankrows: false,
    });
    const columns = detectColumns(rows);
    if (!columns) continue;
    const bodyRows = rows.slice(columns.rowIndex + 1);
    const meaningfulCount = bodyRows.filter((row) =>
      isImportable(buildLearner(row, columns))
    ).length;
    if (!selected || meaningfulCount > selected.meaningfulCount) {
      selected = { sheetName, rows: bodyRows, columns, meaningfulCount };
    }
  }

  if (!selected) {
    throw new Error(
      "No relevant learner information was found. The file must contain an LRN column and learner name information."
    );
  }

  const learners = [];
  const skippedRows = [];
  const seen = new Set();
  for (let index = 0; index < selected.rows.length; index += 1) {
    const candidate = buildLearner(selected.rows[index], selected.columns);
    if (!Object.values(candidate).some((value) => String(value).trim())) continue;
    if (!isImportable(candidate)) {
      skippedRows.push({
        row: selected.columns.rowIndex + index + 2,
        reason: "Missing valid LRN or learner name.",
      });
      continue;
    }
    if (seen.has(candidate.lrn)) {
      skippedRows.push({
        row: selected.columns.rowIndex + index + 2,
        reason: "Duplicate LRN inside the uploaded file.",
      });
      continue;
    }
    seen.add(candidate.lrn);
    learners.push(candidate);
    if (learners.length >= MAX_IMPORTED_ROWS) break;
  }

  if (!learners.length) {
    throw new Error(
      "The workbook was readable, but no learner records with a valid 10–12 digit LRN and learner name were found."
    );
  }

  return {
    sheetName: selected.sheetName,
    learners,
    skippedRows,
    maxRowsReached: learners.length >= MAX_IMPORTED_ROWS,
  };
}

export async function importClassRecordOffline(file) {
  const extracted = await extractLearners(file);
  const currentResponse = await fetch("/api/assessment?action=get_learners", {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!currentResponse.ok) {
    throw new Error("Unable to read the offline learner list.");
  }
  const currentData = await currentResponse.json();
  const existingLrns = new Set(
    (Array.isArray(currentData?.learners) ? currentData.learners : []).map(
      (learner) => String(learner?.lrn || learner?.LRN || "").trim()
    )
  );

  let importedCount = 0;
  let duplicateCount = 0;
  for (const learner of extracted.learners) {
    if (existingLrns.has(learner.lrn)) {
      duplicateCount += 1;
      continue;
    }
    const response = await fetch("/api/assessment?action=add_learner", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        action: "add_learner",
        lrn: learner.lrn,
        last_name: learner.lastName,
        first_name: learner.firstName,
        middle_name: learner.middleName || null,
        sex: learner.sex || null,
        grade_level: 3,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || `Unable to save learner ${learner.lrn} offline.`);
    }
    existingLrns.add(learner.lrn);
    importedCount += 1;
  }

  return {
    status: "ok",
    offline: true,
    sheet: extracted.sheetName,
    extractedCount: extracted.learners.length,
    importedCount,
    duplicateCount,
    skippedCount: extracted.skippedRows.length + duplicateCount,
    skippedRows: extracted.skippedRows.slice(0, 50),
    maxRowsReached: extracted.maxRowsReached,
    message:
      importedCount === 0
        ? "No new learners were added because all extracted LRNs are already registered."
        : `Imported ${importedCount} learner${importedCount === 1 ? "" : "s"} offline.`,
  };
}
