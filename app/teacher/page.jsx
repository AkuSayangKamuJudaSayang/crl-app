// Keep this file aligned with the working teacher dashboard baseline.
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import ClassRecordImport from "./ClassRecordImport";
import { signOutOfflineTeacherSession } from "../../lib/teacherOfflineDb";

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

const PERIODS = [
  "BoSY",
  "MoSY",
  "EoSY",
];

const LETTERS = [
  "M",
  "S",
  "A",
  "L",
  "O",
  "B",
  "E",
  "U",
  "R",
  "T",
];

const WORDS = [
  "clap",
  "jump",
  "eat",
  "drink",
  "stand",
  "dance",
  "fly",
  "pencil",
  "basket",
  "helmet",
];

const DEFAULT_CONTENT = {
  BoSY: {
    letters: LETTERS,
    words: WORDS,
    stories: [
      { id: 1, title: "Para the Parrot", text: "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man." },
      { id: 2, title: "A Day in the Fields", text: "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil." },
    ],
  },
  MoSY: {
    letters: LETTERS,
    words: WORDS,
    stories: [
      {
        id: 1,
        title: "A Morning Walk",
        text: "The children walk together and help one another on their way to school.",
      },
    ],
  },
  EoSY: {
    letters: LETTERS,
    words: WORDS,
    stories: [
      {
        id: 1,
        title: "The Kind Child",
        text: "A kind child notices someone who needs help and chooses to lend a hand.",
      },
    ],
  },
};

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

  return [familyAndGiven, initial]
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

function AnalyticsPanel({ title, hint, children }) {
  return (
    <section style={ANALYTICS_STYLES.panel}>
      <h3 style={ANALYTICS_STYLES.panelTitle}>{title}</h3>
      {hint ? <p style={ANALYTICS_STYLES.panelHint}>{hint}</p> : null}
      {children}
    </section>
  );
}

function AnalyticsBarList({ items, scale = "max", max, emptyText }) {
  const entries = (Array.isArray(items) ? items : []).filter(Boolean);

  if (!entries.length) {
    return (
      <div style={ANALYTICS_STYLES.empty}>
        {emptyText || "No records for this selection yet."}
      </div>
    );
  }

  const ceiling =
    max !== undefined && max !== null
      ? Math.max(1, Number(max) || 1)
      : Math.max(1, ...entries.map((item) => Number(item.value) || 0));

  return (
    <div style={ANALYTICS_STYLES.barStack}>
      {entries.map((item, index) => {
        const value = Number(item.value) || 0;
        const rawWidth =
          scale === "percent" ? value : (value / ceiling) * 100;
        const width = Math.max(0, Math.min(100, Math.round(rawWidth)));

        return (
          <div
            key={item.key ?? `${item.label}-${index}`}
            style={ANALYTICS_STYLES.barRow}
          >
            <div style={ANALYTICS_STYLES.barTop}>
              <span style={ANALYTICS_STYLES.barLabel}>{item.label}</span>
              <span style={ANALYTICS_STYLES.barValue}>
                {item.display ?? value}
              </span>
            </div>
            <div style={ANALYTICS_STYLES.barTrack}>
              <div
                style={{
                  ...ANALYTICS_STYLES.barFill,
                  width: `${width}%`,
                  background: item.color || "#1a2b4c",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ClassAnalyticsCharts({ rows, assessedRows, trend }) {
  const assessed = Array.isArray(assessedRows) ? assessedRows : [];
  const recordCount = Array.isArray(rows) ? rows.length : assessed.length;
  const assessedCount = assessed.length;
  const passageRows = assessed.filter((row) => row.administered);

  const percentOfAssessed = (count) =>
    assessedCount ? Math.round((count / assessedCount) * 100) : 0;

  const profileItems = READING_PROFILE_LABELS.map((label) => {
    const count = assessed.filter((row) => row.profile === label).length;
    return {
      key: label,
      label,
      value: count,
      color: READING_PROFILE_COLORS[label],
      display: `${count} (${percentOfAssessed(count)}%)`,
    };
  });

  const part1Items = PART1_LEVEL_LABELS.map((label) => {
    const count = assessed.filter((row) => row.part1Level === label).length;
    return {
      key: label,
      label,
      value: count,
      color: PART1_LEVEL_COLORS[label] || "#1a2b4c",
      display: `${count} (${percentOfAssessed(count)}%)`,
    };
  });

  const groupStats = ["Male", "Female", "Total"].map((group) => {
    const groupRows =
      group === "Total"
        ? assessed
        : assessed.filter(
            (row) =>
              String(row.learner?.sex || "").toLowerCase() === group.toLowerCase()
          );

    return {
      group,
      count: groupRows.length,
      accuracy: analyticsAverage(groupRows.map((row) => row.accuracy)),
      comprehension: analyticsAverage(groupRows.map((row) => row.comprehension)),
      wpm: analyticsAverage(groupRows.map((row) => row.wpm)),
    };
  });

  const wpmItems = passageRows
    .filter((row) => row.wpm !== null)
    .sort((left, right) => Number(right.wpm) - Number(left.wpm))
    .map((row, index) => ({
      key: String(row.assessment?.id ?? row.learner?.id ?? `wpm-${index}`),
      label: formatName(row.learner) || `Learner #${row.assessment?.learner_id ?? ""}`,
      value: Number(row.wpm),
      display: `${Number(row.wpm).toFixed(1)} WPM`,
      color: READING_PROFILE_COLORS[row.profile] || "#1a2b4c",
    }));

  const matrixRows = passageRows.filter(
    (row) => row.accuracy !== null && row.comprehension !== null
  );

  const totalFluency = analyticsAverage(assessed.map((row) => row.accuracy));
  const totalWpm = analyticsAverage(assessed.map((row) => row.wpm));
  const totalComprehension = analyticsAverage(
    assessed.map((row) => row.comprehension)
  );

  return (
    <div style={ANALYTICS_STYLES.grid}>
      <AnalyticsPanel
        title="Reading Profile Distribution"
        hint={`${assessedCount} of ${recordCount} record${recordCount === 1 ? "" : "s"} completed in this selection. Percentages use the same completed records as the Class Summary.`}
      >
        <AnalyticsBarList items={profileItems} scale="max" />
      </AnalyticsPanel>

      <AnalyticsPanel
        title="Part 1 Reading Level"
        hint="Official CRLA bands from Task 1 + Task 2 (0-20). Full 0, Moderate 1-10, Light 11-16, Grade Ready 17-20."
      >
        <AnalyticsBarList items={part1Items} scale="max" />
      </AnalyticsPanel>

      <AnalyticsPanel
        title="Class Averages"
        hint="Passage metrics only include records where the story passage was administered (Part 1 total above 10 with a recorded timer)."
      >
        <div style={ANALYTICS_STYLES.statGrid}>
          <div style={ANALYTICS_STYLES.statBox}>
            <div style={ANALYTICS_STYLES.statLabel}>Reading accuracy</div>
            <div style={ANALYTICS_STYLES.statValue}>
              {totalFluency === null ? "—" : `${totalFluency.toFixed(1)}%`}
            </div>
          </div>
          <div style={ANALYTICS_STYLES.statBox}>
            <div style={ANALYTICS_STYLES.statLabel}>Comprehension</div>
            <div style={ANALYTICS_STYLES.statValue}>
              {totalComprehension === null
                ? "—"
                : `${totalComprehension.toFixed(1)}/6`}
            </div>
          </div>
          <div style={ANALYTICS_STYLES.statBox}>
            <div style={ANALYTICS_STYLES.statLabel}>Average WPM</div>
            <div style={ANALYTICS_STYLES.statValue}>
              {totalWpm === null ? "—" : totalWpm.toFixed(1)}
            </div>
          </div>
        </div>

        <div style={{ marginTop: "14px" }}>
          {groupStats.map((stat) => (
            <div key={stat.group} style={ANALYTICS_STYLES.groupRow}>
              <div style={ANALYTICS_STYLES.groupHead}>
                <span>{stat.group}</span>
                <span style={{ color: "#6b7789", fontWeight: 800 }}>
                  {stat.count} assessed
                </span>
              </div>
              <AnalyticsBarList
                scale="percent"
                max={100}
                items={[
                  {
                    key: `${stat.group}-accuracy`,
                    label: "Reading accuracy",
                    value: stat.accuracy === null ? 0 : stat.accuracy,
                    display:
                      stat.accuracy === null ? "—" : `${stat.accuracy.toFixed(1)}%`,
                    color: ANALYTICS_GROUP_COLORS[stat.group],
                  },
                  {
                    key: `${stat.group}-comprehension`,
                    label: "Comprehension / 6",
                    value:
                      stat.comprehension === null
                        ? 0
                        : (stat.comprehension / 6) * 100,
                    display:
                      stat.comprehension === null
                        ? "—"
                        : `${stat.comprehension.toFixed(1)}/6`,
                    color: "#4a6fa5",
                  },
                  {
                    key: `${stat.group}-wpm`,
                    label: "Average WPM (scale to 200)",
                    value: stat.wpm === null ? 0 : (stat.wpm / 200) * 100,
                    display: stat.wpm === null ? "—" : stat.wpm.toFixed(1),
                    color: "#4a6fa5",
                  },
                ]}
              />
            </div>
          ))}
        </div>
      </AnalyticsPanel>

      <AnalyticsPanel
        title="Reading Fluency per Learner"
        hint="Words per minute, highest first. Use this to spot learners who need fluency intervention."
      >
        <AnalyticsBarList
          items={wpmItems}
          scale="max"
          emptyText="No administered passage in this selection yet."
        />
      </AnalyticsPanel>

      <AnalyticsPanel
        title="Accuracy vs Comprehension"
        hint="Each dot is one administered passage. Bottom-right dots decode words but miss meaning; top-left dots need decoding support."
      >
        {matrixRows.length ? (
          <>
            <div style={ANALYTICS_STYLES.matrixWrap}>
              <div style={ANALYTICS_STYLES.matrixAxisY}>
                <span>6/6</span>
                <span>3/6</span>
                <span>0/6</span>
              </div>
              {[25, 50, 75].map((tick) => (
                <div
                  key={`v-${tick}`}
                  style={{
                    position: "absolute",
                    left: `${tick}%`,
                    top: 0,
                    bottom: 0,
                    width: "1px",
                    background: "#edf1f7",
                  }}
                />
              ))}
              {[33, 66].map((tick) => (
                <div
                  key={`h-${tick}`}
                  style={{
                    position: "absolute",
                    top: `${tick}%`,
                    left: 0,
                    right: 0,
                    height: "1px",
                    background: "#edf1f7",
                  }}
                />
              ))}
              {matrixRows.map((row, index) => (
                <div
                  key={String(row.assessment?.id ?? `dot-${index}`)}
                  title={`${formatName(row.learner)} — ${row.profile} · ${Number(
                    row.accuracy
                  ).toFixed(0)}% accuracy · ${row.comprehension}/6 comprehension`}
                  style={{
                    ...ANALYTICS_STYLES.matrixDot,
                    left: `${Math.max(0, Math.min(100, Number(row.accuracy)))}%`,
                    bottom: `${Math.max(
                      0,
                      Math.min(100, (Number(row.comprehension) / 6) * 100)
                    )}%`,
                    background: READING_PROFILE_COLORS[row.profile] || "#1a2b4c",
                  }}
                />
              ))}
            </div>
            <div style={ANALYTICS_STYLES.matrixAxisX}>
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </>
        ) : (
          <div style={ANALYTICS_STYLES.empty}>
            No administered passage in this selection yet.
          </div>
        )}
      </AnalyticsPanel>

      <AnalyticsPanel
        title="Progress Across Periods"
        hint="BoSY to EoSY averages for the whole class, independent of the period filter."
      >
        <div style={ANALYTICS_STYLES.trendGrid}>
          {(Array.isArray(trend) ? trend : []).map((point) => (
            <div key={point.period} style={ANALYTICS_STYLES.trendCol}>
              <div style={ANALYTICS_STYLES.trendTitle}>{point.period}</div>
              <AnalyticsBarList
                scale="percent"
                max={100}
                items={[
                  {
                    key: `${point.period}-accuracy`,
                    label: "Avg accuracy",
                    value: point.accuracy === null ? 0 : point.accuracy,
                    display:
                      point.accuracy === null
                        ? "—"
                        : `${point.accuracy.toFixed(1)}%`,
                    color: "#1a2b4c",
                  },
                ]}
              />
              <div style={{ height: "8px" }} />
              <AnalyticsBarList
                scale="percent"
                max={100}
                items={[
                  {
                    key: `${point.period}-wpm`,
                    label: "Avg WPM (scale to 200)",
                    value: point.wpm === null ? 0 : (point.wpm / 200) * 100,
                    display: point.wpm === null ? "—" : point.wpm.toFixed(1),
                    color: "#4a6fa5",
                  },
                ]}
              />
              <div
                style={{
                  ...ANALYTICS_STYLES.panelHint,
                  margin: "9px 0 0",
                }}
              >
                {point.assessed} assessed · {point.passages} with passage
              </div>
            </div>
          ))}
        </div>
      </AnalyticsPanel>
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
    { id: 1, lrn: "", lastName: "", firstName: "", middleName: "", sex: "Male" },
  ]);

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
    DEFAULT_CONTENT
  );

  const [
    activityEditor,
    setActivityEditor,
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
  ] = useState("All");

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
      } = {}
    ) => {
      const url =
        `/api/assessment?action=${encodeURIComponent(
          action
        )}`;

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

  const loadData =
    useCallback(
      async (
        silent = false
      ) => {
        if (!silent) {
          setLoadingData(
            true
          );
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
            setActivities(
              activitiesData.activities
            );
          }

        } catch (error) {
          showToast(
            error.message ||
              "Unable to load dashboard data.",
            "error"
          );
        } finally {
          if (!silent) {
            setLoadingData(
              false
            );
          }
        }
      },
      [api, showToast]
    );

  useEffect(() => {
    verifySession();
  }, [verifySession]);

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
    async (next) => {
      setActivities(next);

      try {
        const result = await api(
          "save_activities",
          {
            method: "POST",
            body: {
              content: next,
            },
          }
        );

        if (result?.activities) {
          setActivities(
            result.activities
          );
        }

        return true;
      } catch (error) {
        showToast(
          error?.message ||
            "Unable to save assessment content.",
          "error"
        );
        return false;
      }
    },
    [api, showToast]
  );

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

      return rows;
    }, [
      learners,
      assessments,
      search,
      sexFilter,
      statusFilter,
      sortMode,
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

  const analyticsRecords =
    useMemo(() => {
      return (Array.isArray(assessments)
        ? assessments
        : [])
        .filter(
          (assessment) => {
          if (
            analyticsPeriod ===
            "All"
          ) {
            return true;
          }

          return (
            assessment.assessment_period ===
            analyticsPeriod
          );
        }
      );
    }, [
      assessments,
      analyticsPeriod,
    ]);

  /*
   * Analytics resolves every record through the same helpers the Assessment
   * Records tab uses, so Averages, distributions and the scoresheet can never
   * report different numbers for the same learner.
   */
  const analyticsRows =
    useMemo(
      () =>
        analyticsRecords.map((assessment) => {
          const learner =
            learners.find(
              (item) =>
                Number(item.id) ===
                Number(assessment.learner_id)
            ) || null;

          return buildAnalyticsRow(assessment, learner);
        }),
      [analyticsRecords, learners]
    );

  const analyticsAssessedRows =
    useMemo(
      () => analyticsRows.filter((row) => row.isCompleted),
      [analyticsRows]
    );

  const analyticsPeriodTrend =
    useMemo(
      () =>
        PERIODS.map((period) => {
          const periodRows = (Array.isArray(assessments)
            ? assessments
            : []
          )
            .filter(
              (assessment) =>
                assessment.assessment_period === period
            )
            .map((assessment) => buildAnalyticsRow(assessment, null))
            .filter((row) => row.isCompleted);

          return {
            period,
            assessed: periodRows.length,
            passages: periodRows.filter((row) => row.administered).length,
            accuracy: analyticsAverage(
              periodRows.map((row) => row.accuracy)
            ),
            wpm: analyticsAverage(periodRows.map((row) => row.wpm)),
          };
        }),
      [assessments]
    );

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
          const response =
            await fetch(
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

          if (
            !response.ok
          ) {
            let message =
              "Unable to generate the Excel assessment record.";

            try {
              const data =
                await response.json();

              message =
                data?.error ||
                message;
            } catch {
              // Keep fallback.
            }

            throw new Error(
              message
            );
          }

          const blob =
            await response.blob();

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

        router.push(
          `/teacher/assessment?code=${encodeURIComponent(
            result.code
          )}&learner_id=${encodeURIComponent(
            learnerId
          )}&period=${encodeURIComponent(
            normalizedPeriod
          )}`
        );
      } catch (error) {
        showToast(
          error.message ||
            "Unable to start assessment.",
          "error"
        );
      } finally {
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
    const normalizedRows = learnerRows.map((row) => ({
      ...row,
      lrn: String(row.lrn ?? "").replace(/\D/g, "").trim(),
      lastName: String(row.lastName ?? "").trim(),
      firstName: String(row.firstName ?? "").trim(),
      middleName: String(row.middleName ?? "").trim(),
      sex: String(row.sex ?? "").trim(),
    }));

    const meaningfulRows = normalizedRows.filter((row) =>
      [row.lrn, row.lastName, row.firstName].some(Boolean)
    );

    if (!meaningfulRows.length) {
      showToast("Add at least one learner before saving.", "error");
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

  const selectTab =
    (tabId) => {
      if (
        tabId ===
        activeTab
      ) {
        return;
      }

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

  const openBento =
    (tabId) => {
      setBentoOpen(true);
      selectTab(tabId);
    };

  const closeBento =
    () => {
      setBentoOpen(false);
    };

  const logout =
    async () => {
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

  const saveProfile =
    async () => {
      try {
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
      if (
        index < 0 &&
        (category === "letters" ||
          category === "words") &&
        activities[activityPeriod][category].length >= 10
      ) {
        showToast(
          "Maximum items is 10. Unable to add more.",
          "error"
        );
        return;
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
        setActivityEditor({
          category,
          index,
          title:
            current?.title ||
            "",
          text:
            current?.text ||
            "",
        });
        return;
      }

      setActivityEditor({
        category,
        index,
        value:
          current || "",
      });
    };

  const saveActivity =
    async () => {
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
            activityEditor.text.trim(),
        };

        if (
          !story.title ||
          !story.text
        ) {
          showToast(
            "Story title and content are required.",
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
        const value =
          activityEditor.value.trim();

        if (!value) {
          showToast(
            "Content is required.",
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
          ] = value;
        } else {
          next[
            activityPeriod
          ][category].push(
            value
          );
        }
      }

      const saved = await saveActivities(
        next
      );

      if (!saved) return;

      setActivityEditor(
        null
      );

      showToast(
        "Activity saved."
      );
    };

  const removeActivity =
    async (
      category,
      index
    ) => {
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

      next[
        activityPeriod
      ][category].splice(
        index,
        1
      );

      const saved = await saveActivities(
        next
      );

      if (!saved) return;

      showToast(
        "Activity removed."
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
          font-size: 11px;
          white-space: nowrap;
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
          grid-template-columns: 34px 1.05fr 1fr 1fr 1fr .8fr 38px;
          gap: 10px;
          align-items: end;
          padding: 12px;
          border-radius: 18px;
          background: #edf1f7;
          box-shadow: none;
        }
        .learnerEntryNumber { align-self: center; width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; background: #edf1f7; color: #1a2b4c; font-size: 12px; font-weight: 900; box-shadow: none; }
        .learnerEntryRow .formInput, .learnerEntryRow .formSelect { min-height: 44px; font-size: 13px; }
        .iconDangerButton { width: 36px; height: 36px; border: 0; border-radius: 12px; background: #edf1f7; color: #c0392b; cursor: pointer; box-shadow: none; transition: transform .18s ease, box-shadow .2s ease; }
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
          .learnerEntryRow .iconDangerButton { justify-self: start; }
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
            grid-template-columns: 30px repeat(5, minmax(105px, 1fr)) 36px !important;
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
        html:not([data-crl-theme="dark"]) .exportGreenButton,
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
        html:not([data-crl-theme="dark"]) .exportGreenButton:hover,
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
        html[data-crl-theme] .exportGreenButton,
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

        html[data-crl-theme] .toolbarButton:hover,
        html[data-crl-theme] .smallButton:hover,
        html[data-crl-theme] .secondaryButton:hover,
        html[data-crl-theme] .exportGreenButton:hover,
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

        /* These panels carried a large viewport-relative top offset, pushing
           them well below the Conduct panel. Align them with it. */
        html[data-crl-theme] .manageAssessmentPanel,
        html[data-crl-theme] .analyticsMainPanel,
        html[data-crl-theme] .profileMainPanel {
          margin-top: 0 !important;
          margin-bottom: 18px !important;
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

      `}</style>

      <main className={`teacherShell ${bentoOpen ? "isExpanded" : "isBento"}`}>
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
                  Logout
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
                      (filteredLearners.length === 0
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
                    </div>

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
                          await loadData(true);
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

                    {filteredLearners.length ===
                    0 ? (
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
                                            className="smallButton"
                                            onClick={() =>
                                              setDetailsTarget(
                                                learner
                                              )
                                            }
                                          >
                                            View
                                          </button>

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
                    <div className="panelHeader">
                      <div>
                        <div className="panelHeaderTitle">
                          Assessment Records
                        </div>
                      </div>

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
                            onClick={() =>
                              setRecordsView(
                                "scoresheet"
                              )
                            }
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
                            onClick={() =>
                              setRecordsView(
                                "summary"
                              )
                            }
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
                            onClick={() =>
                              setRecordsView(
                                "class-record"
                              )
                            }
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
                                onClick={() =>
                                  setCurrentPeriod(
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
                          <table className="summaryTable templateSummaryTable">
                            <thead>
                              <tr>
                                <th rowSpan={2}>Grade</th>
                                <th rowSpan={2}>Section</th>
                                <th rowSpan={2}>Teacher</th>
                                <th rowSpan={2}>Language</th>
                                <th rowSpan={2}>Sex</th>
                                <th rowSpan={2}>Number of Learners Enrolled</th>
                                <th rowSpan={2}>Number of Learners Assessed</th>
                                <th colSpan={4}>Assessment Part 1 Reading Level</th>
                                <th colSpan={3}>Average Score</th>
                                <th colSpan={5}>READING PROFILE</th>
                              </tr>
                              <tr>
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
                              {["Male", "Female", "Total"].map((group) => {
                                const groupRows = recordSummaryFor(currentRecords, group);
                                const totalEnrolled =
                                  group === "Total"
                                    ? learners.length
                                    : learners.filter(
                                        (item) =>
                                          String(item.sex || "").toLowerCase() ===
                                          group.toLowerCase()
                                      ).length;
                                const assessed = groupRows.length;
                                const part1 = PART1_LEVEL_LABELS.map((label) => {
                                  const count = countPart1(groupRows, label);
                                  return assessed
                                    ? Math.round((count / assessed) * 100) + "%"
                                    : "0%";
                                });
                                const avgFluency = assessed
                                  ? (
                                      groupRows.reduce(
                                        (sum, row) =>
                                          sum +
                                          (getRecordFluency(row.assessment) || 0),
                                        0
                                      ) / assessed
                                    ).toFixed(2) + "%"
                                  : "0%";
                                const avgComp = assessed
                                  ? (
                                      groupRows.reduce(
                                        (sum, row) =>
                                          sum +
                                          (Number(
                                            row.assessment.comprehension_score
                                          ) || 0),
                                        0
                                      ) / assessed
                                    ).toFixed(2)
                                  : "0";
                                const avgWpm = assessed
                                  ? (
                                      groupRows.reduce((sum, row) => {
                                        const seconds = Number(
                                          row.assessment.timer_seconds || 0
                                        );
                                        const words = getRecordWordsRead(row.assessment);
                                        const wpm =
                                          row.assessment.wpm ??
                                          (seconds > 0 ? (words / seconds) * 60 : 0);
                                        return sum + (Number(wpm) || 0);
                                      }, 0) / assessed
                                    ).toFixed(2)
                                  : "0";
                                const profileLabels = READING_PROFILE_LABELS;
                                const profiles = profileLabels.map((label) => {
                                  const count = groupRows.filter(
                                    (row) => row.profile === label
                                  ).length;
                                  return assessed
                                    ? Math.round((count / assessed) * 100) + "%"
                                    : "0%";
                                });

                                return (
                                  <tr key={group}>
                                    <td>Grade 3</td>
                                    <td>{user?.section || "—"}</td>
                                    <td>{user?.full_name || "—"}</td>
                                    <td>English</td>
                                    <td>{group}</td>
                                    <td>{totalEnrolled}</td>
                                    <td>{assessed}</td>
                                    {part1.map((value, index) => <td key={`${group}-part1-${index}`}>{value}</td>)}
                                    <td>{avgFluency}</td>
                                    <td>{avgComp}</td>
                                    <td>{avgWpm}</td>
                                    {profiles.map((value, index) => (
                                      <td key={profileLabels[index] + group}>{value}</td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="summaryDetailSection">
                          <div className="summaryDetailTitle">
                            Percent (%) of Learners at Each Proficiency Level
                          </div>

                          <div className="summaryDetailScroller">
                            <table className="summaryDetailTable">
                              <thead>
                                <tr>
                                  <th>Language</th>
                                  <th>Sex</th>
                                  <th>Percent of Learners</th>
                                  <th colSpan={4}>Assessment Part 1 Reading Level</th>
                                  <th colSpan={3}>Average Score</th>
                                  <th colSpan={5}>READING PROFILE</th>
                                </tr>
                                <tr>
                                  <th></th>
                                  <th></th>
                                  <th></th>
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
                                {["Male", "Female", "Total"].map((group) => {
                                  const rowsForGroup =
                                    recordSummaryFor(currentRecords, group);
                                  const enrolledForGroup =
                                    group === "Total"
                                      ? learners.length
                                      : learners.filter(
                                          (learner) =>
                                            String(learner.sex || "").toLowerCase() ===
                                            group.toLowerCase()
                                        ).length;
                                  const assessed = rowsForGroup.length;
                                  const part1Labels = PART1_LEVEL_LABELS;
                                  const profileLabels = READING_PROFILE_LABELS;
                                  const percentLearners =
                                    enrolledForGroup > 0
                                      ? ((assessed / enrolledForGroup) * 100).toFixed(2) + "%"
                                      : "0%";
                                  const valuePercent = (count) =>
                                    assessed > 0
                                      ? ((count / assessed) * 100).toFixed(2) + "%"
                                      : "0%";
                                  const avgFluency =
                                    assessed > 0
                                      ? (
                                          rowsForGroup.reduce(
                                            (sum, item) =>
                                              sum +
                                              (getRecordFluency(item.assessment) || 0),
                                            0
                                          ) / assessed
                                        ).toFixed(2) + "%"
                                      : "0%";
                                  const avgComp =
                                    assessed > 0
                                      ? (
                                          rowsForGroup.reduce(
                                            (sum, item) =>
                                              sum +
                                              (Number(
                                                item.assessment.comprehension_score
                                              ) || 0),
                                            0
                                          ) / assessed
                                        ).toFixed(2)
                                      : "0.00";
                                  const avgWpm =
                                    assessed > 0
                                      ? (
                                          rowsForGroup.reduce((sum, item) => {
                                            const seconds = Number(
                                              item.assessment.timer_seconds || 0
                                            );
                                            const words = Math.max(
                                              0,
                                              100 -
                                                Number(
                                                  item.assessment.total_miscues || 0
                                                )
                                            );
                                            const wpm =
                                              item.assessment.wpm ??
                                              (seconds > 0
                                                ? (words / seconds) * 60
                                                : 0);
                                            return sum + (Number(wpm) || 0);
                                          }, 0) / assessed
                                        ).toFixed(2)
                                      : "0.00";

                                  return (
                                    <tr key={group}>
                                      <td>English</td>
                                      <td>{group}</td>
                                      <td>{percentLearners}</td>
                                      {part1Labels.map((label) => (
                                        <td key={label}>
                                          {valuePercent(
                                            countPart1(rowsForGroup, label)
                                          )}
                                        </td>
                                      ))}
                                      <td>{avgFluency}</td>
                                      <td>{avgComp}</td>
                                      <td>{avgWpm}</td>
                                      {profileLabels.map((label) => (
                                        <td key={label}>
                                          {valuePercent(
                                            rowsForGroup.filter(
                                              (item) => item.profile === label
                                            ).length
                                          )}
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
                                return (
                                  <div className="summaryMetricRow" key={group}>
                                    <span>{group}</span>
                                    <strong>
                                      {enrolled
                                        ? ((assessed / enrolled) * 100).toFixed(2)
                                        : "0.00"}
                                      %
                                    </strong>
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
                                  ? (
                                      (countPart1(rowsForGroup, label) /
                                        rowsForGroup.length) *
                                      100
                                    ).toFixed(2)
                                  : "0.00";
                                return (
                                  <div className="summaryMetricRow" key={label}>
                                    <span>{label}</span>
                                    <strong>{percent}%</strong>
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
                                  ? (
                                      (rowsForGroup.filter(
                                        (item) => item.profile === label
                                      ).length /
                                        rowsForGroup.length) *
                                      100
                                    ).toFixed(2)
                                  : "0.00";
                                return (
                                  <div className="summaryMetricRow" key={label}>
                                    <span>{label}</span>
                                    <strong>{percent}%</strong>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>                      </div>
                    ) : recordsView ===
                    "class-record" ? (
                      <div className="recordTemplateView">
                        <div className="recordTemplateMeta">
                          <div>
                            <strong>GRADE 3 Reading Assessment CLASS RECORD</strong>
                            <span>English assessment results for the current period</span>
                          </div>
                          <div className="recordTemplateTeacher">
                            <span>Teacher</span>
                            <strong>{user?.full_name || "—"}</strong>
                            <span>Section</span>
                            <strong>{user?.section || "—"}</strong>
                          </div>
                        </div>
                        <div className="recordTemplateScroller">
                          <table className="recordTemplateTable classRecordTable">
                            <thead>
                              <tr className="classRecordTitleRow">
                                <th colSpan={11}>
                                  GRADE 3 Reading Assessment CLASS RECORD
                                </th>
                              </tr>
                              <tr className="classRecordLanguageRow">
                                <th rowSpan={3}>S/N</th>
                                <th rowSpan={3}>LRN</th>
                                <th rowSpan={3}>Name of Learner</th>
                                <th rowSpan={3}>Sex</th>
                                <th colSpan={6}>ENGLISH</th>
                                <th rowSpan={3}>Remarks</th>
                              </tr>
                              <tr className="classRecordGroupRow">
                                <th colSpan={2}>Assessment Part 1</th>
                                <th colSpan={3}>Assessment Part 2</th>
                                <th rowSpan={2}>READING PROFILE</th>
                              </tr>
                              <tr className="classRecordSubheadRow">
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
                                currentRecords.map(({ assessment, learner }, index) => {
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
                                      ? "—"
                                      : readingPctValue + "%";
                                  const wordsRead =
                                    getRecordWordsRead(
                                      assessment
                                    );
                                  const seconds = Number(assessment.timer_seconds ?? 0);
                                  const wpm =
                                    assessment.wpm ??
                                    (seconds > 0
                                      ? ((Number(wordsRead) / seconds) * 60).toFixed(2)
                                      : "—");

                                  return (
                                    <tr key={assessment.id}>
                                      <td>{index + 1}</td>
                                      <td>{learner.lrn}</td>
                                      <td className="nameStrong">{formatName(learner)}</td>
                                      <td>{learner.sex}</td>
                                      <td>{total <= 0 ? "Full Refresher" : total <= 10 ? "Moderate Refresher" : total <= 16 ? "Light Refresher" : "Grade Ready"}</td>
                                      <td>{total ? ((total / 20) * 100).toFixed(2) + "%" : "0%"}</td>
                                      <td>{readingPct}</td>
                                      <td>{assessment.comprehension_score ?? 0}</td>
                                      <td>{wpm}</td>
                                      <td>
                                        <span className={"badge " + profileClass(profile)}>
                                          {profile}
                                        </span>
                                      </td>
                                      <td>{assessment.remarks || "—"}</td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="tableWrap">
                        <table>
                          <thead>
                            <tr>
                              <th>
                                S/N
                              </th>
                              <th>
                                LRN
                              </th>
                              <th>
                                Name of Learner
                              </th>
                              <th>
                                Sex
                              </th>
                              <th>
                                Date
                              </th>
                              <th>
                                Task 1
                              </th>
                              <th>
                                Task 2
                              </th>
                              <th>
                                Total Score
                              </th>
                              <th>
                                Part 1 Reading Level
                              </th>
                              <th>
                                Story #
                              </th>
                              <th>
                                Miscues
                              </th>
                              <th>
                                Words Read
                              </th>
                              <th>
                                Time
                              </th>
                              <th>
                                WPM
                              </th>
                              <th>
                                Read %
                              </th>
                              <th>
                                Comprehension
                              </th>
                              <th>
                                Experience
                              </th>
                              <th>
                                Observation Level
                              </th>
                              <th>
                                Reading Profile
                              </th>
                              <th>
                                Remarks
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {currentRecords.length ===
                            0 ? (
                              <tr>
                                <td
                                  colSpan={
                                    21
                                  }
                                >
                                  <div className="emptyState">
                                    <div className="emptyIcon">
                                      ▤
                                    </div>

                                    <h3>
                                      No records for{" "}
                                      {
                                        currentPeriod
                                      }
                                    </h3>

                                    <p>
                                      Completed
                                      assessments
                                      will appear
                                      here after
                                      they are saved
                                      to the database.
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              currentRecords.map(
                                ({
                                  assessment,
                                  learner,
                                }) => {
                                  const total =
                                    Number(
                                      assessment.task1_score ||
                                        0
                                    ) +
                                    Number(
                                      assessment.task2_score ||
                                        0
                                    );

                                  const profile =
                                    getRecordProfile(
                                      assessment
                                    );

                                  const miscues =
                                    Number(
                                      assessment.total_miscues ??
                                        0
                                    );

                                  const wordsRead =
                                    getRecordWordsRead(
                                      assessment
                                    );

                                  const seconds =
                                    Number(
                                      assessment.timer_seconds ??
                                        0
                                    );

                                  const time =
                                    seconds
                                      ? `${Math.floor(
                                          seconds / 60
                                        )}m ${String(
                                          seconds % 60
                                        ).padStart(
                                          2,
                                          "0"
                                        )}s`
                                      : "—";

                                  return (
                                    <tr
                                      key={
                                        assessment.id
                                      }
                                    >
                                      <td>
                                        {currentRecords.findIndex(
                                          (item) =>
                                            item.assessment.id ===
                                            assessment.id
                                        ) + 1}
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
                                        {assessment.date_administered
                                          ? new Date(
                                              assessment.date_administered
                                            ).toLocaleDateString()
                                          : "—"}
                                      </td>

                                      <td>
                                        {
                                          assessment.task1_score
                                        }
                                      </td>

                                      <td>
                                        {
                                          assessment.task2_score
                                        }
                                      </td>

                                      <td>
                                        {
                                          total
                                        }
                                      </td>

                                      <td>
                                        <span
                                          className={`badge ${profileClass(
                                            profile
                                          )}`}
                                        >
                                          {total <=
                                          0
                                            ? "Full Refresher"
                                            : total <=
                                              10
                                            ? "Moderate Refresher"
                                            : total <=
                                              16
                                            ? "Light Refresher"
                                            : "Grade Ready"}
                                        </span>
                                      </td>

                                      <td>
                                        {
                                          assessment.story_number ??
                                          "—"
                                        }
                                      </td>

                                      <td>
                                        {
                                          miscues
                                        }
                                      </td>

                                      <td>
                                        {wordsRead}
                                      </td>

                                      <td>
                                        {
                                          time
                                        }
                                      </td>

                                      <td>
                                        {assessment.wpm ??
                                          "—"}
                                      </td>

                                      <td>
                                        {getRecordFluency(
                                          assessment
                                        ) === null
                                          ? "—"
                                          : `${getRecordFluency(
                                              assessment
                                            )}%`}
                                      </td>

                                      <td>
                                        {
                                          assessment.comprehension_score
                                        }
                                      </td>

                                      <td>
                                        {
                                          assessment.experience ||
                                          "—"
                                        }
                                      </td>

                                      <td>
                                        {
                                          assessment.observation_level ||
                                          "—"
                                        }
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

                                      <td>
                                        {
                                          assessment.remarks ||
                                          "—"
                                        }
                                      </td>
                                    </tr>
                                  );
                                }
                              )
                            )}
                          </tbody>
                        </table>
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
                        </strong>

                        <button
                          type="button"
                          className="toolbarButton"
                          onClick={() =>
                            editActivity(
                              activityTab,
                              -1
                            )
                          }
                        >
                          + Add Item
                        </button>
                      </div>

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
                        <div className="tableWrap">
                          <table>
                            <thead>
                              <tr>
                                <th>
                                  #
                                </th>

                                <th>
                                  Content
                                </th>

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
                                ) => (
                                  <tr
                                    key={
                                      activityTab ===
                                      "stories"
                                        ? item.id
                                        : `${activityTab}-${index}`
                                    }
                                  >
                                    <td>
                                      {index +
                                        1}
                                    </td>

                                    <td className="nameStrong">
                                      {activityTab ===
                                      "stories"
                                        ? item.title
                                        : item}
                                    </td>

                                    <td>
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
                                )
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
                <>
                  <div className="panel analyticsMainPanel">
                    <div className="panelHeader">
                      <div>
                        <div className="panelHeaderTitle">
                          Class Analytics
                        </div>

                      </div>

                      <select
                        className="selectInput"
                        value={
                          analyticsPeriod
                        }
                        onChange={(
                          event
                        ) =>
                          setAnalyticsPeriod(
                            event
                              .target
                              .value
                          )
                        }
                      >
                        <option value="All">
                          All Periods
                        </option>
                        {PERIODS.map(
                          (
                            period
                          ) => (
                            <option
                              key={
                                period
                              }
                              value={
                                period
                              }
                            >
                              {
                                period
                              }
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div className="analyticsGrid">
                      <div className="analyticsCard">
                        <h3>
                          Records
                        </h3>

                        <div className="analyticsValue">
                          {
                            analyticsRows.length
                          }
                        </div>

                        <div className="analyticsMuted">
                          Assessment records in
                          selected period
                        </div>
                      </div>

                      <div className="analyticsCard">
                        <h3>
                          Completed
                        </h3>

                        <div className="analyticsValue green">
                          {
                            analyticsAssessedRows.length
                          }
                        </div>

                        <div className="analyticsMuted">
                          Completed assessments
                        </div>
                      </div>

                      <div className="analyticsCard">
                        <h3>
                          Grade Ready
                        </h3>

                        <div className="analyticsValue">
                          {
                            analyticsAssessedRows.filter(
                              (row) =>
                                row.profile ===
                                "Reading At Grade Level"
                            ).length
                          }
                        </div>

                        <div className="analyticsMuted">
                          Reading At Grade Level
                        </div>
                      </div>
                    </div>

                    <div className="barList">
                      {[
                        [
                          "Reading At Grade Level",
                          "green",
                        ],
                        [
                          "Transitioning Reader",
                          "blue",
                        ],
                        [
                          "Developing Reader",
                          "orange",
                        ],
                        [
                          "High Emerging Reader",
                          "red",
                        ],
                        [
                          "Low Emerging Reader",
                          "darkRed",
                        ],
                      ].map(
                        ([
                          label,
                          colorClass,
                        ]) => {
                          const count =
                            analyticsAssessedRows.filter(
                              (row) =>
                                row.profile ===
                                label
                            ).length;

                          const denominator =
                            Math.max(
                              1,
                              analyticsAssessedRows.length
                            );

                          const percentage =
                            Math.round(
                              (count /
                                denominator) *
                                100
                            );

                          return (
                            <div
                              className="barRow"
                              key={
                                label
                              }
                            >
                              <div className="barTop">
                                <span>
                                  {
                                    label
                                  }
                                </span>
                                <span>
                                  {count}{" "}
                                  (
                                  {
                                    percentage
                                  }
                                  %)
                                </span>
                              </div>

                              <div className="barTrack">
                                <div
                                  className="barFill"
                                  style={{
                                    width: `${percentage}%`,
                                    background:
                                      {
                                        red: "#c0392b",
                                        darkRed: "#9b2e22",
                                        orange: "#a9762f",
                                        green: "#3e7a5e",
                                        blue: "#1a2b4c",
                                      }[colorClass] || "#1a2b4c",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>

                    <ClassAnalyticsCharts
                      rows={analyticsRows}
                      assessedRows={analyticsAssessedRows}
                      trend={analyticsPeriodTrend}
                    />
                  </div>
                </>
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
                      <span className="securityDropdownIcon">🔐</span>
                      <span className="securityDropdownTitleWrap">
                        <span className="securityDropdownTitle">Security &amp; Privacy</span>
                        <span className="securityDropdownSubtitle">
                          Manage two-factor authentication and account security.
                        </span>
                      </span>
                      <span className="securityStatusPill securityDropdownStatus">
                        {securityStatus.two_factor_enabled ? "2FA Enabled" : "2FA Not Enabled"}
                      </span>
                      <span className={"securityDropdownChevron " + (securityOpen ? "open" : "")}>⌄</span>
                    </button>

                    <div
                      ref={securityDropdownContentRef}
                      className="securityDropdownContent"
                      aria-hidden={!securityOpen}
                    >
                      <div className="securityDropdownInner">
                        <div className="securityGrid">
                          <div className="securityCard">
                            <div className="securityCardIcon">🔐</div>
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
                  <div className="modalHeaderHint">
                    Add one or several learners, then save them together.
                  </div>
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
                        />
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
                <button type="button" className="toolbarButton primaryBlueButton" onClick={addLearners} disabled={savingLearner}>
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
                      "#46536b",
                    fontSize:
                      10,
                    lineHeight:
                      1.7,
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
                  Log out of CRL-App?
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
                      "#46536b",
                    fontSize:
                      14,
                    lineHeight:
                      1.65,
                  }}
                >
                  Are you sure you want
                  to log out? Your current
                  teacher session will be
                  ended and you will be
                  returned to the login page.
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
                  onClick={logout}
                >
                  {loggingOut
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
            <div className="modal">
              <div className="modalHeader">
                <h2>
                  {activityEditor.index >=
                  0
                    ? "Edit Activity"
                    : "Add Activity"}
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
                  <div
                    className="formGrid"
                  >
                    <div className="formGroup full">
                      <label className="formLabel">
                        Story Title
                      </label>

                      <input
                        className="formInput"
                        value={
                          activityEditor.title
                        }
                        onChange={(
                          event
                        ) =>
                          setActivityEditor(
                            (
                              current
                            ) => ({
                              ...current,
                              title:
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
                        Story Content
                      </label>

                      <textarea
                        className="formTextarea"
                        value={
                          activityEditor.text
                        }
                        onChange={(
                          event
                        ) =>
                          setActivityEditor(
                            (
                              current
                            ) => ({
                              ...current,
                              text:
                                event
                                  .target
                                  .value,
                            })
                          )
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="formGroup">
                    <label className="formLabel">
                      Content
                    </label>

                    <input
                      className="formInput"
                      value={
                        activityEditor.value
                      }
                      onChange={(
                        event
                      ) =>
                        setActivityEditor(
                          (
                            current
                          ) => ({
                            ...current,
                            value:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                      placeholder={
                        activityEditor.category ===
                        "letters"
                          ? "Enter letter"
                          : "Enter word"
                      }
                    />
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

                <button
                  type="button"
                  className="toolbarButton"
                  onClick={
                    saveActivity
                  }
                >
                  Save Changes
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

        {startingAssessment && (
          <div className="busyOverlay">
            <div className="busyCard">
              <span className="busySpinner" />
              <div>
                <strong>
                  Starting Assessment
                </strong>
                <div className="busySubtext">
                  Preparing the selected assessment period...
                </div>
              </div>
            </div>
          </div>
        )}

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
