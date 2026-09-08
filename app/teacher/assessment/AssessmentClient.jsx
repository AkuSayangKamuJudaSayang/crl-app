"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import ConnectionHealthPanel from "../../../components/ConnectionHealthPanel";
import {
  getMutations,
  putMutation,
  removeMutation,
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
    available: true,
  },
  {
    id: 2,
    title: "A Day In The Fields",
    description: "Join the farmers as they work in the terraces.",
    available: false,
  },
];

const PASSAGE_TEXT =
  "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.";

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

  const [storySelecting, setStorySelecting] = useState(false);

  const [
    recordingMiscue,
    setRecordingMiscue,
  ] = useState(false);

  const passageTimerRef =
    useRef(null);

  const passageFinalizingRef =
    useRef(false);

  const currentQuestion =
    QUESTIONS[
      questionIndex
    ];

  const fetchInFlightRef =
    useRef(false);

  const latestSessionVersionRef =
    useRef(0);

  const latestSessionRef =
    useRef(null);

  const latestActiveStageRef =
    useRef(activeStage);

  const pendingAnswerRef =
    useRef(false);

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

        const incomingVersion =
          Date.parse(
            data.session?.updated_at ||
              data.session?.updatedAt ||
              ""
          ) || 0;

        if (
          incomingVersion >=
          latestSessionVersionRef.current
        ) {
          latestSessionVersionRef.current =
            incomingVersion;

          const currentSession =
            latestSessionRef.current;

          const currentStage =
            currentSession?.stage ||
            latestActiveStageRef.current;

          const incomingWaiting =
            data.session?.stage === "waiting" &&
            !data.session?.ended;

          const currentIsActive =
            Boolean(currentSession?.learner_id) &&
            !currentSession?.ended &&
            !["waiting", "connected"].includes(currentStage);

          if (incomingWaiting && currentIsActive) {
            return;
          }

          latestSessionRef.current =
            data.session;

          latestActiveStageRef.current =
            data.session?.stage ||
            latestActiveStageRef.current;

          setSession(data.session);

          const serverStage =
            data.session?.stage;

          if (serverStage) {
            setActiveStage(serverStage);

            const serverContent =
              String(
                data.session?.current_content ??
                  data.session?.currentContent ??
                  ""
              );

            if (serverStage === "letter") {
              const serverIndex =
                LETTERS.indexOf(serverContent);

              if (serverIndex >= 0) {
                setLetterIndex(serverIndex);
              }
            }

            if (serverStage === "word") {
              const serverIndex =
                WORDS.indexOf(serverContent);

              if (serverIndex >= 0) {
                setWordIndex(serverIndex);
              }
            }

            if (serverStage === "comprehension") {
              const serverIndex =
                QUESTIONS.findIndex(
                  (question) =>
                    question.text === serverContent
                );

              if (serverIndex >= 0) {
                setQuestionIndex(serverIndex);
              }
            }
          }
        }

      } catch (fetchError) {
        /*
         * Keep a previously loaded assessment visible during a transient
         * polling failure. The next poll will retry automatically.
         */
        if (!session) {
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


  const selectStory = useCallback(
    async (story) => {
      if (storySelecting || busy || !story?.available) return;

      setStorySelecting(true);
      setError("");

      const next = {
        code,
        stage: "passage",
        currentContent:
          story.id === 1
            ? PASSAGE_TEXT
            : "",
        storyTitle: story.title,
      };

      /*
       * Show the selected story immediately on the teacher side. The learner
       * receives the same state through the lightweight host session endpoint.
       */
      const optimistic = {
        ...(latestSessionRef.current || {}),
        ...next,
        connected: true,
      };

      latestSessionRef.current = optimistic;
      latestActiveStageRef.current = "passage";
      latestSessionVersionRef.current = Date.now();
      setSession(optimistic);
      setActiveStage("passage");

      try {
        const response = await fetch(
          "/api/assessment?action=select_story",
          {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              action: "select_story",
              code,
              story_id: story.id,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error || "Unable to start the selected story."
          );
        }

        if (data?.session) {
          latestSessionRef.current = {
            ...latestSessionRef.current,
            ...data.session,
            connected:
              data.session.connected ??
              latestSessionRef.current?.connected ??
              true,
          };
          latestActiveStageRef.current = "passage";
          setSession(latestSessionRef.current);
          setActiveStage("passage");
        }
      } catch (error) {
        /*
         * Preserve the teacher's optimistic state rather than bouncing back
         * to waiting. The next retry/poll can reconcile the cloud state.
         */
        setError(
          error?.message ||
            "Unable to start the selected story."
        );
      } finally {
        setStorySelecting(false);
      }
    },
    [code, storySelecting, busy]
  );

  const controlPassageTimer = useCallback(
    async (mode) => {
      if (activeStage !== "passage") return;
      try {
        const response = await fetch("/api/assessment?action=passage_timer", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ action: "passage_timer", code, mode }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to update the passage timer.");
        setPassagePaused(Boolean(data.paused));
        setPassageSeconds(
          Math.min(
            120,
            Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(data.passage_started_at).getTime()) / 1000
              ) - Number(data.passage_paused_seconds || 0)
            )
          )
        );
      } catch (error) {
        setError(error?.message || "Unable to update the passage timer.");
      }
    },
    [activeStage, code]
  );

  const passageWordElements = useMemo(
    () => {
      let wordNumber = 0;
      return PASSAGE_TEXT.split(/(s+)/).map((token, index) => {
        if (!token.trim()) return token;
        wordNumber += 1;
        const currentWordNumber = wordNumber;
        return (
          <button
            type="button"
            key={`passage-word-${index}`}
            style={{
              ...styles.passageWord,
              ...(miscueWordIndex === currentWordNumber
                ? styles.passageWordSelected
                : {}),
            }}
            onClick={() => {
              setMiscueWordIndex(currentWordNumber);
              if (currentWordNumber > passageWordsRead) {
                setPassageWordsRead(currentWordNumber);
              }
              if (timeUpSelecting) {
                setTimeUpSelecting(false);
                void finishPassageReading(passageSeconds);
              }
            }}
            aria-label={`Word ${currentWordNumber}: ${token}`}
          >
            {token}
          </button>
        );
      });
    },
    [miscueWordIndex, passageWordsRead, timeUpSelecting, passageSeconds]
  );

  const finishPassageReading =
    useCallback(
      async (
        secondsOverride
      ) => {
        if (
          passageFinalizingRef.current
        ) {
          return;
        }

        passageFinalizingRef.current =
          true;

        setBusy(
          true
        );
        setError("");

        try {
          const seconds = Math.min(
            120,
            Math.max(
              0,
              Number(
                secondsOverride ??
                  passageSeconds
              )
            )
          );

          const wordsRead = Math.min(
            100,
            Math.max(
              0,
              Number(
                passageWordsRead
              )
            )
          );

          const response =
            await fetch(
              "/api/assessment?action=finish_passage",
              {
                method:
                  "POST",
                credentials:
                  "include",
                headers: {
                  "Content-Type":
                    "application/json",
                  Accept:
                    "application/json",
                },
                cache:
                  "no-store",
                body:
                  JSON.stringify({
                    action:
                      "finish_passage",
                    code,
                    timer_seconds:
                      Math.round(
                        seconds
                      ),
                    words_read:
                      Math.round(
                        wordsRead
                      ),
                  }),
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
                "Unable to finish the passage."
            );
          }

          setPassageSeconds(
            Math.round(
              seconds
            )
          );

          if (
            passageTimerRef.current
          ) {
            window.clearInterval(
              passageTimerRef.current
            );
            passageTimerRef.current =
              null;
          }

          await fetchSession();
        } catch (passageError) {
          setError(
            passageError.message ||
              "Unable to finish the passage."
          );
        } finally {
          passageFinalizingRef.current =
            false;
          setBusy(
            false
          );
        }
      },
      [
        code,
        passageSeconds,
        passageWordsRead,
        fetchSession,
      ]
    );

  const recordPassageMiscue =
    useCallback(
      async () => {
        if (
          recordingMiscue ||
          busy
        ) {
          return;
        }

        setRecordingMiscue(
          true
        );
        setError("");

        try {
          const response =
            await fetch(
              "/api/assessment?action=record_passage_miscue",
              {
                method:
                  "POST",
                credentials:
                  "include",
                headers: {
                  "Content-Type":
                    "application/json",
                  Accept:
                    "application/json",
                },
                cache:
                  "no-store",
                body:
                  JSON.stringify({
                    action:
                      "record_passage_miscue",
                    code,
                    word_index:
                      Number(
                        miscueWordIndex
                      ) - 1,
                    miscue_type:
                      miscueType,
                    misread_word:
                      misreadWord,
                  }),
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
                "Unable to record the miscue."
            );
          }

          await fetchSession();
        } catch (miscueError) {
          setError(
            miscueError.message ||
              "Unable to record the miscue."
          );
        } finally {
          setRecordingMiscue(
            false
          );
        }
      },
      [
        recordingMiscue,
        busy,
        code,
        miscueWordIndex,
        miscueType,
        misreadWord,
        fetchSession,
      ]
    );

  useEffect(() => {
    if (activeStage !== "passage") {
      if (passageTimerRef.current) {
        window.clearInterval(passageTimerRef.current);
        passageTimerRef.current = null;
      }
      setPassagePaused(false);
      setTimeUpSelecting(false);
      return undefined;
    }

    const startedAt =
      session?.passage_started_at ||
      session?.passageStartedAt;

    if (!startedAt) {
      if (passageTimerRef.current) {
        window.clearInterval(passageTimerRef.current);
        passageTimerRef.current = null;
      }
      setPassageSeconds(0);
      return undefined;
    }

    const tick = () => {
      const startedMs = new Date(startedAt).getTime();
      const pausedAt =
        session?.passage_paused_at ||
        session?.passagePausedAt;
      const pausedBase = Number(
        session?.passage_paused_seconds ||
          session?.passagePausedSeconds ||
          0
      );

      const activePause = pausedAt
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(pausedAt).getTime()) / 1000
            )
          )
        : 0;

      const elapsed = Math.min(
        120,
        Math.max(
          0,
          Math.floor((Date.now() - startedMs) / 1000) -
            pausedBase -
            activePause
        )
      );

      setPassageSeconds(elapsed);

      if (
        elapsed >= 120 &&
        !pausedAt &&
        !passageFinalizingRef.current
      ) {
        setTimeUpSelecting(true);
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
  }, [
    activeStage,
    session?.passage_started_at,
    session?.passageStartedAt,
    session?.passage_paused_at,
    session?.passagePausedAt,
    session?.passage_paused_seconds,
    session?.passagePausedSeconds,
  ]);

  useEffect(() => {
    if (!busy) {
      fetchSession();
    }

    const interval =
      window.setInterval(
        () => {
          if (!busy && !pendingAnswerRef.current && document.visibilityState === "visible") {
            fetchSession();
          }
        },
        3000
      );

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !busy && !pendingAnswerRef.current) {
        fetchSession();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    fetchSession,
    busy,
  ]);

  const joined =
    useMemo(
      () => {
        if (!session || session.ended) return false;

        const stage =
          session.stage || activeStage;

        return (
          Boolean(session.learner_id) &&
          (
            Boolean(session.connected) ||
            Boolean(session.linked_at) ||
            Boolean(session.linkedAt) ||
            !["waiting", "connected"].includes(stage)
          )
        );
      },
      [session, activeStage]
    );
  useEffect(() => {
    latestSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    latestActiveStageRef.current = activeStage;
  }, [activeStage]);


  const answerQueueFlushingRef =
    useRef(false);

  const flushAnswerQueue = useCallback(
    async () => {
      if (answerQueueFlushingRef.current) return;
      answerQueueFlushingRef.current = true;

      try {
        const mutations = await getMutations();

        for (const mutation of mutations) {
          const mutationId = String(mutation.id || "");
          if (
            !mutationId.startsWith("answer:") &&
            !mutationId.startsWith("advance:")
          ) {
            continue;
          }

          let saved = false;

          for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
            try {
              const response = await fetch(
                `/api/assessment?action=${encodeURIComponent(
                  mutation.action
                )}`,
                {
                  method: "POST",
                  credentials: "include",
                  cache: "no-store",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                  },
                  body: JSON.stringify({
                    action: mutation.action,
                    ...(mutation.payload || {}),
                    ...(mutationId.startsWith("answer:")
                      ? { persist_only: true }
                      : {}),
                  }),
                }
              );

              const data = await response.json();

              if (!response.ok) {
                throw new Error(
                  data?.error || "Unable to synchronize assessment answer."
                );
              }

              await removeMutation(mutation.id);
              saved = true;
            } catch {
              if (attempt < 2) {
                await new Promise((resolve) =>
                  window.setTimeout(resolve, 125 * 2 ** attempt)
                );
              }
            }
          }
        }
      } catch {
        /* IndexedDB/network recovery runs again on the next cycle. */
      } finally {
        answerQueueFlushingRef.current = false;
      }
    },
    []
  );

  const queueHostAdvanceForBackgroundRetry = useCallback(
    async (payload) => {
      await putMutation({
        id:
          `advance:${String(code).toUpperCase()}:${payload?.stage}:${payload?.item_index ?? payload?.currentContent}`,
        action: "host_advance",
        payload: {
          code,
          ...payload,
        },
        createdAt: Date.now(),
      });

      void flushAnswerQueue();
    },
    [code, flushAnswerQueue]
  );

  const queueAnswerForBackgroundSave = useCallback(
    async (action, payload) => {
      const id =
        `answer:${action}:${String(code).toUpperCase()}:${payload?.letter_index ?? payload?.word_index ?? payload?.question_index}`;

      await putMutation({
        id,
        action,
        payload,
        createdAt: Date.now(),
      });

      void flushAnswerQueue();
    },
    [code, flushAnswerQueue]
  );

  useEffect(() => {
    const retry = () => {
      void flushAnswerQueue();
    };

    window.addEventListener("online", retry);

    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void flushAnswerQueue();
      }
    }, 1000);

    void flushAnswerQueue();

    return () => {
      window.removeEventListener("online", retry);
      window.clearInterval(timer);
    };
  }, [flushAnswerQueue]);

  const persistAnswerWithRetry = useCallback(
    async (action, payload) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const response = await fetch(
            `/api/assessment?action=${encodeURIComponent(action)}`,
            {
              method: "POST",
              credentials: "include",
              cache: "no-store",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                action,
                ...payload,
              }),
            }
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(
              data?.error || `Unable to save ${action}.`
            );
          }

          return data;
        } catch (error) {
          if (attempt === 3) {
            console.warn(
              "Assessment answer save retry exhausted:",
              error?.message || error
            );
            return null;
          }

          await new Promise((resolve) =>
            window.setTimeout(resolve, 125 * 2 ** attempt)
          );
        }
      }

      return null;
    },
    []
  );

  const recordLetter =
    async (
      isCorrect
    ) => {
      if (busy || pendingAnswerRef.current) return;

      setBusy(true);
      pendingAnswerRef.current = true;

      const currentIndex = letterIndex;
      const isFinal = currentIndex === LETTERS.length - 1;

      if (!isFinal) {
        const nextIndex = currentIndex + 1;
        setLetterIndex(nextIndex);
        const optimisticLetterSession = {
          ...(latestSessionRef.current || {}),
          stage: "letter",
          current_content: LETTERS[nextIndex],
          currentContent: LETTERS[nextIndex],
          connected: true,
        };
        latestSessionRef.current = optimisticLetterSession;
        latestActiveStageRef.current = "letter";
        latestSessionVersionRef.current = Date.now();
        setSession(optimisticLetterSession);
        setActiveStage("letter");

        void queueAnswerForBackgroundSave(
          "record_letter",
          {
            code,
            letter_index: currentIndex,
            letter: LETTERS[currentIndex],
            is_correct: isCorrect,
          }
        );

        const nextLetter = {
          code,
          stage: "letter",
          currentContent: LETTERS[currentIndex + 1],
          storyTitle: "",
          item_index: currentIndex + 1,
        };

        void (async () => {
          try {
            const response = await fetch(
              "/api/assessment?action=host_advance",
              {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  action: "host_advance",
                  ...nextLetter,
                }),
              }
            );

            if (!response.ok) throw new Error("host advance failed");

            const data = await response.json();
            if (data?.session) {
              latestSessionRef.current = {
                ...latestSessionRef.current,
                ...data.session,
                connected:
                  data.session.connected ??
                  latestSessionRef.current?.connected ??
                  true,
              };
            }
          } catch {
            await queueHostAdvanceForBackgroundRetry(nextLetter);
          }
        })();

        pendingAnswerRef.current = false;
        setBusy(false);
        return;
      }

      try {
        const data = await persistAnswerWithRetry(
          "record_letter",
          {
            code,
            letter_index: currentIndex,
            letter: LETTERS[currentIndex],
            is_correct: isCorrect,
          }
        );

        if (!data) return;

        if (data.scoring?.hardTerminate) {
          await fetchSession();
          return;
        }

        setWordIndex(0);

        if (data.session) {
          setSession(data.session);
          setActiveStage(data.session.stage);
        }
      } finally {
        pendingAnswerRef.current = false;
        setBusy(false);
      }
    };

  const recordWord =
    async (
      isCorrect
    ) => {
      if (busy || pendingAnswerRef.current) return;

      setBusy(true);
      pendingAnswerRef.current = true;

      const currentIndex = wordIndex;
      const isFinal = currentIndex === WORDS.length - 1;

      if (!isFinal) {
        const nextIndex = currentIndex + 1;
        setWordIndex(nextIndex);
        const optimisticWordSession = {
          ...(latestSessionRef.current || {}),
          stage: "word",
          current_content: WORDS[nextIndex],
          currentContent: WORDS[nextIndex],
          connected: true,
        };
        latestSessionRef.current = optimisticWordSession;
        latestActiveStageRef.current = "word";
        latestSessionVersionRef.current = Date.now();
        setSession(optimisticWordSession);
        setActiveStage("word");

        void queueAnswerForBackgroundSave(
          "record_word",
          {
            code,
            word_index: currentIndex,
            word: WORDS[currentIndex],
            is_correct: isCorrect,
          }
        );

        const nextWord = {
          code,
          stage: "word",
          currentContent: WORDS[currentIndex + 1],
          storyTitle: "",
          item_index: currentIndex + 1,
        };

        void (async () => {
          try {
            const response = await fetch(
              "/api/assessment?action=host_advance",
              {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  action: "host_advance",
                  ...nextWord,
                }),
              }
            );

            if (!response.ok) throw new Error("host advance failed");

            const data = await response.json();
            if (data?.session) {
              latestSessionRef.current = {
                ...latestSessionRef.current,
                ...data.session,
                connected:
                  data.session.connected ??
                  latestSessionRef.current?.connected ??
                  true,
              };
            }
          } catch {
            await queueHostAdvanceForBackgroundRetry(nextWord);
          }
        })();

        pendingAnswerRef.current = false;
        setBusy(false);
        return;
      }

      try {
        const data = await persistAnswerWithRetry(
          "record_word",
          {
            code,
            word_index: currentIndex,
            word: WORDS[currentIndex],
            is_correct: isCorrect,
          }
        );

        if (!data) return;

        if (data.scoring?.hardTerminate) {
          await fetchSession();
          return;
        }

        if (data.session) {
          setSession(data.session);
          setActiveStage(data.session.stage);
        }
      } finally {
        pendingAnswerRef.current = false;
        setBusy(false);
      }
    };

  const recordComprehension =
    async (
      isCorrect
    ) => {
      setBusy(true);
      pendingAnswerRef.current = true;

      try {
        const response =
          await fetch(
            "/api/assessment?action=record_comprehension",
            {
              method:
                "POST",
              credentials:
                "include",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                action:
                  "record_comprehension",
                code,
                question_index:
                  questionIndex,
                is_correct:
                  isCorrect,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to record comprehension result."
          );
        }

        if (
          questionIndex <
          QUESTIONS.length -
            1
        ) {
          const nextIndex =
            questionIndex + 1;

          setQuestionIndex(nextIndex);

          if (data.session) {
            setSession(data.session);
            setActiveStage(data.session.stage);
          }
        } else {
          await finalize();
        }
      } catch (recordError) {
        setError(
          recordError.message ||
            "Unable to record result."
        );
      } finally {
        pendingAnswerRef.current = false;
        setBusy(false);
      }
    };

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

  const endSession =
    async () => {
      if (busy) {
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

        /* Mobile and tablet optimization for the live teacher assessment */
        .teacherAssessmentPage {
          overflow-x: hidden;
        }

        @media (max-width: 900px) {
          .teacherAssessmentPage {
            padding: 14px !important;
          }

          .teacherAssessmentPage > div {
            max-width: 760px !important;
          }

          .teacherAssessmentPage > div > header {
            min-height: 64px !important;
            padding: 10px 14px !important;
          }

          .teacherAssessmentPage > div > section {
            width: 100% !important;
          }

          .teacherAssessmentPage [style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 640px) {
          .teacherAssessmentPage {
            padding: 9px !important;
          }

          .teacherAssessmentPage > div > header {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
          }

          .teacherAssessmentPage > div > header button {
            width: 100% !important;
          }

          .teacherAssessmentPage [style*="fontSize: \"38px\""] {
            font-size: 30px !important;
          }

          .teacherAssessmentPage [style*="fontSize: \"96px\""] {
            min-height: 180px !important;
            font-size: 68px !important;
          }

          .teacherAssessmentPage [style*="padding: \"26px\""] {
            padding: 18px !important;
          }

          .teacherAssessmentPage [style*="padding: \"20px\""] {
            padding: 16px !important;
          }

          .teacherAssessmentPage [style*="maxWidth: \"760px\""] {
            max-width: 100% !important;
          }

          .teacherAssessmentPage [style*="maxWidth: \"700px\""] {
            max-width: 100% !important;
          }

          .teacherAssessmentPage [style*="minHeight: \"130px\""] {
            min-height: 110px !important;
            padding: 18px !important;
            font-size: 18px !important;
          }

          .teacherAssessmentPage [style*="maxWidth: \"430px\""] {
            max-width: 100% !important;
          }

          .teacherAssessmentPage input,
          .teacherAssessmentPage select,
          .teacherAssessmentPage textarea,
          .teacherAssessmentPage button {
            min-height: 44px;
          }

          .teacherAssessmentPage textarea {
            min-height: 100px !important;
          }

          .teacherAssessmentPage [style*="gridTemplateColumns: \"90px 1fr 1fr\""] {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 420px) {
          .teacherAssessmentPage {
            padding: 6px !important;
          }

          .teacherAssessmentPage > div > section {
            border-radius: 10px !important;
          }

          .teacherAssessmentPage [style*="fontSize: \"68px\""] {
            font-size: 58px !important;
          }

          .teacherAssessmentPage [style*="letterSpacing: \"8px\""] {
            letter-spacing: 5px !important;
          }
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

      <main className="teacherAssessmentPage" style={styles.page}>
      <div
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

          <button
            type="button"
            style={
              styles.outlineDanger
            }
            onClick={
              endSession
            }
            disabled={busy}
          >
            End Session
          </button>
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
                    "story_choice"
                  ? "Part 2: Choose Story"
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
                <div style={styles.storyChoicePanel}>
                  <div style={styles.storyChoiceBadge}>PART 2</div>
                  <h2 style={styles.storyChoiceTitle}>
                    Choose a story passage
                  </h2>
                  <p style={styles.storyChoiceText}>
                    The learner can see the available stories on their device.
                    Only the teacher can select and start the passage.
                  </p>

                  <div style={styles.storyChoiceGrid}>
                    {STORIES.map((story) => (
                      <div
                        key={story.id}
                        style={styles.storyChoiceCard}
                      >
                        <div style={styles.storyChoiceIcon}>
                          {story.id === 1 ? "🦜" : "🌾"}
                        </div>
                        <div style={styles.storyChoiceBody}>
                          <div style={styles.storyChoiceTitleSmall}>
                            {story.title}
                          </div>
                          <div style={styles.storyChoiceDescription}>
                            {story.description}
                          </div>
                        </div>
                        <button
                          type="button"
                          style={
                            story.available
                              ? styles.storyChoiceButton
                              : styles.storyChoiceButtonDisabled
                          }
                          disabled={!story.available || storySelecting || busy}
                          onClick={() => selectStory(story)}
                        >
                          {story.available
                            ? storySelecting
                              ? "Starting..."
                              : "Start Passage"
                            : "Unavailable"}
                        </button>
                      </div>
                    ))}
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
                    style={{
                      ...styles.passage,
                      animation:
                        "crlAssessmentContentIn .2s ease-out",
                    }}
                    role="region"
                    aria-label="Para the Parrot passage"
                  >
                    {passageWordElements}
                  </div>div>

                  <div
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

                      <button
                        type="button"
                        style={styles.timerToggleButton}
                        onClick={() =>
                          void controlPassageTimer(
                            passagePaused ? "resume" : "pause"
                          )
                        }
                        disabled={
                          !session?.passage_started_at ||
                          passageSeconds >= 120
                        }
                      >
                        {passagePaused ? "Resume" : "Pause"}
                      </button>
                    </div>

                    <label
                      style={
                        styles.field
                      }
                    >
                      <span>
                        Last word reached
                      </span>

                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={
                          passageWordsRead
                        }
                        onChange={(
                          event
                        ) =>
                          setPassageWordsRead(
                            Math.min(
                              100,
                              Math.max(
                                0,
                                Number(
                                  event
                                    .target
                                    .value
                                )
                              )
                            )
                          )
                        }
                        style={
                          styles.fieldInput
                        }
                      />
                    </label>
                  </div>

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
                      busy ||
                      passageFinalizingRef.current ||
                      passageSeconds >
                        120
                    }
                  >
                    Finish Reading &amp; Start Comprehension
                  </button>

                  <div
                    style={
                      styles.miscuePanel
                    }
                  >
                    <div
                      style={
                        styles.miscueTitle
                      }
                    >
                      Record Passage Miscue
                    </div>

                    <div
                      style={
                        styles.miscueGrid
                      }
                    >
                      <label
                        style={
                          styles.field
                        }
                      >
                        <span>
                          Word #
                        </span>

                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={
                            miscueWordIndex
                          }
                          onChange={(
                            event
                          ) =>
                            setMiscueWordIndex(
                              Math.min(
                                100,
                                Math.max(
                                  1,
                                  Number(
                                    event
                                      .target
                                      .value
                                  )
                                )
                              )
                            )
                          }
                          style={
                            styles.fieldInput
                          }
                        />
                      </label>

                      <label
                        style={
                          styles.field
                        }
                      >
                        <span>
                          Miscue Type
                        </span>

                        <select
                          value={
                            miscueType
                          }
                          onChange={(
                            event
                          ) =>
                            setMiscueType(
                              event.target.value
                            )
                          }
                          style={
                            styles.fieldInput
                          }
                        >
                          <option>
                            Insertion
                          </option>
                          <option>
                            Omission
                          </option>
                          <option>
                            Substitution
                          </option>
                          <option>
                            Repetition
                          </option>
                          <option>
                            SelfCorrection
                          </option>
                        </select>
                      </label>

                      <label
                        style={
                          styles.field
                        }
                      >
                        <span>
                          Misread word
                        </span>

                        <input
                          type="text"
                          value={
                            misreadWord
                          }
                          onChange={(
                            event
                          ) =>
                            setMisreadWord(
                              event.target.value
                            )
                          }
                          style={
                            styles.fieldInput
                          }
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      style={
                        styles.secondaryButton
                      }
                      onClick={
                        recordPassageMiscue
                      }
                      disabled={
                        busy ||
                        recordingMiscue
                      }
                    >
                      {recordingMiscue
                        ? "Saving..."
                        : "Record Miscue"}
                    </button>
                  </div>
                </>
              )}

              {timeUpSelecting && (
                <div style={styles.timeUpOverlay} role="dialog" aria-modal="true">
                  <div style={styles.timeUpCard}>
                    <div style={styles.timeUpIcon}>⏱️</div>
                    <div style={styles.timeUpTitle}>2-Minute Time Limit Reached</div>
                    <p style={styles.timeUpText}>
                      Click the last word the learner reached in the passage.
                      The selected word will be recorded and the assessment will
                      continue to comprehension.
                    </p>
                    <div style={styles.timeUpSelectionValue}>
                      Selected last word: {passageWordsRead || 0} / 100
                    </div>
                  </div>
                </div>
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
                      QUESTIONS.length
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
    padding:
      "26px",
    textAlign:
      "center",
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
    padding: "30px 26px",
    textAlign: "left",
    background: "linear-gradient(145deg,#f8fbff,#eaf3fb)",
    borderRadius: "0 0 14px 14px",
  },

  storyChoiceBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#e9f2fb",
    color: "#2769a8",
    fontSize: "10px",
    fontWeight: "900",
    letterSpacing: "1px",
    boxShadow: "inset 2px 2px 5px rgba(150,175,197,.12)",
  },

  storyChoiceTitle: {
    margin: "10px 0 0",
    color: "#19324d",
    fontSize: "24px",
    fontWeight: "900",
  },

  storyChoiceText: {
    margin: "7px 0 18px",
    color: "#73859a",
    fontSize: "11px",
    lineHeight: 1.6,
    maxWidth: "650px",
  },

  storyChoiceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
    gap: "12px",
  },

  storyChoiceCard: {
    display: "grid",
    gridTemplateColumns: "54px 1fr auto",
    alignItems: "center",
    gap: "12px",
    padding: "16px",
    border: "1px solid #d8e4ef",
    borderRadius: "16px",
    background: "linear-gradient(145deg,#f8fbff,#edf4fa)",
    boxShadow: "8px 9px 18px rgba(63,96,128,.12), -6px -6px 14px rgba(255,255,255,.86)",
  },

  storyChoiceIcon: {
    width: "54px",
    height: "54px",
    borderRadius: "15px",
    display: "grid",
    placeItems: "center",
    background: "#e7f0f8",
    fontSize: "24px",
    boxShadow: "inset 3px 3px 7px rgba(158,180,200,.12), inset -3px -3px 7px rgba(255,255,255,.72)",
  },

  storyChoiceBody: {
    minWidth: 0,
  },

  storyChoiceTitleSmall: {
    color: "#213b57",
    fontSize: "14px",
    fontWeight: "900",
  },

  storyChoiceDescription: {
    marginTop: "5px",
    color: "#7b8ca0",
    fontSize: "10px",
    lineHeight: 1.45,
  },

  storyChoiceButton: {
    minHeight: "40px",
    padding: "0 13px",
    border: 0,
    borderRadius: "10px",
    background: "linear-gradient(145deg,#1d69b7,#1559a6)",
    color: "#fff",
    fontSize: "10px",
    fontWeight: "900",
    cursor: "pointer",
    boxShadow: "6px 7px 13px rgba(21,89,166,.20), -4px -4px 9px rgba(255,255,255,.70)",
  },

  storyChoiceButtonDisabled: {
    minHeight: "40px",
    padding: "0 13px",
    border: "1px solid #d5e0eb",
    borderRadius: "10px",
    background: "#edf3f8",
    color: "#93a2b1",
    fontSize: "10px",
    fontWeight: "800",
    cursor: "not-allowed",
  },

  passageWord: {
    border: 0,
    background: "transparent",
    padding: "2px 3px",
    margin: 0,
    color: "#213b57",
    font: "inherit",
    cursor: "pointer",
    borderRadius: "6px",
  },
  passageWordSelected: {
    background: "#dcecf9",
    boxShadow: "inset 2px 2px 5px rgba(120,150,176,.14)",
  },
  timerToggleButton: {
    marginTop: "10px",
    minHeight: "34px",
    padding: "0 14px",
    border: "1px solid #d5e2ed",
    borderRadius: "10px",
    background: "#eef5fa",
    color: "#205b93",
    fontSize: "10px",
    fontWeight: "900",
    cursor: "pointer",
  },
  timeUpOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 4000,
    display: "grid",
    placeItems: "center",
    padding: "18px",
    background: "rgba(14,42,67,.42)",
    backdropFilter: "blur(8px)",
  },
  timeUpCard: {
    width: "min(520px,94vw)",
    padding: "28px",
    borderRadius: "22px",
    background: "linear-gradient(145deg,#f8fbff,#eaf3f9)",
    border: "1px solid #d7e3ec",
    boxShadow: "16px 18px 36px rgba(44,78,107,.20), -8px -8px 18px rgba(255,255,255,.82)",
    textAlign: "center",
  },
  timeUpIcon: {
    fontSize: "34px",
  },
  timeUpTitle: {
    marginTop: "9px",
    color: "#1c3854",
    fontSize: "23px",
    fontWeight: "900",
  },
  timeUpText: {
    marginTop: "8px",
    color: "#73879a",
    fontSize: "12px",
    lineHeight: 1.55,
  },
  timeUpSelectionValue: {
    marginTop: "15px",
    padding: "11px",
    borderRadius: "12px",
    background: "#edf5fb",
    color: "#275f93",
    fontSize: "12px",
    fontWeight: "900",
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

  passageControls: {
    display:
      "grid",
    gridTemplateColumns:
      "160px minmax(160px, 1fr)",
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