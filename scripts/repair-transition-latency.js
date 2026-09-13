const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, source) {
  fs.writeFileSync(file, source, "utf8");
}

function warn(message) {
  console.warn(`[CRL transition repair] ${message}`);
}

function patchText(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    warn(`${label}: pattern not found; leaving existing source unchanged.`);
    return source;
  }
  return next;
}

/* ========================================================================== */
/* TEACHER ASSESSMENT TRANSITION + PASSAGE TIMER                              */
/* ========================================================================== */
const teacherTarget = path.join(
  process.cwd(),
  "app",
  "teacher",
  "assessment",
  "AssessmentClient.jsx"
);

let teacherSource = read(teacherTarget);

if (!teacherSource.includes("CRL_WORD_FINAL_SAVE_OVERLAY")) {
  teacherSource = patchText(
    teacherSource,
    /const \[storySelecting, setStorySelecting\] = useState\(false\);/,
    'const [storySelecting, setStorySelecting] = useState(false);\n  const [showWordSavingOverlay, setShowWordSavingOverlay] = useState(false);\n  /* CRL_WORD_FINAL_SAVE_OVERLAY */',
    "saving overlay state"
  );

  const recordWordStart = teacherSource.indexOf("  const recordWord =");
  const recordComprehensionStart = teacherSource.indexOf(
    "  const recordComprehension =",
    recordWordStart
  );

  if (recordWordStart >= 0 && recordComprehensionStart > recordWordStart) {
    let block = teacherSource.slice(recordWordStart, recordComprehensionStart);

    if (!block.includes("setShowWordSavingOverlay(true);")) {
      const match = block.match(
        /try\s*\{\s*const data\s*=\s*await persistAnswerWithRetry\(\s*["']record_word["'],/
      );
      if (match && match.index != null) {
        block =
          block.slice(0, match.index) +
          "setShowWordSavingOverlay(true);\n\n      " +
          block.slice(match.index);
      } else {
        warn("final Word Recognition save start: target block not found.");
      }
    }

    if (!block.includes("setShowWordSavingOverlay(false);")) {
      const lastBusy = block.lastIndexOf("setBusy(false);");
      if (lastBusy >= 0) {
        const insertionPoint = lastBusy + "setBusy(false);".length;
        block =
          block.slice(0, insertionPoint) +
          "\n        setShowWordSavingOverlay(false);" +
          block.slice(insertionPoint);
      } else {
        warn("final Word Recognition save end: setBusy(false) anchor not found.");
      }
    }

    teacherSource =
      teacherSource.slice(0, recordWordStart) +
      block +
      teacherSource.slice(recordComprehensionStart);
  } else {
    warn("recordWord function could not be isolated.");
  }
}

if (!teacherSource.includes("CRL_WORD_FINAL_SAVE_OVERLAY_RENDER")) {
  const overlayAnchor = "        {reversionSelecting && reversionSourceWord && (";
  if (teacherSource.includes(overlayAnchor)) {
    const overlay = `        {/* CRL_WORD_FINAL_SAVE_OVERLAY_RENDER */}
        {showWordSavingOverlay && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 7000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px",
              background: "rgba(12,32,52,.62)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
            role="status"
            aria-live="assertive"
            aria-label="Saving assessment"
          >
            <div
              style={{
                width: "min(460px,92vw)",
                padding: "36px 30px",
                border: "1px solid #d4e2ed",
                borderRadius: "24px",
                background: "linear-gradient(145deg,#f8fbff,#eaf3f9)",
                boxShadow: "16px 18px 40px rgba(7,25,42,.28),-8px -8px 18px rgba(255,255,255,.78)",
                textAlign: "center",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: "42px",
                  height: "42px",
                  margin: "0 auto 18px",
                  border: "4px solid rgba(21,89,166,.18)",
                  borderTopColor: "#1559a6",
                  borderRadius: "50%",
                  animation: "crlAssessmentSpin .72s linear infinite",
                }}
              />
              <h2 style={{ margin: 0, color: "#193c5b", fontSize: "28px", fontWeight: "950" }}>
                Saving, please wait...
              </h2>
              <p style={{ margin: "10px 0 0", color: "#6d8498", fontSize: "14px", lineHeight: 1.6 }}>
                Saving the final Word Recognition result before opening the story passage choices.
              </p>
            </div>
          </div>
        )}

`;
    teacherSource = teacherSource.replace(overlayAnchor, overlay + overlayAnchor);
  } else {
    warn("saving overlay render: reversion overlay anchor not found.");
  }
}

/* ========================================================================== */
/* STORY SELECTION -> PASSAGE: IMMEDIATE STATE + TIMER                         */
/* ========================================================================== */
const selectStoryStart = teacherSource.indexOf("  const selectStory = useCallback(");
const controlTimerStart = teacherSource.indexOf(
  "  const controlPassageTimer =",
  selectStoryStart
);

if (selectStoryStart >= 0 && controlTimerStart > selectStoryStart) {
  let block = teacherSource.slice(selectStoryStart, controlTimerStart);

  if (!block.includes("CRL_STORY_PASSAGE_IMMEDIATE_BROADCAST")) {
    block = patchText(
      block,
      /const optimistic = \{\n\s*\.\.\.\(latestSessionRef\.current \|\| \{\}\),\n\s*\.\.\.next,\n\s*connected: true,\n\s*\};/,
      `const passageStartedAt = new Date().toISOString();
      const optimistic = {
        ...(latestSessionRef.current || {}),
        ...next,
        connected: true,
        passage_started_at: passageStartedAt,
        passageStartedAt,
        passage_paused_at: null,
        passagePausedAt: null,
        passage_paused_seconds: 0,
        passagePausedSeconds: 0,
      };`,
      "local passage timer state"
    );

    block = block.replace(
      /setActiveStage\("passage"\);/,
      `setActiveStage("passage");
      publishAssessmentState(assessmentChannelRef.current, {
        source: "teacher",
        session: optimistic,
      });
      void publishAssessmentRealtimeState(code, optimistic);
      /* CRL_STORY_PASSAGE_IMMEDIATE_BROADCAST */`
    );
  }

  teacherSource =
    teacherSource.slice(0, selectStoryStart) +
    block +
    teacherSource.slice(controlTimerStart);
} else {
  warn("story selection function could not be isolated.");
}

/* ========================================================================== */
/* FIRST COMPREHENSION QUESTION: SAME-DEVICE BROADCAST                        */
/* ========================================================================== */
const finishPassageStart = teacherSource.indexOf("  const finishPassageReading =");
const removeMiscueStart = teacherSource.indexOf(
  "  const removePassageMiscue =",
  finishPassageStart
);

if (finishPassageStart >= 0 && removeMiscueStart > finishPassageStart) {
  let block = teacherSource.slice(finishPassageStart, removeMiscueStart);
  if (!block.includes("CRL_FIRST_COMPREHENSION_BROADCAST")) {
    block = block.replace(
      /setActiveStage\("comprehension"\);\n\s*void publishAssessmentRealtimeState\(code, nextSession\);/,
      `setActiveStage("comprehension");
          /* CRL_FIRST_COMPREHENSION_BROADCAST */
          publishAssessmentState(assessmentChannelRef.current, {
            source: "teacher",
            session: nextSession,
          });
          void publishAssessmentRealtimeState(code, nextSession);`
    );
  }
  teacherSource =
    teacherSource.slice(0, finishPassageStart) +
    block +
    teacherSource.slice(removeMiscueStart);
} else {
  warn("finishPassageReading function could not be isolated.");
}

write(teacherTarget, teacherSource);

/* ========================================================================== */
/* ROUTE: AUTHORITATIVE PASSAGE TIMER START                                  */
/* ========================================================================== */
const routeTarget = path.join(
  process.cwd(),
  "app",
  "api",
  "assessment",
  "route.js"
);
let routeSource = read(routeTarget);

if (!routeSource.includes("CRL_STORY_SELECTION_TIMER_START")) {
  const selectStoryStartRoute = routeSource.indexOf('    if (action === "select_story") {');
  const passageReadyStart = routeSource.indexOf(
    '    if (action === "passage_ready") {',
    selectStoryStartRoute
  );

  if (selectStoryStartRoute >= 0 && passageReadyStart > selectStoryStartRoute) {
    let block = routeSource.slice(selectStoryStartRoute, passageReadyStart);
    block = block.replace(
      /passageStartedAt:\s*null,\n\s*passagePausedAt:\s*null,\n\s*passagePausedSeconds:\s*0,/,
      `passageStartedAt: new Date(),
          passagePausedAt: null,
          passagePausedSeconds: 0,`
    );
    block = block.replace(
      /if \(action === "select_story"\) \{/,
      `/* CRL_STORY_SELECTION_TIMER_START */
    if (action === "select_story") {`
    );
    routeSource =
      routeSource.slice(0, selectStoryStartRoute) +
      block +
      routeSource.slice(passageReadyStart);
  } else {
    warn("route select_story block could not be isolated.");
  }
}

write(routeTarget, routeSource);

/* ========================================================================== */
/* LEARNER: FAST FALLBACK FOR LIVE STORY/PASSAGE/COMPREHENSION STAGES          */
/* ========================================================================== */
const learnerTarget = path.join(
  process.cwd(),
  "app",
  "learner",
  "LearnerAssessmentPage.jsx"
);
let learnerSource = read(learnerTarget);

if (!learnerSource.includes("CRL_LIVE_STAGE_FAST_FALLBACK")) {
  learnerSource = learnerSource.replace(
    /const fastLiveStage =\n\s*liveStage === "letter" \|\|\n\s*liveStage === "word";/,
    `const fastLiveStage =
        liveStage === "letter" ||
        liveStage === "word" ||
        liveStage === "story_choice" ||
        liveStage === "passage" ||
        liveStage === "comprehension";
      /* CRL_LIVE_STAGE_FAST_FALLBACK */`
  );
}

write(learnerTarget, learnerSource);

console.log(
  "Applied CRL transition/timer repair: safe final-word save overlay, immediate story broadcast, authoritative passage timer start, fast learner fallback, and immediate first comprehension broadcast."
);
