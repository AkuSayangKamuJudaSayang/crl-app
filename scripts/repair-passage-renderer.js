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

/* ========================================================================== */
/* TEACHER: deterministic story selection, faster final-word transition,      */
/* title/content consistency, and faster passage readiness polling.            */
/* ========================================================================== */
const teacherPath = path.join(process.cwd(), "app", "teacher", "assessment", "AssessmentClient.jsx");
let teacher = read(teacherPath);

const placeholderHelper = `\nfunction crlIsStoryPlaceholder(value) {\n  const text = String(value || "").trim();\n  return !text || /choose\\s+a\\s+story\\s+passage|teacher\\s+will\\s+select\\s+it/i.test(text);\n}\n`;
teacher = addOnce(
  teacher,
  "export default function TeacherAssessmentPage",
  placeholderHelper + "\n",
  "teacher placeholder helper"
);

teacher = teacher.replaceAll(
  '{story.id === 1 ? "🦜" : "🌾"}',
  '{String(story.title || "").toLowerCase().includes("a day in the fields") ? "🌾" : "🦜"}'
);

/* Keep the local story choice deterministic even when Manage Assessment gives
 * both stories the same numeric id. */
const selectBlock = between(
  teacher,
  "  const selectStory = useCallback(",
  "  const controlPassageTimer ="
);
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

  /* The API response is allowed to supply timing/database fields, but the
   * selected title and passage remain authoritative for this teacher action.
   * This prevents a stale Story Choice payload from flashing back in the UI. */
  block = once(
    block,
    `          latestSessionRef.current = {\n            ...latestSessionRef.current,\n            ...data.session,\n            connected:`,
    `          latestSessionRef.current = {\n            ...latestSessionRef.current,\n            ...data.session,\n            stage: "passage",\n            story_title: String(story?.title || data.session.story_title || data.session.storyTitle || ""),\n            storyTitle: String(story?.title || data.session.story_title || data.session.storyTitle || ""),\n            current_content: String(story?.text || data.session.current_content || data.session.currentContent || ""),\n            currentContent: String(story?.text || data.session.current_content || data.session.currentContent || ""),\n            connected:`,
    "teacher authoritative selected-story merge"
  );

  teacher =
    teacher.slice(0, selectBlock.start) +
    block +
    teacher.slice(selectBlock.end);
}

/* Ignore only a stale passage payload during the tiny Story Choice -> Passage
 * handoff. As soon as the server returns the selected title/content, normal
 * reconciliation resumes. */
const fetchBlock = between(
  teacher,
  "  const fetchSession =",
  "\n\n  const selectStory ="
);
if (fetchBlock) {
  let block = fetchBlock.text;
  block = once(
    block,
    `        const incomingVersion =`,
    `        const liveTeacherSession = latestSessionRef.current;\n        const incomingPassageContent = String(\n          data.session?.current_content ?? data.session?.currentContent ?? ""\n        ).trim();\n        const livePassageContent = String(\n          liveTeacherSession?.current_content ?? liveTeacherSession?.currentContent ?? ""\n        ).trim();\n        const incomingPassageTitle = String(\n          data.session?.story_title ?? data.session?.storyTitle ?? ""\n        ).trim();\n        const livePassageTitle = String(\n          liveTeacherSession?.story_title ?? liveTeacherSession?.storyTitle ?? ""\n        ).trim();\n        if (\n          liveTeacherSession?.stage === "passage" &&\n          data.session?.stage === "passage" &&\n          livePassageContent &&\n          !crlIsStoryPlaceholder(livePassageContent) &&\n          (crlIsStoryPlaceholder(incomingPassageContent) ||\n            (livePassageTitle && incomingPassageTitle &&\n              livePassageTitle.toLowerCase() !== incomingPassageTitle.toLowerCase()))\n        ) {\n          return;\n        }\n\n        const incomingVersion =`,
    "teacher stale passage protection"
  );
  teacher = teacher.slice(0, fetchBlock.start) + block + teacher.slice(fetchBlock.end);
}

/* Reduce the controller polling interval during Passage Reading. The timer
 * is still based on the server's passage_started_at, but the teacher learns
 * about the learner's readiness within a few hundred milliseconds. */
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

/* Teacher reacts immediately when the learner reports that the real passage
 * has rendered. The server remains the timer authority. */
const controlHandlerAnchor = `      const control = message?.control;\n      if (control?.action !== "word_first_item_ready") return;`;
teacher = once(
  teacher,
  controlHandlerAnchor,
  `      const control = message?.control;\n      if (control?.action === "passage_ready") {\n        const incomingCode = String(control.code || "").trim().toUpperCase();\n        if (incomingCode === String(code || "").trim().toUpperCase()) {\n          void fetchSession();\n        }\n        return;\n      }\n      if (control?.action !== "word_first_item_ready") return;`,
  "teacher immediate passage-ready control"
);

/* Make the final Word answer feel immediate without weakening persistence.
 * The server save is allowed up to 1.5s; if it exceeds that, the existing
 * IndexedDB outbox retries it in the background while Story Choice opens. */
const recordWordBlock = between(
  teacher,
  "  const recordWord =",
  "  const recordComprehension ="
);
if (recordWordBlock) {
  let block = recordWordBlock.text;
  block = once(
    block,
    `      try {\n        const data = await persistAnswerWithRetry(\n          "record_word",\n          {`,
    `      const optimisticStoryChoice = {\n        ...(latestSessionRef.current || {}),\n        code,\n        stage: "story_choice",\n        current_content: "",\n        currentContent: "",\n        story_title: "",\n        storyTitle: "",\n        connected: true,\n      };\n      latestSessionRef.current = optimisticStoryChoice;\n      latestActiveStageRef.current = "story_choice";\n      latestSessionVersionRef.current = Date.now();\n      setSession(optimisticStoryChoice);\n      setActiveStage("story_choice");\n      setShowWordSavingOverlay(true);\n      publishAssessmentState(assessmentChannelRef.current, { source: "teacher", session: optimisticStoryChoice });\n      void publishAssessmentRealtimeState(code, optimisticStoryChoice);\n\n      const finalWordPayload = {\n        code,\n        word_index: currentIndex,\n        word: WORDS[currentIndex],\n        is_correct: isCorrect,\n      };\n\n      const data = await Promise.race([\n        persistAnswerWithRetry("record_word", finalWordPayload),\n        new Promise((resolve) => window.setTimeout(() => resolve(null), 1500)),\n      ]);\n\n      if (!data) {\n        void queueAnswerForBackgroundSave("record_word", finalWordPayload);\n      }\n\n      try {`,
    "teacher faster final-word transition"
  );
  /* Remove the now-duplicated inner record_word payload only when the above
   * replacement was applied. */
  block = block.replace(
    `      try {\n        const data = await Promise.race([`,
    `      const data = await Promise.race([`
  );
  teacher = teacher.slice(0, recordWordBlock.start) + block + teacher.slice(recordWordBlock.end);
}

write(teacherPath, teacher);

/* ========================================================================== */
/* LEARNER: deterministic story icon/title and an explicit timer-ready signal. */
/* ========================================================================== */
const learnerPath = path.join(process.cwd(), "app", "learner", "LearnerAssessmentPage.jsx");
let learner = read(learnerPath);

learner = learner.replaceAll(
  '{story.id === 1 ? "🦜" : "🌾"}',
  '{String(story.title || "").toLowerCase().includes("a day in the fields") ? "🌾" : "🦜"}'
);

/* Never allow a correct Field passage to retain the previous Parrot title. */
const learnerApply = between(
  learner,
  "  const applyIncomingSession = useCallback(",
  "  const joinAssessment ="
);
if (learnerApply) {
  let block = learnerApply.text;
  block = once(
    block,
    `    const next = source === "broadcast" ? { ...(current || {}), ...incoming } : mergeLearnerSession(incoming, current);`,
    `    let next = source === "broadcast" ? { ...(current || {}), ...incoming } : mergeLearnerSession(incoming, current);\n    if (String(next.stage || "") === "passage") {\n      const content = String(next.current_content ?? next.currentContent ?? "").trim();\n      const lowerContent = content.toLowerCase();\n      const fieldPassage = ${JSON.stringify("Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil.")};\n      const paraPassage = ${JSON.stringify("Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.")};\n      if (lowerContent && lowerContent === fieldPassage.toLowerCase()) {\n        next = { ...next, story_title: "A Day In The Fields", storyTitle: "A Day In The Fields" };\n      } else if (lowerContent && lowerContent === paraPassage.toLowerCase()) {\n        next = { ...next, story_title: "Para The Parrot", storyTitle: "Para The Parrot" };\n      }\n    }`,
    "learner deterministic passage title"
  );
  learner = learner.slice(0, learnerApply.start) + block + learner.slice(learnerApply.end);
}

/* Send an explicit passage_ready control after the actual selected passage is
 * present in the learner DOM state. This wakes the teacher immediately instead
 * of waiting for its next poll cycle. */
const readySignalMarker = "CRL_PASSAGE_READY_TEACHER_SIGNAL_V3";
if (!learner.includes(readySignalMarker)) {
  const anchor = "  useEffect(() => {\n    if (wordReadyRetryTimerRef.current)";
  const effect = `  useEffect(() => {\n    if (!joined || completed || ended || stage !== "passage") return undefined;\n    const current = sessionRef.current || session;\n    const content = String(current?.current_content ?? current?.currentContent ?? "").trim();\n    if (!content || /choose\\s+a\\s+story\\s+passage|teacher\\s+will\\s+select\\s+it/i.test(content)) return undefined;\n    const code = normalizeCode(codeInput || current?.code);\n    const readyKey = String(code) + ":passage-ready:" + String(current?.story_title || current?.storyTitle || "");\n    if (!code || passageReadyKeyRef.current === readyKey) return undefined;\n    passageReadyKeyRef.current = readyKey;\n    let cancelled = false;\n    let frame1 = 0;\n    let frame2 = 0;\n    frame1 = window.requestAnimationFrame(() => {\n      frame2 = window.requestAnimationFrame(async () => {\n        if (cancelled) return;\n        try {\n          const response = await fetch("/api/assessment?action=passage_ready", {\n            method: "POST",\n            credentials: "include",\n            cache: "no-store",\n            headers: { "Content-Type": "application/json", Accept: "application/json" },\n            body: JSON.stringify({ action: "passage_ready", code }),\n          });\n          const data = await response.json().catch(() => null);\n          if (!cancelled && data?.passage_started_at) {\n            const readySession = { ...current, passage_started_at: data.passage_started_at, passageStartedAt: data.passage_started_at, passage_paused_at: data.passage_paused_at, passagePausedAt: data.passage_paused_at, passage_paused_seconds: data.passage_paused_seconds, passagePausedSeconds: data.passage_paused_seconds };\n            sessionRef.current = readySession;\n            setSession(readySession);\n            publishAssessmentControl(assessmentChannelRef.current, { action: "passage_ready", code, stage: "passage", story_title: readySession.story_title || readySession.storyTitle || "" });\n            void publishAssessmentRealtimeControl(code, { action: "passage_ready", code, stage: "passage", story_title: readySession.story_title || readySession.storyTitle || "" });\n          }\n        } catch {}\n      });\n    });\n    return () => { cancelled = true; if (frame1) window.cancelAnimationFrame(frame1); if (frame2) window.cancelAnimationFrame(frame2); };\n  }, [joined, completed, ended, stage, codeInput, session]);\n  /* ${readySignalMarker} */\n\n`;
  learner = addOnce(learner, anchor, effect, "learner passage-ready teacher signal");
}

write(learnerPath, learner);

/* ========================================================================== */
/* Passage renderer: never display the old Story Choice instruction as the     */
/* passage. Keep the final loading treatment idempotent.                       */
/* ========================================================================== */
const passagePattern = /\{stage ===\s*"passage" && \([\s\S]*?(?=\n\s*\{stage ===\s*"comprehension")/;
const passageReplacement = [
  '{stage ===',
  '                    "passage" && (',
  '                    <div>',
  '                      <div className="passage-title">',
  '                        {session?.story_title || selectedStory.title}',
  '                      </div>',
  '                      <div className="passage" role="status" aria-live="polite">',
  '                        {(() => {',
  '                          const text = String(resolvedPassageText || "").trim();',
  '                          return text ? text.split(/\\s+/).filter(Boolean).join(" ") : (',
  '                            <span style={{display:"block",textAlign:"center",color:"#71869a",fontSize:"18px",fontWeight:800}}>',
  '                              Loading story passage...',
  '                            </span>',
  '                          );',
  '                        })()}',
  '                      </div>',
  '                    </div>',
  '                  )}',
  '',
].join("\n");
learner = learner.replace(passagePattern, passageReplacement);
write(learnerPath, learner);

console.log("Applied CRL live passage repair: title/content lock, faster final-word handoff, deterministic story icons, explicit passage-ready timer signal, and stale passage protection.");
