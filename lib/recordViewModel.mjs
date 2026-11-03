import {rosterRecords} from './rosterRecords.mjs';
export const SCORESHEET_GRID_WIDTHS = [
  38, 113, 198, 79, 82, 87, 85, 80, 147, 82, 76, 82, 58, 58, 77, 92, 112,
  128, 118, 176, 220,
];

export const CLASS_SUMMARY_TOP_WIDTHS = [
  98, 122, 137, 119, 80, 79, 83, 74, 104, 104, 66, 78, 94, 83, 78, 104, 104,
  90, 82,
];

export const CLASS_SUMMARY_DETAIL_WIDTHS = CLASS_SUMMARY_TOP_WIDTHS.slice(0, 15);

export const CLASS_RECORD_WIDTHS = [45, 118, 184, 82, 154, 72, 78, 113, 66, 190, 322];

export function recordSummaryFor(
  currentRecords,
  group
) {
  const rows = currentRecords.map(
    ({
      assessment,
      learner,
    }) => ({
      assessment,
      learner,
      total:
        Number(
          assessment.task1_score ||
            0
        ) +
        Number(
          assessment.task2_score ||
            0
        ),
      profile:
        getRecordProfile(
          assessment
        ),
    })
  );

  if (group === "Total") {
    return rows.filter(
      (row) =>
        row.assessment.is_completed
    );
  }

  return rows.filter(
    (row) =>
      row.assessment.is_completed &&
      String(
        row.learner?.sex ||
          ""
      ).toLowerCase() ===
        group.toLowerCase()
  );
}

export function countPart1(
  rows,
  label
) {
  return rows.filter(
    (row) => {
      if (
        label ===
        "Full Refresher"
      ) {
        return row.total <= 0;
      }

      if (
        label ===
        "Moderate Refresher"
      ) {
        return (
          row.total >= 1 &&
          row.total <= 10
        );
      }

      if (
        label ===
        "Light Refresher"
      ) {
        return (
          row.total >= 11 &&
          row.total <= 16
        );
      }

      return row.total >= 17;
    }
  ).length;
}

export function classSummaryAverage(values) {
  const numbers = values
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter(Number.isFinite);

  if (!numbers.length) return null;

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

export function classSummaryPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "";
  }

  return `${Math.round(Number(value))}%`;
}

export function classSummaryWpm(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "";
  }

  return Number(value).toFixed(digits);
}

export function formatName(
  learner
) {
  if (!learner) {
    return "";
  }

  const last =
    learner.last_name || "";
  const first =
    learner.first_name || "";
  const middle =
    learner.middle_name || "";

  const normalizedMiddle = middle
    .trim()
    .replace(/^(n\/?a|none|null|undefined|-|—)$/i, "");

  const initial = normalizedMiddle
    ? `${normalizedMiddle.charAt(0).toUpperCase()}.`
    : "";

  const familyAndGiven = [last, first]
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join(", ");

  const suffix = String(
    learner.suffix || ""
  ).trim();

  return [familyAndGiven, initial, suffix]
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join(" ");
}

export function profileClass(
  profile
) {
  if (!profile) {
    return "neutral";
  }

  if (
    profile.includes(
      "Grade Level"
    )
  ) {
    return "grade";
  }

  if (
    profile.includes(
      "Emerging"
    )
  ) {
    return "danger";
  }

  if (
    profile.includes(
      "Developing"
    ) ||
    profile.includes(
      "Refresher"
    )
  ) {
    return "warning";
  }

  return "info";
}

export const READING_PROFILE_LABELS = [
  "Low Emerging Reader",
  "High Emerging Reader",
  "Developing Reader",
  "Transitioning Reader",
  "Reading At Grade Level",
];

export const PART1_LEVEL_LABELS = [
  "Full Refresher",
  "Moderate Refresher",
  "Light Refresher",
  "Grade Ready",
];

export function normalizeReadingProfile(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const canonical = READING_PROFILE_LABELS.find(
    (label) => label.toLowerCase() === raw.toLowerCase()
  );

  return canonical || raw;
}

export function hasRecordedPassageAssessment(assessment) {
  const totalPart1Score =
    Number(assessment?.task1_score ?? 0) +
    Number(assessment?.task2_score ?? 0);

  return (
    totalPart1Score > 10 &&
    assessment?.timer_seconds !== null &&
    assessment?.timer_seconds !== undefined
  );
}

export function getRecordWordsRead(assessment) {
  if (!hasRecordedPassageAssessment(assessment)) {
    return 0;
  }

  return assessment?.words_read ?? 0;
}

export function getRecordFluency(assessment) {
  if (!hasRecordedPassageAssessment(assessment)) {
    return 0;
  }

  if (
    assessment?.miscue_accuracy === null ||
    assessment?.miscue_accuracy === undefined
  ) {
    return null;
  }

  return Number(assessment.miscue_accuracy);
}

export function getRecordProfile(assessment) {
  if (assessment?.enrolled_only) return "";
  const task1 = Number(
    assessment?.task1_score ?? 0
  );
  const task2 = Number(
    assessment?.task2_score ?? 0
  );

  if (task1 + task2 <= 10) {
    return "Low Emerging Reader";
  }

  // Prefer what the API actually stored, folded onto the canonical label, so a
  // legacy case-variant row still counts in every distribution.
  const stored = normalizeReadingProfile(
    assessment?.overall_classification ||
      assessment?.classification_label
  );

  if (stored) {
    return stored;
  }

  return calculateFallbackProfile(
    assessment?.miscue_accuracy,
    assessment?.comprehension_score
  );
}

export function calculateFallbackProfile(
  accuracy,
  comprehension
) {
  if (
    accuracy ===
      null ||
    accuracy === undefined
  ) {
    return "Not Assessed";
  }

  const a = Number(
    accuracy
  );

  const c = Number(
    comprehension || 0
  );

  if (a <= 25) {
    return "High Emerging Reader";
  }

  if (
    a >= 26 &&
    a <= 50 &&
    c === 0
  ) {
    return "High Emerging Reader";
  }

  if (
    a >= 26 &&
    a <= 50 &&
    c >= 1
  ) {
    return "Developing Reader";
  }

  if (
    a >= 51 &&
    a <= 75 &&
    c <= 2
  ) {
    return "Developing Reader";
  }

  if (
    a >= 51 &&
    a <= 75 &&
    c >= 3
  ) {
    return "Transitioning Reader";
  }

  if (
    a >= 76 &&
    c >= 5
  ) {
    return "Reading At Grade Level";
  }

  return "Transitioning Reader";
}

export function buildScoresheetHeader(learners,currentRecords){
    const enrolledFor = (group) =>
      group === "Total"
        ? learners.length
        : learners.filter(
            (learner) =>
              String(learner?.sex || "").toLowerCase() ===
              group.toLowerCase()
          ).length;

    const assessedFor = (group) =>
      recordSummaryFor(currentRecords, group).length;

    return {
      male: { enrolled: enrolledFor("Male"), assessed: assessedFor("Male") },
      female: { enrolled: enrolledFor("Female"), assessed: assessedFor("Female") },
      total: { enrolled: enrolledFor("Total"), assessed: assessedFor("Total") },
    };
  }
export function buildClassSummaryRows(learners,currentRecords){
    const enrolledFor = (group) =>
      group === "Total"
        ? learners.length
        : learners.filter(
            (learner) =>
              String(learner?.sex || "").toLowerCase() === group.toLowerCase()
          ).length;

    return ["Male", "Female", "Total"].map((group) => {
      const rows = recordSummaryFor(currentRecords, group);
      const passageRows = rows.filter(({ assessment }) =>
        hasRecordedPassageAssessment(assessment)
      );
      const assessed = rows.length;
      const enrolled = enrolledFor(group);
      const part1Counts = PART1_LEVEL_LABELS.map((label) =>
        countPart1(rows, label)
      );
      const profileCounts = READING_PROFILE_LABELS.map(
        (label) => rows.filter((row) => row.profile === label).length
      );
      const averageFluency = classSummaryAverage(
        passageRows.map(({ assessment }) => getRecordFluency(assessment))
      );
      const averageComprehension = classSummaryAverage(
        passageRows.map(({ assessment }) => assessment.comprehension_score)
      );
      const averageWpm = classSummaryAverage(
        passageRows.map(({ assessment }) => {
          if (assessment.wpm !== null && assessment.wpm !== undefined) {
            return assessment.wpm;
          }

          const seconds = Number(assessment.timer_seconds || 0);
          return seconds > 0
            ? (Number(getRecordWordsRead(assessment) || 0) / seconds) * 60
            : null;
        })
      );

      return {
        group,
        enrolled,
        assessed,
        part1Counts,
        profileCounts,
        averageFluency,
        averageComprehension,
        averageWpm,
        assessedPercent: enrolled > 0 ? (assessed / enrolled) * 100 : 0,
      };
    });
  }