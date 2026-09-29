"use client";

import { buildScoresheetWorkbook } from "./excelExport";

const TEMPLATE_URL = "/templates/CRLA3_Grade3Scoresheet_v3.xlsx";
const CHART_PACK_URL = "/templates/CRLA3_Grade3Scoresheet_v3.class-summary-charts-v2.gz.b64";
const PART1_LEVELS = ["Full Refresher", "Moderate Refresher", "Light Refresher", "Grade Ready"];
const PART2_LEVELS = ["Low Emerging Reader", "High Emerging Reader", "Developing Reader", "Transitioning Reader", "Reading At Grade Level"];

function normalizeSex(value) {
  const sex = String(value || "").trim().toLowerCase();
  if (["male", "m", "boy"].includes(sex)) return "Male";
  if (["female", "f", "girl"].includes(sex)) return "Female";
  return "";
}

function learnerName(learner) {
  const middle = String(learner?.middle_name || learner?.middleName || "").trim();
  return `${learner?.last_name || learner?.lastName || ""}, ${learner?.first_name || learner?.firstName || ""}, ${middle ? `${middle[0].toUpperCase()}.` : "N/A"}`;
}

function part1Level(score) {
  if (score <= 0) return "Full Refresher";
  if (score <= 10) return "Moderate Refresher";
  if (score <= 16) return "Light Refresher";
  return "Grade Ready";
}

function assessmentRow(assessment, learner, index) {
  const task1 = Number(assessment?.task1_score || 0);
  const task2Value = assessment?.task2_score;
  const task2 = task2Value === null || task2Value === undefined ? null : Number(task2Value || 0);
  const total = task1 + (task2 || 0);
  const timer = assessment?.timer_seconds === null || assessment?.timer_seconds === undefined
    ? null
    : Number(assessment.timer_seconds);
  const miscues = Number(assessment?.total_miscues || 0);
  const administered = total > 10 && Number.isFinite(timer);
  const wordsRead = administered ? Number(assessment?.words_read ?? Math.max(0, 100 - miscues)) : 0;
  const readingPct = administered
    ? Number(assessment?.miscue_accuracy ?? ((wordsRead / 100) * 100))
    : 0;
  const comprehension = Number(assessment?.comprehension_score || 0);

  return {
    sn: index + 1,
    lrn: learner?.lrn || "",
    name: learnerName(learner),
    sex: normalizeSex(learner?.sex),
    date: assessment?.date_administered ? new Date(assessment.date_administered) : null,
    task1,
    task2,
    total,
    totalFraction: Number((total / 20).toFixed(6)),
    part1: part1Level(total),
    story: administered ? Number(assessment?.story_number || 1) : null,
    miscues,
    wordsRead,
    minutes: timer === null ? null : Math.floor(timer / 60),
    seconds: timer === null ? null : timer % 60,
    wpm: administered ? Number(assessment?.wpm ?? (timer > 0 ? wordsRead / (timer / 60) : 0)) : null,
    readingPct,
    readingPctFraction: Number((readingPct / 100).toFixed(6)),
    comprehensionScore: comprehension,
    compFraction: Number((comprehension / 6).toFixed(6)),
    experience: assessment?.experience_rating == null ? null : Number(assessment.experience_rating),
    observation: assessment?.observation_level ? `Level ${assessment.observation_level}` : null,
    readingProfile: assessment?.classification_label || assessment?.overall_classification || (total <= 10 ? "Low Emerging Reader" : "Developing Reader"),
    remarks: assessment?.remarks || "",
  };
}

function summarize(rows, sex) {
  const filtered = sex === "Total" ? rows : rows.filter((row) => row.sex === sex);
  const average = (values) => {
    const numbers = values.filter((value) => Number.isFinite(value));
    return numbers.length ? Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(4)) : null;
  };
  return {
    count: filtered.length,
    part1Counts: PART1_LEVELS.map((level) => filtered.filter((row) => row.part1 === level).length),
    profileCounts: PART2_LEVELS.map((level) => filtered.filter((row) => row.readingProfile === level).length),
    avgFluency: average(filtered.map((row) => row.readingPct)),
    avgComp: average(filtered.map((row) => row.comprehensionScore)),
    avgWpm: average(filtered.map((row) => row.wpm)),
  };
}

async function decodeChartPack(encoded) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("Offline Excel export needs a browser with gzip support.");
  }
  const binary = atob(String(encoded || "").trim());
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

export async function buildOfflineAssessmentWorkbook({ teacher, learners, assessments, period }) {
  const [templateResponse, chartResponse] = await Promise.all([
    fetch(TEMPLATE_URL),
    fetch(CHART_PACK_URL),
  ]);
  if (!templateResponse.ok || !chartResponse.ok) {
    throw new Error("Open the teacher app online once before exporting offline.");
  }

  const section = String(teacher?.section || "").trim().toLowerCase();
  const scopedLearners = (Array.isArray(learners) ? learners : []).filter(
    (learner) => !section || String(learner?.section || "").trim().toLowerCase() === section
  );
  const learnerById = new Map(scopedLearners.map((learner) => [Number(learner.id), learner]));
  const rows = (Array.isArray(assessments) ? assessments : [])
    .filter((assessment) =>
      Boolean(assessment?.is_completed ?? assessment?.isCompleted) &&
      String(assessment?.assessment_period ?? assessment?.assessmentPeriod) === period &&
      learnerById.has(Number(assessment?.learner_id ?? assessment?.learnerId))
    )
    .sort((left, right) => new Date(left?.date_administered || 0) - new Date(right?.date_administered || 0))
    .map((assessment, index) => assessmentRow(
      assessment,
      assessment.learner || learnerById.get(Number(assessment?.learner_id ?? assessment?.learnerId)),
      index
    ));

  const enrolled = { Male: 0, Female: 0, Total: 0 };
  for (const learner of scopedLearners) {
    const sex = normalizeSex(learner?.sex);
    if (sex) enrolled[sex] += 1;
  }
  enrolled.Total = enrolled.Male + enrolled.Female;
  const summary = Object.fromEntries(["Male", "Female", "Total"].map((sex) => [sex, summarize(rows, sex)]));
  const output = await buildScoresheetWorkbook({
    templateData: await templateResponse.arrayBuffer(),
    chartParts: await decodeChartPack(await chartResponse.text()),
    teacher: {
      ...teacher,
      fullName: teacher?.fullName || teacher?.full_name || "",
      section: teacher?.section || "",
    },
    rows,
    enrolled,
    summary,
    outputType: "uint8array",
  });
  return new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
