from pathlib import Path
import re

path = Path('app/teacher/assessment/AssessmentClient.jsx')
text = path.read_text()


def sub_once(pattern, replacement, label, flags=0):
    global text
    text2, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'missing patch target: {label}')
    text = text2

# 1) IndexedDB state helpers.
sub_once(
    r'import \{\s*getMutations,\s*putMutation,\s*removeMutation,\s*\} from "\.\.\/\.\.\/\.\.\/lib\/assessmentOutbox";',
    '''import {
  getAssessmentState,
  getMutations,
  putMutation,
  removeAssessmentState,
  removeMutation,
  saveAssessmentState,
} from "../../../lib/assessmentOutbox";''',
    'assessment outbox import',
    re.S,
)

# 2) Review-mode state. Supports both multiline and compact current formatting.
sub_once(
    r'  const \[miscueDrawerOpen,\s*setMiscueDrawerOpen\]\s*=\s*useState\(false\);',
    '''  const [miscueDrawerOpen, setMiscueDrawerOpen] = useState(false);
  const [miscueReviewMode, setMiscueReviewMode] = useState(false);''',
    'miscue review state',
)

# 3) Offline draft store/ref and restore-on-reload.
sub_once(
    r'  const pendingAnswerRef =\s*useRef\(false\);',
    '''  const pendingAnswerRef =
    useRef(false);

  const passageDraftRef =
    useRef({
      code,
      timerSeconds: 0,
      wordsRead: 100,
      miscues: [],
      comprehension: [],
    });

  const persistPassageDraft = useCallback(
    async (patch = {}) => {
      passageDraftRef.current = {
        ...passageDraftRef.current,
        ...patch,
        code,
      };

      await saveAssessmentState(
        `passage:${String(code).toUpperCase()}`,
        passageDraftRef.current
      );

      return passageDraftRef.current;
    },
    [code]
  );''',
    'passage draft ref',
)

marker = '  const fetchSession =\n'
if marker not in text:
    raise SystemExit('missing patch target: restore draft marker')
restore = '''  useEffect(() => {
    if (!code) return;

    void getAssessmentState(
      `passage:${String(code).toUpperCase()}`
    ).then((draft) => {
      if (!draft) return;

      passageDraftRef.current = {
        ...passageDraftRef.current,
        ...draft,
        code,
      };

      if (Array.isArray(draft.miscues)) {
        setPassageMiscues(draft.miscues);
      }

      if (Number.isFinite(Number(draft.timerSeconds))) {
        setPassageSeconds(Number(draft.timerSeconds));
      }

      if (Number.isFinite(Number(draft.wordsRead))) {
        setPassageWordsRead(Number(draft.wordsRead));
      }

      if (Array.isArray(draft.comprehension)) {
        passageDraftRef.current.comprehension = draft.comprehension;
      }
    }).catch(() => {});
  }, [code]);

'''
text = text.replace(marker, restore + marker, 1)

# 4) Prevent polling from rewinding local comprehension.
sub_once(
    r'            if \(serverStage === "comprehension"\) \{\s*const serverIndex =\s*QUESTIONS\.findIndex\(\s*\(question\) =>\s*question\.text === serverContent\s*\);\s*\s*if \(serverIndex >= 0\) \{\s*setQuestionIndex\(serverIndex\);\s*\}\s*\}',
    '''            if (serverStage === "comprehension") {
              if (latestSessionRef.current?.stage !== "comprehension") {
                const serverIndex =
                  QUESTIONS.findIndex(
                    (question) =>
                      question.text === serverContent
                  );

                if (serverIndex >= 0) {
                  setQuestionIndex(serverIndex);
                }
              }
            }''',
    'comprehension polling guard',
    re.S,
)

# 5) Passage finish: save locally, then move to comprehension and only update host state.
start = text.find('  const finishPassageReading =')
end = text.find('  const recordPassageMiscue =', start)
if start < 0 or end < 0:
    raise SystemExit('missing patch target: finishPassageReading block')
new_finish = '''  const finishPassageReading =
    useCallback(
      async (
        secondsOverride,
        wordsOverride
      ) => {
        if (passageFinalizingRef.current) return;

        passageFinalizingRef.current = true;
        setBusy(true);
        setError("");

        try {
          const seconds = Math.min(
            120,
            Math.max(
              0,
              Number(secondsOverride ?? passageSeconds)
            )
          );

          const wordsRead = Math.min(
            100,
            Math.max(
              0,
              Number(
                wordsOverride ??
                  (passageSeconds >= 120
                    ? passageWordsRead || 0
                    : 100)
              )
            )
          );

          await persistPassageDraft({
            timerSeconds: Math.round(seconds),
            wordsRead: Math.round(wordsRead),
            miscues: passageMiscues.slice(),
          });

          setPassageSeconds(Math.round(seconds));
          setPassageWordsRead(wordsRead);
          setTimeUpSelecting(false);
          setTimeUpReviewConfirmed(false);
          setMiscueDrawerOpen(false);
          setMiscueReviewMode(false);
          setSelectedPassageWord(null);
          setSelectedMiscueType(null);
          setMisreadWord("");

          if (passageTimerRef.current) {
            window.clearInterval(passageTimerRef.current);
            passageTimerRef.current = null;
          }

          const nextSession = {
            ...(latestSessionRef.current || {}),
            stage: "comprehension",
            current_content: QUESTIONS[0].text,
            currentContent: QUESTIONS[0].text,
          };

          latestSessionRef.current = nextSession;
          latestActiveStageRef.current = "comprehension";
          latestSessionVersionRef.current = Date.now();
          setQuestionIndex(0);
          setSession(nextSession);
          setActiveStage("comprehension");
          void publishAssessmentRealtimeState(code, nextSession);

          try {
            const response = await fetch(
              "/api/assessment?action=host_update",
              {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  action: "host_update",
                  code,
                  stage: "comprehension",
                  currentContent: QUESTIONS[0].text,
                  storyTitle: nextSession.story_title || "Para the Parrot",
                }),
              }
            );

            if (!response.ok) throw new Error("host update failed");
          } catch {
            await putMutation({
              id: `stage:comprehension:${String(code).toUpperCase()}:0`,
              action: "host_update",
              payload: {
                code,
                stage: "comprehension",
                currentContent: QUESTIONS[0].text,
                storyTitle: nextSession.story_title || "Para the Parrot",
              },
              createdAt: Date.now(),
            });
          }
        } catch (error) {
          setError(
            error?.message ||
              "Unable to finish the passage."
          );
        } finally {
          passageFinalizingRef.current = false;
          setBusy(false);
        }
      },
      [
        code,
        passageMiscues,
        passageSeconds,
        passageWordsRead,
        persistPassageDraft,
      ]
    );

'''
text = text[:start] + new_finish + text[end:]

# 6) Passage miscue functions become local-first.
start = text.find('  const removePassageMiscue =')
end = text.find('  const recordPassageMiscue =', start)
if start < 0 or end < 0:
    raise SystemExit('missing patch target: removePassageMiscue')
new_remove = '''  const removePassageMiscue =
    useCallback(
      async () => {
        const selectedIndex = Number(selectedPassageWord || 0) - 1;
        if (selectedIndex < 0 || selectedIndex >= 100) return;

        const nextMiscues = passageMiscues.filter(
          (item) => Number(item.wordIndex) !== selectedIndex
        );

        setPassageMiscues(nextMiscues);
        setSelectedMiscueType(null);
        setMisreadWord("");
        setError("");

        await persistPassageDraft({
          miscues: nextMiscues,
        });

        if (!miscueReviewMode) {
          setMiscueDrawerOpen(false);
          setSelectedPassageWord(null);
        }
      },
      [
        selectedPassageWord,
        passageMiscues,
        miscueReviewMode,
        persistPassageDraft,
      ]
    );

'''
text = text[:start] + new_remove + text[end:]

start = text.find('  const recordPassageMiscue =')
end = text.find('  useEffect(() => {\n    if (activeStage !== "passage")', start)
if start < 0 or end < 0:
    raise SystemExit('missing patch target: recordPassageMiscue')
new_record = '''  const recordPassageMiscue =
    useCallback(
      async (
        selectedWordOverride,
        typeOverride,
        misreadWordOverride
      ) => {
        const selectedNumber = Number(
          selectedWordOverride ?? selectedPassageWord ?? 0
        );
        const selectedIndex = selectedNumber - 1;
        if (selectedIndex < 0 || selectedIndex >= 100) return;

        const nextType = String(
          typeOverride ||
            selectedMiscueType ||
            miscueType ||
            "Substitution"
        );
        const nextMisreadWord = String(
          misreadWordOverride ?? misreadWord ?? ""
        ).trim();

        if (
          (nextType === "Insertion" ||
            nextType === "Substitution") &&
          !nextMisreadWord
        ) {
          setSelectedMiscueType(nextType);
          return;
        }

        const optimistic = {
          wordIndex: selectedIndex,
          miscueType: nextType,
          misreadWord: nextMisreadWord,
        };

        const nextMiscues = [
          ...passageMiscues.filter(
            (item) => Number(item.wordIndex) !== selectedIndex
          ),
          optimistic,
        ];

        setPassageMiscues(nextMiscues);
        setError("");
        setMisreadWord("");
        setMiscueWordIndex(1);

        await persistPassageDraft({
          miscues: nextMiscues,
        });

        if (!miscueReviewMode) {
          setMiscueDrawerOpen(false);
          setSelectedPassageWord(null);
          setSelectedMiscueType(null);
        }
      },
      [
        selectedPassageWord,
        selectedMiscueType,
        miscueType,
        misreadWord,
        passageMiscues,
        miscueReviewMode,
        persistPassageDraft,
      ]
    );

'''
text = text[:start] + new_record + text[end:]

# 7) Reset review mode on leaving passage.
text = text.replace(
    '''      setMiscueDrawerOpen(false);\n      setSelectedPassageWord(null);''',
    '''      setMiscueDrawerOpen(false);\n      setMiscueReviewMode(false);\n      setSelectedPassageWord(null);''',
    1,
)

# 8) Comprehension local-first progression.
start = text.find('  const recordComprehension =')
end = text.find('  const finalize =', start)
if start < 0 or end < 0:
    raise SystemExit('missing patch target: recordComprehension')
new_comp = '''  const recordComprehension =
    async (isCorrect) => {
      const lockKey =
        "comprehension:" + questionIndex;

      if (
        answerActionLockRef.current === lockKey ||
        pendingAnswerRef.current
      ) {
        return;
      }

      answerActionLockRef.current = lockKey;
      setAnswerLockKey(lockKey);
      setBusy(true);
      pendingAnswerRef.current = true;

      try {
        const existing = Array.isArray(
          passageDraftRef.current.comprehension
        )
          ? passageDraftRef.current.comprehension
          : [];

        const nextComprehension = [
          ...existing.filter(
            (item) => Number(item.questionIndex) !== questionIndex
          ),
          {
            questionIndex,
            isCorrect: Boolean(isCorrect),
          },
        ].sort(
          (a, b) => Number(a.questionIndex) - Number(b.questionIndex)
        );

        await persistPassageDraft({
          comprehension: nextComprehension,
        });

        const nextIndex = questionIndex + 1;

        if (nextIndex < QUESTIONS.length) {
          const nextQuestion = QUESTIONS[nextIndex];
          const nextSession = {
            ...(latestSessionRef.current || {}),
            stage: "comprehension",
            current_content: nextQuestion.text,
            currentContent: nextQuestion.text,
          };

          setQuestionIndex(nextIndex);
          latestSessionRef.current = nextSession;
          latestActiveStageRef.current = "comprehension";
          latestSessionVersionRef.current = Date.now();
          setSession(nextSession);
          setActiveStage("comprehension");
          void publishAssessmentRealtimeState(code, nextSession);

          void (async () => {
            try {
              const response = await fetch(
                "/api/assessment?action=host_update",
                {
                  method: "POST",
                  credentials: "include",
                  cache: "no-store",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                  },
                  body: JSON.stringify({
                    action: "host_update",
                    code,
                    stage: "comprehension",
                    currentContent: nextQuestion.text,
                    storyTitle:
                      nextSession.story_title || "Para the Parrot",
                  }),
                }
              );

              if (!response.ok) throw new Error("host update failed");
            } catch {
              await putMutation({
                id: `stage:comprehension:${String(code).toUpperCase()}:${nextIndex}`,
                action: "host_update",
                payload: {
                  code,
                  stage: "comprehension",
                  currentContent: nextQuestion.text,
                  storyTitle:
                    nextSession.story_title || "Para the Parrot",
                },
                createdAt: Date.now(),
              });
            }
          })();
        } else {
          const finalSession = {
            ...(latestSessionRef.current || {}),
            stage: "completed",
            ended: true,
            connected: false,
            current_content: "Assessment completed.",
            currentContent: "Assessment completed.",
          };

          latestSessionRef.current = finalSession;
          latestActiveStageRef.current = "completed";
          setSession(finalSession);
          setActiveStage("completed");
          terminationObservationHandledRef.current = true;
          openAssessmentSaveModal(finalSession);
        }
      } catch (recordError) {
        answerActionLockRef.current = "";
        setAnswerLockKey("");
        setError(
          recordError.message ||
            "Unable to record result."
        );
      } finally {
        pendingAnswerRef.current = false;
        setBusy(false);
      }
    };

'''
text = text[:start] + new_comp + text[end:]

# 9) Finish Reading opens miscue review directly.
sub_once(
    r'                            onClick=\{\(\) =>\s*setConfirmFinishReading\(\s*true\s*\)\s*\}',
    '''                            onClick={() => {
                              setMiscueReviewMode(true);
                              setMiscueDrawerOpen(true);
                              setSelectedPassageWord(null);
                              setSelectedMiscueType(null);
                              setMisreadWord("");
                              setError("");
                            }}''',
    'Finish Reading review trigger',
    re.S,
)

# 10) Remove old Finish Reading confirmation modal.
text, count = re.subn(
    r'\n        \{confirmFinishReading && \(.*?\n        \}\)\}\n',
    '\n',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit('missing patch target: old Finish Reading modal')

# 11) Review-mode UI at the top of the existing miscue drawer.
marker = '''                        <div style={styles.miscueDrawer}>\n                          <div style={styles.miscueDrawerHeader}>'''
review = '''                        <div style={styles.miscueDrawer}>\n                          {miscueReviewMode && (\n                            <div style={styles.miscueReviewSection}>\n                              <div style={styles.miscueReviewTitle}>\n                                Review passage miscues\n                              </div>\n                              <div style={styles.miscueReviewText}>\n                                Optionally press any word where you observed a miscue.\n                                If there are none, press Confirm &amp; Continue.\n                              </div>\n                              <div style={styles.miscueReviewWordGrid}>\n                                {passageText.split(/\\s+/).filter(Boolean).map((word, index) => {\n                                  const number = index + 1;\n                                  const annotation = passageMiscues.find(\n                                    (item) => Number(item.wordIndex) === index\n                                  );\n                                  return (\n                                    <button\n                                      key={`review-word-${index}`}\n                                      type="button"\n                                      style={{\n                                        ...styles.miscueReviewWordButton,\n                                        ...(annotation ? styles.miscueReviewWordMarked : {}),\n                                        ...(Number(selectedPassageWord) === number ? styles.miscueReviewWordSelected : {}),\n                                      }}\n                                      onClick={() => {\n                                        setSelectedPassageWord(number);\n                                        setMiscueWordIndex(number);\n                                        setSelectedMiscueType(annotation?.miscueType || null);\n                                        setMisreadWord(annotation?.misreadWord || "");\n                                      }}\n                                    >\n                                      {word}\n                                    </button>\n                                  );\n                                })}\n                              </div>\n                            </div>\n                          )}\n\n                          <div style={styles.miscueDrawerHeader}>'''
if marker not in text:
    raise SystemExit('missing patch target: miscue drawer marker')
text = text.replace(marker, review, 1)

# 12) Add review confirmation button before the drawer closes.
end_marker = '''                          )}\n                        </div>\n                      </div>\n                    )}\n                  </section>'''
confirm = '''                          )}\n\n                          {miscueReviewMode && (\n                            <button\n                              type="button"\n                              style={styles.miscueReviewConfirmButton}\n                              onClick={() => {\n                                void finishPassageReading(\n                                  passageSeconds,\n                                  passageSeconds >= 120\n                                    ? passageWordsRead || 0\n                                    : 100\n                                );\n                              }}\n                              disabled={busy || passageFinalizingRef.current}\n                            >\n                              Confirm &amp; Continue\n                            </button>\n                          )}\n                        </div>\n                      </div>\n                    )}\n                  </section>'''
if end_marker not in text:
    raise SystemExit('missing patch target: miscue drawer ending')
text = text.replace(end_marker, confirm, 1)

# 13) Move the existing full overlay outside the transformed assessment card.
overlay = re.search(
    r'\n                    \{miscueDrawerOpen && \(\n.*?\n                    \)\}\n                  </section>\n                \}\n\n                \{activeStage ===\n                  "comprehension"',
    text,
    re.S,
)
if not overlay:
    raise SystemExit('missing patch target: miscue overlay block')
overlay_text = overlay.group(0)
# Keep only the overlay itself; strip the trailing passage section marker.
overlay_only = re.sub(
    r'\n                  </section>\n                \}\n\n                \{activeStage ===\n                  "comprehension"$',
    '',
    overlay_text,
    count=1,
)
text = text[:overlay.start()] + '\n' + text[overlay.end():]
root_marker = '        {confirmEndSession && ('
if root_marker not in text:
    raise SystemExit('missing patch target: root modal marker')
text = text.replace(root_marker, overlay_only.replace('                    ', '        ') + '\n' + root_marker, 1)

# 14) Review styles.
style_marker = '  miscueDrawerHeader: {'
styles = '''  miscueReviewSection: {\n    marginBottom: "18px",\n    padding: "16px",\n    borderRadius: "16px",\n    background: "#f3f8fc",\n    border: "1px solid #dbe7f0",\n  },\n  miscueReviewTitle: {\n    color: "#1f4b69",\n    fontSize: "18px",\n    fontWeight: "950",\n  },\n  miscueReviewText: {\n    marginTop: "6px",\n    color: "#70869a",\n    fontSize: "13px",\n    lineHeight: 1.5,\n  },\n  miscueReviewWordGrid: {\n    display: "flex",\n    flexWrap: "wrap",\n    gap: "6px",\n    maxHeight: "220px",\n    overflowY: "auto",\n    marginTop: "12px",\n    padding: "10px",\n    borderRadius: "12px",\n    background: "#ffffff",\n    border: "1px solid #dfe9f1",\n  },\n  miscueReviewWordButton: {\n    border: "1px solid #d4e0ea",\n    borderRadius: "8px",\n    background: "#f8fbfe",\n    color: "#36536b",\n    padding: "5px 7px",\n    fontSize: "13px",\n    cursor: "pointer",\n  },\n  miscueReviewWordMarked: {\n    borderColor: "#e3ae6a",\n    background: "#fff2df",\n  },\n  miscueReviewWordSelected: {\n    boxShadow: "0 0 0 2px #2f73c9",\n    background: "#eaf3fb",\n    color: "#1559a6",\n  },\n  miscueReviewConfirmButton: {\n    width: "100%",\n    minHeight: "50px",\n    marginTop: "18px",\n    border: 0,\n    borderRadius: "13px",\n    background: "linear-gradient(145deg,#2f8f61,#1e744c)",\n    color: "#ffffff",\n    fontSize: "14px",\n    fontWeight: "950",\n    cursor: "pointer",\n  },\n\n'''
if style_marker not in text:
    raise SystemExit('missing patch target: review style marker')
text = text.replace(style_marker, styles + style_marker, 1)

path.write_text(text)
print('AssessmentClient patched')
