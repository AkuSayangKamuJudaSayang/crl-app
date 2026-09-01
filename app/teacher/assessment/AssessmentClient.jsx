"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  countMutations,
  getMutations,
  getAssessmentState,
  putMutation,
  removeMutation,
  saveAssessmentState,
} from "../../../lib/assessmentOutbox";

const LETTERS = [
  "M",
  "S",
  "A",
  "L",
  "O",
  "B",
  "E",
  "U",
  "R",
  "T",
];

const WORDS = [
  "clap",
  "jump",
  "eat",
  "drink",
  "stand",
  "dance",
  "fly",
  "pencil",
  "basket",
  "helmet",
];

const STORIES = [
  {
    id: 1,
    title: "Para The Parrot",
    description: "A story about a parrot flying to the market.",
    text: "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.",
    questions: [
      { index: 0, text: "What must Para look for?" },
      { index: 1, text: "What time or part of the day is it?" },
      { index: 2, text: "What does Para land on?" },
      { index: 3, text: "Who does Para see?" },
      { index: 4, text: "What else is the police officer doing besides directing traffic?" },
      { index: 5, text: "What could the police officer be feeling?" },
    ],
  },
  {
    id: 2,
    title: "A Day In The Fields",
    description: "Join the farmers as they work in the terraces.",
    text: "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil.",
    questions: [
      { index: 0, text: "Who is Dulnuwan?" },
      { index: 1, text: "Who helps Dulnuwan in the fields?" },
      { index: 2, text: "What does Dulnuwan prepare?" },
      { index: 3, text: "What do the workers do all morning?" },
      { index: 4, text: "Where do they rest and eat lunch?" },
      { index: 5, text: "How does Dulnuwan feel about their work?" },
    ],
  },
];

const DEFAULT_QUESTIONS = STORIES[0].questions;


const QUESTIONS = [
  {
    index: 0,
    text: "What must Para look for?",
  },
  {
    index: 1,
    text: "What time or part of the day is it?",
  },
  {
    index: 2,
    text: "What does Para land on?",
  },
  {
    index: 3,
    text: "Who does Para see?",
  },
  {
    index: 4,
    text:
      "What else is the police officer doing besides directing traffic?",
  },
  {
    index: 5,
    text:
      "What could the police officer be feeling?",
  },
];

export default function TeacherAssessmentPage() {
  const searchParams =
    useSearchParams();

  const code =
    searchParams.get(
      "code"
    ) || "";

  const learnerId =
    searchParams.get(
      "learner_id"
    ) || "";

  const period =
    searchParams.get(
      "period"
    ) || "BoSY";

  const [
    session,
    setSession,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    confirmEndSession,
    setConfirmEndSession,
  ] = useState(false);

  const [
    showCompletionOverlay,
    setShowCompletionOverlay,
  ] = useState(false);

  const completionShownRef =
    useRef(false);

  const sessionWasConnectedRef =
    useRef(false);

  const [
    completionSummary,
    setCompletionSummary,
  ] = useState(null);

  const [
    observationLevel,
    setObservationLevel,
  ] = useState("");

  const [
    remarks,
    setRemarks,
  ] = useState("");

  const [
    savingFeedback,
    setSavingFeedback,
  ] = useState(false);

  const [
    activeStage,
    setActiveStage,
  ] = useState(
    "waiting"
  );

  const [
    letterIndex,
    setLetterIndex,
  ] = useState(0);

  const [
    wordIndex,
    setWordIndex,
  ] = useState(0);

  const [
    questionIndex,
    setQuestionIndex,
  ] = useState(0);

  const [
    passageSeconds,
    setPassageSeconds,
  ] = useState(0);

  const [
    passageWordsRead,
    setPassageWordsRead,
  ] = useState(100);

  const [
    miscueType,
    setMiscueType,
  ] = useState("Substitution");

  const [
    miscueWordIndex,
    setMiscueWordIndex,
  ] = useState(1);

  const [
    misreadWord,
    setMisreadWord,
  ] = useState("");

  const [
    recordingMiscue,
    setRecordingMiscue,
  ] = useState(false);

  const [
    selectedMiscueWordIndex,
    setSelectedMiscueWordIndex,
  ] = useState(null);

  const [
    miscueModalOpen,
    setMiscueModalOpen,
  ] = useState(false);

  const [
    passagePaused,
    setPassagePaused,
  ] = useState(false);

  const [
    passageTimerExpired,
    setPassageTimerExpired,
  ] = useState(false);

  const [
    lastWordIndex,
    setLastWordIndex,
  ] = useState(null);

  const [
    passageMiscues,
    setPassageMiscues,
  ] = useState({});

  const [
    hoveredMiscueType,
    setHoveredMiscueType,
  ] = useState("");

  const [
    passageTransitioning,
    setPassageTransitioning,
  ] = useState(false);

  const pendingWritesRef = useRef(0);
  const lastLocalMutationAtRef = useRef(0);
  const fetchInFlightRef = useRef(false);
  const sessionRef = useRef(null);
  const outboxFlushInFlightRef = useRef(false);
  const applyServerNextRef = useRef(null);
  const flushOutboxRef = useRef(null);
  const processingMutationIdsRef = useRef(new Set());

  const [pendingLocalWrites, setPendingLocalWrites] = useState(0);
  const [syncStatus, setSyncStatus] = useState("");

  const requestInFlightRef = useRef(false);
  const passageTimerRef = useRef(null);
  const passageTimerSessionKeyRef = useRef("");
  const passageTimerStateRef = useRef({ baseSeconds: 0, runningSince: null });
  const passageSecondsRef = useRef(0);
  const passageFinalizingRef = useRef(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const selectedStory =
    STORIES.find((story) => story.title === session?.story_title) || STORIES[0];

  const currentQuestions = selectedStory?.questions || DEFAULT_QUESTIONS;
  const currentQuestion = currentQuestions[questionIndex];

  const passageWords = useMemo(
    () =>
      String(session?.current_content || selectedStory?.text || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean),
    [session?.current_content, selectedStory?.text]
  );

  const requestMutation = useCallback(async (action, payload) => {
    const response = await fetch(
      `/api/assessment?action=${encodeURIComponent(action)}`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action, ...payload }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Unable to save ${action}.`);
    }
    return data;
  }, []);

  // Persist first. Network synchronization is deliberately decoupled from the click path.
  const enqueueMutation = useCallback(async (action, payload) => {
    const mutationId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    const entry = { id: mutationId, action, payload, createdAt: Date.now() };

    try {
      const stored = await putMutation(entry);
      if (stored) {
        pendingWritesRef.current += 1;
        lastLocalMutationAtRef.current = Date.now();
        setPendingLocalWrites((value) => value + 1);
        setSyncStatus(navigator.onLine ? "Saved locally • syncing" : "Saved locally • waiting for connection");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("crl:flush-outbox"));
        }
        return undefined;
      }
    } catch (error) {
      // Fall through to the direct network path when IndexedDB is unavailable.
      console.warn("Assessment local queue unavailable:", error);
    }

    return requestMutation(action, payload);
  }, [requestMutation]);

  const fetchSession =
    useCallback(
      async () => {
        if (
          fetchInFlightRef.current
        ) {
          return;
        }

      if (!code) {
        setError(
          "Assessment code is missing."
        );
        setLoading(
          false
        );
        return;
      }

      fetchInFlightRef.current =
        true;

      try {
        const response =
          await fetch(
            `/api/assessment?action=host_get&code=${encodeURIComponent(
              code
            )}`,
            {
              credentials:
                "include",
              cache:
                "no-store",
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to retrieve assessment session."
          );
        }

        const preserveOptimistic =
          pendingWritesRef.current > 0 ||
          Date.now() - lastLocalMutationAtRef.current < 1800;

        if (!preserveOptimistic) {
          sessionRef.current = data.session;
        } else if (!sessionRef.current) {
          sessionRef.current = data.session;
        }

        if (!preserveOptimistic) {
          setPassagePaused(Boolean(data.session?.timer_paused));
        }

        const incomingMiscues = data.session?.metrics?.miscues || [];
        const serverMiscueMap = incomingMiscues.reduce(
          (map, item) => ({
            ...map,
            [Number(item.wordIndex ?? item.word_index)]:
              item.miscueType ?? item.miscue_type,
          }),
          {}
        );

        setPassageMiscues((current) =>
          preserveOptimistic ? { ...serverMiscueMap, ...current } : serverMiscueMap
        );

        if (
          preserveOptimistic
        ) {
          setSession(
            (current) =>
              current
                ? {
                    ...current,
                    connected:
                      data.session?.connected ??
                      current.connected,
                    learner_id:
                      data.session?.learner_id ??
                      current.learner_id,
                    learner:
                      data.session?.learner ??
                      current.learner,
                    ended:
                      data.session?.ended ??
                      current.ended,
                  }
                : data.session
          );
        } else {
          setSession(
            data.session
          );
        }

        if (
          data.session?.connected
        ) {
          sessionWasConnectedRef.current =
            true;
        }

        if (
          data.session?.ended &&
          data.session?.assessment_completed &&
          sessionWasConnectedRef.current &&
          !completionShownRef.current
        ) {
          const metrics =
            data.session?.metrics ||
            null;

          setCompletionSummary({
            task1Score:
              Number(metrics?.task1Score || 0),
            task2Score:
              Number(metrics?.task2Score || 0),
            comprehensionScore:
              Number(metrics?.comprehensionScore || 0),
            totalMiscues:
              Number(metrics?.totalMiscues || 0),
            miscueAccuracy:
              metrics?.miscueAccuracy ?? 0,
            classification:
              metrics?.classificationLabel ||
              (
                Number(
                  metrics?.task1Score ||
                  0
                ) === 0
                  ? "Low Emerging Reader"
                  : "Not available"
              ),
            experienceRating:
              metrics?.experienceRating ??
              null,
            observationLevel:
              metrics?.observationLevel ??
              null,
            remarks:
              metrics?.remarks ||
              "",
          });

          setObservationLevel(
            metrics?.observationLevel
              ? String(
                  metrics.observationLevel
                )
              : ""
          );

          setRemarks(
            metrics?.remarks ||
              ""
          );

          completionShownRef.current =
            true;
          setShowCompletionOverlay(true);
        }

        if (
          data.session
            ?.stage &&
          !preserveOptimistic
        ) {
          const serverStage =
            data.session.stage;

          setActiveStage(
            serverStage ===
              "passage_paused"
              ? "passage"
              : serverStage
          );

          const serverContent =
            String(
              data.session
                ?.current_content ??
                data.session
                  ?.currentContent ??
                ""
            );

          if (
            serverStage ===
            "letter"
          ) {
            const serverIndex =
              LETTERS.indexOf(
                serverContent
              );

            if (
              serverIndex >=
              0
            ) {
              setLetterIndex(
                serverIndex
              );
            }
          }

          if (
            serverStage ===
            "word"
          ) {
            const serverIndex =
              WORDS.indexOf(
                serverContent
              );

            if (
              serverIndex >=
              0
            ) {
              setWordIndex(
                serverIndex
              );
            }
          }

          if (
            serverStage ===
            "comprehension"
          ) {
            const storyForQuestions =
              STORIES.find(
                (story) =>
                  story.title ===
                  data.session?.story_title
              ) ||
              STORIES[0];

            const serverIndex =
              storyForQuestions.questions.findIndex(
                (question) =>
                  question.text ===
                  serverContent
              );

            if (
              serverIndex >=
              0
            ) {
              setQuestionIndex(
                serverIndex
              );
            }
          }
        }
      } catch (fetchError) {
        /*
         * Keep a previously loaded assessment visible during a transient
         * polling failure. The next poll will retry automatically.
         */
        if (!sessionRef.current) {
          setError(
            fetchError.message ||
              "Unable to load assessment."
          );
        }
      } finally {
        fetchInFlightRef.current =
          false;

        setLoading(
          false
        );
      }
      },
      [code]
    );


  const applyServerNext =
    useCallback(
      (next) => {
        if (
          !next ||
          typeof next !==
            "object"
        ) {
          return;
        }

        const nextStage =
          next.stage || "";

        if (
          !nextStage
        ) {
          return;
        }

        const normalizedStage = nextStage === "passage_paused" ? "passage" : nextStage;

        setActiveStage(normalizedStage);

        setSession(
          (current) =>
            current
              ? {
                  ...current,
                  stage:
                    nextStage,
                  timer_paused:
                    nextStage === "passage_paused"
                      ? true
                      : current.timer_paused,
                  current_content:
                    next.content ??
                    current.current_content,
                  currentContent:
                    next.content ??
                    current.currentContent,
                  story_title:
                    next.storyTitle ??
                    current.story_title,
                  storyTitle:
                    next.storyTitle ??
                    current.storyTitle,
                }
              : current
        );

        if (
          nextStage ===
          "letter" &&
          Number.isInteger(
            next.index
          )
        ) {
          setLetterIndex(
            next.index
          );
        }

        if (
          nextStage ===
          "word" &&
          Number.isInteger(
            next.index
          )
        ) {
          setWordIndex(
            next.index
          );
        }

        if (
          nextStage ===
          "comprehension" &&
          Number.isInteger(
            next.index
          )
        ) {
          setQuestionIndex(
            next.index
          );
        }

        if (
          nextStage ===
          "story_choice"
        ) {
          setWordIndex(
            WORDS.length
          );
        }
      },
      []
    );

  const flushOutbox = useCallback(async () => {
    if (outboxFlushInFlightRef.current || typeof navigator === "undefined" || !navigator.onLine) return;
    outboxFlushInFlightRef.current = true;

    try {
      const entries = await getMutations();
      pendingWritesRef.current = Math.max(pendingWritesRef.current, entries.length);
      setPendingLocalWrites(entries.length);
      for (const entry of entries) {
        if (processingMutationIdsRef.current.has(entry.id)) continue;
        processingMutationIdsRef.current.add(entry.id);

        try {
          const data = await requestMutation(entry.action, entry.payload);
          await removeMutation(entry.id);
          pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
          lastLocalMutationAtRef.current = Date.now();
          setPendingLocalWrites((value) => Math.max(0, value - 1));

          if (data?.next) applyServerNextRef.current?.(data.next);
          if (data?.stage) {
            const normalizedStage = data.stage === "passage_paused" ? "passage" : data.stage;
            setActiveStage(normalizedStage);
            setSession((current) =>
              current
                ? {
                    ...current,
                    stage: data.stage,
                    timer_paused:
                      typeof data.paused === "boolean"
                        ? data.paused
                        : current.timer_paused,
                    current_content: data.current_content ?? current.current_content,
                    currentContent: data.current_content ?? current.currentContent,
                    story_title: data.story_title ?? current.story_title,
                    storyTitle: data.story_title ?? current.storyTitle,
                  }
                : current
            );
          }
          if (data?.scoring?.hardTerminate || data?.completed || data?.terminated) {
            await fetchSession();
          }
        } catch (error) {
          setSyncStatus(
            navigator.onLine
              ? "Saved locally • syncing"
              : "Saved locally • waiting for connection"
          );
          break;
        } finally {
          processingMutationIdsRef.current.delete(entry.id);
        }
      }

      const remaining = await countMutations();
      setPendingLocalWrites(remaining);
      pendingWritesRef.current = remaining;
      setSyncStatus(remaining ? "Saved locally • syncing" : "");
    } catch {
      setSyncStatus("Saved locally • syncing");
    } finally {
      outboxFlushInFlightRef.current = false;
    }
  }, [fetchSession, requestMutation]);

  flushOutboxRef.current = flushOutbox;

  const finishPassageReading = useCallback(
    async (secondsOverride, forcedLastWordIndex = null) => {
      if (passageFinalizingRef.current) return;

      const selectedLast = Number.isInteger(forcedLastWordIndex)
        ? forcedLastWordIndex
        : lastWordIndex;

      if (!Number.isInteger(selectedLast) || selectedLast < 0) {
        setError("Select the actual last word read in the passage.");
        return;
      }

      passageFinalizingRef.current = true;
      setError("");
      setPassageTransitioning(true);

      if (passageTimerRef.current) {
        window.clearInterval(passageTimerRef.current);
        passageTimerRef.current = null;
      }

      const seconds = Math.min(120, Math.max(0, Number(
        secondsOverride ?? passageSecondsRef.current
      )));
      const wordsRead = Math.min(100, Math.max(0, selectedLast + 1));

      passageSecondsRef.current = Math.round(seconds);
      setPassageSeconds(Math.round(seconds));
      passageTimerStateRef.current = {
        baseSeconds: Math.round(seconds),
        runningSince: null,
      };
      setPassagePaused(false);

      // Move the UI immediately. The database write is safely queued first.
      const nextQuestion = currentQuestions[0];
      setQuestionIndex(0);
      setActiveStage("comprehension");
      setSession((current) =>
        current
          ? {
              ...current,
              stage: "comprehension",
              current_content: nextQuestion?.text || "",
              currentContent: nextQuestion?.text || "",
            }
          : current
      );

      try {
        await saveAssessmentState(code, {
          stage: "comprehension",
          timerSeconds: Math.round(seconds),
          timerPaused: true,
          timerRunningSince: null,
          storyTitle: selectedStory?.title || "",
          lastWordIndex: selectedLast,
          miscues: passageMiscues,
        });

        await enqueueMutation("finish_passage", {
          code,
          timer_seconds: Math.round(seconds),
          words_read: Math.round(wordsRead),
        });
      } catch (passageError) {
        // The response remains in IndexedDB when the network fails.
        setSyncStatus(navigator.onLine ? "Saved locally • syncing" : "Saved locally • waiting for connection");
      } finally {
        window.setTimeout(() => {
          passageFinalizingRef.current = false;
          setPassageTransitioning(false);
        }, 3000);
      }
    },
    [code, currentQuestions, enqueueMutation, lastWordIndex, passageMiscues, selectedStory?.title]
  );


  const recordPassageMiscue =
    useCallback(
      async (
        wordIndex,
        type
      ) => {
        if(recordingMiscue || !Number.isInteger(wordIndex)) return;
        setRecordingMiscue(true);
        setError("");
        const word=String(passageWords[wordIndex]||"").replace(/[.,!?;:]+$/g,"");
        setPassageMiscues(current=>{
          const nextMiscues={...current,[wordIndex]:type};
          void saveAssessmentState(code,{
            stage:"passage",
            timerSeconds:passageSecondsRef.current,
            timerPaused:passagePaused,
            timerRunningSince:passageTimerStateRef.current.runningSince,
            storyTitle:selectedStory?.title || "",
            lastWordIndex,
            miscues:nextMiscues,
          });
          return nextMiscues;
        });
        setMiscueModalOpen(false);
        setSelectedMiscueWordIndex(null);
        try {
          const data=await enqueueMutation("record_passage_miscue",{
            code,
            word_index:wordIndex,
            miscue_type:type,
            misread_word:word||null,
          });
          if(data?.scoring?.hardTerminate) await fetchSession();
        } catch {} finally {
          setRecordingMiscue(false);
        }
      },
      [recordingMiscue,passageWords,code,enqueueMutation,fetchSession,lastWordIndex,passagePaused,selectedStory?.title]
    );


  const openMiscueMenu =
    useCallback(
      (wordIndex) => {
        setSelectedMiscueWordIndex(
          wordIndex
        );
        setMiscueModalOpen(
          true
        );
      },
      []
    );


  const getPassageElapsedSeconds = useCallback(() => {
    const timerState = passageTimerStateRef.current;
    if (!timerState.runningSince) {
      return Math.min(120, Math.max(0, Math.floor(timerState.baseSeconds)));
    }
    return Math.min(
      120,
      Math.max(0, Math.floor(timerState.baseSeconds + (Date.now() - timerState.runningSince) / 1000))
    );
  }, []);

  const persistPassageTimerLocal = useCallback(
    async (overrides = {}) => {
      try {
        await saveAssessmentState(code, {
          stage: "passage",
          timerSeconds: passageSecondsRef.current,
          timerPaused: passagePaused,
          timerRunningSince: passageTimerStateRef.current.runningSince,
          storyTitle: selectedStory?.title || "",
          lastWordIndex,
          miscues: passageMiscues,
          ...overrides,
        });
      } catch {
        // Local persistence is best effort; mutation persistence remains the primary guard.
      }
    },
    [code, lastWordIndex, passageMiscues, passagePaused, selectedStory?.title]
  );

  useEffect(() => {
    let cancelled = false;

    if (!code) return undefined;

    getAssessmentState(code)
      .then((saved) => {
        if (cancelled || !saved || saved.stage !== "passage") return;
        if (!Number.isFinite(Number(saved.timerSeconds))) return;

        const savedSeconds = Math.min(120, Math.max(0, Number(saved.timerSeconds)));
        const savedRunningSince = Number(saved.timerRunningSince) || null;
        passageTimerStateRef.current = {
          baseSeconds: savedSeconds,
          runningSince: saved.timerPaused ? null : savedRunningSince,
        };
        passageSecondsRef.current = getPassageElapsedSeconds();
        setPassageSeconds(passageSecondsRef.current);
        setPassagePaused(Boolean(saved.timerPaused));
        setPassageTimerExpired(passageSecondsRef.current >= 120);
        if (Number.isInteger(saved.lastWordIndex)) setLastWordIndex(saved.lastWordIndex);
        if (saved.miscues && typeof saved.miscues === "object") setPassageMiscues(saved.miscues);
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, [code, getPassageElapsedSeconds, selectedStory?.title]);

  useEffect(() => {
    if (activeStage !== "passage") {
      if (passageTimerRef.current) {
        window.clearInterval(passageTimerRef.current);
        passageTimerRef.current = null;
      }
      passageTimerSessionKeyRef.current = "";
      return undefined;
    }

    const timerKey = `${session?.assessment_session_id ?? session?.id ?? code}::${session?.story_title ?? session?.storyTitle ?? selectedStory?.title ?? ""}`;

    if (passageTimerSessionKeyRef.current !== timerKey) {
      passageTimerSessionKeyRef.current = timerKey;

      const savedState = passageTimerStateRef.current;
      const serverInitial = Math.min(120, Math.max(0, Number(session?.metrics?.timerSeconds ?? 0)));
      const baseSeconds = Number.isFinite(savedState.baseSeconds) && savedState.baseSeconds > 0
        ? savedState.baseSeconds
        : serverInitial;

      passageTimerStateRef.current = {
        baseSeconds,
        runningSince: passagePaused ? null : (savedState.runningSince || Date.now()),
      };
      passageSecondsRef.current = getPassageElapsedSeconds();
      setPassageSeconds(passageSecondsRef.current);
      setPassageTimerExpired(passageSecondsRef.current >= 120);
    }

    if (passageTimerRef.current) {
      window.clearInterval(passageTimerRef.current);
      passageTimerRef.current = null;
    }

    if (passagePaused || passageTimerExpired) {
      return undefined;
    }

    const tick = () => {
      const elapsed = getPassageElapsedSeconds();
      passageSecondsRef.current = elapsed;
      setPassageSeconds((current) => (current === elapsed ? current : elapsed));

      if (elapsed >= 120) {
        passageTimerStateRef.current = { baseSeconds: 120, runningSince: null };
        if (passageTimerRef.current) {
          window.clearInterval(passageTimerRef.current);
          passageTimerRef.current = null;
        }
        setPassageTimerExpired(true);
        setPassagePaused(true);
        void persistPassageTimerLocal({
          timerSeconds: 120,
          timerPaused: true,
          timerRunningSince: null,
        });
        void enqueueMutation("passage_timer", {
          code,
          paused: true,
          timer_seconds: 120,
        });
      }
    };

    tick();
    passageTimerRef.current = window.setInterval(tick, 250);

    return () => {
      if (passageTimerRef.current) {
        window.clearInterval(passageTimerRef.current);
        passageTimerRef.current = null;
      }
    };
  }, [activeStage, code, enqueueMutation, getPassageElapsedSeconds, passagePaused, passageTimerExpired, persistPassageTimerLocal, selectedStory?.title, session?.assessment_session_id, session?.id, session?.metrics?.timerSeconds, session?.story_title, session?.storyTitle]);

  const togglePassagePause = useCallback(async () => {
    if (passageFinalizingRef.current || passageTimerExpired) return;

    const nextPaused = !passagePaused;
    const seconds = getPassageElapsedSeconds();

    passageSecondsRef.current = seconds;
    setPassageSeconds(seconds);

    if (passageTimerRef.current) {
      window.clearInterval(passageTimerRef.current);
      passageTimerRef.current = null;
    }

    passageTimerStateRef.current = {
      baseSeconds: seconds,
      runningSince: nextPaused ? null : Date.now(),
    };
    setPassagePaused(nextPaused);
    setSession((current) =>
      current
        ? { ...current, stage: nextPaused ? "passage_paused" : "passage", timer_paused: nextPaused, metrics: current.metrics ? { ...current.metrics, timerSeconds: seconds } : current.metrics }
        : current
    );

    await persistPassageTimerLocal({
      timerSeconds: seconds,
      timerPaused: nextPaused,
      timerRunningSince: nextPaused ? null : passageTimerStateRef.current.runningSince,
    });

    void enqueueMutation("passage_timer", {
      code,
      paused: nextPaused,
      timer_seconds: seconds,
    });
  }, [code, enqueueMutation, getPassageElapsedSeconds, passagePaused, passageTimerExpired, persistPassageTimerLocal]);

  useEffect(() => {
    const flush = () => flushOutboxRef.current?.();
    window.addEventListener("crl:flush-outbox", flush);
    window.addEventListener("online", flush);

    const poll = window.setInterval(() => {
      if (!busy) fetchSession();
    }, 2500);

    const sync = window.setInterval(() => {
      flushOutboxRef.current?.();
    }, 1500);

    if (!busy) {
      fetchSession();
      flushOutboxRef.current?.();
    }

    return () => {
      window.removeEventListener("crl:flush-outbox", flush);
      window.removeEventListener("online", flush);
      window.clearInterval(poll);
      window.clearInterval(sync);
    };
  }, [busy, fetchSession]);


  const joined =
    useMemo(
      () =>
        Boolean(
          session?.connected
        ) &&
        Boolean(
          session?.learner_id
        ) &&
        !Boolean(
          session?.ended
        ),
      [session]
    );



  applyServerNextRef.current =
    applyServerNext;
  const updateHost =
    async (
      payload
    ) => {
      setBusy(
        true
      );

      try {
        const response =
          await fetch(
            "/api/assessment?action=host_update",
            {
              method:
                "POST",
              credentials:
                "include",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify({
                  action:
                    "host_update",
                  code,
                  ...payload,
                }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to update assessment."
          );
        }

        setSession(
          data.session
        );

        setActiveStage(
          data.session
            .stage
        );
      } catch (updateError) {
        setError(
          updateError.message ||
            "Unable to update assessment."
        );
      } finally {
        setBusy(
          false
        );
      }
    };

  const recordLetter =
    async (
      isCorrect
    ) => {
      const currentIndex =
        letterIndex;
      const nextStage =
        currentIndex < LETTERS.length - 1
          ? "letter"
          : "word";
      const nextIndex =
        currentIndex < LETTERS.length - 1
          ? currentIndex + 1
          : 0;
      const nextContent =
        currentIndex < LETTERS.length - 1
          ? LETTERS[currentIndex + 1]
          : WORDS[0];

      setActiveStage(nextStage);
      if (nextStage === "letter") setLetterIndex(nextIndex);
      else setWordIndex(nextIndex);
      setSession(current => current ? {
        ...current,
        stage: nextStage,
        current_content: nextContent,
        currentContent: nextContent,
      } : current);

      await enqueueMutation("record_letter",{
        code,
        letter_index: currentIndex,
        is_correct: isCorrect,
      }).then(async data=>{
        if(data?.next) applyServerNext(data.next);
        if(data?.completed || data?.terminated || data?.scoring?.hardTerminate) await fetchSession();
      }).catch(()=>undefined);
    };

;


  const recordWord =
    async (
      isCorrect
    ) => {
      const currentIndex = wordIndex;
      const hasNext = currentIndex < WORDS.length - 1;
      const nextStage = hasNext ? "word" : "story_choice";
      const nextIndex = hasNext ? currentIndex + 1 : 0;
      const nextContent = hasNext ? WORDS[currentIndex + 1] : "";

      if(hasNext) setWordIndex(nextIndex);
      setActiveStage(nextStage);
      setSession(current=>current ? {
        ...current,
        stage: nextStage,
        current_content: nextContent,
        currentContent: nextContent,
        story_title: "",
        storyTitle: "",
      } : current);

      await enqueueMutation("record_word",{
        code,
        word_index: currentIndex,
        is_correct: isCorrect,
      }).then(async data=>{
        if(data?.next) applyServerNext(data.next);
        if(data?.completed || data?.terminated || data?.scoring?.hardTerminate) await fetchSession();
      }).catch(()=>undefined);
    };

;


  const recordComprehension =
    async (
      isCorrect
    ) => {
      const currentIndex = questionIndex;
      const isFinal = currentIndex >= currentQuestions.length - 1;
      if(!isFinal){
        const nextIndex=currentIndex+1;
        const nextQuestion=currentQuestions[nextIndex];
        setQuestionIndex(nextIndex);
        setActiveStage("comprehension");
        setSession(current=>current ? {
          ...current,
          stage:"comprehension",
          current_content:nextQuestion?.text || "",
          currentContent:nextQuestion?.text || "",
        } : current);
      }
      await enqueueMutation("record_comprehension",{
        code,
        question_index: currentIndex,
        is_correct: isCorrect,
      }).then(async data=>{
        if(data?.next) applyServerNext(data.next);
        if(data?.completed) await fetchSession();
      }).catch(()=>undefined);
    };

;


  const selectStory =
    useCallback(
      async (story) => {
        setError("");
        setSession(current => current ? {
          ...current,
          stage:"passage",
          current_content:story.text,
          currentContent:story.text,
          story_title:story.title,
          storyTitle:story.title,
        } : current);
        setActiveStage("passage");
        setPassageSeconds(0);
        passageSecondsRef.current=0;
        passageTimerStateRef.current={baseSeconds:0,runningSince:Date.now()};
        passageTimerSessionKeyRef.current="";
        setPassagePaused(false);
        setPassageTimerExpired(false);
        setLastWordIndex(null);
        setPassageMiscues({});
        void saveAssessmentState(code,{
          stage:"passage",
          timerSeconds:0,
          timerPaused:false,
          timerRunningSince:passageTimerStateRef.current.runningSince,
          storyTitle:story.title,
          lastWordIndex:null,
          miscues:{},
        });
        await enqueueMutation("select_story",{
          code,
          story_id:story.id,
        }).then(data=>{
          if(data?.next) applyServerNext(data.next);
        }).catch(()=>undefined);
      },
      [code,enqueueMutation]
    );


  const finalize =
    async () => {
      setBusy(
        true
      );

      try {
        const response =
          await fetch(
            "/api/assessment?action=finalize",
            {
              method:
                "POST",
              credentials:
                "include",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify({
                  action:
                    "finalize",
                  code,
                  learner_id:
                    learnerId,
                  period,
                }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to finalize assessment."
          );
        }

        await fetchSession();
      } catch (finalizeError) {
        setError(
          finalizeError.message ||
            "Unable to finalize assessment."
        );
      } finally {
        setBusy(
          false
        );
      }
    };

  const saveTeacherFeedback =
    useCallback(
      async () => {
        if (
          savingFeedback ||
          !code
        ) {
          return false;
        }

        setSavingFeedback(
          true
        );
        setError("");

        try {
          const response =
            await fetch(
              "/api/assessment",
              {
                method:
                  "POST",
                credentials:
                  "include",
                cache:
                  "no-store",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    action:
                      "save_teacher_feedback",
                    code,
                    observation_level:
                      observationLevel
                        ? Number(
                            observationLevel
                          )
                        : null,
                    remarks,
                  }),
              }
            );

          const data =
            await response.json();

          if (
            !response.ok
          ) {
            throw new Error(
              data.error ||
                "Unable to save teacher feedback."
            );
          }

          setCompletionSummary(
            (current) =>
              current
                ? {
                    ...current,
                    observationLevel:
                      data.observation_level,
                    remarks:
                      data.remarks ||
                      "",
                  }
                : current
          );

          return true;
        } catch (feedbackError) {
          setError(
            feedbackError.message ||
              "Unable to save teacher feedback."
          );
          return false;
        } finally {
          setSavingFeedback(
            false
          );
        }
      },
      [
        code,
        observationLevel,
        remarks,
        savingFeedback,
      ]
    );

  const endSession =
    async () => {
      if (
        busy ||
        !Boolean(
          session?.connected
        )
      ) {
        return;
      }

      setConfirmEndSession(
        true
      );
    };

  const confirmEndSessionAction =
    async () => {
      if (busy) {
        return;
      }

      setConfirmEndSession(
        false
      );
      setBusy(
        true
      );
      setError("");

      try {
        const response =
          await fetch(
            "/api/assessment?action=host_end",
            {
              method:
                "POST",
              credentials:
                "include",
              cache:
                "no-store",
              headers: {
                "Content-Type":
                  "application/json",
                Accept:
                  "application/json",
              },
              body:
                JSON.stringify({
                  action:
                    "host_end",
                  code,
                }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to end session."
          );
        }

        try {
          localStorage.removeItem(
            "crla_host_session"
          );
        } catch {
          /* Storage may be unavailable. */
        }

        /*
         * Ending the teacher controller does not complete
         * the BoSY/MoSY/EoSY assessment.
         */
        window.location.replace(
          "/teacher"
        );
      } catch (endError) {
        setError(
          endError.message ||
            "Unable to end session."
        );
      } finally {
        setBusy(
          false
        );
      }
    };

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.loadingContent}>
            <div style={styles.spinner} />
            <div>
              Loading {period} Assessment...
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={styles.page}>
        <div
          style={{
            ...styles.card,
            maxWidth: 520,
          }}
        >
          <h1
            style={styles.title}
          >
            Assessment Error
          </h1>

          <p
            style={
              styles.muted
            }
          >
            {error}
          </p>

          <button
            type="button"
            style={
              styles.primary
            }
            onClick={() =>
              window.location.replace(
                "/teacher"
              )
            }
          >
            Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <style>{`
        @keyframes crlAssessmentSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes crlModalFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes crlAssessmentContentIn {
          from {
            opacity: 0;
            transform: translateY(7px) scale(.99);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes crlCompletionPop {
          from {
            opacity: 0;
            transform: translateY(8px) scale(.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes crlModalIn {
          from {
            opacity: 0;
            transform: translateY(6px) scale(.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .crl-assessment-page *,
        .crl-assessment-page *::before,
        .crl-assessment-page *::after {
          box-sizing: border-box;
        }

        .crl-assessment-page button {
          -webkit-tap-highlight-color: transparent;
        }

        @media (max-width: 700px) {
          .crl-assessment-page { padding: 12px !important; }
          .crl-assessment-container { width: 100% !important; }
          .crl-assessment-page [data-passage-controls="true"] { grid-template-columns: 1fr !important; }
          .crl-assessment-page [data-passage="true"] { padding: 14px !important; }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .01ms !important;
          }
        }
      `}</style>

      <main className="crl-assessment-page" style={styles.page}>
      <div
        className="crl-assessment-container"
        style={styles.container}
      >
        <header
          style={
            styles.header
          }
        >
          <div>
            <div
              style={
                styles.brand
              }
            >
              CRL-App
            </div>

            <div
              style={
                styles.headerSub
              }
            >
              {period} Assessment
            </div>
          </div>

          <div
            style={styles.headerActions}
          >
            {!joined &&
              !showCompletionOverlay &&
              activeStage !== "completed" &&
              activeStage !== "terminated" && (
              <button
                type="button"
                style={styles.backButton}
                onClick={() =>
                  window.location.replace("/teacher")
                }
                disabled={busy}
              >
                Back to Dashboard
              </button>
            )}

            {joined &&
              !showCompletionOverlay &&
              activeStage !== "completed" &&
              activeStage !== "terminated" && (
              <button
                type="button"
                style={styles.outlineDanger}
                onClick={endSession}
                disabled={busy}
              >
                End Session
              </button>
            )}
          </div>
        </header>

        <section
          style={
            styles.codeCard
          }
        >
          <div
            style={
              styles.codeLabel
            }
          >
            Assessment Code
          </div>

          <div
            style={
              styles.code
            }
          >
            {code}
          </div>

          <div
            style={
              styles.connectionStatus
            }
          >
            <span
              style={{
                ...styles.dot,
                background:
                  joined
                    ? "#18834e"
                    : "#c77b17",
              }}
            />

            {joined
              ? "Learner connected"
              : "Waiting for learner to connect"}
          </div>
        </section>

        {pendingLocalWrites > 0 && (
          <div style={styles.syncBadge} role="status" aria-live="polite">
            <span style={styles.syncDot} aria-hidden="true" />
            {syncStatus || "Saved locally • syncing"}
            <strong style={styles.syncCount}>{pendingLocalWrites}</strong>
          </div>
        )}

        <section
          style={
            styles.assessmentCard
          }
        >
          <div
            style={
              styles.stageHeader
            }
          >
            <div>
              <div
                style={
                  styles.smallLabel
                }
              >
                Current Stage
              </div>

              <h1
                style={
                  styles.title
                }
              >
                {activeStage ===
                "waiting"
                  ? "Waiting"
                  : activeStage ===
                    "letter"
                  ? "Task 1: Letter Sounds"
                  : activeStage ===
                    "word"
                  ? "Task 2: Word Recognition"
                  : activeStage ===
                    "passage"
                  ? "Part 2: Passage Reading"
                  : activeStage ===
                    "comprehension"
                  ? "Comprehension"
                  : activeStage ===
                    "completed"
                  ? "Completed"
                  : activeStage ===
                    "terminated"
                  ? "Terminated"
                  : activeStage}
              </h1>
            </div>
          </div>

          {!joined ? (
            <div
              style={
                styles.waitingPanel
              }
            >
              <div
                style={
                  styles.waitingCircle
                }
              >
                …
              </div>

              <h2
                style={
                  styles.sectionTitle
                }
              >
                Waiting for learner
              </h2>

              <p
                style={
                  styles.muted
                }
              >
                On the learner device, open
                the Learner Page and enter the
                six-character assessment code
                shown above.
              </p>
            </div>
          ) : (
            <div
              style={
                styles.stagePanel
              }
            >
              {activeStage ===
                "letter" && (
                <>
                  <div
                    style={
                      styles.counter
                    }
                  >
                    Letter{" "}
                    {letterIndex +
                      1}{" "}
                    of{" "}
                    {
                      LETTERS.length
                    }
                  </div>

                  <div
                    key={`letter-${letterIndex}-${session?.current_content ?? ""}`}
                    style={{
                      ...styles.contentDisplay,
                      animation:
                        "crlAssessmentContentIn .2s ease-out",
                    }}
                  >
                    {
                      LETTERS[
                        letterIndex
                      ]
                    }
                  </div>

                  <div
                    style={
                      styles.answerButtons
                    }
                  >
                    <button
                      type="button"
                      style={
                        styles.successButton
                      }
                      disabled={busy}
                      onClick={() =>
                        recordLetter(
                          true
                        )
                      }
                    >
                      Correct
                    </button>

                    <button
                      type="button"
                      style={
                        styles.dangerButton
                      }
                      disabled={busy}
                      onClick={() =>
                        recordLetter(
                          false
                        )
                      }
                    >
                      Incorrect
                    </button>
                  </div>
                </>
              )}

              {activeStage ===
                "word" && (
                <>
                  <div
                    style={
                      styles.counter
                    }
                  >
                    Word{" "}
                    {wordIndex +
                      1}{" "}
                    of{" "}
                    {
                      WORDS.length
                    }
                  </div>

                  <div
                    key={`word-${wordIndex}-${session?.current_content ?? ""}`}
                    style={{
                      ...styles.contentDisplay,
                      animation:
                        "crlAssessmentContentIn .2s ease-out",
                    }}
                  >
                    {
                      WORDS[
                        wordIndex
                      ]
                    }
                  </div>

                  <div
                    style={
                      styles.answerButtons
                    }
                  >
                    <button
                      type="button"
                      style={
                        styles.successButton
                      }
                      disabled={busy}
                      onClick={() =>
                        recordWord(
                          true
                        )
                      }
                    >
                      Correct
                    </button>

                    <button
                      type="button"
                      style={
                        styles.dangerButton
                      }
                      disabled={busy}
                      onClick={() =>
                        recordWord(
                          false
                        )
                      }
                    >
                      Incorrect
                    </button>
                  </div>
                </>
              )}

              {activeStage ===
                "story_choice" && (
                <div
                  style={
                    styles.storyChoicePanel
                  }
                >
                  <div
                    style={
                      styles.storyChoiceHeader
                    }
                  >
                    <div
                      style={
                        styles.smallLabel
                      }
                    >
                      Story Selection
                    </div>
                    <div
                      style={
                        styles.storyChoiceInstruction
                      }
                    >
                      Ask the learner which story they would like to read, then select it below.
                    </div>
                  </div>

                  <div
                    style={
                      styles.storyGrid
                    }
                  >
                    {STORIES.map(
                      (story) => (
                        <button
                          key={
                            story.id
                          }
                          type="button"
                          style={
                            styles.storyCardButton
                          }
                          disabled={
                            busy
                          }
                          onClick={() =>
                            selectStory(
                              story
                            )
                          }
                        >
                          <div
                            style={
                              styles.storyCardIcon
                            }
                            aria-hidden="true"
                          >
                            {
                              story.id ===
                              1
                                ? "🦜"
                                : "🌾"
                            }
                          </div>
                          <div
                            style={
                              styles.storyCardTitle
                            }
                          >
                            {
                              story.title
                            }
                          </div>
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}

              {activeStage ===
                "passage" && (
                <>
                  <div
                    style={
                      styles.smallLabel
                    }
                  >
                    Passage Reading
                  </div>

                  <div
                    key={`passage-${session?.current_content ?? ""}`}
                    data-passage="true"
                    style={{
                      ...styles.passage,
                      animation:
                        "crlAssessmentContentIn .2s ease-out",
                    }}
                  >
                    <div
                      style={
                        styles.passageStoryTitle
                      }
                    >
                      {
                        selectedStory.title
                      }
                    </div>

                    <div
                      style={
                        styles.passageHelper
                      }
                    >
                      Click the word the learner miscues, then choose the miscue type.
                    </div>

                    <div
                      style={
                        styles.clickablePassage
                      }
                    >
                      {passageWords.map(
                        (
                          word,
                          index
                        ) => {
                          const markedType =
                            passageMiscues[
                              index
                            ];

                          const colors =
                            {
                              Substitution:
                                {
                                  background:
                                    "#ffe7eb",
                                  color:
                                    "#b32031",
                                },
                              Insertion:
                                {
                                  background:
                                    "#efe6ff",
                                  color:
                                    "#7040a8",
                                },
                              Omission:
                                {
                                  background:
                                    "#fff0d8",
                                  color:
                                    "#9a6510",
                                },
                              Repetition:
                                {
                                  background:
                                    "#fff6c9",
                                  color:
                                    "#856c00",
                                },
                              Reversion:
                                {
                                  background:
                                    "#e3f0ff",
                                  color:
                                    "#255d96",
                                },
                              SelfCorrection:
                                {
                                  background:
                                    "#e3f7ea",
                                  color:
                                    "#1a7b49",
                                },
                            };

                          const markStyle =
                            markedType
                              ? colors[
                                  markedType
                                ] ||
                                {}
                              : {};

                          return (
                            <button
                              key={`${index}-${word}`}
                              type="button"
                              style={{
                                ...styles.passageWord,
                                ...(markStyle.background
                                  ? {
                                      background:
                                        markStyle.background,
                                      color:
                                        markStyle.color,
                                      fontWeight:
                                        "900",
                                    }
                                  : {}),
                                ...(index ===
                                selectedMiscueWordIndex
                                  ? styles.passageWordSelected
                                  : {}),
                              }}
                              onClick={() => {
                                if (
                                  passageTimerExpired
                                ) {
                                  setLastWordIndex(
                                    index
                                  );
                                  return;
                                }

                                openMiscueMenu(
                                  index
                                );
                              }}
                              disabled={
                                recordingMiscue ||
                                passageFinalizingRef.current ||
                                passagePaused &&
                                !passageTimerExpired
                              }
                              aria-label={`Word ${
                                index + 1
                              }: ${word}${
                                markedType
                                  ? `, ${
                                      markedType ===
                                      "SelfCorrection"
                                        ? "Self-Correction"
                                        : markedType
                                    }`
                                  : ""
                              }`}
                            >
                              {word}
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>

                  <div
                    data-passage-controls="true"
                    style={
                      styles.passageControls
                    }
                  >
                    <div
                      style={
                        styles.timerCard
                      }
                    >
                      <div
                        style={
                          styles.timerLabel
                        }
                      >
                        TIME
                      </div>

                      <div
                        style={
                          styles.timerValue
                        }
                      >
                        {String(
                          Math.floor(
                            passageSeconds /
                              60
                          )
                        ).padStart(
                          2,
                          "0"
                        )}
                        :
                        {String(
                          passageSeconds %
                            60
                        ).padStart(
                          2,
                          "0"
                        )}
                      </div>

                      <div
                        style={
                          styles.timerHint
                        }
                      >
                        Maximum: 02:00
                      </div>
                    </div>

                    <div
                      style={
                        styles.passageTimerActions
                      }
                    >
                      <button
                        type="button"
                        style={{
                          ...styles.timerControlButton,
                          ...(passagePaused
                            ? styles.timerResumeButton
                            : styles.timerPauseButton),
                        }}
                        onClick={() =>
                          togglePassagePause()
                        }
                        disabled={
                          passageTimerExpired ||
                          passageFinalizingRef.current
                        }
                      >
                        {passagePaused
                          ? "Resume Timer"
                          : "Pause Timer"}
                      </button>

                      <div
                        style={
                          styles.timerStatus
                        }
                      >
                        {passageTimerExpired
                          ? "Time is up. Select the last word read."
                          : passagePaused
                            ? "Timer paused."
                            : "Timer running."}
                      </div>
                    </div>
                  </div>

                  {passageTimerExpired && (
                    <div
                      style={
                        styles.lastWordPrompt
                      }
                      role="alert"
                    >
                      Time is up. Click the last word the learner reached in the passage.
                    </div>
                  )}

                  <button
                    type="button"
                    style={
                      styles.primary
                    }
                    onClick={() =>
                      finishPassageReading(
                        passageSeconds
                      )
                    }
                    disabled={
                      !passageTimerExpired ||
                      !Number.isInteger(
                        lastWordIndex
                      ) ||
                      passageFinalizingRef.current
                    }
                  >
                    Start Comprehension
                  </button>

                  {passageTransitioning && (
                    <div
                      style={
                        styles.passageTransition
                      }
                      role="status"
                      aria-live="polite"
                    >
                      <div
                        style={
                          styles.spinner
                        }
                      />
                    </div>
                  )}

                  {miscueModalOpen &&
                    selectedMiscueWordIndex !==
                      null && (
                    <div
                      style={
                        styles.miscueModalOverlay
                      }
                      role="dialog"
                      aria-modal="true"
                      aria-label="Select miscue type"
                      onClick={(
                        event
                      ) => {
                        if (
                          event.target ===
                            event.currentTarget &&
                          !recordingMiscue
                        ) {
                          setMiscueModalOpen(
                            false
                          );
                          setSelectedMiscueWordIndex(
                            null
                          );
                        }
                      }}
                    >
                      <div
                        style={
                          styles.miscueModal
                        }
                      >
                        <div
                          style={
                            styles.miscueModalEyebrow
                          }
                        >
                          SELECTED WORD
                        </div>

                        <div
                          style={
                            styles.miscueSelectedWord
                          }
                        >
                          {
                            passageWords[
                              selectedMiscueWordIndex
                            ]
                          }
                        </div>

                        <div
                          style={
                            styles.miscueModalTitle
                        }
                        >
                          What kind of miscue occurred?
                        </div>

                        <div
                          style={
                            styles.miscueOptionGrid
                          }
                        >
                          {[
                            [
                              "Substitution",
                              "↔",
                            ],
                            [
                              "Insertion",
                              "+",
                            ],
                            [
                              "Omission",
                              "×",
                            ],
                            [
                              "Repetition",
                              "↺",
                            ],
                            [
                              "Reversion",
                              "↷",
                            ],
                            [
                              "SelfCorrection",
                              "✓",
                            ],
                          ].map(
                            ([
                              type,
                              symbol,
                            ]) => {
                              const optionColors =
                                {
                                  Substitution:
                                    {
                                      background:
                                        "#ffe7eb",
                                      color:
                                        "#b32031",
                                    },
                                  Insertion:
                                    {
                                      background:
                                        "#efe6ff",
                                      color:
                                        "#7040a8",
                                    },
                                  Omission:
                                    {
                                      background:
                                        "#fff0d8",
                                      color:
                                        "#9a6510",
                                    },
                                  Repetition:
                                    {
                                      background:
                                        "#fff6c9",
                                      color:
                                        "#856c00",
                                    },
                                  Reversion:
                                    {
                                      background:
                                        "#e3f0ff",
                                      color:
                                        "#255d96",
                                    },
                                  SelfCorrection:
                                    {
                                      background:
                                        "#e3f7ea",
                                      color:
                                        "#1a7b49",
                                    },
                                };

                              const color =
                                optionColors[
                                  type
                                ];

                              return (
                                <button
                                  key={
                                    type
                                  }
                                  type="button"
                                  style={{
                                    ...styles.miscueOption,
                                    border:
                                      `1px solid ${
                                        color.color
                                      }`,
                                    background:
                                      hoveredMiscueType ===
                                      type
                                        ? color.background
                                        : "#ffffff",
                                    color:
                                      color.color,
                                    transform:
                                      hoveredMiscueType ===
                                      type
                                        ? "translateY(-2px)"
                                        : "translateY(0)",
                                    boxShadow:
                                      hoveredMiscueType ===
                                      type
                                        ? "0 8px 18px rgba(32,56,80,.10)"
                                        : "none",
                                  }}
                                  onMouseEnter={() =>
                                    setHoveredMiscueType(
                                      type
                                    )
                                  }
                                  onMouseLeave={() =>
                                    setHoveredMiscueType(
                                      ""
                                    )
                                  }
                                  onClick={() =>
                                    recordPassageMiscue(
                                      selectedMiscueWordIndex,
                                      type
                                    )
                                  }
                                  disabled={
                                    recordingMiscue
                                  }
                                >
                                  <span
                                    style={{
                                      ...styles.miscueOptionSymbol,
                                      color:
                                        color.color,
                                    }}
                                  >
                                    {
                                      symbol
                                    }
                                  </span>
                                  <span>
                                    {type ===
                                    "SelfCorrection"
                                      ? "Self-Correction"
                                      : type}
                                  </span>
                                </button>
                              );
                            }
                          )}
                        </div>

                        <button
                          type="button"
                          style={
                            styles.miscueCancel
                          }
                          onClick={() => {
                            setMiscueModalOpen(
                              false
                            );
                            setSelectedMiscueWordIndex(
                              null
                            );
                          }}
                          disabled={
                            recordingMiscue
                          }
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeStage ===
                "comprehension" && (
                <>
                  <div
                    style={
                      styles.counter
                    }
                  >
                    Question{" "}
                    {questionIndex +
                      1}{" "}
                    of{" "}
                    {
                      currentQuestions.length
                    }
                  </div>

                  <div
                    key={`question-${questionIndex}-${session?.current_content ?? ""}`}
                    style={{
                      ...styles.question,
                      animation:
                        "crlAssessmentContentIn .2s ease-out",
                    }}
                  >
                    {
                      currentQuestion?.text
                    }
                  </div>

                  <div
                    style={
                      styles.answerButtons
                    }
                  >
                    <button
                      type="button"
                      style={
                        styles.successButton
                      }
                      disabled={busy}
                      onClick={() =>
                        recordComprehension(
                          true
                        )
                      }
                    >
                      Correct
                    </button>

                    <button
                      type="button"
                      style={
                        styles.dangerButton
                      }
                      disabled={busy}
                      onClick={() =>
                        recordComprehension(
                          false
                        )
                      }
                    >
                      Incorrect
                    </button>
                  </div>
                </>
              )}

              {activeStage ===
                "completed" && (
                <div
                  style={
                    styles.waitingPanel
                  }
                >
                  <div
                    style={{
                      ...styles.waitingCircle,
                      background:
                        "#eaf8f0",
                      color:
                        "#18834e",
                    }}
                  >
                    ✓
                  </div>

                  <h2
                    style={
                      styles.sectionTitle
                    }
                  >
                    Assessment completed
                  </h2>

                  <p
                    style={
                      styles.muted
                    }
                  >
                    The results have been saved
                    to the database.
                  </p>

                  <button
                    type="button"
                    style={
                      styles.primary
                    }
                    onClick={() =>
                      window.location.replace(
                        "/teacher"
                      )
                    }
                  >
                    Return to Dashboard
                  </button>
                </div>
              )}

              {activeStage ===
                "terminated" && (
                <div
                  style={
                    styles.waitingPanel
                  }
                >
                  <div
                    style={{
                      ...styles.waitingCircle,
                      background:
                        "#fff0f2",
                      color:
                        "#c92335",
                    }}
                  >
                    !
                  </div>

                  <h2
                    style={
                      styles.sectionTitle
                    }
                  >
                    Assessment terminated
                  </h2>

                  <p
                    style={
                      styles.muted
                    }
                  >
                    The CRLA hard termination rule
                    was reached. The learner&apos;s
                    classification has been saved.
                  </p>

                  <button
                    type="button"
                    style={
                      styles.primary
                    }
                    onClick={() =>
                      window.location.replace(
                        "/teacher"
                      )
                    }
                  >
                    Return to Dashboard
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {showCompletionOverlay && (
        <div
          style={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="assessment-complete-title"
        >
          <div style={styles.completionModal}>
            <div style={styles.completionIcon}>✓</div>

            <h2
              id="assessment-complete-title"
              style={styles.confirmTitle}
            >
              Assessment Done
            </h2>

            <p style={styles.confirmText}>
              The learner&apos;s assessment is complete and the result has been saved.
            </p>

            <div style={styles.summaryList}>
              {[
                [
                  "Part 1 Task 1 Score:",
                  completionSummary?.task1Score ?? 0,
                ],
                [
                  "Part 1 Task 2 Score:",
                  completionSummary?.task2Score ?? 0,
                ],
                [
                  "Comprehension:",
                  completionSummary?.comprehensionScore ?? 0,
                ],
                [
                  "Accuracy:",
                  `${completionSummary?.miscueAccuracy ?? 0}%`,
                ],
                [
                  "Total Miscues:",
                  completionSummary?.totalMiscues ?? 0,
                ],
                [
                  "Reading Profile:",
                  completionSummary?.classification ||
                    (
                      Number(
                        completionSummary?.task1Score ||
                        0
                      ) === 0
                        ? "Low Emerging Reader"
                        : "Not available"
                    ),
                ],
                [
                  "Learner Experience:",
                  completionSummary?.experienceRating
                    ? `${completionSummary.experienceRating}/5`
                    : "Not rated",
                ],
              ].map(
                ([label, value]) => (
                  <div
                    key={label}
                    style={styles.summaryRow}
                  >
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                )
              )}
            </div>

            <div style={styles.feedbackSection}>
              <div style={styles.feedbackLabel}>
                Observation Level
              </div>

              <div style={styles.observationGrid}>
                {[1, 2, 3, 4].map(
                  (level) => (
                    <button
                      key={level}
                      type="button"
                      style={{
                        ...styles.observationButton,
                        ...(observationLevel ===
                        String(level)
                          ? styles.observationButtonActive
                          : styles.observationButtonInactive),
                      }}
                      onClick={() =>
                        setObservationLevel(
                          String(level)
                        )
                      }
                      disabled={
                        savingFeedback
                      }
                    >
                      Level {level}
                    </button>
                  )
                )}
              </div>

              <label
                htmlFor="assessment-remarks"
                style={styles.feedbackLabel}
              >
                Remarks
              </label>

              <textarea
                id="assessment-remarks"
                value={remarks}
                onChange={(event) =>
                  setRemarks(
                    event.target.value
                  )
                }
                rows={4}
                maxLength={5000}
                placeholder="Optional remarks"
                style={styles.remarksInput}
                disabled={
                  savingFeedback
                }
              />
            </div>

            {error && (
              <div
                style={styles.feedbackError}
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              type="button"
              style={styles.primary}
              disabled={savingFeedback}
              onClick={async () => {
                const saved =
                  await saveTeacherFeedback();

                if (saved) {
                  window.location.replace(
                    "/teacher"
                  );
                }
              }}
            >
              {savingFeedback
                ? "Saving..."
                : "Back to Dashboard"}
            </button>
          </div>
        </div>
      )}


      {confirmEndSession && (
          <div
            style={styles.modalOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-session-title"
            onClick={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setConfirmEndSession(false);
              }
            }}
          >
            <div style={styles.confirmModal}>
              <div style={styles.confirmIcon}>
                !
              </div>

              <h2
                id="end-session-title"
                style={styles.confirmTitle}
              >
                End Assessment Session?
              </h2>

              <p style={styles.confirmText}>
                This will end the teacher session. The
                {` ${period}`} assessment will not be
                marked completed just because the teacher
                ends the controller session.
              </p>

              <div style={styles.confirmActions}>
                <button
                  type="button"
                  style={styles.cancelButton}
                  onClick={() =>
                    setConfirmEndSession(false)
                  }
                  disabled={busy}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  style={styles.confirmButton}
                  onClick={
                    confirmEndSessionAction
                  }
                  disabled={busy}
                >
                  {busy
                    ? "Ending..."
                    : "End Session"}
                </button>
              </div>
            </div>
          </div>
        )}

        {busy && (
          <div style={styles.busy}>
            <div style={styles.busySpinner} />
            <span>Saving...</span>
          </div>
        )}
      </div>
    </main>
    </>
  );
}

const styles = {
  page: {
    minHeight:
      "100vh",
    boxSizing:
      "border-box",
    overflowX:
      "hidden",
    background:
      "linear-gradient(180deg,#f8fbff 0%,#edf4fb 100%)",
    color:
      "#18283d",
    fontFamily:
      "Arial, Helvetica, sans-serif",
    padding:
      "20px",
  },

  container: {
    width:
      "100%",
    maxWidth:
      "1050px",
    margin:
      "0 auto",
  },

  header: {
    minHeight:
      "68px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "space-between",
    gap:
      "12px",
    background:
      "#ffffff",
    border:
      "1px solid #dce6f0",
    borderRadius:
      "12px",
    padding:
      "0 20px",
    boxShadow:
      "0 8px 25px rgba(31,60,90,.05)",
  },

  brand: {
    color:
      "#1559a6",
    fontSize:
      "21px",
    fontWeight:
      "900",
  },

  headerSub: {
    marginTop:
      "4px",
    color:
      "#7b8b9d",
    fontSize:
      "11px",
  },

  headerActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "9px",
    flexWrap: "wrap",
  },

  backButton: {
    minHeight: "38px",
    padding: "0 13px",
    border: "1px solid #c7d6e4",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#1559a6",
    fontSize: "10px",
    fontWeight: "850",
    cursor: "pointer",
  },

  codeCard: {
    marginTop:
      "14px",
    padding:
      "22px",
    background:
      "#1559a6",
    color:
      "#ffffff",
    borderRadius:
      "12px",
    textAlign:
      "center",
    boxShadow:
      "0 12px 28px rgba(21,89,166,.18)",
  },

  codeLabel: {
    fontSize:
      "9px",
    textTransform:
      "uppercase",
    fontWeight:
      "800",
    letterSpacing:
      "1px",
    opacity:
      0.8,
  },

  code: {
    marginTop:
      "6px",
    fontSize:
      "38px",
    fontWeight:
      "900",
    letterSpacing:
      "8px",
  },

  connectionStatus: {
    marginTop:
      "6px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    gap:
      "7px",
    fontSize:
      "10px",
  },

  dot: {
    width:
      "8px",
    height:
      "8px",
    borderRadius:
      "50%",
    display:
      "inline-block",
  },

  assessmentCard: {
    marginTop:
      "14px",
    background:
      "#ffffff",
    border:
      "1px solid #dce6f0",
    borderRadius:
      "12px",
    overflow:
      "hidden",
    boxShadow:
      "0 8px 25px rgba(31,60,90,.05)",
  },

  stageHeader: {
    padding:
      "18px 20px",
    borderBottom:
      "1px solid #e7eef5",
  },

  smallLabel: {
    color:
      "#8797a9",
    fontSize:
      "10px",
    textTransform:
      "uppercase",
    letterSpacing:
      "0.8px",
    fontWeight:
      "900",
  },

  title: {
    margin:
      "5px 0 0",
    color:
      "#1e3047",
    fontSize:
      "22px",
    fontWeight:
      "900",
  },

  waitingPanel: {
    padding:
      "48px 24px",
    textAlign:
      "center",
  },

  waitingCircle: {
    width:
      "58px",
    height:
      "58px",
    margin:
      "0 auto 14px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    borderRadius:
      "50%",
    background:
      "#edf4fc",
    color:
      "#1559a6",
    fontSize:
      "25px",
    fontWeight:
      "900",
  },

  sectionTitle: {
    margin:
      0,
    color:
      "#263b54",
    fontSize:
      "17px",
    fontWeight:
      "900",
  },

  muted: {
    margin:
      "7px auto 16px",
    maxWidth:
      "580px",
    color:
      "#7a8b9e",
    fontSize:
      "10px",
    lineHeight:
      1.7,
  },

  stagePanel: {
    minHeight:
      "360px",
    padding:
      "26px",
    textAlign:
      "center",
    boxSizing:
      "border-box",
    overflow:
      "visible",
  },

  counter: {
    color:
      "#7b8b9d",
    fontSize:
      "11px",
    fontWeight:
      "800",
  },

  contentDisplay: {
    minHeight:
      "240px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    color:
      "#1559a6",
    fontSize:
      "96px",
    fontWeight:
      "900",
  },

  answerButtons: {
    display:
      "flex",
    justifyContent:
      "center",
    gap:
      "10px",
    flexWrap:
      "wrap",
  },

  successButton: {
    minWidth:
      "150px",
    minHeight:
      "44px",
    border:
      0,
    borderRadius:
      "8px",
    background:
      "#18834e",
    color:
      "#ffffff",
    fontWeight:
      "900",
    cursor:
      "pointer",
  },

  dangerButton: {
    minWidth:
      "150px",
    minHeight:
      "44px",
    border:
      0,
    borderRadius:
      "8px",
    background:
      "#c92335",
    color:
      "#ffffff",
    fontWeight:
      "900",
    cursor:
      "pointer",
  },

  storyChoicePanel: {
    maxWidth:
      "760px",
    margin:
      "0 auto",
  },

  storyChoiceHeader: {
    marginBottom:
      "14px",
  },

  storyChoiceInstruction: {
    marginTop:
      "6px",
    color:
      "#7c8ea1",
    fontSize:
      "10px",
    lineHeight:
      1.55,
  },

  storyGrid: {
    display:
      "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap:
      "12px",
  },

  storyCardButton: {
    minHeight:
      "165px",
    padding:
      "16px",
    border:
      "1px solid #d9e4ee",
    borderRadius:
      "11px",
    background:
      "#ffffff",
    color:
      "#20344d",
    textAlign:
      "left",
    cursor:
      "pointer",
    transition:
      "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
  },

  storyCardIcon: {
    width:
      "42px",
    height:
      "42px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    borderRadius:
      "11px",
    background:
      "#edf4fb",
    fontSize:
      "22px",
  },

  storyCardTitle: {
    marginTop:
      "13px",
    fontSize:
      "16px",
    fontWeight:
      "900",
  },

  storyCardDescription: {
    marginTop:
      "6px",
    color:
      "#75889b",
    fontSize:
      "10px",
    lineHeight:
      1.6,
  },

  storyCardAction: {
    marginTop:
      "14px",
    color:
      "#1559a6",
    fontSize:
      "10px",
    fontWeight:
      "900",
  },

  passageStoryTitle: {
    color:
      "#183a62",
    fontSize:
      "17px",
    fontWeight:
      "900",
    marginBottom:
      "6px",
  },

  passageHelper: {
    color:
      "#7c8ea1",
    fontSize:
      "10px",
    marginBottom:
      "15px",
    lineHeight:
      1.5,
  },

  clickablePassage: {
    minWidth: 0,
    overflowWrap: "anywhere",
    color:
      "#2b435e",
    fontSize:
      "20px",
    lineHeight:
      1.95,
    textAlign:
      "left",
  },

  passageWord: {
    appearance:
      "none",
    display:
      "inline",
    padding:
      "2px 3px",
    margin:
      0,
    border:
      "0 solid transparent",
    borderRadius:
      "5px",
    background:
      "transparent",
    color:
      "#2b435e",
    fontFamily:
      "Arial, Helvetica, sans-serif",
    fontSize:
      "inherit",
    fontWeight:
      "700",
    cursor:
      "pointer",
    lineHeight:
      "inherit",
  },

  passageWordSelected: {
    appearance:
      "none",
    display:
      "inline",
    padding:
      "2px 5px",
    margin:
      0,
    border:
      "2px solid #9cb9d8",
    borderRadius:
      "5px",
    background:
      "#eaf3fb",
    color:
      "#1559a6",
    fontFamily:
      "Arial, Helvetica, sans-serif",
    fontSize:
      "inherit",
    fontWeight:
      "900",
    cursor:
      "pointer",
    lineHeight:
      "inherit",
  },

  miscueModalOverlay: {
    position:
      "fixed",
    inset:
      0,
    zIndex:
      1100,
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    padding:
      "18px",
    background:
      "rgba(18,31,48,.42)",
    backdropFilter:
      "blur(4px)",
    animation:
      "crlModalFade .16s ease-out",
  },

  miscueModal: {
    width:
      "100%",
    maxWidth:
      "520px",
    padding:
      "22px",
    background:
      "#ffffff",
    border:
      "1px solid #d8e3ed",
    borderRadius:
      "14px",
    boxShadow:
      "0 20px 60px rgba(20,42,68,.2)",
    textAlign:
      "center",
    animation:
      "crlModalIn .18s ease-out",
  },

  miscueModalEyebrow: {
    color:
      "#8295a8",
    fontSize:
      "9px",
    fontWeight:
      "900",
    letterSpacing:
      ".12em",
  },

  miscueSelectedWord: {
    marginTop:
      "6px",
    color:
      "#1559a6",
    fontSize:
      "26px",
    fontWeight:
      "900",
  },

  miscueModalTitle: {
    marginTop:
      "11px",
    color:
      "#263b54",
    fontSize:
      "13px",
    fontWeight:
      "900",
  },

  miscueOptionGrid: {
    display:
      "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap:
      "8px",
    marginTop:
      "16px",
  },

  miscueOption: {
    minHeight:
      "52px",
    display:
      "flex",
    alignItems:
      "center",
    gap:
      "9px",
    padding:
      "8px 11px",
    border:
      "1px solid #d6e2ed",
    borderRadius:
      "9px",
    background:
      "#f8fbfe",
    color:
      "#29415b",
    cursor:
      "pointer",
    fontSize:
      "10px",
    fontWeight:
      "900",
    textAlign:
      "left",
    transition:
      "transform .12s ease, box-shadow .12s ease, background .12s ease",
  },

  miscueOptionSymbol: {
    width:
      "25px",
    flex:
      "0 0 25px",
    textAlign:
      "center",
    color:
      "#1559a6",
    fontSize:
      "16px",
  },

  miscueCancel: {
    width:
      "100%",
    minHeight:
      "40px",
    marginTop:
      "11px",
    border:
      "1px solid #d0dce8",
    borderRadius:
      "8px",
    background:
      "#ffffff",
    color:
      "#64778c",
    fontSize:
      "10px",
    fontWeight:
      "900",
    cursor:
      "pointer",
  },

  passage: {
    maxWidth:
      "760px",
    margin:
      "16px auto 20px",
    padding:
      "20px",
    border:
      "1px solid #dce6f0",
    borderRadius:
      "9px",
    background:
      "#f8fbfe",
    color:
      "#33485f",
    textAlign:
      "left",
    lineHeight:
      1.8,
    fontSize:
      "12px",
  },

  question: {
    maxWidth:
      "700px",
    minHeight:
      "130px",
    margin:
      "14px auto",
    padding:
      "28px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    border:
      "1px solid #dce6f0",
    borderRadius:
      "9px",
    background:
      "#f8fbfe",
    color:
      "#243a53",
    fontSize:
      "21px",
    fontWeight:
      "800",
  },

  passageTimerActions: {
    minHeight:
      "88px",
    display:
      "flex",
    flexDirection:
      "column",
    justifyContent:
      "center",
    gap:
      "8px",
    padding:
      "12px",
    border:
      "1px solid #dce6f0",
    borderRadius:
      "9px",
    background:
      "#ffffff",
  },

  timerControlButton: {
    minHeight:
      "38px",
    border:
      "1px solid #a9bfd6",
    borderRadius:
      "8px",
    background:
      "#edf4fb",
    color:
      "#1559a6",
    fontSize:
      "11px",
    fontWeight:
      "900",
    cursor:
      "pointer",
  },

  timerPauseButton: {
    background:
      "#fff0e6",
    border:
      "1px solid #df8d5b",
    color:
      "#a64b18",
  },

  timerResumeButton: {
    background:
      "#eaf7ef",
    border:
      "1px solid #73b890",
    color:
      "#247a48",
  },

  timerStatus: {
    color:
      "#73869a",
    fontSize:
      "10px",
    fontWeight:
      "800",
    textAlign:
      "center",
  },

  lastWordPrompt: {
    maxWidth:
      "760px",
    margin:
      "12px auto",
    padding:
      "11px 13px",
    border:
      "1px solid #edd8a8",
    borderRadius:
      "9px",
    background:
      "#fff8e8",
    color:
      "#77591e",
    fontSize:
      "11px",
    fontWeight:
      "900",
    textAlign:
      "center",
  },

  passageTransition: {
    position:
      "fixed",
    inset:
      0,
    zIndex:
      1250,
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    background:
      "rgba(255,255,255,.72)",
    backdropFilter:
      "blur(3px)",
  },

  passageControls: {
    display:
      "grid",
    gridTemplateColumns:
      "minmax(0, 160px) minmax(0, 1fr)",
    alignItems:
      "stretch",
    gap:
      "10px",
    maxWidth:
      "760px",
    margin:
      "0 auto 12px",
  },

  timerCard: {
    padding:
      "12px",
    border:
      "1px solid #dce6f0",
    borderRadius:
      "9px",
    background:
      "#f8fbfe",
    textAlign:
      "center",
  },

  timerLabel: {
    color:
      "#8797a9",
    fontSize:
      "9px",
    fontWeight:
      "900",
    letterSpacing:
      ".08em",
  },

  timerValue: {
    marginTop:
      "2px",
    color:
      "#1559a6",
    fontSize:
      "25px",
    fontWeight:
      "900",
    fontVariantNumeric:
      "tabular-nums",
  },

  timerHint: {
    marginTop:
      "2px",
    color:
      "#7a8b9e",
    fontSize:
      "9px",
  },

  field: {
    display:
      "flex",
    flexDirection:
      "column",
    gap:
      "5px",
    color:
      "#60748b",
    fontSize:
      "10px",
    fontWeight:
      "800",
    textAlign:
      "left",
  },

  fieldInput: {
    width:
      "100%",
    minHeight:
      "38px",
    padding:
      "0 10px",
    border:
      "1px solid #d4dfeb",
    borderRadius:
      "8px",
    background:
      "#ffffff",
    color:
      "#20344d",
    fontSize:
      "11px",
    outline:
      "none",
  },

  miscuePanel: {
    maxWidth:
      "760px",
    margin:
      "14px auto 0",
    padding:
      "14px",
    border:
      "1px solid #e2e9f1",
    borderRadius:
      "9px",
    background:
      "#fbfdff",
  },

  miscueTitle: {
    marginBottom:
      "9px",
    color:
      "#20344d",
    fontSize:
      "11px",
    fontWeight:
      "900",
    textAlign:
      "left",
  },

  miscueGrid: {
    display:
      "grid",
    gridTemplateColumns:
      "90px 1fr 1fr",
    gap:
      "9px",
  },

  secondaryButton: {
    minHeight:
      "39px",
    marginTop:
      "10px",
    padding:
      "0 14px",
    border:
      "1px solid #b9cbe0",
    borderRadius:
      "8px",
    background:
      "#edf4fb",
    color:
      "#1559a6",
    fontSize:
      "10px",
    fontWeight:
      "900",
    cursor:
      "pointer",
  },

  primary: {
    minHeight:
      "41px",
    padding:
      "0 15px",
    marginTop:
      "8px",
    border:
      0,
    borderRadius:
      "8px",
    background:
      "#1559a6",
    color:
      "#ffffff",
    fontWeight:
      "900",
    cursor:
      "pointer",
  },

  outlineDanger: {
    minHeight:
      "38px",
    padding:
      "0 13px",
    border:
      "1px solid #efcbd0",
    borderRadius:
      "8px",
    background:
      "#fff7f8",
    color:
      "#c92335",
    fontWeight:
      "800",
    cursor:
      "pointer",
  },

  card: {
    width:
      "100%",
    maxWidth:
      "430px",
    margin:
      "0 auto",
    padding:
      "24px",
    border:
      "1px solid #dce6f0",
    borderRadius:
      "12px",
    background:
      "#ffffff",
    boxShadow:
      "0 10px 30px rgba(31,60,90,.06)",
  },

  loadingContent: {
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    gap:
      "10px",
    fontSize:
      "15px",
    fontWeight:
      "800",
  },

  spinner: {
    width:
      "22px",
    height:
      "22px",
    border:
      "3px solid #dbe7f3",
    borderTopColor:
      "#1559a6",
    borderRadius:
      "50%",
    animation:
      "crlAssessmentSpin .75s linear infinite",
  },

  modalOverlay: {
    position:
      "fixed",
    inset:
      0,
    zIndex:
      1000,
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    padding:
      "20px",
    background:
      "rgba(17,32,51,.38)",
    backdropFilter:
      "blur(3px)",
    animation:
      "crlModalFade .16s ease-out",
  },

  completionModal: {
    width: "100%",
    maxWidth: "560px",
    maxHeight: "90vh",
    overflowY: "auto",
    padding: "28px",
    background: "#ffffff",
    border: "1px solid #dce6f0",
    borderRadius: "14px",
    boxShadow: "0 22px 70px rgba(23,43,67,.20)",
    textAlign: "center",
    animation: "crlCompletionPop .20s ease-out",
  },

  completionIcon: {
    width: "56px",
    height: "56px",
    margin: "0 auto 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    background: "#eaf8f0",
    color: "#18834e",
    fontSize: "25px",
    fontWeight: "900",
  },

  summaryList: {
    display: "flex",
    flexDirection: "column",
    margin: "18px 0",
    border: "1px solid #dce6f0",
    borderRadius: "10px",
    overflow: "hidden",
    background: "#f8fbfe",
  },

  summaryRow: {
    minHeight: "42px",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: "16px",
    padding: "9px 13px",
    borderBottom: "1px solid #e6edf4",
    textAlign: "left",
    color: "#5e7287",
    fontSize: "12px",
    fontWeight: "650",
  },

  feedbackSection: {
    marginTop: "16px",
    paddingTop: "16px",
    borderTop: "1px solid #e1e9f1",
    textAlign: "left",
  },

  feedbackLabel: {
    display: "block",
    marginBottom: "8px",
    color: "#40566e",
    fontSize: "12px",
    fontWeight: "900",
  },

  observationGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0, 1fr))",
    gap: "7px",
    marginBottom: "15px",
  },

  observationButton: {
    minHeight: "38px",
    border: "1px solid #ccd9e5",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#536a80",
    fontSize: "11px",
    fontWeight: "850",
    cursor: "pointer",
  },

  observationButtonActive: {
    background: "#1559a6",
    border: "2px solid #1559a6",
    color: "#ffffff",
  },

  observationButtonInactive: {
    background: "#ffffff",
    border: "2px solid #ccd9e5",
    color: "#536a80",
  },

  remarksInput: {
    width: "100%",
    resize: "vertical",
    padding: "10px 11px",
    border: "1px solid #ccd9e5",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#213b56",
    fontFamily:
      "Arial, Helvetica, sans-serif",
    fontSize: "12px",
    lineHeight: 1.5,
    outline: "none",
  },

  feedbackError: {
    marginTop: "10px",
    padding: "9px 11px",
    border: "1px solid #efc8cd",
    borderRadius: "8px",
    background: "#fff4f5",
    color: "#b32031",
    fontSize: "11px",
  },

  confirmModal: {
    width:
      "100%",
    maxWidth:
      "430px",
    padding:
      "24px",
    background:
      "#ffffff",
    border:
      "1px solid #dce6f0",
    borderRadius:
      "12px",
    boxShadow:
      "0 18px 55px rgba(23,43,67,.18)",
    textAlign:
      "center",
    animation:
      "crlModalIn .18s ease-out",
  },

  confirmIcon: {
    width:
      "50px",
    height:
      "50px",
    margin:
      "0 auto 12px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    borderRadius:
      "50%",
    background:
      "#fff0f2",
    color:
      "#c92335",
    fontSize:
      "23px",
    fontWeight:
      "900",
  },

  confirmTitle: {
    margin:
      0,
    color:
      "#20344d",
    fontSize:
      "18px",
    fontWeight:
      "900",
  },

  confirmText: {
    margin:
      "8px auto 0",
    maxWidth:
      "350px",
    color:
      "#75879a",
    fontSize:
      "10px",
    lineHeight:
      1.7,
  },

  confirmActions: {
    display:
      "flex",
    justifyContent:
      "center",
    gap:
      "9px",
    marginTop:
      "20px",
  },

  cancelButton: {
    minHeight:
      "40px",
    padding:
      "0 15px",
    border:
      "1px solid #d0dce8",
    borderRadius:
      "8px",
    background:
      "#ffffff",
    color:
      "#53687e",
    fontSize:
      "10px",
    fontWeight:
      "800",
    cursor:
      "pointer",
  },

  confirmButton: {
    minHeight:
      "40px",
    padding:
      "0 15px",
    border:
      0,
    borderRadius:
      "8px",
    background:
      "#c92335",
    color:
      "#ffffff",
    fontSize:
      "10px",
    fontWeight:
      "800",
    cursor:
      "pointer",
  },

  syncBadge: {
    marginTop: "10px",
    minHeight: "34px",
    padding: "7px 11px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    border: "1px solid #d9e6f2",
    borderRadius: "8px",
    background: "#f8fbfe",
    color: "#47627c",
    fontSize: "10px",
    fontWeight: "800",
  },

  syncDot: {
    width: "7px", height: "7px", borderRadius: "50%",
    background: "#247a48", flex: "0 0 7px",
  },

  syncCount: {
    minWidth: "20px", padding: "2px 5px", borderRadius: "999px",
    background: "#eaf7ef", color: "#247a48", fontSize: "9px", textAlign: "center",
  },

  busySpinner: {
    width:
      "14px",
    height:
      "14px",
    border:
      "2px solid #dbe7f3",
    borderTopColor:
      "#1559a6",
    borderRadius:
      "50%",
    animation:
      "crlAssessmentSpin .7s linear infinite",
  },

  busy: {
    position:
      "fixed",
    right:
      "20px",
    bottom:
      "20px",
    padding:
      "10px 14px",
    borderRadius:
      "8px",
    background:
      "#ffffff",
    border:
      "1px solid #dce6f0",
    color:
      "#1559a6",
    fontSize:
      "10px",
    fontWeight:
      "900",
    boxShadow:
      "0 10px 25px rgba(30,54,80,.12)",
  },
};