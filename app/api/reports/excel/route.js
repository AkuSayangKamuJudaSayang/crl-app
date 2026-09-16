import path from "node:path";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireTeacher } from "../../../../lib/auth";
import { buildScoresheetWorkbook } from "../../../../lib/excelExport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
 * CRL-App Excel Report Export
 *
 * Fills the official CRLA3_Grade3Scoresheet_v3.xlsx template while preserving
 * its charts, images, number formats and formulas. See lib/excelExport.js.
 *
 *   GET /api/reports/excel?period=BoSY|MoSY|EoSY
 *   GET /api/reports/excel?mode=scoresheet|summary&learnerId=<id>
 */

const TEMPLATE_FILE = "CRLA3_Grade3Scoresheet_v3.xlsx";

// Grade 3 English passages use the scoresheet's 100-word reading measure.
const PASSAGE_WORD_COUNT = 100;

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
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

function normalizePeriod(value) {
  const period = String(value || "BoSY").trim().toLowerCase();
  if (period === "mosy") return "MoSY";
  if (period === "eosy") return "EoSY";
  return "BoSY";
}

function normalizeMode(value) {
  const mode = String(value || "scoresheet").trim().toLowerCase();
  return mode === "summary" ? "summary" : "scoresheet";
}

function parseOptionalPositiveInt(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }
  return number;
}

function normalizeSexValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["male", "m", "boy"].includes(normalized)) return "Male";
  if (["female", "f", "girl"].includes(normalized)) return "Female";
  return "";
}

function formatLearnerName(learner) {
  if (!learner) return "";
  const middle = learner.middleName
    ? `${learner.middleName.charAt(0).toUpperCase()}.`
    : "N/A";
  return `${learner.lastName}, ${learner.firstName}, ${middle}`;
}

function calculatePart1Level(totalScore) {
  if (totalScore <= 0) return "Full Refresher";
  if (totalScore <= 10) return "Moderate Refresher";
  if (totalScore <= 16) return "Light Refresher";
  return "Grade Ready";
}

function calculateReadingProfile(readingPercent, comprehensionScore) {
  const accuracy = Number(readingPercent || 0);
  const comprehension = Number(comprehensionScore || 0);

  if (accuracy <= 25) return "High Emerging Reader";
  if (accuracy <= 50 && comprehension === 0) return "High Emerging Reader";
  if (accuracy <= 50 && comprehension >= 1) return "Developing Reader";
  if (accuracy <= 75 && comprehension <= 2) return "Developing Reader";
  if (accuracy <= 75 && comprehension >= 3) return "Transitioning Reader";
  if (accuracy <= 100 && comprehension <= 4) return "Transitioning Reader";
  return "Reading At Grade Level";
}

function getTimerSeconds(session) {
  const value = session?.sessionMetrics?.timerSeconds;
  if (value === null || value === undefined) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function calculateRow(session, index) {
  const letters = session.letterResults || [];
  const words = session.wordResults || [];
  const miscues = session.passageMiscues || [];
  const comprehension = session.comprehensionResults || [];

  const task1Score = letters.filter((result) => Boolean(result.isCorrect)).length;
  const task2Score =
    words.length > 0
      ? words.filter((result) => Boolean(result.isCorrect)).length
      : null;

  const totalScore = task1Score + (task2Score || 0);
  const part1 = calculatePart1Level(totalScore);

  const totalMiscues = miscues.length;
  const timerSeconds = getTimerSeconds(session);

  const passageWasAdministered = totalScore > 10 && timerSeconds !== null;
  const wordsRead = passageWasAdministered
    ? Math.max(0, PASSAGE_WORD_COUNT - totalMiscues)
    : 0;

  const readingPercent = passageWasAdministered
    ? Number(((wordsRead / PASSAGE_WORD_COUNT) * 100).toFixed(2))
    : 0;

  const minutes =
    timerSeconds !== null ? Math.floor(timerSeconds / 60) : null;
  const seconds = timerSeconds !== null ? timerSeconds % 60 : null;

  const wpm =
    passageWasAdministered && timerSeconds > 0
      ? Number((wordsRead / (timerSeconds / 60)).toFixed(2))
      : null;

  const comprehensionScore = comprehension.filter((result) =>
    Boolean(result.isCorrect)
  ).length;

  const readingProfile =
    totalScore <= 10
      ? "Low Emerging Reader"
      : calculateReadingProfile(readingPercent, comprehensionScore);

  const experienceRating = session.sessionMetrics?.experienceRating;
  const observationLevel = session.sessionMetrics?.observationLevel;
  const remarks = session.sessionMetrics?.remarks || "";

  const experience =
    experienceRating === null || experienceRating === undefined
      ? null
      : Number.isFinite(Number(experienceRating))
        ? Number(experienceRating)
        : null;

  return {
    sn: index + 1,
    lrn: session.learner?.lrn || "",
    name: formatLearnerName(session.learner),
    sex: normalizeSexValue(session.learner?.sex),
    date: session.dateAdministered
      ? new Date(session.dateAdministered)
      : null,
    task1: task1Score,
    task2: task2Score,
    total: totalScore,
    totalFraction: Number((totalScore / 20).toFixed(6)),
    part1,
    story: passageWasAdministered ? 1 : null,
    miscues: totalMiscues,
    wordsRead,
    minutes,
    seconds,
    wpm,
    readingPct: readingPercent,
    readingPctFraction: Number((readingPercent / 100).toFixed(6)),
    comprehensionScore,
    compFraction: Number((comprehensionScore / 6).toFixed(6)),
    experience,
    observation: observationLevel ? `Level ${observationLevel}` : null,
    readingProfile,
    remarks,
  };
}

async function loadSessions(teacherId, period, learnerId, teacherSection) {
  return prisma.assessmentSession.findMany({
    where: {
      teacherId,
      isCompleted: true,
      learner: {
        section: {
          equals: teacherSection,
          mode: "insensitive",
        },
      },
      assessmentPeriod: period,
      ...(learnerId ? { learnerId } : {}),
    },
    include: {
      learner: true,
      letterResults: { orderBy: { letterIndex: "asc" } },
      wordResults: { orderBy: { wordIndex: "asc" } },
      passageMiscues: { orderBy: { wordIndex: "asc" } },
      comprehensionResults: { orderBy: { questionIndex: "asc" } },
      sessionMetrics: true,
    },
    orderBy: [
      { learner: { lastName: "asc" } },
      { learner: { firstName: "asc" } },
      { dateAdministered: "asc" },
    ],
  });
}

function getTemplatePath() {
  return path.join(process.cwd(), "public", "templates", TEMPLATE_FILE);
}

function summarizeSex(rows, sex) {
  const filtered =
    sex === "Total" ? rows : rows.filter((row) => row.sex === sex);

  const count = filtered.length;

  const part1Counts = PART1_LEVELS.map(
    (level) => filtered.filter((row) => row.part1 === level).length
  );

  const profileCounts = PART2_LEVELS.map(
    (level) => filtered.filter((row) => row.readingProfile === level).length
  );

  const average = (values) => {
    const numbers = values.filter(
      (value) => typeof value === "number" && Number.isFinite(value)
    );
    if (!numbers.length) return null;
    return Number(
      (numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(4)
    );
  };

  return {
    count,
    part1Counts,
    profileCounts,
    avgFluency: average(filtered.map((row) => row.readingPct)),
    avgComp: average(filtered.map((row) => row.comprehensionScore)),
    avgWpm: average(filtered.map((row) => row.wpm)),
  };
}

function buildFilename(period) {
  return `CRLA3_Grade3_${period}_Assessment_Records.xlsx`;
}

export async function GET(request) {
  let teacher;

  try {
    teacher = await requireTeacher();
  } catch (error) {
    return jsonError(
      error?.message || "Authentication required.",
      Number(error?.status) || 401
    );
  }

  const period = normalizePeriod(request.nextUrl.searchParams.get("period"));
  const learnerId = parseOptionalPositiveInt(
    request.nextUrl.searchParams.get("learnerId")
  );

  const teacherProfile = await prisma.user.findUnique({
    where: { id: Number(teacher.id) },
    select: { id: true, fullName: true, section: true, role: true },
  });

  if (!teacherProfile) {
    return jsonError("Teacher account was not found.", 404);
  }

  const exportTeacher = {
    ...teacher,
    fullName: teacherProfile.fullName || teacher?.fullName || "",
    section: teacherProfile.section || teacher?.section || "",
    role: teacherProfile.role || teacher?.role || "",
  };

  const teacherSection = String(exportTeacher.section || "").trim();
  if (!teacherSection) {
    return jsonError("Teacher section is not configured.", 403);
  }

  try {
    const templatePath = getTemplatePath();

    try {
      await fs.access(templatePath);
    } catch {
      return jsonError(
        `CRLA Excel template not found at public/templates/${TEMPLATE_FILE}.`,
        500
      );
    }

    if (learnerId) {
      const learner = await prisma.learner.findFirst({
        where: {
          id: learnerId,
          teacherId: exportTeacher.id,
          section: { equals: teacherSection, mode: "insensitive" },
        },
        select: { id: true },
      });

      if (!learner) {
        return jsonError("Learner not found or not assigned to this teacher.", 404);
      }
    }

    const sessions = await loadSessions(
      exportTeacher.id,
      period,
      learnerId,
      teacherSection
    );

    const rows = sessions.map(calculateRow);

    const learners = await prisma.learner.findMany({
      where: {
        teacherId: exportTeacher.id,
        section: { equals: teacherSection, mode: "insensitive" },
      },
      select: { sex: true },
    });

    const enrolled = { Male: 0, Female: 0, Total: 0 };
    learners.forEach((learner) => {
      const sex = normalizeSexValue(learner.sex);
      if (sex === "Male" || sex === "Female") {
        enrolled[sex] += 1;
      }
    });
    enrolled.Total = enrolled.Male + enrolled.Female;

    const summary = {};
    ["Male", "Female", "Total"].forEach((sex) => {
      summary[sex] = summarizeSex(rows, sex);
    });

    const output = await buildScoresheetWorkbook({
      templatePath,
      teacher: exportTeacher,
      rows,
      enrolled,
      summary,
    });

    return new NextResponse(output, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${buildFilename(period)}"`,
        "Content-Length": String(output.length),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("CRL-App Excel export error:", error);
    return jsonError(
      error?.message || "Unable to generate the Excel assessment record.",
      Number(error?.status) || 500
    );
  }
}

export async function HEAD(request) {
  try {
    await requireTeacher();

    const templatePath = getTemplatePath();
    try {
      await fs.access(templatePath);
    } catch {
      return new NextResponse(null, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return new NextResponse(null, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return new NextResponse(null, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
