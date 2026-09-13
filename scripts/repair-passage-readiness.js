const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, source) {
  fs.writeFileSync(file, source, "utf8");
}

function warn(label) {
  console.warn(`[CRL passage readiness] ${label}`);
}

function insertOnce(source, anchor, insertion, label, position = "before") {
  if (source.includes(insertion.trim())) return source;
  const index = source.indexOf(anchor);
  if (index < 0) {
    warn(`${label}: anchor not found; leaving source unchanged.`);
    return source;
  }
  if (position === "after") {
    const point = index + anchor.length;
    return source.slice(0, point) + insertion + source.slice(point);
  }
  return source.slice(0, index) + insertion + source.slice(index);
}

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const next = source.replace(search, replacement);
  if (next === source) {
    warn(`${label}: target not found; leaving source unchanged.`);
    return source;
  }
  return next;
}

/* ========================================================================== */
/* TEACHER: FINAL WORD SAVE OVERLAY + IMMEDIATE STATE BROADCAST                */
/* ========================================================================== */
const teacherFile = path.join(
  process.cwd(),
  "app",
  "teacher",
  "assessment",
  "AssessmentClient.jsx"
);
let teacher = read(teacherFile);

teacher = replaceOnce(
  teacher,
  /const \[storySelecting, setStorySelecting\] = useState\(false\);/,
  'const [storySelecting, setStorySelecting] = useState(false);\n  const [showWordSavingOverlay, setShowWordSavingOverlay] = useState(false);\n  /* CRL_WORD_FINAL_SAVE_OVERLAY */',
  "teacher save overlay state"
);

const recordWordStart = teacher.indexOf("  const recordWord =");
const recordComprehensionStart = teacher.indexOf(
  "  const recordComprehension =",
  recordWordStart
);
if (recordWordStart >= 0 && recordComprehensionStart > recordWordStart) {
  let block = teacher.slice(recordWordStart, recordComprehensionStart);
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
      warn("teacher final Word save start anchor not found.");
    }
  }
  if (!block.includes("setShowWordSavingOverlay(false);")) {
    const endPoint = block.lastIndexOf("setBusy(false);");
    if (endPoint >= 0) {
      const insertionPoint = endPoint + "setBusy(false);".length;
      block =
        block.slice(0, insertionPoint) +
        "\n        setShowWordSavingOverlay(false);" +
        block.slice(insertionPoint);
    } else {
      warn("teacher final Word save end anchor not found.");
    }
  }
  teacher =
    teacher.slice(0, recordWordStart) +
    block +
    teacher.slice(recordComprehensionStart);
} else {
  warn("teacher recordWord block could not be isolated.");
}

teacher = insertOnce(
  teacher,
  "        {reversionSelecting && reversionSourceWord && (",
  `        {/* CRL_WORD_FINAL_SAVE_OVERLAY_RENDER */}
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
            <div style={{
              width: "min(460px,92vw)",
              padding: "36px 30px",
              border: "1px solid #d4e2ed",
              borderRadius: "24px",
              background: "linear-gradient(145deg,#f8fbff,#eaf3f9)",
              boxShadow: "16px 18px 40px rgba(7,25,42,.28),-8px -8px 18px rgba(255,255,255,.78)",
              textAlign: "center",
            }}>
              <div aria-hidden="true" style={{
                width: "42px",
                height: "42px",
                margin: "0 auto 18px",
                border: "4px solid rgba(21,89,166,.18)",
                borderTopColor: "#1559a6",
                borderRadius: "50%",
                animation: "crlAssessmentSpin .72s linear infinite",
              }} />
              <h2 style={{ margin: 0, color: "#193c5b", fontSize: "28px", fontWeight: "950" }}>
                Saving, please wait...
              </h2>
              <p style={{ margin: "10px 0 0", color: "#6d8498", fontSize: "14px", lineHeight: 1.6 }}>
                Saving the final Word Recognition result before opening the story passage choices.
              </p>
            </div>
          </div>
        )}

`,
  "teacher saving overlay render"
);

const selectStoryStart = teacher.indexOf("  const selectStory = useCallback(");
const controlTimerStart = teacher.indexOf(
  "  const controlPassageTimer =",
  selectStoryStart
);
if (selectStoryStart >= 0 && controlTimerStart > selectStoryStart) {
  let block = teacher.slice(selectStoryStart, controlTimerStart);
  block = replaceOnce(
    block,
    /setActiveStage\("passage"\);\n\s*\n\s*try \{/,
    `setActiveStage("passage");
      publishAssessmentState(assessmentChannelRef.current, {
        source: "teacher",
        session: optimistic,
      });
      void publishAssessmentRealtimeState(code, optimistic);
      /* CRL_STORY_PASSAGE_IMMEDIATE_BROADCAST */

      try {`,
    "teacher immediate passage broadcast"
  );
  teacher =
    teacher.slice(0, selectStoryStart) +
    block +
    teacher.slice(controlTimerStart);
} else {
  warn("teacher selectStory block could not be isolated.");
}

const finishPassageStart = teacher.indexOf("  const finishPassageReading =");
const removeMiscueStart = teacher.indexOf(
  "  const removePassageMiscue =",
  finishPassageStart
);
if (finishPassageStart >= 0 && removeMiscueStart > finishPassageStart) {
  let block = teacher.slice(finishPassageStart, removeMiscueStart);
  block = replaceOnce(
    block,
    /setActiveStage\("comprehension"\);\n\s*void publishAssessmentRealtimeState\(code, nextSession\);/,
    `setActiveStage("comprehension");
          /* CRL_FIRST_COMPREHENSION_BROADCAST */
          publishAssessmentState(assessmentChannelRef.current, {
            source: "teacher",
            session: nextSession,
          });
          void publishAssessmentRealtimeState(code, nextSession);`,
    "teacher first comprehension broadcast"
  );
  teacher =
    teacher.slice(0, finishPassageStart) +
    block +
    teacher.slice(removeMiscueStart);
}

write(teacherFile, teacher);

/* ========================================================================== */
/* LEARNER: RESOLVE STORY CONTENT BEFORE DISPLAY/TIMER START                   */
/* ========================================================================== */
const learnerFile = path.join(
  process.cwd(),
  "app",
  "learner",
  "LearnerAssessmentPage.jsx"
);
let learner = read(learnerFile);

const helperAnchor = "function getLearnerStories(session) {";
learner = insertOnce(
  learner,
  helperAnchor,
  `function getSessionStoryText(session) {
  const title = String(session?.story_title ?? session?.storyTitle ?? "").trim().toLowerCase();
  if (!title) return "";

  const stories = Array.isArray(session?.story_choices)
    ? session.story_choices
    : Array.isArray(session?.assessment_content?.stories)
      ? session.assessment_content.stories
      : STORIES;

  const match = stories.find((story) =>
    String(story?.title || "").trim().toLowerCase() === title
  );

  return String(match?.text || "").trim();
}

function isStoryChoicePlaceholder(value) {
  const text = String(value || "").trim();
  return !text || /choose\s+a\s+story\s+passage|teacher\s+will\s+select\s+it/i.test(text);
}

`,
  "learner story-content helper"
);

/* Normalize a passage session so a stale Story Choice instruction can never
 * become the visible passage. The actual story text is recovered from the
 * story choices already sent to the learner. */
learner = replaceOnce(
  learner,
  /const next = source === "broadcast" \? \{ \n?\(current \|\| \{\}\), \.\.\.incoming \} : mergeLearnerSession\(incoming, current\);/,
  `let next = source === "broadcast" ? { ...(current || {}), ...incoming } : mergeLearnerSession(incoming, current);
    if (String(next.stage || "") === "passage" && isStoryChoicePlaceholder(next.current_content ?? next.currentContent)) {
      const resolvedPassage = getSessionStoryText(next);
      if (resolvedPassage) {
        next = {
          ...next,
          current_content: resolvedPassage,
          currentContent: resolvedPassage,
        };
      }
    }`,
  "learner passage placeholder normalization"
);

/* Stop triggering passage_ready from the stale placeholder path. The real
 * readiness effect below owns the timer handshake after the passage text has
 * been rendered. */
const oldReadyBlock = /\n    if \(\n      normalizedStage === "passage" &&\n      !next\.passage_started_at &&\n      !next\.passageStartedAt\n    \) \{[\s\S]*?\n    \}\n\n    setSession\(next\);/;
learner = replaceOnce(
  learner,
  oldReadyBlock,
  `
    setSession(next);`,
  "learner early passage_ready handshake removal"
);

/* Poll Story Choice, Passage and Comprehension rapidly as a fallback while
 * realtime is connecting. This preserves the existing faster Part 1 sync. */
learner = replaceOnce(
  learner,
  /const fastLiveStage =\n\s*liveStage === "letter" \|\|\n\s*liveStage === "word";/,
  `const fastLiveStage =
        liveStage === "letter" ||
        liveStage === "word" ||
        liveStage === "story_choice" ||
        liveStage === "passage" ||
        liveStage === "comprehension";
      /* CRL_LIVE_STAGE_FAST_FALLBACK */`,
  "learner fast stage fallback"
);

/* Resolve the text used by the visible passage and never fall back to the
 * Story Choice instruction or to a hard-coded passage before the selected
 * story is actually known. */
learner = insertOnce(
  learner,
  "  const displayLiveContent =",
  `  const resolvedPassageText =
    stage === "passage"
      ? (
          !isStoryChoicePlaceholder(liveContent)
            ? liveContent
            : getSessionStoryText(session)
        )
      : "";

`,
  "learner resolved passage text"
);

learner = replaceOnce(
  learner,
  /const displayLiveContent =\n\s*liveContent \|\|\n\s*\(\n\s*stage === "letter"[\s\S]*?\n\s*\);/,
  `const displayLiveContent =
    liveContent ||
    (
      stage === "letter"
        ? LETTERS[0]
        : stage === "word"
          ? WORDS[0]
          : stage === "passage"
            ? resolvedPassageText
            : stage === "comprehension"
              ? (
                  typeof currentQuestions[0] === "string"
                    ? currentQuestions[0]
                    : currentQuestions[0]?.text || ""
                )
              : ""
    );`,
  "learner display content fallback"
);

/* Timer handshake: only tell the server the passage is ready after the actual
 * selected passage text is in state and has had two animation frames to paint.
 * The server then stamps passageStartedAt exactly once. */
learner = insertOnce(
  learner,
  "  useEffect(() => {\n    if (wordReadyRetryTimerRef.current)",
  `  useEffect(() => {
    if (!joined || completed || ended || stage !== "passage" || !resolvedPassageText) {
      return undefined;
    }

    const current = sessionRef.current || session;
    const code = normalizeCode(codeInput || current?.code);
    if (!code || current?.passage_started_at || current?.passageStartedAt) {
      return undefined;
    }

    const readyKey = `${code}:passage:${current?.story_title || current?.storyTitle || ""}`;
    if (passageReadyKeyRef.current === readyKey) return undefined;
    passageReadyKeyRef.current = readyKey;

    let cancelled = false;
    let frame1 = 0;
    let frame2 = 0;
    frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => {
        if (cancelled) return;
        void fetch("/api/assessment?action=passage_ready", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ action: "passage_ready", code }),
        }).then(async (response) => {
          if (!response.ok || cancelled) return;
          const data = await response.json().catch(() => null);
          if (!data) return;
          const startedAt = data.passage_started_at;
          if (!startedAt) return;
          setSession((currentSession) => {
            if (!currentSession) return currentSession;
            const nextSession = {
              ...currentSession,
              passage_started_at: startedAt,
              passageStartedAt: startedAt,
              passage_paused_at: data.passage_paused_at,
              passagePausedAt: data.passage_paused_at,
              passage_paused_seconds: data.passage_paused_seconds,
              passagePausedSeconds: data.passage_paused_seconds,
            };
            sessionRef.current = nextSession;
            return nextSession;
          });
        }).catch(() => {});
      });
    });

    return () => {
      cancelled = true;
      if (frame1) window.cancelAnimationFrame(frame1);
      if (frame2) window.cancelAnimationFrame(frame2);
    };
  }, [joined, completed, ended, stage, resolvedPassageText, codeInput, session]);

`,
  "learner passage timer handshake"
);

/* Replace the passage renderer so it shows a clean loading state until real
 * story text exists, never the Story Choice instruction. */
learner = replaceOnce(
  learner,
  /\{stage ===\n\s*"passage" && \(\n\s*<div>\n\s*<div\n\s*className="passage-title"\n\s*>[\s\S]*?<\/div>\n\n\s*<div className="passage">\n\s*\{passageWords\.join\(\n\s*" "\n\s*\)\}\n\s*<\/div>\n\s*<\/div>\n\s*\)\}/,
  `{stage ===
                    "passage" && (
                    <div>
                      <div className="passage-title">
                        {session?.story_title || selectedStory.title}
                      </div>

                      {resolvedPassageText ? (
                        <div className="passage">
                          {resolvedPassageText.split(/\\s+/).filter(Boolean).join(" ")}
                        </div>
                      ) : (
                        <div className="passage" aria-live="polite" role="status">
                          <div style={{ textAlign: "center", width: "100%", color: "#71869a", fontSize: "18px", fontWeight: 800 }}>
                            Loading story passage...
                          </div>
                        </div>
                      )}
                    </div>
                  )}`,
  "learner passage loading renderer"
);

write(learnerFile, learner);

console.log(
  "Applied CRL passage readiness repair: placeholder-safe passage display, post-render timer handshake, faster fallback polling, and preserved teacher transition synchronization."
);
