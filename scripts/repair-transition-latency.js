const fs = require("node:fs");
const path = require("node:path");

function replaceOnce(source, oldValue, newValue, label) {
  const count = source.split(oldValue).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly 1 match, found ${count}`);
  }
  return source.replace(oldValue, newValue);
}

/* ========================================================================== */
/* ASSESSMENT TRANSITION + REALTIME LATENCY REPAIR                            */
/* ========================================================================== */
const teacherTarget = path.join(
  process.cwd(),
  "app",
  "teacher",
  "assessment",
  "AssessmentClient.jsx"
);
const teacherMarker = "CRL_TRANSITION_LATENCY_REPAIR";
let teacherSource = fs.readFileSync(teacherTarget, "utf8");

if (!teacherSource.includes(teacherMarker)) {
  let patched = teacherSource;

  /*
   * Move the teacher to Story Choice immediately when the final Word
   * Recognition answer is submitted. The authoritative save still runs, but
   * the old word is never rendered again while that request is in flight.
   */
  patched = replaceOnce(
    patched,
    "      try {\n        const data = await persistAnswerWithRetry(\n          \"record_word\",",
    "      const optimisticStorySession = {\n        ...(latestSessionRef.current || {}),\n        code,\n        stage: \"story_choice\",\n        current_content: \"\",\n        currentContent: \"\",\n        connected: true,\n      };\n      latestSessionRef.current = optimisticStorySession;\n      latestActiveStageRef.current = \"story_choice\";\n      latestSessionVersionRef.current = Date.now();\n      setSession(optimisticStorySession);\n      setActiveStage(\"story_choice\");\n      publishAssessmentState(assessmentChannelRef.current, {\n        source: \"teacher\",\n        session: optimisticStorySession,\n      });\n      void publishAssessmentRealtimeState(code, optimisticStorySession);\n\n      try {\n        const data = await persistAnswerWithRetry(\n          \"record_word\",",
    "Final Word -> Story Choice optimistic transition"
  );

  /*
   * Publish the selected passage before waiting for the select_story database
   * request. This warms the Supabase Realtime publisher and sends the learner
   * the passage immediately instead of making the learner wait for the API
   * request to finish first.
   */
  patched = replaceOnce(
    patched,
    "      latestSessionRef.current = optimistic;\n      latestActiveStageRef.current = \"passage\";\n      latestSessionVersionRef.current = Date.now();\n      setSession(optimistic);\n      setActiveStage(\"passage\");\n\n      try {",
    "      latestSessionRef.current = optimistic;\n      latestActiveStageRef.current = \"passage\";\n      latestSessionVersionRef.current = Date.now();\n      setSession(optimistic);\n      setActiveStage(\"passage\");\n      publishAssessmentState(assessmentChannelRef.current, {\n        source: \"teacher\",\n        session: optimistic,\n      });\n      void publishAssessmentRealtimeState(code, optimistic);\n\n      try {",
    "Immediate story passage realtime"
  );

  /*
   * Broadcast the first comprehension question locally as well as through
   * Supabase. This keeps same-device sessions instant and allows the warmed
   * Supabase publisher from Story Choice to carry the cross-device update.
   */
  patched = replaceOnce(
    patched,
    "          setQuestionIndex(0);\n          setSession(nextSession);\n          setActiveStage(\"comprehension\");\n          void publishAssessmentRealtimeState(code, nextSession);",
    "          setQuestionIndex(0);\n          setSession(nextSession);\n          setActiveStage(\"comprehension\");\n          publishAssessmentState(assessmentChannelRef.current, {\n            source: \"teacher\",\n            session: nextSession,\n          });\n          void publishAssessmentRealtimeState(code, nextSession);",
    "Immediate first comprehension realtime"
  );

  const markerAnchor = "{/* CRL_MISCUE_MARKING_REPAIR */}";
  if (!patched.includes(markerAnchor)) {
    throw new Error(
      "Existing CRL miscue repair marker was not found; refusing to patch an unexpected teacher assessment client."
    );
  }

  patched = patched.replace(
    markerAnchor,
    "{/* CRL_MISCUE_MARKING_REPAIR CRL_TRANSITION_LATENCY_REPAIR */}"
  );

  fs.writeFileSync(teacherTarget, patched, "utf8");
  console.log(
    "Applied CRL transition/realtime repair: instant final-word Story Choice, immediate story passage broadcast, and immediate first comprehension broadcast."
  );
}

/* ========================================================================== */
/* LEARNER REALTIME FALLBACK                                                   */
/* ========================================================================== */
const learnerTarget = path.join(
  process.cwd(),
  "app",
  "learner",
  "LearnerAssessmentPage.jsx"
);
const learnerMarker = "CRL_TRANSITION_LATENCY_LEARNER_FALLBACK";
let learnerSource = fs.readFileSync(learnerTarget, "utf8");

if (!learnerSource.includes(learnerMarker)) {
  let patched = learnerSource;

  patched = replaceOnce(
    patched,
    "      const fastLiveStage =\n        liveStage === \"letter\" ||\n        liveStage === \"word\";\n\n      const delay =\n        document.hidden\n          ? 3000\n          : fastLiveStage\n            ? 250\n            : 1000;",
    "      const fastLiveStage =\n        liveStage === \"letter\" ||\n        liveStage === \"word\" ||\n        liveStage === \"story_choice\" ||\n        liveStage === \"passage\" ||\n        liveStage === \"comprehension\";\n\n      const delay =\n        document.hidden\n          ? 3000\n          : fastLiveStage\n            ? 250\n            : 1000;",
    "Learner active-stage fallback polling"
  );

  const learnerMarkerAnchor = "  // Cross-device realtime subscription is primary; polling is a fallback.";
  if (!patched.includes(learnerMarkerAnchor)) {
    throw new Error(
      "Learner realtime fallback anchor was not found; refusing to patch an unexpected learner client."
    );
  }

  patched = patched.replace(
    learnerMarkerAnchor,
    `  /* ${learnerMarker} */\n${learnerMarkerAnchor}`
  );

  fs.writeFileSync(learnerTarget, patched, "utf8");
  console.log(
    "Applied CRL learner transition fallback: 250ms polling for Story Choice, Passage, and Comprehension stages when Realtime is unavailable."
  );
}
