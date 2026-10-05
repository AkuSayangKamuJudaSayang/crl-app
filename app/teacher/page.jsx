// Keep this file aligned with the working teacher dashboard baseline.
"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import ClassRecordImport from "./ClassRecordImport";
import { signOutOfflineTeacherSession } from "../../lib/teacherOfflineDb";
import {
  ASSESSMENT_CONTENT_LIMITS,
  ASSESSMENT_CONTENT_REQUIREMENTS,
  ASSESSMENT_PERIODS,
  DEFAULT_ASSESSMENT_CONTENT,
  DEFAULT_ASSESSMENT_CONTENT_MODE,
  STORY_IMPORT_FILE_ACCEPT,
  cloneAssessmentContent,
  getAssessmentContentIssues,
  normalizeAssessmentContentDefaults,
  normalizeAssessmentContentMode,
  normalizeAssessmentContentModes,
  normalizeAssessmentPeriodContent,
  splitStoryWords,
  storyWordCount,
} from "../../lib/assessmentContent";

const TABS = [
  {
    id: "dashboard",
    label: "Home",
    icon: "⌂",
  },
  {
    id: "conduct",
    label: "Conduct Assessment",
    icon: "▶",
  },
  {
    id: "records",
    label: "Assessment Records",
    icon: "▤",
  },
  {
    id: "activities",
    label: "Manage Assessment",
    icon: "▥",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: "◔",
  },
  {
    id: "profile",
    label: "Profile",
    icon: "●",
  },
];

const PERIODS = ASSESSMENT_PERIODS;
const PERIOD_MEANINGS = {
  BoSY: "Beginning of School Year",
  MoSY: "Middle of School Year",
  EoSY: "End of School Year",
};
const ANALYTICS_COMPARISON_OPTIONS = [
  { value: "all", label: "All 3" },
  { value: "BoSY-MoSY", label: "BoSY–MoSY" },
  { value: "MoSY-EoSY", label: "MoSY–EoSY" },
  { value: "BoSY-EoSY", label: "BoSY–EoSY" },
];
const DEFAULT_CONTENT = cloneAssessmentContent(DEFAULT_ASSESSMENT_CONTENT);

/*
 * Column widths for the Assessment Records scoresheet, in workbook order
 * A..U. They follow the exported sheet's proportions so the same heading sits
 * over the same column in both.
 */
const SCORESHEET_GRID_WIDTHS = [
  38, 113, 198, 79, 82, 87, 85, 80, 147, 82, 76, 82, 58, 58, 77, 92, 112,
  128, 118, 176, 220,
];

/*
 * Excel's Class Summary column proportions. The in-app tables deliberately
 * keep the workbook's wide sheet geometry and scroll horizontally rather than
 * compressing or stacking headings on tablet and mobile screens.
 */
const CLASS_SUMMARY_TOP_WIDTHS = [
  98, 122, 137, 119, 80, 79, 83, 74, 104, 104, 66, 78, 94, 83, 78, 104, 104,
  90, 82,
];

const CLASS_SUMMARY_DETAIL_WIDTHS = CLASS_SUMMARY_TOP_WIDTHS.slice(0, 15);

/* A:D plus the English K:Q block from the official Class Record sheet. */
const CLASS_RECORD_WIDTHS = [45, 118, 184, 82, 154, 72, 78, 113, 66, 190, 322];

const ANALYTICS_REVIEW_QUESTIONS = {
  para: [
    "What must Para look for?",
    "What time or part of the day is it?",
    "What does Para land on?",
    "Who does Para see?",
    "What else is the police officer doing besides directing traffic?",
    "What could the police officer be feeling?",
  ],
  fields: [
    "What is the job of Dulnuwan?",
    "When do Ali and Dina help Dulnuwan and Bugan?",
    "Where do they rest?",
    "Why do they rest?",
    "What kind of weather or day is it?",
    "What does Dulnuwan pick up?",
  ],
};

/*
 * How each period draws its items out of everything the teacher has saved.
 * "fixed" administers the first items in the saved order; "random" draws a
 * different combination for every new assessment.
 */
function defaultContentModes() {
  return PERIODS.reduce(
    (next, period) => ({
      ...next,
      [period]: normalizeAssessmentContentModes(
        DEFAULT_ASSESSMENT_CONTENT_MODE
      ),
    }),
    {}
  );
}

function normalizeContentModes(value) {
  const source = value || {};
  return PERIODS.reduce(
    (next, period) => ({
      ...next,
      [period]: normalizeAssessmentContentModes(source[period]),
    }),
    {}
  );
}

function defaultContentDefaults() {
  return PERIODS.reduce(
    (next, period) => ({
      ...next,
      [period]: normalizeAssessmentContentDefaults(null),
    }),
    {}
  );
}

function normalizeContentDefaults(value) {
  const source = value || {};
  return PERIODS.reduce(
    (next, period) => ({
      ...next,
      [period]: normalizeAssessmentContentDefaults(source[period]),
    }),
    {}
  );
}

/*
 * Letters, words and stories are identified by their own text when a teacher
 * picks which ones the fixed default uses: a content save recreates the rows,
 * so their database ids and positions do not survive it, but the letter, the
 * word and the story title do.
 */
function contentDefaultKey(category, item) {
  return category === "stories"
    ? String(item?.title || "").trim()
    : String(item ?? "").trim();
}

function contentDefaultLabel(category) {
  if (category === "letters") return "letters";
  if (category === "words") return "words";
  return "stories";
}

function isContentItemDefault(category, item, defaults) {
  const chosen = normalizeAssessmentContentDefaults(defaults);
  return chosen[category].includes(contentDefaultKey(category, item));
}

function dateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function recordSummaryFor(
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

function countPart1(
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

function classSummaryAverage(values) {
  const numbers = values
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter(Number.isFinite);

  if (!numbers.length) return null;

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function classSummaryPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "";
  }

  return `${Math.round(Number(value))}%`;
}

function classSummaryWpm(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "";
  }

  return Number(value).toFixed(digits);
}

function formatName(
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

function profileClass(
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

/*
 * Single source of truth for CRLA reading-profile labels.
 *
 * The API stores these exact strings in `assessment_sessions.overall_classification`
 * and `session_metrics.classification_label`, and the official scoresheet uses
 * "Reading At Grade Level" (capital A). Every client surface must compare
 * against the same strings: the case-variant copies that used to live in this
 * file made Class Summary and Class Analytics report 0 learners at a level the
 * scoresheet displayed for a real learner.
 */
const READING_PROFILE_LABELS = [
  "Low Emerging Reader",
  "High Emerging Reader",
  "Developing Reader",
  "Transitioning Reader",
  "Reading At Grade Level",
];

const READING_PROFILE_COLORS = {
  "Low Emerging Reader": "#9b2e22",
  "High Emerging Reader": "#c0392b",
  "Developing Reader": "#a9762f",
  "Transitioning Reader": "#1a2b4c",
  "Reading At Grade Level": "#3e7a5e",
};

const PART1_LEVEL_LABELS = [
  "Full Refresher",
  "Moderate Refresher",
  "Light Refresher",
  "Grade Ready",
];

function normalizeReadingProfile(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const canonical = READING_PROFILE_LABELS.find(
    (label) => label.toLowerCase() === raw.toLowerCase()
  );

  return canonical || raw;
}

function hasRecordedPassageAssessment(assessment) {
  const totalPart1Score =
    Number(assessment?.task1_score ?? 0) +
    Number(assessment?.task2_score ?? 0);

  return (
    totalPart1Score > 10 &&
    assessment?.timer_seconds !== null &&
    assessment?.timer_seconds !== undefined
  );
}

function getRecordWordsRead(assessment) {
  if (!hasRecordedPassageAssessment(assessment)) {
    return 0;
  }

  return assessment?.words_read ?? 0;
}

function getRecordFluency(assessment) {
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

function getRecordProfile(assessment) {
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

function calculateFallbackProfile(
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

function statusForLearner(
  learnerId,
  assessments
) {
  const rows =
    assessments.filter(
      (assessment) =>
        Number(
          assessment.learner_id
        ) ===
        Number(learnerId)
    );

  const bosy = rows.some(
    (item) =>
      item.assessment_period ===
        "BoSY" &&
      item.is_completed
  );

  const mosy = rows.some(
    (item) =>
      item.assessment_period ===
        "MoSY" &&
      item.is_completed
  );

  const eosy = rows.some(
    (item) =>
      item.assessment_period ===
        "EoSY" &&
      item.is_completed
  );

  if (bosy && mosy) {
    return {
      key: "both",
      label:
        "Completed: BoSY & MoSY",
    };
  }

  if (eosy) {
    return {
      key: "eosy",
      label:
        "Completed: EoSY",
    };
  }

  if (mosy) {
    return {
      key: "mosy",
      label:
        "Completed: MoSY",
    };
  }

  if (bosy) {
    return {
      key: "bosy",
      label:
        "Completed: BoSY",
    };
  }

  return {
    key: "none",
    label: "No Assessment",
  };
}

/* ---------------------------------------------------------------------------
 * Class Analytics
 *
 * Every panel below reads the same resolved record rows the Assessment Records
 * tab uses (`buildAnalyticsRow` -> `getRecordProfile`), so a chart can never
 * disagree with the scoresheet, the Class Summary, or the stored
 * `overall_classification`. Records that never had the passage administered are
 * excluded from fluency/accuracy charts, exactly like the scoresheet.
 * ------------------------------------------------------------------------- */

const PART1_LEVEL_COLORS = {
  "Full Refresher": "#c0392b",
  "Moderate Refresher": "#a9762f",
  "Light Refresher": "#a9762f",
  "Grade Ready": "#3e7a5e",
};

const ANALYTICS_GROUP_COLORS = {
  Male: "#1a2b4c",
  Female: "#c0392b",
  Total: "#3e7a5e",
};

const ANALYTICS_STYLES = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "14px",
    marginTop: "14px",
  },
  panel: {
    border: "1px solid #dce3ec",
    borderRadius: "16px",
    background: "#ffffff",
    padding: "16px",
    minWidth: 0,
  },
  panelTitle: {
    margin: 0,
    color: "#2a3a55",
    fontSize: "14px",
    fontWeight: 950,
  },
  panelHint: {
    margin: "4px 0 12px",
    color: "#6b7789",
    fontSize: "11px",
    fontWeight: 700,
    lineHeight: 1.45,
  },
  barStack: { display: "grid", gap: "10px" },
  barRow: { display: "grid", gap: "5px", minWidth: 0 },
  barTop: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "10px",
    fontSize: "12px",
    fontWeight: 850,
    color: "#2a3a55",
  },
  barLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  barValue: { color: "#2a3a55", fontWeight: 950, whiteSpace: "nowrap" },
  barTrack: {
    height: "10px",
    borderRadius: "999px",
    background: "#edf1f7",
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: "999px" },
  empty: { color: "#98a2b3", fontSize: "12px", fontWeight: 700, padding: "10px 0" },
  legend: { display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    color: "#46536b",
    fontSize: "10.5px",
    fontWeight: 800,
  },
  legendSwatch: { width: "9px", height: "9px", borderRadius: "3px" },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
    gap: "8px",
  },
  statBox: {
    border: "1px solid #dce3ec",
    borderRadius: "12px",
    background: "#fafafa",
    padding: "9px 10px",
    textAlign: "center",
  },
  statLabel: {
    color: "#6b7789",
    fontSize: "9.5px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: ".05em",
  },
  statValue: {
    marginTop: "3px",
    color: "#2a3a55",
    fontSize: "17px",
    fontWeight: 950,
  },
  groupRow: {
    display: "grid",
    gap: "7px",
    padding: "10px 0",
    borderTop: "1px solid #edf1f7",
  },
  groupHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    fontSize: "12px",
    fontWeight: 950,
    color: "#2a3a55",
  },
  matrixWrap: {
    position: "relative",
    height: "230px",
    borderLeft: "1px solid #c7d2e0",
    borderBottom: "1px solid #c7d2e0",
    background: "#fafafa",
    margin: "6px 0 0 40px",
    borderRadius: "0 0 10px 0",
  },
  matrixDot: {
    position: "absolute",
    width: "13px",
    height: "13px",
    borderRadius: "50%",
    border: "2px solid #ffffff",
    boxShadow: "none",
    transform: "translate(-50%, 50%)",
  },
  matrixAxisY: {
    position: "absolute",
    left: "-38px",
    top: 0,
    bottom: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "flex-end",
    color: "#6b7789",
    fontSize: "10px",
    fontWeight: 800,
    width: "34px",
  },
  matrixAxisX: {
    display: "flex",
    justifyContent: "space-between",
    margin: "5px 0 0 40px",
    color: "#6b7789",
    fontSize: "10px",
    fontWeight: 800,
  },
  trendGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "10px",
  },
  trendCol: {
    border: "1px solid #dce3ec",
    borderRadius: "12px",
    background: "#fafafa",
    padding: "10px",
  },
  trendTitle: {
    color: "#2a3a55",
    fontSize: "12px",
    fontWeight: 950,
    marginBottom: "8px",
  },
};

function analyticsAverage(values) {
  const usable = values.filter(
    (value) =>
      value !== null &&
      value !== undefined &&
      !Number.isNaN(Number(value))
  );

  if (!usable.length) return null;

  return usable.reduce((sum, value) => sum + Number(value), 0) / usable.length;
}

/*
 * One resolved analytics row per assessment. This is the only place analytics
 * derives a profile, an accuracy or a WPM value, so charts and tables cannot
 * drift apart the way the previous per-tab copies did.
 */
function buildAnalyticsRow(assessment, learner) {
  const total =
    Number(assessment?.task1_score || 0) +
    Number(assessment?.task2_score || 0);
  const administered = hasRecordedPassageAssessment(assessment);
  const accuracyValue = administered ? getRecordFluency(assessment) : null;
  const wordsRead = administered ? Number(getRecordWordsRead(assessment) || 0) : 0;
  const seconds = Number(assessment?.timer_seconds ?? 0);
  const wpmValue = administered
    ? assessment?.wpm !== null && assessment?.wpm !== undefined
      ? Number(assessment.wpm)
      : seconds > 0
        ? Number(((wordsRead / seconds) * 60).toFixed(2))
        : null
    : null;

  return {
    assessment,
    learner,
    total,
    profile: getRecordProfile(assessment),
    part1Level:
      total <= 0
        ? "Full Refresher"
        : total <= 10
          ? "Moderate Refresher"
          : total <= 16
            ? "Light Refresher"
            : "Grade Ready",
    administered,
    accuracy:
      accuracyValue === null || accuracyValue === undefined
        ? null
        : Number(accuracyValue),
    comprehension: administered ? Number(assessment?.comprehension_score || 0) : null,
    wordsRead,
    wpm:
      wpmValue === null || wpmValue === undefined || Number.isNaN(wpmValue)
        ? null
        : wpmValue,
    isCompleted: Boolean(assessment?.is_completed),
  };
}

function analyticsQuestionsForStory(title) {
  return /field/i.test(String(title || ""))
    ? ANALYTICS_REVIEW_QUESTIONS.fields
    : ANALYTICS_REVIEW_QUESTIONS.para;
}

function formatAnalyticsMiscueType(value) {
  const type = String(value || "Miscue").trim();
  return type === "SelfCorrection"
    ? "Self-correction"
    : type.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function AnalyticsPeriodBars({ period, mode, maxCount, interactive = false, onPress }) {
  return (
    <div className="analyticsBarCluster">
      {period.profiles.map((profile) => {
        const value = mode === "percent" ? profile.percent : profile.count;
        const height = mode === "percent"
          ? profile.percent
          : (profile.count / Math.max(1, maxCount)) * 100;
        const style = {
          "--bar-height": `${Math.max(profile.count ? 4 : 0, height)}%`,
        };
        const contents = (
          <>
            <span className="analyticsBarValue">{mode === "percent" ? `${value}%` : value}</span>
            <span
              className="analytics2dBar"
              style={{
                "--bar-color": READING_PROFILE_COLORS[profile.label] || "#1a2b4c",
              }}
            />
          </>
        );

        return interactive ? (
          <button
            type="button"
            key={profile.label}
            className="analyticsBarButton"
            style={style}
            aria-label={`${period.period}, ${profile.label}: ${profile.count} learner${profile.count === 1 ? "" : "s"}, ${profile.percent}%`}
            title={`${profile.label}: ${profile.count} (${profile.percent}%)`}
            onClick={(event) => {
              event.stopPropagation();
              onPress?.();
            }}
          >
            {contents}
          </button>
        ) : (
          <div
            key={profile.label}
            className="analyticsBarButton analyticsBarStatic"
            style={style}
            aria-hidden="true"
          >
            {contents}
          </div>
        );
      })}
    </div>
  );
}

function AnalyticsChartScale({ mode, maxCount }) {
  return (
    <div className="analyticsChartScale" aria-hidden="true">
      {[100, 75, 50, 25, 0].map((tick) => (
        <span key={tick}>
          {mode === "percent" ? `${tick}%` : Math.round((tick / 100) * maxCount)}
        </span>
      ))}
    </div>
  );
}

function ReadingProfileProgressChart({
  periods,
  mode,
  onModeChange,
  focus,
  onFocus,
  onExpand,
}) {
  const chartPeriods = Array.isArray(periods) ? periods : [];
  const visiblePeriods = focus
    ? chartPeriods.filter((period) => period.period === focus)
    : chartPeriods;
  const maxCount = Math.max(
    1,
    ...visiblePeriods.flatMap((period) => period.profiles.map((profile) => profile.count))
  );

  return (
    <section
      className={`analyticsProgressPanel${focus ? " isPeriodFocused" : ""}`}
      onClick={() => {
        if (focus) onFocus(null);
      }}
    >
      <div className="analyticsSectionHead">
        <div className="analyticsChartHeading">
          <h3>Reading Profile Progress</h3>
          {focus ? <span>{focus} focus</span> : null}
          <p>Press a period chart to enlarge.</p>
        </div>
        <div className="analyticsModeSwitch" aria-label="Chart values">
          {["percent", "count"].map((option) => (
            <button
              type="button"
              key={option}
              className={mode === option ? "active" : ""}
              onClick={() => onModeChange(option)}
            >
              {option === "percent" ? "%" : "No."}
            </button>
          ))}
        </div>
      </div>

      <div className="analyticsChartScroller analyticsDesktopChart" tabIndex={0}>
        <div className="analyticsChartCanvas">
          <AnalyticsChartScale mode={mode} maxCount={maxCount} />
          <div className={`analyticsChartPeriods${focus ? " zoomed" : ""}`}>
            {visiblePeriods.map((period) => (
              <div className={`analyticsPeriodGroup${focus ? " focused" : ""}`} key={period.period}>
                <AnalyticsPeriodBars
                  period={period}
                  mode={mode}
                  maxCount={maxCount}
                  interactive
                  onPress={() => onExpand(period.period)}
                />
                <strong>{period.period}</strong>
                <small>{PERIOD_MEANINGS[period.period]}</small>
                <span>{period.total} assessed</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="analyticsMobileChartStack">
        {chartPeriods.map((period) => (
          <div
            className="analyticsMobilePeriodCard"
            key={period.period}
            onClick={(event) => {
              event.stopPropagation();
              onExpand(period.period);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onExpand(period.period);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Enlarge ${period.period}, ${PERIOD_MEANINGS[period.period]} chart`}
            aria-haspopup="dialog"
          >
            <span className="analyticsMobilePeriodHead">
              <span>
                <strong>{period.period}</strong>
                <small>{PERIOD_MEANINGS[period.period]}</small>
              </span>
              <em>{period.total} assessed</em>
            </span>
            <div className="analyticsMobileChartPlot">
              <AnalyticsChartScale mode={mode} maxCount={maxCount} />
              <AnalyticsPeriodBars period={period} mode={mode} maxCount={maxCount} />
            </div>
            <span className="analyticsMobileChartAction">Press chart to enlarge</span>
          </div>
        ))}
      </div>

      <div className="analyticsLegend">
        {READING_PROFILE_LABELS.map((label) => (
          <span key={label}>
            <span style={{ background: READING_PROFILE_COLORS[label] }} />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

function AnalyticsComparisonPanel({ periods, selection, onSelectionChange }) {
  const chartPeriods = Array.isArray(periods) ? periods : [];
  const selectedNames = selection === "all" ? PERIODS : selection.split("-");
  const selectedPeriods = selectedNames
    .map((name) => chartPeriods.find((period) => period.period === name))
    .filter(Boolean);

  return (
    <section className="analyticsComparisonPanel" aria-labelledby="analytics-comparison-title">
      <div className="analyticsComparisonHead">
        <h3 id="analytics-comparison-title">Profile Comparison</h3>
        <div className="analyticsComparisonSwitch" aria-label="Periods to compare">
          {ANALYTICS_COMPARISON_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              className={selection === option.value ? "active" : ""}
              onClick={() => onSelectionChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="analyticsComparisonNote">Counts show assessed learners in each period. Signed changes compare with the preceding selected period.</p>
      <div className="analyticsComparisonRows">
        {READING_PROFILE_LABELS.map((label) => {
          const values = selectedPeriods.map((period) => ({
            period: period.period,
            count: period.profiles.find((profile) => profile.label === label)?.count || 0,
          }));
          return (
            <div className="analyticsComparisonRow" key={label}>
              <span className="analyticsComparisonLabel">
                <i style={{ background: READING_PROFILE_COLORS[label] }} />
                <strong>{label}</strong>
              </span>
              <span className="analyticsComparisonValues">
                {values.map((value, index) => {
                  const previous = values[index - 1];
                  const delta = previous ? value.count - previous.count : null;
                  return (
                    <span className="analyticsComparisonValue" key={value.period}>
                      <small>{value.period}</small>
                      <b>{value.count}</b>
                      {delta !== null ? (
                        <em className={delta > 0 ? "up" : delta < 0 ? "down" : "flat"} aria-label={`${delta > 0 ? "+" : ""}${delta} learners compared with ${previous.period}`}>
                          {delta > 0 ? "+" : ""}{delta}
                        </em>
                      ) : null}
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AnalyticsPeriodChartDialog({ period, periods, mode, onClose }) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(typeof document !== "undefined" ? document.activeElement : null);
  useEffect(() => {
    const previousFocus = previousFocusRef.current;
    const dialog = dialogRef.current;
    const trapFocus = (event) => {
      if (event.key !== "Tab" || !dialog) return;
      const controls = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex="0"]');
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener("keydown", trapFocus);
    return () => {
      dialog?.removeEventListener("keydown", trapFocus);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  if (!period) return null;
  const maxCount = Math.max(
    1,
    ...(Array.isArray(periods) ? periods : []).flatMap((item) =>
      item.profiles.map((profile) => profile.count)
    )
  );

  return (
    <div
      className="analyticsChartOverlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="analyticsChartDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analytics-chart-dialog-title"
      >
        <header className="analyticsChartDialogHead">
          <div>
            <strong id="analytics-chart-dialog-title">{period.period}</strong>
            <span>{PERIOD_MEANINGS[period.period]}</span>
          </div>
          <button type="button" autoFocus onClick={onClose} aria-label="Close enlarged chart">×</button>
        </header>
        <div className="analyticsChartDialogBody">
          <div className="analyticsEnlargedChartPlot">
            <AnalyticsChartScale mode={mode} maxCount={maxCount} />
            <AnalyticsPeriodBars period={period} mode={mode} maxCount={maxCount} />
          </div>
          <div className="analyticsChartDialogTotal">{period.total} assessed</div>
          <div className="analyticsLegend analyticsDialogLegend">
            {READING_PROFILE_LABELS.map((label) => (
              <span key={label}>
                <span style={{ background: READING_PROFILE_COLORS[label] }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AnalyticsEvidenceList({ title, rows, emptyText }) {
  const items = Array.isArray(rows) ? rows : [];
  return (
    <section className="analyticsEvidenceBlock">
      <h4>{title}</h4>
      {items.length ? (
        <div className="analyticsEvidenceItems">
          {items.map((item, index) => (
            <div className={`analyticsEvidenceItem ${item.correct ? "correct" : "incorrect"}`} key={item.id ?? `${title}-${index}`}>
              <span>{item.label}</span>
              <strong>{item.correct ? "Correct" : "Incorrect"}</strong>
            </div>
          ))}
        </div>
      ) : <div className="analyticsEvidenceEmpty">{emptyText || "No recorded items."}</div>}
    </section>
  );
}

function LearnerAssessmentEvidence({ detail }) {
  if (!detail) return null;
  const letterRows = (detail.letter_results || detail.task1_results || []).map((item, index) => ({
    id: item.id ?? `letter-${index}`,
    label: item.letter ?? item.content ?? item.item ?? `Letter ${index + 1}`,
    correct: Boolean(item.is_correct ?? item.isCorrect ?? item.correct),
  }));
  const wordRows = (detail.word_results || detail.task2_results || []).map((item, index) => ({
    id: item.id ?? `word-${index}`,
    label: item.word ?? item.content ?? item.item ?? `Word ${index + 1}`,
    correct: Boolean(item.is_correct ?? item.isCorrect ?? item.correct),
  }));
  const questions = analyticsQuestionsForStory(detail.story_title);
  const comprehensionRows = (detail.comprehension_results || []).map((item, index) => ({
    id: item.id ?? `question-${index}`,
    label: item.question || questions[Number(item.question_index ?? item.questionIndex ?? item.index ?? index)] || `Question ${index + 1}`,
    correct: Boolean(item.is_correct ?? item.isCorrect ?? item.correct),
  }));
  const miscues = detail.passage_miscues || [];
  const passageWords = String(detail.story_text || "").trim().split(/\s+/).filter(Boolean);
  const normalizedMiscues = miscues
    .map((item, index) => {
      const wordIndex = Number(item.word_index ?? item.wordIndex ?? item.index);
      const hasIndex = Number.isInteger(wordIndex) && wordIndex >= 0;
      const originalWord = hasIndex && passageWords[wordIndex]
        ? passageWords[wordIndex]
        : item.word || item.original_word || `Word ${hasIndex ? wordIndex + 1 : index + 1}`;
      return {
        id: item.id ?? `miscue-${index}`,
        wordIndex: hasIndex ? wordIndex : null,
        originalWord,
        type: formatAnalyticsMiscueType(item.miscue_type ?? item.miscueType ?? item.type),
        misreadWord: String(item.misread_word ?? item.misreadWord ?? "").trim(),
      };
    })
    .sort((left, right) => (left.wordIndex ?? Number.MAX_SAFE_INTEGER) - (right.wordIndex ?? Number.MAX_SAFE_INTEGER));
  const miscuesByIndex = normalizedMiscues.reduce((map, item) => {
    if (item.wordIndex === null) return map;
    const current = map.get(item.wordIndex) || [];
    current.push(item);
    map.set(item.wordIndex, current);
    return map;
  }, new Map());
  const recordedTimerSeconds = detail.timer_seconds ?? detail.timerSeconds;
  const passageWasAdministered =
    recordedTimerSeconds !== null &&
    recordedTimerSeconds !== undefined &&
    Number.isFinite(Number(recordedTimerSeconds));
  const timeLimitReached = passageWasAdministered && Number(recordedTimerSeconds) >= 120;
  const trailingOmissions = new Set(
    normalizedMiscues
      .filter((item) => item.type === "Omission" && item.wordIndex !== null)
      .map((item) => item.wordIndex)
  );
  let lastWordNumber = passageWasAdministered ? passageWords.length : 0;
  if (timeLimitReached) {
    while (lastWordNumber > 0 && trailingOmissions.has(lastWordNumber - 1)) {
      lastWordNumber -= 1;
    }
  }
  const recordedWordsRead = Number(detail.words_read ?? detail.wordsRead);
  if (passageWasAdministered && !passageWords.length && Number.isFinite(recordedWordsRead)) {
    lastWordNumber = Math.max(0, Math.round(recordedWordsRead));
  }
  const lastWordRead = passageWords[lastWordNumber - 1] || "";

  return (
    <div className="analyticsEvidence">
      <div className="analyticsEvidenceSummary">
        <div><span>Profile</span><strong>{getRecordProfile(detail)}</strong></div>
        <div><span>Letters</span><strong>{Number(detail.task1_score || 0)}/10</strong></div>
        <div><span>Words</span><strong>{Number(detail.task2_score || 0)}/10</strong></div>
        <div><span>Comprehension</span><strong>{Number(detail.comprehension_score || 0)}/6</strong></div>
      </div>
      <div className="analyticsEvidenceGrid">
        <AnalyticsEvidenceList title="Letters" rows={letterRows} />
        <AnalyticsEvidenceList title="Words" rows={wordRows} />
        <AnalyticsEvidenceList title="Comprehension" rows={comprehensionRows} />
        <section className="analyticsEvidenceBlock analyticsPassageEvidence">
          <h4>Reading Miscues</h4>
          {lastWordNumber > 0 ? (
            <div className="analyticsLastWordRead">
              <span>Last word read</span>
              <strong>{lastWordRead || `Word ${lastWordNumber}`}</strong>
              <small>Word {lastWordNumber}{passageWords.length ? ` of ${passageWords.length}` : ""}</small>
            </div>
          ) : null}
          {passageWords.length ? (
            <p className="analyticsPassageText">
              {passageWords.map((word, index) => {
                const wordMiscues = miscuesByIndex.get(index) || [];
                const types = wordMiscues.map((item) => item.type).join(", ");
                return (
                  <span
                    key={`${word}-${index}`}
                    className={wordMiscues.length ? "miscued" : ""}
                    title={types || undefined}
                  >
                    {word}{" "}
                  </span>
                );
              })}
            </p>
          ) : null}
          {normalizedMiscues.length ? (
            <div className="analyticsMiscueLedger" aria-label="Recorded reading miscues">
              {normalizedMiscues.map((item) => (
                <div className="analyticsMiscueRow" key={item.id}>
                  <div>
                    <strong>{item.originalWord}</strong>
                    <small>{item.wordIndex === null ? "Recorded word" : `Word ${item.wordIndex + 1}`}</small>
                  </div>
                  <span>{item.type}</span>
                  {item.misreadWord ? <small>Read as “{item.misreadWord}”</small> : null}
                </div>
              ))}
            </div>
          ) : <div className="analyticsEvidenceEmpty">No miscues recorded.</div>}
        </section>
      </div>
    </div>
  );
}

function AnalyticsLearnerResultPanel({
  className = "",
  selectedLearner,
  selectedPeriods,
  period,
  onPeriodChange,
  loading,
  error,
  selectedAssessment,
  detail,
}) {
  return (
    <div className={`analyticsLearnerResult ${className}`.trim()}>
      <div className="analyticsResultHeader">
        <div>
          <span>Selected learner</span>
          <strong>{selectedLearner ? formatName(selectedLearner) : "Select a learner"}</strong>
          {selectedLearner ? <small>{selectedLearner.lrn || "No LRN"}</small> : null}
        </div>
        <div className="analyticsPeriodSwitch" role="group" aria-label="Assessment period">
          {PERIODS.map((assessmentPeriod) => {
            const available = selectedPeriods.includes(assessmentPeriod);
            return (
              <button
                type="button"
                key={assessmentPeriod}
                disabled={!available}
                className={period === assessmentPeriod ? "active" : ""}
                onClick={() => onPeriodChange(assessmentPeriod)}
              >
                {assessmentPeriod}
              </button>
            );
          })}
        </div>
      </div>

      <div className="analyticsResultBody">
        {loading ? (
          <div className="analyticsDetailState"><span className="loadingSpinner" /> Loading result…</div>
        ) : error ? (
          <div className="analyticsDetailState error">{error}</div>
        ) : !selectedAssessment ? (
          <div className="analyticsDetailState">Select a learner result.</div>
        ) : (
          <LearnerAssessmentEvidence detail={detail || selectedAssessment} />
        )}
      </div>
    </div>
  );
}

function Icon({
  children,
}) {
  return (
    <span className="iconGlyph">
      {children}
    </span>
  );
}

export default function TeacherPage() {
  const router = useRouter();

  const [user, setUser] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [activeTab, setActiveTab] =
    useState("dashboard");

  /*
   * Bento shell view state (presentation only). `false` renders the centred
   * bento menu; `true` reveals the already-selected tab full screen. Every
   * tab, handler and data path below is untouched.
   */
  const [bentoOpen, setBentoOpen] =
    useState(false);

  /*
   * Mobile-only disclosure for the Home block. Desktop ignores it (the
   * dashboard body is always shown there). Presentation only.
   */
  const [homeExpanded, setHomeExpanded] =
    useState(false);

  /*
   * Offline mode. The dashboard is usable without a connection once the
   * teacher has signed in online, but signing out while offline would strand
   * them - the server cannot verify credentials again. So while offline the
   * control becomes "Exit", which leaves the app and keeps the saved session.
   */
  const [isOffline, setIsOffline] =
    useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const sync = () =>
      setIsOffline(
        window.navigator.onLine === false
      );

    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);

    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "conduct") {
      setActiveTab("conduct");
      setBentoOpen(true);
    }
  }, []);

  const [transitioning, setTransitioning] =
    useState(false);

  const [learners, setLearners] =
    useState([]);

  /*
   * Learners saved in this session stay pinned to the top of the enrolled list
   * so the teacher can see what they just added. The pin clears on a manual
   * refresh or when Conduct Assessment is left and entered again.
   */
  const [recentlyAddedLearnerIds, setRecentlyAddedLearnerIds] =
    useState([]);

  /*
   * Leaving Conduct Assessment drops the pin, so re-entering shows the normal
   * sorted list again.
   */
  const previousTabRef = useRef(activeTab);

  useEffect(() => {
    if (previousTabRef.current === "conduct" && activeTab !== "conduct") {
      setRecentlyAddedLearnerIds([]);
    }
    previousTabRef.current = activeTab;
  }, [activeTab]);

  const [assessments, setAssessments] =
    useState([]);

  const [selectedLearnerIds, setSelectedLearnerIds] =
    useState([]);

  const [deletingProgress, setDeletingProgress] =
    useState(null);

  const [sidebarOpen, setSidebarOpen] =
    useState(true);

  const [darkMode, setDarkMode] = useState(false);

  const [loadingData, setLoadingData] =
    useState(false);

  const [learnersLoaded, setLearnersLoaded] =
    useState(false);

  const [toast, setToast] =
    useState(null);

  const [
    exportingExcel,
    setExportingExcel,
  ] = useState(false);

  const [
    startingAssessment,
    setStartingAssessment,
  ] = useState("");

  const [logoutOpen, setLogoutOpen] =
    useState(false);

  const [loggingOut, setLoggingOut] =
    useState(false);

  const [
    addLearnerOpen,
    setAddLearnerOpen,
  ] = useState(false);

  const [
    learnerForm,
    setLearnerForm,
  ] = useState({
    lrn: "",
    lastName: "",
    firstName: "",
    middleName: "",
    sex: "Male",
  });

  const [learnerRows, setLearnerRows] = useState([
    { id: 1, lrn: "", lastName: "", firstName: "", middleName: "", suffix: "", sex: "Male" },
  ]);

  const existingLearnerLrns = useMemo(
    () =>
      new Set(
        learners
          .map((learner) =>
            String(learner?.lrn ?? learner?.LRN ?? "").replace(/\D/g, "")
          )
          .filter(Boolean)
      ),
    [learners]
  );

  const learnerRowLrnCounts = useMemo(() => {
    const counts = new Map();
    learnerRows.forEach((row) => {
      const lrn = String(row?.lrn ?? "").replace(/\D/g, "");
      if (lrn) counts.set(lrn, (counts.get(lrn) || 0) + 1);
    });
    return counts;
  }, [learnerRows]);

  const duplicateLearnerRowIds = useMemo(
    () =>
      new Set(
        learnerRows
          .filter((row) => {
            const lrn = String(row?.lrn ?? "").replace(/\D/g, "");
            return (
              lrn.length === 12 &&
              (existingLearnerLrns.has(lrn) ||
                Number(learnerRowLrnCounts.get(lrn) || 0) > 1)
            );
          })
          .map((row) => row.id)
      ),
    [existingLearnerLrns, learnerRowLrnCounts, learnerRows]
  );

  const [
    savingLearner,
    setSavingLearner,
  ] = useState(false);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    sexFilter,
    setSexFilter,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("");

  const [
    sortMode,
    setSortMode,
  ] = useState("name_asc");

  const [
    deleteTarget,
    setDeleteTarget,
  ] = useState(null);

  const [
    bulkDeleteConfirm,
    setBulkDeleteConfirm,
  ] = useState(false);

  const [
    detailsTarget,
    setDetailsTarget,
  ] = useState(null);

  const [
    currentPeriod,
    setCurrentPeriod,
  ] = useState("BoSY");

  const [
    recordsView,
    setRecordsView,
  ] = useState("scoresheet");

  const [scoresheetZoom, setScoresheetZoom] = useState(1);
  const [scoresheetMode, setScoresheetMode] = useState("view");
  const [scoresheetDrafts, setScoresheetDrafts] = useState({});
  const [savingScoresheet, setSavingScoresheet] = useState(false);
  const [scoresheetSavePromptOpen, setScoresheetSavePromptOpen] =
    useState(false);
  const pendingScoresheetNavigationRef = useRef(null);
  const scoresheetDirty = Object.keys(scoresheetDrafts).length > 0;

  const [
    activityPeriod,
    setActivityPeriod,
  ] = useState("BoSY");

  const [
    activityTab,
    setActivityTab,
  ] = useState("letters");

  const [
    activities,
    setActivities,
  ] = useState(
    () => cloneAssessmentContent(DEFAULT_CONTENT)
  );

  const savedActivitiesRef = useRef(
    cloneAssessmentContent(DEFAULT_CONTENT)
  );

  const [
    contentModes,
    setContentModes,
  ] = useState(() => defaultContentModes());

  const savedContentModesRef = useRef(defaultContentModes());

  const [
    contentDefaults,
    setContentDefaults,
  ] = useState(() => defaultContentDefaults());

  const savedContentDefaultsRef = useRef(defaultContentDefaults());

  const [
    storyImport,
    setStoryImport,
  ] = useState(null);

  const [
    storyImportDragActive,
    setStoryImportDragActive,
  ] = useState(false);

  const storyImportInputRef = useRef(null);

  const activityDirtyRef = useRef({});

  const [
    activityDirtyPeriods,
    setActivityDirtyPeriods,
  ] = useState({});

  const [
    savingActivities,
    setSavingActivities,
  ] = useState(false);

  const [
    activityEditor,
    setActivityEditor,
  ] = useState(null);

  const [
    activityDeleteTarget,
    setActivityDeleteTarget,
  ] = useState(null);

  const storyWordRefs = useRef([]);

  const pendingActivityNavigationRef = useRef(null);

  const [
    activitySavePromptOpen,
    setActivitySavePromptOpen,
  ] = useState(false);

  const [
    activityValidation,
    setActivityValidation,
  ] = useState(null);

  const [
    profileEditOpen,
    setProfileEditOpen,
  ] = useState(false);

  const [
    securityOpen,
    setSecurityOpen,
  ] = useState(false);

  const securityDropdownContentRef = useRef(null);

  const [
    profileForm,
    setProfileForm,
  ] = useState({
    fullName: "",
    section: "",
    schoolId: "",
    schoolName: "",
  });

  const [securityStatus, setSecurityStatus] = useState({
    email: "",
    email_verified: false,
    two_factor_enabled: false,
  });

  const [securityEmail, setSecurityEmail] = useState("");
  const [securityLoading, setSecurityLoading] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [twoFactorSetupOpen, setTwoFactorSetupOpen] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  const [
    activeHostSession,
    setActiveHostSession,
  ] = useState(null);

  const [
    analyticsPeriod,
    setAnalyticsPeriod,
  ] = useState("BoSY");

  const [analyticsLearnerId, setAnalyticsLearnerId] = useState("");
  const [analyticsLearnerSearch, setAnalyticsLearnerSearch] = useState("");
  const [analyticsLearnerSort, setAnalyticsLearnerSort] = useState("name-asc");
  const [analyticsDetailsById, setAnalyticsDetailsById] = useState({});
  const [analyticsDetailLoading, setAnalyticsDetailLoading] = useState(false);
  const [analyticsDetailError, setAnalyticsDetailError] = useState("");
  const [analyticsChartMode, setAnalyticsChartMode] = useState("percent");
  const [analyticsChartFocus, setAnalyticsChartFocus] = useState(null);
  const [analyticsChartOverlayPeriod, setAnalyticsChartOverlayPeriod] = useState(null);
  const [analyticsComparisonSelection, setAnalyticsComparisonSelection] = useState("all");
  const [analyticsMobileView, setAnalyticsMobileView] = useState(false);
  const [analyticsMobileResultOpen, setAnalyticsMobileResultOpen] = useState(false);

  const showToast = useCallback(
    (message, type = "success") => {
      setToast({
        message,
        type,
      });

      window.setTimeout(
        () => {
          setToast(null);
        },
        3200
      );
    },
    []
  );

  const api = useCallback(
    async (
      action,
      {
        method = "GET",
        body = undefined,
        query = undefined,
      } = {}
    ) => {
      const search = new URLSearchParams({ action });
      Object.entries(query || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          search.set(key, String(value));
        }
      });
      const url = `/api/assessment?${search.toString()}`;

      const response =
        await fetch(url, {
          method,
          credentials:
            "include",
          cache: "no-store",
          headers: {
            Accept:
              "application/json",
            ...(method !== "GET"
              ? {
                  "Content-Type":
                    "application/json",
                }
              : {}),
          },
          body:
            method !== "GET"
              ? JSON.stringify({
                  action,
                  ...(body || {}),
                })
              : undefined,
        });

      const contentType =
        response.headers.get(
          "content-type"
        ) || "";

      let data;

      if (
        contentType.includes(
          "application/json"
        )
      ) {
        data =
          await response.json();
      } else {
        const text =
          await response.text();

        throw new Error(
          text ||
            "The server returned an invalid response."
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Request failed with status ${response.status}.`
        );
      }

      return data;
    },
    []
  );

  const verifySession =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              "/api/auth?action=verify",
              {
                credentials:
                  "include",
                cache:
                  "no-store",
                headers: {
                  Accept:
                    "application/json",
                },
              }
            );

          if (
            !response.ok
          ) {
            router.replace(
              "/login"
            );
            return;
          }

          const data =
            await response.json();

          if (
            !data.valid ||
            !data.user
          ) {
            router.replace(
              "/login"
            );
            return;
          }

          if (
            data.user.role !==
              "teacher" &&
            data.user.role !==
              "admin"
          ) {
            router.replace(
              "/login"
            );
            return;
          }

          setUser(
            data.user
          );

          setProfileForm({
            fullName:
              data.user
                .full_name ||
              "",
            section:
              data.user.section ||
              "",
            schoolId:
              data.user.school_id ||
              "",
            schoolName:
              data.user.school_name ||
              "",
          });

          setSecurityEmail(data.user.email || "");
          setSecurityStatus({
            email: data.user.email || "",
            email_verified: Boolean(data.user.email_verified),
            two_factor_enabled: Boolean(data.user.two_factor_enabled),
          });
        } catch {
          router.replace(
            "/login"
          );
        } finally {
          setLoading(false);
        }
      },
      [router]
    );

  const setActivityPeriodDirty = useCallback((period, dirty) => {
    const next = { ...activityDirtyRef.current };
    if (dirty) {
      next[period] = true;
    } else {
      delete next[period];
    }
    activityDirtyRef.current = next;
    setActivityDirtyPeriods(next);
  }, []);

  const applyRemoteActivities = useCallback((incoming) => {
    const remote = cloneAssessmentContent(incoming || DEFAULT_CONTENT);
    const dirty = activityDirtyRef.current;

    savedActivitiesRef.current = remote;

    setActivities((current) =>
      PERIODS.reduce(
        (next, period) => ({
          ...next,
          [period]: dirty[period]
            ? current[period]
            : remote[period],
        }),
        {}
      )
    );
  }, []);

  const applyRemoteContentModes = useCallback((incoming) => {
    if (!incoming || typeof incoming !== "object") return;
    const remote = normalizeContentModes(incoming);
    const dirty = activityDirtyRef.current;

    savedContentModesRef.current = remote;
    setContentModes((current) =>
      PERIODS.reduce(
        (next, period) => ({
          ...next,
          [period]: dirty[period] ? current[period] : remote[period],
        }),
        {}
      )
    );
  }, []);

  const applyRemoteContentDefaults = useCallback((incoming) => {
    if (!incoming || typeof incoming !== "object") return;
    const remote = normalizeContentDefaults(incoming);
    const dirty = activityDirtyRef.current;

    savedContentDefaultsRef.current = remote;
    setContentDefaults((current) =>
      PERIODS.reduce(
        (next, period) => ({
          ...next,
          [period]: dirty[period] ? current[period] : remote[period],
        }),
        {}
      )
    );
  }, []);

  const loadData =
    useCallback(
      async (
        silent = false
      ) => {
        if (!silent) {
          setLoadingData(
            true
          );
          /* A manual refresh drops the newly-added pin. */
          setRecentlyAddedLearnerIds([]);
        }

        try {
          const [
            learnersData,
            assessmentsData,
            activitiesData,
          ] =
            await Promise.all([
              api(
                "get_learners"
              ),
              api(
                "get_assessments"
              ),
              api(
                "get_activities"
              ),
            ]);

          const learnerPayload =
            Array.isArray(
              learnersData?.learners
            )
              ? learnersData.learners
              : [];

          const assessmentPayload =
            Array.isArray(
              assessmentsData?.assessments
            )
              ? assessmentsData.assessments
              : [];

          setLearners(
            learnerPayload.filter(Boolean).map(
              (learner) => ({
                ...learner,
                id:
                  learner.id ??
                  learner.learner_id ??
                  learner.learnerId ??
                  null,
                lrn:
                  learner.lrn ??
                  learner.LRN ??
                  "",
              })
            )
          );

          setAssessments(
            assessmentPayload.filter(Boolean)
          );

          if (activitiesData?.activities) {
            applyRemoteActivities(
              activitiesData.activities
            );
          }

          applyRemoteContentModes(
            activitiesData?.contentMode
          );

          applyRemoteContentDefaults(
            activitiesData?.contentDefaults
          );

        } catch (error) {
          showToast(
            error.message ||
              "Unable to load dashboard data.",
            "error"
          );
        } finally {
          setLearnersLoaded(
            true
          );

          if (!silent) {
            setLoadingData(
              false
            );
          }
        }
      },
      [api, applyRemoteActivities, applyRemoteContentModes, applyRemoteContentDefaults, showToast]
    );

  useEffect(() => {
    const refreshAfterOfflineSync = () => {
      void loadData(true);
    };

    window.addEventListener(
      "crl-teacher-data-updated",
      refreshAfterOfflineSync
    );

    return () => {
      window.removeEventListener(
        "crl-teacher-data-updated",
        refreshAfterOfflineSync
      );
    };
  }, [loadData]);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  /*
   * Older builds kept unsaved Manage Assessment drafts in localStorage. That
   * made a deleted item disappear after the app was closed even though Save
   * was never pressed. Remove that legacy draft once and keep all new edits in
   * memory only; the database and offline outbox are touched solely by Save.
   */
  useEffect(() => {
    const userId = Number(user?.id || 0);
    if (!userId) return;
    try {
      localStorage.removeItem(`crla_assessment_draft_v1:${userId}`);
    } catch {
      /* Storage may be unavailable in private mode; no draft is written. */
    }
  }, [user?.id]);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("crla_theme");
      const initialDark = savedTheme === "dark";
      setDarkMode(initialDark);
      document.documentElement.setAttribute(
        "data-crl-theme",
        initialDark ? "dark" : "light"
      );
      document.body.style.colorScheme = initialDark ? "dark" : "light";
    } catch {
      document.documentElement.setAttribute("data-crl-theme", "light");
    }
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((current) => {
      const next = !current;
      try {
        localStorage.setItem("crla_theme", next ? "dark" : "light");
      } catch {
        /* Browser storage may be unavailable. */
      }
      document.documentElement.setAttribute(
        "data-crl-theme",
        next ? "dark" : "light"
      );
      document.body.style.colorScheme = next ? "dark" : "light";
      return next;
    });
  }, []);


  useEffect(() => {
    if (!loading) {
      loadData();
    }
  }, [
    loading,
    loadData,
  ]);

  useEffect(() => {
    if (loading) {
      return undefined;
    }

    const interval =
      window.setInterval(
        () => {
          loadData(true);
        },
        4000
      );

    return () =>
      window.clearInterval(
        interval
      );
  }, [
    loading,
    loadData,
  ]);

  const saveActivities = useCallback(
    async (period) => {
      const normalized = normalizeAssessmentPeriodContent(
        activities[period]
      );
      const issues = getAssessmentContentIssues(normalized);

      if (issues.length) {
        setActivityValidation({ period, issues });
        return false;
      }

      setSavingActivities(true);
      try {
        const result = await api(
          "save_activities",
          {
            method: "POST",
            body: {
              period,
              content: normalized,
            },
          }
        );

        const selectedModes = normalizeAssessmentContentModes(
          contentModes[period]
        );
        const selectedDefaults = normalizeAssessmentContentDefaults(
          contentDefaults[period]
        );
        const selectionResult = await api("save_content_mode", {
          method: "POST",
          body: {
            period,
            modes: selectedModes,
            defaults: selectedDefaults,
          },
        });

        const savedPeriod = normalizeAssessmentPeriodContent(
          result?.activities?.[period] || normalized
        );
        const savedModes = normalizeAssessmentContentModes(
          selectionResult?.modes || selectedModes
        );
        const savedDefaults = normalizeAssessmentContentDefaults(
          selectionResult?.defaults || selectedDefaults
        );
        savedActivitiesRef.current = {
          ...savedActivitiesRef.current,
          [period]: savedPeriod,
        };
        savedContentModesRef.current = {
          ...savedContentModesRef.current,
          [period]: savedModes,
        };
        savedContentDefaultsRef.current = {
          ...savedContentDefaultsRef.current,
          [period]: savedDefaults,
        };
        setActivities((current) => ({
          ...current,
          [period]: savedPeriod,
        }));
        setContentModes((current) => ({
          ...current,
          [period]: savedModes,
        }));
        setContentDefaults((current) => ({
          ...current,
          [period]: savedDefaults,
        }));
        setActivityPeriodDirty(period, false);
        setActivityValidation(null);
        return true;
      } catch (error) {
        showToast(
          error?.message ||
            "Unable to save assessment content.",
          "error"
        );
        return false;
      } finally {
        setSavingActivities(false);
      }
    },
    [
      activities,
      api,
      contentDefaults,
      contentModes,
      setActivityPeriodDirty,
      showToast,
    ]
  );

  /*
   * Ticking an item makes it part of the fixed default set. Only as many as an
   * assessment uses may be ticked, so an over-limit tick is refused rather than
   * quietly dropping another choice.
   */
  const toggleContentDefault = useCallback(
    (period, category, item) => {
      const limit = ASSESSMENT_CONTENT_REQUIREMENTS[category];
      const key = contentDefaultKey(category, item);
      if (!key) return;

      const current = normalizeAssessmentContentDefaults(
        contentDefaults[period]
      );
      const selected = current[category];
      const isSelected = selected.includes(key);

      if (!isSelected && selected.length >= limit) {
        showToast(
          `An assessment uses ${limit} ${contentDefaultLabel(category)}. Untick one first.`,
          "error"
        );
        return;
      }

      const nextSelected = isSelected
        ? selected.filter((value) => value !== key)
        : [...selected, key];

      setContentDefaults((allDefaults) => ({
        ...allDefaults,
        [period]: {
          ...current,
          [category]: nextSelected,
        },
      }));
      setActivityPeriodDirty(period, true);
    },
    [contentDefaults, setActivityPeriodDirty, showToast]
  );

  useEffect(() => {
    if (!Object.keys(activityDirtyPeriods).length && !scoresheetDirty) {
      return undefined;
    }
    const confirmBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = "Save changes?";
      return "Save changes?";
    };

    window.addEventListener("beforeunload", confirmBeforeLeaving);
    return () =>
      window.removeEventListener("beforeunload", confirmBeforeLeaving);
  }, [activityDirtyPeriods, scoresheetDirty]);

  const dashboardRows =
    useMemo(() => {
      const safeLearners = Array.isArray(learners)
        ? learners.filter(Boolean)
        : [];

      const safeAssessments = Array.isArray(
        assessments
      )
        ? assessments.filter(Boolean)
        : [];

      return safeLearners.map(
        (learner) => {
          const learnerAssessments =
            safeAssessments.filter(
              (item) =>
                Number(
                  item?.learner_id
                ) ===
                Number(
                  learner?.id
                )
            );

          const hasBosy =
            learnerAssessments.some(
              (item) =>
                item
                  .assessment_period ===
                  "BoSY" &&
                item.is_completed
            );

          const hasMosy =
            learnerAssessments.some(
              (item) =>
                item
                  .assessment_period ===
                  "MoSY" &&
                item.is_completed
            );

          const hasEosy =
            learnerAssessments.some(
              (item) =>
                item
                  .assessment_period ===
                  "EoSY" &&
                item.is_completed
            );

          const completed =
            learnerAssessments
              .filter(
                (item) =>
                  item.is_completed
              )
              .sort(
                (a, b) =>
                  new Date(
                    b.date_administered
                  ) -
                  new Date(
                    a.date_administered
                  )
              );

          const latest =
            completed[0];

          const profile =
            latest
              ? getRecordProfile(
                  latest
                )
              : "Not Assessed";

          return {
            learner,
            hasBosy,
            hasMosy,
            hasEosy,
            profile,
          };
        }
      );
    }, [
      learners,
      assessments,
    ]);

  const stats =
    useMemo(() => {
      const gradeReady =
        dashboardRows.filter(
          (item) =>
            normalizeReadingProfile(
              item.profile
            ) ===
            "Reading At Grade Level"
        ).length;

      const intervention =
        dashboardRows.filter(
          (item) =>
            item.profile !==
              "Not Assessed" &&
            normalizeReadingProfile(
              item.profile
            ) !==
              "Reading At Grade Level"
        ).length;

      return {
        total:
          learners.length,
        bosy:
          dashboardRows.filter(
            (item) =>
              item.hasBosy
          ).length,
        mosy:
          dashboardRows.filter(
            (item) =>
              item.hasMosy
          ).length,
        eosy:
          dashboardRows.filter(
            (item) =>
              item.hasEosy
          ).length,
        gradeReady,
        intervention,
      };
    }, [
      dashboardRows,
      learners.length,
    ]);

  const filteredLearners =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      let rows =
        learners.filter(
          (learner) => {
            const name =
              `${learner.last_name} ${learner.first_name} ${learner.middle_name || ""}`.toLowerCase();

            const matchesSearch =
              !term ||
              name.includes(
                term
              ) ||
              String(
                learner.lrn
              )
                .toLowerCase()
                .includes(term);

            const matchesSex =
              !sexFilter ||
              learner.sex ===
                sexFilter;

            const status =
              statusForLearner(
                learner.id,
                assessments
              );

            const matchesStatus =
              !statusFilter ||
              status.key ===
                statusFilter;

            return (
              matchesSearch &&
              matchesSex &&
              matchesStatus
            );
          }
        );

      rows.sort(
        (a, b) => {
          if (
            sortMode ===
            "lrn"
          ) {
            return String(
              a.lrn
            ).localeCompare(
              String(
                b.lrn
              )
            );
          }

          const nameA =
            `${a.last_name}, ${a.first_name}`.toLowerCase();

          const nameB =
            `${b.last_name}, ${b.first_name}`.toLowerCase();

          return sortMode ===
            "name_desc"
            ? nameB.localeCompare(
                nameA
              )
            : nameA.localeCompare(
                nameB
              );
        }
      );

      /*
       * Newly added learners sit above the sorted list, in the order they were
       * entered, until the pin is cleared.
       */
      if (recentlyAddedLearnerIds.length) {
        const pinned = new Map(
          recentlyAddedLearnerIds.map((id, index) => [String(id), index])
        );
        const pinnedRows = rows.filter((row) => pinned.has(String(row.id)));
        const restRows = rows.filter((row) => !pinned.has(String(row.id)));
        pinnedRows.sort(
          (a, b) => pinned.get(String(a.id)) - pinned.get(String(b.id))
        );
        rows = [...pinnedRows, ...restRows];
      }

      return rows;
    }, [
      learners,
      assessments,
      search,
      sexFilter,
      statusFilter,
      sortMode,
      recentlyAddedLearnerIds,
    ]);

  const currentRecords =
    useMemo(() => {
      const period =
        currentPeriod;

      return (Array.isArray(assessments)
        ? assessments
        : [])
        .filter(
          (item) =>
            item.assessment_period ===
            period
        )
        .map(
          (assessment) => {
            const learner =
              learners.find(
                (item) =>
                  Number(
                    item.id
                  ) ===
                  Number(
                    assessment.learner_id
                  )
              );

            return {
              assessment,
              learner,
            };
          }
        )
        .filter(
          (item) =>
            item.learner
        );
    }, [
      currentPeriod,
      assessments,
      learners,
    ]);

  const scoresheetValue = useCallback(
    (assessment, field) => {
      const draft = scoresheetDrafts[String(assessment.id)] || {};
      return Object.prototype.hasOwnProperty.call(draft, field)
        ? draft[field]
        : assessment[field];
    },
    [scoresheetDrafts]
  );

  const updateScoresheetDraft = useCallback((assessment, field, value) => {
    const id = String(assessment.id);
    setScoresheetDrafts((current) => {
      const nextRecord = { ...(current[id] || {}), [field]: value };

      if (field === "total_miscues") {
        const miscues = Math.min(100, Math.max(0, Number(value) || 0));
        nextRecord.words_read = 100 - miscues;
      } else if (field === "words_read") {
        const wordsRead = Math.min(100, Math.max(0, Number(value) || 0));
        nextRecord.total_miscues = 100 - wordsRead;
      }

      return { ...current, [id]: nextRecord };
    });
  }, []);

  const finishPendingScoresheetNavigation = useCallback(() => {
    const callback = pendingScoresheetNavigationRef.current;
    pendingScoresheetNavigationRef.current = null;
    setScoresheetSavePromptOpen(false);
    if (typeof callback === "function") callback();
  }, []);

  const requestScoresheetNavigation = useCallback((callback) => {
    pendingScoresheetNavigationRef.current = callback;
    setScoresheetSavePromptOpen(true);
  }, []);

  const discardScoresheetChanges = useCallback(() => {
    setScoresheetDrafts({});
    setScoresheetMode("view");
    finishPendingScoresheetNavigation();
  }, [finishPendingScoresheetNavigation]);

  const saveScoresheetChanges = useCallback(async () => {
    const records = Object.entries(scoresheetDrafts).map(([id, changes]) => ({
      id: Number(id),
      ...changes,
    }));

    if (!records.length) {
      setScoresheetMode("view");
      finishPendingScoresheetNavigation();
      return true;
    }

    setSavingScoresheet(true);
    try {
      const result = await api("save_assessment_records", {
        method: "POST",
        body: { records },
      });
      const savedRecords = Array.isArray(result?.assessments)
        ? result.assessments
        : [];
      if (savedRecords.length) {
        const byId = new Map(
          savedRecords.map((assessment) => [Number(assessment.id), assessment])
        );
        setAssessments((current) =>
          current.map((assessment) =>
            byId.has(Number(assessment.id))
              ? { ...assessment, ...byId.get(Number(assessment.id)) }
              : assessment
          )
        );
      }
      setScoresheetDrafts({});
      setScoresheetMode("view");
      finishPendingScoresheetNavigation();
      showToast("Scoresheet changes saved.");
      return true;
    } catch (error) {
      showToast(error?.message || "Unable to save scoresheet changes.", "error");
      return false;
    } finally {
      setSavingScoresheet(false);
    }
  }, [
    api,
    finishPendingScoresheetNavigation,
    scoresheetDrafts,
    showToast,
  ]);

  /*
   * The scoresheet shows the same header block as the exported workbook: who
   * and what was assessed, the class it covers, and what each Part measures.
   * The counts come from the same helpers the Class Summary uses, so the two
   * views can never disagree.
   */
  const scoresheetHeader = useMemo(() => {
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
  }, [currentRecords, learners]);

  /*
   * The two on-screen Class Summary tables use the same population and metric
   * rules as the exported workbook. In particular, Part 1 and profile cells in
   * the upper table are counts, while its passage averages ignore learners who
   * did not reach Part 2 instead of treating their blank cells as zero.
   */
  const classSummaryRows = useMemo(() => {
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
  }, [currentRecords, learners]);

  const analyticsRows = useMemo(
    () =>
      (Array.isArray(assessments) ? assessments : []).map((assessment) => {
        const learner = learners.find(
          (item) => Number(item.id) === Number(assessment.learner_id)
        ) || null;
        return buildAnalyticsRow(assessment, learner);
      }),
    [assessments, learners]
  );

  const analyticsAssessedRows = useMemo(
    () => analyticsRows.filter((row) => row.isCompleted),
    [analyticsRows]
  );

  const analyticsPeriodComparison = useMemo(
    () => PERIODS.map((period) => {
      const periodRows = analyticsAssessedRows.filter(
        (row) => row.assessment?.assessment_period === period
      );
      return {
        period,
        total: periodRows.length,
        profiles: READING_PROFILE_LABELS.map((label) => {
          const count = periodRows.filter((row) => row.profile === label).length;
          return {
            label,
            count,
            percent: periodRows.length ? Math.round((count / periodRows.length) * 100) : 0,
          };
        }),
      };
    }),
    [analyticsAssessedRows]
  );

  const analyticsLearnerOptions = useMemo(() => {
    const learnerIds = new Set(
      analyticsAssessedRows.map((row) => Number(row.assessment?.learner_id))
    );
    return learners
      .filter((learner) => learnerIds.has(Number(learner.id)))
      .slice()
      .sort((left, right) => formatName(left).localeCompare(formatName(right)));
  }, [analyticsAssessedRows, learners]);

  const analyticsVisibleLearners = useMemo(() => {
    const query = analyticsLearnerSearch.trim().toLowerCase();
    const latestAssessmentTime = (learnerId) =>
      analyticsAssessedRows.reduce((latest, row) => {
        if (Number(row.assessment?.learner_id) !== Number(learnerId)) return latest;
        return Math.max(latest, new Date(row.assessment?.assessment_date || 0).getTime() || 0);
      }, 0);
    const rows = analyticsLearnerOptions.filter((learner) => {
      if (!query) return true;
      return [formatName(learner), learner?.lrn, learner?.sex]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });

    return rows.sort((left, right) => {
      if (analyticsLearnerSort === "recent") {
        return latestAssessmentTime(right.id) - latestAssessmentTime(left.id);
      }
      const comparison = formatName(left).localeCompare(formatName(right));
      return analyticsLearnerSort === "name-desc" ? -comparison : comparison;
    });
  }, [analyticsAssessedRows, analyticsLearnerOptions, analyticsLearnerSearch, analyticsLearnerSort]);

  const analyticsSelectedAssessment = useMemo(() => {
    const matching = analyticsAssessedRows
      .filter((row) =>
        Number(row.assessment?.learner_id) === Number(analyticsLearnerId) &&
        row.assessment?.assessment_period === analyticsPeriod
      )
      .map((row) => row.assessment)
      .sort((left, right) => new Date(right.assessment_date || 0) - new Date(left.assessment_date || 0));
    return matching[0] || null;
  }, [analyticsAssessedRows, analyticsLearnerId, analyticsPeriod]);

  const analyticsSelectedAssessmentId = analyticsSelectedAssessment?.id || null;
  const analyticsSelectedLearner = analyticsLearnerOptions.find(
    (learner) => String(learner.id) === String(analyticsLearnerId)
  ) || null;
  const analyticsSelectedPeriods = PERIODS.filter((period) =>
    analyticsAssessedRows.some((row) =>
      Number(row.assessment?.learner_id) === Number(analyticsLearnerId) &&
      row.assessment?.assessment_period === period
    )
  );
  const analyticsDetail = analyticsSelectedAssessmentId
    ? analyticsDetailsById[String(analyticsSelectedAssessmentId)] ||
      analyticsSelectedAssessment?.analytics_detail ||
      null
    : null;

  const selectAnalyticsLearner = useCallback((learnerId) => {
    const normalizedId = String(learnerId || "");
    setAnalyticsLearnerId(normalizedId);
    const available = PERIODS.filter((period) =>
      analyticsAssessedRows.some((row) =>
        Number(row.assessment?.learner_id) === Number(normalizedId) &&
        row.assessment?.assessment_period === period
      )
    );
    if (available.length) {
      setAnalyticsPeriod((current) =>
        available.includes(current) ? current : available[available.length - 1]
      );
    }
  }, [analyticsAssessedRows]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const syncMobileView = (event) => {
      const matches = event?.matches ?? media.matches;
      setAnalyticsMobileView(matches);
      if (!matches) {
        setAnalyticsMobileResultOpen(false);
        setAnalyticsChartOverlayPeriod(null);
      }
    };

    syncMobileView();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncMobileView);
      return () => media.removeEventListener("change", syncMobileView);
    }

    media.addListener(syncMobileView);
    return () => media.removeListener(syncMobileView);
  }, []);

  useEffect(() => {
    if (activeTab !== "analytics") {
      setAnalyticsMobileResultOpen(false);
      setAnalyticsChartOverlayPeriod(null);
    }
  }, [activeTab]);

  useLayoutEffect(() => {
    const overlayOpen = analyticsMobileResultOpen || Boolean(analyticsChartOverlayPeriod);
    if (!overlayOpen && !startingAssessment) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const previousBodyStyles = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    const previousHtmlOverflow = html.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      if (analyticsChartOverlayPeriod) setAnalyticsChartOverlayPeriod(null);
      else if (analyticsMobileResultOpen) setAnalyticsMobileResultOpen(false);
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.right = "0";
    body.style.width = "100%";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      html.style.overflow = previousHtmlOverflow;
      Object.assign(body.style, previousBodyStyles);
      window.scrollTo(scrollX, scrollY);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [analyticsChartOverlayPeriod, analyticsMobileResultOpen, startingAssessment]);

  useEffect(() => {
    if (!analyticsLearnerOptions.length) {
      setAnalyticsLearnerId("");
      return;
    }
    if (!analyticsLearnerOptions.some((learner) => String(learner.id) === String(analyticsLearnerId))) {
      selectAnalyticsLearner(analyticsLearnerOptions[0].id);
    }
  }, [analyticsLearnerId, analyticsLearnerOptions, selectAnalyticsLearner]);

  useEffect(() => {
    if (!analyticsLearnerId) return;
    const available = PERIODS.filter((period) =>
      analyticsAssessedRows.some((row) =>
        Number(row.assessment?.learner_id) === Number(analyticsLearnerId) &&
        row.assessment?.assessment_period === period
      )
    );
    if (available.length && !available.includes(analyticsPeriod)) {
      setAnalyticsPeriod(available[available.length - 1]);
    }
  }, [analyticsAssessedRows, analyticsLearnerId, analyticsPeriod]);

  useEffect(() => {
    let cancelled = false;
    if (activeTab !== "analytics" || !analyticsSelectedAssessmentId) {
      setAnalyticsDetailLoading(false);
      setAnalyticsDetailError("");
      return undefined;
    }

    if (analyticsDetail) {
      setAnalyticsDetailLoading(false);
      setAnalyticsDetailError("");
      return undefined;
    }

    setAnalyticsDetailLoading(true);
    setAnalyticsDetailError("");
    api("get_assessment_detail", {
      query: { assessment_id: analyticsSelectedAssessmentId },
    })
      .then((data) => {
        if (cancelled) return;
        const detail = data?.assessment || data;
        setAnalyticsDetailsById((current) => ({
          ...current,
          [String(analyticsSelectedAssessmentId)]: detail,
        }));
        setAnalyticsDetailLoading(false);
      })
      .catch((error) => {
        if (!cancelled) {
          setAnalyticsDetailError(error?.message || "Unable to load this result.");
          setAnalyticsDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, analyticsDetail, analyticsSelectedAssessmentId, api]);

  const exportAssessmentRecord =
    useCallback(
      async (
        period = currentPeriod
      ) => {
        if (exportingExcel) {
          return;
        }

        setExportingExcel(true);

        showToast(
          `Preparing ${period} Excel assessment record...`
        );

        try {
          let blob;
          try {
            const response = await fetch(
              `/api/reports/excel?period=${encodeURIComponent(
                period
              )}&mode=${encodeURIComponent(
                recordsView
              )}`,
              {
                method:
                  "GET",
                credentials:
                  "include",
                cache:
                  "no-store",
                headers: {
                  Accept:
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                },
              }
            );

            if (!response.ok) {
              let message = "Unable to generate the Excel assessment record.";

              try {
                const data = await response.json();

                message = data?.error || message;
              } catch {
                // Keep fallback.
              }

              throw new Error(message);
            }

            blob = await response.blob();
          } catch (requestError) {
            const networkFailure =
              typeof navigator !== "undefined" && navigator.onLine === false ||
              requestError instanceof TypeError ||
              /offline|failed to fetch|network/i.test(String(requestError?.message || ""));

            if (!networkFailure) throw requestError;

            const { buildOfflineAssessmentWorkbook } = await import(
              "../../lib/offlineExcelExport"
            );
            blob = await buildOfflineAssessmentWorkbook({
              teacher: user,
              learners,
              assessments,
              period,
            });
          }

          const url =
            window.URL.createObjectURL(
              blob
            );

          const link =
            document.createElement(
              "a"
            );

          link.href = url;

          link.download =
            `CRLA3_Grade3_${period}_Assessment_Records.xlsx`;

          document.body.appendChild(
            link
          );

          link.click();

          link.remove();

          window.setTimeout(
            () =>
              window.URL.revokeObjectURL(
                url
              ),
            1000
          );

          showToast(
            `${period} Excel assessment record generated successfully.`
          );
        } catch (error) {
          console.error(
            "Excel export failed:",
            error
          );

          showToast(
            error?.message ||
              "Unable to generate the Excel assessment record.",
            "error"
          );
        } finally {
          setExportingExcel(
            false
          );
        }
      },
      [
        currentPeriod,
        exportingExcel,
        recordsView,
        showToast,
        user,
        learners,
        assessments,
      ]
    );

  const startAssessment =
    async (
      learnerId,
      period
    ) => {
      const learnerAssessments =
        assessments.filter(
          (item) =>
            Number(
              item.learner_id
            ) ===
            Number(
              learnerId
            )
        );

      const normalizedPeriod =
        period;

      if (
        learnerAssessments.some(
          (item) =>
            item
              .assessment_period ===
              normalizedPeriod &&
            item.is_completed
        )
      ) {
        showToast(
          `${normalizedPeriod} is already completed for this learner.`,
          "error"
        );
        return;
      }

      if (
        normalizedPeriod ===
          "MoSY" &&
        !learnerAssessments.some(
          (item) =>
            item
              .assessment_period ===
              "BoSY" &&
            item.is_completed
        )
      ) {
        showToast(
          "Please complete BoSY before starting MoSY.",
          "error"
        );
        return;
      }

      if (
        normalizedPeriod ===
          "EoSY" &&
        !learnerAssessments.some(
          (item) =>
            item
              .assessment_period ===
              "BoSY" &&
            item.is_completed
        ) &&
        !learnerAssessments.some(
          (item) =>
            item
              .assessment_period ===
              "MoSY" &&
            item.is_completed
        )
      ) {
        showToast(
          "Please complete BoSY or MoSY before starting EoSY.",
          "error"
        );
        return;
      }

      const startKey =
        `${learnerId}-${normalizedPeriod}`;

      // Remain locked through navigation; errors below release the overlay.
      setStartingAssessment(
        startKey
      );

      try {
        const result =
          await api(
            "host_start",
            {
              method:
                "POST",
              body: {
                learner_id:
                  learnerId,
                period:
                  normalizedPeriod,
              },
            }
          );

        localStorage.setItem(
          "crla_host_session",
          JSON.stringify({
            learnerId:
              Number(
                learnerId
              ),
            period:
              normalizedPeriod,
            code:
              result.code,
          })
        );

        setActiveHostSession({
          learnerId:
            Number(
              learnerId
            ),
          period:
            normalizedPeriod,
          code:
            result.code,
        });

        const assessmentUrl =
          `/teacher/assessment?code=${encodeURIComponent(
            result.code
          )}&learner_id=${encodeURIComponent(
            learnerId
          )}&period=${encodeURIComponent(
            normalizedPeriod
          )}`;

        if (result?.offline) {
          /*
           * An offline Next.js client transition first requests an RSC payload.
           * That network-only request cannot be reconstructed from the cached
           * document and used to leave the teacher on the dashboard. A real
           * navigation lets the service worker serve its cached assessment
           * shell while preserving the code in window.location.search.
           */
          window.location.assign(assessmentUrl);
        } else {
          router.push(assessmentUrl);
        }
      } catch (error) {
        showToast(
          error.message ||
            "Unable to start assessment.",
          "error"
        );
        setStartingAssessment(
          ""
        );
      }
    };

  const blankLearnerRow = (id) => ({
    id,
    lrn: "",
    lastName: "",
    firstName: "",
    middleName: "",
    suffix: "",
    sex: "Male",
  });

  const updateLearnerRow = (rowId, field, value) => {
    setLearnerRows((current) =>
      current.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row
      )
    );
  };

  const addLearnerRow = () => {
    setLearnerRows((current) => [
      ...current,
      blankLearnerRow(
        current.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
      ),
    ]);
  };

  const removeLearnerRow = (rowId) => {
    setLearnerRows((current) => {
      if (current.length <= 1) return current;
      return current.filter((row) => row.id !== rowId);
    });
  };

  const resetLearnerRows = () => {
    setLearnerRows([blankLearnerRow(1)]);
  };

  const addLearners = async () => {
    /*
     * Learner names are stored in capitals so the enrolled list and every
     * exported record read the same way, whatever casing was typed.
     */
    const normalizedRows = learnerRows.map((row) => ({
      ...row,
      lrn: String(row.lrn ?? "").replace(/\D/g, "").trim(),
      lastName: String(row.lastName ?? "").trim().toUpperCase(),
      firstName: String(row.firstName ?? "").trim().toUpperCase(),
      middleName: String(row.middleName ?? "").trim().toUpperCase(),
      suffix: String(row.suffix ?? "").trim().toUpperCase(),
      sex: String(row.sex ?? "").trim(),
    }));

    const meaningfulRows = normalizedRows.filter((row) =>
      [row.lrn, row.lastName, row.firstName].some(Boolean)
    );

    if (!meaningfulRows.length) {
      showToast("Add at least one learner before saving.", "error");
      return;
    }

    if (duplicateLearnerRowIds.size) {
      showToast(
        "Fix the duplicate LRN warning before saving learners.",
        "error"
      );
      return;
    }

    const invalidRow = meaningfulRows.find((row) =>
      !row.lrn ||
      !row.lastName ||
      !row.firstName ||
      !row.sex ||
      !/^\d{12}$/.test(row.lrn)
    );

    if (invalidRow) {
      showToast(
        `Check learner ${meaningfulRows.indexOf(invalidRow) + 1}: LRN must contain exactly 12 digits and required name/sex fields must be complete.`,
        "error"
      );
      return;
    }

    const seen = new Set();
    for (const row of meaningfulRows) {
      if (seen.has(row.lrn)) {
        showToast(`Duplicate LRN ${row.lrn} appears in the list.`, "error");
        return;
      }
      seen.add(row.lrn);
    }

    setSavingLearner(true);
    const imported = [];
    let lastError = null;

    try {
      const worker = async (row) => {
        try {
          const result = await api("add_learner", {
            method: "POST",
            body: {
              lrn: row.lrn,
              last_name: row.lastName,
              first_name: row.firstName,
              middle_name: row.middleName || null,
              suffix: row.suffix || null,
              sex: row.sex,
              section: String(user?.section ?? "").trim(),
              grade_level: 3,
            },
          });
          if (!result?.learner?.id) {
            throw new Error("The server did not return the created learner.");
          }
          return result.learner;
        } catch (error) {
          lastError = error;
          return null;
        }
      };

      const queue = [...meaningfulRows];
      const concurrency = Math.min(5, queue.length);
      let completed = 0;
      const runners = Array.from({ length: concurrency }, async () => {
        while (queue.length) {
          const row = queue.shift();
          if (!row) return;
          const created = await worker(row);
          completed += 1;
          if (created) imported.push(created);
        }
      });
      await Promise.all(runners);

      if (imported.length) {
        setLearners((current) => [...current, ...imported]);
        /*
         * Rows are saved concurrently, so pin them in the order the teacher
         * typed them rather than the order the requests finished.
         */
        const rowOrder = new Map(
          meaningfulRows.map((row, index) => [String(row.lrn), index])
        );
        const pinned = [...imported]
          .sort(
            (a, b) =>
              (rowOrder.get(String(a.lrn)) ?? 0) -
              (rowOrder.get(String(b.lrn)) ?? 0)
          )
          .map((learner) => learner.id);
        setRecentlyAddedLearnerIds(pinned);
      }

      setLearnerRows([blankLearnerRow(1)]);
      setLearnerForm({
        lrn: "",
        lastName: "",
        firstName: "",
        middleName: "N/A",
        sex: "Male",
      });
      setAddLearnerOpen(false);

      if (lastError) {
        showToast(`${imported.length} learner(s) added; some rows could not be saved.`, "error");
      } else {
        showToast(`${imported.length} learner(s) added successfully.`);
      }
    } catch (error) {
      showToast(error?.message || "Unable to add learners.", "error");
    } finally {
      setSavingLearner(false);
    }
  };

  const deleteLearner =
    async () => {
      if (
        !deleteTarget
      ) {
        return;
      }

      const nestedLearner =
        deleteTarget.learner &&
        typeof deleteTarget.learner ===
          "object"
          ? deleteTarget.learner
          : {};

      /*
       * Resolve each value independently from both possible object shapes.
       * Some legacy rows contain a nested learner object while the actual
       * identity fields remain on deleteTarget itself.
       */
      const learnerId =
        Number(
          nestedLearner.id ??
            nestedLearner.learner_id ??
            nestedLearner.learnerId ??
            deleteTarget.id ??
            deleteTarget.learner_id ??
            deleteTarget.learnerId ??
            0
        );

      const learnerLrn =
        String(
          nestedLearner.lrn ??
            nestedLearner.LRN ??
            deleteTarget.lrn ??
            deleteTarget.LRN ??
            ""
        ).trim();

      const learnerName = {
        last_name:
          String(
            nestedLearner.last_name ??
              nestedLearner.lastName ??
              deleteTarget.last_name ??
              deleteTarget.lastName ??
              ""
          ).trim(),
        first_name:
          String(
            nestedLearner.first_name ??
              nestedLearner.firstName ??
              deleteTarget.first_name ??
              deleteTarget.firstName ??
              ""
          ).trim(),
        middle_name:
          String(
            nestedLearner.middle_name ??
              nestedLearner.middleName ??
              deleteTarget.middle_name ??
              deleteTarget.middleName ??
              ""
          ).trim(),
      };

      const payload = {
        learner_id:
          Number.isInteger(
            learnerId
          ) &&
          learnerId > 0
            ? learnerId
            : null,
        learnerId:
          Number.isInteger(
            learnerId
          ) &&
          learnerId > 0
            ? learnerId
            : null,
        id:
          Number.isInteger(
            learnerId
          ) &&
          learnerId > 0
            ? learnerId
            : null,
        lrn:
          learnerLrn ||
          null,
        LRN:
          learnerLrn ||
          null,
        first_name:
          learnerName.first_name ||
          null,
        last_name:
          learnerName.last_name ||
          null,
        middle_name:
          learnerName.middle_name ||
          null,
        learner: {
          ...nestedLearner,
          id:
            Number.isInteger(
              learnerId
            ) &&
            learnerId > 0
              ? learnerId
              : null,
          learner_id:
            Number.isInteger(
              learnerId
            ) &&
            learnerId > 0
              ? learnerId
              : null,
          learnerId:
            Number.isInteger(
              learnerId
            ) &&
            learnerId > 0
              ? learnerId
              : null,
          lrn:
            learnerLrn ||
            null,
          LRN:
            learnerLrn ||
            null,
          first_name:
            learnerName.first_name ||
            null,
          last_name:
            learnerName.last_name ||
            null,
          middle_name:
            learnerName.middle_name ||
            null,
        },
      };

      if (
        process.env.NODE_ENV !==
        "production"
      ) {
        console.debug(
          "[CRL-App] delete_learner payload",
          {
            ...payload,
            deleteTarget,
          }
        );
      }

      setDeletingProgress({ total: 1, completed: 0, failed: 0 });

      try {
        const result =
          await api(
            "delete_learner",
            {
              method:
                "POST",
              body:
                payload,
            }
          );

        const deletedId =
          Number(
            result.deleted_learner_id ??
              learnerId ??
              0
          );

        const deletedLrn =
          String(
            result.deleted_lrn ??
              learnerLrn
          ).trim();

        setLearners(
          (current) =>
            current.filter(
              (item) => {
                const itemId =
                  Number(
                    item.id ??
                      item.learner_id ??
                      item.learnerId ??
                      0
                  );

                const itemLrn =
                  String(
                    item.lrn ??
                      item.LRN ??
                      ""
                  ).trim();

                return !(
                  (
                    deletedId > 0 &&
                    itemId ===
                      deletedId
                  ) ||
                  (
                    deletedLrn &&
                    itemLrn ===
                      deletedLrn
                  )
                );
              }
            )
        );

        setAssessments(
          (current) =>
            current.filter(
              (item) =>
                Number(
                  item.learner_id ??
                    item.learnerId ??
                    0
                ) !==
                deletedId
            )
        );

        setDeleteTarget(
          null
        );

        setDeletingProgress({
          total: 1,
          completed: 1,
          failed: 0,
        });

        window.setTimeout(() => {
          setDeletingProgress(null);
        }, 260);

        showToast(
          "Learner deleted successfully."
        );
      } catch (error) {
        setDeletingProgress(null);
        showToast(
          error?.message ||
            "Unable to delete learner.",
          "error"
        );
      }
    };

  const toggleLearnerSelection = (learnerId) => {
    const id = Number(learnerId);
    if (!Number.isInteger(id) || id <= 0) return;

    setSelectedLearnerIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const selectAllFilteredLearners = () => {
    const ids = filteredLearners
      .map((learner) => Number(learner.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    setSelectedLearnerIds(ids);
  };

  const clearLearnerSelection = () => {
    setSelectedLearnerIds([]);
  };

  const bulkDeleteLearners = async (skipConfirm = false) => {
    const ids = selectedLearnerIds
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);

    if (!ids.length) {
      showToast("Select at least one learner to delete.", "error");
      return;
    }

    if (!skipConfirm) {
      setBulkDeleteConfirm(true);
      return;
    }

    setDeletingProgress({ total: ids.length, completed: 0, failed: 0 });

    try {
      const result = await api("delete_learners", {
        method: "POST",
        body: { learner_ids: ids },
      });

      const deletedIds = Array.isArray(result?.deleted_learner_ids)
        ? result.deleted_learner_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)
        : [];
      const deletedCount = Number(result?.deleted_count ?? deletedIds.length);

      setDeletingProgress((current) =>
        current
          ? {
              ...current,
              completed: Math.min(ids.length, deletedCount),
              failed: Math.max(0, ids.length - deletedCount),
            }
          : current
      );

      if (deletedIds.length) {
        setLearners((current) => current.filter((item) => !deletedIds.includes(Number(item.id))));
        setAssessments((current) => current.filter((item) => !deletedIds.includes(Number(item.learner_id))));
        setSelectedLearnerIds((current) => current.filter((id) => !deletedIds.includes(Number(id))));
      }

      const failed = ids.length - deletedIds.length;
      setDeletingProgress(null);

      if (failed) {
        showToast(`${deletedIds.length} deleted. ${failed} learner${failed === 1 ? "" : "s"} could not be deleted.`, "error");
      } else {
        setSelectedLearnerIds([]);
        showToast(`${deletedIds.length} learner${deletedIds.length === 1 ? "" : "s"} deleted successfully.`);
      }
    } catch (error) {
      setDeletingProgress(null);
      showToast(error?.message || "Unable to delete the selected learners.", "error");
    }
  };

  const requestActivityNavigation = useCallback((callback) => {
    pendingActivityNavigationRef.current = callback;
    setActivitySavePromptOpen(true);
  }, []);

  const finishPendingActivityNavigation = () => {
    const callback = pendingActivityNavigationRef.current;
    pendingActivityNavigationRef.current = null;
    setActivitySavePromptOpen(false);
    if (typeof callback === "function") callback();
  };

  const saveAllActivityChanges = async () => {
    const dirtyPeriods = PERIODS.filter(
      (period) => activityDirtyRef.current[period]
    );

    for (const period of dirtyPeriods) {
      const saved = await saveActivities(period);
      if (!saved) {
        setActivitySavePromptOpen(false);
        return false;
      }
    }

    finishPendingActivityNavigation();
    showToast("Assessment content saved.");
    return true;
  };

  const discardAllActivityChanges = () => {
    const dirty = activityDirtyRef.current;
    setActivities((current) =>
      PERIODS.reduce(
        (next, period) => ({
          ...next,
          [period]: dirty[period]
            ? savedActivitiesRef.current[period]
            : current[period],
        }),
        {}
      )
    );
    setContentModes((current) =>
      PERIODS.reduce(
        (next, period) => ({
          ...next,
          [period]: dirty[period]
            ? savedContentModesRef.current[period]
            : current[period],
        }),
        {}
      )
    );
    setContentDefaults((current) =>
      PERIODS.reduce(
        (next, period) => ({
          ...next,
          [period]: dirty[period]
            ? savedContentDefaultsRef.current[period]
            : current[period],
        }),
        {}
      )
    );
    activityDirtyRef.current = {};
    setActivityDirtyPeriods({});
    finishPendingActivityNavigation();
  };

  const selectTab =
    (tabId) => {
      if (
        tabId ===
        activeTab
      ) {
        return;
      }

      const commitSelection = () => {
        setTransitioning(
          true
        );

        window.setTimeout(
          () => {
            setActiveTab(
              tabId
            );
            setTransitioning(
              false
            );
          },
          120
        );
      };

      if (
        activeTab === "activities" &&
        Object.keys(activityDirtyRef.current).length
      ) {
        requestActivityNavigation(commitSelection);
        return;
      }

      if (activeTab === "records" && scoresheetDirty) {
        requestScoresheetNavigation(commitSelection);
        return;
      }

      commitSelection();
    };

  const openBento =
    (tabId) => {
      setBentoOpen(true);
      selectTab(tabId);
    };

  const closeBento = useCallback(
    () => {
      if (
        activeTab === "activities" &&
        Object.keys(activityDirtyRef.current).length
      ) {
        requestActivityNavigation(() => setBentoOpen(false));
        return;
      }
      if (activeTab === "records" && scoresheetDirty) {
        requestScoresheetNavigation(() => setBentoOpen(false));
        return;
      }
      setBentoOpen(false);
    },
    [
      activeTab,
      requestActivityNavigation,
      requestScoresheetNavigation,
      scoresheetDirty,
    ]
  );

  useEffect(() => {
    const handlePwaBack = () => {
      if (analyticsChartOverlayPeriod) {
        setAnalyticsChartOverlayPeriod(null);
      } else if (analyticsMobileResultOpen) {
        setAnalyticsMobileResultOpen(false);
      } else if (scoresheetSavePromptOpen) {
        pendingScoresheetNavigationRef.current = null;
        setScoresheetSavePromptOpen(false);
      } else if (scoresheetDirty && activeTab === "records") {
        requestScoresheetNavigation(() => setBentoOpen(false));
      } else if (activityValidation) {
        setActivityValidation(null);
      } else if (activityDeleteTarget) {
        setActivityDeleteTarget(null);
      } else if (activitySavePromptOpen) {
        pendingActivityNavigationRef.current = null;
        setActivitySavePromptOpen(false);
      } else if (storyImport) {
        setStoryImportDragActive(false);
        setStoryImport(null);
      } else if (activityEditor) {
        setActivityEditor(null);
      } else if (twoFactorSetupOpen) {
        setTwoFactorSetupOpen(false);
        setTwoFactorSetup(null);
        setTwoFactorCode("");
      } else if (profileEditOpen) {
        setProfileEditOpen(false);
      } else if (detailsTarget) {
        setDetailsTarget(null);
      } else if (deleteTarget) {
        setDeleteTarget(null);
      } else if (bulkDeleteConfirm) {
        setBulkDeleteConfirm(false);
      } else if (addLearnerOpen && !savingLearner) {
        setAddLearnerOpen(false);
      } else if (logoutOpen && !loggingOut) {
        setLogoutOpen(false);
      } else if (securityOpen) {
        setSecurityOpen(false);
      } else if (sidebarOpen) {
        setSidebarOpen(false);
      } else if (bentoOpen) {
        closeBento();
      }
    };

    window.addEventListener("crl-pwa-back", handlePwaBack);
    return () => window.removeEventListener("crl-pwa-back", handlePwaBack);
  }, [
    activityDeleteTarget,
    activityEditor,
    activitySavePromptOpen,
    activityValidation,
    activeTab,
    addLearnerOpen,
    analyticsChartOverlayPeriod,
    analyticsMobileResultOpen,
    bentoOpen,
    bulkDeleteConfirm,
    closeBento,
    deleteTarget,
    detailsTarget,
    loggingOut,
    logoutOpen,
    profileEditOpen,
    savingLearner,
    scoresheetDirty,
    scoresheetSavePromptOpen,
    securityOpen,
    sidebarOpen,
    storyImport,
    twoFactorSetupOpen,
    requestScoresheetNavigation,
  ]);

  const logout =
    async (skipUnsavedGuard = false) => {
      if (
        !skipUnsavedGuard &&
        activeTab === "activities" &&
        Object.keys(activityDirtyRef.current).length
      ) {
        requestActivityNavigation(() => void logout(true));
        return;
      }

      if (
        !skipUnsavedGuard &&
        activeTab === "records" &&
        scoresheetDirty
      ) {
        requestScoresheetNavigation(() => void logout(true));
        return;
      }

      if (
        loggingOut
      ) {
        return;
      }

      setLoggingOut(
        true
      );

      // Mark the durable offline session signed out before any network work.
      // This prevents the login page's offline verifier from restoring the
      // teacher automatically when the logout request is slow or unavailable.
      await signOutOfflineTeacherSession().catch(() => {});

      try {
        await fetch(
          "/api/auth?action=logout",
          {
            method: "GET",
            credentials:
              "include",
            cache:
              "no-store",
          }
        );
      } catch {
        /* Redirect even if the request itself fails. */
      } finally {
        try {
          localStorage.removeItem(
            "crla_host_session"
          );

          localStorage.removeItem(
            "crla_user"
          );

          sessionStorage.removeItem(
            "crla_host_session"
          );

          sessionStorage.removeItem(
            "crla_user"
          );
        } catch {
          /* Storage may be unavailable. */
        }

        window.location.replace(
          "/login"
        );
      }
    };

  /*
   * Offline "Exit": leave the app without clearing the saved session, because
   * a teacher who is offline cannot sign back in until the device reconnects.
   */
  const exitApp = () => {
    setLogoutOpen(false);

    try {
      window.close();
    } catch {
      /* Some browsers disallow programmatic closing. */
    }

    window.setTimeout(() => {
      showToast(
        "Session kept on this device. You can close the app safely.",
        "success"
      );
    }, 400);
  };

  const saveProfile =
    async () => {
      try {
        if (!/^\d{6}$/.test(profileForm.schoolId.trim())) {
          throw new Error("School ID must contain exactly 6 numbers.");
        }

        if (!profileForm.schoolName.trim()) {
          throw new Error("School name is required.");
        }

        const result =
          await fetch(
            "/api/auth?action=update_user",
            {
              method:
                "POST",
              credentials:
                "include",
              cache:
                "no-store",
              headers: {
                "Content-Type":
                  "application/json",
                Accept:
                  "application/json",
              },
              body: JSON.stringify({
                full_name:
                  profileForm.fullName.trim(),
                section:
                  profileForm.section.trim(),
                school_id:
                  profileForm.schoolId.trim(),
                school_name:
                  profileForm.schoolName.trim(),
              }),
            }
          );

        const data =
          await result.json();

        if (!result.ok) {
          throw new Error(
            data.error ||
              "Unable to update your profile."
          );
        }

        setUser(
          data.user
        );

        setProfileEditOpen(
          false
        );

        showToast(
          "Profile updated successfully."
        );

        setSecurityEmail(user?.email || securityEmail);
      } catch (error) {
        showToast(
          error.message ||
            "Unable to update your profile.",
          "error"
        );
      }
    };

  const syncSecurityDropdownHeight = useCallback(() => {
    const content = securityDropdownContentRef.current;
    if (!content) return;

    const panel = content.closest(".securityPrivacyPanel");
    if (!panel) return;

    const header = panel.querySelector(".securityDropdownHeader");
    const headerHeight = header?.offsetHeight || 96;
    const contentHeight = content.scrollHeight;

    panel.style.setProperty(
      "--security-dropdown-open-height",
      `${headerHeight + contentHeight}px`
    );
  }, []);

  const toggleSecurityDropdown = () => {
    if (securityOpen) {
      setSecurityOpen(false);
      return;
    }

    syncSecurityDropdownHeight();
    setSecurityOpen(true);
    window.requestAnimationFrame(syncSecurityDropdownHeight);
  };

  useEffect(() => {
    const content = securityDropdownContentRef.current;
    if (!content) return undefined;

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => syncSecurityDropdownHeight())
        : null;

    resizeObserver?.observe(content);
    syncSecurityDropdownHeight();

    return () => resizeObserver?.disconnect();
  }, [syncSecurityDropdownHeight]);

  useEffect(() => {
    if (!securityOpen) return undefined;

    const frame = window.requestAnimationFrame(() => {
      syncSecurityDropdownHeight();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [securityOpen, twoFactorCode, syncSecurityDropdownHeight]);

  const loadSecurityStatus = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/auth?action=security_status",
        {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load security settings.");
      setSecurityStatus(data);
      setSecurityEmail(data.email || "");
    } catch (error) {
      showToast(error.message || "Unable to load security settings.", "error");
    }
  }, [showToast]);

  useEffect(() => {
    if (activeTab === "profile") {
      loadSecurityStatus();
    }
  }, [activeTab, loadSecurityStatus]);

  const beginTwoFactorSetup = async () => {
    setSecurityLoading(true);
    try {
      const response = await fetch("/api/auth?action=setup_2fa", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
        body: JSON.stringify({ action: "setup_2fa" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to start two-factor setup.");
      setTwoFactorSetup(data);
      setTwoFactorCode("");
      setTwoFactorSetupOpen(true);
    } catch (error) {
      showToast(error.message || "Unable to start two-factor setup.", "error");
    } finally {
      setSecurityLoading(false);
    }
  };

  const verifyTwoFactorSetup = async () => {
    if (!twoFactorCode.trim()) {
      showToast("Enter the 6-digit authenticator code.", "error");
      return;
    }

    setSecurityLoading(true);
    try {
      const response = await fetch("/api/auth?action=verify_2fa_setup", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          action: "verify_2fa_setup",
          code: twoFactorCode.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to verify the authenticator code.");

      setSecurityStatus((current) => ({
        ...current,
        two_factor_enabled: true,
      }));
      setTwoFactorSetup(null);
      setTwoFactorSetupOpen(false);
      setTwoFactorCode("");
      showToast("Two-factor authentication is now enabled.");
      await loadSecurityStatus();
    } catch (error) {
      showToast(error.message || "Unable to verify the authenticator code.", "error");
    } finally {
      setSecurityLoading(false);
    }
  };

  const disableTwoFactor = async () => {
    if (!twoFactorCode.trim()) {
      showToast("Enter your current 6-digit authenticator code.", "error");
      return;
    }

    setSecurityLoading(true);
    try {
      const response = await fetch("/api/auth?action=disable_2fa", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          action: "disable_2fa",
          code: twoFactorCode.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to disable two-factor authentication.");

      setSecurityStatus((current) => ({
        ...current,
        two_factor_enabled: false,
      }));
      setTwoFactorCode("");
      showToast("Two-factor authentication has been disabled.");
      await loadSecurityStatus();
    } catch (error) {
      showToast(error.message || "Unable to disable two-factor authentication.", "error");
    } finally {
      setSecurityLoading(false);
    }
  };

  const editActivity =
    (
      category,
      index = -1
    ) => {
      if (index < 0) {
        const savedCount =
          activities[activityPeriod][category].length;
        const limit = ASSESSMENT_CONTENT_LIMITS[category];
        /*
         * Teachers keep more than one assessment uses so a random run can draw
         * a different set. Only the ceiling blocks adding.
         */
        if (savedCount >= limit) {
          showToast(
            category === "stories"
              ? `Up to ${limit} stories can be saved.`
              : `Up to ${limit} items can be saved.`,
            "error"
          );
          return;
        }
      }

      const current =
        activities[
          activityPeriod
        ][category][
          index
        ];

      if (
        category ===
        "stories"
      ) {
        const storyText = String(current?.text || "");
        setActivityEditor({
          category,
          index,
          title:
            current?.title ||
            "",
          editorMode: index >= 0 ? "preview" : "document",
          storyText,
          storyWords: Array.from(
            {
              length:
                ASSESSMENT_CONTENT_REQUIREMENTS.storyWords,
            },
            (_, wordIndex) =>
              splitStoryWords(storyText)[wordIndex] || ""
          ),
        });
        return;
      }

      setActivityEditor({
        category,
        index,
        value: current || "",
        values: index < 0 ? [""] : undefined,
      });
    };

  const updateStoryWords = (startIndex, incomingWords) => {
    const words = incomingWords.map((word) =>
      String(word || "").replace(/\s+/g, "")
    );
    const available =
      ASSESSMENT_CONTENT_REQUIREMENTS.storyWords - startIndex;

    if (words.length > available) {
      showToast(
        `The passage would exceed 100 words. ${words.length - available} extra ${words.length - available === 1 ? "word" : "words"} were not added.`,
        "error"
      );
      return;
    }

    setActivityEditor((current) => {
      if (!current || current.category !== "stories") return current;
      const storyWords = [...current.storyWords];
      words.forEach((word, offset) => {
        storyWords[startIndex + offset] = word;
      });
      return { ...current, storyWords };
    });

    const nextIndex = Math.min(
      startIndex + words.length,
      ASSESSMENT_CONTENT_REQUIREMENTS.storyWords - 1
    );
    window.setTimeout(() => storyWordRefs.current[nextIndex]?.focus(), 0);
  };

  const saveActivity =
    () => {
      if (
        !activityEditor
      ) {
        return;
      }

      const category =
        activityEditor.category;

      const index =
        activityEditor.index;

      const next = {
        ...activities,
        [activityPeriod]: {
          ...activities[
            activityPeriod
          ],
          [category]: [
            ...activities[
              activityPeriod
            ][category],
          ],
        },
      };

      if (
        category ===
        "stories"
      ) {
        const storyWords = activityEditor.editorMode === "boxes"
          ? activityEditor.storyWords
              .map((word) => String(word || "").trim())
              .filter(Boolean)
          : splitStoryWords(activityEditor.storyText);
        const story = {
          id:
            index >= 0
              ? next[
                  activityPeriod
                ][category][
                  index
                ].id
              : Date.now(),
          title:
            activityEditor.title.trim(),
          text:
            storyWords.join(" "),
        };

        if (
          !story.title
        ) {
          showToast(
            "Story title is required.",
            "error"
          );
          return;
        }

        if (
          storyWords.length !==
          ASSESSMENT_CONTENT_REQUIREMENTS.storyWords
        ) {
          showToast(
            `Story content must contain exactly 100 words (${storyWords.length}/100).`,
            "error"
          );
          return;
        }

        if (
          index >= 0
        ) {
          next[
            activityPeriod
          ][category][
            index
          ] = story;
        } else {
          next[
            activityPeriod
          ][category].push(
            story
          );
        }
      } else {
        const values = index >= 0
          ? [String(activityEditor.value || "").trim()]
          : (Array.isArray(activityEditor.values)
              ? activityEditor.values
              : [activityEditor.value]
            ).map((value) => String(value || "").trim());
        const valid = values.length > 0 && values.every((value) =>
          category === "letters"
            ? /^[A-Za-z]$/.test(value)
            : /^[A-Za-z]{1,9}$/.test(value)
        );

        if (!valid) {
          showToast(
            category === "letters"
              ? "Enter exactly one letter in every item."
              : "Enter letters-only words of up to 9 characters in every item.",
            "error"
          );
          return;
        }

        const normalizedValues = values.map((value) => value.toUpperCase());
        const existingValues = next[activityPeriod][category]
          .filter((_, itemIndex) => itemIndex !== index)
          .map((value) => String(value || "").trim().toUpperCase());
        const combined = [...existingValues, ...normalizedValues];

        if (new Set(combined).size !== combined.length) {
          showToast(
            category === "letters"
              ? "Each letter can only be added once."
              : "Each word can only be added once.",
            "error"
          );
          return;
        }

        if (
          index < 0 &&
          next[activityPeriod][category].length + normalizedValues.length >
            ASSESSMENT_CONTENT_LIMITS[category]
        ) {
          showToast(
            `Up to ${ASSESSMENT_CONTENT_LIMITS[category]} items can be saved.`,
            "error"
          );
          return;
        }

        if (
          index >= 0
        ) {
          next[
            activityPeriod
          ][category][
            index
          ] = normalizedValues[0];
        } else {
          next[activityPeriod][category].push(...normalizedValues);
        }
      }

      setActivities(next);
      setActivityPeriodDirty(activityPeriod, true);
      setActivityEditor(
        null
      );

      showToast(
        "Item updated. Save the assessment content to keep this change."
      );
    };

  /*
   * Import a passage out of the teacher's own file. The readers are only
   * fetched when a file is actually chosen, so the dashboard stays light, and
   * nothing is ever written until the teacher has read the text back and
   * pressed Save.
   */
  const processStoryImportFile = useCallback(
    async (file) => {
      if (!file) return;
      setStoryImportDragActive(false);
      setStoryImport({ status: "reading", fileName: file.name });

      try {
        const { extractStoryFromFile } = await import(
          "../../lib/storyImport"
        );
        const result = await extractStoryFromFile(file);
        setStoryImport({ status: "ready", ...result });
      } catch (error) {
        setStoryImport({
          status: "error",
          fileName: file.name,
          message:
            error?.message ||
            "That file could not be read. Add the story by hand instead.",
        });
      }
    },
    []
  );

  const handleStoryImportFile = useCallback(
    async (event) => {
      const input = event?.target;
      const file = input?.files?.[0] || null;
      /* Clearing lets the same file be chosen again after a discard. */
      if (input) input.value = "";
      await processStoryImportFile(file);
    },
    [processStoryImportFile]
  );

  const handleStoryImportDrop = useCallback(
    async (event) => {
      event.preventDefault();
      event.stopPropagation();
      setStoryImportDragActive(false);
      await processStoryImportFile(event.dataTransfer?.files?.[0] || null);
    },
    [processStoryImportFile]
  );

  const saveImportedStory = useCallback(
    () => {
      if (!storyImport || storyImport.status !== "ready") return;

      const title = String(storyImport.title || "").trim();
      const words = splitStoryWords(storyImport.text);
      const limit = ASSESSMENT_CONTENT_LIMITS.stories;

      if (!title) {
        showToast("Story title is required.", "error");
        return;
      }

      if (
        words.length !==
        ASSESSMENT_CONTENT_REQUIREMENTS.storyWords
      ) {
        showToast(
          `Story content must contain exactly 100 words (${words.length}/100).`,
          "error"
        );
        return;
      }

      if (
        activities[activityPeriod].stories.length >= limit
      ) {
        showToast(
          `Up to ${limit} stories can be saved. Remove one before importing another.`,
          "error"
        );
        return;
      }

      const story = {
        id: Date.now(),
        title,
        text: words.join(" "),
      };

      setActivities((current) => ({
        ...current,
        [activityPeriod]: {
          ...current[activityPeriod],
          stories: [
            ...current[activityPeriod].stories,
            story,
          ],
        },
      }));
      setActivityPeriodDirty(activityPeriod, true);
      setStoryImport(null);

      showToast(
        "Story added. Save the assessment content to keep this change."
      );
    },
    [
      activities,
      activityPeriod,
      setActivityPeriodDirty,
      showToast,
      storyImport,
    ]
  );

  const storyImportWords =
    storyImport?.status === "ready"
      ? splitStoryWords(storyImport.text)
      : [];
  const storyImportWordCount = storyImportWords.length;
  const storyImportReady =
    storyImport?.status === "ready" &&
    storyImportWordCount ===
      ASSESSMENT_CONTENT_REQUIREMENTS.storyWords &&
    Boolean(String(storyImport.title || "").trim());

  const currentContentMode = normalizeAssessmentContentModes(
    contentModes[activityPeriod]
  )[activityTab];

  /*
   * The Default column only means something when the fixed set is in use and
   * there is more saved than an assessment administers. At exactly the limit
   * every item is a default already, so the column would be noise.
   */
  const showContentDefaultsColumn =
    currentContentMode === "fixed" &&
    activities[activityPeriod][activityTab].length >
      ASSESSMENT_CONTENT_REQUIREMENTS[activityTab];

  /*
   * Counted against the items actually on screen, so a tick left behind by a
   * deleted item cannot make the card claim a full set that the run will top
   * up from the top of the list.
   */
  const chosenContentDefaultCount = activities[activityPeriod][
    activityTab
  ].filter((item) =>
    isContentItemDefault(
      activityTab,
      item,
      contentDefaults[activityPeriod]
    )
  ).length;

  const removeActivity =
    (
      category,
      index
    ) => {
      const item = activities[activityPeriod]?.[category]?.[index];
      if (item === undefined) return;

      const itemName =
        category === "stories"
          ? `Story “${String(item?.title || "Untitled Story").trim()}”`
          : category === "letters"
            ? `Letter “${String(item)}”`
            : `Word “${String(item)}”`;

      setActivityDeleteTarget({
        category,
        index,
        period: activityPeriod,
        itemName,
      });
    };

  const confirmActivityDeletion = () => {
    const target = activityDeleteTarget;
    if (!target) return;

    const { category, index, period } = target;
    const next = {
      ...activities,
      [period]: {
        ...activities[
          period
        ],
        [category]: [
          ...activities[
            period
          ][category],
        ],
      },
    };

    next[
      period
    ][category].splice(
      index,
      1
    );

    setActivities(next);
    setActivityPeriodDirty(period, true);
    setActivityDeleteTarget(null);
    showToast(
      "Item removed. Add the required replacement before saving."
    );
  };

  if (loading) {
    return null;
  }

  return (
    <>
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          min-height: 100%;
          font-family:
            Arial,
            Helvetica,
            sans-serif;
          background:
            #fafafa;
          color: #1f2a3c;
        }

        button,
        input,
        select,
        textarea {
          font: inherit;
        }

        button {
          -webkit-tap-highlight-color: transparent;
        }

        .teacherShell {
          min-height: 100vh;
          display: flex;
          position: relative;
          background:
            radial-gradient(
              circle at 95% 5%,
              rgba(
                26,43,76,
                0.08
              ) 0,
              rgba(
                26,43,76,
                0.08
              ) 150px,
              transparent 151px
            ),
            radial-gradient(
              circle at 4% 94%,
              rgba(
                26,43,76,
                0.05
              ) 0,
              rgba(
                26,43,76,
                0.05
              ) 100px,
              transparent 101px
            ),
            #fafafa;
        }

        .sidebar {
          width: 218px;
          min-height: 100vh;
          position: sticky;
          top: 0;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border-right: 1px solid #dce3ec;
          z-index: 10;
        }

        .brandBlock {
          height: 76px;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 0 18px;
          border-bottom: 1px solid #dce3ec;
        }

        .brandLogo {
          width: 42px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
          background: #1a2b4c;
          color: #ffffff;
          font-weight: 900;
          font-size: 15px;
          box-shadow: none;
        }

        .brandTitle {
          color: #1f2a3c;
          font-size: 17px;
          font-weight: 900;
        }

        .brandSubtitle {
          margin-top: 2px;
          color: #6b7789;
          font-size: 9px;
        }

        .sidebarLabel {
          padding: 22px 20px 8px;
          color: #98a2b3;
          font-size: 9px;
          text-transform: uppercase;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .nav {
          padding-right: 18px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 0 10px;
        }

        .navButton {
          width: 100%;
          min-height: 44px;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 0 13px;
          background: transparent;
          border: 0;
          border-left: 3px solid transparent;
          color: #46536b;
          border-radius: 9px;
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition:
            background 0.18s ease,
            color 0.18s ease,
            border-color 0.18s ease,
            transform 0.18s ease;
        }

        .navButton:hover {
          background: #fafafa;
          color: #1a2b4c;
          transform: translateX(1px);
        }

        .navButton.active {
          color: #1a2b4c;
          background: #edf1f7;
          border-left-color: #1a2b4c;
        }

        .iconGlyph {
          width: 18px;
          text-align: center;
          font-size: 13px;
          font-weight: 900;
        }

        .sidebarSpacer {
          flex: 1;
        }

        .sidebarLogout {
          margin: 12px 12px 18px;
          min-height: 42px;
          border-radius: 9px;
          border: 1px solid #ebc9c4;
          background: #f8eae8;
          color: #c0392b;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            transform 0.18s ease;
        }

        .sidebarLogout:hover {
          background: #f8eae8;
          border-color: #ebc9c4;
          transform: translateY(-1px);
        }

        .main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        .topbar {
          min-height: 76px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 30px;
          background: #ffffff;
          border-bottom: 1px solid #dce3ec;
        }

        .topTitle {
          color: #1f2a3c;
          font-size: 21px;
          font-weight: 900;
          letter-spacing: -0.3px;
        }

        .topAccent {
          width: 72px;
          height: 3px;
          margin-top: 7px;
          display: flex;
          border-radius: 99px;
          overflow: hidden;
        }

        .topAccentBlue {
          flex: 1;
          background: #1a2b4c;
        }

        .topAccentRed {
          width: 30px;
          background: #c0392b;
        }

        .content {
          flex: 1;
          min-height: 0;
          padding: 24px 30px 30px;
          overflow-y: auto;
        }

        .contentStage {
          max-width: 1450px;
          margin: 0 auto;
          opacity: 1;
          transform: translateY(0);
          transition:
            opacity 0.18s ease,
            transform 0.18s ease;
        }

        .contentStage.transitioning {
          opacity: 0;
          transform: translateY(6px);
        }

        .pageIntro {
          margin-bottom: 18px;
        }

        .pageTitle {
          margin: 0;
          color: #1f2a3c;
          font-size: 25px;
          font-weight: 900;
          letter-spacing: -0.5px;
        }

        .pageSub {
          margin: 5px 0 0;
          color: #6b7789;
          font-size: 11px;
        }

        .welcomeCard {
          padding: 22px 24px;
          margin-bottom: 18px;
          background: #ffffff;
          border: 1px solid #dce3ec;
          border-radius: 13px;
          box-shadow: none;
        }

        .welcomeCard h2 {
          margin: 0;
          color: #1f2a3c;
          font-size: 20px;
          font-weight: 900;
        }

        .welcomeCard p {
          margin: 6px 0 0;
          color: #6b7789;
          font-size: 11px;
          line-height: 1.7;
        }

        .statsGrid {
          display: grid;
          grid-template-columns:
            repeat(
              6,
              minmax(0, 1fr)
            );
          gap: 12px;
          margin-bottom: 18px;
        }

        .statCard {
          background: #ffffff;
          border: 1px solid #dce3ec;
          border-radius: 12px;
          padding: 17px 18px;
          transition:
            transform 0.18s ease,
            box-shadow 0.18s ease,
            border-color 0.18s ease;
        }

        .statCard:hover {
          transform: translateY(-2px);
          border-color: #dce4ef;
          box-shadow: none;
        }

        .statNumber {
          font-size: 25px;
          font-weight: 900;
          line-height: 1;
        }

        .statLabel {
          margin-top: 7px;
          color: #6b7789;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          font-weight: 800;
        }

        .blue {
          color: #1a2b4c;
        }

        .red {
          color: #c0392b;
        }

        .green {
          color: #3e7a5e;
        }

        .orange {
          color: #a9762f;
        }

        .actionGrid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }

        .actionCard {
          background: #ffffff;
          border: 1px solid #dce3ec;
          border-radius: 13px;
          padding: 19px;
          min-height: 158px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: none;
        }

        .actionCard h3 {
          margin: 0;
          color: #1a2b4c;
          font-size: 15px;
          font-weight: 900;
        }

        .actionCard p {
          margin: 6px 0 0;
          color: #6b7789;
          font-size: 10px;
          line-height: 1.6;
        }

        .actionButton {
          align-self: flex-start;
          min-height: 39px;
          padding: 0 16px;
          border: 0;
          border-radius: 8px;
          background: #1a2b4c;
          color: #ffffff;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: none;
          transition:
            transform 0.16s ease,
            background 0.16s ease,
            box-shadow 0.16s ease;
        }

        .actionButton:hover {
          background: #1a2b4c;
          transform: translateY(-1px);
          box-shadow: none;
        }

        .actionButton.redButton {
          background: #c0392b;
          box-shadow: none;
        }

        .actionButton.redButton:hover {
          background: #9b2e22;
        }

        .panel {
          background: #ffffff;
          border: 1px solid #dce3ec;
          border-radius: 13px;
          overflow: hidden;
          box-shadow: none;
        }

        .panelHeader {
          min-height: 64px;
          padding: 15px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid #edf1f7;
        }

        .panelHeaderTitle {
          color: #1a2b4c;
          font-size: 14px;
          font-weight: 900;
        }

        .panelHeaderSub {
          margin-top: 4px;
          color: #6b7789;
          font-size: 9px;
        }

        .learnerRefreshButton {
          width: 40px;
          height: 40px;
          flex: 0 0 40px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 1px solid #c7d2e0;
          border-radius: 8px;
          background: #ffffff;
          color: #1a2b4c;
          cursor: pointer;
          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            transform 0.16s ease;
        }

        .learnerRefreshButton svg {
          width: 18px;
          height: 18px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .learnerRefreshButton:hover {
          background: #f5f8fc;
          border-color: #1a2b4c;
        }

        .learnerRefreshButton:active {
          transform: scale(0.96);
        }

        .learnerRefreshButton:disabled {
          cursor: wait;
          opacity: 0.55;
          transform: none;
        }

        .toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 9px;
          padding: 13px 16px;
          border-bottom: 1px solid #edf1f7;
          background: #ffffff;
        }

        .searchInput,
        .selectInput {
          height: 38px;
          border: 1px solid #c7d2e0;
          border-radius: 8px;
          background: #ffffff;
          color: #1a2b4c;
          outline: none;
          font-size: 10px;
          transition:
            border-color 0.18s ease,
            box-shadow 0.18s ease;
        }

        .searchInput {
          flex: 1;
          min-width: 220px;
          padding: 0 11px;
        }

        .selectInput {
          min-width: 155px;
          padding: 0 9px;
        }

        .searchInput,
        .selectInput {
          transition:
            border-color 0.18s ease,
            box-shadow 0.18s ease,
            background 0.18s ease;
        }

        .searchInput:focus,
        .selectInput:focus {
          border-color: #1a2b4c;
          box-shadow: none;
        }

        .toolbarButton {
          min-height: 38px;
          padding: 0 13px;
          border-radius: 8px;
          background: #1a2b4c;
          color: #ffffff;
          border: 1px solid #1a2b4c;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
          transition:
            background 0.16s ease,
            transform 0.16s ease,
            box-shadow 0.16s ease;
        }

        .toolbarButton:hover {
          background: #1a2b4c;
          transform: translateY(-1px);
          box-shadow: none;
        }

        .tableWrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 12px 13px;
          text-align: left;
          border-bottom: 1px solid #edf1f7;
          /* Vertical rules separate neighbouring cells, so a wide record row
             stays readable across to the value it belongs to. */
          border-right: 1px solid #eceff3;
          font-size: 11px;
          white-space: nowrap;
        }

        th:last-child,
        td:last-child {
          border-right: 0;
        }

        th {
          background: #fafafa;
          color: #6b7789;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-size: 9px;
          font-weight: 900;
        }

        td {
          color: #1a2b4c;
        }

        tbody tr {
          transition:
            background 0.16s ease;
        }

        tbody tr:hover td {
          background: #fafafa;
        }

        .nameStrong {
          color: #2a3a55;
          font-weight: 800;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          min-height: 22px;
          padding: 0 8px;
          border-radius: 999px;
          font-size: 8px;
          font-weight: 900;
        }

        .badge.neutral {
          background: #fafafa;
          color: #6b7789;
        }

        .badge.grade {
          background: #e8f0ea;
          color: #3e7a5e;
        }

        .badge.danger {
          background: #f8eae8;
          color: #c0392b;
        }

        .badge.warning {
          background: #f5ede0;
          color: #835b24;
        }

        .badge.info {
          background: #edf1f7;
          color: #1a2b4c;
        }

        .inlineActions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .smallButton {
          min-height: 29px;
          padding: 0 9px;
          border-radius: 6px;
          border: 1px solid #c7d2e0;
          background: #ffffff;
          color: #1a2b4c;
          font-size: 8px;
          font-weight: 800;
          cursor: pointer;
          transition:
            background 0.16s ease,
            border-color 0.16s ease,
            color 0.16s ease;
        }

        .smallButton:hover {
          border-color: #1a2b4c;
          background: #edf1f7;
        }

        .smallButton.primary {
          background: #1a2b4c;
          color: #ffffff;
          border-color: #1a2b4c;
        }

        .smallButton.primary:hover {
          background: #1a2b4c;
        }

        .smallButton.redSmall {
          background: #f8eae8;
          color: #c0392b;
          border-color: #ebc9c4;
        }

        .smallButton.redSmall:hover {
          background: #ebc9c4;
          border-color: #ebc9c4;
        }

        .smallButton:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .emptyState {
          padding: 54px 20px;
          text-align: center;
        }

        .emptyIcon {
          width: 48px;
          height: 48px;
          margin: 0 auto 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: #edf1f7;
          color: #1a2b4c;
          font-weight: 900;
          font-size: 19px;
        }

        .emptyState h3 {
          margin: 0;
          color: #1a2b4c;
          font-size: 13px;
        }

        .emptyState p {
          margin: 5px auto 14px;
          max-width: 380px;
          color: #6b7789;
          font-size: 10px;
          line-height: 1.6;
        }

        .periodTabs {
          display: inline-flex;
          gap: 4px;
          padding: 4px;
          border: 1px solid #dce3ec;
          border-radius: 8px;
          background: #fafafa;
        }

        .periodTab {
          min-height: 31px;
          padding: 0 11px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #6b7789;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .periodTab.active {
          background: #1a2b4c;
          color: #ffffff;
          box-shadow: none;
        }

        .profileBox {
          padding: 20px;
        }

        .profileGrid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 12px;
        }

        .profileItem {
          padding: 14px;
          border: 1px solid #dce3ec;
          border-radius: 9px;
          background: #ffffff;
        }

        .profileLabel {
          color: #98a2b3;
          font-size: 8px;
          text-transform: uppercase;
          font-weight: 900;
          letter-spacing: 0.6px;
        }

        .profileValue {
          margin-top: 6px;
          color: #2a3a55;
          font-size: 13px;
          font-weight: 800;
        }

        .analyticsGrid {
          display: grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );
          gap: 12px;
          padding: 16px;
        }

        .analyticsCard {
          padding: 17px;
          border: 1px solid #edf1f7;
          border-radius: 10px;
          background: #ffffff;
        }

        .analyticsCard h3 {
          margin: 0;
          color: #2a3a55;
          font-size: 10px;
          font-weight: 900;
        }

        .analyticsValue {
          margin-top: 8px;
          color: #1a2b4c;
          font-size: 23px;
          font-weight: 900;
        }

        .analyticsMuted {
          margin-top: 4px;
          color: #6b7789;
          font-size: 8px;
        }

        .barList {
          padding: 0 16px 18px;
        }

        .barRow {
          margin-top: 11px;
        }

        .barTop {
          display: flex;
          justify-content: space-between;
          color: #46536b;
          font-size: 12px;
          font-weight: 800;
        }

        .barTrack {
          height: 7px;
          margin-top: 5px;
          background: #edf1f7;
          border-radius: 999px;
          overflow: hidden;
        }

        .barFill {
          height: 100%;
          background: #1a2b4c;
          border-radius: 999px;
          transition:
            width 0.35s ease;
        }

        .recordsHeaderActions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 8px;
        }

        .recordViewTabs {
          display: inline-flex;
          gap: 4px;
          padding: 4px;
          border: 1px solid #dce3ec;
          border-radius: 8px;
          background: #fafafa;
        }

        .recordViewTab {
          min-height: 31px;
          padding: 0 11px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #6b7789;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
          transition:
            background 0.18s ease,
            color 0.18s ease,
            transform 0.15s ease;
        }

        .recordViewTab:hover {
          color: #1a2b4c;
          transform: translateY(-1px);
        }

        .recordViewTab.active {
          background: #1a2b4c;
          color: #ffffff;
        }

        .exportButton {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
        }

        .buttonSpinner,
        .busySpinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: currentColor;
          border-radius: 50%;
          animation: teacherSpin 0.72s linear infinite;
        }

        .busySpinner {
          width: 24px;
          height: 24px;
          flex: 0 0 auto;
          border-color: #dce3ec;
          border-top-color: #1a2b4c;
        }

        .busyCard {
          display: flex;
          align-items: center;
          gap: 13px;
          min-width: 275px;
        }

        .busyCard strong {
          display: block;
          color: #2a3a55;
          font-size: 12px;
          font-weight: 900;
        }

        .busySubtext {
          margin-top: 4px;
          color: #6b7789;
          font-size: 9px;
        }

        .optionalLabel {
          color: #98a2b3;
          font-size: 9px;
          font-weight: 700;
        }

        .recordSummary {
          padding: 16px;
        }

        .summaryTableWrap {
          overflow-x: auto;
          border: 1px solid #dce3ec;
          border-radius: 9px;
        }

        .summaryTable {
          min-width: 1150px;
        }

        .summaryDetailSection {
          margin-top: 14px;
        }

        .summaryDetailTitle {
          padding: 11px 14px;
          text-align: center;
          color: #2a3a55;
          font-size: 15px;
          font-weight: 900;
          border: 1px solid #dce3ec;
          border-bottom: 0;
          border-radius: 12px 12px 0 0;
          background: #fafafa;
        }

        .summaryDetailScroller {
          overflow: auto;
          border: 1px solid #dce3ec;
          border-radius: 0 0 12px 12px;
          background: #ffffff;
        }

        .summaryDetailTable {
          width: 100%;
          min-width: 1500px;
          border-collapse: collapse;
        }

        .summaryDetailTable th,
        .summaryDetailTable td {
          padding: 9px 8px;
          border: 1px solid #c7d2e0;
          text-align: center;
          vertical-align: middle;
          font-size: 12px;
        }

        .summaryDetailTable th {
          background: #dce3ec;
          color: #2a3a55;
          font-weight: 900;
        }

        .summaryDetailTable thead tr:nth-child(2) th,
        .summaryDetailTable thead tr:nth-child(2) td {
          background: #edf1f7;
          font-size: 11px;
        }

        .summaryDetailTable td {
          background: #fafafa;
          color: #2a3a55;
        }

        .summaryMetricGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 12px;
        }

        .summaryMetricCard {
          border: 1px solid #dce3ec;
          border-radius: 12px;
          background: #ffffff;
          overflow: hidden;
        }

        .summaryMetricTitle {
          padding: 11px 13px;
          min-height: 42px;
          display: flex;
          align-items: center;
          border-bottom: 1px solid #edf1f7;
          color: #2a3a55;
          font-size: 13px;
          line-height: 1.35;
          font-weight: 900;
        }

        .summaryMetricRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 8px 13px;
          color: #46536b;
          font-size: 12px;
          border-bottom: 1px solid #fafafa;
        }

        .summaryMetricRow:last-child {
          border-bottom: 0;
        }

        .summaryMetricRow strong {
          color: #2a3a55;
          font-size: 12px;
        }

        /* Percentages read as quantities at a glance, not just as numbers. */
        .summaryMetricRow > span {
          flex: 0 0 auto;
          max-width: 46%;
        }

        .summaryMetricRow > strong {
          flex: 0 0 auto;
          min-width: 60px;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .summaryMetricBar {
          flex: 1 1 auto;
          min-width: 36px;
          height: 8px;
          border-radius: 999px;
          background: #eef2f7;
          overflow: hidden;
        }

        .summaryMetricBarFill {
          height: 100%;
          border-radius: 999px;
          background: #1a2b4c;
          transition: width 220ms ease-out;
        }

        .summaryMetricBarFill.isMale { background: #4a6fa5; }
        .summaryMetricBarFill.isFemale { background: #c0392b; }

        @media (prefers-reduced-motion: reduce) {
          .summaryMetricBarFill { transition: none; }
        }

        .recordCharts {
          display: grid;
          grid-template-columns:
            repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 14px;
        }

        .chartCardSimple {
          border: 1px solid #dce3ec;
          border-radius: 10px;
          background: #ffffff;
          overflow: hidden;
        }

        .chartTitleSimple {
          padding: 13px 14px;
          border-bottom: 1px solid #edf1f7;
          color: #2a3a55;
          font-size: 13px;
          font-weight: 900;
          line-height: 1.45;
        }

        .miniChart {
          padding: 4px 14px 14px;
        }

        @keyframes teacherSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }

        .activityTabs {
          display: flex;
          gap: 5px;
          padding: 13px 16px;
          border-bottom: 1px solid #edf1f7;
          background: #ffffff;
        }

        .activityTab {
          min-height: 31px;
          padding: 0 12px;
          border: 1px solid #dce3ec;
          border-radius: 7px;
          background: #ffffff;
          color: #6b7789;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }

        .activityTab.active {
          border-color: #1a2b4c;
          background: #edf1f7;
          color: #1a2b4c;
        }

        .assessmentContentActions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .assessmentSaveButton {
          min-width: 84px;
          border-color: #2f6f52 !important;
          background: #2f6f52 !important;
          color: #ffffff !important;
        }

        .assessmentSaveButton:hover:not(:disabled) {
          border-color: #255a42 !important;
          background: #255a42 !important;
        }

        .assessmentSaveButton:disabled {
          border-color: #91ad9f !important;
          background: #91ad9f !important;
          color: #f8fbff !important;
        }

        .activityAddButton {
          border-color: #315f9a !important;
          background: #315f9a !important;
          color: #ffffff !important;
        }

        .activityAddButton:hover:not(:disabled) {
          border-color: #264d80 !important;
          background: #264d80 !important;
        }

        .activityRequirementCount {
          color: #6b7789;
          font-weight: 800;
        }

        .modalOverlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background:
            rgba(
              24,
              42,
              63,
              0.32
            );
          backdrop-filter:
            blur(4px);
          animation:
            overlayIn
            0.16s ease;
        }

        .modal {
          width: min(
            100%,
            520px
          );
          max-height: 90vh;
          overflow-y: auto;
          background: #ffffff;
          border: 1px solid #dce3ec;
          border-radius: 13px;
          box-shadow: none;
          animation:
            modalIn
            0.18s ease;
        }

        .modalHeader {
          min-height: 58px;
          padding: 0 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #edf1f7;
        }

        .modalHeader h2 {
          margin: 0;
          color: #1a2b4c;
          font-size: 14px;
        }

        .closeButton {
          width: 31px;
          height: 31px;
          border: 0;
          border-radius: 7px;
          background: #fafafa;
          color: #6b7789;
          cursor: pointer;
          font-size: 16px;
        }

        .closeButton:hover {
          background: #edf1f7;
        }

        .modalBody {
          padding: 18px;
        }

        .formGrid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 12px;
        }

        .formGroup {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .formGroup.full {
          grid-column: 1 / -1;
        }

        .formLabel {
          color: #2a3a55;
          font-size: 9px;
          font-weight: 900;
        }

        .formLabel span {
          color: #c0392b;
        }

        .formInput,
        .formSelect,
        .formTextarea {
          width: 100%;
          min-height: 38px;
          border: 1px solid #c7d2e0;
          border-radius: 8px;
          padding: 0 10px;
          background: #ffffff;
          color: #2a3a55;
          outline: none;
          font-size: 10px;
        }

        .formTextarea {
          min-height: 100px;
          padding: 10px;
          resize: vertical;
        }

        .formInput:focus,
        .formSelect:focus,
        .formTextarea:focus {
          border-color: #1a2b4c;
          box-shadow: none;
        }

        .modalFooter {
          padding: 13px 18px;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          border-top: 1px solid #edf1f7;
          background: #ffffff;
        }

        .activityEditorModal.itemEditorModal {
          width: min(100%, 620px);
        }

        .activityEditorModal.storyEditorModal {
          width: min(100%, 960px);
        }

        .activityEditorModal .modalHeader {
          min-height: 70px;
          padding-inline: 24px;
        }

        .activityEditorModal .modalBody {
          padding: 24px;
        }

        .activityEditorModal .modalFooter {
          padding: 16px 24px;
        }

        .activityEditorModal.itemEditorModal .formInput {
          min-height: 52px;
          font-size: 18px !important;
        }

        .storyWordField {
          gap: 10px;
        }

        .storyPreviewTitle {
          margin: 0;
          color: #1a2b4c;
          font-size: 18px;
          line-height: 1.35;
        }

        .storyPlainPreview {
          max-height: 52vh;
          overflow-y: auto;
          margin: 0;
          padding: 18px;
          border: 1px solid #d7e0eb;
          border-radius: 10px;
          background: #fbfcfe;
          color: #263750;
          font-size: 15px;
          line-height: 1.75;
          white-space: pre-wrap;
        }

        .storyDocumentTextarea {
          min-height: 42vh;
          padding: 14px;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 15px;
          line-height: 1.7;
        }

        .storyWordLabelRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .storyWordCount {
          color: #a33a3a;
          font-size: 12px;
          font-weight: 900;
        }

        .storyWordCount.complete {
          color: #356b52;
        }

        .storyWordGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          max-height: 52vh;
          overflow-y: auto;
          padding: 2px 6px 2px 2px;
          scrollbar-gutter: stable;
        }

        .storyWordSlot {
          min-width: 0;
          min-height: 46px;
          display: grid;
          grid-template-columns: 27px minmax(0, 1fr);
          align-items: center;
          border: 1px solid #c7d2e0;
          border-radius: 10px;
          background: #ffffff;
          overflow: hidden;
          transition: border-color 0.16s ease, background 0.16s ease;
        }

        .storyWordSlot:focus-within {
          border-color: #1a2b4c;
          background: #f8fbff;
        }

        .storyWordSlot > span {
          color: #78869a;
          font-size: 9px;
          font-weight: 900;
          text-align: center;
          user-select: none;
        }

        .storyWordSlot input {
          width: 100%;
          min-width: 0;
          min-height: 44px;
          border: 0;
          border-left: 1px solid #e4e9f0;
          padding: 0 9px;
          background: transparent;
          color: #1a2b4c;
          outline: none;
          font-size: 14px;
          font-weight: 700;
        }

        .activityConfirmModal {
          width: min(100%, 480px);
        }

        .activityConfirmModal p {
          margin: 0;
          color: #46536b;
        }

        .activityValidationModal {
          width: min(100%, 560px);
        }

        .activityIssueList {
          margin: 0;
          padding-left: 20px;
          color: #7d2f35;
          display: grid;
          gap: 9px;
        }

        .activityIssueList li {
          line-height: 1.45;
        }

        html[data-crl-theme="dark"] .storyWordSlot {
          border-color: #405068;
          background: #18263a;
        }

        html[data-crl-theme="dark"] .storyWordSlot:focus-within {
          border-color: #91a9c8;
          background: #1d2e45;
        }

        html[data-crl-theme="dark"] .storyWordSlot > span {
          color: #9aacbf;
        }

        html[data-crl-theme="dark"] .storyWordSlot input {
          border-left-color: #405068;
          color: #edf3fa;
        }

        html[data-crl-theme="dark"] .activityConfirmModal p {
          color: #c6d1df;
        }

        html[data-crl-theme="dark"] .activityIssueList {
          color: #f0a2a8;
        }

        html[data-crl-theme="dark"] .storyPreviewTitle {
          color: #edf3fa;
        }

        html[data-crl-theme="dark"] .storyPlainPreview {
          border-color: #405068;
          background: #151f30;
          color: #dce6f3;
        }

        .activityItemsWrap .activityItemsTable {
          width: 100% !important;
          min-width: 0 !important;
          table-layout: fixed;
        }

        .activityItemsTable th:first-child,
        .activityItemsTable td.activityItemIndex {
          width: 48px;
        }

        .activityItemsTable th:last-child,
        .activityItemsTable td.activityItemActionCell {
          width: 142px;
        }

        .activityItemsTable td.activityItemContent {
          overflow-wrap: anywhere;
        }

        @media (max-width: 760px) {
          .assessmentContentActions {
            width: 100%;
            justify-content: space-between;
          }

          .storyWordGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            max-height: 55vh;
          }

          .activityEditorModal .modalHeader,
          .activityEditorModal .modalBody,
          .activityEditorModal .modalFooter {
            padding-inline: 16px;
          }

          .activityItemsWrap {
            overflow: visible;
          }

          .activityItemsTable thead {
            display: none;
          }

          .activityItemsTable,
          .activityItemsTable tbody,
          .activityItemsTable tr,
          .activityItemsTable td {
            display: block;
            width: 100% !important;
          }

          .activityItemsTable tbody {
            display: grid;
            gap: 9px;
          }

          .activityItemsTable tr {
            position: relative;
            min-height: 74px;
            padding: 12px 106px 12px 42px;
            border: 1px solid #dce3ec;
            border-radius: 10px;
            background: #ffffff;
          }

          .activityItemsTable td {
            padding: 0 !important;
            border: 0 !important;
            background: transparent !important;
          }

          .activityItemsTable td.activityItemIndex {
            position: absolute;
            top: 12px;
            left: 12px;
            color: #6b7789;
            font-size: 10px;
          }

          .activityItemsTable td.activityItemContent {
            min-height: 24px;
            font-size: 12px;
            line-height: 1.45;
          }

          .activityItemsTable td.activityItemDefault {
            margin-top: 8px;
          }

          .activityItemsTable td.activityItemActionCell {
            position: absolute;
            top: 11px;
            right: 11px;
          }

          .activityItemsTable .inlineActions {
            justify-content: flex-end;
            gap: 5px;
          }

          .activityItemsTable .smallButton {
            min-height: 34px;
            padding-inline: 8px;
          }

          html[data-crl-theme="dark"] .activityItemsTable tr {
            border-color: #33405a;
            background: #131c2b;
          }
        }

        @media (max-width: 430px) {
          .storyWordGrid {
            grid-template-columns: 1fr;
          }

          .activityConfirmActions {
            flex-wrap: wrap;
          }
        }

        .secondaryButton {
          min-height: 36px;
          padding: 0 13px;
          border-radius: 8px;
          border: 1px solid #c7d2e0;
          background: #ffffff;
          color: #46536b;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }

        .secondaryButton:hover {
          background: #fafafa;
        }

        .dangerButton {
          min-height: 36px;
          padding: 0 13px;
          border-radius: 8px;
          border: 0;
          background: #c0392b;
          color: #ffffff;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }

        .dangerButton:hover {
          background: #9b2e22;
        }

        .toast {
          position: fixed;
          right: 22px;
          bottom: 22px;
          z-index: 300;
          width: min(430px, calc(100vw - 44px));
          max-width: 430px;
          min-height: 58px;
          padding: 16px 20px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          line-height: 1.45;
          border-radius: 12px;
          background: #ffffff;
          border: 1px solid #dce3ec;
          box-shadow: none;
          color: #2a3a55;
          font-size: 13px;
          font-weight: 800;
          animation:
            toastIn
            0.24s cubic-bezier(.22,1,.36,1);
        }

        .toast.error {
          border-color: #ebc9c4;
          color: #9b2e22;
          background: #f8eae8;
        }

        .toast.success {
          border-color: #d7e6dd;
          color: #2f5f49;
          background: #fafafa;
        }

        html[data-crl-theme="dark"] .toast {
          background: #1f2a3c !important;
          border-color: #2a3a55 !important;
          color: #edf1f7 !important;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .toast.error {
          background: #1f2a3c !important;
          border-color: #9b2e22 !important;
          color: #dda8a2 !important;
        }

        html[data-crl-theme="dark"] .toast.success {
          background: #2f5f49 !important;
          border-color: #2f5f49 !important;
          color: #9dc4ad !important;
        }

        .busyOverlay {
          position: fixed;
          inset: 0;
          z-index: 350;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            rgba(
              255,
              255,
              255,
              0.55
            );
          backdrop-filter:
            blur(2px);
          overscroll-behavior: none;
          touch-action: none;
        }

        .busyCard {
          padding: 17px 20px;
          background: #ffffff;
          border: 1px solid #dce3ec;
          border-radius: 10px;
          box-shadow: none;
          color: #1a2b4c;
          font-size: 10px;
          font-weight: 900;
        }

        @keyframes overlayIn {
          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }
        }

        @keyframes modalIn {
          from {
            opacity: 0;
            transform: translateY(
              8px
            ) scale(0.99);
          }

          to {
            opacity: 1;
            transform: translateY(
              0
            ) scale(1);
          }
        }

        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateY(
              7px
            );
          }

          to {
            opacity: 1;
            transform: translateY(
              0
            );
          }
        }

        /* Soft neumorphism dashboard skin */
        .teacherShell {
          background: #edf1f7;
        }

        .sidebar {
          width: 332px;
          background: #edf1f7;
          border-right: 0;
          box-shadow: none;
          transition: width .34s cubic-bezier(.22,1,.36,1), box-shadow .28s ease;
          overflow: visible;
        }

        .sidebar.collapsed { width: 86px; }

        .brandBlock {
          min-height: 82px;
          background: #edf1f7;
          border-bottom: 0;
          position: relative;
        }

        .brandThemeSwitch { z-index: 2; }

        .brandLogo {
          background: #edf1f7;
          color: #1a2b4c;
          border: 0;
          box-shadow: none;
        }

        .brandTitle { font-size: 19px; }
        .brandSubtitle { font-size: 11px; }

        .sidebarToggle {
          position: absolute;
          top: 15px;
          right: -16px;
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 50%;
          background: #edf1f7;
          color: #1a2b4c;
          box-shadow: none;
          cursor: pointer;
          z-index: 30;
          transition: transform .20s ease, box-shadow .20s ease;
        }

        .sidebarToggle:hover { transform: translateY(-1px); }
        .sidebarToggle:active {
          transform: translateY(1px) scale(.96);
          box-shadow: none;
        }
        .sidebarToggleGlyph { font-size: 22px; font-weight: 900; line-height: 1; }

        .sidebar.collapsed .brandBlock { justify-content: center; padding: 0; }
        .sidebar.collapsed .brandText,
        .sidebar.collapsed .sidebarLabel,
        .sidebar.collapsed .navLabel {
          opacity: 0;
          width: 0;
          max-width: 0;
          overflow: hidden;
          white-space: nowrap;
          margin: 0;
          pointer-events: none;
          transition: opacity .16s ease, width .28s ease;
        }
        .sidebar:not(.collapsed) .brandText,
        .sidebar:not(.collapsed) .navLabel {
          transition: opacity .25s ease .08s, width .28s ease;
        }
        .sidebar.collapsed .nav { padding: 0 12px; }
        .sidebar.collapsed .navButton { justify-content: center; padding-left: 0; padding-right: 0; }

        .nav { gap: 9px; padding: 0 14px; }
        .navButton {
          min-height: 52px;
          gap: 12px;
          padding: 0 15px;
          border: 0;
          border-left: 0;
          border-radius: 16px;
          background: #edf1f7;
          color: #2a3a55;
          box-shadow: none;
          font-size: 14px;
          transition: transform .18s ease, color .18s ease, box-shadow .20s ease, background .20s ease;
        }
        .navButton:hover {
          background: #edf1f7;
          color: #1a2b4c;
          transform: translateY(-1px);
          box-shadow: none;
        }
        .navButton:active {
          transform: translateY(1px) scale(.995);
          box-shadow: none;
        }
        .navButton.active {
          background: #edf1f7;
          color: #1a2b4c;
          box-shadow: none;
        }
        .iconGlyph { flex: 0 0 22px; width: 22px; font-size: 15px; }

        .sidebarLogout {
          min-height: 48px;
          margin: 14px 14px 18px;
          border: 0;
          border-radius: 15px;
          background: #edf1f7;
          color: #c0392b;
          box-shadow: none;
          font-size: 13px;
          transition: transform .18s ease, box-shadow .20s ease;
        }
        .sidebarLogout:hover {
          transform: translateY(-1px);
          box-shadow: none;
        }
        .sidebarLogout:active {
          transform: translateY(1px);
          box-shadow: none;
        }
        .sidebar.collapsed .sidebarLogout { font-size: 0; padding: 0; }
        .sidebar.collapsed .sidebarLogout::before { content: "↪"; font-size: 17px; }

        .main { background: #edf1f7; }
        .topbar {
          min-height: 24px;
          height: 24px;
          padding: 0 30px;
          background: transparent;
          border-bottom: 0;
        }
        .topTitle, .topAccent { display: none; }
        .content { padding: 16px 30px 32px; }
        .pageTitle { font-size: 30px; letter-spacing: -.6px; }
        .pageSub { font-size: 14px; line-height: 1.55; }

        .welcomeCard, .actionCard, .statCard, .panel {
          border: 0;
          background: #edf1f7;
          box-shadow: none;
        }
        .welcomeCard, .actionCard, .panel { border-radius: 20px; }
        .statCard { border-radius: 18px; }
        .welcomeCard h2 { font-size: 22px; }
        .welcomeCard p, .actionCard p, .panelHeaderSub { font-size: 13px; line-height: 1.65; }
        .statNumber { font-size: 28px; }
        .statLabel { font-size: 11px; }
        .panelHeaderTitle { font-size: 17px; }

        /* The dashboard shortcut cards remain accessible through Home navigation;
           the screenshot-requested cards are intentionally removed from the Home view. */
        .actionGrid { display: none; }

        .searchInput, .selectInput {
          min-height: 50px;
          border: 0;
          border-radius: 15px;
          background: #edf1f7;
          box-shadow: none;
          font-size: 14px;
        }
        .searchInput:focus, .selectInput:focus {
          outline: none;
          box-shadow: none;
        }

        .toolbarButton, .smallButton, .recordViewTab, .periodTab, .secondaryButton, .dangerButton {
          border: 0;
          border-radius: 14px;
          background: #edf1f7;
          color: #1a2b4c;
          box-shadow: none;
          font-size: 14px;
          transition: transform .17s ease, box-shadow .20s ease, background .17s ease;
        }
        .toolbarButton:hover, .smallButton:hover, .recordViewTab:hover, .periodTab:hover, .secondaryButton:hover, .dangerButton:hover {
          transform: translateY(-1px);
          box-shadow: none;
        }
        .toolbarButton:active, .smallButton:active, .recordViewTab:active, .periodTab:active, .secondaryButton:active, .dangerButton:active {
          transform: translateY(1px) scale(.99);
          box-shadow: none;
        }
        .toolbarButton:disabled, .smallButton:disabled, .secondaryButton:disabled, .dangerButton:disabled { opacity: .48; transform: none; cursor: not-allowed; }
        .dangerButton, .redSmall { color: #c0392b; }
        .softButton { color: #1a2b4c; }

        .tableWrap, .summaryTableWrap {
          background: #edf1f7;
          border: 0;
          border-radius: 18px;
          box-shadow: none;
        }
        table { font-size: 14px; }
        th { font-size: 12px; }
        td { font-size: 14px; }
        .selectionCell, .selectionHeader { width: 48px; text-align: center; }
        .learnerCheckbox { width: 21px; height: 21px; accent-color: #1a2b4c; cursor: pointer; }
        .selectedRow td { background: rgba(26,43,76,.055); }
        .srOnly { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

        @media (max-width: 1180px) {
          .statsGrid {
            grid-template-columns:
              repeat(
                3,
                minmax(0, 1fr)
              );
          }

          .analyticsGrid {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }
        }

        @media (max-width: 880px) {
          .sidebar {
            width: 70px;
          }

          .brandBlock {
            justify-content: center;
            padding: 0;
          }

          .brandText {
            display: none;
          }

          .sidebarLabel {
            display: none;
          }

          .nav {
            padding: 10px;
          }

          .navButton {
            justify-content: center;
            padding: 0;
          }

          .navButton span:last-child {
            display: none;
          }

          .sidebarLogout {
            margin: 10px;
            font-size: 0;
          }

          .sidebarLogout::before {
            content: "↪";
            font-size: 14px;
          }

          .actionGrid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 700px) {
          .topbar {
            min-height: 64px;
            padding: 0 16px;
          }

          .content {
            padding: 16px;
          }

          .statsGrid {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }

          .profileGrid,
          .formGrid,
          .analyticsGrid {
            grid-template-columns: 1fr;
          }

          .formGroup.full {
            grid-column: auto;
          }

          .toolbar {
            align-items: stretch;
          }

          .searchInput,
          .selectInput,
          .toolbarButton {
            width: 100%;
          }

          .pageTitle {
            font-size: 21px;
          }
        }

        @media (max-width: 480px) {
          .sidebar {
            width: 58px;
          }

          .nav {
            padding: 8px 6px;
          }

          .navButton {
            min-height: 41px;
          }

          .statsGrid {
            grid-template-columns: 1fr;
          }

          .brandLogo {
            width: 38px;
            height: 38px;
          }
        }
        @media (max-width: 880px) {
          .sidebar {
            width: 86px;
          }
          .sidebar.open {
            width: 332px;
          }
          .brandText, .sidebarLabel, .navLabel {
            transition: opacity .18s ease, width .28s ease;
          }
        }

        @media (max-width: 760px) {
          .sidebar {
            position: fixed;
            left: 0;
            top: 0;
            height: 100vh;
            z-index: 50;
          }
          .sidebar.open { width: 332px; }
          .sidebar.collapsed { width: 86px; }
          .content { padding: 16px 18px 28px; }
          .topbar { min-height: 16px; height: 16px; }
          .pageTitle { font-size: 27px; }
          .pageSub { font-size: 13px; }
          .statsGrid { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .toolbar { align-items: stretch; }
          .searchInput, .selectInput, .toolbarButton { width: 100%; }
        }

        @media (max-width: 480px) {
          .statsGrid { grid-template-columns: 1fr; }
          .pageTitle { font-size: 25px; }
        }


        .templateSummaryTable {
          min-width: 1700px;
        }
        .templateSummaryTable th,
        .templateSummaryTable td {
          border: 1px solid rgba(104,125,145,.34);
          padding: 8px 7px;
          text-align: center;
          vertical-align: middle;
          font-size: 13px;
        }
        .templateSummaryTable th {
          background: #dce3ec;
          color: #2a3a55;
          font-weight: 900;
        }
        .templateSummaryTable thead tr:first-child th {
          background: #c7d2e0;
        }
        .templateSummaryTable tbody td {
          background: #edf1f7;
          color: #2a3a55;
        }
        html[data-crl-theme="dark"] .templateSummaryTable th {
          background: #2a3a55;
          color: #c7d2e0;
          border-color: #2a3a55;
        }
        html[data-crl-theme="dark"] .templateSummaryTable tbody td {
          background: #1f2a3c;
          color: #c7d2e0;
          border-color: #2a3a55;
        }

        .recordTemplateView {
          padding: 0 14px 16px;
        }
        .recordTemplateMeta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 16px 6px 14px;
          border-bottom: 1px solid rgba(127,148,168,.24);
        }
        .recordTemplateMeta > div:first-child {
          display: grid;
          gap: 4px;
        }
        .recordTemplateMeta strong {
          color: #2a3a55;
          font-size: 16px;
          font-weight: 900;
        }
        .recordTemplateMeta span {
          color: #6b7789;
          font-size: 11px;
        }
        .recordTemplateTeacher {
          display: grid;
          grid-template-columns: auto auto;
          grid-template-columns: 54px minmax(120px, auto);
          gap: 6px 8px;
          min-width: 245px;
          text-align: left;
          align-items: baseline;
        }

        .recordTemplateTeacher span {
          text-align: left;
          font-size: 11px;
          font-weight: 800;
          color: #6b7789;
        }

        .recordTemplateTeacher strong {
          text-align: left;
          font-size: 12px;
          font-weight: 800;
          color: #2a3a55;
          white-space: normal;
        }

        .recordTemplateTeacher strong {
          font-size: 12px;
        }
        .recordTemplateScroller {
          overflow: auto;
          border-radius: 16px;
          background: #edf1f7;
          box-shadow: none;
        }
        .recordTemplateTable {
          min-width: 1500px;
          width: 100%;
          border-collapse: collapse;
        }
        .recordTemplateTable th,
        .recordTemplateTable td {
          border: 1px solid rgba(104,125,145,.34);
          padding: 9px 8px;
          text-align: center;
          vertical-align: middle;
          font-size: 12px;
        }
        .recordTemplateTable th {
          background: #dce3ec;
          color: #2a3a55;
          font-weight: 900;
        }
        .classRecordTitleRow th {
          height: 27px;
          padding: 2px 8px !important;
          background: #98a2b3 !important;
          color: #ffffff !important;
          font-size: 18px !important;
          line-height: 1 !important;
          text-align: right !important;
          letter-spacing: -.2px;
          border-color: #6b7789 !important;
        }

        .classRecordLanguageRow th {
          background: #e8f0ea !important;
          color: #1f2a3c !important;
          font-size: 14px !important;
          font-weight: 900 !important;
        }

        .classRecordLanguageRow th:first-child,
        .classRecordLanguageRow th:nth-child(2),
        .classRecordLanguageRow th:nth-child(3),
        .classRecordLanguageRow th:nth-child(4) {
          background: #fafafa !important;
        }

        .classRecordGroupRow th {
          background: #e8f0ea !important;
          color: #1f2a3c !important;
          font-size: 12px !important;
          line-height: 1.05 !important;
        }

        .classRecordSubheadRow th {
          background: #e8f0ea !important;
          color: #1f2a3c !important;
          font-size: 12px !important;
          line-height: 1.1 !important;
        }

        .classRecordTable th,
        .classRecordTable td {
          border-color: #6b7789 !important;
        }

        html[data-crl-theme="dark"] .classRecordTitleRow th {
          background: #6b7789 !important;
          color: #ffffff !important;
          border-color: #46536b !important;
        }

        html[data-crl-theme="dark"] .classRecordLanguageRow th,
        html[data-crl-theme="dark"] .classRecordGroupRow th,
        html[data-crl-theme="dark"] .classRecordSubheadRow th {
          background: #d7e6dd !important;
          color: #1f2a3c !important;
          border-color: #6b7789 !important;
        }

        .recordTemplateTable thead tr:first-child th {
          background: #c7d2e0;
        }
        .recordTemplateTable tbody td {
          background: #edf1f7;
          color: #2a3a55;
        }
        .recordTemplateTable tbody tr:nth-child(even) td {
          background: #edf1f7;
        }
        .classRecordTable th:nth-child(n+11) {
          background: #e8f0ea;
        }
        .classRecordTable th:nth-child(5),
        .classRecordTable th:nth-child(6),
        .classRecordTable th:nth-child(7),
        .classRecordTable th:nth-child(8),
        .classRecordTable th:nth-child(9),
        .classRecordTable th:nth-child(10) {
          background: #edf1f7;
        }
        .templateSpacerCell {
          min-width: 34px;
        }
        html[data-crl-theme="dark"] .summaryDetailTitle,
        html[data-crl-theme="dark"] .summaryMetricCard {
          background: #1f2a3c;
          border-color: #2a3a55;
        }

        html[data-crl-theme="dark"] .summaryDetailTitle,
        html[data-crl-theme="dark"] .summaryMetricTitle {
          color: #edf1f7;
          border-color: #2a3a55;
        }

        html[data-crl-theme="dark"] .summaryDetailTable th {
          background: #2a3a55;
          color: #fafafa;
          border-color: #2a3a55;
        }

        html[data-crl-theme="dark"] .summaryDetailTable thead tr:nth-child(2) th {
          background: #2a3a55;
          color: #dce3ec;
        }

        html[data-crl-theme="dark"] .summaryDetailTable td {
          background: #1f2a3c;
          color: #c7d2e0;
          border-color: #2a3a55;
        }

        html[data-crl-theme="dark"] .summaryMetricRow {
          color: #98a2b3;
          border-color: #2a3a55;
        }

        html[data-crl-theme="dark"] .summaryMetricRow strong {
          color: #7f9dc4;
        }

        html[data-crl-theme="dark"] .recordTemplateMeta strong {
          color: #edf1f7;
        }
        html[data-crl-theme="dark"] .recordTemplateMeta span {
          color: #98a2b3;
        }
        html[data-crl-theme="dark"] .recordTemplateScroller {
          background: #1f2a3c;
          box-shadow: none;
        }
        html[data-crl-theme="dark"] .recordTemplateTable th {
          background: #1f2a3c;
          color: #c7d2e0;
          border-color: #2a3a55;
        }
        html[data-crl-theme="dark"] .recordTemplateTable thead tr:first-child th {
          background: #2a3a55;
        }
        html[data-crl-theme="dark"] .recordTemplateTable tbody td,
        html[data-crl-theme="dark"] .recordTemplateTable tbody tr:nth-child(even) td {
          background: #1f2a3c;
          color: #c7d2e0;
          border-color: #2a3a55;
        }

        .manageAssessmentPanel,
        .analyticsMainPanel,
        .profileMainPanel {
          margin-top: clamp(30px, 10vh, 120px);
          margin-bottom: clamp(26px, 8vh, 96px);
        }

        .manageAssessmentPanel {
          min-height: min(650px, calc(100vh - 170px));
        }

        .analyticsMainPanel .panelHeaderTitle {
          font-size: 20px !important;
          line-height: 1.2;
          font-weight: 900;
          letter-spacing: -0.2px;
        }

        .analyticsMainPanel .analyticsCard h3 {
          font-size: 15px !important;
          font-weight: 900;
        }

        .analyticsMainPanel .analyticsValue {
          font-size: 30px !important;
          font-weight: 900;
        }

        .analyticsMainPanel .analyticsMuted,
        .analyticsMainPanel .barTop,
        .analyticsMainPanel .barRow {
          font-size: 12px;
        }

        .analyticsMainPanel .barTop {
          font-weight: 800;
        }

        .analyticsMainPanel {
          min-height: min(520px, calc(100vh - 170px));
        }

        .profileMainPanel {
          width: min(980px, calc(100% - 24px));
          margin-left: auto;
          margin-right: auto;
          min-height: min(420px, calc(100vh - 180px));
        }

        .profileMainPanel .profileLabel {
          font-size: 12px;
        }

        .profileMainPanel .profileValue {
          font-size: 16px;
        }

        .profileMainPanel .profileItem {
          min-height: 92px;
          padding: 20px;
        }

        html[data-crl-theme="dark"] .manageAssessmentPanel .panelHeaderSub,
        html[data-crl-theme="dark"] .analyticsMainPanel .panelHeaderSub {
          color: #98a2b3;
        }

        /* Final sidebar and layout refinement */
        :root {
          --crl-sidebar-open-width: 332px;
          --crl-sidebar-collapsed-width: 0px;
        }

        .sidebar {
          width: var(--crl-sidebar-open-width) !important;
          transition:
            width .46s cubic-bezier(.22,1,.36,1),
            background-color .46s cubic-bezier(.22,1,.36,1),
            box-shadow .46s cubic-bezier(.22,1,.36,1);
        }

        .sidebar.open {
          width: var(--crl-sidebar-open-width) !important;
        }

        .sidebar.collapsed {
          width: var(--crl-sidebar-collapsed-width) !important;
          min-width: 0 !important;
          background: transparent !important;
          box-shadow: 0 1px 2px rgba(26,43,76,.05);
          border: 0 !important;
        }

        .sidebar.collapsed > *:not(.sidebarToggle) {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          user-select: none !important;
        }

        .main {
          margin-left: 344px !important;
          transition:
            margin-left .46s cubic-bezier(.22,1,.36,1),
            background-color .46s cubic-bezier(.22,1,.36,1);
        }

        .sidebar.collapsed + .main {
          margin-left: 0 !important;
        }

        .sidebarToggle {
          position: fixed !important;
          top: 50% !important;
          left: 312px !important;
          right: auto !important;
          width: 44px !important;
          height: 44px !important;
          padding: 0 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: 1px solid rgba(255,255,255,.38) !important;
          border-radius: 50% !important;
          background: rgba(224,235,244,.72) !important;
          -webkit-backdrop-filter: blur(7px);
          backdrop-filter: blur(7px);
          color: #1a2b4c !important;
          box-shadow: none;
          transform: translateY(-50%) !important;
          z-index: 120 !important;
          transition:
            left .46s cubic-bezier(.22,1,.36,1),
            width .34s cubic-bezier(.22,1,.36,1),
            height .34s cubic-bezier(.22,1,.36,1),
            background-color .34s ease,
            color .34s ease,
            box-shadow .34s ease,
            opacity .28s ease !important;
        }

        .sidebarToggle:hover {
          transform: translateY(calc(-50% - 2px)) !important;
        }

        .sidebarToggle:active {
          transform: translateY(calc(-50% + 1px)) scale(.95) !important;
        }

        .sidebar.collapsed .sidebarToggle {
          left: 10px !important;
          width: 52px !important;
          height: 52px !important;
          background: rgba(35,77,111,.82) !important;
          color: #edf1f7 !important;
          border-color: rgba(150,201,240,.34) !important;
          box-shadow: none;
        }

        .sidebarToggleGlyph {
          font-size: 28px !important;
          font-weight: 900 !important;
          line-height: 1 !important;
        }

        .brandThemeSwitch {
          top: 6px !important;
          right: 18px !important;
        }

        .brandThemeSwitch .themeSwitchTrack {
          transition:
            background-color .55s cubic-bezier(.22,1,.36,1),
            box-shadow .55s cubic-bezier(.22,1,.36,1) !important;
        }

        .brandThemeSwitch .themeSwitchThumb {
          transition:
            transform .58s cubic-bezier(.22,1,.36,1),
            background-color .42s ease,
            color .34s ease,
            box-shadow .42s ease !important;
        }

        .brandThemeSwitch.isLight .themeSwitchThumb {
          transform: translateX(0) !important;
        }

        .brandThemeSwitch.isDark .themeSwitchThumb {
          transform: translateX(28px) !important;
        }

        html[data-crl-theme="dark"] .sidebarToggle {
          background: rgba(26,43,76,.82) !important;
          color: #7f9dc4 !important;
          border-color: rgba(112,157,194,.36) !important;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .sidebar.collapsed .sidebarToggle {
          background: rgba(35,77,111,.90) !important;
          color: #edf1f7 !important;
          box-shadow: none;
        }

        .manageAssessmentPanel {
          margin-top: clamp(20px, 5vh, 64px) !important;
          margin-bottom: clamp(30px, 8vh, 92px) !important;
        }

        .analyticsMainPanel,
        .profileMainPanel {
          margin-top: clamp(34px, 10vh, 118px) !important;
          margin-bottom: clamp(30px, 8vh, 92px) !important;
        }

        .profileMainPanel {
          width: min(980px, calc(100% - 32px)) !important;
        }

        .profileMainPanel .profileItem {
          min-height: 96px !important;
        }

        .profileMainPanel .profileLabel {
          font-size: 12px !important;
        }

        .profileMainPanel .profileValue {
          font-size: 17px !important;
        }

        html[data-crl-theme="dark"] .templateSummaryTable thead th {
          color: #fafafa !important;
          background: #2a3a55 !important;
          border-color: #46536b !important;
          text-shadow: none;
        }

        html[data-crl-theme="dark"] .templateSummaryTable thead tr:first-child th {
          color: #ffffff !important;
          background: #2a3a55 !important;
        }

        @media (max-width: 880px) {
          .sidebar.open {
            width: min(332px, 88vw) !important;
          }

          .main {
            margin-left: min(344px, calc(88vw + 12px)) !important;
          }

          .sidebar.open .sidebarToggle {
            left: min(calc(88vw - 20px), 312px) !important;
          }
        }

        @media (max-width: 760px) {
          .sidebar.open {
            width: min(332px, 86vw) !important;
          }

          .main,
          .sidebar.collapsed + .main {
            margin-left: 0 !important;
          }

          .sidebar.open + .main {
            margin-left: min(344px, calc(86vw + 12px)) !important;
          }

          .sidebar.open .sidebarToggle {
            left: min(calc(86vw - 20px), 312px) !important;
          }
        }

        /* Final sidebar geometry and motion override */
        :root {
          --crl-sidebar-width: 415px;
        }

        .sidebar {
          width: var(--crl-sidebar-width) !important;
          min-width: 0 !important;
          overflow: visible !important;
          transition:
            width .52s cubic-bezier(.22,1,.36,1),
            background-color .42s ease,
            box-shadow .42s ease !important;
        }

        .sidebar.open {
          width: var(--crl-sidebar-width) !important;
        }

        .sidebar.collapsed {
          width: 0 !important;
          min-width: 0 !important;
          overflow: visible !important;
          background: transparent !important;
          border-right: 0 !important;
          box-shadow: 0 1px 2px rgba(26,43,76,.05);
        }

        .sidebar.collapsed > *:not(.sidebarToggle) {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          width: 0 !important;
        }

        .main {
          margin-left: calc(var(--crl-sidebar-width) + 12px) !important;
          transition:
            margin-left .52s cubic-bezier(.22,1,.36,1),
            background-color .42s ease !important;
        }

        .sidebar.collapsed + .main {
          margin-left: 0 !important;
        }

        .sidebarToggle {
          position: fixed !important;
          top: calc(50% + 78px) !important;
          left: calc(var(--crl-sidebar-width) - 22px) !important;
          width: 44px !important;
          height: 44px !important;
          min-width: 44px !important;
          min-height: 44px !important;
          margin: 0 !important;
          padding: 0 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 50% !important;
          background: rgba(213,227,239,.68) !important;
          border: 1px solid rgba(255,255,255,.58) !important;
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          box-shadow: none;
          transform: translateY(-50%) !important;
          z-index: 999 !important;
          transition:
            left .52s cubic-bezier(.22,1,.36,1),
            width .34s cubic-bezier(.22,1,.36,1),
            height .34s cubic-bezier(.22,1,.36,1),
            background-color .34s ease,
            color .34s ease,
            box-shadow .34s ease,
            opacity .26s ease !important;
        }

        .sidebarToggle:hover {
          transform: translateY(calc(-50% - 2px)) !important;
        }

        .sidebarToggle:active {
          transform: translateY(calc(-50% + 1px)) scale(.95) !important;
        }

        .sidebar.collapsed .sidebarToggle {
          left: 12px !important;
          width: 56px !important;
          height: 56px !important;
          min-width: 56px !important;
          min-height: 56px !important;
          background: rgba(35,77,111,.86) !important;
          color: #edf1f7 !important;
          border-color: rgba(150,201,240,.38) !important;
          box-shadow: none;
        }

        .sidebarToggleGlyph {
          font-size: 30px !important;
          line-height: 1 !important;
          font-weight: 900 !important;
        }

        .sidebar.open .sidebarToggle {
          left: calc(var(--crl-sidebar-width) - 22px) !important;
        }

        .brandBlock {
          width: 100% !important;
          box-sizing: border-box !important;
        }

        .nav {
          width: 100% !important;
          box-sizing: border-box !important;
          padding-right: 24px !important;
        }

        .navButton {
          width: 100% !important;
        }

        @media (max-width: 880px) {
          :root {
            --crl-sidebar-width: min(360px, 88vw);
          }

          .main {
            margin-left: calc(var(--crl-sidebar-width) + 10px) !important;
          }

          .sidebar.collapsed + .main {
            margin-left: 0 !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sidebar,
          .main,
          .sidebarToggle {
            transition-duration: .01ms !important;
          }
        }

        .recordsMainPanel {
          margin-top: clamp(22px, 10vh, 120px);
          margin-bottom: clamp(24px, 8vh, 96px);
        }

        .recordsMainPanel .summaryTableWrap {
          border-radius: 14px;
        }

        html[data-crl-theme="dark"] .templateSummaryTable thead th {
          background: #2a3a55 !important;
          color: #fafafa !important;
          border-color: #2a3a55 !important;
          text-shadow: none;
        }

        html[data-crl-theme="dark"] .templateSummaryTable thead tr:first-child th {
          background: #2a3a55 !important;
          color: #ffffff !important;
        }

        html[data-crl-theme="dark"] .templateSummaryTable tbody td {
          color: #dce3ec !important;
        }

        .brandThemeSwitch {
          position: absolute;
          top: 10px;
          right: 18px;
          margin: 0;
          width: 62px;
          height: 32px;
        }

        .brandThemeSwitch .themeSwitchTrack {
          width: 56px;
          height: 28px;
          padding: 2px;
        }

        .brandThemeSwitch .themeSwitchThumb {
          top: 2px;
          left: 2px;
          width: 24px;
          height: 24px;
          font-size: 14px;
        }

        .brandThemeSwitch .themeSwitchTrack {
          transition:
            background-color .55s cubic-bezier(.22,1,.36,1),
            box-shadow .55s cubic-bezier(.22,1,.36,1);
        }

        .brandThemeSwitch .themeSwitchThumb {
          transition:
            transform .52s cubic-bezier(.22,1,.36,1),
            background-color .45s ease,
            color .35s ease,
            box-shadow .45s ease;
        }


        .brandThemeSwitch.isLight .themeSwitchThumb {
          transform: translateX(0);
        }

        .brandThemeSwitch.isDark .themeSwitchThumb {
          transform: translateX(28px);
        }

        .brandThemeSwitch.isLight:hover .themeSwitchThumb {
          transform: translateY(-1px);
        }

        .brandThemeSwitch.isDark:hover .themeSwitchThumb {
          transform: translate(28px, -1px);
        }

        .brandThemeSwitch.isLight:active .themeSwitchThumb {
          transform: translateY(1px) scale(.95);
        }

        .brandThemeSwitch.isDark:active .themeSwitchThumb {
          transform: translate(28px, 1px) scale(.95);
        }

        .brandThemeSwitch.isLight .themeSwitchTrack {
          background: #dce3ec;
          box-shadow: none;
        }

        .brandThemeSwitch.isLight .themeSwitchThumb {
          background: #ffffff;
          color: #a9762f;
          box-shadow: none;
        }

        .brandThemeSwitch.isDark .themeSwitchTrack {
          background: #1a2b4c;
          border: 1px solid #2a3a55;
          box-shadow: none;
        }

        .brandThemeSwitch.isDark .themeSwitchThumb {
          background: #4a6fa5;
          color: #dce4ef;
          box-shadow: none;
        }

        .brandThemeSwitch:focus-visible {
          outline: 2px solid rgba(111,173,231,.55);
          outline-offset: 3px;
          border-radius: 999px;
        }

        .sidebarToggle {
          position: fixed;
          top: 50%;
          right: auto;
          left: 315px;
          width: 38px;
          height: 38px;
          transform: translateY(-50%);
          z-index: 95;
        }

        .sidebar.collapsed .sidebarToggle {
          left: 55px;
        }

        .sidebarToggle:hover {
          transform: translateY(calc(-50% - 2px));
        }

        .sidebarToggle:active {
          transform: translateY(calc(-50% + 1px)) scale(.96);
        }

        html[data-crl-theme="dark"] .brandThemeSwitch .themeSwitchTrack {
          background: #1a2b4c;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .brandThemeSwitch .themeSwitchThumb {
          background: #4a6fa5;
          color: #dce4ef;
          box-shadow: none;
        }

        html[data-crl-theme="light"] .brandThemeSwitch .themeSwitchTrack {
          background: #dce3ec;
          box-shadow: none;
        }

        html[data-crl-theme="light"] .brandThemeSwitch .themeSwitchThumb {
          background: #ffffff;
          color: #a9762f;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .sidebarToggle {
          background: #1f2a3c;
          color: #7f9dc4;
          box-shadow: none;
        }

        /* Final interaction polish: fixed navigation, tactile buttons, and spacious multi-entry modal. */
        .bulkDeleteConfirmModal {
          width: min(520px, 92vw);
        }

        .bulkDeleteConfirmBody {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          min-height: 150px;
        }

        .bulkDeleteIcon {
          width: 46px;
          height: 46px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 15px;
          background: #edf1f7;
          color: #c0392b;
          font-size: 24px;
          font-weight: 900;
          box-shadow: none;
        }

        .bulkDeleteConfirmBody h3 {
          margin: 2px 0 7px;
          color: #2a3a55;
          font-size: 15px;
        }

        .bulkDeleteConfirmBody p {
          margin: 0;
          color: #6b7789;
          font-size: 11px;
          line-height: 1.7;
        }

        .bulkDeleteConfirmButton {
          background: #c0392b !important;
          color: #ffffff !important;
        }

        .conductLearnerPanelEmpty {
          min-height: min(590px, calc(100vh - 150px));
          margin-top: clamp(12px, 6vh, 64px);
          margin-bottom: clamp(12px, 6vh, 64px);
          display: flex;
          flex-direction: column;
        }

        .conductLearnerPanelEmpty .learnerEmptyState {
          min-height: 0;
          flex: 1;
        }

        .learnerEmptyState {
          min-height: 360px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 20px;
        }

        .learnerEmptyState .emptyIcon {
          margin-bottom: 14px;
        }

        .learnerRosterLoading {
          min-height: 360px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px 20px;
          color: #6b7789;
          font-size: 11px;
          font-weight: 800;
        }

        .learnerRosterSpinner {
          width: 28px;
          height: 28px;
          border: 2px solid #d5dee9;
          border-top-color: #4a6fa5;
          border-radius: 50%;
          animation: spin .8s linear infinite;
        }

                .themeSwitchButton {
          width: 72px;
          height: 36px;
          margin: 20px auto 10px;
          padding: 0;
          border: 0;
          background: transparent;
          cursor: pointer;
          display: grid;
          place-items: center;
        }
        .themeSwitchTrack {
          position: relative;
          width: 64px;
          height: 32px;
          padding: 3px;
          border-radius: 999px;
          background: #dce3ec;
          box-shadow: none;
          transition: background .35s ease, box-shadow .35s ease;
        }
        .themeSwitchThumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 26px;
          height: 26px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #ffffff;
          color: #a9762f;
          font-size: 15px;
          font-weight: 900;
          box-shadow: none;
          transition: transform .38s cubic-bezier(.22,1,.36,1), color .25s ease, background .35s ease;
        }
        .themeSwitchButton.isDark .themeSwitchTrack {
          background: #1f2a3c;
          box-shadow: none;
        }
        .themeSwitchButton.isDark .themeSwitchThumb {
          transform: translateX(32px);
          background: #1f2a3c;
          color: #7f9dc4;
          box-shadow: none;
        }
        .themeSwitchButton:hover .themeSwitchThumb { transform: translateY(-1px); }
        .themeSwitchButton.isDark:hover .themeSwitchThumb { transform: translate(32px,-1px); }
        .themeSwitchButton:active .themeSwitchThumb { transform: translateY(1px) scale(.95); }
        .themeSwitchButton.isDark:active .themeSwitchThumb { transform: translate(32px,1px) scale(.95); }

        .sidebar.collapsed .themeSwitchButton {
          margin-top: 20px;
          margin-bottom: 10px;
        }

        .exportGreenButton {
          background: #3e7a5e !important;
          color: #ffffff !important;
          box-shadow: none;
        }
        .exportGreenButton:hover {
          background: #3e7a5e !important;
          color: #ffffff !important;
          box-shadow: none;
        }

        .recordViewTab,
        .periodTab,
        .activityTab {
          transition: transform .18s ease, box-shadow .22s ease, background .32s ease, color .32s ease;
        }

        .manageAssessmentPanel .periodTab {
          min-height: 40px;
          min-width: 70px;
          padding: 0 16px;
          background: #edf1f7;
          color: #1a2b4c;
          font-weight: 900;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .manageAssessmentPanel .periodTab {
          background: #2a3a55;
          color: #dce4ef;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .manageAssessmentPanel .periodTab.active {
          background: #4a6fa5;
          color: #ffffff;
        }

        .activityTabs .activityTab {
          min-height: 46px;
          min-width: 78px;
          padding: 0 18px;
          font-size: 13px;
          font-weight: 900;
        }

        .recordsHeaderActions .recordViewTab,
        .recordsHeaderActions .periodTab {
          min-height: 40px;
          padding-left: 16px;
          padding-right: 16px;
          font-size: 13px;
          font-weight: 900;
        }

        html[data-crl-theme="dark"] .exportGreenButton {
          background: #3e7a5e !important;
          color: #ffffff !important;
        }
        html[data-crl-theme="dark"] .exportGreenButton:hover {
          background: #3e7a5e !important;
          color: #ffffff !important;
        }
        html[data-crl-theme="dark"] .recordViewTabs,
        html[data-crl-theme="dark"] .periodTabs,
        html[data-crl-theme="dark"] .activityTabs {
          background: #1f2a3c;
          border-color: #2a3a55;
        }
        html[data-crl-theme="dark"] .recordViewTab,
        html[data-crl-theme="dark"] .periodTab,
        html[data-crl-theme="dark"] .activityTab {
          background: #1f2a3c;
          color: #dce4ef;
          box-shadow: none;
        }
        html[data-crl-theme="dark"] .recordViewTab:hover,
        html[data-crl-theme="dark"] .periodTab:hover,
        html[data-crl-theme="dark"] .activityTab:hover {
          background: #2a3a55;
          color: #edf1f7;
        }
        html[data-crl-theme="dark"] .recordViewTab.active,
        html[data-crl-theme="dark"] .periodTab.active,
        html[data-crl-theme="dark"] .activityTab.active {
          background: #4a6fa5;
          color: #ffffff;
          box-shadow: none;
        }

        html,
        body,
        .teacherShell,
        .sidebar,
        .main,
        .brandBlock,
        .brandLogo,
        .brandText,
        .nav,
        .navButton,
        .panel,
        .toolbar,
        .tableWrap,
        .summaryTableWrap,
        .recordViewTabs,
        .periodTabs,
        .activityTabs,
        .statCard,
        .actionCard,
        .welcomeCard,
        .profileItem,
        .analyticsCard,
        .modal,
        .modalFooter,
        .formInput,
        .formSelect,
        .formTextarea,
        .searchInput,
        .selectInput,
        .sidebarLogout,
        .themeSwitchTrack,
        .themeSwitchThumb {
          transition:
            background-color .48s cubic-bezier(.22,1,.36,1),
            color .48s cubic-bezier(.22,1,.36,1),
            border-color .48s cubic-bezier(.22,1,.36,1),
            box-shadow .48s cubic-bezier(.22,1,.36,1),
            opacity .48s ease;
        }

        .teacherShell *,
        .teacherShell *::before,
        .teacherShell *::after {
          transition-timing-function: cubic-bezier(.22,1,.36,1);
        }

        html[data-crl-theme="dark"],
        html[data-crl-theme="dark"] body {
          background: #1f2a3c !important;
          color-scheme: dark;
        }

        html[data-crl-theme="dark"] .teacherShell,
        html[data-crl-theme="dark"] .main {
          background: #1f2a3c;
        }

        html[data-crl-theme="dark"] .sidebar,
        html[data-crl-theme="dark"] .brandBlock,
        html[data-crl-theme="dark"] .navButton,
        html[data-crl-theme="dark"] .sidebarLogout,
        html[data-crl-theme="dark"] .themeToggle,
        html[data-crl-theme="dark"] .welcomeCard,
        html[data-crl-theme="dark"] .actionCard,
        html[data-crl-theme="dark"] .statCard,
        html[data-crl-theme="dark"] .panel,
        html[data-crl-theme="dark"] .toolbar,
        html[data-crl-theme="dark"] .modal,
        html[data-crl-theme="dark"] .modalFooter,
        html[data-crl-theme="dark"] .profileItem,
        html[data-crl-theme="dark"] .analyticsCard,
        html[data-crl-theme="dark"] .recordViewTabs,
        html[data-crl-theme="dark"] .periodTabs,
        html[data-crl-theme="dark"] .activityTabs,
        html[data-crl-theme="dark"] .tableWrap,
        html[data-crl-theme="dark"] .summaryTableWrap,
        html[data-crl-theme="dark"] .learnerEntryRow,
        html[data-crl-theme="dark"] .deletingToast,
        html[data-crl-theme="dark"] .busyCard {
          background: #1f2a3c;
          color: #dce3ec;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .brandTitle,
        html[data-crl-theme="dark"] .pageTitle,
        html[data-crl-theme="dark"] .welcomeCard h2,
        html[data-crl-theme="dark"] .actionCard h3,
        html[data-crl-theme="dark"] .panelHeaderTitle,
        html[data-crl-theme="dark"] .modalHeader h2,
        html[data-crl-theme="dark"] .profileValue,
        html[data-crl-theme="dark"] .bulkDeleteConfirmBody h3,
        html[data-crl-theme="dark"] .busyCard strong,
        html[data-crl-theme="dark"] .importSuccessState strong {
          color: #edf1f7;
        }

        html[data-crl-theme="dark"] .brandSubtitle,
        html[data-crl-theme="dark"] .pageSub,
        html[data-crl-theme="dark"] .welcomeCard p,
        html[data-crl-theme="dark"] .actionCard p,
        html[data-crl-theme="dark"] .panelHeaderSub,
        html[data-crl-theme="dark"] .modalHeaderHint,
        html[data-crl-theme="dark"] .formLabel,
        html[data-crl-theme="dark"] .bulkDeleteConfirmBody p,
        html[data-crl-theme="dark"] .deletingToastCopy span,
        html[data-crl-theme="dark"] .busySubtext,
        html[data-crl-theme="dark"] .importSuccessState span {
          color: #98a2b3;
        }

        html[data-crl-theme="dark"] .searchInput,
        html[data-crl-theme="dark"] .selectInput,
        html[data-crl-theme="dark"] .formInput,
        html[data-crl-theme="dark"] .formSelect,
        html[data-crl-theme="dark"] .formTextarea {
          background: #1f2a3c;
          color: #edf1f7;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] th {
          background: #1f2a3c;
          color: #98a2b3;
        }

        html[data-crl-theme="dark"] td {
          color: #c7d2e0;
          border-color: #2a3a55;
        }

        html[data-crl-theme="dark"] tbody tr:hover td {
          background: #1f2a3c;
        }

        html[data-crl-theme="dark"] .modalOverlay {
          background: rgba(0, 0, 0, .60);
        }

        html[data-crl-theme="dark"] .busyOverlay {
          background: rgba(7, 11, 16, .62);
        }

        html[data-crl-theme="dark"] .classRecordDropZone,
        html[data-crl-theme="dark"] .importSuccessIcon,
        html[data-crl-theme="dark"] .bulkDeleteIcon,
        html[data-crl-theme="dark"] .learnerEntryNumber {
          background: #1f2a3c;
        }

        /* Import modal is portaled to document.body so fixed positioning always uses the viewport. */
        .importPortalRoot {
          position: static;
        }
        .importPortalRoot .modalOverlay {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          z-index: 1000;
        }


        .teacherShell { display: block; min-height: 100vh; }
        .sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          height: 100vh;
          min-height: 100vh;
          max-height: 100vh;
          overflow: visible;
          z-index: 80;
          flex: none;
        }
        .main {
          margin-left: 344px;
          min-height: 100vh;
          transition: margin-left .42s cubic-bezier(.22,1,.36,1);
        }
        .sidebar.collapsed + .main { margin-left: 90px; }
        .sidebar.open {
          width: 300px;
        }
        .sidebar.collapsed {
          width: 72px;
        }

        .toolbarButton, .smallButton, .recordViewTab, .periodTab, .secondaryButton, .dangerButton, .closeButton, .addRowButton, .iconDangerButton, .sidebarLogout, .navButton {
          position: relative;
          overflow: hidden;
          will-change: transform, box-shadow;
        }
        .toolbarButton::after, .smallButton::after, .recordViewTab::after, .periodTab::after, .secondaryButton::after, .dangerButton::after, .closeButton::after, .addRowButton::after, .iconDangerButton::after, .sidebarLogout::after, .navButton::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(115deg, transparent 0 36%, rgba(255,255,255,.18) 46%, transparent 58% 100%);
          transform: translateX(-120%);
          transition: transform .46s ease;
        }
        .toolbarButton:hover::after, .smallButton:hover::after, .recordViewTab:hover::after, .periodTab:hover::after, .secondaryButton:hover::after, .dangerButton:hover::after, .closeButton:hover::after, .addRowButton:hover::after, .iconDangerButton:hover::after, .sidebarLogout:hover::after, .navButton:hover::after {
          transform: translateX(120%);
        }
        .toolbarButton:hover, .smallButton:hover, .recordViewTab:hover, .periodTab:hover, .secondaryButton:hover, .dangerButton:hover, .closeButton:hover, .addRowButton:hover, .iconDangerButton:hover, .sidebarLogout:hover, .navButton:hover {
          background: inherit;
          color: inherit;
        }

        .toolbarButton.primaryBlueButton {
          background: #4a6fa5;
          color: #ffffff;
          box-shadow: none;
        }
        .toolbarButton.primaryBlueButton:hover {
          box-shadow: none;
          transform: translateY(-2px);
        }
        .toolbarButton.primaryBlueButton:active {
          transform: translateY(1px) scale(.99);
          box-shadow: none;
        }
        .toolbarButton.importGreenButton {
          background: #3e7a5e;
          color: #ffffff;
          box-shadow: none;
        }
        .toolbarButton.importGreenButton:hover {
          box-shadow: none;
          transform: translateY(-2px);
        }
        .toolbarButton.importGreenButton:active {
          transform: translateY(1px) scale(.99);
          box-shadow: none;
        }

        .multiLearnerModal { width: min(1120px, 96vw); }
        .multiLearnerBody { padding-top: 14px; }
        .modalHeaderHint { margin-top: 4px; color: #6b7789; font-size: 12px; }
        .bulkFormHeader { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 10px; color: #46536b; font-size: 12px; }
        .bulkFormHeader strong { color: #1a2b4c; }
        .learnerRowsScroller { max-height: 54vh; overflow: auto; display: grid; gap: 10px; padding: 5px 8px 8px 3px; }
        .learnerEntryRow {
          display: grid;
          grid-template-columns: 34px 1.05fr 1fr 1fr 1fr .7fr .6fr 38px;
          gap: 10px;
          align-items: start;
          padding: 12px;
          border-radius: 18px;
          background: #edf1f7;
          box-shadow: none;
        }
        .learnerEntryNumber { align-self: start; width: 28px; height: 28px; margin-top: 26px; display: grid; place-items: center; border-radius: 50%; background: #edf1f7; color: #1a2b4c; font-size: 12px; font-weight: 900; box-shadow: none; }
        .learnerEntryRow .formInput, .learnerEntryRow .formSelect { min-height: 44px; font-size: 13px; }
        .learnerLrnWarning { margin: 4px 0 0; color: #8d2f2f; font-size: 10px; font-weight: 700; line-height: 1.25; }
        .iconDangerButton { width: 36px; height: 36px; border: 0; border-radius: 12px; background: #edf1f7; color: #c0392b; cursor: pointer; box-shadow: none; transition: transform .18s ease, box-shadow .2s ease; }
        .learnerEntryRow > .iconDangerButton { align-self: start; margin-top: 26px; }
        .iconDangerButton:hover { transform: translateY(-2px); box-shadow: none; }
        .iconDangerButton:active { transform: translateY(1px) scale(.97); box-shadow: none; }
        .iconDangerButton:disabled { opacity: .42; cursor: not-allowed; transform: none; }
        .addRowButton { min-height: 42px; margin-top: 4px; padding: 0 16px; border: 0; border-radius: 14px; background: #edf1f7; color: #1a2b4c; font-size: 13px; font-weight: 900; cursor: pointer; box-shadow: none; transition: transform .18s ease, box-shadow .2s ease; }
        .addRowButton:hover { transform: translateY(-2px); box-shadow: none; }
        .addRowButton:active { transform: translateY(1px); box-shadow: none; }

        .deletingToast {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 400;
          min-width: 310px;
          max-width: min(380px, calc(100vw - 32px));
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 14px 16px;
          border-radius: 18px;
          background: #edf1f7;
          color: #2a3a55;
          box-shadow: none;
          animation: toastIn .22s ease;
        }
        .deletingToastIcon { width: 32px; height: 32px; flex: 0 0 auto; border-radius: 50%; display: grid; place-items: center; background: #edf1f7; box-shadow: none; }
        .deletingToastIcon span { width: 13px; height: 13px; border: 2px solid rgba(47,115,201,.25); border-top-color: #4a6fa5; border-radius: 50%; animation: spin .8s linear infinite; }
        .deletingToastCopy { min-width: 0; display: grid; gap: 5px; }
        .deletingToastCopy strong { font-size: 13px; color: #1a2b4c; }
        .deletingToastCopy span { font-size: 11px; color: #6b7789; }
        .deletingProgressTrack { height: 6px; overflow: hidden; border-radius: 999px; background: rgba(161,180,201,.28); box-shadow: none; }
        .deletingProgressFill { height: 100%; border-radius: inherit; background: #4a6fa5; transition: width .18s ease; }

        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 980px) {
          .learnerEntryRow { grid-template-columns: 28px 1fr 1fr 1fr; }
          .learnerEntryRow .formGroup:nth-of-type(4), .learnerEntryRow .formGroup:nth-of-type(5), .learnerEntryRow .iconDangerButton { grid-column: span 1; }
        }
        @media (max-width: 760px) {
          .main, .sidebar.collapsed + .main { margin-left: 0; }
          .sidebar { position: fixed; }
          .sidebar.collapsed { width: 86px; }
          .sidebar.open { width: 286px; }
          .multiLearnerModal { width: min(96vw, 680px); }
          .learnerEntryRow { grid-template-columns: 28px 1fr 1fr; }
          .learnerEntryRow .formGroup { grid-column: span 1; }
          .learnerEntryRow .iconDangerButton { grid-column: 3; justify-self: end; }
        }
        @media (max-width: 560px) {
          .learnerEntryRow { grid-template-columns: 28px 1fr; }
          .learnerEntryRow .formGroup, .learnerEntryRow .iconDangerButton { grid-column: 2; }
          .learnerEntryRow .iconDangerButton { justify-self: start; margin-top: 0; }
          .deletingToast { right: 12px; bottom: 12px; min-width: 0; }
        }

        .classRecordDropZone {
          min-height: 260px;
          padding: 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 9px;
          text-align: center;
          border-radius: 22px;
          border: 2px dashed rgba(47,138,104,.38);
          background: #edf1f7;
          color: #2a3a55;
          box-shadow: none;
          cursor: pointer;
          transition: transform .18s ease, box-shadow .22s ease, border-color .22s ease;
        }
        .classRecordDropZone:hover {
          transform: translateY(-1px);
          border-color: rgba(47,138,104,.58);
          box-shadow: none;
        }
        .classRecordDropZone.dragActive {
          transform: scale(1.005);
          border-color: #3e7a5e;
          box-shadow: none;
        }
        .classRecordDropZone strong { font-size: 16px; color: #1a2b4c; }
        .classRecordDropZone span { font-size: 13px; color: #6b7789; }
        .classRecordDropZone small { font-size: 11px; color: #98a2b3; }
        .classRecordDropIcon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 18px; background: #edf1f7; color: #3e7a5e; font-size: 28px; font-weight: 900; box-shadow: none; margin-bottom: 2px; }

        .busyOverlay + .deletingToast { z-index: 500; }
        .activityTab:hover { background: inherit; color: inherit; transform: translateY(-1px); box-shadow: none; }
        .activityTab:active { transform: translateY(1px) scale(.99); box-shadow: none; }

        @media (max-width: 720px) {
          .classRecordDropZone { min-height: 220px; padding: 22px 16px; }
        }

        /* Home tab interaction refinement */
        .homeStatsGrid .statCard:hover {
          transform: none;
          border-color: transparent;
          box-shadow: none;
        }

        .homeStatsGrid .statCard:active {
          transform: none;
          box-shadow: none;
        }

        .latestLearnerOverview tbody tr:hover td {
          background: inherit;
        }

        .latestLearnerOverviewTable {
          border-radius: 0;
          box-shadow: none;
        }

        .latestLearnerOverviewTable table {
          border-radius: 0;
        }

        .latestLearnerOverviewTable thead th {
          border-radius: 0;
        }

        /* Final dark-mode control/interaction corrections */
        html[data-crl-theme="dark"] .navButton {
          background: #1f2a3c;
          color: #c7d2e0;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .navButton:hover {
          background: #1f2a3c;
          color: #dce4ef;
          transform: translateY(-1px);
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .navButton:active,
        html[data-crl-theme="dark"] .navButton.active,
        html[data-crl-theme="dark"] .navButton.active:hover,
        html[data-crl-theme="dark"] .navButton.active:active {
          background: #1f2a3c;
          color: #7f9dc4;
          transform: none;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .navButton.active {
          border-left: 0;
          position: relative;
        }

        html[data-crl-theme="dark"] .navButton.active::before {
          content: "";
          width: 4px;
          height: 22px;
          margin-right: 2px;
          border-radius: 999px;
          background: #4a6fa5;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .sidebarToggle {
          background: #1f2a3c;
          color: #7f9dc4;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .sidebarToggle:hover {
          background: #1f2a3c;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .sidebarToggle:active {
          background: #1f2a3c;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .sidebarLogout {
          background: #1f2a3c;
          color: #b5615a;
          border: 1px solid #9b2e22;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .sidebarLogout:hover {
          background: #1f2a3c;
          color: #b5615a;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .themeToggle {
          margin-top: 24px;
          background: #1f2a3c;
          color: #7f9dc4;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .themeToggle:hover {
          background: #1f2a3c;
          color: #dce4ef;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .toolbarButton.primaryBlueButton {
          background: #4a6fa5;
          color: #ffffff;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .toolbarButton.primaryBlueButton:hover {
          background: #4a6fa5;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .toolbarButton.importGreenButton {
          background: #3e7a5e;
          color: #ffffff;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .toolbarButton.importGreenButton:hover {
          background: #3e7a5e;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .toolbarButton,
        html[data-crl-theme="dark"] .smallButton,
        html[data-crl-theme="dark"] .recordViewTab,
        html[data-crl-theme="dark"] .periodTab,
        html[data-crl-theme="dark"] .secondaryButton,
        html[data-crl-theme="dark"] .closeButton,
        html[data-crl-theme="dark"] .addRowButton,
        html[data-crl-theme="dark"] .iconDangerButton,
        html[data-crl-theme="dark"] .activityTab {
          background: #1f2a3c;
          color: #dce4ef;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .toolbarButton:hover,
        html[data-crl-theme="dark"] .smallButton:hover,
        html[data-crl-theme="dark"] .recordViewTab:hover,
        html[data-crl-theme="dark"] .periodTab:hover,
        html[data-crl-theme="dark"] .secondaryButton:hover,
        html[data-crl-theme="dark"] .closeButton:hover,
        html[data-crl-theme="dark"] .addRowButton:hover,
        html[data-crl-theme="dark"] .iconDangerButton:hover,
        html[data-crl-theme="dark"] .activityTab:hover {
          background: #1f2a3c;
          color: #edf1f7;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .dangerButton,
        html[data-crl-theme="dark"] .redSmall,
        html[data-crl-theme="dark"] .iconDangerButton {
          color: #b5615a;
        }

        html[data-crl-theme="dark"] .dangerButton {
          background: #1f2a3c;
        }

        html[data-crl-theme="dark"] .bulkDeleteConfirmButton {
          background: #c0392b !important;
          color: #ffffff !important;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .profileItem,
        html[data-crl-theme="dark"] .analyticsCard,
        html[data-crl-theme="dark"] .welcomeCard,
        html[data-crl-theme="dark"] .actionCard,
        html[data-crl-theme="dark"] .statCard,
        html[data-crl-theme="dark"] .panel,
        html[data-crl-theme="dark"] .tableWrap,
        html[data-crl-theme="dark"] .summaryTableWrap,
        html[data-crl-theme="dark"] .learnerEntryRow {
          border-color: #2a3a55;
        }

        html[data-crl-theme="dark"] .multiLearnerModal,
        html[data-crl-theme="dark"] .multiLearnerModal .modalHeader,
        html[data-crl-theme="dark"] .multiLearnerModal .modalBody,
        html[data-crl-theme="dark"] .multiLearnerModal .modalFooter,
        html[data-crl-theme="dark"] .logoutModal,
        html[data-crl-theme="dark"] .logoutModal .modalHeader,
        html[data-crl-theme="dark"] .logoutModal .modalBody,
        html[data-crl-theme="dark"] .logoutModal .modalFooter {
          color: #edf1f7;
          background: #1f2a3c !important;
          border-color: #2a3a55 !important;
        }

        html[data-crl-theme="dark"] .multiLearnerModal .learnerEntryRow,
        html[data-crl-theme="dark"] .multiLearnerModal .addRowButton,
        html[data-crl-theme="dark"] .logoutModal .secondaryButton {
          background: #1f2a3c !important;
          color: #edf1f7 !important;
          border-color: #2a3a55 !important;
        }

        html[data-crl-theme="dark"] .multiLearnerModal .learnerEntryNumber {
          background: #2a3a55 !important;
          color: #edf1f7 !important;
        }

        html[data-crl-theme="dark"] .multiLearnerModal .formLabel {
          color: #dce4ef !important;
        }

        html[data-crl-theme="dark"] .modal .dangerButton {
          background: #9b2e22 !important;
          color: #ffffff !important;
          border-color: #c0392b !important;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .modal .dangerButton:hover {
          background: #c0392b !important;
          color: #ffffff !important;
        }

        html[data-crl-theme="dark"] .modal {
          background: #1f2a3c !important;
          color: #edf1f7 !important;
          border-color: #2a3a55 !important;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .modalHeader {
          border-bottom-color: #2a3a55 !important;
        }

        html[data-crl-theme="dark"] .modalHeader h2 {
          color: #fafafa !important;
        }

        html[data-crl-theme="dark"] .modalHeaderHint,
        html[data-crl-theme="dark"] .formLabel,
        html[data-crl-theme="dark"] .formHint,
        html[data-crl-theme="dark"] .modal p {
          color: #98a2b3 !important;
        }

        html[data-crl-theme="dark"] .formInput,
        html[data-crl-theme="dark"] .formSelect,
        html[data-crl-theme="dark"] .formTextarea,
        html[data-crl-theme="dark"] .searchInput,
        html[data-crl-theme="dark"] .selectInput {
          background: #1f2a3c !important;
          color: #edf1f7 !important;
          border-color: #1a2b4c !important;
        }

        html[data-crl-theme="dark"] .formInput:focus,
        html[data-crl-theme="dark"] .formSelect:focus,
        html[data-crl-theme="dark"] .formTextarea:focus {
          border-color: #4a6fa5 !important;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .formInput::placeholder,
        html[data-crl-theme="dark"] .formTextarea::placeholder {
          color: #6b7789 !important;
        }

        html[data-crl-theme="dark"] .modalFooter {
          background: #1f2a3c !important;
          border-top-color: #2a3a55 !important;
        }

        html[data-crl-theme="dark"] .closeButton {
          background: #1f2a3c !important;
          color: #edf1f7 !important;
          border-color: #2a3a55 !important;
        }

        html[data-crl-theme="dark"] .secondaryButton {
          background: #1f2a3c !important;
          color: #edf1f7 !important;
          border-color: #2a3a55 !important;
        }

        html[data-crl-theme="dark"] .toolbar {
          background: #1f2a3c;
          border-color: #2a3a55;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .searchInput::placeholder,
        html[data-crl-theme="dark"] .formInput::placeholder,
        html[data-crl-theme="dark"] .formTextarea::placeholder {
          color: #6b7789;
        }

        html[data-crl-theme="dark"] .emptyState h3 {
          color: #dce3ec;
        }

        html[data-crl-theme="dark"] .emptyState p {
          color: #6b7789;
        }

        html[data-crl-theme="dark"] .themeToggle:focus-visible,
        html[data-crl-theme="dark"] .navButton:focus-visible,
        html[data-crl-theme="dark"] .sidebarToggle:focus-visible {
          outline: 2px solid rgba(111,173,231,.55);
          outline-offset: 3px;
        }

        .themeToggle {
          margin-top: 24px;
        }

        /* Refined learner row number badge */
        .learnerEntryNumber {
          align-self: center !important;
          width: 30px !important;
          height: 30px !important;
          display: grid !important;
          place-items: center !important;
          border-radius: 50% !important;
          background: #edf1f7 !important;
          color: #2a3a55 !important;
          border: 1px solid rgba(195,211,225,.65) !important;
          font-size: 12px !important;
          font-weight: 900 !important;
          line-height: 1 !important;
          box-shadow: none;
          transition:
            background-color .34s ease,
            color .34s ease,
            box-shadow .34s ease,
            transform .18s ease !important;
        }

        .learnerEntryRow:hover .learnerEntryNumber {
          transform: translateY(-1px);
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .learnerEntryNumber {
          background: #1f2a3c !important;
          color: #dce4ef !important;
          border-color: #2a3a55 !important;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .learnerEntryRow:hover .learnerEntryNumber {
          background: #1f2a3c !important;
          color: #dce4ef !important;
          box-shadow: none;
        }

        /* Premium teacher profile + security cards */
        .fancyProfilePanel,
        .securityPrivacyPanel {
          overflow: hidden;
        }

        .profileHeaderFancy {
          align-items: center;
          padding: 28px 26px !important;
          min-height: 148px;
        }

        .profileIdentity {
          display: flex;
          align-items: center;
          gap: 18px;
          min-width: 0;
        }

        .profileAvatar {
          width: 82px;
          height: 82px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #fafafa;
          color: #4a6fa5;
          font-size: 32px;
          font-weight: 950;
          border: 2px solid #dce3ec;
          box-shadow: none;
        }

        .profileUsername {
          margin-bottom: 5px;
          color: #6b7789;
          font-size: 15px;
          line-height: 1.15;
          font-weight: 900;
          letter-spacing: .03em;
        }

        .profileDisplayName {
          color: #2a3a55;
          font-size: 30px;
          line-height: 1.08;
          font-weight: 950;
          letter-spacing: -.02em;
        }

        .profileMetaLine {
          margin-top: 7px;
          color: #6b7789;
          font-size: 13px;
          font-weight: 750;
        }

        .fancyProfilePanel {
          min-height: 0;
          margin-bottom: 0 !important;
        }

        .securityPrivacyPanel {
          margin-top: 14px !important;
          margin-bottom: 14px !important;
          background:
            linear-gradient(145deg, rgba(247,251,255,.98), rgba(226,237,247,.98)) !important;
          border: 1px solid rgba(205,220,234,.92);
          box-shadow: none;
        }

        .securityPrivacyPanel .panelHeader {
          padding: 24px 24px 18px !important;
          align-items: center;
          border-bottom: 1px solid rgba(211,225,237,.80);
        }

        .securityPrivacyPanel .panelHeaderTitle {
          font-size: 22px !important;
          line-height: 1.15;
          font-weight: 950 !important;
          letter-spacing: -.3px;
        }

        .securitySubtitle {
          margin-top: 6px;
          color: #6b7789;
          font-size: 13px;
          line-height: 1.55;
          font-weight: 650;
        }

        .securityStatusPill,
        .securityMiniStatus {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          font-weight: 950;
        }

        .securityStatusPill {
          min-height: 40px;
          padding: 0 16px;
          font-size: 12px;
          letter-spacing: .01em;
          box-shadow: none;
        }

        .securityStatusPill.enabled,
        .securityMiniStatus.verified {
          background: #e8f0ea;
          color: #2f5f49;
          border: 1px solid #d7e6dd;
        }

        .securityStatusPill.attention,
        .securityMiniStatus.pending {
          background: #f5ede0;
          color: #835b24;
          border: 1px solid #e3d3a0;
        }

        .securityGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          padding: 10px 18px 20px;
        }

        .securityCard {
          display: flex;
          gap: 16px;
          padding: 21px;
          border: 1px solid #dce3ec;
          border-radius: 19px;
          background: #fafafa;
          box-shadow: none;
          transition: transform .18s ease, box-shadow .18s ease;
        }

        .securityCard:hover {
          transform: translateY(-2px);
          box-shadow: none;
        }

        .securityCardIcon {
          width: 50px;
          height: 50px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 16px;
          background: #edf1f7;
          font-size: 23px;
          box-shadow: none;
        }

        .securityCardBody {
          min-width: 0;
          flex: 1;
        }

        .securityCardTitle {
          color: #2a3a55;
          font-size: 17px;
          line-height: 1.2;
          font-weight: 950;
        }

        .securityCardText {
          margin-top: 7px;
          color: #46536b;
          font-size: 14px;
          line-height: 1.55;
          font-weight: 650;
        }

        .securityCardHint {
          margin-top: 8px;
          color: #6b7789;
          font-size: 11px;
          line-height: 1.55;
          font-weight: 650;
        }

        .securityActionRow {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-top: 11px;
        }

        .securityAction {
          min-height: 42px !important;
          font-size: 12px !important;
          font-weight: 900 !important;
        }

        .securityMiniStatus {
          min-height: 31px;
          padding: 0 11px;
          font-size: 11px;
        }

        .securityCodeInput {
          width: 150px !important;
          min-height: 38px !important;
          text-align: center;
          letter-spacing: .18em;
          font-weight: 900;
        }

        .twoFactorSetupBox {
          margin: 0 20px 18px;
          padding: 17px;
          border: 1px solid #c7d2e0;
          border-radius: 16px;
          background: #edf1f7;
          box-shadow: none;
        }

        .twoFactorSetupTitle {
          color: #2a3a55;
          font-size: 15px;
          font-weight: 950;
        }

        .twoFactorSetupTitle.verify {
          margin-top: 16px;
        }

        .twoFactorSetupBox p {
          margin: 6px 0 10px;
          color: #6b7789;
          font-size: 11px;
          line-height: 1.55;
        }

        .twoFactorSecret {
          margin-bottom: 9px;
          padding: 11px 12px;
          overflow-x: auto;
          border: 1px dashed #7f9dc4;
          border-radius: 11px;
          background: #fafafa;
          color: #4a6fa5;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: .13em;
          word-break: break-all;
        }

        html[data-crl-theme="dark"] .profileAvatar {
          background: #1f2a3c;
          color: #7f9dc4;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .profileUsername {
          color: #6b7789;
        }

        html[data-crl-theme="dark"] .profileDisplayName,
        html[data-crl-theme="dark"] .profileMetaLine,
        html[data-crl-theme="dark"] .securityCardTitle,
        html[data-crl-theme="dark"] .twoFactorSetupTitle {
          color: #dce3ec;
        }

        html[data-crl-theme="dark"] .securitySubtitle,
        html[data-crl-theme="dark"] .securityCardText,
        html[data-crl-theme="dark"] .securityCardHint,
        html[data-crl-theme="dark"] .twoFactorSetupBox p {
          color: #98a2b3;
        }

        html[data-crl-theme="dark"] .fancyProfileItem,
        html[data-crl-theme="dark"] .securityCard,
        html[data-crl-theme="dark"] .securityCardIcon,
        html[data-crl-theme="dark"] .twoFactorSetupBox {
          background: #1f2a3c !important;
          border-color: #2a3a55 !important;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .twoFactorSecret,
        html[data-crl-theme="dark"] .securityCodeInput {
          background: #1f2a3c !important;
          color: #edf1f7 !important;
          border-color: #2a3a55 !important;
        }

        @media (max-width: 768px) {
          .securityPrivacyPanel {
            margin-top: 14px !important;
          }

          .securityGrid {
            grid-template-columns: 1fr;
          }

          .profileHeaderFancy {
            padding: 22px 18px !important;
            min-height: 128px;
          }

          .profileIdentity {
            align-items: center;
            gap: 14px;
          }

          .profileAvatar {
            width: 64px;
            height: 64px;
            font-size: 25px;
          }

          .profileUsername {
            font-size: 13px;
          }

          .profileDisplayName {
            font-size: 23px;
          }

          .profileMetaLine {
            font-size: 11px;
          }
        }

        /* Elaborate 2FA setup overlay */
        .twoFactorSetupModal {
          width: clamp(640px, 70vw, 920px);
          max-width: calc(100vw - 28px);
          height: min(760px, calc(100dvh - 28px));
          max-height: calc(100dvh - 28px);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border: 1px solid rgba(194,216,233,.95);
          border-radius: 24px !important;
          background:
            radial-gradient(circle at 12% 0%, rgba(255,255,255,.98), transparent 31%),
            #fafafa;
          box-shadow: none;
        }

        .twoFactorModalHeader {
          flex: 0 0 auto;
          padding: 22px 28px 18px !important;
          align-items: flex-start !important;
          background: linear-gradient(180deg, rgba(255,255,255,.58), rgba(237,245,251,.18));
          border-bottom: 1px solid rgba(210,225,237,.8);
        }

        .twoFactorEyebrow {
          margin-bottom: 7px;
          color: #4a6fa5;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .17em;
        }

        .twoFactorModalHeader h2 {
          margin: 0;
          color: #1a2b4c;
          font-size: clamp(21px, 2.2vw, 26px);
          line-height: 1.15;
          font-weight: 950;
          letter-spacing: -.35px;
        }

        .twoFactorModalBody {
          flex: 1 1 auto;
          min-height: 0;
          overflow: hidden;
          padding: 18px 28px 16px !important;
        }

        .twoFactorSetupLayout {
          display: grid;
          grid-template-columns: minmax(250px, .86fr) minmax(0, 1.14fr);
          gap: clamp(16px, 2vw, 26px);
          height: 100%;
          min-height: 0;
          align-items: stretch;
        }

        .twoFactorQrPanel {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: clamp(14px, 1.8vw, 24px);
          border: 1px solid #dce3ec;
          border-radius: 22px;
          background: #ffffff;
          box-shadow: none;
        }

        .twoFactorQrBadge {
          margin-bottom: 14px;
          padding: 8px 13px;
          border-radius: 999px;
          background: #edf1f7;
          color: #4a6fa5;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: .13em;
        }

        .twoFactorQrFrame {
          padding: 14px;
          border: 1px solid #dce3ec;
          border-radius: 19px;
          background: #ffffff;
          box-shadow: none;
        }

        .twoFactorQrImage {
          display: block;
          width: min(28vw, 260px);
          height: min(28vw, 260px);
          max-width: 100%;
          object-fit: contain;
          image-rendering: pixelated;
          border-radius: 7px;
        }

        .twoFactorQrCaption {
          max-width: 330px;
          margin-top: 10px;
          color: #6b7789;
          text-align: center;
          font-size: clamp(10px, .9vw, 12px);
          line-height: 1.6;
          font-weight: 650;
        }

        .twoFactorInstructions {
          min-height: 0;
          overflow: hidden;
          padding: 0 1px;
        }

        .twoFactorStep {
          display: flex;
          align-items: flex-start;
          gap: 13px;
          padding: clamp(10px, 1.1vw, 15px);
          margin-bottom: 9px;
          border: 1px solid #dce3ec;
          border-radius: 17px;
          background: rgba(248,251,254,.78);
          box-shadow: none;
        }

        .twoFactorStep > span {
          width: 35px;
          height: 35px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #4a6fa5;
          color: #ffffff;
          font-size: 14px;
          font-weight: 950;
        }

        .twoFactorStep strong {
          display: block;
          color: #2a3a55;
          font-size: 15px;
          line-height: 1.25;
          font-weight: 950;
        }

        .twoFactorStep p {
          margin: 4px 0 0;
          color: #6b7789;
          font-size: 12px;
          line-height: 1.55;
          font-weight: 600;
        }

        .twoFactorCodeLabel {
          display: block;
          margin: 18px 0 8px;
          color: #2a3a55;
          font-size: 14px;
          font-weight: 950;
        }

        .twoFactorLargeCodeInput {
          width: 100% !important;
          min-height: 56px !important;
          text-align: center;
          border-radius: 15px !important;
          letter-spacing: .32em;
          font-size: 22px !important;
          font-weight: 950 !important;
          color: #2a3a55 !important;
        }

        .twoFactorManualSection {
          margin-top: 12px;
          padding: 12px;
          border: 1px dashed #98a2b3;
          border-radius: 17px;
          background: rgba(233,242,249,.72);
        }

        .twoFactorManualTitle {
          color: #2a3a55;
          font-size: 14px;
          font-weight: 950;
        }

        .twoFactorManualText {
          margin-top: 4px;
          color: #6b7789;
          font-size: 11px;
          line-height: 1.5;
        }

        .twoFactorSecretLarge {
          margin: 10px 0;
          padding: 13px;
          font-size: 14px;
          line-height: 1.5;
          letter-spacing: .12em;
          text-align: center;
        }

        .twoFactorCopyButton {
          width: 100%;
        }

        .twoFactorSecurityNote {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 12px;
          padding: 10px 13px;
          border: 1px solid #dce3ec;
          border-radius: 15px;
          background: rgba(228,239,247,.78);
        }

        .twoFactorSecurityNote > span {
          font-size: 18px;
        }

        .twoFactorSecurityNote strong {
          display: block;
          color: #2a3a55;
          font-size: 11px;
          font-weight: 950;
        }

        .twoFactorSecurityNote span:last-child {
          display: block;
          margin-top: 2px;
          color: #6b7789;
          font-size: 10px;
          line-height: 1.45;
        }

        .twoFactorModalFooter {
          flex: 0 0 auto;
          padding: 14px 28px 18px !important;
          gap: 10px;
        }

        .twoFactorModalFooter button {
          min-height: 48px !important;
          padding-left: 19px !important;
          padding-right: 19px !important;
          font-size: 13px !important;
          font-weight: 950 !important;
        }

        html[data-crl-theme="dark"] .twoFactorSetupModal {
          background:
            radial-gradient(circle at 12% 0%, rgba(60,82,101,.38), transparent 31%),
            #1f2a3c;
          border-color: #2a3a55;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .twoFactorModalHeader {
          background: rgba(25,38,49,.35);
          border-bottom-color: #2a3a55;
        }

        html[data-crl-theme="dark"] .twoFactorModalHeader h2,
        html[data-crl-theme="dark"] .twoFactorStep strong,
        html[data-crl-theme="dark"] .twoFactorCodeLabel,
        html[data-crl-theme="dark"] .twoFactorManualTitle,
        html[data-crl-theme="dark"] .twoFactorSecurityNote strong {
          color: #edf1f7;
        }

        html[data-crl-theme="dark"] .twoFactorQrCaption,
        html[data-crl-theme="dark"] .twoFactorStep p,
        html[data-crl-theme="dark"] .twoFactorManualText,
        html[data-crl-theme="dark"] .twoFactorSecurityNote span:last-child {
          color: #98a2b3;
        }

        html[data-crl-theme="dark"] .twoFactorQrPanel,
        html[data-crl-theme="dark"] .twoFactorStep,
        html[data-crl-theme="dark"] .twoFactorManualSection,
        html[data-crl-theme="dark"] .twoFactorSecurityNote {
          background: #1f2a3c;
          border-color: #2a3a55;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .twoFactorQrFrame {
          background: #ffffff;
          border-color: #dce3ec;
        }

        @media (max-height: 780px) and (min-width: 761px) {
          .twoFactorSetupModal {
            height: calc(100dvh - 20px);
            max-height: calc(100dvh - 20px);
          }

          .twoFactorModalHeader {
            padding-top: 16px !important;
            padding-bottom: 12px !important;
          }

          .twoFactorModalBody {
            padding-top: 12px !important;
            padding-bottom: 10px !important;
          }

          .twoFactorQrPanel {
            padding: 12px;
          }

          .twoFactorQrImage {
            width: min(23vw, 205px);
            height: min(23vw, 205px);
          }

          .twoFactorStep {
            padding: 10px;
            margin-bottom: 7px;
          }

          .twoFactorStep strong {
            font-size: 13px;
          }

          .twoFactorStep p {
            font-size: 10px;
          }

          .twoFactorManualSection {
            margin-top: 8px;
            padding: 10px;
          }

          .twoFactorSecurityNote {
            margin-top: 8px;
            padding: 8px 10px;
          }

          .twoFactorModalFooter {
            padding-top: 10px !important;
            padding-bottom: 12px !important;
          }
        }

        @media (max-width: 760px) {
          .twoFactorSetupModal {
            width: calc(100vw - 20px);
            height: min(900px, calc(100dvh - 16px));
            max-height: calc(100dvh - 16px);
          }

          .twoFactorModalHeader,
          .twoFactorModalBody {
            padding-left: 16px !important;
            padding-right: 16px !important;
          }

          .twoFactorModalHeader {
            padding-top: 18px !important;
            padding-bottom: 14px !important;
          }

          .twoFactorModalHeader h2 {
            font-size: 21px;
          }

          .twoFactorModalBody {
            overflow-y: auto;
            padding-top: 14px !important;
          }

          .twoFactorSetupLayout {
            grid-template-columns: 1fr;
            height: auto;
            gap: 14px;
          }

          .twoFactorQrPanel {
            padding: 14px;
          }

          .twoFactorQrImage {
            width: min(250px, 62vw);
            height: min(250px, 62vw);
          }

          .twoFactorModalFooter {
            flex-direction: column-reverse;
            padding: 13px 16px 16px !important;
          }

          .twoFactorModalFooter button {
            width: 100%;
          }
        }

        @media (max-width: 430px) {
          .twoFactorSetupModal {
            width: calc(100vw - 12px);
          }

          .twoFactorModalHeader h2 {
            font-size: 19px;
          }

          .twoFactorQrImage {
            width: min(220px, 68vw);
            height: min(220px, 68vw);
          }

          .twoFactorStep strong {
            font-size: 13px;
          }

          .twoFactorStep p {
            font-size: 10px;
          }

          .twoFactorManualText {
            font-size: 10px;
          }

          .twoFactorSecretLarge {
            font-size: 12px;
          }
        }

        .securityDropdownHeader {
          width: 100%;
          min-height: 94px;
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 18px 22px;
          margin: 0;
          border: 0;
          color: inherit;
          background: transparent;
          text-align: left;
          cursor: pointer;
        }

        .securityDropdownIcon {
          width: 52px;
          height: 52px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 16px;
          background: #edf1f7;
          box-shadow: none;
          font-size: 24px;
        }

        .securityDropdownTitleWrap {
          min-width: 0;
          flex: 1;
        }

        .securityDropdownTitle {
          display: block;
          color: #2a3a55;
          font-size: clamp(20px, 2vw, 25px);
          line-height: 1.15;
          font-weight: 950;
        }

        .securityDropdownSubtitle {
          display: block;
          margin-top: 5px;
          color: #6b7789;
          font-size: 13px;
          line-height: 1.45;
          font-weight: 650;
        }

        .securityDropdownStatus {
          flex: 0 0 auto;
        }

        .securityDropdownChevron {
          flex: 0 0 auto;
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #1a2b4c;
          background: #edf1f7;
          font-size: 23px;
          line-height: 1;
          transition: transform .42s cubic-bezier(.22,.85,.25,1), box-shadow .3s ease;
        }

        .securityDropdownChevron.open {
          transform: rotate(180deg);
        }

        .securityPrivacyPanel {
          position: relative;
          min-height: 0 !important;
          height: auto !important;
          max-height: 96px;
          overflow: hidden !important;
          margin-bottom: 14px !important;
          transition:
            max-height .68s cubic-bezier(.22,.85,.25,1),
            box-shadow .45s ease,
            transform .45s cubic-bezier(.22,.85,.25,1),
            border-radius .45s ease;
          will-change: max-height;
        }

        .securityPrivacyPanelOpen {
          max-height: var(--security-dropdown-open-height, 1200px);
          margin-bottom: 20px !important;
          box-shadow: none;
        }

        .securityPrivacyPanelClosed {
          max-height: 96px;
          margin-bottom: 14px !important;
          box-shadow: none;
        }

        .securityDropdownHeader {
          width: 100%;
          min-height: 96px;
          height: 96px;
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 18px 22px;
          margin: 0;
          border: 0;
          color: inherit;
          background: transparent;
          text-align: left;
          cursor: pointer;
          box-sizing: border-box;
        }

        .securityPrivacyPanelOpen .securityDropdownHeader {
          min-height: 88px;
          height: 88px;
          transition:
            height .68s cubic-bezier(.22,.85,.25,1),
            min-height .68s cubic-bezier(.22,.85,.25,1);
        }

        .securityPrivacyPanelClosed .securityDropdownHeader {
          transition:
            height .68s cubic-bezier(.22,.85,.25,1),
            min-height .68s cubic-bezier(.22,.85,.25,1);
        }

        .securityDropdownContent {
          display: block;
          max-height: 0;
          opacity: 0;
          visibility: hidden;
          overflow: hidden;
          transform: translateY(-10px);
          transition:
            max-height .68s cubic-bezier(.22,.85,.25,1),
            opacity .34s cubic-bezier(.22,.85,.25,1),
            transform .68s cubic-bezier(.22,.85,.25,1),
            visibility 0s linear .68s;
        }

        .securityPrivacyPanelOpen .securityDropdownContent {
          max-height: var(--security-dropdown-open-height, 1060px);
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
          transition:
            max-height .68s cubic-bezier(.22,.85,.25,1),
            opacity .34s cubic-bezier(.22,.85,.25,1),
            transform .68s cubic-bezier(.22,.85,.25,1),
            visibility 0s linear 0s;
        }

        .securityDropdownInner {
          min-height: 0;
          overflow: hidden;
          padding: 0;
        }

        .securityDropdownHeader:focus-visible {
          outline: 3px solid rgba(45,125,200,.18);
          outline-offset: -4px;
        }

        @media(max-width:800px){
          .securityPrivacyPanel { margin-top: 12px !important; }
          .securityDropdownHeader{padding:15px 17px;min-height:82px}
          .securityDropdownTitle{font-size:19px}
          .securityDropdownSubtitle{font-size:11px}
          .securityDropdownStatus{display:none}
          .securityGrid{grid-template-columns:1fr}
        }

        @media(max-width:600px){
          .securityPrivacyPanel { margin-bottom: 10px !important; }
          .securityDropdownHeader{gap:10px;padding:12px 13px;min-height:74px}
          .securityDropdownIcon{width:44px;height:44px;font-size:20px}
          .securityDropdownChevron{width:32px;height:32px;font-size:20px}
        }

        /* Consistent overlay typography */
        .modalHeader h2,
        .logoutModal h2,
        .bulkDeleteConfirmBody h2 {
          font-size: 20px !important;
          line-height: 1.25 !important;
          font-weight: 900 !important;
        }

        .modalHeaderHint,
        .bulkFormHeader,
        .modalBody,
        .logoutModal p,
        .bulkDeleteConfirmBody p {
          font-size: 13px !important;
          line-height: 1.55 !important;
        }

        .formLabel,
        .learnerEntryRow .formLabel,
        .modalBody label {
          font-size: 12px !important;
          line-height: 1.3 !important;
        }

        .formInput,
        .formSelect,
        .formTextarea,
        .learnerEntryRow input,
        .learnerEntryRow select {
          font-size: 13px !important;
        }

        .modalFooter .secondaryButton,
        .modalFooter .dangerButton,
        .logoutModal .secondaryButton,
        .logoutModal .dangerButton,
        .bulkDeleteConfirm .secondaryButton,
        .bulkDeleteConfirm .dangerButton {
          min-height: 42px !important;
          font-size: 12px !important;
          font-weight: 900 !important;
        }

        .logoutModal {
          width: min(460px, calc(100vw - 32px)) !important;
        }

        .logoutModal p {
          max-width: 390px;
        }

        .multiLearnerModal .modalHeader h2 {
          font-size: 21px !important;
        }

        .multiLearnerModal .modalHeaderHint {
          font-size: 13px !important;
        }

        .multiLearnerModal .bulkFormHeader {
          font-size: 13px !important;
        }

        .multiLearnerModal .learnerEntryNumber {
          font-size: 12px !important;
        }

        @media (max-width: 600px) {
          .modalHeader h2,
          .logoutModal h2,
          .bulkDeleteConfirmBody h2,
          .multiLearnerModal .modalHeader h2 {
            font-size: 18px !important;
          }

          .modalHeaderHint,
          .modalBody,
          .logoutModal p,
          .bulkDeleteConfirmBody p,
          .multiLearnerModal .modalHeaderHint,
          .multiLearnerModal .bulkFormHeader {
            font-size: 12px !important;
          }

          .formLabel,
          .learnerEntryRow .formLabel,
          .modalBody label {
            font-size: 11px !important;
          }

          .formInput,
          .formSelect,
          .formTextarea,
          .learnerEntryRow input,
          .learnerEntryRow select {
            font-size: 13px !important;
          }

          .modalFooter .secondaryButton,
          .modalFooter .dangerButton,
          .logoutModal .secondaryButton,
          .logoutModal .dangerButton {
            font-size: 12px !important;
          }
        }

        /* Consistent dashboard title hierarchy */
        .pageIntro .pageTitle,
        .pageTitle {
          font-size: 32px !important;
          line-height: 1.18 !important;
          font-weight: 900 !important;
          letter-spacing: -0.7px !important;
        }

        .panelHeaderTitle {
          font-size: 21px !important;
          line-height: 1.25 !important;
          font-weight: 900 !important;
        }

        .welcomeCard h2 {
          font-size: 22px !important;
          line-height: 1.25 !important;
        }

        .analyticsMainPanel .panelHeaderTitle,
        .manageAssessmentPanel .panelHeaderTitle,
        .profileMainPanel .panelHeaderTitle,
        .recordsMainPanel .panelHeaderTitle {
          font-size: 21px !important;
        }

        .analyticsMainPanel .analyticsCard h3 {
          font-size: 15px !important;
        }

        .analyticsMainPanel .analyticsValue {
          font-size: 30px !important;
        }

        .recordTemplateMeta strong {
          font-size: 17px !important;
        }

        .profileMainPanel .profileValue {
          font-size: 17px !important;
        }

        /* ================================================================
           Mobile + Tablet responsive system
           ================================================================ */

        .contentStage,
        .content,
        .panel,
        .recordsMainPanel,
        .manageAssessmentPanel,
        .analyticsMainPanel,
        .profileMainPanel {
          min-width: 0;
        }

        .tableWrap,
        .summaryTableWrap,
        .summaryDetailScroller,
        .recordTemplateView,
        .recordTemplateScroller {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .toolbar,
        .toolbarActions,
        .recordToolbar,
        .filterRow {
          min-width: 0;
          flex-wrap: wrap;
        }

        .toast,
        .deletingToast,
        .busyCard {
          max-width: calc(100vw - 24px);
        }

        @media (max-width: 1024px) {
          .main {
            margin-left: 0 !important;
          }

          .sidebar.open {
            position: fixed !important;
            inset: 0 auto 0 0 !important;
            width: min(340px, 84vw) !important;
            max-width: 340px !important;
            z-index: 1200 !important;
            transform: translateX(0);
            box-shadow: none;
          }

          .sidebar.collapsed {
            width: 0 !important;
            transform: translateX(-100%);
          }

          .sidebarToggle {
            left: min(318px, calc(84vw - 22px)) !important;
          }

          .sidebar.collapsed .sidebarToggle {
            left: 10px !important;
          }

          .content {
            width: 100%;
          }

          .contentStage {
            width: 100%;
          }

          .welcomeCard,
          .recordsMainPanel,
          .manageAssessmentPanel,
          .analyticsMainPanel,
          .profileMainPanel {
            width: min(100%, calc(100vw - 28px)) !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }

          .recordsMainPanel .recordCharts,
          .summaryMetricGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .manageAssessmentPanel {
            margin-top: 34px !important;
          }

          .profileMainPanel {
            width: min(920px, calc(100vw - 40px)) !important;
          }

          .multiLearnerModal {
            width: min(94vw, 900px) !important;
            max-width: 94vw !important;
          }

          .learnerEntryRow {
            grid-template-columns: 30px repeat(6, minmax(105px, 1fr)) 36px !important;
          }
        }

        @media (max-width: 768px) {
          body {
            overflow-x: hidden;
          }

          .teacherShell {
            min-height: 100svh;
            overflow-x: hidden;
          }

          .main {
            width: 100% !important;
            margin-left: 0 !important;
          }

          .topbar {
            min-height: 56px !important;
            padding: 0 16px !important;
          }

          .content {
            padding: 12px !important;
          }

          .pageIntro .pageTitle,
          .pageTitle {
            font-size: 27px !important;
          }

          .panelHeaderTitle {
            font-size: 19px !important;
          }

          .welcomeCard,
          .recordsMainPanel,
          .manageAssessmentPanel,
          .analyticsMainPanel,
          .profileMainPanel {
            width: 100% !important;
            max-width: 100% !important;
            margin-top: 18px !important;
            margin-bottom: 18px !important;
          }

          .welcomeCard {
            padding: 18px !important;
          }

          .homeStatsGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }

          .latestLearnerOverviewTable {
            overflow-x: auto;
          }

          .latestLearnerOverviewTable table {
            min-width: 760px;
          }

          .toolbar,
          .recordToolbar,
          .filterRow {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
          }

          .toolbar > *,
          .recordToolbar > *,
          .filterRow > * {
            min-width: 0 !important;
            width: 100% !important;
          }

          .toolbarButton,
          .smallButton,
          .recordViewTab,
          .periodTab,
          .secondaryButton,
          .addRowButton {
            min-height: 44px !important;
          }

          .summaryMetricGrid,
          .recordCharts,
          .analyticsGrid,
          .profileGrid,
          .activityGrid {
            grid-template-columns: 1fr !important;
          }

          .summaryDetailTable {
            min-width: 1250px !important;
          }

          .templateSummaryTable,
          .recordTemplateTable,
          .summaryTable {
            min-width: 1050px !important;
          }

          .manageAssessmentPanel .panelHeader,
          .analyticsMainPanel .panelHeader,
          .profileMainPanel .panelHeader {
            flex-wrap: wrap !important;
            gap: 12px !important;
          }

          .profileMainPanel {
            width: 100% !important;
          }

          .profileMainPanel .profileItem {
            min-height: 84px !important;
            padding: 16px !important;
          }

          .profileMainPanel .profileValue {
            font-size: 16px !important;
            overflow-wrap: anywhere;
          }

          .multiLearnerModal {
            width: calc(100vw - 20px) !important;
            max-width: calc(100vw - 20px) !important;
            max-height: calc(100svh - 20px) !important;
            overflow-y: auto !important;
            margin: 10px !important;
          }

          .multiLearnerModal .modalHeader {
            padding: 16px !important;
          }

          .multiLearnerModal .modalBody {
            padding: 12px !important;
          }

          .learnerEntryRow {
            grid-template-columns: 32px 1fr 1fr !important;
            gap: 9px !important;
            padding: 12px !important;
          }

          .learnerEntryRow .formGroup {
            grid-column: span 1 !important;
          }

          .learnerEntryRow .iconDangerButton {
            grid-column: 3 !important;
            justify-self: end !important;
          }

          .classRecordDropZone {
            min-height: 190px !important;
            padding: 20px 14px !important;
          }

          .toast {
            right: 12px !important;
            left: 12px !important;
            bottom: 12px !important;
            width: auto !important;
            max-width: none !important;
            min-height: 56px !important;
            font-size: 13px !important;
          }

          .deletingToast {
            right: 12px !important;
            left: 12px !important;
            bottom: 12px !important;
            min-width: 0 !important;
            width: auto !important;
          }

          .sidebarToggle {
            width: 46px !important;
            height: 46px !important;
          }

          .sidebar.collapsed .sidebarToggle {
            width: 54px !important;
            height: 54px !important;
          }
        }

        @media (max-width: 480px) {
          .content {
            padding: 8px !important;
          }

          .topbar {
            padding: 0 10px !important;
          }

          .pageIntro .pageTitle,
          .pageTitle {
            font-size: 24px !important;
          }

          .panelHeaderTitle {
            font-size: 18px !important;
          }

          .homeStatsGrid {
            grid-template-columns: 1fr !important;
          }

          .toolbar,
          .recordToolbar,
          .filterRow {
            grid-template-columns: 1fr !important;
          }

          .multiLearnerModal {
            width: calc(100vw - 12px) !important;
            max-width: calc(100vw - 12px) !important;
            max-height: calc(100svh - 12px) !important;
            margin: 6px !important;
            border-radius: 16px !important;
          }

          .learnerEntryRow {
            grid-template-columns: 30px 1fr !important;
          }

          .learnerEntryRow .formGroup,
          .learnerEntryRow .iconDangerButton {
            grid-column: 2 !important;
          }

          .learnerEntryRow .iconDangerButton {
            justify-self: start !important;
          }

          .modalFooter {
            flex-wrap: wrap !important;
            gap: 8px !important;
          }

          .modalFooter > * {
            flex: 1 1 130px !important;
          }

          .classRecordDropZone {
            min-height: 175px !important;
          }

          .summaryDetailScroller,
          .tableWrap,
          .summaryTableWrap {
            margin-left: -2px;
            margin-right: -2px;
          }
        }


        /* Clean assessment-record selector controls: visible without the white glow */
        .recordsHeaderActions .recordViewTab,
        .recordsHeaderActions .periodTab {
          background: #edf1f7 !important;
          color: #4a6fa5 !important;
          box-shadow: 0 1px 2px rgba(26,43,76,.05);
          border: 1px solid rgba(189,207,222,.72) !important;
        }

        .recordsHeaderActions .recordViewTab:hover,
        .recordsHeaderActions .periodTab:hover {
          background: #dce3ec !important;
          color: #1a2b4c !important;
          box-shadow: 0 1px 2px rgba(26,43,76,.05);
          transform: translateY(-1px);
        }

        .recordsHeaderActions .recordViewTab.active,
        .recordsHeaderActions .periodTab.active {
          background: #4a6fa5 !important;
          color: #ffffff !important;
          border-color: #4a6fa5 !important;
          box-shadow: none;
        }

        html[data-crl-theme="dark"] .recordsHeaderActions .recordViewTab,
        html[data-crl-theme="dark"] .recordsHeaderActions .periodTab {
          background: #1f2a3c !important;
          color: #dce4ef !important;
          border-color: #2a3a55 !important;
          box-shadow: 0 1px 2px rgba(26,43,76,.05);
        }

        html[data-crl-theme="dark"] .recordsHeaderActions .recordViewTab:hover,
        html[data-crl-theme="dark"] .recordsHeaderActions .periodTab:hover {
          background: #1f2a3c !important;
          color: #edf1f7 !important;
          box-shadow: 0 1px 2px rgba(26,43,76,.05);
        }

        html[data-crl-theme="dark"] .recordsHeaderActions .recordViewTab.active,
        html[data-crl-theme="dark"] .recordsHeaderActions .periodTab.active {
          background: #4a6fa5 !important;
          color: #ffffff !important;
          border-color: #4a6fa5 !important;
          box-shadow: none;
        }

        .recordsHeaderActions .recordViewTab::after,
        .recordsHeaderActions .periodTab::after {
          display: none !important;
        }

        /* ==================================================================
           BENTO UI LAYER
           No sidebar: a centred bento menu whose tiles open full screen.
           Ivory/white base, muted navy + crimson, hairline structure.
           Theme-scoped so the dark skin keeps working.
           ================================================================== */

        /* ---------- theme tokens ---------- */
        :root {
          --crl-bg: #fafafa;
          --crl-surface: #ffffff;
          --crl-surface-2: #edf1f7;
          --crl-line: #dce3ec;
          --crl-line-strong: #c7d2e0;
          --crl-ink: #1a2b4c;
          --crl-blue: #4a6fa5;
          --crl-red: #c0392b;
          --crl-text: #1f2a3c;
          --crl-muted: #6b7789;
          --crl-quiet-bg: #f8eae8;
          --crl-hover: #f3f6fa;
          --crl-active-bg: #1a2b4c;
          --crl-active-fg: #ffffff;
          --crl-green: #2f6b4f;
          --crl-green-hover: #265840;
          --crl-green-fg: #ffffff;
        }

        /* Dark is a deep navy-charcoal, never pure black. */
        html[data-crl-theme="dark"] {
          --crl-bg: #141b29;
          --crl-surface: #1b2434;
          --crl-surface-2: #212c40;
          --crl-line: #2c3a52;
          --crl-line-strong: #3a4a66;
          --crl-ink: #e8ecf3;
          --crl-blue: #7f9dc4;
          --crl-red: #d9736a;
          --crl-text: #e8ecf3;
          --crl-muted: #8695ac;
          --crl-quiet-bg: #2b2130;
          --crl-hover: #212c40;
          --crl-active-bg: #3f5f8f;
          --crl-active-fg: #ffffff;
          --crl-green: #3a7d5b;
          --crl-green-hover: #468f6a;
          --crl-green-fg: #ffffff;
        }

        /* ---------- shell ---------- */
        .teacherShell {
          display: block !important;
          min-height: 100vh;
          background: var(--crl-bg) !important;
        }

        /* No sidebar: kill every layout rule that reserved space for it. */
        .teacherShell .main,
        .teacherShell.isExpanded .main,
        .sidebar + .main,
        .sidebar.collapsed + .main,
        .sidebar.open + .main {
          margin-left: 0 !important;
          width: 100% !important;
          max-width: none !important;
        }

        .teacherShell.isBento {
          display: grid !important;
          place-items: start center;
          padding: 34px 34px 60px;
        }

        /* ---------- centred bento menu ---------- */
        .bentoMenu {
          width: min(1560px, 100%);
          margin: 0 auto;
          animation: bentoMenuIn 240ms ease-out both;
        }

        @keyframes bentoMenuIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .bentoHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 24px;
        }

        .bentoBrand {
          display: flex;
          align-items: center;
          gap: 16px;
          min-width: 0;
        }

        /* Logout sits beside the light/dark switch, on the right. */
        .bentoHeadActions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 0 0 auto;
        }

        .bentoLogo {
          display: block;
          height: 64px;
          width: auto;
          max-width: min(420px, 58vw);
          object-fit: contain;
        }

        html[data-crl-theme="dark"] .bentoLogo {
          filter: brightness(0) invert(1);
          opacity: .94;
        }

        .bentoLogout {
          flex: 0 0 auto;
          min-height: 42px;
          padding: 0 18px;
          border: 1px solid var(--crl-line);
          border-radius: 999px;
          background: transparent;
          color: var(--crl-red);
          font: inherit;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          transition:
            border-color 160ms ease-out,
            background-color 160ms ease-out,
            transform 160ms ease-out;
        }

        .bentoLogout:hover {
          border-color: var(--crl-red);
          background: var(--crl-quiet-bg);
        }

        .bentoLogout:active { transform: scale(.97); }

        .bentoThemeSwitch {
          position: static !important;
          top: auto !important;
          right: auto !important;
          margin: 0 !important;
          flex: 0 0 auto;
        }

        .bentoGrid {
          display: grid !important;
          grid-template-columns: minmax(0, 30rem) minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }

        /* Clickable blocks fill the right-hand side of the grid. */
        .bentoBlocks {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
          gap: 16px;
          align-content: start;
          min-width: 0;
        }

        /* ---------- Home: static front dashboard, left column ---------- */
        .bentoHome {
          grid-column: 1;
          display: grid;
          gap: 16px;
          padding: 20px;
          border: 1px solid var(--crl-line);
          border-radius: 20px;
          background: var(--crl-surface);
          min-width: 0;
        }

        /* Disclosure header: mobile only. */
        .bentoHomeHead { display: none; }

        .bentoHomeTitle {
          font-size: 15px;
          font-weight: 800;
          letter-spacing: -.01em;
          color: var(--crl-ink);
        }

        .bentoHomeToggle {
          display: inline-grid;
          place-items: center;
          width: 36px;
          height: 36px;
          flex: 0 0 auto;
          border: 1px solid var(--crl-line);
          border-radius: 10px;
          background: transparent;
          color: var(--crl-ink);
          font: inherit;
          font-size: 18px;
          font-weight: 900;
          line-height: 1;
          cursor: pointer;
          transition: border-color 160ms ease-out, background-color 160ms ease-out, transform 160ms ease-out;
        }

        .bentoHomeToggle:hover {
          border-color: var(--crl-blue);
          background: var(--crl-hover);
        }

        .bentoHomeToggle:active { transform: scale(.95); }

        .bentoHomeBody {
          display: grid;
          gap: 16px;
          min-width: 0;
        }

        .bentoHome .homeStatsGrid {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 10px !important;
          margin: 0 !important;
        }

        .bentoHome .statCard {
          padding: 14px !important;
          border-radius: 14px !important;
        }

        .bentoHome .statNumber { font-size: 24px !important; }
        .bentoHome .statLabel { font-size: 10.5px !important; }

        .bentoHome .latestLearnerOverview {
          border: 0 !important;
          padding: 0 !important;
          background: transparent !important;
          border-radius: 0 !important;
        }

        /* Keep the 7-column roster readable inside the narrow Home column. */
        .bentoHome .latestLearnerOverviewTable {
          overflow-x: auto;
          max-height: 320px;
          overflow-y: auto;
        }

        .bentoHome .latestLearnerOverviewTable table {
          min-width: 0 !important;
          width: 100% !important;
        }

        .bentoHome .latestLearnerOverviewTable th,
        .bentoHome .latestLearnerOverviewTable td {
          padding: 10px 6px !important;
          font-size: 12px !important;
        }

        .bentoHome .latestLearnerOverviewTable th:first-child,
        .bentoHome .latestLearnerOverviewTable td:first-child {
          padding-left: 0 !important;
        }

        .bentoHome .latestLearnerOverviewTable th:last-child,
        .bentoHome .latestLearnerOverviewTable td:last-child {
          padding-right: 0 !important;
        }

        /* ---------- clickable bento blocks ---------- */
        .bentoTile {
          position: relative;
          display: flex !important;
          flex-direction: column;
          align-items: flex-start;
          justify-content: space-between;
          gap: 30px;
          min-height: 220px;
          padding: 26px;
          border: 1px solid var(--crl-line) !important;
          border-radius: 20px;
          background: var(--crl-surface) !important;
          color: var(--crl-ink) !important;
          text-align: left;
          cursor: pointer;
          font: inherit;
          transition:
            transform 200ms ease-out,
            border-color 200ms ease-out,
            background-color 200ms ease-out;
        }

        .bentoTile:hover {
          border-color: var(--crl-blue) !important;
          transform: translateY(-2px);
        }

        .bentoTile:active { transform: scale(.985); }

        .bentoTile:focus-visible {
          outline: 2px solid var(--crl-blue);
          outline-offset: 3px;
        }

        .bentoIcon {
          display: grid;
          place-items: center;
          width: 48px;
          height: 48px;
          border-radius: 13px;
          background: var(--crl-surface-2);
          color: var(--crl-blue);
          font-size: 20px;
          line-height: 1;
        }

        .bentoLabel {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: -.01em;
          line-height: 1.25;
        }

        .bentoTileQuiet .bentoIcon {
          background: var(--crl-quiet-bg);
          color: var(--crl-red);
        }

        .bentoTileQuiet { color: var(--crl-red) !important; }


        /* ---------- expanded full-screen block ---------- */
        .teacherShell.isExpanded .main {
          animation: bentoOpen 260ms cubic-bezier(.16,1,.3,1) both;
          min-height: 100vh;
          background: #fafafa !important;
        }

        @keyframes bentoOpen {
          from { opacity: 0; transform: scale(.985); }
          to { opacity: 1; transform: scale(1); }
        }

        .teacherShell.isExpanded .topbar {
          display: flex !important;
          align-items: center;
          gap: 14px;
          min-height: 68px !important;
          height: auto !important;
          padding: 12px 26px !important;
          background: var(--crl-surface) !important;
          border-bottom: 1px solid var(--crl-line) !important;
        }

        .bentoClose {
          flex: 0 0 auto;
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border: 1px solid var(--crl-line);
          border-radius: 11px;
          background: var(--crl-surface);
          color: var(--crl-ink);
          font-size: 20px;
          font-weight: 900;
          line-height: 1;
          cursor: pointer;
          transition: border-color 160ms ease-out, background-color 160ms ease-out, transform 160ms ease-out;
        }

        .bentoClose:hover { border-color: var(--crl-blue); background: var(--crl-hover); }
        .bentoClose:active { transform: scale(.96); }

        .topbarTitle {
          flex: 1 1 auto;
          min-width: 0;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: -.01em;
          color: var(--crl-ink) !important;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .teacherShell.isExpanded .content {
          background: var(--crl-bg) !important;
          padding: 22px 26px 40px !important;
        }

        .teacherShell.isExpanded .topTitle,
        .teacherShell.isExpanded .topAccent { display: none !important; }/* ---------- tiles / panels ---------- */
        html[data-crl-theme] .welcomeCard,
        html[data-crl-theme] .panel,
        html[data-crl-theme] .statCard,
        html[data-crl-theme] .analyticsCard,
        html[data-crl-theme] .summaryMetricCard,
        html[data-crl-theme] .modal,
        html[data-crl-theme] .busyCard {
          border-width: 1px !important;
          border-style: solid !important;
          border-radius: 16px !important;
        }

        /* ---------- tiles / panels ---------- */
        html:not([data-crl-theme="dark"]) .welcomeCard,
        html:not([data-crl-theme="dark"]) .panel,
        html:not([data-crl-theme="dark"]) .statCard,
        html:not([data-crl-theme="dark"]) .analyticsCard,
        html:not([data-crl-theme="dark"]) .summaryMetricCard,
        html:not([data-crl-theme="dark"]) .modal,
        html:not([data-crl-theme="dark"]) .busyCard {
          background: #ffffff !important;
          border-color: #dce3ec !important;
          box-shadow: none !important;
        }

        /* ---------- tables: horizontal rules only ---------- */
        html:not([data-crl-theme="dark"]) table {
          border-collapse: collapse !important;
        }html[data-crl-theme] thead tr,
        html[data-crl-theme] tbody tr,
        html[data-crl-theme] th,
        html[data-crl-theme] td {
          border-left-width: 0 !important;
          border-right-width: 0 !important;
          border-top-width: 0 !important;
          border-bottom-width: 1px !important;
          border-bottom-style: solid !important;
        }

        html:not([data-crl-theme="dark"]) thead tr,
        html:not([data-crl-theme="dark"]) tbody tr,
        html:not([data-crl-theme="dark"]) th,
        html:not([data-crl-theme="dark"]) td {
          border-bottom-color: #dce3ec !important;
          background-image: none !important;
        }html[data-crl-theme] th,
        html[data-crl-theme] td {
          padding-top: 15px !important;
          padding-bottom: 15px !important;
        }html[data-crl-theme] thead th {
          border-bottom-width: 1px !important;
          border-bottom-style: solid !important;
        }

        html:not([data-crl-theme="dark"]) thead th {
          border-bottom-color: #c7d2e0 !important;
          color: #6b7789 !important;
        }

        html:not([data-crl-theme="dark"]) tbody tr:hover td {
          background: #fafafa !important;
        }/* ---------- status pills -> text badges ---------- */
        html[data-crl-theme] .badge {
          display: inline-block !important;
          padding: 0 !important;
          border-width: 0 !important;
          border-radius: 0 !important;
          font-size: 11px !important;
          font-weight: 800 !important;
          letter-spacing: .02em;
          text-transform: none;
          border-bottom-width: 2px !important;
          border-bottom-style: solid !important;
          padding-bottom: 2px !important;
        }

        /* ---------- status pills -> text badges ---------- */
        html:not([data-crl-theme="dark"]) .badge {
          background: transparent !important;
          box-shadow: none !important;
          border-bottom-color: currentColor !important;
        }/* ---------- primary vs secondary actions ---------- */
        html[data-crl-theme] .toolbarButton,
        html[data-crl-theme] .smallButton,
        html[data-crl-theme] .secondaryButton,
        html[data-crl-theme] .addRowButton,
        html[data-crl-theme] .exportGreenButton,
        html[data-crl-theme] .importGreenButton,
        html[data-crl-theme] .softButton,
        html[data-crl-theme] .toolbarButton.exportButton {
          border-width: 1px !important;
          border-style: solid !important;
          border-radius: 10px !important;
          font-weight: 700 !important;
        }

        /* ---------- primary vs secondary actions ---------- */
        html:not([data-crl-theme="dark"]) .toolbarButton,
        html:not([data-crl-theme="dark"]) .smallButton,
        html:not([data-crl-theme="dark"]) .secondaryButton,
        html:not([data-crl-theme="dark"]) .addRowButton,
        html:not([data-crl-theme="dark"]) .importGreenButton,
        html:not([data-crl-theme="dark"]) .softButton,
        html:not([data-crl-theme="dark"]) .toolbarButton.exportButton {
          background: #ffffff !important;
          background-image: none !important;
          border-color: #dce3ec !important;
          color: #1a2b4c !important;
          box-shadow: none !important;
        }

        html:not([data-crl-theme="dark"]) .toolbarButton:hover,
        html:not([data-crl-theme="dark"]) .smallButton:hover,
        html:not([data-crl-theme="dark"]) .secondaryButton:hover,
        html:not([data-crl-theme="dark"]) .importGreenButton:hover,
        html:not([data-crl-theme="dark"]) .softButton:hover {
          border-color: #4a6fa5 !important;
          background: #edf1f7 !important;
        }html[data-crl-theme] .primaryBlueButton,
        html[data-crl-theme] .toolbarButton.primaryBlueButton {
          border-width: 1px !important;
          border-style: solid !important;
        }

        html:not([data-crl-theme="dark"]) .primaryBlueButton,
        html:not([data-crl-theme="dark"]) .toolbarButton.primaryBlueButton {
          background: #1a2b4c !important;
          background-image: none !important;
          border-color: #1a2b4c !important;
          color: #ffffff !important;
        }

        html:not([data-crl-theme="dark"]) .primaryBlueButton:hover,
        html:not([data-crl-theme="dark"]) .toolbarButton.primaryBlueButton:hover {
          background: #24395f !important;
          border-color: #24395f !important;
        }/* View / Delete become text links */
        html[data-crl-theme] .inlineActions .smallButton {
          border-width: 0 !important;
          padding: 4px 2px !important;
          min-height: 0 !important;
          font-weight: 800 !important;
          border-bottom-width: 1px !important;
          border-bottom-style: solid !important;
        }

        /* View / Delete become text links */
        html:not([data-crl-theme="dark"]) .inlineActions .smallButton {
          background: transparent !important;
          color: #1a2b4c !important;
          text-decoration: none;
          border-bottom-color: transparent !important;
        }

        html:not([data-crl-theme="dark"]) .inlineActions .smallButton:hover {
          border-bottom-color: #1a2b4c !important;
          background: transparent !important;
        }

        html:not([data-crl-theme="dark"]) .inlineActions .smallButton.redSmall,
        html:not([data-crl-theme="dark"]) .inlineActions .dangerSmall {
          color: #c0392b !important;
        }

        html:not([data-crl-theme="dark"]) .inlineActions .smallButton.redSmall:hover,
        html:not([data-crl-theme="dark"]) .inlineActions .dangerSmall:hover {
          border-bottom-color: #c0392b !important;
        }/* ---------- inputs ---------- */
        html[data-crl-theme] .searchInput,
        html[data-crl-theme] .selectInput,
        html[data-crl-theme] .formInput,
        html[data-crl-theme] .formSelect {
          border-width: 1px !important;
          border-style: solid !important;
          border-radius: 10px !important;
        }

        /* ---------- inputs ---------- */
        html:not([data-crl-theme="dark"]) .searchInput,
        html:not([data-crl-theme="dark"]) .selectInput,
        html:not([data-crl-theme="dark"]) .formInput,
        html:not([data-crl-theme="dark"]) .formSelect {
          background: #ffffff !important;
          border-color: #dce3ec !important;
          color: #1f2a3c !important;
          box-shadow: none !important;
        }

        html:not([data-crl-theme="dark"]) .searchInput:focus,
        html:not([data-crl-theme="dark"]) .selectInput:focus,
        html:not([data-crl-theme="dark"]) .formInput:focus {
          border-color: #4a6fa5 !important;
          outline: none !important;
        }

        /* ==================================================================
           THEME-AWARE SURFACES
           The html[data-crl-theme] selector matches in both modes, so these
           win over the legacy light rules and the legacy dark rules alike
           while every colour resolves through the :root / dark variables.
           ================================================================== */
        html[data-crl-theme] .teacherShell,
        html[data-crl-theme] .teacherShell.isExpanded .main,
        html[data-crl-theme] .teacherShell.isExpanded .content {
          background: var(--crl-bg) !important;
        }

        html[data-crl-theme] .bentoHome,
        html[data-crl-theme] .welcomeCard,
        html[data-crl-theme] .panel,
        html[data-crl-theme] .statCard,
        html[data-crl-theme] .analyticsCard,
        html[data-crl-theme] .summaryMetricCard,
        html[data-crl-theme] .busyCard,
        html[data-crl-theme] .toolbar,
        html[data-crl-theme] .tableWrap,
        html[data-crl-theme] .summaryTableWrap,
        html[data-crl-theme] .summaryDetailScroller,
        html[data-crl-theme] .recordTemplateScroller,
        html[data-crl-theme] .recordViewTabs,
        html[data-crl-theme] .periodTabs,
        html[data-crl-theme] .activityTabs,
        html[data-crl-theme] .modal,
        html[data-crl-theme] .modalHeader,
        html[data-crl-theme] .modalBody,
        html[data-crl-theme] .modalFooter,
        html[data-crl-theme] .twoFactorSetupModal,
        html[data-crl-theme] .twoFactorModalHeader {
          background: var(--crl-surface) !important;
          border-color: var(--crl-line) !important;
          box-shadow: none !important;
        }

        html[data-crl-theme] .topbar {
          background: var(--crl-surface) !important;
          border-bottom: 1px solid var(--crl-line) !important;
        }

        html[data-crl-theme] .bentoTile {
          background: var(--crl-surface) !important;
          border-color: var(--crl-line) !important;
          color: var(--crl-ink) !important;
        }

        html[data-crl-theme] .bentoTile:hover { border-color: var(--crl-blue) !important; }

        html[data-crl-theme] .bentoIcon {
          background: var(--crl-surface-2);
          color: var(--crl-blue);
        }

        html[data-crl-theme] .bentoTileQuiet .bentoIcon {
          background: var(--crl-quiet-bg);
          color: var(--crl-red);
        }

        html[data-crl-theme] .bentoTileQuiet { color: var(--crl-red) !important; }

        html[data-crl-theme] .bentoClose {
          background: var(--crl-surface);
          border: 1px solid var(--crl-line);
          color: var(--crl-ink);
        }

        html[data-crl-theme] .bentoClose:hover {
          border-color: var(--crl-blue);
          background: var(--crl-hover);
        }

        html[data-crl-theme] .topbarTitle,
        html[data-crl-theme] .bentoLabel,
        html[data-crl-theme] .nameStrong,
        html[data-crl-theme] .panelHeaderTitle {
          color: var(--crl-ink) !important;
        }

        html[data-crl-theme] .secondaryGhostButton {
          border: 1px solid var(--crl-line);
          color: var(--crl-ink);
        }

        html[data-crl-theme] .secondaryGhostButton:hover {
          border-color: var(--crl-blue);
          background: var(--crl-hover);
        }

        html[data-crl-theme] .searchInput,
        html[data-crl-theme] .selectInput,
        html[data-crl-theme] .formInput,
        html[data-crl-theme] .formSelect {
          background: var(--crl-surface) !important;
          border: 1px solid var(--crl-line) !important;
          color: var(--crl-text) !important;
        }

        html[data-crl-theme] .searchInput:focus,
        html[data-crl-theme] .selectInput:focus,
        html[data-crl-theme] .formInput:focus {
          border-color: var(--crl-blue) !important;
        }

        html[data-crl-theme] .toolbarButton,
        html[data-crl-theme] .smallButton,
        html[data-crl-theme] .secondaryButton,
        html[data-crl-theme] .addRowButton,
        html[data-crl-theme] .importGreenButton,
        html[data-crl-theme] .softButton,
        html[data-crl-theme] .refreshButton,
        html[data-crl-theme] .copyButton {
          background: var(--crl-surface) !important;
          background-image: none !important;
          border: 1px solid var(--crl-line) !important;
          color: var(--crl-ink) !important;
          box-shadow: none !important;
        }

        html[data-crl-theme] .learnerRefreshButton {
          background: var(--crl-surface);
          border-color: var(--crl-line);
          color: var(--crl-ink);
          box-shadow: none;
        }

        html[data-crl-theme] .learnerRefreshButton:hover:not(:disabled) {
          background: var(--crl-hover);
          border-color: var(--crl-blue);
        }

        /* ---------- Export Excel: theme-based green ---------- */
        html[data-crl-theme] .exportGreenButton,
        html[data-crl-theme] .toolbarButton.exportGreenButton {
          background: var(--crl-green) !important;
          background-image: none !important;
          border: 1px solid var(--crl-green) !important;
          color: var(--crl-green-fg) !important;
          box-shadow: none !important;
        }

        html[data-crl-theme] .exportGreenButton:hover:not(:disabled),
        html[data-crl-theme] .toolbarButton.exportGreenButton:hover:not(:disabled) {
          background: var(--crl-green-hover) !important;
          border-color: var(--crl-green-hover) !important;
          color: var(--crl-green-fg) !important;
        }

        html[data-crl-theme] .exportGreenButton:disabled {
          opacity: .55 !important;
        }

        html[data-crl-theme] .toolbarButton:hover,
        html[data-crl-theme] .smallButton:hover,
        html[data-crl-theme] .secondaryButton:hover,
        html[data-crl-theme] .importGreenButton:hover,
        html[data-crl-theme] .softButton:hover {
          border-color: var(--crl-blue) !important;
          background: var(--crl-hover) !important;
        }

        html[data-crl-theme] .primaryBlueButton,
        html[data-crl-theme] .toolbarButton.primaryBlueButton {
          background: var(--crl-active-bg) !important;
          border: 1px solid var(--crl-active-bg) !important;
          color: var(--crl-active-fg) !important;
        }

        /* view / period / activity tabs */
        html[data-crl-theme] .recordViewTab,
        html[data-crl-theme] .periodTab,
        html[data-crl-theme] .activityTab,
        html[data-crl-theme] .recordsHeaderActions .recordViewTab,
        html[data-crl-theme] .recordsHeaderActions .periodTab {
          background: var(--crl-surface) !important;
          border: 1px solid var(--crl-line) !important;
          color: var(--crl-ink) !important;
          box-shadow: none !important;
        }

        html[data-crl-theme] .recordViewTab.active,
        html[data-crl-theme] .periodTab.active,
        html[data-crl-theme] .activityTab.active,
        html[data-crl-theme] .recordsHeaderActions .recordViewTab.active,
        html[data-crl-theme] .recordsHeaderActions .periodTab.active {
          background: var(--crl-active-bg) !important;
          border-color: var(--crl-active-bg) !important;
          color: var(--crl-active-fg) !important;
        }

        /* Flat in BOTH themes: no elevation may differ across a theme switch. */
        html[data-crl-theme] .welcomeCard,
        html[data-crl-theme] .panel,
        html[data-crl-theme] .statCard,
        html[data-crl-theme] .analyticsCard,
        html[data-crl-theme] .summaryMetricCard,
        html[data-crl-theme] .busyCard,
        html[data-crl-theme] .modal,
        html[data-crl-theme] .toolbar,
        html[data-crl-theme] .tableWrap,
        html[data-crl-theme] .summaryTableWrap,
        html[data-crl-theme] .recordTemplateScroller,
        html[data-crl-theme] .toolbarButton,
        html[data-crl-theme] .smallButton,
        html[data-crl-theme] .secondaryButton,
        html[data-crl-theme] .addRowButton,
        html[data-crl-theme] .refreshButton,
        html[data-crl-theme] .copyButton,
        html[data-crl-theme] .recordViewTab,
        html[data-crl-theme] .periodTab,
        html[data-crl-theme] .activityTab,
        html[data-crl-theme] .bentoTile,
        html[data-crl-theme] .bentoHome,
        html[data-crl-theme] .bentoClose,
        html[data-crl-theme] .bentoLogout,
        html[data-crl-theme] .bentoHomeToggle {
          box-shadow: none !important;
        }

        /* Deep table selectors: match the legacy specificity so both themes agree. */
        html[data-crl-theme] .templateSummaryTable th,
        html[data-crl-theme] .templateSummaryTable thead th,
        html[data-crl-theme] .templateSummaryTable tbody td,
        html[data-crl-theme] .recordTemplateTable th,
        html[data-crl-theme] .recordTemplateTable thead th,
        html[data-crl-theme] .recordTemplateTable tbody td,
        html[data-crl-theme] .recordTemplateTable tbody tr:nth-child(even) td,
        html[data-crl-theme] .summaryDetailTable th,
        html[data-crl-theme] .summaryDetailTable td,
        html[data-crl-theme] .classRecordTitleRow th,
        html[data-crl-theme] .classRecordLanguageRow th,
        html[data-crl-theme] .classRecordGroupRow th,
        html[data-crl-theme] .classRecordSubheadRow th {
          background: transparent !important;
          background-image: none !important;
          border-color: var(--crl-line) !important;
          color: var(--crl-text) !important;
          text-shadow: none !important;
        }

        /* tables: horizontal hairlines only, in both modes */
        html[data-crl-theme] table,
        html[data-crl-theme] thead,
        html[data-crl-theme] tbody,
        html[data-crl-theme] tr,
        html[data-crl-theme] th,
        html[data-crl-theme] td {
          background: transparent !important;
          background-image: none !important;
        }

        html[data-crl-theme] th,
        html[data-crl-theme] td {
          border-left: 0 !important;
          border-right: 0 !important;
          border-top: 0 !important;
          border-bottom: 1px solid var(--crl-line) !important;
          color: var(--crl-text) !important;
        }

        html[data-crl-theme] thead th {
          border-bottom: 1px solid var(--crl-line-strong) !important;
          color: var(--crl-muted) !important;
        }

        html[data-crl-theme] tbody tr:hover td {
          background: var(--crl-hover) !important;
        }

        html[data-crl-theme] .learnerRoster .badge,
        html[data-crl-theme] .badge {
          background: transparent !important;
          border: 0 !important;
          border-bottom: 2px solid currentColor !important;
          border-radius: 0 !important;
          padding: 0 0 2px !important;
          box-shadow: none !important;
        }

        /* ==================================================================
           DARK MODE LEGIBILITY
           Legacy rules paint headings, stat numbers and status badges with
           dark ink that disappears on the dark surface. Re-tint them.
           ================================================================== */

        /* headings + primary values -> off-white */
        html[data-crl-theme="dark"] .topbarTitle,
        html[data-crl-theme="dark"] .pageTitle,
        html[data-crl-theme="dark"] .panelHeaderTitle,
        html[data-crl-theme="dark"] .nameStrong,
        html[data-crl-theme="dark"] .welcomeCard h2,
        html[data-crl-theme="dark"] .analyticsCard h3,
        html[data-crl-theme="dark"] .chartTitleSimple,
        html[data-crl-theme="dark"] .summaryDetailTitle,
        html[data-crl-theme="dark"] .summaryMetricTitle,
        html[data-crl-theme="dark"] .summaryMetricRow strong,
        html[data-crl-theme="dark"] .modalHeader h2,
        html[data-crl-theme="dark"] .twoFactorModalHeader h2,
        html[data-crl-theme="dark"] .twoFactorSetupTitle,
        html[data-crl-theme="dark"] .twoFactorStep strong,
        html[data-crl-theme="dark"] .twoFactorManualTitle,
        html[data-crl-theme="dark"] .twoFactorSecurityNote strong,
        html[data-crl-theme="dark"] .twoFactorCodeLabel,
        html[data-crl-theme="dark"] .securityCardTitle,
        html[data-crl-theme="dark"] .securityDropdownTitle,
        html[data-crl-theme="dark"] .profileDisplayName,
        html[data-crl-theme="dark"] .profileValue,
        html[data-crl-theme="dark"] .recordTemplateMeta strong,
        html[data-crl-theme="dark"] .recordTemplateTeacher strong,
        html[data-crl-theme="dark"] .busyCard strong,
        html[data-crl-theme="dark"] .bulkDeleteConfirmBody h3,
        html[data-crl-theme="dark"] .emptyState h3,
        html[data-crl-theme="dark"] .learnerEntryNumber,
        html[data-crl-theme="dark"] .analyticsValue,
        html[data-crl-theme="dark"] .barTop {
          color: var(--crl-ink) !important;
        }

        /* secondary copy -> muted */
        html[data-crl-theme="dark"] .panelHeaderSub,
        html[data-crl-theme="dark"] .summaryMetricRow,
        html[data-crl-theme="dark"] .securityCardText,
        html[data-crl-theme="dark"] .pageSub,
        html[data-crl-theme="dark"] .formLabel,
        html[data-crl-theme="dark"] .statLabel,
        html[data-crl-theme="dark"] .emptyState p,
        html[data-crl-theme="dark"] .classRecordDropZone,
        html[data-crl-theme="dark"] .securityDropdownChevron,
        html[data-crl-theme="dark"] .modalHeaderHint {
          color: var(--crl-muted) !important;
        }

        /* stat numbers keep their colour coding, lifted for dark surfaces */
        html[data-crl-theme="dark"] .statNumber.blue,
        html[data-crl-theme="dark"] .blue { color: #8fb0d9 !important; }
        html[data-crl-theme="dark"] .statNumber.green,
        html[data-crl-theme="dark"] .green { color: #86c2a2 !important; }
        html[data-crl-theme="dark"] .statNumber.orange,
        html[data-crl-theme="dark"] .orange { color: #d4ad74 !important; }
        html[data-crl-theme="dark"] .statNumber.red,
        html[data-crl-theme="dark"] .red { color: #e08b83 !important; }

        /* status / profile badges (e.g. "Completed: BoSY") -> readable tints */
        html[data-crl-theme="dark"] .badge.neutral { color: #a9b4c7 !important; }
        html[data-crl-theme="dark"] .badge.info { color: #9db6d8 !important; }
        html[data-crl-theme="dark"] .badge.grade { color: #86c2a2 !important; }
        html[data-crl-theme="dark"] .badge.danger { color: #e08b83 !important; }
        html[data-crl-theme="dark"] .badge.warning { color: #d4ad74 !important; }

        /* table header labels + cell text */
        html[data-crl-theme="dark"] .templateSummaryTable th,
        html[data-crl-theme="dark"] .recordTemplateTable th,
        html[data-crl-theme="dark"] .classRecordLanguageRow th,
        html[data-crl-theme="dark"] .classRecordGroupRow th,
        html[data-crl-theme="dark"] .classRecordSubheadRow th,
        html[data-crl-theme="dark"] .summaryDetailTable th {
          color: var(--crl-muted) !important;
        }

        html[data-crl-theme="dark"] .templateSummaryTable tbody td,
        html[data-crl-theme="dark"] .recordTemplateTable tbody td,
        html[data-crl-theme="dark"] .summaryDetailTable td,
        html[data-crl-theme="dark"] .recordTemplateMeta,
        html[data-crl-theme="dark"] .recordTemplateTeacher {
          color: var(--crl-text) !important;
        }

        /* inputs + text areas keep dark surfaces readable */
        html[data-crl-theme="dark"] .formTextarea,
        html[data-crl-theme="dark"] .twoFactorLargeCodeInput,
        html[data-crl-theme="dark"] .selectInput,
        html[data-crl-theme="dark"] .twoFactorSetupBox,
        html[data-crl-theme="dark"] .securityCodeInput {
          background: var(--crl-surface) !important;
          border-color: var(--crl-line) !important;
          color: var(--crl-text) !important;
        }

        /* small ghost buttons in dark mode */
        html[data-crl-theme="dark"] .smallButton,
        html[data-crl-theme="dark"] .smallButton:hover,
        html[data-crl-theme="dark"] .smallButton.primary,
        html[data-crl-theme="dark"] .recordViewTab:hover,
        html[data-crl-theme="dark"] .activityTab.active,
        html[data-crl-theme="dark"] .manageAssessmentPanel .periodTab {
          color: var(--crl-ink) !important;
        }

        /* ==================================================================
           COMPONENT FIXES
           ================================================================== */

        /* Class record title: the in-table copy spanned all 11 columns of a
           1500px-wide table, so it sat off-centre and scrolled away. Keep one
           static, centred title above the table instead. */
        html[data-crl-theme] .recordTemplateMeta {
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 8px;
        }

        html[data-crl-theme] .recordTemplateMeta > div:first-child {
          text-align: center;
        }

        html[data-crl-theme] .recordTemplateMeta strong {
          display: block;
          text-align: center;
        }

        html[data-crl-theme] .recordTemplateTeacher {
          justify-content: center;
        }

        html[data-crl-theme] .classRecordTitleRow {
          display: none !important;
        }

        /* Assessment Records joins the other panels at the top of the tab. */
        html[data-crl-theme] .recordsMainPanel {
          margin-top: 0 !important;
          margin-bottom: 18px !important;
        }

        /* These panels carried a large viewport-relative top offset, pushing
           them well below the Conduct panel. Align them with it. */
        html[data-crl-theme] .manageAssessmentPanel,
        html[data-crl-theme] .analyticsMainPanel,
        html[data-crl-theme] .profileMainPanel {
          margin-top: 0 !important;
          margin-bottom: 18px !important;
        }

        /* ---------- overlays: one consistent type scale ---------- */
        html[data-crl-theme] .modalHeader h2,
        html[data-crl-theme] .logoutModal h2,
        html[data-crl-theme] .multiLearnerModal .modalHeader h2,
        html[data-crl-theme] .bulkDeleteConfirmBody h2,
        html[data-crl-theme] .bulkDeleteConfirmBody h3,
        html[data-crl-theme] .twoFactorModalHeader h2 {
          font-size: 20px !important;
          line-height: 1.25 !important;
          color: var(--crl-ink) !important;
        }

        html[data-crl-theme] .modalHeaderHint,
        html[data-crl-theme] .multiLearnerModal .modalHeaderHint,
        html[data-crl-theme] .multiLearnerModal .bulkFormHeader,
        html[data-crl-theme] .bulkDeleteConfirmBody p {
          font-size: 13px !important;
        }

        html[data-crl-theme] .modalBody,
        html[data-crl-theme] .modalBody p,
        html[data-crl-theme] .logoutModal p {
          font-size: 14px !important;
        }

        html[data-crl-theme] .multiLearnerModal .learnerEntryNumber {
          font-size: 12px !important;
        }

        /* ---------- Security & Privacy: quiet icons ---------- */
        html[data-crl-theme] .securityDropdownIcon,
        html[data-crl-theme] .securityCardIcon {
          width: 40px !important;
          height: 40px !important;
          border-radius: 11px !important;
          background: var(--crl-surface-2) !important;
          color: var(--crl-blue) !important;
          font-size: 0 !important;
          box-shadow: none !important;
        }

        html[data-crl-theme] .securityDropdownIcon svg,
        html[data-crl-theme] .securityCardIcon svg {
          display: block;
        }

        /* Plain chevron instead of a filled circle with a glyph. */
        html[data-crl-theme] .securityDropdownChevron {
          width: auto !important;
          height: auto !important;
          border-radius: 0 !important;
          background: transparent !important;
          color: var(--crl-muted) !important;
          font-size: 0 !important;
          place-items: center;
          transition: transform 200ms ease-out;
        }

        html[data-crl-theme] .securityDropdownChevron svg {
          display: block;
        }

        html[data-crl-theme] .securityDropdownChevron.open {
          transform: rotate(180deg);
        }

        /* ---------- responsive bento ---------- */
        @media (max-width: 1280px) {
          .bentoGrid { grid-template-columns: minmax(0, 24rem) minmax(0, 1fr); }
          .bentoBlocks { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
          .bentoTile { min-height: 150px; padding: 22px; gap: 22px; }
        }

        @media (max-width: 1024px) {
          .teacherShell.isBento { padding: 24px 20px 44px; }
          .bentoGrid { grid-template-columns: 1fr !important; }
          .bentoHome { grid-column: 1; }
          .bentoBlocks { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
          .teacherShell.isExpanded .topbar { padding: 12px 22px !important; }
          .teacherShell.isExpanded .content { padding: 18px 22px 34px !important; }
        }

        @media (max-width: 720px) {
          .teacherShell.isBento { padding: 16px 12px 30px; }
          .bentoGrid { grid-template-columns: 1fr !important; gap: 12px; }

          /* Home shrinks to a small card with its own expand control. */
          .bentoHomeHead {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
          }

          .bentoHome { padding: 14px; gap: 12px; }
          .bentoHome.isCollapsed .bentoHomeBody { display: none; }

          .bentoBlocks {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .bentoTile {
            min-height: 104px;
            flex-direction: column;
            align-items: flex-start;
            justify-content: space-between;
            gap: 14px;
            padding: 16px;
          }

          .bentoIcon { width: 40px; height: 40px; font-size: 17px; }
          .bentoLabel { font-size: 13px; }
          .bentoHead { gap: 10px; margin-bottom: 16px; }
          .bentoBrand { gap: 10px; }
          .bentoLogo { height: 44px; }
          .bentoLogout { min-height: 38px; padding: 0 14px; font-size: 12px; }
          .teacherShell.isExpanded .content { padding: 14px !important; }
          .teacherShell.isExpanded .topbar { padding: 10px 14px !important; }
        }

        /* ==================================================================
           MOBILE TABLES
           Only the Enrolled Learners roster (fixed 7 columns) becomes a card
           list, because it is the one table whose columns have known labels.
           Every other table keeps its real structure and scrolls sideways with
           its headers aligned, instead of collapsing into unlabelled rows.
           ================================================================== */
        @media (max-width: 900px) {
          .tableWrap,
          .summaryTableWrap,
          .summaryDetailScroller,
          .recordTemplateScroller {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior-x: contain;
            max-width: 100%;
            /* Scrolling-shadow affordance: the edge shades only while there is
               more table in that direction. */
            background-image:
              linear-gradient(to right, var(--crl-surface) 40%, transparent),
              linear-gradient(to left, var(--crl-surface) 40%, transparent),
              linear-gradient(to right, rgba(26, 43, 76, .16), transparent),
              linear-gradient(to left, rgba(26, 43, 76, .16), transparent);
            background-position: left center, right center, left center, right center;
            background-repeat: no-repeat;
            background-size: 26px 100%, 26px 100%, 14px 100%, 14px 100%;
            background-attachment: local, local, scroll, scroll;
          }

          /* Keep headers rendered and aligned with the data. */
          .tableWrap thead,
          .summaryTableWrap thead,
          .summaryDetailScroller thead,
          .recordTemplateScroller thead {
            display: table-header-group !important;
          }

          .tableWrap table,
          .summaryTableWrap table {
            min-width: 820px !important;
            width: auto !important;
          }

          /* The Home overview has only 7 narrow columns - it needs far less
             room to stay readable than the wide records tables. */
          .bentoHome .latestLearnerOverviewTable table,
          .latestLearnerOverviewTable table {
            min-width: 640px !important;
            width: auto !important;
          }

          .tableWrap th,
          .tableWrap td,
          .summaryTableWrap th,
          .summaryTableWrap td {
            white-space: nowrap;
          }

          /* Visible thin scrollbar as a second affordance. */
          .tableWrap::-webkit-scrollbar,
          .summaryTableWrap::-webkit-scrollbar,
          .summaryDetailScroller::-webkit-scrollbar,
          .recordTemplateScroller::-webkit-scrollbar {
            height: 7px;
          }

          .tableWrap::-webkit-scrollbar-thumb,
          .summaryTableWrap::-webkit-scrollbar-thumb,
          .summaryDetailScroller::-webkit-scrollbar-thumb,
          .recordTemplateScroller::-webkit-scrollbar-thumb {
            background: var(--crl-line-strong);
            border-radius: 999px;
          }

          .tableWrap,
          .summaryTableWrap,
          .summaryDetailScroller,
          .recordTemplateScroller {
            scrollbar-width: thin;
            scrollbar-color: var(--crl-line-strong) transparent;
          }

          /* Records header actions: never overflow off-screen. */
          .recordsHeaderActions {
            flex-wrap: wrap !important;
            justify-content: flex-start !important;
            gap: 8px !important;
            width: 100%;
          }

          .recordViewTabs,
          .periodTabs,
          .activityTabs {
            flex-wrap: wrap !important;
            max-width: 100%;
          }

          .recordViewTab,
          .periodTab,
          .activityTab,
          .toolbarButton,
          .smallButton,
          .secondaryButton,
          .exportButton {
            min-height: 44px !important;
          }
        }

        /* phones: the roster becomes a labelled card list; the bento grid and
           header actions keep their compact layout. */
        @media (max-width: 640px) {
          .learnerRoster table {
            min-width: 0 !important;
            width: 100% !important;
          }

          .learnerRoster thead { display: none !important; }

          .learnerRoster tbody tr {
            display: block !important;
            padding: 12px 0;
            border-bottom: 1px solid var(--crl-line) !important;
          }

          .learnerRoster tbody td {
            display: flex !important;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            border: 0 !important;
            padding: 6px 2px !important;
            text-align: right;
            white-space: normal !important;
          }

          .learnerRoster tbody td::before {
            flex: 0 0 auto;
            color: var(--crl-muted);
            font-size: 11px;
            font-weight: 800;
            text-align: left;
          }

          .learnerRoster tbody td:nth-child(1) {
            justify-content: flex-start;
            padding-bottom: 10px !important;
          }

          .learnerRoster tbody td:nth-child(1)::before { content: "Select"; }
          .learnerRoster tbody td:nth-child(2)::before { content: "LRN"; }
          .learnerRoster tbody td:nth-child(3)::before { content: "Name"; }
          .learnerRoster tbody td:nth-child(4)::before { content: "Sex"; }
          .learnerRoster tbody td:nth-child(5)::before { content: "Status"; }
          .learnerRoster tbody td:nth-child(6)::before { content: "Assessment"; }
          .learnerRoster tbody td:nth-child(7)::before { content: "Actions"; }

          .learnerRoster tbody td:nth-child(6),
          .learnerRoster tbody td:nth-child(7) { align-items: flex-start; }

          .learnerRoster .inlineActions { justify-content: flex-end; flex-wrap: wrap; }
          .learnerRoster .learnerCheckbox { width: 22px; height: 22px; }

          /* On phones let the row box grow instead of nesting a second scroll. */
          .bentoHome .latestLearnerOverviewTable {
            max-height: none !important;
            overflow-y: visible !important;
          }
        }
/* period actions (BoSY / MoSY / EoSY) as outlined text badges */
        html[data-crl-theme] .inlineActions .smallButton {
          border-width: 1px !important;
          border-style: solid !important;
          border-radius: 8px !important;
          font-size: 11px !important;
          font-weight: 800 !important;
          min-height: 30px !important;
          padding: 0 10px !important;
        }

        /* period actions (BoSY / MoSY / EoSY) as outlined text badges */
        html:not([data-crl-theme="dark"]) .inlineActions .smallButton {
          background: transparent !important;
          border-color: #dce3ec !important;
          color: #4a6fa5 !important;
        }

        html:not([data-crl-theme="dark"]) .inlineActions .smallButton:hover:not(:disabled) {
          border-color: #4a6fa5 !important;
          background: #edf1f7 !important;
        }

        html:not([data-crl-theme="dark"]) .inlineActions .smallButton:disabled {
          opacity: .45 !important;
          border-color: #dce3ec !important;
        }/* View / Delete as plain text links */
        html[data-crl-theme] .learnerRoster .inlineActions .smallButton {
          border-width: 0 !important;
          padding: 2px 2px !important;
          min-height: 0 !important;
          border-bottom-width: 1px !important;
          border-bottom-style: solid !important;
          border-radius: 0 !important;
          font-size: 12px !important;
        }

        /* View / Delete as plain text links */
        html:not([data-crl-theme="dark"]) .learnerRoster .inlineActions .smallButton {
          border-bottom-color: transparent !important;
          background: transparent !important;
        }

        html:not([data-crl-theme="dark"]) .learnerRoster .inlineActions .smallButton:hover {
          border-bottom-color: #1a2b4c !important;
          background: transparent !important;
        }

        html:not([data-crl-theme="dark"]) .learnerRoster .inlineActions .smallButton.redSmall {
          color: #c0392b !important;
        }

        html:not([data-crl-theme="dark"]) .learnerRoster .inlineActions .smallButton.redSmall:hover {
          border-bottom-color: #c0392b !important;
        }/* status badge (No Assessment / BoSY / MoSY / EoSY) as a text badge */
        html[data-crl-theme] .learnerRoster .badge {
          border-width: 0 !important;
          border-radius: 0 !important;
          padding: 0 0 2px !important;
          border-bottom-width: 2px !important;
          border-bottom-style: solid !important;
          font-size: 11px !important;
          font-weight: 800 !important;
        }

        /* status badge (No Assessment / BoSY / MoSY / EoSY) as a text badge */
        html:not([data-crl-theme="dark"]) .learnerRoster .badge {
          background: transparent !important;
          border-bottom-color: currentColor !important;
        }

        @media (prefers-reduced-motion: reduce) {
          .bentoMenu,
          .teacherShell.isExpanded .main {
            animation: none !important;
          }
        }

        /* ---------------------------------------------------------------- */
        /* Item selection: fixed default vs randomise per assessment        */
        /* ---------------------------------------------------------------- */
        .contentModeCard {
          margin: 18px 16px 6px;
          padding: 12px 14px;
          border: 1px solid #dfe6f0;
          border-radius: 12px;
          background: #f8fafc;
        }

        .contentModeHeading {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 10px;
        }

        .contentModeHeadingLabel {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #2a3a55;
        }

        .contentModeHeadingPeriod {
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 999px;
          background: #e5ecf6;
          color: #1a2b4c;
        }

        .contentModeHeadingUse {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
        }

        .contentModeOptions {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        }

        .contentModeOption {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          width: 100%;
          text-align: left;
          padding: 10px 12px;
          border: 1px solid #dbe3ee;
          border-radius: 10px;
          background: #ffffff;
          cursor: pointer;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .contentModeOption:hover:not(:disabled) {
          border-color: #9fb4d0;
        }

        .contentModeOption:disabled {
          opacity: 0.65;
          cursor: progress;
        }

        .contentModeOption.isSelected {
          border-color: #1a2b4c;
          box-shadow: inset 0 0 0 1px #1a2b4c;
        }

        .contentModeOptionMark {
          flex: 0 0 auto;
          width: 15px;
          height: 15px;
          margin-top: 1px;
          border: 2px solid #b6c2d4;
          border-radius: 50%;
          background: #ffffff;
        }

        .contentModeOption.isSelected .contentModeOptionMark {
          border-color: #1a2b4c;
          box-shadow: inset 0 0 0 3px #ffffff;
          background: #1a2b4c;
        }

        .contentModeOptionText {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }

        .contentModeOptionLabel {
          font-size: 12px;
          font-weight: 800;
          color: #1a2b4c;
        }

        .contentModeOptionHint {
          font-size: 11px;
          line-height: 1.45;
          font-weight: 500;
          color: #5b6b82;
        }

        html[data-crl-theme="dark"] .contentModeCard {
          border-color: #2c3446;
          background: #121826;
        }

        html[data-crl-theme="dark"] .contentModeHeadingLabel,
        html[data-crl-theme="dark"] .contentModeOptionLabel {
          color: #e6ecf7;
        }

        html[data-crl-theme="dark"] .contentModeHeadingPeriod {
          background: #24304a;
          color: #dbe6f7;
        }

        html[data-crl-theme="dark"] .contentModeHeadingUse,
        html[data-crl-theme="dark"] .contentModeOptionHint {
          color: #96a3ba;
        }

        html[data-crl-theme="dark"] .contentModeOption {
          border-color: #2c3446;
          background: #171f30;
        }

        html[data-crl-theme="dark"] .contentModeOption.isSelected {
          border-color: #7fa4dd;
          box-shadow: inset 0 0 0 1px #7fa4dd;
        }

        html[data-crl-theme="dark"] .contentModeOptionMark {
          border-color: #47536b;
          background: #171f30;
        }

        html[data-crl-theme="dark"] .contentModeOption.isSelected .contentModeOptionMark {
          border-color: #7fa4dd;
          box-shadow: inset 0 0 0 3px #171f30;
          background: #7fa4dd;
        }

        @media (max-width: 560px) {
          .contentModeOptions {
            grid-template-columns: 1fr;
          }
        }

        /* Which of the saved items the fixed default administers. */
        .contentModeDefaults {
          display: grid;
          gap: 3px;
          margin-top: 11px;
          padding-top: 10px;
          border-top: 1px solid #e4ebf4;
          font-size: 11px;
          line-height: 1.5;
          color: #46536b;
        }

        .contentModeDefaults strong {
          color: #1a2b4c;
        }

        .contentModeDefaultsHint {
          color: #64748b;
        }

        .contentDefaultToggle {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
          font-size: 10px;
          font-weight: 800;
          color: #6b7789;
          white-space: nowrap;
        }

        .contentDefaultToggle input {
          width: 15px;
          height: 15px;
          accent-color: #1a2b4c;
          cursor: pointer;
        }

        .contentDefaultToggle input:disabled {
          cursor: progress;
        }

        .contentDefaultToggle input:checked + span {
          color: #1a2b4c;
        }

        html[data-crl-theme="dark"] .contentModeDefaults {
          border-top-color: #263047;
          color: #b9c5d8;
        }

        html[data-crl-theme="dark"] .contentModeDefaults strong {
          color: #e6ecf7;
        }

        html[data-crl-theme="dark"] .contentModeDefaultsHint,
        html[data-crl-theme="dark"] .contentDefaultToggle {
          color: #96a3ba;
        }

        html[data-crl-theme="dark"] .contentDefaultToggle input {
          accent-color: #7fa4dd;
        }

        html[data-crl-theme="dark"] .contentDefaultToggle input:checked + span {
          color: #dbe6f7;
        }

        /* ---------------------------------------------------------------- */
        /* Story import: pick a file, read it back, then save or discard    */
        /* ---------------------------------------------------------------- */
        .activityItemActions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .storyImportFileInput {
          display: none;
        }

        .storyImportStatus {
          margin: 0;
          font-size: 12px;
          font-weight: 700;
          color: #4a5b74;
        }

        .storyImportError {
          border: 1px solid #e3b7b7;
          border-radius: 10px;
          background: #fdf3f3;
          padding: 12px 14px;
          color: #7d2b2b;
          font-size: 12px;
          line-height: 1.55;
        }

        .storyImportError strong {
          display: block;
          margin-bottom: 6px;
          font-size: 13px;
        }

        .storyImportError p {
          margin: 0 0 6px;
        }

        .storyImportError p:last-child {
          margin-bottom: 0;
        }

        .storyImportSource {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .storyImportFormat {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          padding: 3px 9px;
          border-radius: 999px;
          background: #e5ecf6;
          color: #1a2b4c;
        }

        .storyImportFileName {
          font-size: 12px;
          font-weight: 700;
          color: #2a3a55;
          overflow-wrap: anywhere;
        }

        .storyImportNote {
          margin: 0;
          font-size: 11px;
          line-height: 1.5;
          color: #64748b;
        }

        .storyImportWarnings {
          margin: 0;
          padding: 10px 12px 10px 28px;
          border: 1px solid #e6d3a8;
          border-radius: 10px;
          background: #fdf8ec;
          color: #7a5a13;
          font-size: 11px;
          line-height: 1.55;
        }

        .storyImportWarnings li + li {
          margin-top: 6px;
        }

        .storyImportText {
          min-height: 34vh;
          font-size: 13px;
          line-height: 1.7;
          font-family: Arial, Helvetica, sans-serif;
        }

        .storyImportTextActions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        html[data-crl-theme="dark"] .storyImportStatus,
        html[data-crl-theme="dark"] .storyImportFileName {
          color: #dbe6f7;
        }

        html[data-crl-theme="dark"] .storyImportError {
          border-color: #6d3a3a;
          background: #2a1a1a;
          color: #f0c9c9;
        }

        html[data-crl-theme="dark"] .storyImportFormat {
          background: #24304a;
          color: #dbe6f7;
        }

        html[data-crl-theme="dark"] .storyImportNote {
          color: #96a3ba;
        }

        html[data-crl-theme="dark"] .storyImportWarnings {
          border-color: #5c4a1f;
          background: #2a2415;
          color: #e8d9a8;
        }

        .recordsMainPanel .recordsPanelHeader {
          justify-content: center;
        }

        .recordsMainPanel .recordsHeaderActions {
          width: 100%;
          justify-content: center !important;
        }

        html[data-crl-theme] .toolbarButton.assessmentSaveButton {
          background: var(--crl-green) !important;
          border-color: var(--crl-green) !important;
          color: var(--crl-green-fg) !important;
        }

        html[data-crl-theme] .toolbarButton.assessmentSaveButton:hover:not(:disabled) {
          background: var(--crl-green-hover) !important;
          border-color: var(--crl-green-hover) !important;
          color: var(--crl-green-fg) !important;
        }

        html[data-crl-theme] .toolbarButton.activityAddButton {
          background: var(--crl-active-bg) !important;
          border-color: var(--crl-active-bg) !important;
          color: var(--crl-active-fg) !important;
        }

        html[data-crl-theme] .toolbarButton.activityAddButton:hover:not(:disabled) {
          background: var(--crl-blue) !important;
          border-color: var(--crl-blue) !important;
          color: #ffffff !important;
        }

        html[data-crl-theme] .toolbarButton.storyImportButton {
          background: #e5eef8 !important;
          border-color: #aac0dc !important;
          color: #274e75 !important;
        }

        html[data-crl-theme] .toolbarButton.storyImportButton:hover:not(:disabled) {
          background: #d7e6f5 !important;
          border-color: #7899c1 !important;
          color: #1d4168 !important;
        }

        html[data-crl-theme="dark"] .toolbarButton.storyImportButton {
          background: #263a54 !important;
          border-color: #476685 !important;
          color: #d7e7f7 !important;
        }

        html[data-crl-theme] .storyImportDropZone {
          border-color: #aac0dc !important;
          background: #f4f8fc !important;
        }

        html[data-crl-theme="dark"] .storyImportDropZone {
          border-color: #476685 !important;
          background: #182538 !important;
        }

        /* Records are document previews, not selectable rows. Keep every cell
           visually unchanged when a mouse or pen passes over it. */
        html[data-crl-theme] .recordsMainPanel tbody tr {
          transition: none !important;
        }

        html[data-crl-theme] .recordsMainPanel tbody tr:hover td {
          background: transparent !important;
        }

        @media (max-width: 760px) {
          .recordsMainPanel .recordsPanelHeader {
            padding-inline: 12px;
          }

          .recordsMainPanel .recordsHeaderActions {
            justify-content: center !important;
          }

          .recordsMainPanel .recordViewTabs,
          .recordsMainPanel .periodTabs {
            justify-content: center;
          }
        }

        /* Manage Assessment rows only expose interaction on Edit/Delete. The
           generic dashboard table hover used to wash out the item itself. */
        html[data-crl-theme] .activityItemsTable tbody tr {
          transition: none !important;
        }

        html[data-crl-theme] .activityItemsTable tbody tr:hover td {
          background: transparent !important;
        }

        @media (max-width: 760px) {
          html[data-crl-theme] .activityItemsTable tbody tr {
            border: 1px solid #dce3ec !important;
            background: #ffffff !important;
          }

          html[data-crl-theme] .activityItemsTable tbody td {
            border: 0 !important;
            background: transparent !important;
          }

          html[data-crl-theme="dark"] .activityItemsTable tbody tr {
            border-color: #33405a !important;
            background: #131c2b !important;
          }
        }

        /* ---------------------------------------------------------------- */
        /* Scoresheet: the workbook printed as a grid                        */
        /* ---------------------------------------------------------------- */
        .scoresheetView {
          padding: 12px 14px 16px;
          background: #f4f2ed;
        }

        .scoresheetScroller {
          width: 100%;
          overflow: auto;
          border: 1px solid #747474;
          background: #ffffff;
          scrollbar-gutter: stable;
          overscroll-behavior-inline: contain;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-x pan-y;
        }

        /* One continuous sheet: every cell bordered, headings filled, exactly
           the rows and merges the exported workbook carries. */
        .scoresheetGrid {
          border-collapse: collapse;
          table-layout: fixed;
          width: 2188px;
          background: #ffffff;
          font-family: Arial, Helvetica, sans-serif !important;
        }

        .scoresheetGrid th,
        .scoresheetGrid td {
          border: 1px solid #333333;
          padding: 2px 4px;
          font-size: 11px;
          line-height: 1.15;
          font-weight: 400;
          text-transform: none;
          letter-spacing: normal;
          white-space: normal;
          vertical-align: middle;
          text-align: center;
          color: #171717;
          background: #ffffff;
          overflow-wrap: anywhere;
        }

        .scoresheetGrid tr:nth-child(1) { height: 29px; }
        .scoresheetGrid tr:nth-child(2) { height: 24px; }
        .scoresheetGrid tr:nth-child(3) { height: 36px; }
        .scoresheetGrid tr:nth-child(4) { height: 24px; }
        .scoresheetGrid tr:nth-child(5) { height: 23px; }
        .scoresheetGrid tr:nth-child(6) { height: 28px; }
        .scoresheetGrid tr:nth-child(7) { height: 25px; }
        .scoresheetGrid tr:nth-child(8) { height: 24px; }
        .scoresheetGrid tr:nth-child(9) { height: 23px; }
        .scoresheetGrid tr:nth-child(10) { height: 54px; }

        .scoresheetGrid .ssTitleRow td,
        .scoresheetGrid .ssSpacerRow td {
          border-color: #e7e7e7;
          background: #ffffff;
        }

        .scoresheetGrid .ssTitle {
          position: relative;
          padding: 0;
          text-align: left;
          color: #171717;
        }

        .ssVersion {
          position: absolute;
          left: 0;
          bottom: -20px;
          z-index: 1;
          padding-left: 2px;
          font-size: 11px;
          font-weight: 400;
        }

        .ssBranding {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 0 8px 0 360px;
          pointer-events: none;
        }

        .ssBranding img:first-child {
          width: 455px;
          height: 49px;
          object-fit: contain;
          object-position: left top;
        }

        .ssBranding img:last-child {
          width: 360px;
          height: 52px;
          object-fit: contain;
          object-position: right top;
        }

        .scoresheetGrid .ssSpacerRow td {
          padding: 0;
        }

        .scoresheetGrid .ssAssessmentRow > * {
          border-top: 2px solid #2f2f2f;
          border-bottom: 2px solid #2f2f2f;
        }

        .scoresheetGrid .ssAssessmentRow .ssLabel {
          background: #666666;
          color: #ffffff;
          text-align: center;
          font-size: 12px;
        }

        .scoresheetGrid .ssAssessmentRow .ssValue {
          background: #d9d9d9;
          font-size: 18px;
          text-align: right;
        }

        .scoresheetGrid .ssAssessmentRow .ssEmpty {
          position: relative;
          background: #8b8b8b;
        }

        .ssWorkbookTitle {
          position: absolute;
          right: 148px;
          top: 4px;
          width: 468px;
          padding: 4px 12px;
          border: 1px solid #bdbdbd;
          color: #ffffff;
          font-size: 20px;
          font-weight: 700;
          line-height: 1.05;
          text-align: center;
          white-space: nowrap;
        }

        /* Identity block: label on the left of the block, value beside it. */
        .scoresheetGrid .ssLabel {
          text-align: right;
          font-weight: 700;
          background: #d9d9d9;
          color: #171717;
        }

        .scoresheetGrid .ssValue {
          text-align: left;
          background: #d9d9d9;
        }

        .scoresheetGrid .ssNumber {
          text-align: center;
        }

        .scoresheetGrid .ssGroupHead {
          font-weight: 700;
          background: #d9d9d9;
          color: #171717;
        }

        .scoresheetGrid .ssLegend {
          font-weight: 700;
          font-size: 9px;
          background: #ffffff;
          color: #171717;
        }

        .scoresheetGrid .ssNote {
          font-size: 9px;
          font-style: italic;
          background: #ffffff;
          color: #303030;
        }

        .scoresheetGrid .ssColumnRow th {
          font-weight: 700;
          background: #b7b7b7;
          color: #171717;
          border-width: 2px 1px;
        }

        .scoresheetGrid .ssTimeHeader {
          padding: 0;
        }

        .ssTimeHeaderLayout {
          display: grid;
          grid-template-rows: 23px 1fr;
          width: 100%;
          height: 52px;
        }

        .ssTimeHeaderLayout > span:first-child {
          display: grid;
          place-items: center;
          border-bottom: 1px solid #333333;
        }

        .ssTimeHeaderParts {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }

        .ssTimeHeaderParts > span {
          display: grid;
          place-items: center;
        }

        .ssTimeHeaderParts > span + span {
          border-left: 1px solid #333333;
        }

        .scoresheetGrid .ssEmpty {
          background: #ffffff;
        }

        .scoresheetGrid .ssData {
          background: #ffffff;
        }

        .scoresheetGrid .ssData.ssText {
          text-align: left;
        }

        .scoresheetGrid .ssData.ssCentered {
          text-align: center;
          vertical-align: middle;
        }

        .scoresheetGrid .ssData.ssLevel {
          font-weight: 700;
        }

        .scoresheetGrid .ssReference {
          position: relative;
          padding: 0;
          background: #ffffff;
          overflow: visible;
          z-index: 1;
        }

        .scoresheetGrid .ssReference img {
          position: absolute;
          top: 0;
          left: 0;
          display: block;
          width: 130%;
          height: 100%;
          object-fit: fill;
          max-width: none;
          background: #ffffff;
        }

        .scoresheetGrid tbody tr:nth-child(n + 11) {
          height: 31px;
        }

        .scoresheetGrid tbody tr:nth-child(n + 11) td:nth-child(4),
        .scoresheetGrid tbody tr:nth-child(n + 11) td:nth-child(5),
        .scoresheetGrid tbody tr:nth-child(n + 11) td:nth-child(8),
        .scoresheetGrid tbody tr:nth-child(n + 11) td:nth-child(9),
        .scoresheetGrid tbody tr:nth-child(n + 11) td:nth-child(12),
        .scoresheetGrid tbody tr:nth-child(n + 11) td:nth-child(15),
        .scoresheetGrid tbody tr:nth-child(n + 11) td:nth-child(16) {
          background: #d9d9d9;
        }

        /*
         * A sheet does not highlight its rows. The dashboard's table styles do,
         * so the base cell colour is restated here; the filled header cells
         * keep their own colour, because a class selector outranks this one.
         */
        .scoresheetGrid tbody tr:hover td,
        .scoresheetGrid tbody tr:hover th {
          background: #ffffff;
        }

        html[data-crl-theme="dark"] .scoresheetGrid {
          background: #0f1622;
        }

        html[data-crl-theme="dark"] .scoresheetGrid th,
        html[data-crl-theme="dark"] .scoresheetGrid td {
          border-color: #33405a;
          background: #131c2b;
          color: #e6ecf7;
        }

        html[data-crl-theme="dark"] .scoresheetGrid .ssTitleRow td,
        html[data-crl-theme="dark"] .scoresheetGrid .ssSpacerRow td {
          border-color: transparent;
          background: transparent;
        }

        html[data-crl-theme="dark"] .scoresheetGrid .ssTitle {
          color: #e6ecf7;
        }

        html[data-crl-theme="dark"] .scoresheetGrid .ssLabel,
        html[data-crl-theme="dark"] .scoresheetGrid .ssGroupHead,
        html[data-crl-theme="dark"] .scoresheetGrid .ssColumnRow th {
          background: #1c2740;
          color: #dbe6f7;
        }

        html[data-crl-theme="dark"] .scoresheetGrid .ssLegend,
        html[data-crl-theme="dark"] .scoresheetGrid .ssNote {
          color: #a9b7cd;
        }

        html[data-crl-theme="dark"] .scoresheetGrid .ssLegend {
          background: #182238;
        }

        html[data-crl-theme="dark"] .scoresheetGrid .ssNote {
          background: #151e2f;
        }

        html[data-crl-theme="dark"] .scoresheetGrid .ssEmpty {
          background: #111a29;
        }

        html[data-crl-theme="dark"] .scoresheetGrid .ssData {
          background: #131c2b;
        }

        html[data-crl-theme="dark"] .scoresheetGrid tbody tr:hover td,
        html[data-crl-theme="dark"] .scoresheetGrid tbody tr:hover th {
          background: #131c2b;
        }

        /* A scoresheet is a document preview, so its workbook fills remain
           stable on hover and in either dashboard theme. */
        html[data-crl-theme] .scoresheetGrid th,
        html[data-crl-theme] .scoresheetGrid td {
          --scoresheet-cell: #ffffff;
          border-color: #333333 !important;
          background: var(--scoresheet-cell) !important;
          color: #171717 !important;
        }

        html[data-crl-theme] .scoresheetGrid .ssTitleRow td,
        html[data-crl-theme] .scoresheetGrid .ssSpacerRow td {
          border-color: #e7e7e7 !important;
        }

        html[data-crl-theme] .scoresheetGrid .ssLabel,
        html[data-crl-theme] .scoresheetGrid .ssValue,
        html[data-crl-theme] .scoresheetGrid .ssGroupHead {
          --scoresheet-cell: #d9d9d9;
        }

        html[data-crl-theme] .scoresheetGrid .ssAssessmentRow .ssLabel {
          --scoresheet-cell: #666666;
          color: #ffffff !important;
        }

        html[data-crl-theme] .scoresheetGrid .ssAssessmentRow .ssEmpty {
          --scoresheet-cell: #8b8b8b;
        }

        html[data-crl-theme] .scoresheetGrid .ssColumnRow th {
          --scoresheet-cell: #b7b7b7;
        }

        html[data-crl-theme] .scoresheetGrid tbody tr:nth-child(n + 11) td:nth-child(4),
        html[data-crl-theme] .scoresheetGrid tbody tr:nth-child(n + 11) td:nth-child(5),
        html[data-crl-theme] .scoresheetGrid tbody tr:nth-child(n + 11) td:nth-child(8),
        html[data-crl-theme] .scoresheetGrid tbody tr:nth-child(n + 11) td:nth-child(9),
        html[data-crl-theme] .scoresheetGrid tbody tr:nth-child(n + 11) td:nth-child(12),
        html[data-crl-theme] .scoresheetGrid tbody tr:nth-child(n + 11) td:nth-child(15),
        html[data-crl-theme] .scoresheetGrid tbody tr:nth-child(n + 11) td:nth-child(16) {
          --scoresheet-cell: #d9d9d9;
        }

        html[data-crl-theme] .scoresheetGrid .ssProfileGrade {
          --scoresheet-cell: #c6efce;
          color: #006100 !important;
        }

        html[data-crl-theme] .scoresheetGrid .ssProfileLow {
          --scoresheet-cell: #ffc7ce;
          color: #9c0006 !important;
        }

        html[data-crl-theme] .scoresheetGrid tr,
        html[data-crl-theme] .scoresheetGrid th,
        html[data-crl-theme] .scoresheetGrid td {
          transition: none !important;
        }

        html[data-crl-theme] .scoresheetGrid tbody tr:hover th,
        html[data-crl-theme] .scoresheetGrid tbody tr:hover td,
        html[data-crl-theme] .scoresheetGrid th:hover,
        html[data-crl-theme] .scoresheetGrid td:hover {
          background: var(--scoresheet-cell) !important;
          box-shadow: none !important;
          filter: none !important;
          transform: none !important;
        }

        /* Final records controls and Excel-style viewport scrollers. Keeping
           each table inside a viewport-height region leaves its native
           horizontal scrollbar available without a trip to the last row. */
        .summaryTableWrap,
        .summaryDetailScroller,
        .recordTemplateScroller,
        .scoresheetScroller {
          max-height: calc(100dvh - 260px);
          overflow: auto !important;
          scrollbar-gutter: stable;
          overscroll-behavior: contain;
        }

        .scoresheetControls {
          min-height: 46px;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }

        .scoresheetZoomControls,
        .scoresheetModeControls {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .scoresheetZoomControls {
          min-height: 38px;
          padding: 4px;
          border: 1px solid var(--crl-line);
          border-radius: 8px;
          background: var(--crl-surface);
        }

        .scoresheetZoomControls > span {
          min-width: 48px;
          color: var(--crl-muted);
          font-size: 11px;
          font-weight: 800;
          text-align: center;
        }

        .scoresheetControlButton,
        .scoresheetModeButton {
          min-height: 32px;
          border: 1px solid var(--crl-line);
          border-radius: 6px;
          background: var(--crl-surface);
          color: var(--crl-ink);
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }

        .scoresheetControlButton {
          width: 34px;
          padding: 0;
          font-size: 18px;
        }

        .scoresheetModeButton {
          padding: 0 12px;
        }

        .scoresheetModeButton.active {
          border-color: var(--crl-active-bg);
          background: var(--crl-active-bg);
          color: var(--crl-active-fg);
        }

        .scoresheetControlButton:disabled,
        .scoresheetModeButton:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        html[data-crl-theme] .toolbarButton.scoresheetSaveButton {
          background: var(--crl-green) !important;
          border-color: var(--crl-green) !important;
          color: var(--crl-green-fg) !important;
        }

        .scoresheetGrid {
          zoom: var(--scoresheet-zoom, 1);
        }

        .scoresheetGrid tr:nth-child(1) { height: 36px; }
        .scoresheetGrid tr:nth-child(2) { height: 24px; }
        .scoresheetGrid tr:nth-child(3) { height: 23px; }
        .scoresheetGrid tr:nth-child(4) { height: 28px; }
        .scoresheetGrid tr:nth-child(5) { height: 25px; }
        .scoresheetGrid tr:nth-child(6) { height: 24px; }
        .scoresheetGrid tr:nth-child(7) { height: 23px; }
        .scoresheetGrid tr:nth-child(8) { height: 54px; }
        .scoresheetGrid tbody tr:nth-child(n + 9) { height: 31px; }

        html[data-crl-theme] .scoresheetGrid tbody tr:nth-child(n + 9) td:nth-child(4),
        html[data-crl-theme] .scoresheetGrid tbody tr:nth-child(n + 9) td:nth-child(5),
        html[data-crl-theme] .scoresheetGrid tbody tr:nth-child(n + 9) td:nth-child(8),
        html[data-crl-theme] .scoresheetGrid tbody tr:nth-child(n + 9) td:nth-child(9),
        html[data-crl-theme] .scoresheetGrid tbody tr:nth-child(n + 9) td:nth-child(12),
        html[data-crl-theme] .scoresheetGrid tbody tr:nth-child(n + 9) td:nth-child(15),
        html[data-crl-theme] .scoresheetGrid tbody tr:nth-child(n + 9) td:nth-child(16) {
          --scoresheet-cell: #d9d9d9;
        }

        .scoresheetGrid .ssReference img {
          width: 100%;
          height: 100%;
          inset: 0;
        }

        .scoresheetInput {
          width: 100%;
          min-width: 0;
          height: 25px;
          padding: 2px 3px;
          border: 1px solid #7697bb;
          border-radius: 3px;
          background: #f5f9ff;
          color: #172b43;
          font: inherit;
          text-align: center;
        }

        .scoresheetInput:focus {
          outline: 2px solid #6f94bd;
          outline-offset: 0;
        }

        .scoresheetInput:disabled {
          border-color: transparent;
          background: transparent;
          opacity: .45;
        }

        .scoresheetTextInput {
          min-width: 150px;
          text-align: left;
        }

        .multiItemEditor {
          display: grid;
          gap: 12px;
        }

        .multiItemRow {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: end;
          gap: 10px;
        }

        .multiItemRemove {
          min-height: 52px;
          padding: 0 13px;
          border: 1px solid #e1aaa5;
          border-radius: 7px;
          background: #fff6f4;
          color: #9b2e22;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }

        .multiItemAdd {
          justify-self: start;
          min-height: 42px;
          color: var(--crl-active-bg) !important;
        }

        @media (pointer: coarse) {
          .summaryTableWrap,
          .summaryDetailScroller,
          .recordTemplateScroller,
          .scoresheetScroller {
            scrollbar-width: none !important;
            touch-action: pan-x pan-y;
          }

          .summaryTableWrap::-webkit-scrollbar,
          .summaryDetailScroller::-webkit-scrollbar,
          .recordTemplateScroller::-webkit-scrollbar,
          .scoresheetScroller::-webkit-scrollbar {
            display: none;
          }
        }

        @media (max-width: 1280px) {
          .scoresheetView {
            padding: 8px;
          }

          .scoresheetScroller {
            max-height: calc(100dvh - 230px);
          }

          .scoresheetGrid .ssColumnRow th {
            position: sticky;
            top: 0;
            z-index: 2;
          }
        }

        @media (max-width: 640px) {
          .scoresheetControls {
            padding: 8px;
          }

          .scoresheetModeControls {
            width: 100%;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .scoresheetModeControls .scoresheetSaveButton {
            grid-column: 1 / -1;
          }

          .scoresheetModeButton,
          .scoresheetControlButton {
            min-height: 44px;
          }

          .multiItemRow {
            grid-template-columns: 1fr;
          }

          .multiItemRemove {
            min-height: 42px;
            justify-self: start;
          }

          .scoresheetView {
            padding: 0;
          }

          .scoresheetScroller {
            border-inline: 0;
            max-height: calc(100dvh - 205px);
          }
        }

        /* ---------------------------------------------------------------
           CLASS SUMMARY WORKBOOK VIEW
           Recreates the two visible Class Summary ranges from the official
           workbook. Only English rows are shown in the app; the Excel export
           retains the untouched Filipino template rows.
           --------------------------------------------------------------- */
        .recordSummary .summaryTableWrap,
        .recordSummary .summaryDetailScroller {
          max-height: none !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          border: 1px solid #4b4b4b !important;
          border-radius: 0 !important;
          background: #fffef9 !important;
          scrollbar-gutter: stable;
          overscroll-behavior-x: contain;
        }

        .recordSummary .summaryTableWrap::-webkit-scrollbar,
        .recordSummary .summaryDetailScroller::-webkit-scrollbar {
          height: 12px;
        }

        .recordSummary .summaryTableWrap::-webkit-scrollbar-track,
        .recordSummary .summaryDetailScroller::-webkit-scrollbar-track {
          background: #ece9e1;
          border-top: 1px solid #c8c4bb;
        }

        .recordSummary .summaryTableWrap::-webkit-scrollbar-thumb,
        .recordSummary .summaryDetailScroller::-webkit-scrollbar-thumb {
          border: 2px solid #ece9e1;
          border-radius: 999px;
          background: #7d8794;
        }

        .classSummaryTable {
          margin: 0;
          border-spacing: 0;
          border-collapse: collapse;
          table-layout: fixed;
          font-family: Calibri, Arial, sans-serif;
          color: #111820;
        }

        .classSummaryTopTable {
          width: 1779px !important;
          min-width: 1779px !important;
        }

        .classSummaryDetailTable {
          width: 1399px !important;
          min-width: 1399px !important;
        }

        html[data-crl-theme] .classSummaryTable th,
        html[data-crl-theme] .classSummaryTable td {
          box-sizing: border-box;
          padding: 4px 5px;
          border: 1px solid #555555 !important;
          background: #fffef9 !important;
          color: #111820 !important;
          font-size: 11px;
          line-height: 1.12;
          text-align: center;
          vertical-align: middle;
          white-space: normal;
          overflow-wrap: normal;
          word-break: normal;
          transition: none !important;
        }

        html[data-crl-theme] .classSummaryTable thead th {
          background: #d8d8d8 !important;
          color: #0d141c !important;
          font-weight: 800;
        }

        .classSummaryTable .classSummaryGroupRow {
          height: 24px;
        }

        .classSummaryTable .classSummaryLeafRow {
          height: 48px;
        }

        .classSummaryTable .classSummaryTitleRow {
          height: 28px;
        }

        html[data-crl-theme] .classSummaryTable .classSummaryTitleRow th {
          border-width: 2px 2px 1px !important;
          font-size: 12px;
          font-weight: 900;
        }

        .classSummaryTable tbody tr:not(.classSummarySpacerRow) {
          height: 34px;
        }

        html[data-crl-theme] .classSummaryTable tbody td.classSummaryProfileCell,
        html[data-crl-theme] .classSummaryTable tbody tr:hover td.classSummaryProfileCell {
          background: #e2efd9 !important;
        }

        html[data-crl-theme] .classSummaryTable tbody tr:hover td {
          background: #fffef9 !important;
          box-shadow: none !important;
          filter: none !important;
          transform: none !important;
        }

        html[data-crl-theme] .classSummaryTable .classSummaryTotalRow td {
          font-weight: 800;
          border-top-width: 2px !important;
        }

        html[data-crl-theme] .classSummaryTable .classSummarySpacerRow td,
        html[data-crl-theme] .classSummaryTable tbody tr:hover.classSummarySpacerRow td {
          height: 20px;
          padding: 0;
          border: 0 !important;
          background: #fffef9 !important;
        }

        .classSummaryTopTable tbody td:nth-child(-n + 4),
        .classSummaryDetailTable tbody td:nth-child(-n + 2) {
          text-align: left;
        }

        .summaryDetailSection {
          margin-top: 16px;
        }

        @media (max-width: 900px) {
          .recordSummary {
            padding: 8px;
          }

          .recordSummary .summaryTableWrap,
          .recordSummary .summaryDetailScroller {
            -webkit-overflow-scrolling: touch;
            touch-action: pan-x pan-y;
          }

          html[data-crl-theme] .classSummaryTable th,
          html[data-crl-theme] .classSummaryTable td {
            padding: 4px;
            font-size: 10.5px;
          }
        }

        /* Class Record mirrors the English range of the official workbook. */
        .recordTemplateView {
          padding: 14px;
        }

        .recordTemplateScroller {
          max-height: none !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          border: 1px solid #555 !important;
          border-radius: 0 !important;
          background: #fffef9 !important;
          scrollbar-gutter: stable;
          overscroll-behavior-x: contain;
        }

        .recordTemplateScroller::-webkit-scrollbar { height: 12px; }
        .recordTemplateScroller::-webkit-scrollbar-track {
          background: #ece9e1;
          border-top: 1px solid #c8c4bb;
        }
        .recordTemplateScroller::-webkit-scrollbar-thumb {
          border: 2px solid #ece9e1;
          border-radius: 999px;
          background: #7d8794;
        }

        .classRecordWorkbookTable {
          width: 1424px !important;
          min-width: 1424px !important;
          margin: 0;
          table-layout: fixed;
          border-collapse: collapse;
          border-spacing: 0;
          font-family: Calibri, Arial, sans-serif;
        }

        html[data-crl-theme] .classRecordWorkbookTable th,
        html[data-crl-theme] .classRecordWorkbookTable td,
        html[data-crl-theme] .classRecordWorkbookTable tbody tr:hover td {
          box-sizing: border-box;
          border: 1px solid #555 !important;
          background: #fffef9 !important;
          color: #111820 !important;
          padding: 4px 5px;
          font-size: 11px;
          line-height: 1.12;
          text-align: center;
          vertical-align: middle;
          white-space: normal;
          transition: none !important;
          box-shadow: none !important;
          filter: none !important;
          transform: none !important;
        }

        html[data-crl-theme] .classRecordWorkbookTable .classRecordMetaLabel,
        html[data-crl-theme] .classRecordWorkbookTable .classRecordMetaValue {
          height: 25px;
          background: #bfbfbf !important;
          font-weight: 800;
          text-align: left;
        }

        html[data-crl-theme] .classRecordWorkbookTable .classRecordWorkbookTitle {
          background: #fffef9 !important;
          color: #111820 !important;
          font-size: 15px;
          font-weight: 900;
          letter-spacing: .01em;
        }

        html[data-crl-theme] .classRecordWorkbookTable .classRecordLanguageRow th,
        html[data-crl-theme] .classRecordWorkbookTable .classRecordGroupRow th,
        html[data-crl-theme] .classRecordWorkbookTable .classRecordSubheadRow th,
        html[data-crl-theme] .classRecordWorkbookTable .classRecordRemarksHead {
          background: #d8d8d8 !important;
          color: #111820 !important;
          font-weight: 800;
        }

        html[data-crl-theme] .classRecordWorkbookTable .classRecordEnglishBand,
        html[data-crl-theme] .classRecordWorkbookTable .classRecordEnglishRow th,
        html[data-crl-theme] .classRecordWorkbookTable .classRecordEnglishCell,
        html[data-crl-theme] .classRecordWorkbookTable tbody tr:hover .classRecordEnglishCell {
          background: #e2efd9 !important;
        }

        html[data-crl-theme] .classRecordWorkbookTable .classRecordProfileGrade,
        html[data-crl-theme] .classRecordWorkbookTable tbody tr:hover .classRecordProfileGrade {
          background: #c6efce !important;
          color: #006100 !important;
          font-weight: 800;
        }

        html[data-crl-theme] .classRecordWorkbookTable .classRecordProfileLow,
        html[data-crl-theme] .classRecordWorkbookTable tbody tr:hover .classRecordProfileLow {
          background: #ffc7ce !important;
          color: #9c0006 !important;
          font-weight: 800;
        }

        .classRecordWorkbookTable tbody tr { height: 34px; }
        .classRecordWorkbookTable .classRecordLanguageRow { height: 25px; }
        .classRecordWorkbookTable .classRecordGroupRow { height: 25px; }
        .classRecordWorkbookTable .classRecordSubheadRow { height: 50px; }

        /* Focused analytics: one comparison chart and one learner result. */
        .analyticsRedesign {
          display: grid;
          gap: 14px;
          box-sizing: border-box;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          padding: 16px 0;
          overflow-x: hidden;
        }

        .analyticsProgressPanel,
        .analyticsLearnerPanel {
          box-sizing: border-box;
          min-width: 0;
          max-width: calc(100% - 32px);
          margin: 0 16px;
          padding: 16px;
          border: 1px solid var(--crl-line);
          border-radius: 14px;
          background: var(--crl-surface);
        }

        .analyticsSectionHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .analyticsSectionHead h3,
        .analyticsEvidenceBlock h4 {
          margin: 0;
          color: var(--crl-ink);
        }

        .analyticsSectionHead h3 { font-size: 16px; }
        .analyticsEvidenceBlock h4 { font-size: 15px; }

        .analyticsChartHeading {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 9px;
        }

        .analyticsChartHeading p {
          display: block;
          margin: 0;
          color: var(--crl-muted);
          font-size: 11px;
          font-weight: 700;
        }

        .analyticsChartHeading > span,
        .analyticsLearnerCount {
          padding: 4px 7px;
          border: 1px solid var(--crl-line);
          border-radius: 999px;
          color: var(--crl-muted);
          font-size: 9px;
          font-weight: 850;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        .analyticsModeSwitch {
          display: inline-grid;
          grid-template-columns: repeat(2, 44px);
          border: 1px solid var(--crl-line);
          border-radius: 8px;
          overflow: hidden;
        }

        .analyticsModeSwitch button {
          min-height: 34px;
          border: 0;
          border-right: 1px solid var(--crl-line);
          background: transparent;
          color: var(--crl-muted);
          font-weight: 850;
          cursor: pointer;
        }
        .analyticsModeSwitch button:last-child { border-right: 0; }
        .analyticsModeSwitch button.active { background: #1a2b4c; color: #fff; }

        .analyticsChartScroller {
          box-sizing: border-box;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 28px 4px 5px;
          overscroll-behavior-x: contain;
        }

        .analyticsChartCanvas {
          position: relative;
          display: grid;
          grid-template-columns: 60px minmax(750px, 1fr);
          align-items: start;
          min-width: 820px;
          border-bottom: 1px solid var(--crl-line-strong);
        }
        .analyticsProgressPanel.isPeriodFocused .analyticsChartCanvas { min-width: 660px; }

        .analyticsChartScale {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          height: 310px;
          padding: 0 12px 0 0;
          color: var(--crl-muted);
          font-size: 12px;
          font-weight: 850;
          line-height: 1;
          text-align: right;
        }

        .analyticsChartPeriods {
          display: grid;
          grid-template-columns: repeat(3, minmax(230px, 1fr));
          gap: 30px;
          min-width: 0;
        }

        .analyticsChartPeriods.zoomed {
          grid-template-columns: minmax(540px, 820px);
          justify-content: center;
        }

        .analyticsPeriodGroup {
          display: grid;
          grid-template-rows: 310px auto auto auto;
          gap: 5px;
          min-width: 0;
          text-align: center;
          color: var(--crl-ink);
          transform-origin: center bottom;
        }
        .analyticsPeriodGroup.focused {
          animation: analyticsPeriodFocus 260ms ease-out both;
        }
        .analyticsPeriodGroup > strong { margin-top: 6px; font-size: 14px; letter-spacing: .04em; }
        .analyticsPeriodGroup.focused > strong { font-size: 17px; }
        .analyticsPeriodGroup > small { color: var(--crl-muted); font-size: 10px; font-weight: 700; }
        .analyticsPeriodGroup > span { color: var(--crl-muted); font-size: 11px; font-weight: 700; }

        .analyticsBarCluster {
          position: relative;
          display: flex;
          align-items: end;
          justify-content: center;
          gap: 15px;
          height: 310px;
          border-bottom: 1px solid var(--crl-line);
        }

        .analyticsPeriodGroup.focused .analyticsBarCluster {
          gap: clamp(18px, 4vw, 42px);
        }

        .analyticsBarButton {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: end;
          align-items: center;
          width: 42px;
          height: 310px;
          padding: 0;
          border: 0;
          background: transparent;
          cursor: pointer;
          transition: width 220ms ease-out, transform 180ms ease-out;
          transform: translateY(0);
        }

        .analyticsBarButton:hover { transform: translateY(-4px); }
        .analyticsBarButton:active { transform: translateY(-1px) scale(.97); }
        .analyticsBarButton:focus-visible { outline: 2px solid var(--crl-active-bg); outline-offset: 5px; }
        .analyticsBarStatic { cursor: default; pointer-events: none; }
        .analyticsBarStatic:hover,
        .analyticsBarStatic:active { transform: none; }
        .analyticsPeriodGroup.focused .analyticsBarButton { width: clamp(54px, 7vw, 84px); }

        .analyticsBarValue {
          position: absolute;
          bottom: calc(var(--bar-height, 0%) + 7px);
          color: var(--crl-muted);
          font-size: 12px;
          font-weight: 900;
          pointer-events: none;
          transition: bottom 220ms ease-out;
        }

        .analytics2dBar {
          position: relative;
          width: 34px;
          height: var(--bar-height);
          min-height: 1px;
          background: var(--bar-color);
          border: 1px solid rgba(20, 34, 55, .14);
          border-bottom: 0;
          border-radius: 5px 5px 0 0;
          transition: height 240ms ease-out, width 220ms ease-out, opacity 180ms ease-out;
          transform: scaleY(1);
          transform-origin: bottom;
          animation: analyticsBarRise 260ms ease-out both;
        }
        .analyticsPeriodGroup.focused .analytics2dBar { width: clamp(44px, 5vw, 62px); }
        .analyticsLegend {
          display: flex;
          flex-wrap: wrap;
          gap: 7px 12px;
          max-width: 100%;
          min-width: 0;
          margin-top: 14px;
          overflow: hidden;
        }
        .analyticsLegend > span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: var(--crl-text);
          font-size: 11px;
          font-weight: 750;
        }
        .analyticsLegend > span > span { width: 11px; height: 11px; border-radius: 2px; }

        .analyticsMobileChartStack { display: none; }

        .analyticsComparisonPanel {
          box-sizing: border-box;
          min-width: 0;
          max-width: calc(100% - 32px);
          margin: 0 16px;
          padding: 16px;
          border: 1px solid var(--crl-line);
          border-radius: 14px;
          background: var(--crl-surface);
        }

        .analyticsComparisonHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .analyticsComparisonHead h3 {
          margin: 0;
          color: var(--crl-ink);
          font-size: 16px;
        }

        .analyticsComparisonNote {
          margin: 0 0 14px;
          color: var(--crl-muted);
          font-size: 11px;
          line-height: 1.5;
        }

        .analyticsComparisonSwitch {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 6px;
        }

        .analyticsComparisonSwitch button {
          min-height: 36px;
          padding: 0 11px;
          border: 1px solid var(--crl-line);
          border-radius: 8px;
          background: transparent;
          color: var(--crl-muted);
          font-size: 10px;
          font-weight: 850;
          cursor: pointer;
          transition: background-color 160ms ease-out, border-color 160ms ease-out, transform 160ms ease-out;
        }

        .analyticsComparisonSwitch button.active {
          border-color: #1a2b4c;
          background: #1a2b4c;
          color: #fff;
        }

        .analyticsComparisonSwitch button:active { transform: scale(.97); }

        .analyticsComparisonRows {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .analyticsComparisonRow {
          display: grid;
          grid-template-columns: minmax(150px, .8fr) minmax(0, 1.2fr);
          align-items: center;
          gap: 12px;
          min-width: 0;
          padding: 11px 12px;
          border: 1px solid var(--crl-line);
          border-radius: 10px;
          background: var(--crl-soft);
        }

        .analyticsComparisonLabel {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          color: var(--crl-ink);
          font-size: 11px;
        }

        .analyticsComparisonLabel i {
          width: 10px;
          height: 10px;
          flex: 0 0 10px;
          border-radius: 2px;
        }

        .analyticsComparisonLabel strong { overflow-wrap: anywhere; }
        .analyticsComparisonValues {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(48px, 1fr);
          gap: 5px;
          min-width: 0;
        }

        .analyticsComparisonValue {
          display: grid;
          grid-template-columns: auto auto;
          align-items: baseline;
          justify-content: center;
          column-gap: 5px;
          min-width: 0;
          text-align: center;
        }

        .analyticsComparisonValue small {
          grid-column: 1 / -1;
          color: var(--crl-muted);
          font-size: 9px;
          font-weight: 850;
        }

        .analyticsComparisonValue b { color: var(--crl-ink); font-size: 16px; }
        .analyticsComparisonValue em {
          font-size: 10px;
          font-style: normal;
          font-weight: 900;
        }
        .analyticsComparisonValue em.up { color: #9b2e22; }
        .analyticsComparisonValue em.down { color: #385b73; }
        .analyticsComparisonValue em.flat { color: var(--crl-muted); }

        @keyframes analyticsBarRise {
          from { opacity: .25; transform: scaleY(.08); }
          to { opacity: 1; transform: scaleY(1); }
        }

        @keyframes analyticsPeriodFocus {
          from { opacity: .2; transform: scale(.82) translateY(12px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .analyticsLearnerWorkspace {
          display: grid;
          grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
          align-items: start;
          gap: 14px;
          min-width: 0;
        }

        .analyticsLearnerDirectory,
        .analyticsLearnerResult {
          min-width: 0;
          border: 1px solid var(--crl-line);
          border-radius: 12px;
          background: var(--crl-surface);
          overflow: hidden;
        }

        .analyticsDirectoryTools {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 84px;
          gap: 7px;
          padding: 12px;
          border-bottom: 1px solid var(--crl-line);
          background: var(--crl-soft);
        }

        .analyticsSearchField,
        .analyticsSortField {
          display: grid;
          gap: 4px;
        }

        .analyticsSearchField > span,
        .analyticsSortField > span,
        .analyticsResultHeader > div:first-child > span {
          color: var(--crl-muted);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .07em;
          text-transform: uppercase;
        }

        .analyticsSearchField input,
        .analyticsSortField select {
          width: 100%;
          min-width: 0;
          min-height: 44px;
          padding: 0 11px;
          border: 1px solid var(--crl-line-strong);
          border-radius: 8px;
          background: var(--crl-surface);
          color: var(--crl-text);
          font: inherit;
          font-size: 12px;
          font-weight: 750;
          outline: none;
        }

        .analyticsSearchField input:focus,
        .analyticsSortField select:focus {
          border-color: var(--crl-active-bg);
          box-shadow: 0 0 0 2px rgba(58, 94, 132, .16);
        }

        .analyticsLearnerList {
          max-height: 660px;
          overflow-y: auto;
          overscroll-behavior: contain;
        }

        .analyticsLearnerRow {
          width: 100%;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          min-height: 68px;
          padding: 14px 12px;
          border: 0;
          border-bottom: 1px solid var(--crl-line);
          border-left: 3px solid transparent;
          background: transparent;
          color: var(--crl-text);
          text-align: left;
          cursor: pointer;
          transition: background-color 160ms ease-out, border-color 160ms ease-out, transform 160ms ease-out;
        }
        .analyticsLearnerRow:last-child { border-bottom: 0; }
        .analyticsLearnerRow:hover { background: var(--crl-soft); }
        .analyticsLearnerRow:active { transform: scale(.985); }
        .analyticsLearnerRow.selected {
          border-left-color: #3e6d9c;
          background: #eef4fb;
        }
        html[data-crl-theme="dark"] .analyticsLearnerRow.selected { background: #1b2a3b; }

        .analyticsLearnerIdentity { display: grid; gap: 4px; min-width: 0; }
        .analyticsLearnerIdentity strong {
          overflow: hidden;
          color: var(--crl-ink);
          font-size: 13.5px;
          font-weight: 900;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .analyticsLearnerIdentity small { color: var(--crl-muted); font-size: 11px; }

        .analyticsLearnerPeriods { display: flex; gap: 3px; }
        .analyticsLearnerPeriods small {
          padding: 4px 5px;
          border: 1px solid var(--crl-line);
          border-radius: 5px;
          color: var(--crl-muted);
          font-size: 8.5px;
          font-weight: 850;
          opacity: .4;
        }
        .analyticsLearnerPeriods small.available {
          border-color: #9ab2cd;
          background: #edf3fa;
          color: #27496d;
          opacity: 1;
        }
        html[data-crl-theme="dark"] .analyticsLearnerPeriods small.available {
          background: #1b2a3b;
          color: #afc7e1;
        }

        .analyticsDirectoryEmpty {
          padding: 28px 14px;
          color: var(--crl-muted);
          font-size: 11px;
          font-weight: 750;
          text-align: center;
        }

        .analyticsResultHeader {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 12px;
          padding: 15px 16px;
          border-bottom: 1px solid var(--crl-line);
          background: var(--crl-soft);
        }
        .analyticsResultHeader > div:first-child { display: grid; gap: 3px; min-width: 0; }
        .analyticsResultHeader > div:first-child > strong {
          overflow: hidden;
          color: var(--crl-ink);
          font-size: 16px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .analyticsResultHeader > div:first-child > small { color: var(--crl-muted); font-size: 11px; }

        .analyticsPeriodSwitch {
          display: inline-grid;
          grid-template-columns: repeat(3, minmax(48px, 1fr));
          border: 1px solid var(--crl-line-strong);
          border-radius: 8px;
          overflow: hidden;
        }
        .analyticsPeriodSwitch button {
          min-height: 40px;
          padding: 0 9px;
          border: 0;
          border-right: 1px solid var(--crl-line);
          background: var(--crl-surface);
          color: var(--crl-muted);
          font-size: 11px;
          font-weight: 850;
          cursor: pointer;
        }
        .analyticsPeriodSwitch button:last-child { border-right: 0; }
        .analyticsPeriodSwitch button.active { background: #1a2b4c; color: #fff; }
        .analyticsPeriodSwitch button:disabled { opacity: .35; cursor: not-allowed; }

        .analyticsResultBody { min-height: 230px; padding: 16px; }

        .analyticsEvidence { display: grid; gap: 12px; }
        .analyticsEvidenceSummary {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border: 1px solid var(--crl-line);
          border-radius: 10px;
          overflow: hidden;
        }
        .analyticsEvidenceSummary > div {
          display: grid;
          gap: 3px;
          padding: 12px;
          border-right: 1px solid var(--crl-line);
        }
        .analyticsEvidenceSummary > div:last-child { border-right: 0; }
        .analyticsEvidenceSummary span { color: var(--crl-muted); font-size: 10px; font-weight: 850; text-transform: uppercase; }
        .analyticsEvidenceSummary strong { color: var(--crl-ink); font-size: 14px; }

        .analyticsEvidenceGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .analyticsEvidenceBlock { min-width: 0; padding: 16px; border: 1px solid var(--crl-line); border-radius: 10px; }
        .analyticsEvidenceItems { display: grid; gap: 7px; margin-top: 12px; }
        .analyticsEvidenceItem { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 42px; padding: 10px 11px; border-left: 3px solid #9b2e22; background: var(--crl-soft); font-size: 13px; }
        .analyticsEvidenceItem.correct { border-left-color: #3e7a5e; }
        .analyticsEvidenceItem span { color: var(--crl-text); overflow-wrap: anywhere; }
        .analyticsEvidenceItem strong { color: #9b2e22; font-size: 11.5px; }
        .analyticsEvidenceItem.correct strong { color: #3e7a5e; }
        .analyticsEvidenceEmpty,
        .analyticsDetailState { padding: 16px 0; color: var(--crl-muted); font-size: 12px; font-weight: 700; }
        .analyticsDetailState.error { color: #9b2e22; }

        .analyticsPassageEvidence { grid-column: 1 / -1; }
        .analyticsPassageEvidence p { margin: 12px 0 0; color: var(--crl-text); font-size: 14px; line-height: 1.9; }
        .analyticsPassageEvidence .miscued { padding: 1px 2px; border-radius: 3px; background: #ffc7ce; color: #8a1515; font-weight: 850; }
        .analyticsLastWordRead {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          margin-top: 12px;
          padding: 11px 12px;
          border: 1px solid #9ab2cd;
          border-radius: 9px;
          background: #edf3fa;
        }
        html[data-crl-theme="dark"] .analyticsLastWordRead { background: #1b2a3b; }
        .analyticsLastWordRead span { color: var(--crl-muted); font-size: 10px; font-weight: 900; text-transform: uppercase; }
        .analyticsLastWordRead strong { overflow: hidden; color: var(--crl-ink); font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
        .analyticsLastWordRead small { color: var(--crl-muted); font-size: 11px; font-weight: 800; }
        .analyticsMiscueLedger {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 14px;
        }
        .analyticsMiscueRow {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 4px 10px;
          min-width: 0;
          padding: 10px 11px;
          border: 1px solid #e0a7a7;
          border-left: 4px solid #9b2e22;
          border-radius: 8px;
          background: var(--crl-soft);
        }
        .analyticsMiscueRow > div { display: grid; gap: 2px; min-width: 0; }
        .analyticsMiscueRow strong { overflow-wrap: anywhere; color: var(--crl-ink); font-size: 13px; }
        .analyticsMiscueRow > span { padding: 4px 7px; border-radius: 999px; background: #f7e6e3; color: #8a1515; font-size: 10px; font-weight: 900; }
        html[data-crl-theme="dark"] .analyticsMiscueRow > span { background: #3a2325; color: #f1b9b3; }
        .analyticsMiscueRow small { color: var(--crl-muted); font-size: 10px; font-weight: 750; }
        .analyticsMiscueRow > small { grid-column: 1 / -1; color: #8a1515; }

        .analyticsChartOverlay,
        .analyticsMobileResultOverlay {
          position: fixed;
          inset: 0;
          z-index: 1400;
          display: grid;
          place-items: center;
          box-sizing: border-box;
          padding:
            max(10px, env(safe-area-inset-top))
            max(10px, env(safe-area-inset-right))
            max(10px, env(safe-area-inset-bottom))
            max(10px, env(safe-area-inset-left));
          background: rgba(12, 25, 44, .52);
          animation: analyticsOverlayFade 180ms ease-out both;
        }

        .analyticsChartDialog {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          width: min(720px, 100%);
          max-height: min(760px, calc(100dvh - 20px));
          border: 1px solid var(--crl-line-strong);
          border-radius: 16px;
          background: var(--crl-surface);
          overflow: hidden;
          animation: analyticsOverlayIn 200ms ease-out both;
        }

        .analyticsChartDialogHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--crl-line);
        }

        .analyticsChartDialogHead > div { display: grid; gap: 2px; }
        .analyticsChartDialogHead strong { color: var(--crl-ink); font-size: 18px; }
        .analyticsChartDialogHead span { color: var(--crl-muted); font-size: 11px; font-weight: 750; }
        .analyticsChartDialogHead button {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          padding: 0;
          border: 1px solid var(--crl-line-strong);
          border-radius: 50%;
          background: var(--crl-surface);
          color: var(--crl-ink);
          font-size: 24px;
          cursor: pointer;
          transition: transform 160ms ease-out, background-color 160ms ease-out;
        }
        .analyticsChartDialogHead button:active { transform: scale(.94); }

        .analyticsChartDialogBody {
          min-height: 0;
          padding: 18px 16px;
          overflow-y: auto;
          overscroll-behavior: contain;
        }

        .analyticsEnlargedChartPlot {
          display: grid;
          grid-template-columns: 48px minmax(0, 1fr);
          gap: 18px;
          min-width: 0;
          padding: 20px 10px 0 0;
          border-bottom: 1px solid var(--crl-line-strong);
        }

        .analyticsEnlargedChartPlot .analyticsChartScale,
        .analyticsEnlargedChartPlot .analyticsBarCluster,
        .analyticsEnlargedChartPlot .analyticsBarButton { height: min(390px, 52dvh); }
        .analyticsEnlargedChartPlot .analyticsChartScale { padding-right: 0; }
        .analyticsEnlargedChartPlot .analyticsBarCluster {
          gap: clamp(10px, 4vw, 28px);
          padding-left: 10px;
        }
        .analyticsEnlargedChartPlot .analyticsBarButton { width: clamp(34px, 10vw, 68px); }
        .analyticsEnlargedChartPlot .analytics2dBar { width: clamp(28px, 7vw, 54px); }
        .analyticsChartDialogTotal {
          margin-top: 9px;
          color: var(--crl-muted);
          font-size: 11px;
          font-weight: 800;
          text-align: center;
        }
        .analyticsDialogLegend { margin-top: 16px; }

        .analyticsMobileResultDialog {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          width: min(100%, 680px);
          height: calc(100vh - 20px);
          height: min(820px, calc(100dvh - 20px));
          min-height: 0;
          border: 1px solid var(--crl-line-strong);
          border-radius: 16px;
          background: var(--crl-surface);
          overflow: hidden;
          animation: analyticsOverlayIn 200ms ease-out both;
        }

        .analyticsMobileResultTopbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid var(--crl-line);
          background: var(--crl-surface);
        }

        .analyticsMobileResultTopbar > div {
          display: grid;
          gap: 2px;
          min-width: 0;
        }

        .analyticsMobileResultTopbar span {
          color: var(--crl-muted);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .07em;
          text-transform: uppercase;
        }

        .analyticsMobileResultTopbar strong {
          overflow: hidden;
          color: var(--crl-ink);
          font-size: 14px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .analyticsMobileResultTopbar button {
          flex: 0 0 42px;
          width: 42px;
          height: 42px;
          padding: 0;
          border: 1px solid var(--crl-line-strong);
          border-radius: 50%;
          background: var(--crl-surface);
          color: var(--crl-ink);
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
          transition: background-color 160ms ease-out, transform 160ms ease-out;
        }

        .analyticsMobileResultTopbar button:active { transform: scale(.94); }
        .analyticsMobileResult {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          height: 100%;
          min-height: 0;
          border: 0;
          border-radius: 0;
        }
        .analyticsMobileResult .analyticsResultBody {
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        @keyframes analyticsOverlayFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes analyticsOverlayIn {
          from { opacity: 0; transform: scale(.97) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        @media (max-width: 1100px) {
          .analyticsLearnerWorkspace {
            grid-template-columns: minmax(260px, 300px) minmax(0, 1fr);
          }

          .analyticsResultHeader {
            align-items: stretch;
            flex-direction: column;
          }

          .analyticsPeriodSwitch { width: 100%; }
        }

        @media (max-width: 900px) {
          .analyticsLearnerWorkspace { grid-template-columns: 1fr; }
          .analyticsLearnerList { max-height: 340px; }
        }

        @media (max-width: 760px) {
          .recordTemplateView { padding: 6px; }
          .recordTemplateScroller { -webkit-overflow-scrolling: touch; touch-action: pan-x pan-y; }
          .analyticsProgressPanel,
          .analyticsComparisonPanel,
          .analyticsLearnerPanel {
            width: calc(100% - 16px);
            max-width: calc(100% - 16px);
            margin: 0 8px;
            padding: 12px;
          }
          .analyticsSectionHead { align-items: flex-start; flex-wrap: wrap; }
          .analyticsChartHeading {
            display: grid;
            gap: 4px;
          }
          .analyticsChartHeading p { display: block; }
          .analyticsLearnerList { max-height: 320px; }
          .analyticsSearchField input,
          .analyticsSortField select { min-height: 44px; }
          .analyticsLearnerRow { min-height: 56px; }
          .analyticsResultBody { padding: 10px; }
          .analyticsEvidenceSummary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .analyticsEvidenceSummary > div:nth-child(2) { border-right: 0; }
          .analyticsEvidenceSummary > div:nth-child(-n + 2) { border-bottom: 1px solid var(--crl-line); }
          .analyticsEvidenceGrid { grid-template-columns: 1fr; }
          .analyticsPassageEvidence { grid-column: auto; }
          .analyticsMiscueLedger { grid-template-columns: 1fr; }
          .analyticsDesktopResult { display: none; }
          .analyticsDesktopChart { display: none; }
          .analyticsMobileChartStack {
            display: grid;
            gap: 12px;
          }
          .analyticsMobilePeriodCard {
            display: grid;
            gap: 10px;
            width: 100%;
            min-width: 0;
            padding: 13px 12px 11px;
            border: 1px solid var(--crl-line);
            border-radius: 12px;
            background: var(--crl-soft);
            color: var(--crl-ink);
            cursor: pointer;
            text-align: left;
            transition: border-color 180ms ease-out, transform 180ms ease-out, background-color 180ms ease-out;
          }
          .analyticsMobilePeriodCard:active { transform: scale(.985); }
          .analyticsMobilePeriodCard:focus-visible {
            outline: 2px solid var(--crl-active-bg);
            outline-offset: 3px;
          }
          .analyticsMobilePeriodHead {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
          }
          .analyticsMobilePeriodHead > span { display: grid; gap: 2px; }
          .analyticsMobilePeriodHead strong { font-size: 16px; letter-spacing: .03em; }
          .analyticsMobilePeriodHead small,
          .analyticsMobilePeriodHead em {
            color: var(--crl-muted);
            font-size: 10px;
            font-style: normal;
            font-weight: 750;
          }
          .analyticsMobilePeriodHead em { white-space: nowrap; }
          .analyticsMobileChartPlot {
            display: grid;
            grid-template-columns: 42px minmax(0, 1fr);
            gap: 16px;
            min-width: 0;
            padding: 16px 8px 0 0;
            border-bottom: 1px solid var(--crl-line-strong);
          }
          .analyticsMobileChartPlot .analyticsChartScale,
          .analyticsMobileChartPlot .analyticsBarCluster,
          .analyticsMobileChartPlot .analyticsBarButton { height: 190px; }
          .analyticsMobileChartPlot .analyticsChartScale {
            position: static;
            padding-right: 0;
            background: transparent;
            box-shadow: none;
            font-size: 10px;
          }
          .analyticsMobileChartPlot .analyticsBarCluster {
            justify-content: space-around;
            gap: 5px;
            min-width: 0;
            padding-left: 8px;
          }
          .analyticsMobileChartPlot .analyticsBarButton { width: min(12vw, 42px); }
          .analyticsMobileChartPlot .analytics2dBar { width: min(8vw, 30px); }
          .analyticsMobileChartPlot .analyticsBarValue { font-size: 10px; }
          .analyticsMobileChartAction {
            color: var(--crl-active-bg);
            font-size: 10px;
            font-weight: 850;
            text-align: center;
          }
          .analyticsComparisonHead {
            align-items: flex-start;
            flex-direction: column;
          }
          .analyticsComparisonSwitch {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            width: 100%;
          }
          .analyticsComparisonSwitch button { min-height: 42px; }
          .analyticsComparisonRows { grid-template-columns: 1fr; }
          .analyticsComparisonRow {
            grid-template-columns: minmax(118px, .8fr) minmax(0, 1.2fr);
            padding: 10px;
          }
        }

        @media (max-width: 430px) {
          .analyticsDirectoryTools { grid-template-columns: minmax(0, 1fr) 78px; }
          .analyticsLearnerPeriods { gap: 2px; }
          .analyticsLearnerPeriods small { padding-inline: 3px; }
          .analyticsChartHeading { align-items: flex-start; flex-direction: column; gap: 4px; }
          .analyticsModeSwitch { grid-template-columns: repeat(2, 42px); }
          .analyticsLastWordRead { grid-template-columns: 1fr auto; }
          .analyticsLastWordRead span { grid-column: 1 / -1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .analyticsPeriodGroup.focused { animation: none; }
          .analytics2dBar {
            animation: none;
          }
          .analytics2dBar,
          .analyticsBarButton,
          .analyticsBarValue,
          .analyticsLearnerRow,
          .analyticsMobilePeriodCard,
          .analyticsComparisonSwitch button,
          .analyticsChartDialogHead button,
          .analyticsMobileResultTopbar button { transition: none; }
          .analyticsChartOverlay,
          .analyticsChartDialog,
          .analyticsMobileResultOverlay,
          .analyticsMobileResultDialog { animation: none; }
        }

      `}</style>


      <main className={`teacherShell ${bentoOpen ? "isExpanded" : "isBento"}`} inert={startingAssessment ? true : undefined}>
        {!bentoOpen && (
          <section className="bentoMenu" aria-label="Main menu">
            <header className="bentoHead">
              <div className="bentoBrand">
                <img
                  src="/crl-app-logo.png"
                  alt="CRL-App"
                  className="bentoLogo"
                />
              </div>

              <div className="bentoHeadActions">
                <button
                  type="button"
                  className="bentoLogout"
                  onClick={() =>
                    setLogoutOpen(
                      true
                    )
                  }
                >
                  {isOffline ? "Exit" : "Logout"}
                </button>

                <button
                  type="button"
                  className={
                    "themeSwitchButton brandThemeSwitch bentoThemeSwitch " +
                    (darkMode ? "isDark" : "isLight")
                  }
                  onClick={toggleDarkMode}
                  aria-pressed={darkMode}
                  aria-label={
                    darkMode
                      ? "Switch to light mode"
                      : "Switch to dark mode"
                  }
                  title={
                    darkMode
                      ? "Switch to light mode"
                      : "Switch to dark mode"
                  }
                >
                  <span className="themeSwitchTrack">
                    <span className="themeSwitchThumb">
                      {darkMode ? "☾" : "☀"}
                    </span>
                  </span>
                </button>
              </div>
            </header>

            <div className="bentoGrid">
              <section
                className={`bentoHome ${
                  homeExpanded ? "isOpen" : "isCollapsed"
                }`}
                aria-label="Dashboard"
              >
                <div className="bentoHomeHead">
                  <span className="bentoHomeTitle">
                    Home
                  </span>

                  <button
                    type="button"
                    className="bentoHomeToggle"
                    aria-expanded={homeExpanded}
                    aria-label={
                      homeExpanded
                        ? "Collapse dashboard"
                        : "Expand dashboard"
                    }
                    onClick={() =>
                      setHomeExpanded(
                        (open) => !open
                      )
                    }
                  >
                    {homeExpanded ? "−" : "+"}
                  </button>
                </div>

                <div className="bentoHomeBody">
                <div className="statsGrid homeStatsGrid">
                  <div className="statCard">
                    <div className="statNumber blue">
                      {stats.total}
                    </div>
                    <div className="statLabel">
                      Total Learners
                    </div>
                  </div>

                  <div className="statCard">
                    <div className="statNumber green">
                      {stats.bosy}
                    </div>
                    <div className="statLabel">
                      BoSY Completed
                    </div>
                  </div>

                  <div className="statCard">
                    <div className="statNumber orange">
                      {stats.mosy}
                    </div>
                    <div className="statLabel">
                      MoSY Completed
                    </div>
                  </div>

                  <div className="statCard">
                    <div className="statNumber blue">
                      {stats.eosy}
                    </div>
                    <div className="statLabel">
                      EoSY Completed
                    </div>
                  </div>

                  <div className="statCard">
                    <div className="statNumber green">
                      {stats.gradeReady}
                    </div>
                    <div className="statLabel">
                      Grade Ready
                    </div>
                  </div>

                  <div className="statCard">
                    <div className="statNumber red">
                      {stats.intervention}
                    </div>
                    <div className="statLabel">
                      Needs Intervention
                    </div>
                  </div>
                </div>

                <div className="panel latestLearnerOverview">
                  <div className="panelHeader">
                    <div>
                      <div className="panelHeaderTitle">
                        Latest Learner Overview
                      </div>
                    </div>

                    {loadingData && (
                      <span className="panelHeaderSub">
                        Refreshing...
                      </span>
                    )}
                  </div>

                  <div className="tableWrap latestLearnerOverviewTable">
                    <table>
                      <thead>
                        <tr>
                          <th>
                            LRN
                          </th>
                          <th>
                            Name
                          </th>
                          <th>
                            Sex
                          </th>
                          <th>
                            BoSY
                          </th>
                          <th>
                            MoSY
                          </th>
                          <th>
                            EoSY
                          </th>
                          <th>
                            Latest Profile
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {dashboardRows.length ===
                        0 ? (
                          <tr>
                            <td
                              colSpan={
                                7
                              }
                            >
                              <div className="emptyState">
                                <div className="emptyIcon">
                                  +
                                </div>

                                <h3>
                                  No learners
                                  registered
                                </h3>

                                <p>
                                  Add a learner
                                  from the Conduct
                                  Assessment tab
                                  to begin your
                                  class roster.
                                </p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          dashboardRows.map(
                            ({
                              learner,
                              hasBosy,
                              hasMosy,
                              hasEosy,
                              profile,
                            }) => (
                              <tr
                                key={
                                  learner.id
                                }
                              >
                                <td>
                                  {
                                    learner.lrn
                                  }
                                </td>

                                <td className="nameStrong">
                                  {formatName(
                                    learner
                                  )}
                                </td>

                                <td>
                                  {
                                    learner.sex
                                  }
                                </td>

                                <td>
                                  {hasBosy
                                    ? "Yes"
                                    : "—"}
                                </td>

                                <td>
                                  {hasMosy
                                    ? "Yes"
                                    : "—"}
                                </td>

                                <td>
                                  {hasEosy
                                    ? "Yes"
                                    : "—"}
                                </td>

                                <td>
                                  <span
                                    className={`badge ${profileClass(
                                      profile
                                    )}`}
                                  >
                                    {
                                      profile
                                    }
                                  </span>
                                </td>
                              </tr>
                            )
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                </div>
              </section>

              <div className="bentoBlocks">
              {TABS.filter(
                (tab) =>
                  tab.id !== "dashboard"
              ).map(
                (tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className="bentoTile"
                    onClick={() =>
                      openBento(
                        tab.id
                      )
                    }
                  >
                    <span
                      className="bentoIcon"
                      aria-hidden="true"
                    >
                      {tab.icon}
                    </span>

                    <span className="bentoLabel">
                      {tab.label}
                    </span>
                  </button>
                )
              )}
              </div>
            </div>
          </section>
        )}

        {bentoOpen && (
        <section className="main">
          <header className="topbar">
            <button
              type="button"
              className="bentoClose"
              onClick={closeBento}
              aria-label="Close and return to the main menu"
              title="Back to menu"
            >
              <span aria-hidden="true">
                ‹
              </span>
            </button>

            <div className="topbarTitle">
              {(TABS.find(
                (tab) =>
                  tab.id === activeTab
              ) || {}).label || "CRL-App"}
            </div>

            <button
              type="button"
              className={
                "themeSwitchButton brandThemeSwitch bentoThemeSwitch " +
                (darkMode ? "isDark" : "isLight")
              }
              onClick={toggleDarkMode}
              aria-pressed={darkMode}
              aria-label={
                darkMode
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              title={
                darkMode
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              <span className="themeSwitchTrack">
                <span className="themeSwitchThumb">
                  {darkMode ? "☾" : "☀"}
                </span>
              </span>
            </button>
          </header>

          <div className="content">
            <div
              className={`contentStage ${
                transitioning
                  ? "transitioning"
                  : ""
              }`}
            >
              {activeTab ===
                "conduct" && (
                <>
                  <div
                    className={
                      "panel conductLearnerPanel" +
                      (learnersLoaded &&
                      !loadingData &&
                      filteredLearners.length === 0
                        ? " conductLearnerPanelEmpty"
                        : "")
                    }
                  >
                    <div className="panelHeader">
                      <div>
                        <div className="panelHeaderTitle">
                          Enrolled Learners
                        </div>
                      </div>

                      <button
                        type="button"
                        className="learnerRefreshButton"
                        onClick={() => void loadData()}
                        disabled={loadingData}
                        aria-label="Refresh enrolled learners"
                        title="Refresh enrolled learners"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path d="M20 11a8 8 0 1 0-2.34 5.66" />
                          <path d="M20 4v7h-7" />
                        </svg>
                      </button>
                    </div>

                    {learnersLoaded && !loadingData && (
                    <div className="toolbar">
                      <input
                        className="searchInput"
                        value={search}
                        onChange={(
                          event
                        ) =>
                          setSearch(
                            event
                              .target
                              .value
                          )
                        }
                        placeholder="Search learner name or LRN..."
                      />

                      <select
                        className="selectInput"
                        value={
                          sexFilter
                        }
                        onChange={(
                          event
                        ) =>
                          setSexFilter(
                            event
                              .target
                              .value
                          )
                        }
                      >
                        <option value="">
                          All Sex
                        </option>
                        <option value="Male">
                          Male
                        </option>
                        <option value="Female">
                          Female
                        </option>
                      </select>

                      <select
                        className="selectInput"
                        value={
                          statusFilter
                        }
                        onChange={(
                          event
                        ) =>
                          setStatusFilter(
                            event
                              .target
                              .value
                          )
                        }
                      >
                        <option value="">
                          All Status
                        </option>
                        <option value="none">
                          No Assessment
                        </option>
                        <option value="bosy">
                          BoSY Done
                        </option>
                        <option value="mosy">
                          MoSY Done
                        </option>
                        <option value="both">
                          BoSY &amp; MoSY
                        </option>
                        <option value="eosy">
                          EoSY Done
                        </option>
                      </select>

                      <select
                        className="selectInput"
                        value={
                          sortMode
                        }
                        onChange={(
                          event
                        ) =>
                          setSortMode(
                            event
                              .target
                              .value
                          )
                        }
                      >
                        <option value="name_asc">
                          Name (A-Z)
                        </option>
                        <option value="name_desc">
                          Name (Z-A)
                        </option>
                        <option value="lrn">
                          LRN
                        </option>
                      </select>

                      <ClassRecordImport
                        onImported={async () => {
                          await loadData();
                          showToast(
                            "Class record import completed."
                          );
                        }}
                      />

                      <button
                        type="button"
                        className="toolbarButton primaryBlueButton"
                        onClick={() => {
                          resetLearnerRows();
                          setAddLearnerOpen(true);
                        }}
                      >
                        Add
                      </button>

                      <button
                        type="button"
                        className="toolbarButton softButton"
                        onClick={selectAllFilteredLearners}
                        disabled={!filteredLearners.length}
                      >
                        Select All
                      </button>

                      <button
                        type="button"
                        className="toolbarButton softButton"
                        onClick={clearLearnerSelection}
                        disabled={!selectedLearnerIds.length}
                      >
                        Deselect All
                      </button>

                      {selectedLearnerIds.length > 0 && (
                        <button
                          type="button"
                          className="toolbarButton dangerButton"
                          onClick={bulkDeleteLearners}
                        >
                          Delete Selected ({selectedLearnerIds.length})
                        </button>
                      )}
                    </div>
                    )}

                    {!learnersLoaded || loadingData ? (
                      <div
                        className="learnerRosterLoading"
                        role="status"
                        aria-live="polite"
                        aria-label="Loading enrolled learners"
                      >
                        <span
                          className="learnerRosterSpinner"
                          aria-hidden="true"
                        />
                        <span>Loading learners</span>
                      </div>
                    ) : filteredLearners.length === 0 ? (
                      <div className="emptyState learnerEmptyState">
                        <div className="emptyIcon">
                          +
                        </div>

                        <h3>
                          No learners found
                        </h3>

                        <p>
                          Add a learner to
                          begin your class
                          roster.
                        </p>

                        <button
                          type="button"
                          className="toolbarButton"
                          onClick={() =>
                            setAddLearnerOpen(
                              true
                            )
                          }
                        >
                          Add
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          padding:
                            16,
                        }}
                      >
                        <div className="tableWrap learnerRoster">
                          <table>
                            <thead>
                              <tr>
                                <th className="selectionHeader">
                                  <span className="srOnly">Select</span>
                                </th>
                                <th>
                                  LRN
                                </th>

                                <th>
                                  Name
                                </th>

                                <th>
                                  Sex
                                </th>

                                <th>
                                  Status
                                </th>

                                <th>
                                  Assessment
                                </th>

                                <th>
                                  Actions
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {filteredLearners.map(
                                (
                                  learner
                                ) => {
                                  const status =
                                    statusForLearner(
                                      learner.id,
                                      assessments
                                    );

                                  const rows =
                                    assessments.filter(
                                      (
                                        item
                                      ) =>
                                        Number(
                                          item.learner_id
                                        ) ===
                                        Number(
                                          learner.id
                                        )
                                    );

                                  const bosyDone =
                                    rows.some(
                                      (
                                        item
                                      ) =>
                                        item
                                          .assessment_period ===
                                          "BoSY" &&
                                        item.is_completed
                                    );

                                  const mosyDone =
                                    rows.some(
                                      (
                                        item
                                      ) =>
                                        item
                                          .assessment_period ===
                                          "MoSY" &&
                                        item.is_completed
                                    );

                                  const eosyDone =
                                    rows.some(
                                      (
                                        item
                                      ) =>
                                        item
                                          .assessment_period ===
                                          "EoSY" &&
                                        item.is_completed
                                    );

                                  return (
                                    <tr
                                      key={
                                        learner.id
                                      }
                                      className={
                                        selectedLearnerIds.includes(Number(learner.id))
                                          ? "selectedRow"
                                          : ""
                                      }
                                    >
                                      <td className="selectionCell">
                                        <input
                                          type="checkbox"
                                          className="learnerCheckbox"
                                          checked={selectedLearnerIds.includes(
                                            Number(learner.id)
                                          )}
                                          onChange={() =>
                                            toggleLearnerSelection(learner.id)
                                          }
                                          aria-label={`Select ${formatName(learner)}`}
                                        />
                                      </td>
                                      <td>
                                        {
                                          learner.lrn
                                        }
                                      </td>

                                      <td className="nameStrong">
                                        {formatName(
                                          learner
                                        )}
                                      </td>

                                      <td>
                                        {
                                          learner.sex
                                        }
                                      </td>

                                      <td>
                                        <span
                                          className={`badge ${profileClass(
                                            status.label
                                          )}`}
                                        >
                                          {
                                            status.label
                                          }
                                        </span>
                                      </td>

                                      <td>
                                        <div className="inlineActions">
                                          <button
                                            type="button"
                                            className="smallButton primary"
                                            disabled={
                                              bosyDone
                                            }
                                            onClick={() =>
                                              startAssessment(
                                                learner.id,
                                                "BoSY"
                                              )
                                            }
                                          >
                                            BoSY
                                          </button>

                                          <button
                                            type="button"
                                            className="smallButton"
                                            disabled={
                                              !bosyDone ||
                                              mosyDone
                                            }
                                            onClick={() =>
                                              startAssessment(
                                                learner.id,
                                                "MoSY"
                                              )
                                            }
                                          >
                                            MoSY
                                          </button>

                                          <button
                                            type="button"
                                            className="smallButton"
                                            disabled={
                                              !(
                                                bosyDone ||
                                                mosyDone
                                              ) ||
                                              eosyDone
                                            }
                                            onClick={() =>
                                              startAssessment(
                                                learner.id,
                                                "EoSY"
                                              )
                                            }
                                          >
                                            EoSY
                                          </button>
                                        </div>
                                      </td>

                                      <td>
                                        <div className="inlineActions">
                                          <button
                                            type="button"
                                            className="smallButton redSmall"
                                            onClick={() =>
                                              setDeleteTarget({
                                                ...learner,
                                                id:
                                                  learner.id ??
                                                  learner.learner_id ??
                                                  learner.learnerId ??
                                                  null,
                                                lrn:
                                                  learner.lrn ??
                                                  learner.LRN ??
                                                  "",
                                              })
                                            }
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                }
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab ===
                "records" && (
                <>
                  <div className="panel recordsMainPanel">
                    <div className="panelHeader recordsPanelHeader">
                      <div className="recordsHeaderActions">
                        <div className="recordViewTabs">
                          <button
                            type="button"
                            className={`recordViewTab ${
                              recordsView ===
                              "scoresheet"
                                ? "active"
                                : ""
                            }`}
                            onClick={() => setRecordsView("scoresheet")}
                          >
                            Scoresheet
                          </button>

                          <button
                            type="button"
                            className={`recordViewTab ${
                              recordsView ===
                              "summary"
                                ? "active"
                                : ""
                            }`}
                            onClick={() => {
                              const navigate = () => setRecordsView("summary");
                              if (scoresheetDirty) {
                                requestScoresheetNavigation(navigate);
                              } else {
                                navigate();
                              }
                            }}
                          >
                            Class Summary
                          </button>

                          <button
                            type="button"
                            className={`recordViewTab ${
                              recordsView ===
                              "class-record"
                                ? "active"
                                : ""
                            }`}
                            onClick={() => {
                              const navigate = () => setRecordsView("class-record");
                              if (scoresheetDirty) {
                                requestScoresheetNavigation(navigate);
                              } else {
                                navigate();
                              }
                            }}
                          >
                            Class Record
                          </button>
                        </div>

                        <div className="periodTabs">
                          {PERIODS.map(
                            (
                              period
                            ) => (
                              <button
                                key={
                                  period
                                }
                                type="button"
                                className={`periodTab ${
                                  currentPeriod ===
                                  period
                                    ? "active"
                                    : ""
                                }`}
                                onClick={() => {
                                  if (period === currentPeriod) return;
                                  const navigate = () => setCurrentPeriod(period);
                                  if (scoresheetDirty) {
                                    requestScoresheetNavigation(navigate);
                                  } else {
                                    navigate();
                                  }
                                }}
                              >
                                {
                                  period
                                }
                              </button>
                            )
                          )}
                        </div>

                        <button
                          type="button"
                          className="toolbarButton exportButton exportGreenButton"
                          disabled={
                            exportingExcel
                          }
                          onClick={() =>
                            exportAssessmentRecord(
                              currentPeriod
                            )
                          }
                        >
                          {exportingExcel ? (
                            <>
                              <span className="buttonSpinner" />
                              Generating...
                            </>
                          ) : (
                            "Export Excel"
                          )}
                        </button>
                      </div>
                    </div>

                    {recordsView ===
                    "summary" ? (
                      <div className="recordSummary">
                        <div className="summaryTableWrap">
                          <table
                            className="classSummaryTable classSummaryTopTable"
                            aria-label="Class summary by sex"
                          >
                            <colgroup>
                              {CLASS_SUMMARY_TOP_WIDTHS.map((width, index) => (
                                <col key={`summary-top-column-${index}`} style={{ width }} />
                              ))}
                            </colgroup>
                            <thead>
                              <tr className="classSummaryGroupRow">
                                <th rowSpan={2}>Grade</th>
                                <th aria-label="Section heading" />
                                <th aria-label="Teacher heading" />
                                <th rowSpan={2}>Language</th>
                                <th rowSpan={2}>Sex</th>
                                <th rowSpan={2}>Number of Learners Enrolled</th>
                                <th rowSpan={2}>Number of Learners Assessed</th>
                                <th colSpan={4}>Assessment Part 1 Reading Level</th>
                                <th colSpan={3}>Average Score</th>
                                <th colSpan={5}>READING PROFILE</th>
                              </tr>
                              <tr className="classSummaryLeafRow">
                                <th>Section</th>
                                <th>Teacher</th>
                                <th>Full Refresher</th>
                                <th>Moderate Refresher</th>
                                <th>Light Refresher</th>
                                <th>Grade Ready</th>
                                <th>Reading Fluency</th>
                                <th>Reading Comprehension</th>
                                <th>Average Word Per Minute</th>
                                <th>Low Emerging Reader</th>
                                <th>High Emerging Reader</th>
                                <th>Developing Reader</th>
                                <th>Transitioning Reader</th>
                                <th>Reading At Grade Level</th>
                              </tr>
                            </thead>
                            <tbody>
                              {classSummaryRows.map((row, index) => (
                                <Fragment key={row.group}>
                                  {index === 2 && (
                                    <tr className="classSummarySpacerRow" aria-hidden="true">
                                      <td colSpan={19} />
                                    </tr>
                                  )}
                                  <tr
                                    className={
                                      row.group === "Total" ? "classSummaryTotalRow" : ""
                                    }
                                  >
                                    <td>Grade 3</td>
                                    <td>{user?.section || "—"}</td>
                                    <td>{user?.full_name || "—"}</td>
                                    <td>English</td>
                                    <td>{row.group}</td>
                                    <td>{row.enrolled}</td>
                                    <td>{row.assessed}</td>
                                    {row.part1Counts.map((value, partIndex) => (
                                      <td key={`${row.group}-part1-${partIndex}`}>{value}</td>
                                    ))}
                                    <td>{classSummaryPercent(row.averageFluency)}</td>
                                    <td>
                                      {classSummaryPercent(
                                        row.averageComprehension === null
                                          ? null
                                          : (row.averageComprehension / 6) * 100
                                      )}
                                    </td>
                                    <td>{classSummaryWpm(row.averageWpm, 2)}</td>
                                    {row.profileCounts.map((value, profileIndex) => (
                                      <td
                                        className="classSummaryProfileCell"
                                        key={`${row.group}-profile-${profileIndex}`}
                                      >
                                        {value}
                                      </td>
                                    ))}
                                  </tr>
                                </Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="summaryDetailSection">
                          <div className="summaryDetailScroller">
                            <table
                              className="classSummaryTable classSummaryDetailTable"
                              aria-label="Percent of learners at each proficiency level"
                            >
                              <colgroup>
                                {CLASS_SUMMARY_DETAIL_WIDTHS.map((width, index) => (
                                  <col key={`summary-detail-column-${index}`} style={{ width }} />
                                ))}
                              </colgroup>
                              <thead>
                                <tr className="classSummaryTitleRow">
                                  <th colSpan={15}>
                                    Percent (%) of Learners at Each Proficiency Level
                                  </th>
                                </tr>
                                <tr className="classSummaryGroupRow">
                                  <th aria-label="Language heading" />
                                  <th aria-label="Sex heading" />
                                  <th aria-label="Percent assessed heading" />
                                  <th colSpan={4}>Assessment Part 1 Reading Level</th>
                                  <th colSpan={3}>Average Score</th>
                                  <th colSpan={5}>READING PROFILE</th>
                                </tr>
                                <tr className="classSummaryLeafRow">
                                  <th>Language</th>
                                  <th>Sex</th>
                                  <th>Percent of Learners assessed</th>
                                  <th>Full Refresher</th>
                                  <th>Moderate Refresher</th>
                                  <th>Light Refresher</th>
                                  <th>Grade Ready</th>
                                  <th>Reading Fluency</th>
                                  <th>Reading Comprehension</th>
                                  <th>Average Word Per Minute</th>
                                  <th>Low Emerging Reader</th>
                                  <th>High Emerging Reader</th>
                                  <th>Developing Reader</th>
                                  <th>Transitioning Reader</th>
                                  <th>Reading At Grade Level</th>
                                </tr>
                              </thead>
                              <tbody>
                                {classSummaryRows.map((row) => {
                                  const valuePercent = (count) =>
                                    row.assessed > 0
                                      ? (Number(count) / row.assessed) * 100
                                      : 0;

                                  return (
                                    <tr
                                      className={
                                        row.group === "Total" ? "classSummaryTotalRow" : ""
                                      }
                                      key={row.group}
                                    >
                                      <td>English</td>
                                      <td>{row.group}</td>
                                      <td>{classSummaryPercent(row.assessedPercent)}</td>
                                      {row.part1Counts.map((count, partIndex) => (
                                        <td key={`${row.group}-detail-part1-${partIndex}`}>
                                          {classSummaryPercent(valuePercent(count))}
                                        </td>
                                      ))}
                                      <td>{classSummaryPercent(row.averageFluency)}</td>
                                      <td>
                                        {classSummaryPercent(
                                          row.averageComprehension === null
                                            ? null
                                            : (row.averageComprehension / 6) * 100
                                        )}
                                      </td>
                                      <td>{classSummaryWpm(row.averageWpm, 0)}</td>
                                      {row.profileCounts.map((count, profileIndex) => (
                                        <td
                                          className="classSummaryProfileCell"
                                          key={`${row.group}-detail-profile-${profileIndex}`}
                                        >
                                          {classSummaryPercent(valuePercent(count))}
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          <div className="summaryMetricGrid">
                            <div className="summaryMetricCard">
                              <div className="summaryMetricTitle">
                                % of Learners Assessed
                              </div>
                              {["Male", "Female"].map((group) => {
                                const assessed =
                                  recordSummaryFor(currentRecords, group).length;
                                const enrolled =
                                  learners.filter(
                                    (learner) =>
                                      String(learner.sex || "").toLowerCase() ===
                                      group.toLowerCase()
                                  ).length;
                                const percent = enrolled
                                  ? (assessed / enrolled) * 100
                                  : 0;
                                return (
                                  <div className="summaryMetricRow" key={group}>
                                    <span>{group}</span>
                                    <div className="summaryMetricBar" aria-hidden="true">
                                      <div
                                        className={`summaryMetricBarFill is${group}`}
                                        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                                      />
                                    </div>
                                    <strong>{percent.toFixed(2)}%</strong>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="summaryMetricCard">
                              <div className="summaryMetricTitle">
                                % of G3 Learners Assessed in English by Assessment Part 1 Reading Level
                              </div>
                              {PART1_LEVEL_LABELS.map((label) => {
                                const rowsForGroup =
                                  recordSummaryFor(currentRecords, "Total");
                                const percent = rowsForGroup.length
                                  ? (countPart1(rowsForGroup, label) /
                                      rowsForGroup.length) *
                                    100
                                  : 0;
                                return (
                                  <div className="summaryMetricRow" key={label}>
                                    <span>{label}</span>
                                    <div className="summaryMetricBar" aria-hidden="true">
                                      <div
                                        className="summaryMetricBarFill"
                                        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                                      />
                                    </div>
                                    <strong>{percent.toFixed(2)}%</strong>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="summaryMetricCard">
                              <div className="summaryMetricTitle">
                                % of G3 Learners Assessed in English by Assessment Part 2 Reading Level
                              </div>
                              {READING_PROFILE_LABELS.map((label) => {
                                const rowsForGroup =
                                  recordSummaryFor(currentRecords, "Total");
                                const percent = rowsForGroup.length
                                  ? (rowsForGroup.filter(
                                      (item) => item.profile === label
                                    ).length /
                                      rowsForGroup.length) *
                                    100
                                  : 0;
                                return (
                                  <div className="summaryMetricRow" key={label}>
                                    <span>{label}</span>
                                    <div className="summaryMetricBar" aria-hidden="true">
                                      <div
                                        className="summaryMetricBarFill"
                                        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                                      />
                                    </div>
                                    <strong>{percent.toFixed(2)}%</strong>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>                      </div>
                    ) : recordsView ===
                    "class-record" ? (
                      <div className="recordTemplateView">
                        <div className="recordTemplateScroller">
                          <table className="recordTemplateTable classRecordTable classRecordWorkbookTable">
                            <colgroup>
                              {CLASS_RECORD_WIDTHS.map((width, index) => (
                                <col key={`class-record-column-${index}`} style={{ width: `${width}px` }} />
                              ))}
                            </colgroup>
                            <thead>
                              <tr className="classRecordWorkbookMetaRow">
                                <th colSpan={2} className="classRecordMetaLabel">School</th>
                                <th colSpan={2} className="classRecordMetaValue">
                                  {user?.school_name || user?.school_id || ""}
                                </th>
                                <th colSpan={7} rowSpan={3} className="classRecordWorkbookTitle">
                                  GRADE 3 Reading Assessment CLASS RECORD
                                </th>
                              </tr>
                              <tr className="classRecordWorkbookMetaRow">
                                <th colSpan={2} className="classRecordMetaLabel">Teacher</th>
                                <th colSpan={2} className="classRecordMetaValue">{user?.full_name || ""}</th>
                              </tr>
                              <tr className="classRecordWorkbookMetaRow">
                                <th colSpan={2} className="classRecordMetaLabel">Grade Level</th>
                                <th colSpan={2} className="classRecordMetaValue">Grade 3</th>
                              </tr>
                              <tr className="classRecordLanguageRow">
                                <th rowSpan={3}>S/N</th>
                                <th rowSpan={3}>LRN</th>
                                <th rowSpan={3}>Name of Learner</th>
                                <th rowSpan={3}>Sex</th>
                                <th colSpan={6} className="classRecordEnglishBand">English</th>
                                <th rowSpan={3} className="classRecordRemarksHead">Remarks</th>
                              </tr>
                              <tr className="classRecordGroupRow classRecordEnglishRow">
                                <th colSpan={2}>Assessment Part 1</th>
                                <th colSpan={3}>Assessment Part 2</th>
                                <th rowSpan={2}>READING PROFILE</th>
                              </tr>
                              <tr className="classRecordSubheadRow classRecordEnglishRow">
                                <th>Assessment Part 1<br />Reading Level</th>
                                <th>% of Total<br />Score</th>
                                <th>Reading<br />Fluency</th>
                                <th>Reading<br />Comprehension</th>
                                <th>Average<br />Word Per Minute</th>
                              </tr>
                            </thead>
                            <tbody>
                              {currentRecords.length === 0 ? (
                                <tr>
                                  <td colSpan={11}>
                                    <div className="emptyState">
                                      <div className="emptyIcon">▤</div>
                                      <h3>No records for {currentPeriod}</h3>
                                      <p>Completed assessments will appear here after they are saved to the database.</p>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                currentRecords.slice().sort((left, right) =>
                                  formatName(left.learner).localeCompare(formatName(right.learner))
                                ).map(({ assessment, learner }, index) => {
                                  const total =
                                    Number(assessment.task1_score || 0) +
                                    Number(assessment.task2_score || 0);
                                  const profile =
                                    getRecordProfile(
                                      assessment
                                    );
                                  const readingPctValue =
                                    getRecordFluency(
                                      assessment
                                    );
                                  const readingPct =
                                    readingPctValue === null
                                      ? ""
                                      : Math.round(readingPctValue) + "%";
                                  const wordsRead =
                                    getRecordWordsRead(
                                      assessment
                                    );
                                  const seconds = Number(assessment.timer_seconds ?? 0);
                                  const wpm =
                                    assessment.wpm ??
                                    (seconds > 0
                                      ? Math.round((Number(wordsRead) / seconds) * 60)
                                      : "");
                                  const passageAdministered = hasRecordedPassageAssessment(assessment);
                                  const profileTone = profile === "Reading At Grade Level"
                                    ? " classRecordProfileGrade"
                                    : profile === "Low Emerging Reader"
                                      ? " classRecordProfileLow"
                                      : "";

                                  return (
                                    <tr key={assessment.id}>
                                      <td>{index + 1}</td>
                                      <td>{learner.lrn}</td>
                                      <td className="nameStrong">{formatName(learner)}</td>
                                      <td>{learner.sex}</td>
                                      <td className="classRecordEnglishCell">{total <= 0 ? "Full Refresher" : total <= 10 ? "Moderate Refresher" : total <= 16 ? "Light Refresher" : "Grade Ready"}</td>
                                      <td className="classRecordEnglishCell">{Math.round((total / 20) * 100)}%</td>
                                      <td className="classRecordEnglishCell">{passageAdministered ? readingPct : ""}</td>
                                      <td className="classRecordEnglishCell">{passageAdministered ? `${Math.round((Number(assessment.comprehension_score || 0) / 6) * 100)}%` : ""}</td>
                                      <td className="classRecordEnglishCell">{passageAdministered ? wpm : ""}</td>
                                      <td className={`classRecordEnglishCell classRecordProfileCell${profileTone}`}>{profile}</td>
                                      <td>{assessment.remarks || ""}</td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="scoresheetView">
                        <div className="scoresheetControls" aria-label="Scoresheet controls">
                          <div className="scoresheetZoomControls" role="group" aria-label="Scoresheet zoom">
                            <button
                              type="button"
                              className="scoresheetControlButton"
                              aria-label="Zoom out"
                              disabled={scoresheetZoom <= 0.65}
                              onClick={() =>
                                setScoresheetZoom((current) =>
                                  Math.max(0.65, Number((current - 0.1).toFixed(2)))
                                )
                              }
                            >
                              −
                            </button>
                            <span>{Math.round(scoresheetZoom * 100)}%</span>
                            <button
                              type="button"
                              className="scoresheetControlButton"
                              aria-label="Zoom in"
                              disabled={scoresheetZoom >= 1.35}
                              onClick={() =>
                                setScoresheetZoom((current) =>
                                  Math.min(1.35, Number((current + 0.1).toFixed(2)))
                                )
                              }
                            >
                              +
                            </button>
                          </div>

                          <div className="scoresheetModeControls" role="group" aria-label="Scoresheet mode">
                            <button
                              type="button"
                              className={`scoresheetModeButton ${
                                scoresheetMode === "view" ? "active" : ""
                              }`}
                              onClick={() => {
                                if (scoresheetMode === "view") return;
                                if (scoresheetDirty) {
                                  requestScoresheetNavigation(() =>
                                    setScoresheetMode("view")
                                  );
                                } else {
                                  setScoresheetMode("view");
                                }
                              }}
                            >
                              View Mode
                            </button>
                            <button
                              type="button"
                              className={`scoresheetModeButton ${
                                scoresheetMode === "edit" ? "active" : ""
                              }`}
                              onClick={() => setScoresheetMode("edit")}
                            >
                              Edit Mode
                            </button>
                            {scoresheetMode === "edit" && (
                              <button
                                type="button"
                                className="toolbarButton scoresheetSaveButton"
                                disabled={!scoresheetDirty || savingScoresheet}
                                onClick={() => void saveScoresheetChanges()}
                              >
                                {savingScoresheet ? "Saving…" : "Save Changes"}
                              </button>
                            )}
                          </div>
                        </div>
                        {/*
                          * The scoresheet is drawn as the workbook prints it: the
                          * same rows, the same merges and the same headings, in
                          * one continuous grid. Every label below is the text
                          * the exported sheet carries, so a record can be read
                          * against the paper form cell for cell.
                          */}
                        <div
                          className="scoresheetScroller"
                          role="region"
                          aria-label="English reading assessment scoresheet"
                          tabIndex={0}
                        >
                          <table
                            className="scoresheetGrid"
                            style={{ "--scoresheet-zoom": scoresheetZoom }}
                          >
                            <colgroup>
                              {SCORESHEET_GRID_WIDTHS.map((width, index) => (
                                <col key={index} style={{ width: `${width}px` }} />
                              ))}
                            </colgroup>

                            <tbody>
                              <tr className="ssAssessmentRow">
                                <th colSpan={2} scope="row" className="ssLabel">
                                  ASSESSMENT TYPE
                                </th>
                                <td className="ssValue">{currentPeriod}</td>
                                <td colSpan={18} className="ssEmpty">
                                  <span className="ssWorkbookTitle">
                                    GRADE 3 English Reading Assessment Scoresheet
                                  </span>
                                </td>
                              </tr>

                              <tr>
                                <th colSpan={2} scope="row" className="ssLabel">
                                  School ID:
                                </th>
                                <td className="ssValue">{user?.school_id || ""}</td>
                                <th colSpan={2} scope="row" className="ssLabel">
                                  Total Enrolment
                                </th>
                                <td className="ssValue ssNumber">
                                  {scoresheetHeader.total.enrolled}
                                </td>
                                <th scope="row" className="ssLabel">
                                  Assessed :
                                </th>
                                <td className="ssValue ssNumber">
                                  {scoresheetHeader.total.assessed}
                                </td>
                                <td colSpan={13} className="ssEmpty" />
                              </tr>

                              <tr>
                                <th colSpan={2} scope="row" className="ssLabel">
                                  School Name:
                                </th>
                                <td className="ssValue">{user?.school_name || ""}</td>
                                <th scope="row" className="ssLabel">
                                  Male
                                </th>
                                <th scope="row" className="ssLabel">
                                  Female
                                </th>
                                <th colSpan={3} rowSpan={2} className="ssGroupHead">
                                  Assessment Part 1 (Word Recognition)
                                </th>
                                <th rowSpan={5} className="ssLegend">
                                  WORD SCORE 0 - Full Refresher 1 to 10 –
                                  Moderate Refresher 11 to 16 – Light Refresher
                                  17 to 20 – Grade Ready
                                </th>
                                <th colSpan={6} rowSpan={2} className="ssGroupHead">
                                  Assessment Part 2 (Reading Fluency and
                                  Comprehension)
                                </th>
                                <td className="ssEmpty" />
                                <td className="ssEmpty" />
                                <td className="ssEmpty" />
                                <td className="ssEmpty" />
                                <td className="ssEmpty" />
                                <td className="ssEmpty" />
                              </tr>

                              <tr>
                                <th colSpan={2} scope="row" className="ssLabel">
                                  Teacher:
                                </th>
                                <td className="ssValue">{user?.full_name || ""}</td>
                                <td className="ssValue ssNumber">
                                  {scoresheetHeader.male.enrolled}
                                </td>
                                <td className="ssValue ssNumber">
                                  {scoresheetHeader.female.enrolled}
                                </td>
                                <td colSpan={6} rowSpan={4} className="ssReference">
                                  <img
                                    src="/templates/scoresheet-reading-levels.png"
                                    alt="Reading level criteria and observation reference"
                                  />
                                </td>
                              </tr>

                              <tr>
                                <th colSpan={2} scope="row" className="ssLabel">
                                  Grade:
                                </th>
                                <td className="ssValue">Grade 3</td>
                                <th rowSpan={3} className="ssNote">
                                  Enter Male or Female
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Enter date of assessment (mm/dd/yy)
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Task 1 – Write the number of letters sounded
                                  out correctly
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Words (Task 2) If task 1 score is 1 to 10
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Total Score = Task 1 Score + Task 2 Score
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Story Number 1 or 2
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Total Reading Miscues
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Number of words read within 2 mins
                                </th>
                                <th colSpan={2} rowSpan={3} className="ssNote">
                                  Total Time Used in Reading (Max : 2 Mins)
                                </th>
                                <th rowSpan={3} className="ssNote">
                                  Number of Words per Minute (WPM)
                                </th>
                              </tr>

                              <tr>
                                <th colSpan={2} scope="row" className="ssLabel">
                                  Section:
                                </th>
                                <td className="ssValue">{user?.section || ""}</td>
                              </tr>

                              <tr>
                                <th colSpan={2} scope="row" className="ssLabel">
                                  Language:
                                </th>
                                <td className="ssValue">English</td>
                              </tr>

                              <tr className="ssColumnRow">
                                <th scope="col">S/N</th>
                                <th scope="col">LRN</th>
                                <th scope="col">Name of Learner</th>
                                <th scope="col">Sex</th>
                                <th scope="col">Date of Assessment</th>
                                <th scope="col">Task 1 (10)</th>
                                <th scope="col">Words (10)</th>
                                <th scope="col">Total Score</th>
                                <th scope="col">Part 1 Reading Level</th>
                                <th scope="col">Story Number</th>
                                <th scope="col">Number of Miscue</th>
                                <th scope="col">Words Read</th>
                                <th colSpan={2} scope="col" className="ssTimeHeader">
                                  <span className="ssTimeHeaderLayout">
                                    <span>Total</span>
                                    <span className="ssTimeHeaderParts">
                                      <span>Mins</span>
                                      <span>Secs</span>
                                    </span>
                                  </span>
                                </th>
                                <th scope="col">WPM</th>
                                <th scope="col">Reading %</th>
                                <th scope="col">Total Correct Answer</th>
                                <th scope="col">Learner Experience (Rating 1-5)</th>
                                <th scope="col">Observation Level</th>
                                <th scope="col">READING PROFILE</th>
                                <th scope="col">Remarks</th>
                              </tr>

                              {currentRecords.length === 0 ? (
                                <tr>
                                  <td colSpan={21}>
                                    <div className="emptyState">
                                      <div className="emptyIcon">▤</div>

                                      <h3>No records for {currentPeriod}</h3>

                                      <p>
                                        Completed assessments will appear here
                                        after they are saved to the database.
                                      </p>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                currentRecords.map(({ assessment, learner }) => {
                                  const draft =
                                    scoresheetDrafts[String(assessment.id)] || {};
                                  const editedAssessment = {
                                    ...assessment,
                                    ...draft,
                                  };
                                  const task1Score = Number(
                                    scoresheetValue(assessment, "task1_score") ?? 0
                                  );
                                  const task2Score = Number(
                                    scoresheetValue(assessment, "task2_score") ?? 0
                                  );
                                  const total = task1Score + task2Score;
                                  const passageStarted = total > 10;
                                  const miscues = passageStarted
                                    ? Number(
                                        scoresheetValue(
                                          assessment,
                                          "total_miscues"
                                        ) ?? 0
                                      )
                                    : 0;
                                  const wordsRead = passageStarted
                                    ? Number(
                                        scoresheetValue(assessment, "words_read") ??
                                          Math.max(0, 100 - miscues)
                                      )
                                    : 0;
                                  const seconds = passageStarted
                                    ? Number(
                                        scoresheetValue(
                                          assessment,
                                          "timer_seconds"
                                        ) ?? 0
                                      )
                                    : 0;
                                  const fluency = passageStarted
                                    ? Math.max(0, Math.min(100, 100 - miscues))
                                    : 0;
                                  const comprehensionScore = passageStarted
                                    ? Number(
                                        scoresheetValue(
                                          assessment,
                                          "comprehension_score"
                                        ) ?? 0
                                      )
                                    : 0;
                                  const profile = getRecordProfile({
                                    ...editedAssessment,
                                    task1_score: task1Score,
                                    task2_score: task2Score,
                                    miscue_accuracy: fluency,
                                    comprehension_score: comprehensionScore,
                                    timer_seconds: passageStarted ? seconds : null,
                                    overall_classification: draft.overall_classification,
                                    classification_label: draft.classification_label,
                                  });
                                  const wpm =
                                    passageStarted && seconds > 0
                                      ? Number(((wordsRead / seconds) * 60).toFixed(2))
                                      : "";
                                  const field = (
                                    name,
                                    options = {}
                                  ) => (
                                    <input
                                      className="scoresheetInput"
                                      type={options.type || "number"}
                                      min={options.min}
                                      max={options.max}
                                      step={options.step || 1}
                                      value={
                                        options.value ??
                                        scoresheetValue(assessment, name) ??
                                        ""
                                      }
                                      disabled={options.disabled}
                                      aria-label={options.label}
                                      onChange={(event) =>
                                        updateScoresheetDraft(
                                          assessment,
                                          name,
                                          event.target.value
                                        )
                                      }
                                    />
                                  );

                                  return (
                                    <tr key={assessment.id}>
                                      <td className="ssData ssNumber">
                                        {currentRecords.findIndex(
                                          (item) =>
                                            item.assessment.id === assessment.id
                                        ) + 1}
                                      </td>

                                      <td className="ssData ssText">
                                        {learner.lrn}
                                      </td>

                                      <td className="ssData ssText">
                                        {formatName(learner)}
                                      </td>

                                      <td className="ssData">{learner.sex}</td>

                                      <td className="ssData">
                                        {scoresheetMode === "edit" ? (
                                          field("date_administered", {
                                            type: "date",
                                            value: dateInputValue(
                                              scoresheetValue(
                                                assessment,
                                                "date_administered"
                                              )
                                            ),
                                            label: `Assessment date for ${formatName(
                                              learner
                                            )}`,
                                          })
                                        ) : assessment.date_administered ? (
                                          new Date(
                                            assessment.date_administered
                                          ).toLocaleDateString()
                                        ) : (
                                          ""
                                        )}
                                      </td>

                                      <td className="ssData ssNumber">
                                        {scoresheetMode === "edit"
                                          ? field("task1_score", {
                                              min: 0,
                                              max: 10,
                                              value: task1Score,
                                              label: `Task 1 score for ${formatName(
                                                learner
                                              )}`,
                                            })
                                          : task1Score}
                                      </td>

                                      <td className="ssData ssNumber">
                                        {scoresheetMode === "edit"
                                          ? field("task2_score", {
                                              min: 0,
                                              max: 10,
                                              value: task2Score,
                                              label: `Task 2 score for ${formatName(
                                                learner
                                              )}`,
                                            })
                                          : task2Score}
                                      </td>

                                      <td className="ssData ssNumber">{total}</td>

                                      <td
                                        className={`ssData ssLevel ${profileClass(
                                          total <= 0
                                            ? "Full Refresher"
                                            : total <= 10
                                              ? "Moderate Refresher"
                                              : total <= 16
                                                ? "Light Refresher"
                                                : "Grade Ready"
                                        )}`}
                                      >
                                        {total <= 0
                                          ? "Full Refresher"
                                          : total <= 10
                                            ? "Moderate Refresher"
                                            : total <= 16
                                              ? "Light Refresher"
                                              : "Grade Ready"}
                                      </td>

                                      <td className="ssData ssNumber">
                                        {scoresheetMode === "edit"
                                          ? field("story_number", {
                                              min: 1,
                                              max: 2,
                                              value:
                                                scoresheetValue(
                                                  assessment,
                                                  "story_number"
                                                ) ?? "",
                                              disabled: !passageStarted,
                                              label: `Story number for ${formatName(
                                                learner
                                              )}`,
                                            })
                                          : scoresheetValue(
                                              assessment,
                                              "story_number"
                                            ) ?? ""}
                                      </td>

                                      <td className="ssData ssNumber">
                                        {scoresheetMode === "edit"
                                          ? field("total_miscues", {
                                              min: 0,
                                              max: 100,
                                              value: miscues,
                                              disabled: !passageStarted,
                                              label: `Total miscues for ${formatName(
                                                learner
                                              )}`,
                                            })
                                          : miscues}
                                      </td>

                                      <td className="ssData ssNumber">
                                        {scoresheetMode === "edit"
                                          ? field("words_read", {
                                              min: 0,
                                              max: 100,
                                              value: wordsRead,
                                              disabled: !passageStarted,
                                              label: `Words read for ${formatName(
                                                learner
                                              )}`,
                                            })
                                          : wordsRead}
                                      </td>

                                      <td className="ssData ssNumber">
                                        {scoresheetMode === "edit" ? (
                                          <input
                                            className="scoresheetInput"
                                            type="number"
                                            min="0"
                                            max="2"
                                            value={
                                              passageStarted
                                                ? Math.floor(seconds / 60)
                                                : ""
                                            }
                                            disabled={!passageStarted}
                                            aria-label={`Reading minutes for ${formatName(
                                              learner
                                            )}`}
                                            onChange={(event) =>
                                              updateScoresheetDraft(
                                                assessment,
                                                "timer_seconds",
                                                Math.min(
                                                  120,
                                                  Math.max(
                                                    0,
                                                    Number(event.target.value || 0) *
                                                      60 +
                                                      (seconds % 60)
                                                  )
                                                )
                                              )
                                            }
                                          />
                                        ) : seconds ? (
                                          Math.floor(seconds / 60)
                                        ) : (
                                          ""
                                        )}
                                      </td>

                                      <td className="ssData ssNumber">
                                        {scoresheetMode === "edit" ? (
                                          <input
                                            className="scoresheetInput"
                                            type="number"
                                            min="0"
                                            max="59"
                                            value={passageStarted ? seconds % 60 : ""}
                                            disabled={!passageStarted}
                                            aria-label={`Reading seconds for ${formatName(
                                              learner
                                            )}`}
                                            onChange={(event) =>
                                              updateScoresheetDraft(
                                                assessment,
                                                "timer_seconds",
                                                Math.min(
                                                  120,
                                                  Math.max(
                                                    0,
                                                    Math.floor(seconds / 60) * 60 +
                                                      Number(event.target.value || 0)
                                                  )
                                                )
                                              )
                                            }
                                          />
                                        ) : seconds ? (
                                          seconds % 60
                                        ) : (
                                          ""
                                        )}
                                      </td>

                                      <td className="ssData ssNumber">
                                        {wpm}
                                      </td>

                                      <td className="ssData ssNumber">
                                        {passageStarted ? `${fluency}%` : ""}
                                      </td>

                                      <td className="ssData ssNumber">
                                        {scoresheetMode === "edit"
                                          ? field("comprehension_score", {
                                              min: 0,
                                              max: 6,
                                              value: comprehensionScore,
                                              disabled: !passageStarted,
                                              label: `Comprehension score for ${formatName(
                                                learner
                                              )}`,
                                            })
                                          : passageStarted
                                            ? comprehensionScore
                                            : ""}
                                      </td>

                                      <td className="ssData ssNumber">
                                        {scoresheetMode === "edit"
                                          ? field("experience_rating", {
                                              min: 1,
                                              max: 5,
                                              value:
                                                scoresheetValue(
                                                  assessment,
                                                  "experience_rating"
                                                ) ?? "",
                                              disabled: !passageStarted,
                                              label: `Learner experience for ${formatName(
                                                learner
                                              )}`,
                                            })
                                          : scoresheetValue(
                                              assessment,
                                              "experience_rating"
                                            ) ?? ""}
                                      </td>

                                      <td className="ssData ssCentered">
                                        {scoresheetMode === "edit"
                                          ? field("observation_level", {
                                              min: 1,
                                              max: 4,
                                              value:
                                                scoresheetValue(
                                                  assessment,
                                                  "observation_level"
                                                ) ?? "",
                                              disabled: !passageStarted,
                                              label: `Observation level for ${formatName(
                                                learner
                                              )}`,
                                            })
                                          : scoresheetValue(
                                              assessment,
                                              "observation_level"
                                            ) || ""}
                                      </td>

                                      <td
                                        className={`ssData ssLevel ${profileClass(
                                          profile
                                        )} ${
                                          profile === "Reading At Grade Level"
                                            ? "ssProfileGrade"
                                            : profile === "Low Emerging Reader"
                                              ? "ssProfileLow"
                                              : ""
                                        }`}
                                      >
                                        {profile}
                                      </td>

                                      <td className="ssData ssCentered">
                                        {scoresheetMode === "edit" ? (
                                          <input
                                            className="scoresheetInput scoresheetTextInput"
                                            type="text"
                                            maxLength={5000}
                                            value={
                                              scoresheetValue(assessment, "remarks") || ""
                                            }
                                            aria-label={`Remarks for ${formatName(
                                              learner
                                            )}`}
                                            onChange={(event) =>
                                              updateScoresheetDraft(
                                                assessment,
                                                "remarks",
                                                event.target.value
                                              )
                                            }
                                          />
                                        ) : (
                                          scoresheetValue(assessment, "remarks") || ""
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab ===
                "activities" && (
                <>
                  <div className="panel manageAssessmentPanel">
                    <div className="panelHeader">
                      <div>
                        <div className="panelHeaderTitle">
                          Assessment Content
                        </div>
                      </div>

                      <div className="assessmentContentActions">
                        <div className="periodTabs">
                          {PERIODS.map(
                            (
                              period
                            ) => (
                              <button
                                key={
                                  period
                                }
                                type="button"
                                className={`periodTab ${
                                  activityPeriod ===
                                  period
                                    ? "active"
                                    : ""
                                }`}
                                onClick={() =>
                                  setActivityPeriod(
                                    period
                                  )
                                }
                              >
                                {
                                  period
                                }
                              </button>
                            )
                          )}
                        </div>

                        <button
                          type="button"
                          className="toolbarButton assessmentSaveButton"
                          disabled={
                            savingActivities ||
                            !activityDirtyPeriods[activityPeriod]
                          }
                          onClick={async () => {
                            const saved = await saveActivities(activityPeriod);
                            if (saved) showToast(`${activityPeriod} content saved.`);
                          }}
                        >
                          {savingActivities ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>

                    <div className="activityTabs">
                      {[
                        [
                          "letters",
                          "Letters",
                        ],
                        [
                          "words",
                          "Words",
                        ],
                        [
                          "stories",
                          "Stories",
                        ],
                      ].map(
                        ([
                          id,
                          label,
                        ]) => (
                          <button
                            key={
                              id
                            }
                            type="button"
                            className={`activityTab ${
                              activityTab ===
                              id
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setActivityTab(
                                id
                              )
                            }
                          >
                            {
                              label
                            }
                          </button>
                        )
                      )}
                    </div>

                    {/*
                      * How a run picks its items out of everything saved above.
                      * This remains a local draft until the teacher presses
                      * Save, just like edits to letters, words and stories.
                      */}
                    <div
                      className="contentModeCard"
                      role="radiogroup"
                      aria-label={`Item selection for ${activityPeriod} ${activityTab}`}
                    >
                      <div className="contentModeHeading">
                        <span className="contentModeHeadingLabel">
                          Item selection
                        </span>
                        <span className="contentModeHeadingPeriod">
                          {activityPeriod}
                        </span>
                      </div>

                      <div className="contentModeOptions">
                        {[
                          [
                            "fixed",
                            "Fixed default",
                            `Always uses the chosen ${ASSESSMENT_CONTENT_REQUIREMENTS[activityTab]} ${contentDefaultLabel(activityTab)}.`,
                          ],
                          [
                            "random",
                            "Randomize each assessment",
                            `Draws ${ASSESSMENT_CONTENT_REQUIREMENTS[activityTab]} ${contentDefaultLabel(activityTab)} from everything saved for each new assessment.`,
                          ],
                        ].map(([modeId, modeLabel, modeHint]) => {
                          const selected =
                            currentContentMode === modeId;
                          return (
                            <button
                              key={modeId}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              className={`contentModeOption ${
                                selected ? "isSelected" : ""
                              }`}
                              onClick={() => {
                                if (selected) return;
                                setContentModes((current) => ({
                                  ...current,
                                  [activityPeriod]: {
                                    ...normalizeAssessmentContentModes(
                                      current[activityPeriod]
                                    ),
                                    [activityTab]: modeId,
                                  },
                                }));
                                setActivityPeriodDirty(activityPeriod, true);
                              }}
                            >
                              <span className="contentModeOptionMark" aria-hidden="true" />
                              <span className="contentModeOptionText">
                                <span className="contentModeOptionLabel">
                                  {modeLabel}
                                </span>
                                <span className="contentModeOptionHint">
                                  {modeHint}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/*
                        * When the fixed set is in use, say which items it
                        * administers. More saved than a run uses means the
                        * teacher chooses; exactly as many means there is
                        * nothing to choose.
                        */}
                      {currentContentMode === "fixed" && (
                        <div className="contentModeDefaults">
                          {activities[activityPeriod][activityTab].length <=
                          ASSESSMENT_CONTENT_REQUIREMENTS[activityTab] ? (
                            <span>
                              All{" "}
                              {activities[activityPeriod][activityTab].length}{" "}
                              saved{" "}
                              {contentDefaultLabel(activityTab)} are used -
                              that is exactly what an assessment needs.
                            </span>
                          ) : (
                            <>
                              <span>
                                <strong>
                                  {chosenContentDefaultCount} of{" "}
                                  {ASSESSMENT_CONTENT_REQUIREMENTS[activityTab]}
                                </strong>{" "}
                                {contentDefaultLabel(activityTab)} ticked as the
                                default.
                              </span>
                              <span className="contentModeDefaultsHint">
                                Tick the{" "}
                                {ASSESSMENT_CONTENT_REQUIREMENTS[activityTab]}{" "}
                                {contentDefaultLabel(activityTab)} every
                                assessment should use, in the Default column of
                                the {activityTab} list below.
                                {chosenContentDefaultCount <
                                ASSESSMENT_CONTENT_REQUIREMENTS[activityTab]
                                  ? ` The remaining ${
                                      ASSESSMENT_CONTENT_REQUIREMENTS[
                                        activityTab
                                      ] - chosenContentDefaultCount
                                    } fill from the top of the list.`
                                  : ""}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        padding:
                          16,
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "center",
                          marginBottom:
                            11,
                          gap: 10,
                        }}
                      >
                        <strong
                          style={{
                            fontSize:
                              11,
                            color:
                              "#2a3a55",
                          }}
                        >
                          {activityTab ===
                          "letters"
                            ? "Letter Items"
                            : activityTab ===
                              "words"
                            ? "Word Items"
                            : "Stories"}
                          <span className="activityRequirementCount">
                            {" "}
                            ({activities[activityPeriod][activityTab].length} saved ·{" "}
                            {ASSESSMENT_CONTENT_REQUIREMENTS[activityTab]} used per assessment)
                          </span>
                        </strong>

                        <div className="activityItemActions">
                          {activityTab === "stories" && (
                            <button
                              type="button"
                              className="toolbarButton storyImportButton"
                              onClick={() => {
                                setStoryImportDragActive(false);
                                setStoryImport({ status: "idle" });
                              }}
                            >
                              Import file
                            </button>
                          )}

                          <button
                            type="button"
                            className="toolbarButton activityAddButton"
                            onClick={() =>
                              editActivity(
                                activityTab,
                                -1
                              )
                            }
                          >
                            {activityTab === "stories" ? "+ Add Story" : "+ Add Item"}
                          </button>
                        </div>
                      </div>

                      <input
                        ref={storyImportInputRef}
                        type="file"
                        accept={STORY_IMPORT_FILE_ACCEPT}
                        onChange={handleStoryImportFile}
                        className="storyImportFileInput"
                        aria-label="Choose a story file to import"
                      />

                      {activities[
                        activityPeriod
                      ][
                        activityTab
                      ].length === 0 ? (
                        <div className="emptyState">
                          <div className="emptyIcon">
                            +
                          </div>

                          <h3>
                            No content items
                          </h3>

                          <p>
                            Add your first
                            activity item.
                          </p>
                        </div>
                      ) : (
                        <div className="activityItemsWrap">
                          <table className="activityItemsTable">
                            <thead>
                              <tr>
                                <th>
                                  #
                                </th>

                                <th>
                                  Content
                                </th>

                                {showContentDefaultsColumn && (
                                  <th>
                                    Default
                                  </th>
                                )}

                                <th>
                                  Actions
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {activities[
                                activityPeriod
                              ][
                                activityTab
                              ].map(
                                (
                                  item,
                                  index
                                ) => {
                                  const itemIsDefault =
                                    showContentDefaultsColumn &&
                                    isContentItemDefault(
                                      activityTab,
                                      item,
                                      contentDefaults[activityPeriod]
                                    );

                                  return (
                                  <tr
                                    key={
                                      activityTab ===
                                      "stories"
                                        ? item.id
                                        : `${activityTab}-${index}`
                                    }
                                  >
                                    <td className="activityItemIndex">
                                      {index +
                                        1}
                                    </td>

                                    <td className="nameStrong activityItemContent">
                                      {activityTab ===
                                      "stories"
                                        ? item.title
                                        : item}
                                    </td>

                                    {showContentDefaultsColumn && (
                                      <td className="activityItemDefault">
                                        <label className="contentDefaultToggle">
                                          <input
                                            type="checkbox"
                                            checked={itemIsDefault}
                                            onChange={() =>
                                              toggleContentDefault(
                                                activityPeriod,
                                                activityTab,
                                                item
                                              )
                                            }
                                          />
                                          <span>
                                            {itemIsDefault
                                              ? "Default"
                                              : "Not used"}
                                          </span>
                                        </label>
                                      </td>
                                    )}

                                    <td className="activityItemActionCell">
                                      <div className="inlineActions">
                                        <button
                                          type="button"
                                          className="smallButton"
                                          onClick={() =>
                                            editActivity(
                                              activityTab,
                                              index
                                            )
                                          }
                                        >
                                          Edit
                                        </button>

                                        <button
                                          type="button"
                                          className="smallButton redSmall"
                                          onClick={() =>
                                            removeActivity(
                                              activityTab,
                                              index
                                            )
                                          }
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                  );
                                }
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {activeTab ===
                "analytics" && (
                <div
                  className="panel analyticsMainPanel analyticsRedesign"
                  onClick={() => {
                    if (analyticsChartFocus) setAnalyticsChartFocus(null);
                  }}
                >
                  <ReadingProfileProgressChart
                    periods={analyticsPeriodComparison}
                    mode={analyticsChartMode}
                    onModeChange={setAnalyticsChartMode}
                    focus={analyticsChartFocus}
                    onFocus={setAnalyticsChartFocus}
                    onExpand={setAnalyticsChartOverlayPeriod}
                  />

                  <AnalyticsComparisonPanel
                    periods={analyticsPeriodComparison}
                    selection={analyticsComparisonSelection}
                    onSelectionChange={setAnalyticsComparisonSelection}
                  />

                  <section className="analyticsLearnerPanel">
                    <div className="analyticsSectionHead">
                      <h3>Learner Results</h3>
                      <span className="analyticsLearnerCount">
                        {analyticsLearnerOptions.length} learner{analyticsLearnerOptions.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="analyticsLearnerWorkspace">
                      <aside className="analyticsLearnerDirectory" aria-label="Learners with assessment results">
                        <div className="analyticsDirectoryTools">
                          <label className="analyticsSearchField">
                            <span>Search</span>
                            <input
                              type="search"
                              value={analyticsLearnerSearch}
                              onChange={(event) => setAnalyticsLearnerSearch(event.target.value)}
                              placeholder="Name or LRN"
                              aria-label="Search learner results"
                            />
                          </label>
                          <label className="analyticsSortField">
                            <span>Sort</span>
                            <select
                              value={analyticsLearnerSort}
                              onChange={(event) => setAnalyticsLearnerSort(event.target.value)}
                              aria-label="Sort learner results"
                            >
                              <option value="name-asc">A–Z</option>
                              <option value="name-desc">Z–A</option>
                              <option value="recent">Recent</option>
                            </select>
                          </label>
                        </div>

                        <div className="analyticsLearnerList">
                          {analyticsVisibleLearners.length ? analyticsVisibleLearners.map((learner) => {
                            const selected = String(learner.id) === String(analyticsLearnerId);
                            const periods = PERIODS.filter((period) =>
                              analyticsAssessedRows.some((row) =>
                                Number(row.assessment?.learner_id) === Number(learner.id) &&
                                row.assessment?.assessment_period === period
                              )
                            );
                            return (
                              <button
                                type="button"
                                className={`analyticsLearnerRow${selected ? " selected" : ""}`}
                                aria-pressed={selected}
                                aria-haspopup={analyticsMobileView ? "dialog" : undefined}
                                key={learner.id}
                                onClick={() => {
                                  selectAnalyticsLearner(learner.id);
                                  if (analyticsMobileView) setAnalyticsMobileResultOpen(true);
                                }}
                              >
                                <span className="analyticsLearnerIdentity">
                                  <strong>{formatName(learner)}</strong>
                                  <small>{learner.lrn || "No LRN"} · {learner.sex || "—"}</small>
                                </span>
                                <span className="analyticsLearnerPeriods" aria-label={`${periods.join(", ")} results`}>
                                  {PERIODS.map((period) => (
                                    <small key={period} className={periods.includes(period) ? "available" : ""}>{period}</small>
                                  ))}
                                </span>
                              </button>
                            );
                          }) : (
                            <div className="analyticsDirectoryEmpty">
                              {analyticsLearnerOptions.length ? "No matching learners." : "No completed assessments."}
                            </div>
                          )}
                        </div>
                      </aside>

                      <AnalyticsLearnerResultPanel
                        className="analyticsDesktopResult"
                        selectedLearner={analyticsSelectedLearner}
                        selectedPeriods={analyticsSelectedPeriods}
                        period={analyticsPeriod}
                        onPeriodChange={setAnalyticsPeriod}
                        loading={analyticsDetailLoading}
                        error={analyticsDetailError}
                        selectedAssessment={analyticsSelectedAssessment}
                        detail={analyticsDetail}
                      />
                    </div>
                  </section>
                </div>
              )}

              {activeTab ===
                "profile" && (
                <>
                  <div className="panel profileMainPanel fancyProfilePanel">
                    <div className="panelHeader profileHeaderFancy">
                      <div className="profileIdentity">
                        <div className="profileAvatar">
                          {(user?.full_name || "T").trim().charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="profileUsername">
                            @{user?.username || "teacher"}
                          </div>
                          <div className="profileDisplayName">
                            {user?.full_name || "Teacher"}
                          </div>
                          <div className="profileMetaLine">
                            Teacher · {user?.section || "Section not set"}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="toolbarButton importGreenButton"
                        onClick={() => {
                          setProfileForm({
                            fullName:
                              user?.full_name ||
                              "",
                            section:
                              user?.section ||
                              "",
                            schoolId:
                              user?.school_id ||
                              "",
                            schoolName:
                              user?.school_name ||
                              "",
                          });
                          setProfileEditOpen(
                            true
                          );
                        }}
                      >
                        Edit Profile
                      </button>
                    </div>

                  </div>

                  <div className={
                    "panel profileMainPanel securityPrivacyPanel " +
                    (securityOpen ? "securityPrivacyPanelOpen" : "securityPrivacyPanelClosed")
                  }>
                    <button
                      type="button"
                      className="securityDropdownHeader"
                      aria-expanded={securityOpen}
                      onClick={toggleSecurityDropdown}
                    >
                      <span className="securityDropdownIcon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4.75" y="10.5" width="14.5" height="9.25" rx="2.5" /><path d="M8.25 10.5V7.75a3.75 3.75 0 0 1 7.5 0v2.75" /></svg></span>
                      <span className="securityDropdownTitleWrap">
                        <span className="securityDropdownTitle">Security &amp; Privacy</span>
                        <span className="securityDropdownSubtitle">
                          Manage two-factor authentication and account security.
                        </span>
                      </span>
                      <span className="securityStatusPill securityDropdownStatus">
                        {securityStatus.two_factor_enabled ? "2FA Enabled" : "2FA Not Enabled"}
                      </span>
                      <span className={"securityDropdownChevron " + (securityOpen ? "open" : "")}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></span>
                    </button>

                    <div
                      ref={securityDropdownContentRef}
                      className="securityDropdownContent"
                      aria-hidden={!securityOpen}
                    >
                      <div className="securityDropdownInner">
                        <div className="securityGrid">
                          <div className="securityCard">
                            <div className="securityCardIcon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4.75" y="10.5" width="14.5" height="9.25" rx="2.5" /><path d="M8.25 10.5V7.75a3.75 3.75 0 0 1 7.5 0v2.75" /></svg></div>
                            <div className="securityCardBody">
                              <div className="securityCardTitle">Two-Factor Authentication</div>
                              <div className="securityCardText">
                                {securityStatus.two_factor_enabled
                                  ? "Your account requires an authenticator code after password sign-in."
                                  : "Add another layer of protection using a TOTP authenticator app."}
                              </div>
                              <div className="securityCardHint">
                                Compatible with Google Authenticator, Duo Mobile, Microsoft Authenticator, and other standard TOTP apps.
                              </div>
                              <div className="securityActionRow">
                                {!securityStatus.two_factor_enabled ? (
                                  <button
                                    type="button"
                                    className="toolbarButton primaryBlueButton securityAction"
                                    disabled={securityLoading}
                                    onClick={beginTwoFactorSetup}
                                  >
                                    {securityLoading ? "Preparing..." : "Set Up 2FA"}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="dangerButton securityAction"
                                    disabled={securityLoading}
                                    onClick={() => {
                                      if (twoFactorCode.trim().length !== 6) {
                                        showToast(
                                          "Enter your current 6-digit authenticator code to disable 2FA.",
                                          "error"
                                        );
                                        return;
                                      }

                                      disableTwoFactor();
                                    }}
                                  >
                                    Disable 2FA
                                  </button>
                                )}

                                {securityStatus.two_factor_enabled && (
                                  <input
                                    className="formInput securityCodeInput"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={twoFactorCode}
                                    onChange={(event) =>
                                      setTwoFactorCode(
                                        event.target.value.replace(/\D/g, "").slice(0, 6)
                                      )
                                    }
                                    placeholder="6-digit code"
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
        )}

        {analyticsMobileView && analyticsChartOverlayPeriod && typeof document !== "undefined"
          ? createPortal(
              <AnalyticsPeriodChartDialog
                period={analyticsPeriodComparison.find(
                  (period) => period.period === analyticsChartOverlayPeriod
                )}
                periods={analyticsPeriodComparison}
                mode={analyticsChartMode}
                onClose={() => setAnalyticsChartOverlayPeriod(null)}
              />,
              document.body
            )
          : null}

        {analyticsMobileView && analyticsMobileResultOpen && typeof document !== "undefined"
          ? createPortal(
              <div
                className="analyticsMobileResultOverlay"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setAnalyticsMobileResultOpen(false);
                }}
              >
                <section
                  className="analyticsMobileResultDialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="analytics-mobile-result-title"
                >
                  <header className="analyticsMobileResultTopbar">
                    <div>
                      <span>Assessment result</span>
                      <strong id="analytics-mobile-result-title">
                        {analyticsSelectedLearner ? formatName(analyticsSelectedLearner) : "Learner result"}
                      </strong>
                    </div>
                    <button
                      type="button"
                      autoFocus
                      onClick={() => setAnalyticsMobileResultOpen(false)}
                      aria-label="Close learner result"
                    >
                      ×
                    </button>
                  </header>
                  <AnalyticsLearnerResultPanel
                    className="analyticsMobileResult"
                    selectedLearner={analyticsSelectedLearner}
                    selectedPeriods={analyticsSelectedPeriods}
                    period={analyticsPeriod}
                    onPeriodChange={setAnalyticsPeriod}
                    loading={analyticsDetailLoading}
                    error={analyticsDetailError}
                    selectedAssessment={analyticsSelectedAssessment}
                    detail={analyticsDetail}
                  />
                </section>
              </div>,
              document.body
            )
          : null}

        {twoFactorSetupOpen && twoFactorSetup && !twoFactorSetup.disable && (
          <div
            className="modalOverlay twoFactorOverlayBackdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !securityLoading) {
                setTwoFactorSetupOpen(false);
                setTwoFactorSetup(null);
                setTwoFactorCode("");
              }
            }}
          >
            <div className="modal twoFactorSetupModal" role="dialog" aria-modal="true" aria-labelledby="two-factor-setup-title">
              <div className="modalHeader twoFactorModalHeader">
                <div>
                  <div className="twoFactorEyebrow">ACCOUNT SECURITY</div>
                  <h2 id="two-factor-setup-title">Set Up Two-Factor Authentication</h2>
                </div>
                <button
                  type="button"
                  className="closeButton"
                  disabled={securityLoading}
                  onClick={() => {
                    setTwoFactorSetupOpen(false);
                    setTwoFactorSetup(null);
                    setTwoFactorCode("");
                  }}
                  aria-label="Close two-factor setup"
                >
                  ×
                </button>
              </div>

              <div className="modalBody twoFactorModalBody">
                <div className="twoFactorSetupLayout">
                  <div className="twoFactorQrPanel">
                    <div className="twoFactorQrBadge">SCAN TO ADD CRL-APP</div>
                    <div className="twoFactorQrFrame">
                      <img
                        src={
                          "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=" +
                          encodeURIComponent(twoFactorSetup.otpauth_url || "")
                        }
                        alt="CRL-App two-factor authentication QR code"
                        className="twoFactorQrImage"
                        width="280"
                        height="280"
                      />
                    </div>
                    <div className="twoFactorQrCaption">
                      Open your authenticator app and scan this code to add CRL-App.
                    </div>
                  </div>

                  <div className="twoFactorInstructions">
                    <div className="twoFactorStep">
                      <span>1</span>
                      <div>
                        <strong>Scan the QR code</strong>
                        <p>Add CRL-App to Google Authenticator, Microsoft Authenticator, Duo Mobile, or another TOTP app.</p>
                      </div>
                    </div>

                    <div className="twoFactorStep">
                      <span>2</span>
                      <div>
                        <strong>Enter the 6-digit code</strong>
                        <p>Use the current code displayed in your authenticator app.</p>
                      </div>
                    </div>

                    <label className="twoFactorCodeLabel" htmlFor="two-factor-setup-code">
                      Authenticator Code
                    </label>
                    <input
                      id="two-factor-setup-code"
                      className="formInput twoFactorLargeCodeInput"
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="one-time-code"
                      value={twoFactorCode}
                      onChange={(event) =>
                        setTwoFactorCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6)
                        )
                      }
                      placeholder="000000"
                      autoFocus
                    />

                    <div className="twoFactorManualSection">
                      <div className="twoFactorManualTitle">Can’t scan the QR code?</div>
                      <div className="twoFactorManualText">
                        Enter this setup key manually in your authenticator app:
                      </div>
                      <div className="twoFactorSecret twoFactorSecretLarge">{twoFactorSetup.secret}</div>
                      <button
                        type="button"
                        className="secondaryButton securityAction twoFactorCopyButton"
                        onClick={() => navigator.clipboard?.writeText(twoFactorSetup.secret)}
                      >
                        Copy Setup Key
                      </button>
                    </div>
                  </div>
                </div>

                <div className="twoFactorSecurityNote">
                  <span>🔒</span>
                  <div>
                    <strong>Keep your setup key private.</strong>
                    <span>Only use your authenticator app to generate your verification code.</span>
                  </div>
                </div>
              </div>

              <div className="modalFooter twoFactorModalFooter">
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={securityLoading}
                  onClick={() => {
                    setTwoFactorSetupOpen(false);
                    setTwoFactorSetup(null);
                    setTwoFactorCode("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="toolbarButton primaryBlueButton"
                  disabled={securityLoading || twoFactorCode.replace(/\D/g, "").length !== 6}
                  onClick={verifyTwoFactorSetup}
                >
                  {securityLoading ? "Verifying..." : "Verify & Enable 2FA"}
                </button>
              </div>
            </div>
          </div>
        )}

        {addLearnerOpen && (
          <div
            className="modalOverlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !savingLearner) {
                setAddLearnerOpen(false);
              }
            }}
          >
            <div className="modal multiLearnerModal">
              <div className="modalHeader">
                <div>
                  <h2>Add New Learners</h2>
                </div>
                <button
                  type="button"
                  className="closeButton"
                  onClick={() => !savingLearner && setAddLearnerOpen(false)}
                  disabled={savingLearner}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="modalBody multiLearnerBody">
                <div className="bulkFormHeader">
                  <span>Section: <strong>{user?.section || "Not set"}</strong></span>
                  <span>{learnerRows.length} row{learnerRows.length === 1 ? "" : "s"}</span>
                </div>

                <div className="learnerRowsScroller">
                  {learnerRows.map((row, index) => (
                    <div className="learnerEntryRow" key={row.id}>
                      <div className="learnerEntryNumber">{index + 1}</div>
                      <div className="formGroup">
                        <label className="formLabel">LRN <span>*</span></label>
                        <input
                          className="formInput"
                          value={row.lrn}
                          onChange={(event) => updateLearnerRow(row.id, "lrn", event.target.value.replace(/\D/g, ""))}
                          inputMode="numeric"
                          maxLength={12}
                          placeholder="12 digits"
                          aria-invalid={duplicateLearnerRowIds.has(row.id)}
                          aria-describedby={
                            duplicateLearnerRowIds.has(row.id)
                              ? `learner-lrn-warning-${row.id}`
                              : undefined
                          }
                          style={
                            duplicateLearnerRowIds.has(row.id)
                              ? { borderColor: "#a33a3a", background: "#fff8f4" }
                              : undefined
                          }
                        />
                        {duplicateLearnerRowIds.has(row.id) && (
                          <p
                            id={`learner-lrn-warning-${row.id}`}
                            role="alert"
                            className="learnerLrnWarning"
                          >
                            {existingLearnerLrns.has(String(row.lrn).replace(/\D/g, ""))
                              ? "This LRN is already registered."
                              : "This LRN is already entered in another row."}
                          </p>
                        )}
                      </div>
                      <div className="formGroup">
                        <label className="formLabel">Last Name <span>*</span></label>
                        <input className="formInput" value={row.lastName} onChange={(event) => updateLearnerRow(row.id, "lastName", event.target.value)} placeholder="Last name" />
                      </div>
                      <div className="formGroup">
                        <label className="formLabel">First Name <span>*</span></label>
                        <input className="formInput" value={row.firstName} onChange={(event) => updateLearnerRow(row.id, "firstName", event.target.value)} placeholder="First name" />
                      </div>
                      <div className="formGroup">
                        <label className="formLabel">Middle Name</label>
                        <input className="formInput" value={row.middleName} onChange={(event) => updateLearnerRow(row.id, "middleName", event.target.value)} placeholder="N/A" />
                      </div>
                      <div className="formGroup">
                        <label className="formLabel">Suffix</label>
                        <input
                          className="formInput"
                          value={row.suffix ?? ""}
                          onChange={(event) => updateLearnerRow(row.id, "suffix", event.target.value)}
                          maxLength={20}
                          placeholder="e.g. Jr., III"
                          aria-label="Suffix (optional)"
                        />
                      </div>
                      <div className="formGroup">
                        <label className="formLabel">Sex <span>*</span></label>
                        <select className="formSelect" value={row.sex} onChange={(event) => updateLearnerRow(row.id, "sex", event.target.value)}>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        className="iconDangerButton"
                        onClick={() => removeLearnerRow(row.id)}
                        disabled={learnerRows.length <= 1 || savingLearner}
                        aria-label={`Remove learner row ${index + 1}`}
                        title="Remove row"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="addRowButton"
                  onClick={addLearnerRow}
                  disabled={savingLearner}
                >
                  + Add another learner
                </button>
              </div>

              <div className="modalFooter">
                <button type="button" className="secondaryButton" onClick={() => setAddLearnerOpen(false)} disabled={savingLearner}>
                  Cancel
                </button>
                <button type="button" className="toolbarButton primaryBlueButton" onClick={addLearners} disabled={savingLearner || duplicateLearnerRowIds.size > 0}>
                  {savingLearner ? "Saving learners..." : `Save ${learnerRows.length} Learner${learnerRows.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {bulkDeleteConfirm && (
          <div
            className="modalOverlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setBulkDeleteConfirm(false);
              }
            }}
          >
            <div className="modal bulkDeleteConfirmModal">
              <div className="modalHeader">
                <div>
                  <h2>Delete Selected Learners</h2>
                  <div className="modalHeaderHint">
                    This action cannot be undone.
                  </div>
                </div>
                <button
                  type="button"
                  className="closeButton"
                  onClick={() => setBulkDeleteConfirm(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="modalBody bulkDeleteConfirmBody">
                <div className="bulkDeleteIcon" aria-hidden="true">!</div>
                <div>
                  <h3>
                    Delete {selectedLearnerIds.length} selected learner{selectedLearnerIds.length === 1 ? "" : "s"}?
                  </h3>
                  <p>
                    The selected learner records and their associated assessment data will be removed from the system. This cannot be undone.
                  </p>
                </div>
              </div>

              <div className="modalFooter">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => setBulkDeleteConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="dangerButton bulkDeleteConfirmButton"
                  onClick={() => {
                    setBulkDeleteConfirm(false);
                    bulkDeleteLearners(true);
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div
            className="modalOverlay"
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setDeleteTarget(
                  null
                );
              }
            }}
          >
            <div className="modal">
              <div className="modalHeader">
                <h2>
                  Delete Learner
                </h2>

                <button
                  type="button"
                  className="closeButton"
                  onClick={() =>
                    setDeleteTarget(
                      null
                    )
                  }
                >
                  ×
                </button>
              </div>

              <div className="modalBody">
                <p
                  style={{
                    margin:
                      0,
                    color:
                      "var(--crl-muted)",
                    fontSize:
                      14,
                    lineHeight:
                      1.65,
                  }}
                >
                  Are you sure you want
                  to delete{" "}
                  <strong>
                    {formatName(
                      deleteTarget
                    )}
                  </strong>
                  ? All assessment sessions
                  associated with this learner
                  will also be removed by the
                  database relationship.
                </p>
              </div>

              <div className="modalFooter">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() =>
                    setDeleteTarget(
                      null
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="dangerButton"
                  onClick={
                    deleteLearner
                  }
                >
                  Delete Learner
                </button>
              </div>
            </div>
          </div>
        )}

        {detailsTarget && (
          <div
            className="modalOverlay"
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setDetailsTarget(
                  null
                );
              }
            }}
          >
            <div className="modal">
              <div className="modalHeader">
                <h2>
                  Learner Details
                </h2>

                <button
                  type="button"
                  className="closeButton"
                  onClick={() =>
                    setDetailsTarget(
                      null
                    )
                  }
                >
                  ×
                </button>
              </div>

              <div className="modalBody">
                <div className="profileGrid">
                  <div className="profileItem">
                    <div className="profileLabel">
                      LRN
                    </div>
                    <div className="profileValue">
                      {
                        detailsTarget.lrn
                      }
                    </div>
                  </div>

                  <div className="profileItem">
                    <div className="profileLabel">
                      Full Name
                    </div>
                    <div className="profileValue">
                      {formatName(
                        detailsTarget
                      )}
                    </div>
                  </div>

                  <div className="profileItem">
                    <div className="profileLabel">
                      Sex
                    </div>
                    <div className="profileValue">
                      {
                        detailsTarget.sex
                      }
                    </div>
                  </div>

                  <div className="profileItem">
                    <div className="profileLabel">
                      Grade
                    </div>
                    <div className="profileValue">
                      Grade{" "}
                      {
                        detailsTarget.grade_level
                      }
                    </div>
                  </div>

                  <div className="profileItem">
                    <div className="profileLabel">
                      Section
                    </div>
                    <div className="profileValue">
                      {
                        detailsTarget.section ||
                        user?.section ||
                        "Not set"
                      }
                    </div>
                  </div>

                  <div className="profileItem">
                    <div className="profileLabel">
                      Middle Initial
                    </div>
                    <div className="profileValue">
                      {detailsTarget.middle_initial ||
                        "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {logoutOpen && (
          <div
            className="modalOverlay"
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget &&
                !loggingOut
              ) {
                setLogoutOpen(
                  false
                );
              }
            }}
          >
            <div className="modal">
              <div className="modalHeader">
                <h2>
                  {isOffline
                    ? "Exit CRL-App?"
                    : "Log out of CRL-App?"}
                </h2>

                <button
                  type="button"
                  className="closeButton"
                  disabled={
                    loggingOut
                  }
                  onClick={() =>
                    setLogoutOpen(
                      false
                    )
                  }
                >
                  ×
                </button>
              </div>

              <div className="modalBody">
                <p
                  style={{
                    margin:
                      0,
                    color:
                      "var(--crl-muted)",
                    fontSize:
                      14,
                    lineHeight:
                      1.65,
                  }}
                >
                  {isOffline
                    ? "You are offline. Exiting closes the app but keeps your saved session on this device, so you can carry on without signing in again."
                    : "Are you sure you want to log out? Your current teacher session will be ended and you will be returned to the login page."}
                </p>
              </div>

              <div className="modalFooter">
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={
                    loggingOut
                  }
                  onClick={() =>
                    setLogoutOpen(
                      false
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="dangerButton"
                  disabled={
                    loggingOut
                  }
                  onClick={isOffline ? exitApp : logout}
                >
                  {isOffline
                    ? "Exit"
                    : loggingOut
                      ? "Logging Out..."
                      : "Yes, Log Out"}
                </button>
              </div>
            </div>
          </div>
        )}

        {profileEditOpen && (
          <div
            className="modalOverlay"
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setProfileEditOpen(
                  false
                );
              }
            }}
          >
            <div className="modal">
              <div className="modalHeader">
                <h2>
                  Edit Profile
                </h2>

                <button
                  type="button"
                  className="closeButton"
                  onClick={() =>
                    setProfileEditOpen(
                      false
                    )
                  }
                >
                  ×
                </button>
              </div>

              <div className="modalBody">
                <div className="formGrid">
                  <div className="formGroup full">
                    <label className="formLabel">
                      Full Name
                    </label>

                    <input
                      className="formInput"
                      value={
                        profileForm.fullName
                      }
                      onChange={(
                        event
                      ) =>
                        setProfileForm(
                          (
                            current
                          ) => ({
                            ...current,
                            fullName:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                    />
                  </div>

                  <div className="formGroup full">
                    <label className="formLabel">
                      Section
                    </label>

                    <input
                      className="formInput"
                      value={
                        profileForm.section
                      }
                      onChange={(
                        event
                      ) =>
                        setProfileForm(
                          (
                            current
                          ) => ({
                            ...current,
                            section:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                    />
                  </div>

                  <div className="formGroup full">
                    <label className="formLabel">
                      School ID
                    </label>

                    <input
                      className="formInput"
                      value={
                        profileForm.schoolId
                      }
                      onChange={(
                        event
                      ) =>
                        setProfileForm(
                          (
                            current
                          ) => ({
                            ...current,
                            schoolId:
                              event
                                .target
                                .value
                                .replace(/\D/g, "")
                                .slice(0, 6),
                          })
                        )
                      }
                      inputMode="numeric"
                      maxLength={6}
                      pattern="[0-9]{6}"
                    />
                  </div>

                  <div className="formGroup full">
                    <label className="formLabel">
                      School Name
                    </label>

                    <input
                      className="formInput"
                      value={
                        profileForm.schoolName
                      }
                      onChange={(
                        event
                      ) =>
                        setProfileForm(
                          (
                            current
                          ) => ({
                            ...current,
                            schoolName:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                      maxLength={150}
                      autoComplete="organization"
                    />
                  </div>
                </div>
              </div>

              <div className="modalFooter">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() =>
                    setProfileEditOpen(
                      false
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="toolbarButton"
                  onClick={
                    saveProfile
                  }
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {activityEditor && (
          <div
            className="modalOverlay"
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setActivityEditor(
                  null
                );
              }
            }}
          >
            <div
              className={`modal activityEditorModal ${
                activityEditor.category === "stories"
                  ? "storyEditorModal"
                  : "itemEditorModal"
              }`}
            >
              <div className="modalHeader">
                <h2>
                  {activityEditor.category === "stories"
                    ? activityEditor.index >= 0
                      ? "Edit Story"
                      : "Add Story"
                    : activityEditor.index >= 0
                      ? "Edit Item"
                      : "Add Item"}
                </h2>

                <button
                  type="button"
                  className="closeButton"
                  onClick={() =>
                    setActivityEditor(
                      null
                    )
                  }
                >
                  ×
                </button>
              </div>

              <div className="modalBody">
                {activityEditor.category ===
                "stories" ? (
                  activityEditor.editorMode === "preview" ? (
                    <div className="formGrid">
                      <div className="formGroup full">
                        <span className="formLabel">Story Title</span>
                        <h3 className="storyPreviewTitle">
                          {activityEditor.title}
                        </h3>
                      </div>
                      <div className="formGroup full storyWordField">
                        <div className="storyWordLabelRow">
                          <span className="formLabel">Story Content</span>
                          <span className="storyWordCount complete">
                            {splitStoryWords(activityEditor.storyText).length}/100 words
                          </span>
                        </div>
                        <p className="storyPlainPreview">
                          {activityEditor.storyText}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="formGrid">
                      <div className="formGroup full">
                        <label className="formLabel" htmlFor="story-editor-title">
                          Story Title
                        </label>
                        <input
                          id="story-editor-title"
                          className="formInput"
                          maxLength={200}
                          value={activityEditor.title}
                          onChange={(event) =>
                            setActivityEditor((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="formGroup full storyWordField">
                        <div className="storyWordLabelRow">
                          <label
                            className="formLabel"
                            htmlFor={
                              activityEditor.editorMode === "document"
                                ? "story-document-text"
                                : undefined
                            }
                          >
                            Story Content
                          </label>
                          <span
                            className={`storyWordCount ${
                              (activityEditor.editorMode === "boxes"
                                ? activityEditor.storyWords.filter(Boolean).length
                                : splitStoryWords(activityEditor.storyText).length) === 100
                                ? "complete"
                                : ""
                            }`}
                          >
                            {activityEditor.editorMode === "boxes"
                              ? activityEditor.storyWords.filter(Boolean).length
                              : splitStoryWords(activityEditor.storyText).length}
                            /100 words
                          </span>
                        </div>

                        {activityEditor.editorMode === "document" ? (
                          <textarea
                            id="story-document-text"
                            className="formTextarea storyDocumentTextarea"
                            value={activityEditor.storyText}
                            spellCheck="true"
                            placeholder="Type or paste the 100-word story here."
                            onChange={(event) =>
                              setActivityEditor((current) => ({
                                ...current,
                                storyText: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          <div
                            className="storyWordGrid"
                            role="group"
                            aria-label="Story content, exactly 100 words"
                          >
                            {activityEditor.storyWords.map((word, wordIndex) => (
                              <label
                                className="storyWordSlot"
                                key={`story-word-${wordIndex}`}
                              >
                                <span>{wordIndex + 1}</span>
                                <input
                                  ref={(element) => {
                                    storyWordRefs.current[wordIndex] = element;
                                  }}
                                  value={word}
                                  aria-label={`Story word ${wordIndex + 1}`}
                                  autoComplete="off"
                                  spellCheck="true"
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    if (/\s/.test(nextValue)) {
                                      const incoming = nextValue
                                        .trim()
                                        .split(/\s+/)
                                        .filter(Boolean);
                                      if (incoming.length) {
                                        updateStoryWords(wordIndex, incoming);
                                      }
                                      return;
                                    }
                                    setActivityEditor((current) => {
                                      if (!current || current.category !== "stories") {
                                        return current;
                                      }
                                      const storyWords = [...current.storyWords];
                                      storyWords[wordIndex] = nextValue;
                                      return { ...current, storyWords };
                                    });
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === " " || event.key === "Enter") {
                                      event.preventDefault();
                                      storyWordRefs.current[wordIndex + 1]?.focus();
                                    } else if (
                                      event.key === "Backspace" &&
                                      !word &&
                                      wordIndex > 0
                                    ) {
                                      storyWordRefs.current[wordIndex - 1]?.focus();
                                    }
                                  }}
                                  onPaste={(event) => {
                                    const pasted = event.clipboardData
                                      .getData("text")
                                      .trim()
                                      .split(/\s+/)
                                      .filter(Boolean);
                                    if (pasted.length > 1) {
                                      event.preventDefault();
                                      updateStoryWords(wordIndex, pasted);
                                    }
                                  }}
                                />
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="multiItemEditor">
                    {(activityEditor.index < 0
                      ? activityEditor.values || [""]
                      : [activityEditor.value]
                    ).map((value, itemIndex) => (
                      <div className="multiItemRow" key={`item-entry-${itemIndex}`}>
                        <div className="formGroup">
                          <label className="formLabel">
                            {activityEditor.index < 0
                              ? `Item ${itemIndex + 1}`
                              : "Content"}
                          </label>
                          <input
                            className="formInput"
                            autoFocus={itemIndex === 0}
                            maxLength={
                              activityEditor.category === "letters" ? 1 : 9
                            }
                            value={value}
                            onChange={(event) => {
                              const nextValue = event.target.value
                                .replace(/[^A-Za-z]/g, "")
                                .slice(
                                  0,
                                  activityEditor.category === "letters" ? 1 : 9
                                );
                              setActivityEditor((current) => {
                                if (!current) return current;
                                if (current.index >= 0) {
                                  return { ...current, value: nextValue };
                                }
                                const values = [...(current.values || [""])];
                                values[itemIndex] = nextValue;
                                return { ...current, values };
                              });
                            }}
                            placeholder={
                              activityEditor.category === "letters"
                                ? "Enter letter"
                                : "Enter word"
                            }
                          />
                        </div>

                        {activityEditor.index < 0 &&
                          (activityEditor.values || []).length > 1 && (
                            <button
                              type="button"
                              className="multiItemRemove"
                              aria-label={`Remove item ${itemIndex + 1}`}
                              onClick={() =>
                                setActivityEditor((current) => ({
                                  ...current,
                                  values: current.values.filter(
                                    (_, valueIndex) => valueIndex !== itemIndex
                                  ),
                                }))
                              }
                            >
                              Remove
                            </button>
                          )}
                      </div>
                    ))}

                    {activityEditor.index < 0 && (
                      <button
                        type="button"
                        className="addRowButton multiItemAdd"
                        disabled={
                          activities[activityPeriod][activityEditor.category]
                            .length + (activityEditor.values || []).length >=
                          ASSESSMENT_CONTENT_LIMITS[activityEditor.category]
                        }
                        onClick={() =>
                          setActivityEditor((current) => ({
                            ...current,
                            values: [...(current.values || [""]), ""],
                          }))
                        }
                      >
                        + Add another item
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="modalFooter">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() =>
                    setActivityEditor(
                      null
                    )
                  }
                >
                  Cancel
                </button>

                {activityEditor.category === "stories" &&
                activityEditor.editorMode === "preview" ? (
                  <button
                    type="button"
                    className="toolbarButton"
                    onClick={() =>
                      setActivityEditor((current) => ({
                        ...current,
                        editorMode: "boxes",
                      }))
                    }
                  >
                    Edit
                  </button>
                ) : (
                  <button
                    type="button"
                    className="toolbarButton"
                    onClick={saveActivity}
                  >
                    {activityEditor.category === "stories" &&
                    activityEditor.index < 0
                      ? "Save Story"
                      : activityEditor.category !== "stories" &&
                          activityEditor.index < 0
                        ? "Add Items"
                      : "Save Changes"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {storyImport && (
          <div className="modalOverlay" role="presentation">
            <div
              className="modal activityEditorModal storyEditorModal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="story-import-title"
            >
              <div className="modalHeader">
                <h2 id="story-import-title">Import Story Passage</h2>

                <button
                  type="button"
                  className="closeButton"
                  onClick={() => {
                    if (storyImport.status === "reading") return;
                    setStoryImportDragActive(false);
                    setStoryImport(null);
                  }}
                  disabled={storyImport.status === "reading"}
                  aria-label="Close the import"
                >
                  ×
                </button>
              </div>

              <div className="modalBody">
                {storyImport.status === "idle" && (
                  <div
                    className={`classRecordDropZone storyImportDropZone ${
                      storyImportDragActive ? "dragActive" : ""
                    }`}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setStoryImportDragActive(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setStoryImportDragActive(true);
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (event.currentTarget === event.target) {
                        setStoryImportDragActive(false);
                      }
                    }}
                    onDrop={handleStoryImportDrop}
                    onClick={() => storyImportInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        storyImportInputRef.current?.click();
                      }
                    }}
                  >
                    <div className="classRecordDropIcon" aria-hidden="true">
                      ↑
                    </div>
                    <strong>Drop story file here</strong>
                    <span>or choose a file from this device</span>
                    <button
                      type="button"
                      className="toolbarButton storyImportButton"
                      onClick={(event) => {
                        event.stopPropagation();
                        storyImportInputRef.current?.click();
                      }}
                    >
                      Browse
                    </button>
                    <small>.txt · .docx · .pdf</small>
                  </div>
                )}

                {storyImport.status === "reading" && (
                  <div
                    className="busyCard importBusyCard"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="busySpinner" />
                    <div>
                      <strong>Importing Story Passage</strong>
                      <div className="busySubtext">
                        Reading {storyImport.fileName}…
                      </div>
                    </div>
                  </div>
                )}

                {storyImport.status === "error" && (
                  <div className="storyImportError" role="alert">
                    <strong>
                      {storyImport.fileName || "That file"} could not be read.
                    </strong>
                    <p>{storyImport.message}</p>
                    <p>
                      {activityPeriod} stories can still be added by hand with
                      “+ Add Story”.
                    </p>
                  </div>
                )}

                {storyImport.status === "ready" && (
                  <div className="formGrid">
                    <div className="storyImportSource">
                      <span className="storyImportFormat">
                        {storyImport.formatLabel}
                      </span>
                      <span className="storyImportFileName">
                        {storyImport.fileName}
                      </span>
                    </div>

                    <p className="storyImportNote">
                      Check every word below against the original. Nothing is
                      saved until you press Save Story.
                    </p>

                    {storyImport.warnings.length > 0 && (
                      <ul className="storyImportWarnings">
                        {storyImport.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    )}

                    <div className="formGroup full">
                      <label
                        className="formLabel"
                        htmlFor="story-import-title-input"
                      >
                        Story Title
                      </label>

                      <input
                        id="story-import-title-input"
                        className="formInput"
                        maxLength={200}
                        value={storyImport.title}
                        onChange={(event) =>
                          setStoryImport((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                      />

                      {storyImport.usedFirstLineAsTitle && (
                        <p className="storyImportNote">
                          The first line of the document was used as the title.
                          Change it if that is wrong.
                        </p>
                      )}
                    </div>

                    <div className="formGroup full storyWordField">
                      <div className="storyWordLabelRow">
                        <label
                          className="formLabel"
                          htmlFor="story-import-text"
                        >
                          Story Content
                        </label>

                        <span
                          className={`storyWordCount ${
                            storyImportWordCount ===
                            ASSESSMENT_CONTENT_REQUIREMENTS.storyWords
                              ? "complete"
                              : ""
                          }`}
                        >
                          {storyImportWordCount}/
                          {ASSESSMENT_CONTENT_REQUIREMENTS.storyWords} words
                        </span>
                      </div>

                      <textarea
                        id="story-import-text"
                        className="formTextarea storyImportText"
                        value={storyImport.text}
                        spellCheck="true"
                        onChange={(event) =>
                          setStoryImport((current) => ({
                            ...current,
                            text: event.target.value,
                          }))
                        }
                      />

                      <div className="storyImportTextActions">
                        {storyImportWordCount >
                          ASSESSMENT_CONTENT_REQUIREMENTS.storyWords && (
                          <button
                            type="button"
                            className="secondaryButton"
                            onClick={() =>
                              setStoryImport((current) => ({
                                ...current,
                                text: splitStoryWords(current.text)
                                  .slice(
                                    0,
                                    ASSESSMENT_CONTENT_REQUIREMENTS.storyWords
                                  )
                                  .join(" "),
                              }))
                            }
                          >
                            Keep the first{" "}
                            {ASSESSMENT_CONTENT_REQUIREMENTS.storyWords} words
                          </button>
                        )}

                        <span className="storyImportNote">
                          {storyImportWordCount ===
                          ASSESSMENT_CONTENT_REQUIREMENTS.storyWords
                            ? "This passage is the right length and can be saved."
                            : storyImportWordCount >
                                ASSESSMENT_CONTENT_REQUIREMENTS.storyWords
                              ? `${
                                  storyImportWordCount -
                                  ASSESSMENT_CONTENT_REQUIREMENTS.storyWords
                                } word${
                                  storyImportWordCount -
                                    ASSESSMENT_CONTENT_REQUIREMENTS
                                      .storyWords ===
                                  1
                                    ? ""
                                    : "s"
                                } too many - a passage must be exactly ${ASSESSMENT_CONTENT_REQUIREMENTS.storyWords} words.`
                              : `${
                                  ASSESSMENT_CONTENT_REQUIREMENTS.storyWords -
                                  storyImportWordCount
                                } more word${
                                  ASSESSMENT_CONTENT_REQUIREMENTS.storyWords -
                                    storyImportWordCount ===
                                  1
                                    ? ""
                                    : "s"
                                } needed - a passage must be exactly ${ASSESSMENT_CONTENT_REQUIREMENTS.storyWords} words.`}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {storyImport.status !== "reading" && (
              <div className="modalFooter">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => {
                    setStoryImportDragActive(false);
                    setStoryImport(null);
                  }}
                >
                  {storyImport.status === "ready"
                    ? "Discard"
                    : storyImport.status === "idle"
                      ? "Cancel"
                      : "Close"}
                </button>

                {storyImport.status === "ready" && (
                  <button
                    type="button"
                    className="toolbarButton"
                    disabled={!storyImportReady}
                    onClick={saveImportedStory}
                  >
                    Save Story
                  </button>
                )}
              </div>
              )}
            </div>
          </div>
        )}

        {activityDeleteTarget && (
          <div className="modalOverlay" role="presentation">
            <div
              className="modal activityConfirmModal"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="activity-delete-title"
              aria-describedby="activity-delete-description"
            >
              <div className="modalHeader">
                <h2 id="activity-delete-title">
                  Are you sure you want to delete this item?
                </h2>
              </div>
              <div className="modalBody">
                <p id="activity-delete-description">
                  <strong>{activityDeleteTarget.itemName}</strong>
                  <br />
                  The item is removed from this draft only. Press Save to apply
                  the change.
                </p>
              </div>
              <div className="modalFooter activityConfirmActions">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => setActivityDeleteTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="toolbarButton redSmall"
                  onClick={confirmActivityDeletion}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {activitySavePromptOpen && (
          <div className="modalOverlay" role="presentation">
            <div
              className="modal activityConfirmModal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="activity-save-title"
            >
              <div className="modalHeader">
                <h2 id="activity-save-title">Save changes?</h2>
              </div>
              <div className="modalBody">
                <p>
                  Your Manage Assessment changes have not been saved yet.
                </p>
              </div>
              <div className="modalFooter activityConfirmActions">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => {
                    pendingActivityNavigationRef.current = null;
                    setActivitySavePromptOpen(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={discardAllActivityChanges}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="toolbarButton"
                  disabled={savingActivities}
                  onClick={() => void saveAllActivityChanges()}
                >
                  {savingActivities ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {scoresheetSavePromptOpen && (
          <div className="modalOverlay" role="presentation">
            <div
              className="modal activityConfirmModal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="scoresheet-save-title"
            >
              <div className="modalHeader">
                <h2 id="scoresheet-save-title">Save changes?</h2>
              </div>
              <div className="modalBody">
                <p>Your scoresheet edits have not been saved yet.</p>
              </div>
              <div className="modalFooter activityConfirmActions">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => {
                    pendingScoresheetNavigationRef.current = null;
                    setScoresheetSavePromptOpen(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={discardScoresheetChanges}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="toolbarButton scoresheetSaveButton"
                  disabled={savingScoresheet}
                  onClick={() => void saveScoresheetChanges()}
                >
                  {savingScoresheet ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activityValidation && (
          <div className="modalOverlay" role="presentation">
            <div
              className="modal activityValidationModal"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="activity-validation-title"
            >
              <div className="modalHeader">
                <h2 id="activity-validation-title">
                  Complete {activityValidation.period} content
                </h2>
              </div>
              <div className="modalBody">
                <ul className="activityIssueList">
                  {activityValidation.issues.map((issue, index) => (
                    <li key={`${issue.category}-${issue.index ?? "count"}-${index}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="modalFooter">
                <button
                  type="button"
                  className="toolbarButton"
                  onClick={() => setActivityValidation(null)}
                >
                  Okay
                </button>
              </div>
            </div>
          </div>
        )}

        {deletingProgress && (
          <div className="deletingToast" role="status" aria-live="polite">
            <div className="deletingToastIcon"><span /></div>
            <div className="deletingToastCopy">
              <strong>Deleting learners...</strong>
              <span>{deletingProgress.completed} of {deletingProgress.total} processed</span>
              <div className="deletingProgressTrack">
                <div
                  className="deletingProgressFill"
                  style={{ width: `${deletingProgress.total ? Math.round((deletingProgress.completed / deletingProgress.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div
            className={`toast ${toast.type}`}
          >
            {
              toast.message
            }
          </div>
        )}

        {startingAssessment && typeof document !== "undefined"
          ? createPortal(
              <div className="busyOverlay" role="status" aria-live="polite">
                <div className="busyCard">
                  <span className="busySpinner" />
                  <div>
                    <strong>Starting Assessment</strong>
                    <div className="busySubtext">Please wait.</div>
                  </div>
                </div>
              </div>,
              document.body
            )
          : null}

        {savingLearner && (
          <div className="busyOverlay">
            <div className="busyCard">
              <span className="busySpinner" />
              <div>
                <strong>
                  Saving learner
                </strong>
                <div className="busySubtext">
                  Saving the learner record...
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
