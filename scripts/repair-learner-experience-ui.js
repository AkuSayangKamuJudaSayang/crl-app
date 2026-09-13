const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, source) {
  fs.writeFileSync(file, source, "utf8");
}

function replaceOnce(source, pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches) {
    throw new Error(`${label}: target not found.`);
  }
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly 1 match, found ${matches.length}`);
  }
  return source.replace(pattern, replacement);
}

/* ========================================================================== */
/* TEACHER: LEARNER EXPERIENCE CONTROL                                       */
/* ========================================================================== */
const teacherPath = path.join(
  process.cwd(),
  "app",
  "teacher",
  "assessment",
  "AssessmentClient.jsx"
);
let teacher = read(teacherPath);
const teacherMarker = "CRL_LEARNER_EXPERIENCE_TEACHER_UI_V1";

if (!teacher.includes(teacherMarker)) {
  teacher = replaceOnce(
    teacher,
    /const \[storySelecting, setStorySelecting\] = useState\(false\);/,
    `const [storySelecting, setStorySelecting] = useState(false);\n  const [experienceRatingSaving, setExperienceRatingSaving] = useState(false);`,
    "teacher learner-experience saving state"
  );

  const callbackAnchor = '  const controlPassageTimer =';
  const callback = `  const saveTeacherExperienceRating = useCallback(\n    async (rating) => {\n      const normalizedRating = Number(rating);\n      if (\n        experienceRatingSaving ||\n        activeStage !== "learner_experience" ||\n        !Number.isInteger(normalizedRating) ||\n        normalizedRating < 1 ||\n        normalizedRating > 5\n      ) {\n        return;\n      }\n\n      setExperienceRatingSaving(true);\n      setError("");\n\n      try {\n        const response = await fetch(\n          "/api/assessment?action=save_experience_rating",\n          {\n            method: "POST",\n            credentials: "include",\n            cache: "no-store",\n            headers: {\n              "Content-Type": "application/json",\n              Accept: "application/json",\n            },\n            body: JSON.stringify({\n              action: "save_experience_rating",\n              code,\n              learner_id: latestSessionRef.current?.learner_id || learnerId,\n              experience_rating: normalizedRating,\n            }),\n          }\n        );\n\n        const data = await response.json();\n        if (!response.ok) {\n          throw new Error(\n            data?.error ||\n              "Unable to save the learner experience rating."\n          );\n        }\n\n        const nextSession = {\n          ...(latestSessionRef.current || {}),\n          stage: data?.stage || "teacher_review",\n          current_content:\n            data?.current_content ||\n            data?.currentContent ||\n            "TEACHER_REVIEW",\n          currentContent:\n            data?.current_content ||\n            data?.currentContent ||\n            "TEACHER_REVIEW",\n          ended: false,\n          connected: true,\n          metrics: {\n            ...(latestSessionRef.current?.metrics || {}),\n            experienceRating: normalizedRating,\n            experience_rating: normalizedRating,\n          },\n          experience_rating: normalizedRating,\n          experienceRating: normalizedRating,\n        };\n\n        latestSessionRef.current = nextSession;\n        latestActiveStageRef.current = nextSession.stage;\n        setSession(nextSession);\n        setActiveStage(nextSession.stage);\n        void publishAssessmentRealtimeState(code, nextSession);\n      } catch (ratingError) {\n        setError(\n          ratingError?.message ||\n            "Unable to save the learner experience rating."\n        );\n      } finally {\n        setExperienceRatingSaving(false);\n      }\n    },\n    [\n      activeStage,\n      code,\n      experienceRatingSaving,\n      learnerId,\n    ]\n  );\n\n  /* ${teacherMarker} */\n\n`;

  teacher = replaceOnce(
    teacher,
    /  const controlPassageTimer =/,
    callback + callbackAnchor,
    "teacher learner-experience rating handler"
  );

  teacher = replaceOnce(
    teacher,
    /\n                    : activeStage\n                }\n                <\/h1>/,
    `\n                    : activeStage ===\n                      "learner_experience"\n                    ? "Learner Experience"\n                    : activeStage\n                }\n                </h1>`,
    "teacher learner-experience title"
  );

  const teacherExperiencePanel = `\n                {activeStage ===\n                  "learner_experience" && (\n                  <div\n                    style={{\n                      padding: "28px",\n                      borderRadius: "22px",\n                      background: "linear-gradient(145deg,#f8fbff,#eef6fb)",\n                      border: "1px solid #d8e6ef",\n                    }}\n                  >\n                    <div\n                      style={{\n                        fontSize: "12px",\n                        fontWeight: 950,\n                        letterSpacing: "1.4px",\n                        color: "#1559a6",\n                        marginBottom: "10px",\n                      }}\n                    >\n                      LEARNER EXPERIENCE\n                    </div>\n                    <h2\n                      style={{\n                        margin: "0 0 8px",\n                        color: "#17324d",\n                        fontSize: "28px",\n                        fontWeight: 950,\n                      }}\n                    >\n                      How did the assessment feel?\n                    </h2>\n                    <p\n                      style={{\n                        margin: "0 auto 24px",\n                        maxWidth: "620px",\n                        color: "#6d8498",\n                        fontSize: "15px",\n                        lineHeight: 1.6,\n                      }}\n                    >\n                      Select the emoji that best matches the learner's experience. The learner can see the five choices but cannot press them.\n                    </p>\n                    <div\n                      style={{\n                        display: "grid",\n                        gridTemplateColumns: "repeat(5,minmax(0,1fr))",\n                        gap: "14px",\n                        maxWidth: "760px",\n                        margin: "0 auto",\n                      }}\n                    >\n                      {[\n                        ["😟", 1],\n                        ["🙁", 2],\n                        ["😐", 3],\n                        ["🙂", 4],\n                        ["🤩", 5],\n                      ].map(([emoji, rating]) => (\n                        <button\n                          key={rating}\n                          type="button"\n                          onClick={() =>\n                            void saveTeacherExperienceRating(rating)\n                          }\n                          disabled={experienceRatingSaving}\n                          aria-label={\`Select rating \${rating} out of 5\`}\n                          style={{\n                            minHeight: "118px",\n                            borderRadius: "20px",\n                            border: "1px solid #d1e0eb",\n                            background: "#ffffff",\n                            boxShadow: "10px 12px 24px rgba(35,70,105,.12)",\n                            display: "flex",\n                            flexDirection: "column",\n                            alignItems: "center",\n                            justifyContent: "center",\n                            gap: "10px",\n                            cursor: experienceRatingSaving ? "wait" : "pointer",\n                            opacity: experienceRatingSaving ? 0.65 : 1,\n                          }}\n                        >\n                          <span style={{ fontSize: "48px", lineHeight: 1 }}>{emoji}</span>\n                          <span style={{ fontSize: "12px", fontWeight: 900, color: "#6d8498" }}>\n                            {rating}/5\n                          </span>\n                        </button>\n                      ))}\n                    </div>\n                  </div>\n                )}\n\n`;

  teacher = replaceOnce(
    teacher,
    /\n                \{activeStage ===\n                  "completed" && \(/,
    teacherExperiencePanel + '                {activeStage ===\n                  "completed" && (',
    "teacher learner-experience panel"
  );

  write(teacherPath, teacher);
}

/* ========================================================================== */
/* LEARNER: DISPLAY ONLY                                                      */
/* ========================================================================== */
const learnerPath = path.join(
  process.cwd(),
  "app",
  "learner",
  "LearnerAssessmentPage.jsx"
);
let learner = read(learnerPath);
const learnerMarker = "CRL_LEARNER_EXPERIENCE_DISPLAY_ONLY_V1";

if (!learner.includes(learnerMarker)) {
  const overlayStart = learner.indexOf("      {showExperienceOverlay &&");
  const overlayEnd = learner.indexOf("      {showConnectionSettings", overlayStart);

  if (overlayStart < 0 || overlayEnd <= overlayStart) {
    throw new Error(
      "Learner experience display repair: expected experience overlay block was not found."
    );
  }

  let block = learner.slice(overlayStart, overlayEnd);

  block = block.replace(
    "{showExperienceOverlay &&\n        !ended &&\n        !experienceSubmittedRef.current && (",
    "{stage === \"learner_experience\" && !ended && ("
  );

  block = block.replace(
    "Choose the emoji that best matches your experience.",
    "Your teacher will select the emoji that best matches your experience."
  );

  const ratingGridPattern = /<div className=\\"rating-grid\\">[\\s\\S]*?<\\/div>\\s*\\n\\s*\\{savingExperienceRating &&/;
  const ratingGridReplacement = `<div className="rating-grid" aria-label="Learner experience ratings">\n              {[\n                ["😟", 1],\n                ["🙁", 2],\n                ["😐", 3],\n                ["🙂", 4],\n                ["🤩", 5],\n              ].map(([emoji, rating]) => (\n                <div\n                  key={rating}\n                  className={\`rating-button rating-display\${selectedExperienceRating === rating ? " selected" : ""}\`}\n                  role="img"\n                  aria-label={\`Rating \${rating} out of 5\`}\n                  aria-disabled="true"\n                >\n                  <span className="rating-emoji">{emoji}</span>\n                  <span className="rating-number">{rating}</span>\n                </div>\n              ))}\n            </div>\n\n            {savingExperienceRating &&`;

  if (!ratingGridPattern.test(block)) {
    throw new Error(
      "Learner experience display repair: expected rating grid was not found."
    );
  }

  block = block.replace(ratingGridPattern, ratingGridReplacement);
  block = block.replace(
    "      {showConnectionSettings",
    `      {${learnerMarker} /* ${learnerMarker} */}\n\n      {showConnectionSettings`
  );

  learner = learner.slice(0, overlayStart) + block + learner.slice(overlayEnd);

  const styleAnchor = "        .rating-emoji {";
  const displayStyle = `        .rating-display {\n          cursor: default !important;\n          pointer-events: none !important;\n          user-select: none;\n        }\n\n`;
  if (!learner.includes(".rating-display {")) {
    learner = learner.replace(styleAnchor, displayStyle + styleAnchor);
  }

  write(learnerPath, learner);
}

console.log(
  "Applied CRL learner experience UI repair: teacher controls the five emoji ratings; learner sees the same five choices as non-interactive display only."
);
