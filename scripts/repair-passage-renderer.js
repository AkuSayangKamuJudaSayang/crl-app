const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(file, "utf8");
const write = (file, source) => fs.writeFileSync(file, source, "utf8");

function warn(label) {
  console.warn(`[CRL live passage repair] ${label}`);
}

function once(source, search, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const next = source.replace(search, replacement);
  if (next === source) warn(`${label}: target not found; leaving source unchanged.`);
  return next;
}

function addOnce(source, anchor, insertion, label, position = "before") {
  if (source.includes(insertion.trim())) return source;
  const index = source.indexOf(anchor);
  if (index < 0) {
    warn(`${label}: anchor not found; leaving source unchanged.`);
    return source;
  }
  const at = position === "after" ? index + anchor.length : index;
  return source.slice(0, at) + insertion + source.slice(at);
}

function between(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  if (start < 0 || end < 0) return null;
  return { start, end, text: source.slice(start, end) };
}

const teacherPath = path.join(process.cwd(), "app", "teacher", "assessment", "AssessmentClient.jsx");
let teacher = read(teacherPath);

const placeholderHelper = `\nfunction crlIsStoryPlaceholder(value) {\n  const text = String(value || "").trim();\n  return !text || /choose\\s+a\\s+story\\s+passage|teacher\\s+will\\s+select\\s+it/i.test(text);\n}\n`;
teacher = addOnce(teacher, "export default function TeacherAssessmentPage", placeholderHelper + "\n", "teacher placeholder helper");

/* Story icons are title-driven, not id-driven. This remains correct even when
 * Manage Assessment supplies duplicate or reordered numeric ids. */
teacher = teacher.replaceAll(
  '{story.id === 1 ? "🦜" : "🌾"}',
  '{String(story.title || "").toLowerCase().includes("a day in the fields") ? "🌾" : "🦜"}'
);

const selectBlock = between(teacher, "  const selectStory = useCallback(", "  const controlPassageTimer =");
if (selectBlock) {
  let block = selectBlock.text;
  block = once(
    block,
    `        storyTitle: String(story?.title || ""),\n      };`,
    `        storyTitle: String(story?.title || ""),\n        story_title: String(story?.title || ""),\n      };`,
    "teacher selected-story title alias"
  );
  block = once(
    block,
    `        ...next,\n        connected: true,\n      };`,
    `        ...next,\n        story_title: String(story?.title || ""),\n        storyTitle: String(story?.title || ""),\n        current_content: String(story?.text || ""),\n        currentContent: String(story?.text || ""),\n        connected: true,\n      };`,
    "teacher selected-story optimistic payload"
  );
  block = once(
    block,
    `      setSession(optimistic);\n      setActiveStage("passage");`,
    `      setSession(optimistic);\n      setActiveStage("passage");\n      publishAssessmentState(assessmentChannelRef.current, { source: "teacher", session: optimistic });\n      void publishAssessmentRealtimeState(code, optimistic);`,
    "teacher immediate selected-story broadcast"
  );
  block = once(
    block,
    `          latestSessionRef.current = {\n            ...latestSessionRef.current,\n            ...data.session,\n            connected:`,
    `          latestSessionRef.current = {\n            ...latestSessionRef.current,\n            ...data.session,\n            stage: "passage",\n            story_title: String(story?.title || data.session.story_title || data.session.storyTitle || ""),\n            storyTitle: String(story?.title || data.session.story_title || data.session.storyTitle || ""),\n            current_content: String(story?.text || data.session.current_content || data.session.currentContent || ""),\n            currentContent: String(story?.text || data.session.current_content || data.session.currentContent || ""),\n            connected:`,
    "teacher authoritative selected-story merge"
  );
  teacher = teacher.slice(0, selectBlock.start) + block + teacher.slice(selectBlock.end);
}

/* Prevent the 1-second host poll from replacing a freshly selected passage
 * with the previous Story Choice instruction while the API is catching up. */
const fetchBlock = between(teacher, "  const fetchSession =", "\n\n  const selectStory =");
if (fetchBlock) {
  let block = fetchBlock.text;
  block = once(
    block,
    `        const incomingVersion =`,
    `        const liveTeacherSession = latestSessionRef.current;\n        const incomingPassageContent = String(data.session?.current_content ?? data.session?.currentContent ?? "").trim();\n        const livePassageContent = String(liveTeacherSession?.current_content ?? liveTeacherSession?.currentContent ?? "").trim();\n        const incomingPassageTitle = String(data.session?.story_title ?? data.session?.storyTitle ?? "").trim();\n        const livePassageTitle = String(liveTeacherSession?.story_title ?? liveTeacherSession?.storyTitle ?? "").trim();\n        if (liveTeacherSession?.stage === "passage" && data.session?.stage === "passage" && livePassageContent && !crlIsStoryPlaceholder(livePassageContent) && (crlIsStoryPlaceholder(incomingPassageContent) || (livePassageTitle && incomingPassageTitle && livePassageTitle.toLowerCase() !== incomingPassageTitle.toLowerCase()))) {\n          return;\n        }\n\n        const incomingVersion =`,
    "teacher stale passage protection"
  );
  teacher = teacher.slice(0, fetchBlock.start) + block + teacher.slice(fetchBlock.end);
}

/* Speed up host reconciliation specifically while Passage Reading is live. */
const pollEffectAnchor = `    const interval =\n      window.setInterval(\n        () => {\n          if (!busy && !pendingAnswerRef.current && document.visibilityState === "visible") {\n            fetchSession();\n          }\n        },\n        1000\n      );`;
teacher = once(
  teacher,
  pollEffectAnchor,
  `    const intervalMs = activeStage === "passage" ? 250 : 1000;\n    const interval =\n      window.setInterval(\n        () => {\n          if (!busy && !pendingAnswerRef.current && document.visibilityState === "visible") {\n            fetchSession();\n          }\n        },\n        intervalMs\n      );`,
  "teacher passage polling speed"
);
teacher = once(
  teacher,
  `  }, [\n    fetchSession,\n    busy,\n  ]);`,
  `  }, [\n    fetchSession,\n    busy,\n    activeStage,\n  ]);`,
  "teacher passage polling dependency"
);

const controlHandlerAnchor = `      const control = message?.control;\n      if (control?.action !== "word_first_item_ready") return;`;
teacher = once(
  teacher,
  controlHandlerAnchor,
  `      const control = message?.control;\n      if (control?.action === "passage_ready") {\n        const incomingCode = String(control.code || "").trim().toUpperCase();\n        if (incomingCode === String(code || "").trim().toUpperCase()) void fetchSession();\n        return;\n      }\n      if (control?.action !== "word_first_item_ready") return;`,
  "teacher immediate passage-ready control"
);

/* Open Story Choice state immediately under the existing full-screen saving
 * overlay. The underlying save request stays unchanged, so persistence and
 * scoring behavior are not compromised while the handoff feels immediate. */
const recordWordBlock = between(teacher, "  const recordWord =", "  const recordComprehension =");
if (recordWordBlock) {
  let block = recordWordBlock.text;
  block = once(
    block,
    `      setBusy(true);\n      pendingAnswerRef.current = true;`,
    `      setBusy(true);\n      pendingAnswerRef.current = true;\n      setShowWordSavingOverlay(true);`,
    "teacher immediate saving overlay"
  );
  block = once(
    block,
    `      try {\n        const data = await persistAnswerWithRetry(\n          "record_word",`,
    `      const optimisticStoryChoice = {\n        ...(latestSessionRef.current || {}),\n        code,\n        stage: "story_choice",\n        current_content: "",\n        currentContent: "",\n        story_title: "",\n        storyTitle: "",\n        connected: true,\n      };\n      latestSessionRef.current = optimisticStoryChoice;\n      latestActiveStageRef.current = "story_choice";\n      latestSessionVersionRef.current = Date.now();\n      setSession(optimisticStoryChoice);\n      setActiveStage("story_choice");\n      publishAssessmentState(assessmentChannelRef.current, { source: "teacher", session: optimisticStoryChoice });\n      void publishAssessmentRealtimeState(code, optimisticStoryChoice);\n\n      try {\n        const data = await persistAnswerWithRetry(\n          "record_word",`,
    "teacher instant story-choice transition"
  );
  teacher = teacher.slice(0, recordWordBlock.start) + block + teacher.slice(recordWordBlock.end);
}
write(teacherPath, teacher);

const learnerPath = path.join(process.cwd(), "app", "learner", "LearnerAssessmentPage.jsx");
let learner = read(learnerPath);

learner = learner.replaceAll(
  '{story.id === 1 ? "🦜" : "🌾"}',
  '{String(story.title || "").toLowerCase().includes("a day in the fields") ? "🌾" : "🦜"}'
);

/* Normalize the learner title from the actual passage text. This makes the
 * Field story impossible to render with the Parrot title during handoff. */
const learnerApply = between(learner, "  const applyIncomingSession = useCallback(", "  const joinAssessment =");
if (learnerApply) {
  let block = learnerApply.text;
  block = once(
    block,
    `    const next = source === "broadcast" ? { ...(current || {}), ...incoming } : mergeLearnerSession(incoming, current);`,
    `    let next = source === "broadcast" ? { ...(current || {}), ...incoming } : mergeLearnerSession(incoming, current);\n    if (String(next.stage || "") === "passage") {\n      const content = String(next.current_content ?? next.currentContent ?? "").trim().toLowerCase();\n      if (content.startsWith("dulnuwan is a farmer.")) next = { ...next, story_title: "A Day In The Fields", storyTitle: "A Day In The Fields" };\n      else if (content.startsWith("para flies away from the houses")) next = { ...next, story_title: "Para The Parrot", storyTitle: "Para The Parrot" };\n    }`,
    "learner deterministic passage title"
  );
  learner = learner.slice(0, learnerApply.start) + block + learner.slice(learnerApply.end);
}

/* Once real passage text is available, explicitly tell the teacher that the
 * learner is ready. The server remains responsible for the timestamp. */
const readySignalMarker = "CRL_PASSAGE_READY_TEACHER_SIGNAL_V4";
if (!learner.includes(readySignalMarker)) {
  const anchor = "  useEffect(() => {\n    if (wordReadyRetryTimerRef.current)";
  const effect = `  useEffect(() => {\n    if (!joined || completed || ended || stage !== "passage") return undefined;\n    const current = sessionRef.current || session;\n    const content = String(current?.current_content ?? current?.currentContent ?? "").trim();\n    if (!content || /choose\\s+a\\s+story\\s+passage|teacher\\s+will\\s+select\\s+it/i.test(content)) return undefined;\n    const readyKey = String(normalizeCode(codeInput || current?.code)) + ":passage-ready:" + String(current?.story_title || current?.storyTitle || "");\n    if (!readyKey.split(":")[0] || passageReadyKeyRef.current === readyKey) return undefined;\n    passageReadyKeyRef.current = readyKey;\n    let cancelled = false;\n    let frame1 = 0;\n    let frame2 = 0;\n    frame1 = window.requestAnimationFrame(() => {\n      frame2 = window.requestAnimationFrame(async () => {\n        if (cancelled) return;\n        try {\n          const code = normalizeCode(codeInput || current?.code);\n          const response = await fetch("/api/assessment?action=passage_ready", { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ action: "passage_ready", code }) });\n          const data = await response.json().catch(() => null);\n          if (!cancelled && data?.passage_started_at) {\n            const readySession = { ...current, passage_started_at: data.passage_started_at, passageStartedAt: data.passage_started_at, passage_paused_at: data.passage_paused_at, passagePausedAt: data.passage_paused_at, passage_paused_seconds: data.passage_paused_seconds, passagePausedSeconds: data.passage_paused_seconds };\n            sessionRef.current = readySession;\n            setSession(readySession);\n            const control = { action: "passage_ready", code, stage: "passage", story_title: readySession.story_title || readySession.storyTitle || "" };\n            publishAssessmentControl(assessmentChannelRef.current, control);\n            void publishAssessmentRealtimeControl(code, control);\n          }\n        } catch {}\n      });\n    });\n    return () => { cancelled = true; if (frame1) window.cancelAnimationFrame(frame1); if (frame2) window.cancelAnimationFrame(frame2); };\n  }, [joined, completed, ended, stage, codeInput, session]);\n  /* ${readySignalMarker} */\n\n`;
  learner = addOnce(learner, anchor, effect, "learner passage-ready teacher signal");
}

/* Keep the passage renderer safe even if the previous repair did not match. */
const passagePattern = /\{stage ===\s*"passage" && \([\s\S]*?(?=\n\s*\{stage ===\s*"comprehension")/;
const passageReplacement = [
  '{stage ===',
  '                    "passage" && (',
  '                    <div>',
  '                      <div className="passage-title">',
  '                        {session?.story_title || selectedStory.title}',
  '                      </div>',
  '                      <div className="passage" role="status" aria-live="polite">',
  '                        {resolvedPassageText ? resolvedPassageText.split(/\\s+/).filter(Boolean).join(" ") : (',
  '                          <span style={{display:"block",textAlign:"center",color:"#71869a",fontSize:"18px",fontWeight:800}}>',
  '                            Loading story passage...',
  '                          </span>',
  '                        )}',
  '                      </div>',
  '                    </div>',
  '                  )}',
  '',
].join("\n");
learner = learner.replace(passagePattern, passageReplacement);
write(learnerPath, learner);

console.log("Applied CRL live passage repair: deterministic story icons, atomic selected-story state, instant Story Choice transition, stale-state protection, post-render timer readiness, and safe passage loading.");
