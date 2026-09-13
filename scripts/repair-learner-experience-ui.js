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

function replaceOptional(source, pattern, replacement) {
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

  const callback = `  const saveTeacherExperienceRating = useCallback(\n    async (rating) => {\n      const normalizedRating = Number(rating);\n      if (\n        experienceRatingSaving ||\n        activeStage !== "learner_experience" ||\n        !Number.isInteger(normalizedRating) ||\n        normalizedRating < 1 ||\n        normalizedRating > 5\n      ) {\n        return;\n      }\n\n      setExperienceRatingSaving(true);\n      setError("");\n\n      try {\n        const response = await fetch(\n          "/api/assessment?action=save_experience_rating",\n          {\n            method: "POST",\n            credentials: "include",\n            cache: "no-store",\n            headers: {\n              "Content-Type": "application/json",\n              Accept: "application/json",\n            },\n            body: JSON.stringify({\n              action: "save_experience_rating",\n              code,\n              learner_id: latestSessionRef.current?.learner_id || learnerId,\n              experience_rating: normalizedRating,\n            }),\n          }\n        );\n\n        const data = await response.json();\n        if (!response.ok) {\n          throw new Error(data?.error || "Unable to save the learner experience rating.");\n        }\n\n        const nextSession = {\n          ...(latestSessionRef.current || {}),\n          stage: data?.stage || "teacher_review",\n          current_content: data?.current_content || data?.currentContent || "TEACHER_REVIEW",\n          currentContent: data?.current_content || data?.currentContent || "TEACHER_REVIEW",\n          ended: false,\n          connected: true,\n          metrics: {\n            ...(latestSessionRef.current?.metrics || {}),\n            experienceRating: normalizedRating,\n            experience_rating: normalizedRating,\n          },\n          experience_rating: normalizedRating,\n          experienceRating: normalizedRating,\n        };\n\n        latestSessionRef.current = nextSession;\n        latestActiveStageRef.current = nextSession.stage;\n        setSession(nextSession);\n        setActiveStage(nextSession.stage);\n        void publishAssessmentRealtimeState(code, nextSession);\n      } catch (ratingError) {\n        setError(ratingError?.message || "Unable to save the learner experience rating.");\n      } finally {\n        setExperienceRatingSaving(false);\n      }\n    },\n    [activeStage, code, experienceRatingSaving, learnerId]\n  );\n\n  /* ${teacherMarker} */\n\n`;

  teacher = replaceOnce(
    teacher,
    /  const controlPassageTimer =/,
    callback + "  const controlPassageTimer =",
    "teacher learner-experience rating handler"
  );

  const titleHasExperience = teacher.includes('activeStage ===\n                      "learner_experience"\n                    ? "Learner Experience"');
  if (!titleHasExperience) {
    const titlePattern = /(: activeStage ===\s*"terminated"\s*\? "Terminated"\s*:\s*activeStage)\s*\n\s*}\s*\n\s*<\/h1>/;
    if (titlePattern.test(teacher)) {
      teacher = teacher.replace(
        titlePattern,
        `(: activeStage ===\n                      "terminated"\n                    ? "Terminated"\n                    : activeStage ===\n                      "learner_experience"\n                    ? "Learner Experience"\n                    : activeStage)\n                }\n                </h1>`
      );
    } else {
      const fallbackTitlePattern = /(: activeStage)\s*\n\s*}\s*\n\s*<\/h1>/;
      teacher = replaceOptional(
        teacher,
        fallbackTitlePattern,
        `(: activeStage ===\n                      "learner_experience"\n                    ? "Learner Experience"\n                    : activeStage)\n                }\n                </h1>`
      );
    }
  }

  const teacherExperiencePanel = `\n                {activeStage ===\n                  "learner_experience" && (\n                  <div\n                    style={{\n                      padding: "28px",\n                      borderRadius: "22px",\n                      background: "linear-gradient(145deg,#f8fbff,#eef6fb)",\n                      border: "1px solid #d8e6ef",\n                    }}\n                  >\n                    <div style={{fontSize:"12px",fontWeight:950,letterSpacing:"1.4px",color:"#1559a6",marginBottom:"10px"}}>LEARNER EXPERIENCE</div>\n                    <h2 style={{margin:"0 0 8px",color:"#17324d",fontSize:"28px",fontWeight:950}}>How did the assessment feel?</h2>\n                    <p style={{margin:"0 auto 24px",maxWidth:"620px",color:"#6d8498",fontSize:"15px",lineHeight:1.6}}>Select the emoji that best matches the learner's experience. The learner can see the five choices but cannot press them.</p>\n                    <div style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:"14px",maxWidth:"760px",margin:"0 auto"}}>\n                      {[\n                        ["😟", 1], ["🙁", 2], ["😐", 3], ["🙂", 4], ["🤩", 5],\n                      ].map(([emoji, rating]) => (\n                        <button\n                          key={rating}\n                          type="button"\n                          onClick={() => void saveTeacherExperienceRating(rating)}\n                          disabled={experienceRatingSaving}\n                          aria-label={\`Select rating \${rating} out of 5\`}\n                          style={{minHeight:"118px",borderRadius:"20px",border:"1px solid #d1e0eb",background:"#fff",boxShadow:"10px 12px 24px rgba(35,70,105,.12)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"10px",cursor:experienceRatingSaving?"wait":"pointer",opacity:experienceRatingSaving?0.65:1}}\n                        >\n                          <span style={{fontSize:"48px",lineHeight:1}}>{emoji}</span>\n                          <span style={{fontSize:"12px",fontWeight:900,color:"#6d8498"}}>{rating}/5</span>\n                        </button>\n                      ))}\n                    </div>\n                  </div>\n                )}\n\n`;

  if (!teacher.includes('{activeStage ===\n                  "learner_experience" && (')) {
    teacher = replaceOnce(
      teacher,
      /\n                \{activeStage ===\n                  "completed" && \(/,
      teacherExperiencePanel + '                {activeStage ===\n                  "completed" && (',
      "teacher learner-experience panel"
    );
  }

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
  const experienceTextAnchor = "How did the assessment feel?";
  const overlayStart = learner.lastIndexOf("showExperienceOverlay");
  const ratingGridStart = learner.lastIndexOf("<div className=\"rating-grid\">");
  const overlayEnd = learner.indexOf("{showConnectionSettings", ratingGridStart >= 0 ? ratingGridStart : 0);

  if (overlayStart < 0 || ratingGridStart < 0 || overlayEnd < 0 || overlayEnd <= ratingGridStart) {
    throw new Error(
      "Learner experience display repair: expected learner experience UI was not found."
    );
  }

  const blockStart = learner.lastIndexOf("<div", overlayStart);
  const block = learner.slice(blockStart, overlayEnd);

  let repaired = block;
  repaired = repaired.replace(
    /\{showExperienceOverlay\s*&&\s*!ended\s*&&\s*!experienceSubmittedRef\.current\s*&&\s*\(/,
    '{stage === "learner_experience" && !ended && ('
  );
  repaired = repaired.replace(
    /Choose the emoji that best matches your experience\./,
    "Your teacher will select the emoji that best matches your experience."
  );

  const gridPattern = /<div className="rating-grid">[\s\S]*?<\/div>\s*\{savingExperienceRating\s*&&/;
  if (!gridPattern.test(repaired)) {
    throw new Error(
      "Learner experience display repair: expected learner rating grid was not found."
    );
  }

  const gridReplacement = `<div className="rating-grid" aria-label="Learner experience ratings">\n              {[\n                ["😟", 1], ["🙁", 2], ["😐", 3], ["🙂", 4], ["🤩", 5],\n              ].map(([emoji, rating]) => (\n                <div\n                  key={rating}\n                  className={\`rating-button rating-display\${selectedExperienceRating === rating ? " selected" : ""}\`}\n                  role="img"\n                  aria-label={\`Rating \${rating} out of 5\`}\n                  aria-disabled="true"\n                >\n                  <span className="rating-emoji">{emoji}</span>\n                  <span className="rating-number">{rating}</span>\n                </div>\n              ))}\n            </div>\n\n            {savingExperienceRating &&`;

  repaired = repaired.replace(gridPattern, gridReplacement);
  repaired = repaired.replace(/<button([\\s\\S]*?rating-button[\\s\\S]*?)>/g, (match) => match.replace(/<button/, "<div").replace(/>$/, ">"));
  repaired = repaired.replace(/<\/button>/g, "</div>");

  const before = learner.slice(0, blockStart);
  const after = learner.slice(overlayEnd);
  learner = before + repaired + after;
  learner = learner.replace(
    "{showConnectionSettings",
    `{/* ${learnerMarker} */}\n\n      {showConnectionSettings`
  );

  if (!learner.includes(".rating-display {")) {
    const styleAnchor = "        .rating-emoji {";
    const displayStyle = `        .rating-display {\n          cursor: default !important;\n          pointer-events: none !important;\n          user-select: none;\n        }\n\n`;
    learner = learner.replace(styleAnchor, displayStyle + styleAnchor);
  }

  write(learnerPath, learner);
}

console.log(
  "Applied CRL learner experience UI repair: teacher controls the five emoji ratings; learner sees the same five choices as non-interactive display only."
);
