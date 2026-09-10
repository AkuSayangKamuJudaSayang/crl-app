from pathlib import Path
import re

CLIENT = Path('app/teacher/assessment/AssessmentClient.jsx')

text = CLIENT.read_text()

# ---------------------------------------------------------------------------
# Imports: make the existing IndexedDB state API available to the assessment
# controller. The repository already owns this DB/outbox implementation.
# ---------------------------------------------------------------------------
old = '''import {\n  getMutations,\n  putMutation,\n  removeMutation,\n} from "../../../lib/assessmentOutbox";'''
new = '''import {\n  getAssessmentState,\n  getMutations,\n  putMutation,\n  removeAssessmentState,\n  removeMutation,\n  saveAssessmentState,\n} from "../../../lib/assessmentOutbox";'''
if old not in text:
    raise SystemExit('assessmentOutbox import not found')
text = text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# State for a single in-progress passage/comprehension draft.
# ---------------------------------------------------------------------------
old = '''  const [\n    miscueDrawerOpen,\n    setMiscueDrawerOpen,\n  ] = useState(false);'''
new = '''  const [\n    miscueDrawerOpen,\n    setMiscueDrawerOpen,\n  ] = useState(false);\n\n  const [\n    miscueReviewMode,\n    setMiscueReviewMode,\n  ] = useState(false);'''
if old not in text:
    raise SystemExit('miscueDrawer state not found')
text = text.replace(old, new, 1)

old = '''  const pendingAnswerRef =\n    useRef(false);'''
new = '''  const pendingAnswerRef =\n    useRef(false);\n\n  const passageDraftRef =\n    useRef({\n      code,\n      timerSeconds: 0,\n      wordsRead: 100,\n      miscues: [],\n      comprehension: [],\n    });\n\n  const persistPassageDraft = useCallback(\n    async (patch = {}) => {\n      passageDraftRef.current = {\n        ...passageDraftRef.current,\n        ...patch,\n        code,\n      };\n\n      await saveAssessmentState(\n        `passage:${String(code).toUpperCase()}`,\n        passageDraftRef.current\n      );\n\n      return passageDraftRef.current;\n    },\n    [code]\n  );'''
if old not in text:
    raise SystemExit('pendingAnswerRef not found')
text = text.replace(old, new, 1)

# Restore a draft after reload so a PWA can continue from local state first.
marker = '''  const fetchSession =\n    useCallback(\n'''
insert = '''  useEffect(() => {\n    if (!code) return;\n\n    void getAssessmentState(\n      `passage:${String(code).toUpperCase()}`\n    ).then((draft) => {\n      if (!draft) return;\n\n      passageDraftRef.current = {\n        ...passageDraftRef.current,\n        ...draft,\n        code,\n      };\n\n      if (Array.isArray(draft.miscues)) {\n        setPassageMiscues(draft.miscues);\n      }\n\n      if (Number.isFinite(Number(draft.timerSeconds))) {\n        setPassageSeconds(Number(draft.timerSeconds));\n      }\n\n      if (Number.isFinite(Number(draft.wordsRead))) {\n        setPassageWordsRead(Number(draft.wordsRead));\n      }\n\n      if (Array.isArray(draft.comprehension)) {\n        passageDraftRef.current.comprehension = draft.comprehension;\n        const maxAnswered = draft.comprehension.reduce(\n          (max, item) =>\n            Math.max(max, Number(item?.questionIndex ?? -1)),\n          -1\n        );\n        if (maxAnswered >= 0 && maxAnswered < QUESTIONS.length - 1) {\n          setQuestionIndex(maxAnswered + 1);\n        }\n      }\n    }).catch(() => {});\n  }, [code]);\n\n'''
if marker not in text:
    raise SystemExit('fetchSession marker not found')
text = text.replace(marker, insert + marker, 1)

# ---------------------------------------------------------------------------
# Stop host polling from rewinding an already-local comprehension question.
# ---------------------------------------------------------------------------
old = '''            if (serverStage === "comprehension") {\n              const serverIndex =\n                QUESTIONS.findIndex(\n                  (question) =>\n                    question.text === serverContent\n                );\n\n              if (serverIndex >= 0) {\n                setQuestionIndex(serverIndex);\n              }\n            }'''
new = '''            if (serverStage === "comprehension") {\n              // Once local comprehension is active, polling must not replay a\n              // stale server question over the teacher's next local item.\n              if (latestSessionRef.current?.stage !== "comprehension") {\n                const serverIndex =\n                  QUESTIONS.findIndex(\n                    (question) =>\n                      question.text === serverContent\n                  );\n\n                if (serverIndex >= 0) {\n                  setQuestionIndex(serverIndex);\n                }\n              }\n            }'''
if old not in text:
    raise SystemExit('comprehension polling block not found')
text = text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Replace passage finalization with local-first behavior. Manual Finish
# Reading records the draft and advances locally; only the final save commits
# passage+comprehension data to the server.
# ---------------------------------------------------------------------------
start = text.find('  const finishPassageReading =')
end = text.find('  useEffect(() => {\n    if (\n      timeUpSelectedWord === null', start)
if start < 0 or end < 0:
    raise SystemExit('finishPassageReading boundaries not found')
new_finish = '''  const finishPassageReading =\n    useCallback(\n      async (\n        secondsOverride,\n        wordsOverride\n      ) => {\n        if (passageFinalizingRef.current) return;\n\n        passageFinalizingRef.current = true;\n        setBusy(true);\n        setError("");\n\n        try {\n          const seconds = Math.min(\n            120,\n            Math.max(\n              0,\n              Number(secondsOverride ?? passageSeconds)\n            )\n          );\n\n          const wordsRead = Math.min(\n            100,\n            Math.max(\n              0,\n              Number(\n                wordsOverride ??\n                  (passageSeconds >= 120\n                    ? passageWordsRead || 0\n                    : 100)\n              )\n            )\n          );\n\n          await persistPassageDraft({\n            timerSeconds: Math.round(seconds),\n            wordsRead: Math.round(wordsRead),\n            miscues: passageMiscues.slice(),\n          });\n\n          setPassageSeconds(Math.round(seconds));\n          setPassageWordsRead(wordsRead);\n          setTimeUpSelecting(false);\n          setTimeUpReviewConfirmed(false);\n          setMiscueDrawerOpen(false);\n          setMiscueReviewMode(false);\n          setSelectedPassageWord(null);\n          setSelectedMiscueType(null);\n          setMisreadWord("");\n\n          if (passageTimerRef.current) {\n            window.clearInterval(passageTimerRef.current);\n            passageTimerRef.current = null;\n          }\n\n          const nextSession = {\n            ...(latestSessionRef.current || {}),\n            stage: "comprehension",\n            current_content: QUESTIONS[0].text,\n            currentContent: QUESTIONS[0].text,\n            story_title:\n              latestSessionRef.current?.story_title ||\n              "Para the Parrot",\n            storyTitle:\n              latestSessionRef.current?.storyTitle ||\n              "Para the Parrot",\n          };\n\n          latestSessionRef.current = nextSession;\n          latestActiveStageRef.current = "comprehension";\n          latestSessionVersionRef.current = Date.now();\n          setQuestionIndex(0);\n          setSession(nextSession);\n          setActiveStage("comprehension");\n\n          try {\n            const response = await fetch(\n              "/api/assessment?action=host_update",\n              {\n                method: "POST",\n                credentials: "include",\n                cache: "no-store",\n                headers: {\n                  "Content-Type": "application/json",\n                  Accept: "application/json",\n                },\n                body: JSON.stringify({\n                  action: "host_update",\n                  code,\n                  stage: "comprehension",\n                  currentContent: QUESTIONS[0].text,\n                  storyTitle: nextSession.story_title,\n                }),\n              }\n            );\n\n            if (!response.ok) throw new Error("host update failed");\n          } catch {\n            await putMutation({\n              id: `stage:comprehension:${String(code).toUpperCase()}:0`,\n              action: "host_update",\n              payload: {\n                code,\n                stage: "comprehension",\n                currentContent: QUESTIONS[0].text,\n                storyTitle: nextSession.story_title,\n              },\n              createdAt: Date.now(),\n            });\n          }\n\n          void publishAssessmentRealtimeState(code, nextSession);\n        } catch (error) {\n          setError(\n            error?.message ||\n              "Unable to finish the passage."\n          );\n        } finally {\n          passageFinalizingRef.current = false;\n          setBusy(false);\n        }\n      },\n      [\n        code,\n        passageMiscues,\n        passageSeconds,\n        passageWordsRead,\n        persistPassageDraft,\n      ]\n    );\n\n'''
text = text[:start] + new_finish + text[end:]

# ---------------------------------------------------------------------------
# Replace the two passage miscue network writers with local-only draft writes.
# ---------------------------------------------------------------------------
start = text.find('  const removePassageMiscue =')
end = text.find('  const recordPassageMiscue =', start)
if start < 0 or end < 0:
    raise SystemExit('removePassageMiscue boundaries not found')
new_remove = '''  const removePassageMiscue =\n    useCallback(\n      async () => {\n        const selectedIndex =\n          Number(selectedPassageWord || 0) - 1;\n\n        if (selectedIndex < 0 || selectedIndex >= 100) return;\n\n        const nextMiscues = passageMiscues.filter(\n          (item) => Number(item.wordIndex) !== selectedIndex\n        );\n\n        setPassageMiscues(nextMiscues);\n        setMiscueDrawerOpen(miscueReviewMode);\n        setSelectedPassageWord(miscueReviewMode ? selectedPassageWord : null);\n        setSelectedMiscueType(null);\n        setMisreadWord("");\n        setMiscueWordIndex(1);\n        setError("");\n\n        await persistPassageDraft({\n          miscues: nextMiscues,\n        });\n      },\n      [\n        selectedPassageWord,\n        selectedMiscueType,\n        passageMiscues,\n        code,\n        miscueReviewMode,\n        persistPassageDraft,\n      ]\n    );\n\n'''
text = text[:start] + new_remove + text[end:]

start = text.find('  const recordPassageMiscue =')
end = text.find('  useEffect(() => {\n    if (activeStage !== "passage")', start)
if start < 0 or end < 0:
    raise SystemExit('recordPassageMiscue boundaries not found')
new_record = '''  const recordPassageMiscue =\n    useCallback(\n      async (\n        selectedWordOverride,\n        typeOverride,\n        misreadWordOverride\n      ) => {\n        const selectedNumber = Number(\n          selectedWordOverride ?? selectedPassageWord ?? 0\n        );\n        const selectedIndex = selectedNumber - 1;\n\n        if (selectedIndex < 0 || selectedIndex >= 100) return;\n\n        const nextType = String(\n          typeOverride || selectedMiscueType || miscueType || "Substitution"\n        );\n        const nextMisreadWord = String(\n          misreadWordOverride ?? misreadWord ?? ""\n        ).trim();\n\n        if (\n          (nextType === "Insertion" || nextType === "Substitution") &&\n          !nextMisreadWord\n        ) {\n          setSelectedMiscueType(nextType);\n          return;\n        }\n\n        const optimistic = {\n          wordIndex: selectedIndex,\n          miscueType: nextType,\n          misreadWord: nextMisreadWord,\n        };\n\n        const nextMiscues = [\n          ...passageMiscues.filter(\n            (item) => Number(item.wordIndex) !== selectedIndex\n          ),\n          optimistic,\n        ];\n\n        setPassageMiscues(nextMiscues);\n        setError("");\n\n        if (!miscueReviewMode) {\n          setMiscueDrawerOpen(false);\n          setSelectedPassageWord(null);\n          setSelectedMiscueType(null);\n        }\n\n        setMisreadWord("");\n        setMiscueWordIndex(1);\n\n        await persistPassageDraft({\n          miscues: nextMiscues,\n        });\n      },\n      [\n        selectedPassageWord,\n        selectedMiscueType,\n        miscueType,\n        misreadWord,\n        passageMiscues,\n        code,\n        miscueReviewMode,\n        persistPassageDraft,\n      ]\n    );\n\n'''
text = text[:start] + new_record + text[end:]

# Reset review-mode transient state when passage is left.
needle = '''      setMiscueDrawerOpen(false);\n      setSelectedPassageWord(null);\n      setSelectedMiscueType(null);\n      setPassageMiscues([]);'''
replacement = '''      setMiscueDrawerOpen(false);\n      setMiscueReviewMode(false);\n      setSelectedPassageWord(null);\n      setSelectedMiscueType(null);\n      setPassageMiscues([]);'''
if needle not in text:
    raise SystemExit('passage reset block not found')
text = text.replace(needle, replacement, 1)

# ---------------------------------------------------------------------------
# Comprehension: write into IndexedDB, advance local state first, asynchronously
# update the host for learner synchronization. Final save commits the database.
# ---------------------------------------------------------------------------
start = text.find('  const recordComprehension =')
end = text.find('  const finalize =', start)
if start < 0 or end < 0:
    raise SystemExit('recordComprehension boundaries not found')
new_comp = '''  const recordComprehension =\n    async (isCorrect) => {\n      const lockKey =\n        "comprehension:" + questionIndex;\n\n      if (\n        answerActionLockRef.current === lockKey ||\n        pendingAnswerRef.current\n      ) {\n        return;\n      }\n\n      answerActionLockRef.current = lockKey;\n      setAnswerLockKey(lockKey);\n      setBusy(true);\n      pendingAnswerRef.current = true;\n\n      try {\n        const existing =\n          Array.isArray(passageDraftRef.current.comprehension)\n            ? passageDraftRef.current.comprehension\n            : [];\n\n        const nextComprehension = [\n          ...existing.filter(\n            (item) => Number(item.questionIndex) !== questionIndex\n          ),\n          {\n            questionIndex,\n            isCorrect: Boolean(isCorrect),\n          },\n        ].sort(\n          (a, b) =>\n            Number(a.questionIndex) - Number(b.questionIndex)\n        );\n\n        await persistPassageDraft({\n          comprehension: nextComprehension,\n        });\n\n        const nextIndex = questionIndex + 1;\n\n        if (nextIndex < QUESTIONS.length) {\n          const nextQuestion = QUESTIONS[nextIndex];\n          const nextSession = {\n            ...(latestSessionRef.current || {}),\n            stage: "comprehension",\n            current_content: nextQuestion.text,\n            currentContent: nextQuestion.text,\n          };\n\n          setQuestionIndex(nextIndex);\n          latestSessionRef.current = nextSession;\n          latestActiveStageRef.current = "comprehension";\n          latestSessionVersionRef.current = Date.now();\n          setSession(nextSession);\n          setActiveStage("comprehension");\n          void publishAssessmentRealtimeState(code, nextSession);\n\n          void (async () => {\n            try {\n              const response = await fetch(\n                "/api/assessment?action=host_update",\n                {\n                  method: "POST",\n                  credentials: "include",\n                  cache: "no-store",\n                  headers: {\n                    "Content-Type": "application/json",\n                    Accept: "application/json",\n                  },\n                  body: JSON.stringify({\n                    action: "host_update",\n                    code,\n                    stage: "comprehension",\n                    currentContent: nextQuestion.text,\n                    storyTitle:\n                      nextSession.story_title || "Para the Parrot",\n                  }),\n                }\n              );\n              if (!response.ok) throw new Error("host update failed");\n            } catch {\n              await putMutation({\n                id: `stage:comprehension:${String(code).toUpperCase()}:${nextIndex}`,\n                action: "host_update",\n                payload: {\n                  code,\n                  stage: "comprehension",\n                  currentContent: nextQuestion.text,\n                  storyTitle:\n                    nextSession.story_title || "Para the Parrot",\n                },\n                createdAt: Date.now(),\n              });\n            }\n          })();\n        } else {\n          const finalSession = {\n            ...(latestSessionRef.current || {}),\n            stage: "completed",\n            ended: true,\n            connected: false,\n            current_content: "Assessment completed.",\n            currentContent: "Assessment completed.",\n          };\n\n          latestSessionRef.current = finalSession;\n          latestActiveStageRef.current = "completed";\n          setSession(finalSession);\n          setActiveStage("completed");\n          terminationObservationHandledRef.current = true;\n          openAssessmentSaveModal(finalSession);\n        }\n      } catch (recordError) {\n        answerActionLockRef.current = "";\n        setAnswerLockKey("");\n        setError(\n          recordError.message ||\n            "Unable to record result."\n        );\n      } finally {\n        pendingAnswerRef.current = false;\n        setBusy(false);\n      }\n    };\n\n'''
text = text[:start] + new_comp + text[end:]

# ---------------------------------------------------------------------------
# Finish Reading button opens the review overlay directly instead of the old
# confirmation dialog.
# ---------------------------------------------------------------------------
old = '''                            onClick={() =>\n                              setConfirmFinishReading(\n                                true\n                              )\n                            }'''
new = '''                            onClick={() => {\n                              setMiscueReviewMode(true);\n                              setMiscueDrawerOpen(true);\n                              setSelectedPassageWord(null);\n                              setSelectedMiscueType(null);\n                              setMisreadWord("");\n                              setError("");\n                            }}'''
if old not in text:
    raise SystemExit('Finish Reading click handler not found')
text = text.replace(old, new, 1)

# Remove old Finish Reading confirmation modal entirely.
text = re.sub(
    r'\n        \{confirmFinishReading && \(.*?\n        \}\)\}\n',
    '\n',
    text,
    count=1,
    flags=re.S,
)

# ---------------------------------------------------------------------------
# Final save: commit the locally staged passage + comprehension rows atomically.
# Keep the existing early-termination save route unchanged.
# ---------------------------------------------------------------------------
start = text.find('  const saveTerminationObservation = useCallback(')
end = text.find('  const endSession =', start)
if start < 0 or end < 0:
    raise SystemExit('saveTerminationObservation boundaries not found')
new_save = '''  const saveTerminationObservation = useCallback(\n    async () => {\n      if (savingTerminationObservation) return;\n\n      const remarks = terminationRemarks.trim();\n      setSavingTerminationObservation(true);\n      setTerminationObservationError("");\n\n      try {\n        if (activeStage === "completed") {\n          const draft =\n            (await getAssessmentState(\n              `passage:${String(code).toUpperCase()}`\n            )) ||\n            passageDraftRef.current;\n\n          const payload = {\n            action: "commit_passage_assessment",\n            code,\n            timer_seconds: Number(draft.timerSeconds || 0),\n            words_read: Number(draft.wordsRead ?? 100),\n            miscues: Array.isArray(draft.miscues) ? draft.miscues : [],\n            comprehension: Array.isArray(draft.comprehension)\n              ? draft.comprehension\n              : [],\n            remarks,\n          };\n\n          let response = null;\n          try {\n            response = await fetch(\n              "/api/assessment/commit",\n              {\n                method: "POST",\n                credentials: "include",\n                cache: "no-store",\n                headers: {\n                  "Content-Type": "application/json",\n                  Accept: "application/json",\n                },\n                body: JSON.stringify(payload),\n              }\n            );\n          } catch {}\n\n          if (!response || !response.ok) {\n            await putMutation({\n              id: `final:${String(code).toUpperCase()}`,\n              action: "commit_passage_assessment",\n              payload,\n              createdAt: Date.now(),\n            });\n            void flushAnswerQueue();\n          } else {\n            const data = await response.json();\n            await removeAssessmentState(\n              `passage:${String(code).toUpperCase()}`\n            );\n            passageDraftRef.current = {\n              code,\n              timerSeconds: 0,\n              wordsRead: 100,\n              miscues: [],\n              comprehension: [],\n            };\n\n            setSession((current) => ({\n              ...(current || {}),\n              metrics: {\n                ...(current?.metrics || {}),\n                remarks: data.remarks || remarks,\n                classification:\n                  data.classification ||\n                  current?.metrics?.classification ||\n                  "Low Emerging Reader",\n              },\n            }));\n          }\n        } else {\n          const response = await fetch(\n            "/api/assessment?action=save_termination_observation",\n            {\n              method: "POST",\n              credentials: "include",\n              cache: "no-store",\n              headers: {\n                "Content-Type": "application/json",\n                Accept: "application/json",\n              },\n              body: JSON.stringify({\n                action: "save_termination_observation",\n                code,\n                remarks,\n              }),\n            }\n          );\n\n          const data = await response.json();\n          if (!response.ok) {\n            throw new Error(\n              data?.error ||\n                "Unable to save the learner observation."\n            );\n          }\n\n          setSession((current) => ({\n            ...(current || {}),\n            metrics: {\n              ...(current?.metrics || {}),\n              remarks: data.remarks || "",\n              classification:\n                data.classification ||\n                current?.metrics?.classification ||\n                "Low Emerging Reader",\n            },\n          }));\n        }\n\n        setShowTerminationObservation(false);\n        setTerminationObservationError("");\n        assessmentSaveLockRef.current = false;\n\n        try {\n          localStorage.removeItem("crla_host_session");\n        } catch {}\n\n        window.location.replace("/teacher");\n      } catch (saveError) {\n        setTerminationObservationError(\n          saveError?.message ||\n            "Unable to save the assessment."\n        );\n      } finally {\n        setSavingTerminationObservation(false);\n      }\n    },\n    [\n      activeStage,\n      code,\n      flushAnswerQueue,\n      savingTerminationObservation,\n      terminationRemarks,\n    ]\n  );\n\n'''
text = text[:start] + new_save + text[end:]

# ---------------------------------------------------------------------------
# Build the review-mode UI into the existing miscue drawer.
# ---------------------------------------------------------------------------
marker = '''                        <div style={styles.miscueDrawer}>\n                          <div style={styles.miscueDrawerHeader}>'''
review = '''                        <div style={styles.miscueDrawer}>\n                          {miscueReviewMode && (\n                            <div style={styles.miscueReviewSection}>\n                              <div style={styles.miscueReviewTitle}>\n                                Review passage miscues\n                              </div>\n                              <div style={styles.miscueReviewText}>\n                                Optionally press any word where you observed a miscue.\n                                If there are none, press Confirm &amp; Continue.\n                              </div>\n                              <div style={styles.miscueReviewWordGrid}>\n                                {passageText.split(/\\s+/).filter(Boolean).map((word, index) => {\n                                  const number = index + 1;\n                                  const annotation = passageMiscues.find(\n                                    (item) => Number(item.wordIndex) === index\n                                  );\n                                  return (\n                                    <button\n                                      key={`review-word-${index}`}\n                                      type="button"\n                                      style={{\n                                        ...styles.miscueReviewWordButton,\n                                        ...(annotation ? styles.miscueReviewWordMarked : {}),\n                                        ...(Number(selectedPassageWord) === number ? styles.miscueReviewWordSelected : {}),\n                                      }}\n                                      onClick={() => {\n                                        setSelectedPassageWord(number);\n                                        setMiscueWordIndex(number);\n                                        setSelectedMiscueType(annotation?.miscueType || null);\n                                        setMisreadWord(annotation?.misreadWord || "");\n                                      }}\n                                    >\n                                      {word}\n                                    </button>\n                                  );\n                                })}\n                              </div>\n                            </div>\n                          )}\n\n                          <div style={styles.miscueDrawerHeader}>'''
if marker not in text:
    raise SystemExit('miscue drawer marker not found')
text = text.replace(marker, review, 1)

# Keep drawer open after applying a miscue in review mode. The current code
# closes the drawer unconditionally in several places; replace the exact
# close block occurring in the drawer's apply section.
old_close = '''                                  onClick={() => {\n                                    setSelectedMiscueType(\n                                      label\n                                    );\n\n                                    if (\n                                      label !== "Insertion" &&\n                                      label !== "Substitution"\n                                    ) {\n                                      void recordPassageMiscue(\n                                        selectedPassageWord,\n                                        label,\n                                        ""\n                                      );\n                                    }\n                                  }}'''
# No structural change is needed here; recordPassageMiscue now owns the close behavior.
if old_close not in text:
    raise SystemExit('miscue type button handler not found')

end_marker = '''                          )}\n                        </div>\n                      </div>\n                    )}\n                  </section>'''
confirm = '''                          )}\n\n                          {miscueReviewMode && (\n                            <button\n                              type="button"\n                              style={styles.miscueReviewConfirmButton}\n                              onClick={() => {\n                                void finishPassageReading(\n                                  passageSeconds,\n                                  passageSeconds >= 120\n                                    ? passageWordsRead || 0\n                                    : 100\n                                );\n                              }}\n                              disabled={busy || passageFinalizingRef.current}\n                            >\n                              Confirm &amp; Continue\n                            </button>\n                          )}\n                        </div>\n                      </div>\n                    )}\n                  </section>'''
if end_marker not in text:
    raise SystemExit('miscue drawer ending not found')
text = text.replace(end_marker, confirm, 1)

# Move the whole miscue overlay to the root modal layer, outside the assessment
# card that has transforms/overflow. This guarantees true viewport dimming.
overlay = re.search(r'\n                    \{miscueDrawerOpen && \(\n.*?\n                    \)\}\n', text, re.S)
if not overlay:
    raise SystemExit('miscue overlay not found')
overlay_text = overlay.group(0)
text = text[:overlay.start()] + '\n' + text[overlay.end():]
root_marker = '        {confirmEndSession && ('
if root_marker not in text:
    raise SystemExit('root modal marker not found')
text = text.replace(root_marker, overlay_text.replace('                    ', '        ') + '\n' + root_marker, 1)

# ---------------------------------------------------------------------------
# Styles for review mode.
# ---------------------------------------------------------------------------
style_marker = '  miscueDrawerHeader: {'
review_styles = '''  miscueReviewSection: {\n    marginBottom: "18px",\n    padding: "16px",\n    borderRadius: "16px",\n    background: "#f3f8fc",\n    border: "1px solid #dbe7f0",\n  },\n\n  miscueReviewTitle: {\n    color: "#1f4b69",\n    fontSize: "18px",\n    fontWeight: "950",\n  },\n\n  miscueReviewText: {\n    marginTop: "6px",\n    color: "#70869a",\n    fontSize: "13px",\n    lineHeight: 1.5,\n  },\n\n  miscueReviewWordGrid: {\n    display: "flex",\n    flexWrap: "wrap",\n    gap: "6px",\n    maxHeight: "220px",\n    overflowY: "auto",\n    marginTop: "12px",\n    padding: "10px",\n    borderRadius: "12px",\n    background: "#ffffff",\n    border: "1px solid #dfe9f1",\n  },\n\n  miscueReviewWordButton: {\n    border: "1px solid #d4e0ea",\n    borderRadius: "8px",\n    background: "#f8fbfe",\n    color: "#36536b",\n    padding: "5px 7px",\n    fontSize: "13px",\n    cursor: "pointer",\n  },\n\n  miscueReviewWordMarked: {\n    borderColor: "#e3ae6a",\n    background: "#fff2df",\n  },\n\n  miscueReviewWordSelected: {\n    boxShadow: "0 0 0 2px #2f73c9",\n    background: "#eaf3fb",\n    color: "#1559a6",\n  },\n\n  miscueReviewConfirmButton: {\n    width: "100%",\n    minHeight: "50px",\n    marginTop: "18px",\n    border: 0,\n    borderRadius: "13px",\n    background: "linear-gradient(145deg,#2f8f61,#1e744c)",\n    color: "#ffffff",\n    fontSize: "14px",\n    fontWeight: "950",\n    cursor: "pointer",\n  },\n\n'''
if style_marker not in text:
    raise SystemExit('style insertion marker not found')
text = text.replace(style_marker, review_styles + style_marker, 1)

# Ensure the reduced-motion full-screen overlay still behaves correctly and
# retain existing styling otherwise.
CLIENT.write_text(text)
print('patched', CLIENT)
