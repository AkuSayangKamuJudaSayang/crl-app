import path from "node:path";
import fs from "node:fs/promises";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireTeacher } from "../../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
 * CRL-App Excel Report Export
 *
 * This route keeps the supplied CRLA3_Grade3Scoresheet_v3.xlsx workbook
 * as the source template and fills the existing worksheet structure.
 *
 * Supported:
 *   GET /api/reports/excel?period=BoSY
 *   GET /api/reports/excel?period=MoSY
 *   GET /api/reports/excel?period=EoSY
 *
 * Optional:
 *   &mode=scoresheet
 *   &mode=summary
 *   &learnerId=<id>
 */

const TEMPLATE_FILE =
  "CRLA3_Grade3Scoresheet_v3.xlsx";

const PASSAGE_TEXT =
  "The helpful child carried the basket home. Along the way, the child stopped to help a friend. They worked together and finished before sunset.";

const PASSAGE_WORD_COUNT =
  PASSAGE_TEXT
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const PART1_LEVELS = [
  "Full Refresher",
  "Moderate Refresher",
  "Light Refresher",
  "Grade Ready",
];

const PART2_LEVELS = [
  "Low Emerging Reader",
  "High Emerging Reader",
  "Developing Reader",
  "Transitioning Reader",
  "Reading At Grade Level",
];

function jsonError(message, status = 500) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

function normalizePeriod(value) {
  const period = String(
    value || "BoSY"
  )
    .trim()
    .toLowerCase();

  if (period === "mosy") {
    return "MoSY";
  }

  if (period === "eosy") {
    return "EoSY";
  }

  return "BoSY";
}

function normalizeMode(value) {
  const mode = String(
    value || "scoresheet"
  )
    .trim()
    .toLowerCase();

  return mode === "summary"
    ? "summary"
    : "scoresheet";
}

function parseOptionalPositiveInt(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    return null;
  }

  return number;
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return date;
}

function formatMiddleInitial(
  middleName
) {
  const middle = String(
    middleName || ""
  ).trim();

  if (!middle) {
    return "N/A";
  }

  return `${middle
    .charAt(0)
    .toUpperCase()}.`;
}

function formatLearnerName(
  learner
) {
  if (!learner) {
    return "";
  }

  const middle =
    learner.middleName
      ? `${learner.middleName
          .charAt(0)
          .toUpperCase()}.`
      : "N/A";

  return `${learner.lastName}, ${learner.firstName}, ${middle}`;
}

function calculatePart1Level(
  totalScore
) {
  if (totalScore <= 0) {
    return "Full Refresher";
  }

  if (totalScore <= 10) {
    return "Moderate Refresher";
  }

  if (totalScore <= 16) {
    return "Light Refresher";
  }

  return "Grade Ready";
}

function calculateReadingProfile(
  readingPercent,
  comprehensionScore
) {
  const accuracy = Number(
    readingPercent || 0
  );

  const comprehension = Number(
    comprehensionScore || 0
  );

  if (accuracy <= 25) {
    return "High Emerging Reader";
  }

  if (
    accuracy <= 50 &&
    comprehension === 0
  ) {
    return "High Emerging Reader";
  }

  if (
    accuracy <= 50 &&
    comprehension >= 1
  ) {
    return "Developing Reader";
  }

  if (
    accuracy <= 75 &&
    comprehension <= 2
  ) {
    return "Developing Reader";
  }

  if (
    accuracy <= 75 &&
    comprehension >= 3
  ) {
    return "Transitioning Reader";
  }

  if (
    accuracy <= 100 &&
    comprehension <= 4
  ) {
    return "Transitioning Reader";
  }

  return "Reading At Grade Level";
}

function getTimerSeconds(
  session
) {
  const value =
    session?.sessionMetrics
      ?.timerSeconds;

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const seconds = Number(value);

  return Number.isFinite(
    seconds
  ) && seconds >= 0
    ? seconds
    : null;
}

function formatTime(
  seconds
) {
  if (
    seconds === null ||
    seconds === undefined
  ) {
    return "-";
  }

  const total =
    Math.max(
      0,
      Math.round(
        Number(seconds)
      )
    );

  const minutes =
    Math.floor(
      total / 60
    );

  const remainder =
    total % 60;

  return `${minutes}m ${String(
    remainder
  ).padStart(2, "0")}s`;
}

function calculateRow(
  session,
  index
) {
  const letters =
    session.letterResults || [];

  const words =
    session.wordResults || [];

  const miscues =
    session.passageMiscues || [];

  const comprehension =
    session.comprehensionResults ||
    [];

  const task1Score =
    letters.filter(
      (result) =>
        Boolean(
          result.isCorrect
        )
    ).length;

  const task2Score =
    words.length > 0
      ? words.filter(
          (result) =>
            Boolean(
              result.isCorrect
            )
        ).length
      : null;

  const totalScore =
    task1Score +
    (task2Score || 0);

  const part1 =
    calculatePart1Level(
      totalScore
    );

  const totalMiscues =
    miscues.length;

  const wordsRead =
    Math.max(
      0,
      PASSAGE_WORD_COUNT -
        totalMiscues
    );

  const readingPercent =
    Number(
      (
        (wordsRead /
          PASSAGE_WORD_COUNT) *
        100
      ).toFixed(2)
    );

  const timerSeconds =
    getTimerSeconds(
      session
    );

  const minutes =
    timerSeconds &&
    timerSeconds > 0
      ? timerSeconds / 60
      : null;

  const wpm =
    minutes
      ? Number(
          (
            wordsRead /
            minutes
          ).toFixed(2)
        )
      : null;

  const comprehensionScore =
    comprehension.filter(
      (result) =>
        Boolean(
          result.isCorrect
        )
    ).length;

  const readingProfile =
    calculateReadingProfile(
      readingPercent,
      comprehensionScore
    );

  return {
    sn: index + 1,
    lrn:
      session.learner
        ?.lrn || "",
    name:
      formatLearnerName(
        session.learner
      ),
    sex:
      session.learner?.sex ||
      "",
    date:
      formatDate(
        session.dateAdministered
      ),
    task1:
      task1Score,
    task2:
      task2Score,
    total:
      totalScore,
    part1,
    story:
      totalMiscues > 0 ||
      comprehension.length > 0
        ? 1
        : "-",
    miscues:
      totalMiscues,
    wordsRead,
    time:
      formatTime(
        timerSeconds
      ),
    wpm,
    readingPct:
      readingPercent,
    comp:
      `${comprehensionScore}/6`,
    experience: session.sessionMetrics?.experienceRating ?? "-",
    observation: session.sessionMetrics?.observationLevel ?? "-",
    readingProfile,
    remarks:
      session.sessionMetrics?.remarks ||
      session.overallClassification ||
      readingProfile,
  };
}

async function loadSessions(
  teacherId,
  period,
  learnerId,
  teacherSection
) {
  return prisma.assessmentSession.findMany(
    {
      where: {
        teacherId,
        learner: {
          section: {
            equals: teacherSection,
            mode: "insensitive",
          },
        },
        assessmentPeriod:
          period,
        ...(learnerId
          ? {
              learnerId,
            }
          : {}),
      },
      include: {
        learner: true,
        letterResults: {
          orderBy: {
            letterIndex: "asc",
          },
        },
        wordResults: {
          orderBy: {
            wordIndex: "asc",
          },
        },
        passageMiscues: {
          orderBy: {
            wordIndex: "asc",
          },
        },
        comprehensionResults: {
          orderBy: {
            questionIndex: "asc",
          },
        },
        sessionMetrics: true,
      },
      orderBy: [
        {
          learner: {
            lastName:
              "asc",
          },
        },
        {
          learner: {
            firstName:
              "asc",
          },
        },
        {
          dateAdministered:
            "asc",
        },
      ],
    }
  );
}

function getTemplatePath() {
  return path.join(
    process.cwd(),
    "public",
    "templates",
    TEMPLATE_FILE
  );
}

function setValue(
  worksheet,
  cellAddress,
  value
) {
  worksheet.getCell(
    cellAddress
  ).value = value;
}

function setTeacherInformation(
  worksheet,
  teacher
) {
  if (!worksheet) {
    return;
  }

  /*
   * These addresses match the supplied template's existing
   * header information areas.
   */
  setValue(
    worksheet,
    "C6",
    teacher?.fullName || ""
  );

  setValue(
    worksheet,
    "C8",
    teacher?.section || ""
  );
}

function clearExistingDataRows(
  worksheet,
  startRow,
  endRow,
  startColumn,
  endColumn
) {
  if (!worksheet) {
    return;
  }

  for (
    let row = startRow;
    row <= endRow;
    row += 1
  ) {
    for (
      let column = startColumn;
      column <= endColumn;
      column += 1
    ) {
      const cell =
        worksheet
          .getRow(row)
          .getCell(column);

      /*
       * Do not remove styles, formulas, widths, merges,
       * borders, or other template formatting.
       * Only replace the cell contents.
       */
      cell.value = null;
    }
  }
}

function populateScoresheet(
  worksheet,
  rows,
  teacher
) {
  if (!worksheet) {
    return;
  }

  setValue(worksheet, "C6", teacher?.fullName || "");
  setValue(worksheet, "C8", teacher?.section || "");

  setValue(
    worksheet,
    "C10",
    "English"
  );

  clearExistingDataRows(
    worksheet,
    11,
    110,
    1,
    21
  );

  for (
    let index = 0;
    index < 100;
    index += 1
  ) {
    const row =
      rows[index];

    if (!row) {
      continue;
    }

    const outputRow =
      worksheet.getRow(
        11 + index
      );

    const values = [
      row.sn,
      row.lrn,
      row.name,
      row.sex,
      row.date,
      row.task1,
      row.task2 ?? "-",
      row.total,
      row.part1,
      row.story,
      row.miscues,
      row.wordsRead,
      row.time,
      "",
      row.wpm ?? "-",
      row.readingPct,
      row.comp,
      row.experience,
      row.observation,
      row.readingProfile,
      row.remarks,
    ];

    values.forEach(
      (
        value,
        columnIndex
      ) => {
        outputRow.getCell(
          columnIndex + 1
        ).value =
          value ?? "";
      }
    );
  }
}

function populateClassRecord(
  worksheet,
  rows,
  teacher
) {
  if (!worksheet) {
    return;
  }

  setValue(worksheet, "C5", teacher?.fullName || "");
  setValue(worksheet, "C6", "Grade 3");

  clearExistingDataRows(
    worksheet,
    8,
    107,
    1,
    16
  );

  for (
    let index = 0;
    index < 100;
    index += 1
  ) {
    const row =
      rows[index];

    if (!row) {
      continue;
    }

    const targetRow =
      worksheet.getRow(
        8 + index
      );

    /*
     * The supplied workbook's English Class Record occupies
     * the first 16 columns of the record block.
     */
    const values = [
      row.sn,
      row.lrn,
      row.name,
      row.sex,
      row.part1,
      row.total / 20,
      "",
      row.comp,
      row.wpm ?? "-",
      row.readingProfile,
      row.part1,
      row.total / 20,
      "",
      row.comp,
      row.wpm ?? "-",
      row.readingProfile,
    ];

    values.forEach(
      (
        value,
        indexInRow
      ) => {
        targetRow.getCell(
          indexInRow + 1
        ).value =
          value ?? "";
      }
    );
  }
}

function summarizeSex(
  rows,
  sex
) {
  const filtered =
    sex === "Total"
      ? rows
      : rows.filter(
          (row) =>
            String(
              row.sex || ""
            ).toLowerCase() ===
            String(sex).toLowerCase()
        );

  const count =
    filtered.length;

  const part1Counts =
    PART1_LEVELS.map(
      (level) =>
        filtered.filter(
          (row) =>
            row.part1 ===
            level
        ).length
    );

  const profileCounts =
    PART2_LEVELS.map(
      (level) =>
        filtered.filter(
          (row) =>
            row.readingProfile ===
            level
        ).length
    );

  const averageWpm =
    count === 0
      ? 0
      : Number(
          (
            filtered.reduce(
              (
                sum,
                row
              ) =>
                sum +
                (Number(
                  row.wpm
                ) || 0),
              0
            ) / count
          ).toFixed(2)
        );

  const averageComprehension =
    count === 0
      ? 0
      : Number(
          (
            filtered.reduce(
              (
                sum,
                row
              ) =>
                sum +
                Number(
                  String(
                    row.comp
                  )
                    .split(
                      "/"
                    )[0] ||
                    0
                ),
              0
            ) / count
          ).toFixed(2)
        );

  return {
    count,
    assessed: count,
    part1Counts,
    profileCounts,
    averageWpm,
    averageComprehension,
  };
}

function populateClassSummary(
  worksheet,
  rows,
  teacher
) {
  if (!worksheet) {
    return;
  }

  setValue(worksheet, "B7", teacher?.section || "");
  setValue(worksheet, "C7", teacher?.fullName || "");

  /*
   * Preserve the existing charts/drawings in the workbook.
   * We only replace the summary table cells.
   */
  const targetRows = {
    Male: 10,
    Female: 11,
    Total: 14,
  };

  for (
    const sex of [
      "Male",
      "Female",
      "Total",
    ]
  ) {
    const targetRow =
      targetRows[sex];

    const stats =
      summarizeSex(
        rows,
        sex
      );

    const values = [
      "Grade 3",
      teacher?.section || "",
      teacher?.fullName || "",
      "English",
      sex,
      stats.count,
      stats.assessed,
      ...stats.part1Counts,
      0,
      stats.averageWpm,
      stats.averageComprehension,
      stats.averageWpm,
      ...stats.profileCounts,
    ];

    for (
      let column = 1;
      column <= 19;
      column += 1
    ) {
      worksheet
        .getRow(targetRow)
        .getCell(column)
        .value =
        values[column - 1] ??
        "";
    }
  }
}

function keepOnlyRequiredWorksheets(workbook) {
  const requiredNames = new Set([
    "G3 ENG Reading Scoresheet",
    "Class Record",
    "Class Summary",
  ]);

  workbook.worksheets.slice().forEach((worksheet) => {
    if (!requiredNames.has(worksheet.name)) {
      workbook.removeWorksheet(worksheet.id);
    }
  });
}

function addExportMetadata(
  workbook,
  period
) {
  /*
   * ExcelJS preserves the template's worksheets and drawings while
   * modifying the workbook in-place. These properties simply make
   * the resulting file easier to identify.
   */
  workbook.creator =
    "CRL-App";

  workbook.modified =
    new Date();

  workbook.properties = {
    ...(workbook.properties ||
      {}),
    title:
      `CRLA Grade 3 ${period} Assessment Record`,
    subject:
      "Comprehensive Rapid Literacy Assessment",
    keywords:
      "CRLA, Grade 3, Reading, Assessment",
  };
}

function buildFilename(
  period,
  mode
) {
  return `CRLA3_Grade3_${period}_Assessment_Records.xlsx`;
}

export async function GET(
  request
) {
  let teacher;

  try {
    teacher =
      await requireTeacher();
  } catch (error) {
    return jsonError(
      error?.message ||
        "Authentication required.",
      Number(
        error?.status
      ) || 401
    );
  }

  const period =
    normalizePeriod(
      request.nextUrl.searchParams.get(
        "period"
      )
    );

  const mode =
    normalizeMode(
      request.nextUrl.searchParams.get(
        "mode"
      )
    );

  const learnerId =
    parseOptionalPositiveInt(
      request.nextUrl.searchParams.get(
        "learnerId"
      )
    );

  const teacherSection =
    String(teacher?.section || "").trim();

  if (!teacherSection) {
    return jsonError(
      "Teacher section is not configured.",
      403
    );
  }

  try {
    const templatePath =
      getTemplatePath();

    /*
     * Fail with a useful message if the template wasn't deployed.
     */
    try {
      await fs.access(
        templatePath
      );
    } catch {
      return jsonError(
        `CRLA Excel template not found at public/templates/${TEMPLATE_FILE}.`,
        500
      );
    }

    /*
     * If learnerId was supplied, ensure it belongs to the
     * authenticated teacher before generating the workbook.
     */
    if (learnerId) {
      const learner =
        await prisma.learner.findFirst(
          {
            where: {
              id: learnerId,
              teacherId:
                teacher.id,
              section: {
                equals:
                  teacherSection,
                mode: "insensitive",
              },
            },
            select: {
              id: true,
            },
          }
        );

      if (!learner) {
        return jsonError(
          "Learner not found or not assigned to this teacher.",
          404
        );
      }
    }

    const sessions =
      await loadSessions(
        teacher.id,
        period,
        learnerId,
        teacherSection
      );

    const rows =
      sessions.map(
        calculateRow
      );

    const workbook =
      new ExcelJS.Workbook();

    /*
     * Load the user's actual CRLA template instead of creating a new
     * workbook. This preserves its worksheet names, dimensions,
     * formatting, merged cells, and existing charts/drawings.
     */
    await workbook.xlsx.readFile(
      templatePath
    );

    const scoresheet =
      workbook.getWorksheet(
        "G3 ENG Reading Scoresheet"
      );

    const classRecord =
      workbook.getWorksheet(
        "Class Record"
      );

    const classSummary =
      workbook.getWorksheet(
        "Class Summary"
      );

    if (
      !scoresheet ||
      !classRecord ||
      !classSummary
    ) {
      return jsonError(
        "The CRLA Excel template does not contain the expected G3 ENG Reading Scoresheet, Class Record, and Class Summary worksheets.",
        500
      );
    }

    keepOnlyRequiredWorksheets(workbook);

    addExportMetadata(
      workbook,
      period
    );

    populateScoresheet(
      scoresheet,
      rows,
      teacher
    );

    populateClassRecord(
      classRecord,
      rows,
      teacher
    );

    populateClassSummary(
      classSummary,
      rows,
      teacher
    );

    /*
     * ExcelJS returns an ArrayBuffer. Convert it to a Node Buffer
     * for NextResponse.
     */
    const arrayBuffer =
      await workbook.xlsx.writeBuffer();

    const output =
      Buffer.from(
        arrayBuffer
      );

    return new NextResponse(
      output,
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

          "Content-Disposition":
            `attachment; filename="${buildFilename(
              period,
              mode
            )}"`,

          "Content-Length":
            String(output.length),

          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",

          Pragma:
            "no-cache",

          Expires:
            "0",
        },
      }
    );
  } catch (error) {
    console.error(
      "CRL-App Excel export error:",
      error
    );

    return jsonError(
      error?.message ||
        "Unable to generate the Excel assessment record.",
      Number(
        error?.status
      ) || 500
    );
  }
}

export async function HEAD(
  request
) {
  try {
    await requireTeacher();

    const templatePath =
      getTemplatePath();

    try {
      await fs.access(
        templatePath
      );
    } catch {
      return new NextResponse(
        null,
        {
          status: 404,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    return new NextResponse(
      null,
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch {
    return new NextResponse(
      null,
      {
        status: 401,
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}
