from pathlib import Path
import re

CLIENT = Path('app/teacher/assessment/AssessmentClient.jsx')
text = CLIENT.read_text()


def require_once(pattern, replacement, label, flags=0):
    global text
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'missing patch target: {label}')
    text = updated

# ---------------------------------------------------------------------------
# IndexedDB helpers: passage/comprehension are staged locally before any final
# database write, which is the intended PWA/offline behavior.
# ---------------------------------------------------------------------------
require_once(
    r'import \{\s*getMutations,\s*putMutation,\s*removeMutation,\s*\} from "\.\.\/\.\.\/\.\.\/lib\/assessmentOutbox";',
    '''import {
  getAssessmentState,
  getMutations,
  putMutation,
  removeAssessmentState,
  removeMutation,
  saveAssessmentState,
} from "../../../lib/assessmentOutbox";''',
    'assessment outbox imports',
    re.S,
)

require_once(
    r'  const \[miscueDrawerOpen,\s*setMiscueDrawerOpen\]\s*=\s*useState\(false\);',
    '''  const [miscueDrawerOpen, setMiscueDrawerOpen] = useState(false);
  const [miscueReviewMode, setMiscueReviewMode] = useState(false);''',
    'miscue review state',
)

require_once(
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

# Restore a draft when the teacher reloads/reopens the PWA.
marker = '  const fetchSession =\n'
if marker not in text:
    raise SystemExit('missing patch target: draft restore marker')
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

# ---------------------------------------------------------------------------
# Outbox flushing: include local stage updates and final commit records.
# ---------------------------------------------------------------------------
old_flush_filter = '''          if (
            !mutationId.startsWith("answer:") &&
            !mutationId.startsWith("advance:")
          ) {
            continue;
          }'''
new_flush_filter = '''          if (
            !mutationId.startsWith("answer:") &&
            !mutationId.startsWith("advance:") &&
            !mutationId.startsWith("stage:") &&
            !mutationId.startsWith("final:")
          ) {
            continue;
          }'''
if old_flush_filter not in text:
    raise SystemExit('missing patch target: outbox mutation filter')
text = text.replace(old_flush_filter, new_flush_filter, 1)

old_url = '''              const response = await fetch(
                `/api/assessment?action=${encodeURIComponent(
                  mutation.action
                )}`,
                {'''
new_url = '''              const endpoint =
                mutation.action === "commit_passage_assessment"
                  ? "/api/assessment/commit"
                  : `/api/assessment?action=${encodeURIComponent(
                      mutation.action
                    )}`;

              const response = await fetch(
                endpoint,
                {'''
if old_url not in text:
    raise SystemExit('missing patch target: outbox endpoint')
text = text.replace(old_url, new_url, 1)

# ---------------------------------------------------------------------------
# Polling: never overwrite local comprehension progress with a stale server
# question once local comprehension is already active.
# ---------------------------------------------------------------------------
old_poll = '''            if (serverStage === "comprehension") {
              const serverIndex =
                QUESTIONS.findIndex(
                  (question) =>
                    question.text === serverContent
                );

              if (serverIndex >= 0) {
                setQuestionIndex(serverIndex);
              }
            }'''
new_poll = '''            if (serverStage === "comprehension") {
              if (
                latestSessionRef.current?.stage !==
                "comprehension"
              ) {
                const serverIndex =
                  QUESTIONS.findIndex(
                    (question) =>
                      question.text === serverContent
                  );

                if (serverIndex >= 0) {
                  setQuestionIndex(serverIndex);
                }
              }
            }'''
if old_poll not in text:
    raise SystemExit('missing patch target: comprehension polling block')
text = text.replace(old_poll, new_poll, 1)

# ---------------------------------------------------------------------------
# Finish Reading becomes a local-first transition. It no longer writes
# PassageMiscue/SessionMetrics immediately. It moves to comprehension after
# the draft is safely placed in IndexedDB.
# ---------------------------------------------------------------------------
start = text.find('  const finishPassageReading =')
end = text.find('  const removePassageMiscue =', start)
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
                  storyTitle:
                    nextSession.story_title || "Para the Parrot",
                }),
              }
            );

            if (!response.ok) {
              throw new Error("Unable to synchronize comprehension stage.");
            }
          } catch {
            await putMutation({
              id: `stage:comprehension:${String(code).toUpperCase()}:0`,
              action: "host_update",
              payload: {
                code,
                stage: "comprehension",
                currentContent: QUESTIONS[0].text,
                storyTitle:
                  nextSession.story_title || "Para the Parrot",
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

# ---------------------------------------------------------------------------
# Passage miscues: local IndexedDB only until final assessment save.
# ---------------------------------------------------------------------------
start = text.find('  const removePassageMiscue =')
end = text.find('  useEffect(() => {\n    if (activeStage !== "passage")', start)
if start < 0 or end < 0:
    raise SystemExit('missing patch target: passage miscue functions')
new_miscues = '''  const removePassageMiscue =
    useCallback(
      async () => {
        const selectedIndex =
          Number(selectedPassageWord || 0) - 1;

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

  const recordPassageMiscue =
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
text = text[:start] + new_miscues + text[end:]

# ---------------------------------------------------------------------------
# Comprehension: local first, advance immediately, synchronize host separately.
# ---------------------------------------------------------------------------
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
          (a, b) =>
            Number(a.questionIndex) - Number(b.questionIndex)
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
          // Keep the server host session in comprehension until the teacher
          // explicitly saves the complete local draft. The local completed
          // state is protected by assessmentSaveLockRef from polling.
          const finalSession = {
            ...(latestSessionRef.current || {}),
            stage: "completed",
            ended: false,
            connected: true,
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

# ---------------------------------------------------------------------------
# Finish Reading opens the one-stage miscue review overlay directly.
# ---------------------------------------------------------------------------
require_once(
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

# ---------------------------------------------------------------------------
# Portal the existing miscue overlay to document.body so the darkness filter
# always covers the entire viewport, including content outside the transformed
# assessment card.
# ---------------------------------------------------------------------------
start = text.find('                    {miscueDrawerOpen && (')
end = text.find('                  </section>\n                )}\n\n                {activeStage ===\n                  "comprehension"', start)
if start < 0 or end < 0:
    raise SystemExit('missing patch target: miscue overlay location')
overlay_block = text[start:end]
if not overlay_block.rstrip().endswith('                    )}'):
    raise SystemExit('miscue overlay closing marker not found')
overlay_content = overlay_block
open_marker = '                    {miscueDrawerOpen && ('
close_marker = '                    )}'
body = overlay_content[len(open_marker):]
body = body.rsplit(close_marker, 1)[0]
portal = '''                    {miscueDrawerOpen && typeof document !== "undefined"
                      ? createPortal(
                          ''' + body.lstrip() + '''
                        ,
                        document.body
                      )
                      : null}
'''
text = text[:start] + portal + text[end:]

# Add review word picker into the existing drawer.
marker = '                        <div style={styles.miscueDrawer}>\n                          <div style={styles.miscueDrawerHeader}>'
review = '''                        <div style={styles.miscueDrawer}>\n                          {miscueReviewMode && (\n                            <div style={styles.miscueReviewSection}>\n                              <div style={styles.miscueReviewTitle}>\n                                Review passage miscues\n                              </div>\n                              <div style={styles.miscueReviewText}>\n                                Optionally press any word where you observed a miscue.\n                                You can leave every word unchanged if there are no miscues.\n                              </div>\n                              <div style={styles.miscueReviewWordGrid}>\n                                {passageText.split(/\\s+/).filter(Boolean).map((word, index) => {\n                                  const number = index + 1;\n                                  const annotation = passageMiscues.find(\n                                    (item) => Number(item.wordIndex) === index\n                                  );\n                                  return (\n                                    <button\n                                      key={`review-word-${index}`}\n                                      type="button"\n                                      style={{\n                                        ...styles.miscueReviewWordButton,\n                                        ...(annotation ? styles.miscueReviewWordMarked : {}),\n                                        ...(Number(selectedPassageWord) === number ? styles.miscueReviewWordSelected : {}),\n                                      }}\n                                      onClick={() => {\n                                        setSelectedPassageWord(number);\n                                        setMiscueWordIndex(number);\n                                        setSelectedMiscueType(annotation?.miscueType || null);\n                                        setMisreadWord(annotation?.misreadWord || "");\n                                      }}\n                                    >\n                                      {word}\n                                    </button>\n                                  );\n                                })}\n                              </div>\n                            </div>\n                          )}\n\n                          <div style={styles.miscueDrawerHeader}>'''
if marker not in text:
    raise SystemExit('missing patch target: review drawer marker')
text = text.replace(marker, review, 1)

# Keep the drawer open while applying review miscues and add one final confirm button.
old_close = '''                                  onClick={() => {\n                                    setSelectedMiscueType(\n                                      label\n                                    );\n\n                                    if (\n                                      label !== "Insertion" &&\n                                      label !== "Substitution"\n                                    ) {\n                                      void recordPassageMiscue(\n                                        selectedPassageWord,\n                                        label,\n                                        ""\n                                      );\n                                    }\n                                  }}'''
if old_close not in text:
    raise SystemExit('miscue type click handler not found')
# Handler stays structurally the same; local-only callback controls close behavior.

# Find the close of the miscue drawer expression after the portal now.
portal_start = text.find('                    {miscueDrawerOpen && typeof document')
portal_end = text.find('                  </section>\n                )}\n\n                {activeStage ===\n                  "comprehension"', portal_start)
if portal_start < 0 or portal_end < 0:
    raise SystemExit('portal block boundary not found after insertion')
portal_block = text[portal_start:portal_end]
close_seq = '\n                        </div>\n                      </div>\n'
pos = portal_block.rfind(close_seq)
if pos < 0:
    raise SystemExit('miscue drawer close sequence not found')
confirm = '''\n\n                          {miscueReviewMode && (\n                            <button\n                              type="button"\n                              style={styles.miscueReviewConfirmButton}\n                              onClick={() => {\n                                void finishPassageReading(\n                                  passageSeconds,\n                                  passageSeconds >= 120\n                                    ? passageWordsRead || 0\n                                    : 100\n                                );\n                              }}\n                              disabled={busy || passageFinalizingRef.current}\n                            >\n                              Confirm &amp; Continue\n                            </button>\n                          )}\n'''
# Insert just before the drawer-closing div.
insert_at = pos + len('\n')
portal_block = portal_block[:insert_at] + confirm + portal_block[insert_at:]
text = text[:portal_start] + portal_block + text[portal_end:]

# Closing review mode should also clear transient selection.
old_reset = '''                                setMiscueDrawerOpen(false);\n                                setSelectedPassageWord(null);\n                                setSelectedMiscueType(null);\n                                setMiscueWordIndex(1);\n                                setMisreadWord("");'''
new_reset = '''                                setMiscueDrawerOpen(false);\n                                setMiscueReviewMode(false);\n                                setSelectedPassageWord(null);\n                                setSelectedMiscueType(null);\n                                setMiscueWordIndex(1);\n                                setMisreadWord("");'''
if old_reset not in text:
    raise SystemExit('miscue close reset block not found')
text = text.replace(old_reset, new_reset, 1)

# ---------------------------------------------------------------------------
# Final save: normal completion commits the IndexedDB draft atomically;
# early Task 1 zero termination keeps its existing remarks-only endpoint.
# ---------------------------------------------------------------------------
start = text.find('  const saveTerminationObservation = useCallback(')
end = text.find('  const endSession =', start)
if start < 0 or end < 0:
    raise SystemExit('missing patch target: saveTerminationObservation')
new_save = '''  const saveTerminationObservation = useCallback(
    async () => {
      if (savingTerminationObservation) return;

      const remarks = terminationRemarks.trim();
      setSavingTerminationObservation(true);
      setTerminationObservationError("");

      try {
        if (activeStage === "completed") {
          const draft =
            (await getAssessmentState(
              `passage:${String(code).toUpperCase()}`
            )) ||
            passageDraftRef.current;

          const payload = {
            action: "commit_passage_assessment",
            code,
            timer_seconds: Number(draft.timerSeconds || 0),
            words_read: Number(draft.wordsRead ?? 100),
            miscues: Array.isArray(draft.miscues)
              ? draft.miscues
              : [],
            comprehension: Array.isArray(draft.comprehension)
              ? draft.comprehension
              : [],
            remarks,
          };

          let response = null;
          try {
            response = await fetch(
              "/api/assessment/commit",
              {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify(payload),
              }
            );
          } catch {}

          if (!response || !response.ok) {
            await putMutation({
              id: `final:${String(code).toUpperCase()}`,
              action: "commit_passage_assessment",
              payload,
              createdAt: Date.now(),
            });
            void flushAnswerQueue();
          } else {
            const data = await response.json();
            await removeAssessmentState(
              `passage:${String(code).toUpperCase()}`
            );
            passageDraftRef.current = {
              code,
              timerSeconds: 0,
              wordsRead: 100,
              miscues: [],
              comprehension: [],
            };

            setSession((current) => ({
              ...(current || {}),
              ended: true,
              connected: false,
              metrics: {
                ...(current?.metrics || {}),
                remarks: data.remarks || remarks,
                classification:
                  data.classification ||
                  current?.metrics?.classification ||
                  "Low Emerging Reader",
              },
            }));
          }
        } else {
          const response = await fetch(
            "/api/assessment?action=save_termination_observation",
            {
              method: "POST",
              credentials: "include",
              cache: "no-store",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                action: "save_termination_observation",
                code,
                remarks,
              }),
            }
          );

          const data = await response.json();
          if (!response.ok) {
            throw new Error(
              data?.error ||
                "Unable to save the learner observation."
            );
          }

          setSession((current) => ({
            ...(current || {}),
            metrics: {
              ...(current?.metrics || {}),
              remarks: data.remarks || "",
              classification:
                data.classification ||
                current?.metrics?.classification ||
                "Low Emerging Reader",
            },
          }));
        }

        setShowTerminationObservation(false);
        setTerminationObservationError("");
        assessmentSaveLockRef.current = false;

        try {
          localStorage.removeItem("crla_host_session");
        } catch {}

        window.location.replace("/teacher");
      } catch (saveError) {
        setTerminationObservationError(
          saveError?.message ||
            "Unable to save the assessment."
        );
      } finally {
        setSavingTerminationObservation(false);
      }
    },
    [
      activeStage,
      code,
      flushAnswerQueue,
      savingTerminationObservation,
      terminationRemarks,
    ]
  );

'''
text = text[:start] + new_save + text[end:]

# ---------------------------------------------------------------------------
# Styles for the review word picker and one-stage confirmation.
# ---------------------------------------------------------------------------
style_marker = '  miscueDrawerHeader: {'
style_block = '''  miscueReviewSection: {\n    marginBottom: "18px",\n    padding: "16px",\n    borderRadius: "16px",\n    background: "#f3f8fc",\n    border: "1px solid #dbe7f0",\n  },\n  miscueReviewTitle: {\n    color: "#1f4b69",\n    fontSize: "18px",\n    fontWeight: "950",\n  },\n  miscueReviewText: {\n    marginTop: "6px",\n    color: "#70869a",\n    fontSize: "13px",\n    lineHeight: 1.5,\n  },\n  miscueReviewWordGrid: {\n    display: "flex",\n    flexWrap: "wrap",\n    gap: "6px",\n    maxHeight: "220px",\n    overflowY: "auto",\n    marginTop: "12px",\n    padding: "10px",\n    borderRadius: "12px",\n    background: "#ffffff",\n    border: "1px solid #dfe9f1",\n  },\n  miscueReviewWordButton: {\n    border: "1px solid #d4e0ea",\n    borderRadius: "8px",\n    background: "#f8fbfe",\n    color: "#36536b",\n    padding: "5px 7px",\n    fontSize: "13px",\n    cursor: "pointer",\n  },\n  miscueReviewWordMarked: {\n    borderColor: "#e3ae6a",\n    background: "#fff2df",\n  },\n  miscueReviewWordSelected: {\n    boxShadow: "0 0 0 2px #2f73c9",\n    background: "#eaf3fb",\n    color: "#1559a6",\n  },\n  miscueReviewConfirmButton: {\n    width: "100%",\n    minHeight: "50px",\n    marginTop: "18px",\n    border: 0,\n    borderRadius: "13px",\n    background: "linear-gradient(145deg,#2f8f61,#1e744c)",\n    color: "#ffffff",\n    fontSize: "14px",\n    fontWeight: "950",\n    cursor: "pointer",\n  },\n\n'''
if style_marker not in text:
    raise SystemExit('missing patch target: review style marker')
text = text.replace(style_marker, style_block + style_marker, 1)

CLIENT.write_text(text)
print('AssessmentClient repair applied')
