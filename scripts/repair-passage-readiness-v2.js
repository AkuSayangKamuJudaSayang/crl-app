const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(file, "utf8");
const write = (file, source) => fs.writeFileSync(file, source, "utf8");

function warn(label) {
  console.warn(`[CRL passage readiness] ${label}`);
}

function addOnce(source, anchor, text, label) {
  if (source.includes(text.trim())) return source;
  const index = source.indexOf(anchor);
  if (index < 0) {
    warn(`${label}: anchor not found.`);
    return source;
  }
  return source.slice(0, index) + text + source.slice(index);
}

function replaceOnce(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) warn(`${label}: target not found.`);
  return next;
}

const teacherPath = path.join(process.cwd(), "app", "teacher", "assessment", "AssessmentClient.jsx");
let teacher = read(teacherPath);

/*
 * Keep the build-time repair idempotent. A previous local `npm run dev` or
 * `npm run build` may already have materialized the final Word overlay state
 * in AssessmentClient.jsx. In that case, do not inject a second declaration.
 */
const wordSavingOverlayState = '  const [showWordSavingOverlay, setShowWordSavingOverlay] = useState(false);';
const wordSavingOverlayMarker = '/* CRL_WORD_FINAL_SAVE_OVERLAY_V2 */';
if (!teacher.includes("CRL_WORD_FINAL_SAVE_OVERLAY_V2")) {
  teacher = replaceOnce(
    teacher,
    /const \[storySelecting, setStorySelecting\] = useState\(false\);/,
    `const [storySelecting, setStorySelecting] = useState(false);\n${wordSavingOverlayState}\n  ${wordSavingOverlayMarker}`,
    "teacher save overlay state"
  );
} else if (!teacher.includes(wordSavingOverlayState)) {
  teacher = replaceOnce(
    teacher,
    /const \[storySelecting, setStorySelecting\] = useState\(false\);/,
    `const [storySelecting, setStorySelecting] = useState(false);\n${wordSavingOverlayState}`,
    "teacher save overlay state recovery"
  );
}

const rwStart = teacher.indexOf("  const recordWord =");
const rcStart = teacher.indexOf("  const recordComprehension =", rwStart);
if (rwStart >= 0 && rcStart > rwStart) {
  let block = teacher.slice(rwStart, rcStart);
  if (!block.includes("setShowWordSavingOverlay(true);")) {
    const match = block.match(/try\s*\{\s*const data\s*=\s*await persistAnswerWithRetry\(\s*[\"']record_word[\"'],/);
    if (match && match.index != null) {
      block = block.slice(0, match.index) + "setShowWordSavingOverlay(true);\n\n      " + block.slice(match.index);
    }
  }
  if (!block.includes("setShowWordSavingOverlay(false);")) {
    const end = block.lastIndexOf("setBusy(false);");
    if (end >= 0) {
      const p = end + "setBusy(false);".length;
      block = block.slice(0, p) + "\n        setShowWordSavingOverlay(false);" + block.slice(p);
    }
  }
  teacher = teacher.slice(0, rwStart) + block + teacher.slice(rcStart);
}

const overlayAnchor = "        {reversionSelecting && reversionSourceWord && (";
const overlayText = [
  "        {/* CRL_WORD_FINAL_SAVE_OVERLAY_RENDER_V2 */}",
  "        {showWordSavingOverlay && (",
  "          <div style={{position:\"fixed\",inset:0,zIndex:7000,display:\"flex\",alignItems:\"center\",justifyContent:\"center\",padding:\"24px\",background:\"rgba(12,32,52,.62)\",backdropFilter:\"blur(10px)\"}} role=\"status\" aria-live=\"assertive\" aria-label=\"Saving assessment\">",
  "            <div style={{width:\"min(460px,92vw)\",padding:\"36px 30px\",border:\"1px solid #d4e2ed\",borderRadius:\"24px\",background:\"linear-gradient(145deg,#f8fbff,#eaf3f9)\",textAlign:\"center\",boxShadow:\"16px 18px 40px rgba(7,25,42,.28)\"}}>",
  "              <div aria-hidden=\"true\" style={{width:\"42px\",height:\"42px\",margin:\"0 auto 18px\",border:\"4px solid rgba(21,89,166,.18)\",borderTopColor:\"#1559a6\",borderRadius:\"50%\",animation:\"crlAssessmentSpin .72s linear infinite\"}} />",
  "              <h2 style={{margin:0,color:\"#193c5b\",fontSize:\"28px\",fontWeight:950}}>Saving, please wait...</h2>",
  "              <p style={{margin:\"10px 0 0\",color:\"#6d8498\",fontSize:\"14px\",lineHeight:1.6}}>Saving the final Word Recognition result before opening the story passage choices.</p>",
  "            </div>",
  "          </div>",
  "        )}",
  "\n",
].join("\n");
teacher = addOnce(teacher, overlayAnchor, overlayText, "teacher saving overlay render");

const ssStart = teacher.indexOf("  const selectStory = useCallback(");
const ctStart = teacher.indexOf("  const controlPassageTimer =", ssStart);
if (ssStart >= 0 && ctStart > ssStart) {
  let block = teacher.slice(ssStart, ctStart);
  if (!block.includes("CRL_STORY_PASSAGE_IMMEDIATE_BROADCAST_V2")) {
    block = replaceOnce(
      block,
      /setActiveStage\("passage"\);\s*try \{/,
      'setActiveStage("passage");\n      publishAssessmentState(assessmentChannelRef.current, { source: "teacher", session: optimistic });\n      void publishAssessmentRealtimeState(code, optimistic);\n      /* CRL_STORY_PASSAGE_IMMEDIATE_BROADCAST_V2 */\n\n      try {',
      "teacher immediate passage broadcast"
    );
  }
  teacher = teacher.slice(0, ssStart) + block + teacher.slice(ctStart);
}

const fpStart = teacher.indexOf("  const finishPassageReading =");
const rmStart = teacher.indexOf("  const removePassageMiscue =", fpStart);
if (fpStart >= 0 && rmStart > fpStart) {
  let block = teacher.slice(fpStart, rmStart);
  if (!block.includes("CRL_FIRST_COMPREHENSION_BROADCAST_V2")) {
    block = replaceOnce(
      block,
      /setActiveStage\("comprehension"\);\s*void publishAssessmentRealtimeState\(code, nextSession\);/,
      'setActiveStage("comprehension");\n          /* CRL_FIRST_COMPREHENSION_BROADCAST_V2 */\n          publishAssessmentState(assessmentChannelRef.current, { source: "teacher", session: nextSession });\n          void publishAssessmentRealtimeState(code, nextSession);',
      "teacher first comprehension broadcast"
    );
  }
  teacher = teacher.slice(0, fpStart) + block + teacher.slice(rmStart);
}
write(teacherPath, teacher);

const learnerPath = path.join(process.cwd(), "app", "learner", "LearnerAssessmentPage.jsx");
let learner = read(learnerPath);

const helperAnchor = "function getLearnerStories(session) {";
const helperText = [
  "function getSessionStoryText(session) {",
  "  const title = String(session?.story_title ?? session?.storyTitle ?? \"\").trim().toLowerCase();",
  "  if (!title) return \"\";",
  "  const stories = Array.isArray(session?.story_choices) ? session.story_choices : Array.isArray(session?.assessment_content?.stories) ? session.assessment_content.stories : STORIES;",
  "  const match = stories.find((story) => String(story?.title || \"\").trim().toLowerCase() === title);",
  "  return String(match?.text || \"\").trim();",
  "}",
  "",
  "function isStoryChoicePlaceholder(value) {",
  "  const text = String(value || \"\").trim();",
  "  return !text || /choose\\s+a\\s+story\\s+passage|teacher\\s+will\\s+select\\s+it/i.test(text);",
  "}",
  "",
].join("\n");
learner = addOnce(learner, helperAnchor, helperText, "learner story helper");

learner = replaceOnce(
  learner,
  /const next = source === "broadcast" \? \{\s*\.\.\.\(current \|\| \{\}\), \.\.\.incoming \} : mergeLearnerSession\(incoming, current\);/,
  'let next = source === "broadcast" ? { ...(current || {}), ...incoming } : mergeLearnerSession(incoming, current);\n    if (String(next.stage || "") === "passage" && isStoryChoicePlaceholder(next.current_content ?? next.currentContent)) {\n      const resolvedPassage = getSessionStoryText(next);\n      if (resolvedPassage) next = { ...next, current_content: resolvedPassage, currentContent: resolvedPassage };\n    }',
  "learner passage placeholder normalization"
);

learner = replaceOnce(
  learner,
  /\n    if \(\n      normalizedStage === "passage" &&\n      !next\.passage_started_at &&\n      !next\.passageStartedAt\n    \) \{[\s\S]*?\n    \}\n\n    setSession\(next\);/,
  "\n    setSession(next);",
  "learner immediate passage_ready removal"
);

learner = replaceOnce(
  learner,
  /const fastLiveStage =\n\s*liveStage === "letter" \|\|\n\s*liveStage === "word";/,
  'const fastLiveStage =\n        liveStage === "letter" ||\n        liveStage === "word" ||\n        liveStage === "story_choice" ||\n        liveStage === "passage" ||\n        liveStage === "comprehension";\n      /* CRL_LIVE_STAGE_FAST_FALLBACK_V2 */',
  "learner fast polling"
);

learner = addOnce(
  learner,
  "  const displayLiveContent =",
  [
    "  const resolvedPassageText =",
    '    stage === "passage"',
    "      ? (!isStoryChoicePlaceholder(liveContent) ? liveContent : getSessionStoryText(session))",
    '      : "";',
    "",
  ].join("\n"),
  "learner resolved passage text"
);

learner = replaceOnce(
  learner,
  /const displayLiveContent =\n\s*liveContent \|\|\n\s*\([\s\S]*?\n\s*\);/,
  [
    "const displayLiveContent =",
    "    liveContent ||",
    "    (",
    '      stage === "letter"',
    "        ? LETTERS[0]",
    "        : stage === \"word\"",
    "          ? WORDS[0]",
    '          : stage === "passage"',
    "            ? resolvedPassageText",
    '            : stage === "comprehension"',
    "              ? (typeof currentQuestions[0] === \"string\" ? currentQuestions[0] : currentQuestions[0]?.text || \"\")",
    '              : ""',
    "    );",
  ].join("\n"),
  "learner display fallback"
);

const timerEffectLines = [
  '  useEffect(() => {',
  '    if (!joined || completed || ended || stage !== "passage" || !resolvedPassageText) return undefined;',
  '    const current = sessionRef.current || session;',
  '    const code = normalizeCode(codeInput || current?.code);',
  '    if (!code || current?.passage_started_at || current?.passageStartedAt) return undefined;',
  '    const readyKey = String(code) + ":passage:" + String(current?.story_title || current?.storyTitle || "");',
  '    if (passageReadyKeyRef.current === readyKey) return undefined;',
  '    passageReadyKeyRef.current = readyKey;',
  '    let cancelled = false;',
  '    let frame1 = 0;',
  '    let frame2 = 0;',
  '    frame1 = window.requestAnimationFrame(() => {',
  '      frame2 = window.requestAnimationFrame(() => {',
  '        if (cancelled) return;',
  '        void fetch("/api/assessment?action=passage_ready", {',
  '          method: "POST", credentials: "include", cache: "no-store",',
  '          headers: { "Content-Type": "application/json", Accept: "application/json" },',
  '          body: JSON.stringify({ action: "passage_ready", code }),',
  '        }).then(async (response) => {',
  '          if (!response.ok || cancelled) return;',
  '          const data = await response.json().catch(() => null);',
  '          if (!data?.passage_started_at) return;',
  '          setSession((currentSession) => {',
  '            if (!currentSession) return currentSession;',
  '            const nextSession = { ...currentSession, passage_started_at: data.passage_started_at, passageStartedAt: data.passage_started_at, passage_paused_at: data.passage_paused_at, passagePausedAt: data.passage_paused_at, passage_paused_seconds: data.passage_paused_seconds, passagePausedSeconds: data.passage_paused_seconds };',
  '            sessionRef.current = nextSession;',
  '            return nextSession;',
  '          });',
  '        }).catch(() => {});',
  '      });',
  '    });',
  '    return () => { cancelled = true; if (frame1) window.cancelAnimationFrame(frame1); if (frame2) window.cancelAnimationFrame(frame2); };',
  '  }, [joined, completed, ended, stage, resolvedPassageText, codeInput, session]);',
  '',
].join("\n");
learner = addOnce(
  learner,
  "  useEffect(() => {\n    if (wordReadyRetryTimerRef.current)",
  timerEffectLines,
  "learner rendered-passage timer handshake"
);

learner = replaceOnce(
  learner,
  /\{stage ===\n\s*"passage" && \([\s\S]*?\n\s*\)\}/,
  [
    '{stage ===',
    '                    "passage" && (',
    '                    <div>',
    '                      <div className="passage-title">',
    '                        {session?.story_title || selectedStory.title}',
    '                      </div>',
    '                      {resolvedPassageText ? (',
    '                        <div className="passage">',
    '                          {resolvedPassageText.split(/\\s+/).filter(Boolean).join(" ")}',
    '                        </div>',
    '                      ) : (',
    '                        <div className="passage" role="status" aria-live="polite">',
    '                          <div style={{textAlign:"center",width:"100%",color:"#71869a",fontSize:"18px",fontWeight:800}}>',
    '                            Loading story passage...',
    '                          </div>',
    '                        </div>',
    '                      )}',
    '                    </div>',
    '                  )}',
  ].join("\n"),
  "learner passage renderer"
);

write(learnerPath, learner);
console.log("Applied CRL passage readiness v2: placeholder-safe display, post-render timer handshake, and fast story/passsage/comprehension fallback.");
