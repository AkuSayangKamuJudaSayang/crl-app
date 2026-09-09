"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ConnectionHealthPanel from "../../../components/ConnectionHealthPanel";
import {
  getMutations,
  putMutation,
  removeMutation,
} from "../../../lib/assessmentOutbox";
import { publishAssessmentRealtimeState } from "../../../lib/assessmentChannel";

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

const FIELD_PASSAGE_TEXT =
  "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil.";

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

export default function TeacherAssessmentPage({
  initialCode = "",
  initialLearnerId = "",
  initialPeriod = "BoSY",
}) {
  const code =
    String(initialCode || "").trim();

  const learnerId =
    String(initialLearnerId || "").trim();

  const period =
    String(initialPeriod || "BoSY").trim() ||
    "BoSY";

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
    confirmFinishReading,
    setConfirmFinishReading,
  ] = useState(false);

  const [
    showTerminationObservation,
    setShowTerminationObservation,
  ] = useState(false);

  const [
    terminationObservationLevel,
    setTerminationObservationLevel,
  ] = useState("");

  const [
    terminationRemarks,
    setTerminationRemarks,
  ] = useState("");

  const [
    savingTerminationObservation,
    setSavingTerminationObservation,
  ] = useState(false);

  const [
    terminationObservationError,
    setTerminationObservationError,
  ] = useState("");

  const terminationObservationHandledRef =
    useRef(false);

  const assessmentSaveLockRef =
    useRef(false);

  const openAssessmentSaveModal = useCallback(
    (nextSession = null) => {
      assessmentSaveLockRef.current = true;
      const current =
        nextSession ||
        latestSessionRef.current ||
        session;

      setTerminationRemarks(
        current?.metrics?.remarks || ""
      );
      setTerminationObservationError("");
      setShowTerminationObservation(true);
    },
    [session]
  );

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
  ] = useState(0);

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
  const [passagePaused, setPassagePaused] = useState(false);
  const [timeUpSelecting, setTimeUpSelecting] = useState(false);
  const [timeUpReviewConfirmed, setTimeUpReviewConfirmed] =
    useState(false);
  const [miscueDrawerOpen, setMiscueDrawerOpen] = useState(false);
  const [selectedPassageWord, setSelectedPassageWord] = useState(null);
  const [passageMiscues, setPassageMiscues] = useState([]);
  const [selectedMiscueType, setSelectedMiscueType] = useState(null);
  const [timeUpSelectedWord, setTimeUpSelectedWord] = useState(null);
  const passageTimerRequestRef = useRef(false);

  const [
    recordingMiscue,
    setRecordingMiscue,
  ] = useState(false);

  const [
    answerLockKey,
    setAnswerLockKey,
  ] = useState("");

  const [
    transitionPending,
    setTransitionPending,
  ] = useState(false);

  const miscueWriteChainsRef =
    useRef(new Map());

  const miscueMutationVersionRef =
    useRef(new Map());

  const passageTimerRef =
    useRef(null);

  const passageClockRef =
    useRef({
      startedAtMs: 0,
      pausedAtMs: null,
      pausedAccumulatedMs: 0,
      frozenSeconds: 0,
      paused: false,
    });

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

  const passageText =
    session?.story_title === "A Day In The Fields"
      ? FIELD_PASSAGE_TEXT
      : PASSAGE_TEXT;

  const pendingAnswerRef =
    useRef(false);

  const fetchSession =
    useCallback(
      async () => {
        if (assessmentSaveLockRef.current) {
          return;
        }

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
          if (
            response.status === 404 &&
            latestSessionRef.current
          ) {
            return;
          }

          throw new Error(
            data.error ||
              "Unable to retrieve assessment session."
          );
        }

        if (
          data?.session &&
          (
            data.session.stage === "completed" ||
            (
              data.session.stage === "terminated" &&
              (
                data.session.early_termination === "part1_task1_zero" ||
                data.session.current_content === "ZERO_SCORE_PART1_TASK1" ||
                data.session.currentContent === "ZERO_SCORE_PART1_TASK1"
              )
            )
          )
        ) {
          latestSessionRef.current = data.session;
          latestActiveStageRef.current = data.session.stage;
          setSession(data.session);
          setActiveStage(data.session.stage);

          if (!terminationObservationHandledRef.current) {
            terminationObservationHandledRef.current = true;
            openAssessmentSaveModal(data.session);
          }

          return;
        }

        if (
          data?.session &&
          data.session.ended
        ) {
          latestSessionRef.current = data.session;
          latestActiveStageRef.current =
            data.session.stage || "ended";
          setSession(data.session);
          setActiveStage(
            data.session.stage || "ended"
          );
          return;
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
            : FIELD_PASSAGE_TEXT,
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
          void publishAssessmentRealtimeState(
            code,
            latestSessionRef.current
          );
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

  const controlPassageTimer =
    useCallback(
      async (mode) => {
        if (
          activeStage !== "passage" ||
          passageTimerRequestRef.current
        ) {
          return;
        }

        const clock =
          passageClockRef.current;

        if (
          !clock.startedAtMs
        ) {
          return;
        }

        const shouldPause =
          mode === "pause";

        if (
          shouldPause ===
          clock.paused
        ) {
          return;
        }

        passageTimerRequestRef.current =
          true;

        const previous = {
          paused: clock.paused,
          pausedAtMs:
            clock.pausedAtMs,
          pausedAccumulatedMs:
            clock.pausedAccumulatedMs,
        };

        if (shouldPause) {
          /*
           * Freeze the displayed value before changing state. The timer
           * effect will return this exact value on every tick while paused.
           */
          const now = Date.now();

          clock.frozenSeconds =
            Math.min(
              120,
              Math.max(
                0,
                Math.floor(
                  (
                    now -
                    clock.startedAtMs -
                    clock.pausedAccumulatedMs
                  ) / 1000
                )
              )
            );

          clock.paused = true;
          clock.pausedAtMs = now;

          setPassageSeconds(
            clock.frozenSeconds
          );
          setPassagePaused(true);
        } else {
          const pauseDuration =
            clock.pausedAtMs
              ? Math.max(
                  0,
                  Date.now() -
                    clock.pausedAtMs
                )
              : 0;

          clock.pausedAccumulatedMs +=
            pauseDuration;
          clock.pausedAtMs = null;
          clock.paused = false;

          setPassagePaused(false);
          setTimeUpSelecting(false);
        }

        try {
          const response =
            await fetch(
              "/api/assessment?action=passage_timer",
              {
                method: "POST",
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
                      "passage_timer",
                    code,
                    mode,
                  }),
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data?.error ||
                "Unable to update the passage timer."
            );
          }

          /*
           * Do not overwrite the local pause duration with the server's
           * whole-second value. The server intentionally stores seconds,
           * while this clock keeps millisecond precision so a quick
           * pause/resume cannot cause a visible one-second jump.
           */
          /*
           * The local clock is authoritative for the visible UI. The server
           * response only confirms persistence; it must not move the pause
           * timestamp forward or change the frozen second.
           */
          setPassagePaused(
            clock.paused
          );

          setSession((current) => {
            if (!current) return current;

            const next = {
              ...current,
              passage_started_at:
                data.passage_started_at,
              passageStartedAt:
                data.passage_started_at,
              passage_paused_at:
                data.passage_paused_at,
              passagePausedAt:
                data.passage_paused_at,
              passage_paused_seconds:
                data.passage_paused_seconds,
              passagePausedSeconds:
                data.passage_paused_seconds,
            };

            latestSessionRef.current =
              next;

            return next;
          });

          void publishAssessmentRealtimeState(
            code,
            latestSessionRef.current
          );
        } catch (timerError) {
          clock.paused =
            previous.paused;
          clock.pausedAtMs =
            previous.pausedAtMs;
          clock.pausedAccumulatedMs =
            previous.pausedAccumulatedMs;

          setPassagePaused(
            previous.paused
          );

          setError(
            timerError?.message ||
              "Unable to update the passage timer."
          );
        } finally {
          passageTimerRequestRef.current =
            false;
        }
      },
      [activeStage, code]
    );

  const passageWordElements =
    useMemo(
      () => {
        let wordNumber = 0;

        const miscueColors = {
          Insertion: {
            background: "#dff1ff",
            color: "#1766a9",
            border: "#74b8ea",
          },
          Omission: {
            background: "#ffe5e8",
            color: "#b32031",
            border: "#e99aa5",
          },
          Substitution: {
            background: "#fff0d9",
            color: "#955900",
            border: "#e7b66a",
          },
          Repetition: {
            background: "#eee5ff",
            color: "#7041a8",
            border: "#b89bdc",
          },
          SelfCorrection: {
            background: "#e2f7e9",
            color: "#287447",
            border: "#98d2a8",
          },
        };

        return passageText.split(/(\s+)/).map(
          (token, index) => {
            if (!token.trim()) {
              return token;
            }

            const currentNumber =
              wordNumber++;

            const annotation =
              passageMiscues.find(
                (item) =>
                  Number(item.wordIndex) ===
                  currentNumber
              );

            const annotationColor =
              annotation
                ? miscueColors[
                    annotation.miscueType
                  ] ||
                  miscueColors.Substitution
                : null;

            const isSelected =
              Number(
                selectedPassageWord
              ) ===
              currentNumber + 1;

            return (
              <button
                key={
                  "passage-word-" +
                  index
                }
                type="button"
                className="crlPassageWord"
                style={{
                  ...styles.passageWord,
                  ...(annotationColor
                    ? {
                        background:
                          annotationColor.background,
                        color:
                          annotationColor.color,
                        boxShadow:
                          "inset 0 -3px 0 " +
                          annotationColor.border,
                      }
                    : {}),
                  ...(isSelected
                    ? styles.passageWordSelected
                    : {}),
                }}
                onClick={() => {
                  const number =
                    currentNumber + 1;

                  const existingMiscue =
                    passageMiscues.find(
                      (item) =>
                        Number(item.wordIndex) ===
                        currentNumber
                    );

                  if (
                    timeUpSelecting &&
                    timeUpReviewConfirmed
                  ) {
                    setPassageWordsRead(
                      number
                    );
                    setTimeUpSelecting(
                      false
                    );
                    setTimeUpSelectedWord(
                      number
                    );
                    setMiscueDrawerOpen(
                      false
                    );
                    setSelectedPassageWord(
                      null
                    );
                    setSelectedMiscueType(
                      null
                    );
                    setMisreadWord("");
                    return;
                  }

                  setSelectedPassageWord(
                    number
                  );
                  setMiscueWordIndex(
                    number
                  );
                  setSelectedMiscueType(
                    existingMiscue?.miscueType ||
                      null
                  );
                  setMisreadWord(
                    existingMiscue?.misreadWord ||
                      ""
                  );
                  setMiscueDrawerOpen(
                    true
                  );
                }}
                aria-label={
                  "Word " +
                  (currentNumber + 1) +
                  ": " +
                  token
                }
              >
                {token}
              </button>
            );
          }
        );
      },
      [
        passageText,
        passageMiscues,
        selectedPassageWord,
        timeUpSelecting,
        timeUpReviewConfirmed,
      ]
    );

  const finishPassageReading =
    useCallback(
      async (
        secondsOverride,
        wordsOverride
      ) => {
        if (passageFinalizingRef.current) {
          return;
        }

        passageFinalizingRef.current = true;
        setBusy(true);
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
                wordsOverride ?? 100
              )
            )
          );

          const response = await fetch(
            "/api/assessment?action=finish_passage",
            {
              method: "POST",
              credentials: "include",
              cache: "no-store",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                action: "finish_passage",
                code,
                timer_seconds: Math.round(seconds),
                words_read: Math.round(wordsRead),
              }),
            }
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(
              data?.error ||
                "Unable to finish the passage."
            );
          }

          setPassageSeconds(Math.round(seconds));
          setPassageWordsRead(wordsRead);
          setTimeUpSelecting(false);
          setTimeUpReviewConfirmed(false);
          setMiscueDrawerOpen(false);

          if (passageTimerRef.current) {
            window.clearInterval(
              passageTimerRef.current
            );
            passageTimerRef.current = null;
          }

          const nextSession = {
            ...(latestSessionRef.current || {}),
            stage: "comprehension",
            current_content:
              data.current_content ||
              "What must Para look for?",
            currentContent:
              data.current_content ||
              "What must Para look for?",
            story_title:
              data.story_title ||
              latestSessionRef.current?.story_title ||
              "Para the Parrot",
            storyTitle:
              data.story_title ||
              latestSessionRef.current?.storyTitle ||
              "Para the Parrot",
          };

          latestSessionRef.current = nextSession;
          latestActiveStageRef.current =
            "comprehension";

          setSession(nextSession);
          setActiveStage("comprehension");
          void publishAssessmentRealtimeState(
            code,
            nextSession
          );
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
      [code, passageSeconds]
    );

  useEffect(() => {
    if (
      timeUpSelectedWord === null ||
      activeStage !== "passage"
    ) {
      return undefined;
    }

    setTimeUpSelectedWord(null);
    setTimeUpSelecting(true);
    setTimeUpReviewConfirmed(false);

    return undefined;
  }, [
    timeUpSelectedWord,
    activeStage,
  ]);

  const removePassageMiscue =
    useCallback(
      async () => {
        const selectedNumber =
          Number(
            selectedPassageWord || 0
          );

        const selectedIndex =
          selectedNumber - 1;

        if (
          selectedIndex < 0 ||
          selectedIndex >= 100
        ) {
          return;
        }

        const version =
          (
            miscueMutationVersionRef.current.get(
              selectedIndex
            ) || 0
          ) + 1;

        miscueMutationVersionRef.current.set(
          selectedIndex,
          version
        );

        const previous =
          passageMiscues;

        setError("");
        setPassageMiscues(
          previous.filter(
            (item) =>
              Number(item.wordIndex) !==
              selectedIndex
          )
        );

        setMiscueDrawerOpen(false);
        setSelectedPassageWord(null);
        setSelectedMiscueType(null);
        setMisreadWord("");
        setMiscueWordIndex(1);

        const removeWrite =
          async () => {
            const response =
              await fetch(
                "/api/assessment?action=remove_passage_miscue",
                {
                  method: "POST",
                  credentials: "include",
                  cache: "no-store",
                  headers: {
                    "Content-Type":
                      "application/json",
                    Accept:
                      "application/json",
                  },
                  body: JSON.stringify({
                    action:
                      "remove_passage_miscue",
                    code,
                    word_index:
                      selectedIndex,
                  }),
                }
              );

            const data =
              await response.json();

            if (!response.ok) {
              throw new Error(
                data?.error ||
                  "Unable to remove the miscue."
              );
            }

            return data;
          };

        const previousWrite =
          miscueWriteChainsRef.current.get(
            selectedIndex
          ) || Promise.resolve();

        const currentWrite =
          previousWrite
            .catch(() => undefined)
            .then(removeWrite);

        miscueWriteChainsRef.current.set(
          selectedIndex,
          currentWrite
        );

        void currentWrite
          .catch((error) => {
            if (
              miscueMutationVersionRef.current.get(
                selectedIndex
              ) !== version
            ) {
              return;
            }

            setPassageMiscues(
              (current) => [
                ...current.filter(
                  (item) =>
                    Number(item.wordIndex) !==
                    selectedIndex
                ),
                ...previous.filter(
                  (item) =>
                    Number(item.wordIndex) ===
                    selectedIndex
                ),
              ]
            );

            setError(
              error?.message ||
                "Unable to remove the miscue."
            );
          })
          .finally(() => {
            if (
              miscueWriteChainsRef.current.get(
                selectedIndex
              ) === currentWrite
            ) {
              miscueWriteChainsRef.current.delete(
                selectedIndex
              );
            }
          });
      },
      [
        selectedPassageWord,
        passageMiscues,
        code,
      ]
    );

  const recordPassageMiscue =
    useCallback(
      async (
        selectedWordOverride,
        typeOverride,
        misreadWordOverride
      ) => {
        const selectedNumber =
          Number(
            selectedWordOverride ??
              selectedPassageWord ??
              0
          );

        const selectedIndex =
          selectedNumber - 1;

        if (
          selectedIndex < 0 ||
          selectedIndex >= 100
        ) {
          return;
        }

        const nextType =
          String(
            typeOverride ||
              selectedMiscueType ||
              miscueType ||
              "Substitution"
          );

        const nextMisreadWord =
          String(
            misreadWordOverride ??
              misreadWord ??
              ""
          ).trim();

        if (
          (
            nextType === "Insertion" ||
            nextType === "Substitution"
          ) &&
          !nextMisreadWord
        ) {
          setSelectedMiscueType(
            nextType
          );
          return;
        }

        const version =
          (
            miscueMutationVersionRef.current.get(
              selectedIndex
            ) || 0
          ) + 1;

        miscueMutationVersionRef.current.set(
          selectedIndex,
          version
        );

        const previous =
          passageMiscues;

        const optimistic = {
          wordIndex:
            selectedIndex,
          miscueType:
            nextType,
          misreadWord:
            nextMisreadWord,
        };

        setError("");
        setPassageMiscues(
          [
            ...previous.filter(
              (item) =>
                Number(item.wordIndex) !==
                selectedIndex
            ),
            optimistic,
          ]
        );

        setMiscueDrawerOpen(false);
        setSelectedPassageWord(null);
        setSelectedMiscueType(null);
        setMiscueWordIndex(1);
        setMisreadWord("");

        const write =
          async () => {
            const response =
              await fetch(
                "/api/assessment?action=record_passage_miscue",
                {
                  method: "POST",
                  credentials: "include",
                  cache: "no-store",
                  headers: {
                    "Content-Type":
                      "application/json",
                    Accept:
                      "application/json",
                  },
                  body: JSON.stringify({
                    action:
                      "record_passage_miscue",
                    code,
                    word_index:
                      selectedIndex,
                    miscue_type:
                      nextType,
                    misread_word:
                      nextMisreadWord,
                  }),
                }
              );

            const data =
              await response.json();

            if (!response.ok) {
              throw new Error(
                data?.error ||
                  "Unable to record the miscue."
              );
            }

            /*
             * Only the latest mutation for this word may reconcile the UI.
             */
            if (
              miscueMutationVersionRef.current.get(
                selectedIndex
              ) === version &&
              data?.result
            ) {
              setPassageMiscues(
                (current) => [
                  ...current.filter(
                    (item) =>
                      Number(item.wordIndex) !==
                      selectedIndex
                  ),
                  {
                    wordIndex:
                      Number(
                        data.result.wordIndex
                      ),
                    miscueType:
                      data.result.miscueType,
                    misreadWord:
                      data.result
                        .misreadWord ||
                      "",
                  },
                ]
              );
            }

            return data;
          };

        const previousWrite =
          miscueWriteChainsRef.current.get(
            selectedIndex
          ) || Promise.resolve();

        const currentWrite =
          previousWrite
            .catch(() => undefined)
            .then(write);

        miscueWriteChainsRef.current.set(
          selectedIndex,
          currentWrite
        );

        void currentWrite
          .catch((error) => {
            if (
              miscueMutationVersionRef.current.get(
                selectedIndex
              ) !== version
            ) {
              return;
            }

            setPassageMiscues(
              (current) => [
                ...current.filter(
                  (item) =>
                    Number(item.wordIndex) !==
                    selectedIndex
                ),
                ...previous.filter(
                  (item) =>
                    Number(item.wordIndex) ===
                    selectedIndex
                ),
              ]
            );

            setError(
              error?.message ||
                "Unable to record the miscue."
            );
          })
          .finally(() => {
            if (
              miscueWriteChainsRef.current.get(
                selectedIndex
              ) === currentWrite
            ) {
              miscueWriteChainsRef.current.delete(
                selectedIndex
              );
            }
          });
      },
      [
        selectedPassageWord,
        selectedMiscueType,
        miscueType,
        misreadWord,
        passageMiscues,
        code,
      ]
    );

  useEffect(() => {
    if (activeStage !== "passage") {
      setMiscueDrawerOpen(false);
      setSelectedPassageWord(null);
      setSelectedMiscueType(null);
      setPassageMiscues([]);
      setPassageWordsRead(0);
      setPassagePaused(false);
      setTimeUpSelecting(false);
      setTimeUpReviewConfirmed(false);

      if (passageTimerRef.current) {
        window.clearInterval(
          passageTimerRef.current
        );
        passageTimerRef.current = null;
      }

      passageClockRef.current = {
        startedAtMs: 0,
        pausedAtMs: null,
        pausedAccumulatedMs: 0,
        paused: false,
      };

      return undefined;
    }

    const startedAt =
      session?.passage_started_at ||
      session?.passageStartedAt;

    if (!startedAt) {
      if (passageTimerRef.current) {
        window.clearInterval(
          passageTimerRef.current
        );
        passageTimerRef.current = null;
      }

      setPassageSeconds(0);
      return undefined;
    }

    const startedAtMs =
      new Date(startedAt).getTime();

    if (!Number.isFinite(startedAtMs)) {
      setPassageSeconds(0);
      return undefined;
    }

    const clock =
      passageClockRef.current;

    if (
      clock.startedAtMs !==
      startedAtMs
    ) {
      clock.startedAtMs =
        startedAtMs;
      clock.pausedAtMs = null;
      clock.pausedAccumulatedMs =
        Number(
          session?.passage_paused_seconds ||
            session?.passagePausedSeconds ||
            0
        ) * 1000;
      clock.frozenSeconds = 0;
      clock.paused = Boolean(
        session?.passage_paused_at ||
          session?.passagePausedAt
      );
      if (
        clock.paused &&
        !clock.pausedAtMs
      ) {
        clock.pausedAtMs =
          Date.now();
      }
    }

    const tick = () => {
      const current =
        passageClockRef.current;

      if (!current.startedAtMs) {
        return;
      }

      if (current.paused) {
        setPassageSeconds(
          current.frozenSeconds
        );
        setPassagePaused(true);
        return;
      }

      const now = Date.now();

      const elapsed =
        Math.min(
          120,
          Math.max(
            0,
            Math.floor(
              (
                now -
                current.startedAtMs -
                current.pausedAccumulatedMs
              ) / 1000
            )
          )
        );

      current.frozenSeconds =
        elapsed;

      setPassageSeconds(elapsed);
      setPassagePaused(false);

      if (
        elapsed >= 120 &&
        !current.paused &&
        !passageFinalizingRef.current
      ) {
        setTimeUpSelecting(true);
      }
    };

    tick();

    if (passageTimerRef.current) {
      window.clearInterval(
        passageTimerRef.current
      );
    }

    passageTimerRef.current =
      window.setInterval(
        tick,
        250
      );

    return () => {
      if (passageTimerRef.current) {
        window.clearInterval(
          passageTimerRef.current
        );
        passageTimerRef.current = null;
      }
    };
  }, [
    activeStage,
    session?.passage_started_at,
    session?.passageStartedAt,
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
        1000
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
      const currentIndex =
        letterIndex;
      const lockKey =
        "letter:" + currentIndex;

      if (
        answerLockKey === lockKey ||
        pendingAnswerRef.current
      ) {
        return;
      }

      setAnswerLockKey(lockKey);
      setBusy(true);
      pendingAnswerRef.current = true;
      const isFinal = currentIndex === LETTERS.length - 1;

      if (!isFinal) {
        const nextIndex = currentIndex + 1;
        setTransitionPending(true);
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
        void publishAssessmentRealtimeState(code, optimisticLetterSession);

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
          expected_stage: "letter",
          expected_current_content:
            LETTERS[currentIndex],
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

            if (
              data?.session &&
              !data?.stale
            ) {
              const current = latestSessionRef.current;
              const incomingStage =
                String(data.session.stage || "");
              const currentStage =
                String(current?.stage || "");

              if (
                incomingStage === currentStage ||
                (
                  currentStage === "letter" &&
                  incomingStage === "letter"
                ) ||
                (
                  currentStage === "word" &&
                  incomingStage === "word"
                )
              ) {
                latestSessionRef.current = {
                  ...current,
                  ...data.session,
                  connected:
                    data.session.connected ??
                    current?.connected ??
                    true,
                };

                void publishAssessmentRealtimeState(
                  code,
                  latestSessionRef.current
                );
              }
            }
          } catch {
            await queueHostAdvanceForBackgroundRetry(nextLetter);
          } finally {
            setTransitionPending(false);
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
          const terminalSession = {
            ...(data.session || latestSessionRef.current || {}),
            ...(data.session || {
              code,
              stage: "terminated",
              current_content: "ZERO_SCORE_PART1_TASK1",
              currentContent: "ZERO_SCORE_PART1_TASK1",
              ended: true,
              connected: false,
            }),
            early_termination:
              data.early_termination || "part1_task1_zero",
            metrics: {
              ...(latestSessionRef.current?.metrics || {}),
              ...(data.scoring || {}),
            },
          };

          latestSessionRef.current = terminalSession;
          latestActiveStageRef.current = "terminated";
          setSession(terminalSession);
          setActiveStage("terminated");
          terminationObservationHandledRef.current = true;
          openAssessmentSaveModal(terminalSession);
          void publishAssessmentRealtimeState(code, terminalSession);
          return;
        }

        setWordIndex(0);

        if (data.session) {
          setSession(data.session);
          setActiveStage(data.session.stage);
        }

        setTransitionPending(false);
      } finally {
        pendingAnswerRef.current = false;
        setBusy(false);
      }
    };

  const recordWord =
    async (
      isCorrect
    ) => {
      const currentIndex =
        wordIndex;
      const lockKey =
        "word:" + currentIndex;

      if (
        answerLockKey === lockKey ||
        pendingAnswerRef.current
      ) {
        return;
      }

      setAnswerLockKey(lockKey);
      setBusy(true);
      pendingAnswerRef.current = true;
      const isFinal = currentIndex === WORDS.length - 1;

      if (!isFinal) {
        const nextIndex = currentIndex + 1;
        setTransitionPending(true);
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
        void publishAssessmentRealtimeState(code, optimisticWordSession);

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
          expected_stage: "word",
          expected_current_content:
            WORDS[currentIndex],
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

            if (
              data?.session &&
              !data?.stale
            ) {
              const current = latestSessionRef.current;
              const incomingStage =
                String(data.session.stage || "");
              const currentStage =
                String(current?.stage || "");

              if (
                incomingStage === currentStage ||
                (
                  currentStage === "letter" &&
                  incomingStage === "letter"
                ) ||
                (
                  currentStage === "word" &&
                  incomingStage === "word"
                )
              ) {
                latestSessionRef.current = {
                  ...current,
                  ...data.session,
                  connected:
                    data.session.connected ??
                    current?.connected ??
                    true,
                };

                void publishAssessmentRealtimeState(
                  code,
                  latestSessionRef.current
                );
              }
            }
          } catch {
            await queueHostAdvanceForBackgroundRetry(nextWord);
          } finally {
            setTransitionPending(false);
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

        setTransitionPending(false);
      } finally {
        pendingAnswerRef.current = false;
        setBusy(false);
      }
    };

  const recordComprehension =
    async (
      isCorrect
    ) => {
      const lockKey =
        "comprehension:" +
        questionIndex;

      if (
        answerLockKey === lockKey ||
        pendingAnswerRef.current
      ) {
        return;
      }

      setAnswerLockKey(lockKey);
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

        const finalSession = {
          ...(latestSessionRef.current || {}),
          code,
          stage: "completed",
          ended: true,
          connected: false,
          metrics: {
            ...(latestSessionRef.current?.metrics || {}),
            ...(data.scoring || {}),
            classification:
              data.classification ||
              latestSessionRef.current?.metrics?.classification,
          },
        };

        latestSessionRef.current = finalSession;
        latestActiveStageRef.current = "completed";
        setSession(finalSession);
        setActiveStage("completed");
        terminationObservationHandledRef.current = true;
        openAssessmentSaveModal(finalSession);
        void publishAssessmentRealtimeState(code, finalSession);
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

  const saveTerminationObservation = useCallback(
    async () => {
      if (savingTerminationObservation) return;

      const remarks = terminationRemarks.trim();

      setSavingTerminationObservation(true);
      setTerminationObservationError("");

      try {
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
            data?.error || "Unable to save the learner observation."
          );
        }

        setSession((current) => ({
          ...(current || {}),
          metrics: {
            ...(current?.metrics || {}),
            observationLevel: data.observation_level,
            remarks: data.remarks || "",
            classification:
              data.classification ||
              current?.metrics?.classification ||
              "Low Emerging Reader",
          },
        }));
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
            "Unable to save the learner observation."
        );
      } finally {
        setSavingTerminationObservation(false);
      }
    },
    [
      code,
      savingTerminationObservation,
      terminationObservationLevel,
      terminationRemarks,
    ]
  );

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
        .crlPassageWord:hover {
          background: #e7f2fc !important;
          color: #1559a6 !important;
          box-shadow:
            0 3px 10px rgba(81,120,155,.18);
          transform: translateY(-1px);
        }

        .crlPassageWord:focus-visible {
          outline: 3px solid #7cb0dc;
          outline-offset: 2px;
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

        @media (max-width: 900px) {
          .teacherAssessmentPage {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
        }

        @media (max-width: 720px) {
          .teacherAssessmentPage header {
            flex-wrap: wrap !important;
            align-items: flex-start !important;
          }

          .teacherAssessmentPage header > div:first-child {
            min-width: 0 !important;
            flex: 1 1 100% !important;
          }

          .teacherAssessmentPage header button {
            margin-left: auto !important;
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
                styles.headerSub
              }
            >
              {period} Assessment for{" "}
              {[
                session?.learner?.first_name,
                session?.learner?.middle_name,
                session?.learner?.last_name,
                session?.learner?.suffix,
              ]
                .filter(Boolean)
                .join(" ") ||
                "Learner"}
            </div>
          </div>

          <button
            type="button"
            style={
              joined
                ? styles.endSessionButton
                : styles.backDashboardButton
            }
            onClick={
              joined
                ? endSession
                : () =>
                    window.location.replace(
                      "/teacher"
                    )
            }
            disabled={
              joined &&
              busy
            }
          >
            {joined
              ? "End Session"
              : "Back to Dashboard"}
          </button>
        </header>

        {!joined && (
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
                    "#c77b17",
                }}
              />

              Waiting for learner to connect
            </div>
          </section>
        )}

        {joined && (
          <section
            style={
              styles.connectedStatusCard
            }
          >
            <span
              style={{
                ...styles.dot,
                background:
                  "#18834e",
              }}
            />
            Learner connected
          </section>
        )}

        <section
          style={
            styles.assessmentCard
          }
        >
          {activeStage !== "passage" && (
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

          )}

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
                      disabled={
                        busy ||
                        transitionPending ||
                        answerLockKey ===
                          ("letter:" +
                            letterIndex)
                      }
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
                      disabled={
                        busy ||
                        transitionPending ||
                        answerLockKey ===
                          ("letter:" +
                            letterIndex)
                      }
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
                      disabled={
                        busy ||
                        transitionPending ||
                        answerLockKey ===
                          ("word:" +
                            wordIndex)
                      }
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
                      disabled={
                        busy ||
                        transitionPending ||
                        answerLockKey ===
                          ("word:" +
                            wordIndex)
                      }
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
                        style={{
                          ...styles.storyChoiceCard,
                          cursor: story.available ? "pointer" : "default",
                        }}
                        role={story.available ? "button" : undefined}
                        tabIndex={story.available ? 0 : undefined}
                        onClick={() => {
                          if (story.available) {
                            void selectStory(story);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (
                            story.available &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            void selectStory(story);
                          }
                        }}
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
                <section
                  style={styles.passageInterface}
                  aria-label="Passage reading assessment"
                >
                  <div style={styles.passageHeader}>
                    <div>
                      <div style={styles.passageEyebrow}>
                        PART 2 · PASSAGE READING
                      </div>
                      <h2 style={styles.passageStoryTitle}>
                        {session?.story_title ||
                          "Para The Parrot"}
                      </h2>
                    </div>

                    <div
                      style={{
                        ...styles.passageStatus,
                        ...(passagePaused
                          ? styles.passageStatusPaused
                          : {}),
                      }}
                    >
                      <span
                        style={styles.passageStatusDot}
                      />
                      {passagePaused
                        ? "PAUSED"
                        : passageSeconds >= 120
                          ? "TIME LIMIT"
                          : "READING"}
                    </div>
                  </div>

                  <div style={styles.passageReadingCard}>
                    <div style={styles.passageMetaRow}>
                      <span>
                        {passageText
                          .trim()
                          .split(/\s+/)
                          .filter(Boolean)
                          .length}{" "}
                        words
                      </span>
                      <span>
                        {passageMiscues.length} miscue
                        {passageMiscues.length === 1
                          ? ""
                          : "s"}
                      </span>
                    </div>

                    <div
                      style={styles.passageText}
                      role="region"
                      aria-label="Passage text"
                    >
                      {passageWordElements}
                    </div>

                  </div>

                  <div style={styles.passageControlGrid}>
                    {passageSeconds < 120 ? (
                      <div style={styles.passageTimerCard}>
                        <div style={styles.timerIconShell}>
                          <span style={styles.timerIcon}>◷</span>
                        </div>

                        <div style={styles.timerInfo}>
                          <div style={styles.timerLabel}>
                            TIME
                          </div>

                          <div style={styles.timerValue}>
                            {String(
                              Math.floor(
                                passageSeconds / 60
                              )
                            ).padStart(2, "0")}
                            :
                            {String(
                              passageSeconds % 60
                            ).padStart(2, "0")}
                          </div>
                        </div>

                        <button
                          type="button"
                          aria-label={
                            passagePaused
                              ? "Resume reading"
                              : "Pause reading"
                          }
                          title={
                            passagePaused
                              ? "Resume reading"
                              : "Pause reading"
                          }
                          style={{
                            ...styles.timerIconButton,
                            ...(passagePaused
                              ? styles.timerResumeIcon
                              : styles.timerPauseIcon),
                          }}
                          onClick={() =>
                            void controlPassageTimer(
                              passagePaused
                                ? "resume"
                                : "pause"
                            )
                          }
                          disabled={
                            !session?.passage_started_at ||
                            passageTimerRequestRef.current
                          }
                        >
                          {passagePaused
                            ? "▶"
                            : "❚❚"}
                        </button>
                      </div>
                    ) : null}

                    {timeUpSelecting && (
                      <div style={styles.timeoutWorkflowCard}>
                        {!timeUpReviewConfirmed ? (
                          <>
                            <div style={styles.timeoutWorkflowTitle}>
                              Review miscues
                            </div>
                            <p style={styles.timeoutWorkflowText}>
                              Click any word above only when you observed a
                              miscue. You may leave every word unchanged.
                            </p>
                            <button
                              type="button"
                              style={styles.timeoutConfirmButton}
                              onClick={() => {
                                setTimeUpReviewConfirmed(true);
                                setMiscueDrawerOpen(false);
                                setSelectedPassageWord(null);
                                setSelectedMiscueType(null);
                                setMisreadWord("");
                              }}
                              disabled={miscueDrawerOpen}
                            >
                              Confirm &amp; Continue
                            </button>
                          </>
                        ) : (
                          <>
                            <div style={styles.timeoutStepBadge}>
                              STEP 2
                            </div>
                            <div style={styles.timeoutWorkflowTitle}>
                              Select last word read
                            </div>
                            <p style={styles.timeoutWorkflowText}>
                              Click the last word the learner reached in
                              the passage above.
                            </p>
                            <div style={styles.lastWordValue}>
                              {passageWordsRead
                                ? passageWordsRead
                                : "Not selected"}
                              <span> / 100</span>
                            </div>
                            <div style={styles.timeoutWorkflowHint}>
                              This selection will finish the passage and
                              open comprehension.
                            </div>
                          </>
                        )}
                      </div>
                    )}

                  </div>

                  <div style={styles.passageFinishRow}>
                    {!timeUpSelecting && (
                      <button
                        type="button"
                        style={styles.primaryPassageButton}
                        onClick={() =>
                          setConfirmFinishReading(
                            true
                          )
                        }
                        disabled={
                          busy ||
                          passageFinalizingRef.current
                        }
                      >
                        Finish Reading
                      </button>
                    )}
                  </div>

                  {miscueDrawerOpen && (
                    <div
                      style={styles.miscueOverlay}
                      role="dialog"
                      aria-modal="true"
                      aria-label="Miscue selection"
                    >
                      <div style={styles.miscueDrawer}>
                        <div style={styles.miscueDrawerHeader}>
                          <div>
                            <div style={styles.miscueDrawerEyebrow}>
                              MISCUE OBSERVATION
                            </div>
                            <div style={styles.miscueDrawerWord}>
                              {passageText
                                .split(/\s+/)
                                .filter(Boolean)[
                                  Math.max(
                                    0,
                                    Number(
                                      selectedPassageWord || 1
                                    ) - 1
                                  )
                                ] || ""}
                            </div>
                            <div style={styles.miscueDrawerHint}>
                              Choose the miscue type observed for this word.
                            </div>
                          </div>

                          <button
                            type="button"
                            style={styles.miscueDrawerClose}
                            onClick={() => {
                              setMiscueDrawerOpen(false);
                              setSelectedPassageWord(null);
                              setSelectedMiscueType(null);
                              setMiscueWordIndex(1);
                              setMisreadWord("");
                            }}
                            aria-label="Close miscue type selector"
                          >
                            ×
                          </button>
                        </div>

                        <div style={styles.miscueTypeGrid}>
                          {[
                            [
                              "Insertion",
                              "Added word or sound",
                              "#1766a9",
                              "#dff1ff",
                            ],
                            [
                              "Omission",
                              "Word was skipped",
                              "#b32031",
                              "#ffe5e8",
                            ],
                            [
                              "Substitution",
                              "Another word was said",
                              "#955900",
                              "#fff0d9",
                            ],
                            [
                              "Repetition",
                              "Word was repeated",
                              "#7041a8",
                              "#eee5ff",
                            ],
                            [
                              "SelfCorrection",
                              "Learner corrected the error",
                              "#287447",
                              "#e2f7e9",
                            ],
                          ].map(
                            ([
                              label,
                              hint,
                              color,
                              background,
                            ]) => (
                              <button
                                key={label}
                                type="button"
                                style={{
                                  ...styles.miscueTypeButton,
                                  color,
                                  background,
                                  borderColor: color,
                                  ...(selectedMiscueType === label
                                    ? styles.miscueTypeButtonSelected
                                    : {}),
                                }}
                                onClick={() => {
                                  setSelectedMiscueType(
                                    label
                                  );

                                  if (
                                    label !== "Insertion" &&
                                    label !== "Substitution"
                                  ) {
                                    void recordPassageMiscue(
                                      selectedPassageWord,
                                      label,
                                      ""
                                    );
                                  }
                                }}
                                disabled={false}
                              >
                                <span
                                  style={
                                    styles.miscueTypeText
                                  }
                                >
                                  <strong
                                    style={
                                      styles.miscueTypeName
                                    }
                                  >
                                    {label ===
                                    "SelfCorrection"
                                      ? "Self-Correction"
                                      : label}
                                  </strong>
                                  <small
                                    style={
                                      styles.miscueTypeDescription
                                    }
                                  >
                                    {hint}
                                  </small>
                                </span>
                                <span
                                  style={{
                                    ...styles.miscueTypeArrow,
                                    color,
                                  }}
                                >
                                  →
                                </span>
                              </button>
                            )
                          )}
                        </div>

                        {passageMiscues.some(
                          (item) =>
                            Number(item.wordIndex) ===
                            Number(selectedPassageWord || 0) - 1
                        ) && (
                          <button
                            type="button"
                            style={styles.removeMiscueButton}
                            onClick={() =>
                              void removePassageMiscue()
                            }
                            disabled={false}
                          >
                            Remove Miscue
                          </button>
                        )}

                        {(
                          selectedMiscueType ===
                            "Insertion" ||
                          selectedMiscueType ===
                            "Substitution"
                        ) && (
                          <div
                            style={
                              styles.miscueEntryArea
                            }
                          >
                            <label
                              style={
                                styles.miscueEntryLabel
                              }
                            >
                              What did the learner say?
                            </label>
                            <div
                              style={
                                styles.miscueEntryPrompt
                              }
                            >
                              Enter the word or sound the learner said, then press Apply Miscue.
                            </div>
                            <input
                              type="text"
                              autoFocus
                              value={misreadWord}
                              onChange={(event) =>
                                setMisreadWord(
                                  event.target.value
                                )
                              }
                              placeholder={
                                selectedMiscueType ===
                                "Insertion"
                                  ? "Enter the word/sound the learner added"
                                  : "Enter the word the learner substituted"
                              }
                              style={
                                styles.miscueDrawerInput
                              }
                              disabled={
                                recordingMiscue
                              }
                            />
                            <button
                              type="button"
                              style={
                                styles.miscueApplyButton
                              }
                              onClick={() =>
                                void recordPassageMiscue(
                                  selectedPassageWord,
                                  selectedMiscueType,
                                  misreadWord
                                )
                              }
                              disabled={false}
                            >
                              Apply Miscue
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
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
                      disabled={
                        busy ||
                        transitionPending ||
                        answerLockKey ===
                          ("comprehension:" +
                            questionIndex)
                      }
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
                      disabled={
                        busy ||
                        transitionPending ||
                        answerLockKey ===
                          ("comprehension:" +
                            questionIndex)
                      }
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

        {confirmFinishReading && (
          <div
            style={styles.modalOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-reading-title"
          >
            <div style={styles.finishReadingModal}>
              <div style={styles.finishReadingIcon}>
                ✓
              </div>

              <h2
                id="finish-reading-title"
                style={styles.finishReadingTitle}
              >
                Finish Reading?
              </h2>

              <p style={styles.finishReadingText}>
                Are you sure you want to finish the passage reading
                and continue to comprehension?
              </p>

              <div style={styles.confirmActions}>
                <button
                  type="button"
                  style={styles.cancelButton}
                  onClick={() =>
                    setConfirmFinishReading(
                      false
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  style={styles.confirmButton}
                  onClick={async () => {
                    setConfirmFinishReading(
                      false
                    );
                    await finishPassageReading(
                      passageSeconds,
                      100
                    );
                  }}
                  disabled={
                    passageFinalizingRef.current
                  }
                >
                  Confirm Finish
                </button>
              </div>
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
                This will end the teacher session and cancel
                the current assessment attempt. No assessment
                result will be saved to Assessment Records.
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

        {showTerminationObservation && (
          <div
            style={styles.observationModalOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="termination-observation-title"
          >
            <div style={styles.observationModal}>
              <div style={styles.observationIcon}>📝</div>

              <h2
                id="termination-observation-title"
                style={styles.observationTitle}
              >
                {activeStage === "completed"
                  ? "Assessment Review"
                  : "Learner Observation"}
              </h2>

              <p style={styles.observationSubtitle}>
                {activeStage === "completed"
                  ? "The assessment is complete. Add any optional teacher remarks before saving the assessment."
                  : "Part 1 Task 1 ended with a score of 0. Add any optional teacher remarks before saving the assessment."}
              </p>

              <label style={styles.observationField}>
                <span>
                  Remarks <span style={styles.optionalLabel}>(optional)</span>
                </span>
                <textarea
                  value={terminationRemarks}
                  onChange={(event) =>
                    setTerminationRemarks(event.target.value)
                  }
                  disabled={savingTerminationObservation}
                  maxLength={5000}
                  placeholder="Enter your observation or remarks for this learner..."
                  style={styles.observationTextarea}
                />
              </label>

              {terminationObservationError && (
                <div style={styles.observationError} role="alert">
                  {terminationObservationError}
                </div>
              )}

              <button
                type="button"
                style={styles.observationSaveButton}
                onClick={saveTerminationObservation}
                disabled={savingTerminationObservation}
              >
                {savingTerminationObservation
                  ? "Saving Assessment..."
                  : "Save Assessment"}
              </button>
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
    width:
      "calc(100% + 8px)",
    margin:
      "0 -4px",
    minHeight:
      "72px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "space-between",
    gap:
      "16px",
    background:
      "linear-gradient(145deg,#1d66ae,#1559a6)",
    border:
      "1px solid #1559a6",
    borderRadius:
      "14px",
    padding:
      "12px 20px",
    boxShadow:
      "0 12px 28px rgba(21,89,166,.22)",
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
    color:
      "#ffffff",
    fontSize:
      "22px",
    lineHeight:
      1.25,
    fontWeight:
      "950",
    letterSpacing:
      "-.02em",
    minWidth:
      0,
    flex:
      "1 1 auto",
    overflowWrap:
      "anywhere",
    wordBreak:
      "break-word",
  },

  codeCard: {
    width:
      "min(520px, calc(100% - 32px))",
    margin:
      "14px auto 0",
    padding:
      "22px",
    background:
      "linear-gradient(145deg,#f7e7a8,#e8d184)",
    color:
      "#5e4e1e",
    border:
      "1px solid #d8c477",
    borderRadius:
      "16px",
    textAlign:
      "center",
    boxShadow:
      "0 12px 26px rgba(130,108,49,.15), -6px -6px 12px rgba(255,255,255,.8)",
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

  connectedStatusCard: {
    width:
      "calc(100% + 8px)",
    margin:
      "0 -4px 20px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    gap:
      "10px",
    minHeight:
      "58px",
    padding:
      "0 20px",
    borderRadius:
      "18px",
    background:
      "linear-gradient(145deg,#f3faf5,#e7f3eb)",
    border:
      "1px solid #d2e4d8",
    color:
      "#2a7b4d",
    fontSize:
      "17px",
    fontWeight:
      "950",
    boxShadow:
      "7px 8px 16px rgba(114,145,127,.13), -6px -6px 12px rgba(255,255,255,.9)",
  },

  assessmentCard: {
    width:
      "calc(100% + 8px)",
    margin:
      "0 -4px",

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
  timerIconShell: {
    width: "54px",
    height: "54px",
    margin: "0 auto 10px",
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    background: "linear-gradient(145deg,#eef5fb,#dfeaf4)",
    color: "#1559a6",
    boxShadow:
      "inset 3px 3px 7px rgba(117,145,170,.17), -3px -3px 7px rgba(255,255,255,.9)",
  },

  timerIcon: {
    fontSize: "31px",
    lineHeight: 1,
    fontWeight: "900",
  },

  timerIconButton: {
    width: "50px",
    height: "50px",
    margin: "11px auto 0",
    display: "grid",
    placeItems: "center",
    border: 0,
    borderRadius: "50%",
    color: "#ffffff",
    fontSize: "20px",
    fontWeight: "950",
    cursor: "pointer",
    boxShadow:
      "6px 7px 12px rgba(85,112,135,.18), -4px -4px 9px rgba(255,255,255,.88)",
  },

  timerPauseIcon: {
    background: "linear-gradient(145deg,#d44757,#b92738)",
  },

  timerResumeIcon: {
    background: "linear-gradient(145deg,#2f8f61,#1e744c)",
  },

  timeoutWorkflowCard: {
    width: "min(680px,680px)",
    margin: "12px auto 0",
    padding: "20px",
    borderRadius: "18px",
    background: "#ffffff",
    border: "1px solid #d7e3ed",
    boxShadow:
      "8px 10px 20px rgba(101,125,146,.13), -5px -5px 10px rgba(255,255,255,.9)",
  },

  timeoutStepBadge: {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: "999px",
    background: "#e9f2fb",
    color: "#2a6ba7",
    fontSize: "11px",
    fontWeight: "950",
    letterSpacing: ".08em",
  },

  timeoutWorkflowTitle: {
    marginTop: "8px",
    color: "#1f435f",
    fontSize: "20px",
    fontWeight: "950",
  },

  timeoutWorkflowText: {
    margin: "7px 0 13px",
    color: "#6f8498",
    fontSize: "14px",
    lineHeight: 1.5,
  },

  timeoutWorkflowHint: {
    marginTop: "7px",
    color: "#8092a2",
    fontSize: "12px",
    lineHeight: 1.4,
  },

  timeoutConfirmButton: {
    minHeight: "48px",
    padding: "0 19px",
    border: 0,
    borderRadius: "12px",
    background: "linear-gradient(145deg,#2f73c9,#1559a6)",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "950",
    cursor: "pointer",
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
    maxWidth: "900px",
    margin: "0 auto",
    padding: "0",
    border: "0",
    background: "transparent",
    color: "#273e56",
    textAlign: "left",
    lineHeight: 1.9,
    fontSize: "18px",
  },

  passageInterface: {
    width: "100%",
    maxWidth: "940px",
    margin: "0 auto",
    padding: "8px 0 24px",
    textAlign: "left",
  },

  passageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "18px",
    padding: "18px 20px",
    marginBottom: "16px",
    borderRadius: "20px",
    background: "linear-gradient(145deg,#f7fbff,#eaf3fa)",
    border: "1px solid #dbe7f0",
    boxShadow:
      "10px 11px 24px rgba(137,162,184,.18), -8px -8px 18px rgba(255,255,255,.9)",
  },

  passageEyebrow: {
    color: "#6f88a0",
    fontSize: "13px",
    fontWeight: "900",
    letterSpacing: ".12em",
    textTransform: "uppercase",
  },

  passageStoryTitle: {
    margin: "5px 0 0",
    color: "#193b5b",
    fontSize: "27px",
    lineHeight: 1.2,
    fontWeight: "950",
  },

  passageInstruction: {
    margin: "8px 0 0",
    maxWidth: "690px",
    color: "#70869a",
    fontSize: "14px",
    lineHeight: 1.55,
  },

  passageStatus: {
    flex: "0 0 auto",
    minHeight: "38px",
    padding: "0 13px",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    borderRadius: "999px",
    background: "#e4f2e8",
    color: "#2c8050",
    fontSize: "12px",
    fontWeight: "950",
    boxShadow:
      "inset 2px 2px 6px rgba(139,165,149,.17), inset -2px -2px 6px rgba(255,255,255,.78)",
  },

  passageStatusPaused: {
    background: "#fff1d9",
    color: "#9b650e",
  },

  passageStatusDot: {
    width: "9px",
    height: "9px",
    borderRadius: "50%",
    background: "currentColor",
    boxShadow: "0 0 0 4px rgba(0,0,0,.04)",
  },

  passageReadingCard: {
    padding: "24px",
    borderRadius: "22px",
    background: "#f5faff",
    border: "1px solid #d8e5ef",
    boxShadow:
      "inset 4px 4px 12px rgba(144,168,190,.14), inset -4px -4px 12px rgba(255,255,255,.95)",
  },

  passageMetaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    paddingBottom: "12px",
    marginBottom: "10px",
    color: "#7690a5",
    fontSize: "13px",
    fontWeight: "800",
    borderBottom: "1px solid #dfe9f1",
  },

  passageText: {
    padding: "12px 10px 18px",
    color: "#243c55",
    fontSize: "20px",
    lineHeight: 2,
    letterSpacing: ".01em",
    textAlign: "left",
  },

  passageWord: {
    border: "0",
    borderRadius: "7px",
    margin: "0 2px",
    padding: "1px 3px",
    background: "transparent",
    color: "#243c55",
    font: "inherit",
    lineHeight: "inherit",
    cursor: "pointer",
    transition:
      "background .12s ease, color .12s ease, box-shadow .12s ease, transform .12s ease",
  },

  passageWordSelected: {
    background: "#dcecfb",
    color: "#1559a6",
    boxShadow:
      "inset 0 -3px 0 #4b91cf, 3px 3px 7px rgba(110,143,170,.12)",
    transform: "translateY(-1px)",
  },

  passageControlGrid: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "22px",
    marginTop: "20px",
  },

  passageTimerCard: {
    width: "min(430px,94vw)",
    minHeight: "78px",
    padding: "12px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    borderRadius: "20px",
    background: "linear-gradient(145deg,#edf5fb,#e3edf5)",
    border: "1px solid #d4e1eb",
    boxShadow:
      "8px 9px 19px rgba(137,162,184,.17), -7px -7px 16px rgba(255,255,255,.88)",
  },

  timerInfo: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "105px",
  },

  lastWordCard: {
    minHeight: "170px",
    padding: "20px",
    borderRadius: "20px",
    background: "#f5faff",
    border: "1px solid #dbe7f0",
    boxShadow:
      "inset 3px 3px 9px rgba(144,168,190,.12), inset -3px -3px 9px rgba(255,255,255,.9)",
  },

  lastWordTitle: {
    color: "#5e7892",
    fontSize: "14px",
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: ".06em",
  },

  lastWordValue: {
    marginTop: "10px",
    color: "#1559a6",
    fontSize: "29px",
    fontWeight: "950",
    fontVariantNumeric: "tabular-nums",
  },

  lastWordValueSpan: {
    color: "#7b8fa3",
    fontSize: "18px",
    fontWeight: "800",
  },

  lastWordWaiting: {
    marginTop: "16px",
    color: "#7b8fa3",
    fontSize: "18px",
    fontWeight: "800",
  },

  lastWordHint: {
    margin: "9px 0 0",
    color: "#74899d",
    fontSize: "13px",
    lineHeight: 1.6,
  },

  passageFinishRow: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    marginTop: "2px",
  },

  primaryPassageButton: {
    minHeight: "50px",
    padding: "0 22px",
    border: 0,
    borderRadius: "14px",
    background: "linear-gradient(145deg,#2f73c9,#1559a6)",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "950",
    cursor: "pointer",
    boxShadow:
      "8px 9px 18px rgba(80,121,160,.22), -6px -6px 14px rgba(255,255,255,.85)",
  },

  miscueOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 5000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    background: "rgba(18,39,58,.44)",
    backdropFilter: "blur(6px)",
  },

  miscueDrawer: {
    width: "min(680px,94vw)",
    maxHeight: "min(720px,90vh)",
    overflowY: "auto",
    padding: "28px",
    borderRadius: "24px",
    background: "#ffffff",
    border: "1px solid #d5e2ec",
    boxShadow:
      "0 24px 60px rgba(35,58,79,.28)",
  },

  miscueDrawerHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "18px",
    marginBottom: "20px",
  },

  miscueDrawerEyebrow: {
    color: "#7890a4",
    fontSize: "12px",
    fontWeight: "950",
    letterSpacing: ".12em",
  },

  miscueDrawerWord: {
    marginTop: "5px",
    color: "#183e60",
    fontSize: "30px",
    lineHeight: 1.2,
    fontWeight: "950",
  },

  miscueDrawerHint: {
    marginTop: "7px",
    color: "#74899c",
    fontSize: "14px",
    lineHeight: 1.5,
  },

  miscueDrawerClose: {
    width: "42px",
    height: "42px",
    flex: "0 0 auto",
    border: "1px solid #d2e0eb",
    borderRadius: "50%",
    background: "#f4f8fb",
    color: "#55738e",
    fontSize: "25px",
    lineHeight: 1,
    cursor: "pointer",
  },

  miscueTypeGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2,minmax(0,1fr))",
    gap: "12px",
  },

  miscueTypeText: {
    display:
      "flex",
    flexDirection:
      "column",
    alignItems:
      "flex-start",
    gap:
      "4px",
    minWidth:
      0,
  },

  miscueTypeName: {
    display:
      "block",
    marginBottom:
      "2px",
    whiteSpace:
      "nowrap",
    fontSize:
      "15px",
    lineHeight:
      1.2,
    fontWeight:
      "950",
  },

  miscueTypeDescription: {
    display:
      "block",
    color:
      "rgba(61,80,99,.72)",
    fontSize:
      "13px",
    lineHeight:
      1.35,
    fontWeight:
      "650",
  },

  removeMiscueButton: {
    width:
      "100%",
    minHeight:
      "48px",
    marginTop:
      "14px",
    border:
      "1px solid #efcbd0",
    borderRadius:
      "12px",
    background:
      "#fff5f6",
    color:
      "#b62a3a",
    fontSize:
      "14px",
    fontWeight:
      "950",
    cursor:
      "pointer",
  },

  miscueTypeButton: {
    minHeight: "82px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "14px",
    padding: "14px 16px",
    border: "2px solid",
    borderRadius: "15px",
    textAlign: "left",
    cursor: "pointer",
    transition:
      "transform .12s ease, box-shadow .12s ease",
  },

  miscueTypeButtonSelected: {
    boxShadow:
      "inset 0 0 0 2px rgba(255,255,255,.72), 0 5px 12px rgba(65,93,119,.16)",
    transform: "translateY(-1px)",
  },

  miscueTypeArrow: {
    fontSize: "22px",
    fontWeight: "950",
  },

  miscueEntryArea: {
    marginTop: "14px",
    paddingTop: "16px",
    borderTop: "1px solid #dfe9f1",
  },

  miscueEntryLabel: {
    display: "block",
    marginBottom: "8px",
    color: "#46627b",
    fontSize: "14px",
    fontWeight: "900",
  },

  miscueEntryPrompt: {
    margin: "0 0 10px",
    color: "#71879a",
    fontSize: "13px",
    lineHeight: 1.45,
    fontWeight: "650",
  },

  miscueDrawerInput: {
    width: "100%",
    minHeight: "50px",
    padding: "0 14px",
    border: "1px solid #cbdbe8",
    borderRadius: "12px",
    background: "#f9fcff",
    color: "#203b56",
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
  },

  miscueApplyButton: {
    minHeight: "48px",
    marginTop: "12px",
    padding: "0 18px",
    border: 0,
    borderRadius: "12px",
    background: "linear-gradient(145deg,#2f73c9,#1559a6)",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "950",
    cursor: "pointer",
  },

  timeUpOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 4000,
    display: "none",
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
      "46px",
    padding:
      "0 18px",
    border:
      "1px solid #efcbd0",
    borderRadius:
      "14px",
    background:
      "#fff7f8",
    color:
      "#c92335",
    fontSize:
      "14px",
    fontWeight:
      "900",
    cursor:
      "pointer",
    boxShadow:
      "5px 6px 12px rgba(147,112,120,.12), -4px -4px 10px rgba(255,255,255,.86)",
  },

  endSessionButton: {
    flex:
      "0 0 auto",
    minHeight:
      "48px",
    padding:
      "0 19px",
    border:
      "1px solid #efcbd0",
    borderRadius:
      "14px",
    background:
      "#fff7f8",
    color:
      "#bf2d3c",
    fontSize:
      "15px",
    fontWeight:
      "950",
    cursor:
      "pointer",
    boxShadow:
      "6px 7px 14px rgba(147,112,120,.13), -5px -5px 11px rgba(255,255,255,.88)",
  },

  backDashboardButton: {
    flex:
      "0 0 auto",
    minHeight:
      "48px",
    padding:
      "0 19px",
    border:
      "1px solid #d2e0eb",
    borderRadius:
      "14px",
    background:
      "linear-gradient(145deg,#f7fbff,#eaf3fa)",
    color:
      "#2a5c86",
    fontSize:
      "15px",
    fontWeight:
      "900",
    cursor:
      "pointer",
    boxShadow:
      "6px 7px 14px rgba(125,151,176,.14), -5px -5px 11px rgba(255,255,255,.9)",
  },

  outlineDangerLegacy: {
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

  observationModalOverlay: {
    position:
      "fixed",
    inset:
      0,
    zIndex:
      9999,
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    padding:
      "20px",
    background:
      "rgba(8,24,42,.82)",
    backdropFilter:
      "blur(7px)",
    WebkitBackdropFilter:
      "blur(7px)",
    animation:
      "crlModalFade .16s ease-out",
  },

  optionalLabel: {
    fontWeight:
      "700",
    color:
      "#7b8fa3",
    fontSize:
      "13px",
  },

  observationModal: {
    width:
      "100%",
    maxWidth:
      "520px",
    padding:
      "28px",
    border:
      "1px solid #d7e3ee",
    borderRadius:
      "18px",
    background:
      "#f7fbff",
    boxShadow:
      "0 28px 85px rgba(8,28,48,.28)",
  },

  observationIcon: {
    width:
      "56px",
    height:
      "56px",
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
      "#eaf3fb",
    fontSize:
      "30px",
  },

  observationTitle: {
    margin:
      0,
    textAlign:
      "center",
    color:
      "#193c5e",
    fontSize:
      "30px",
    fontWeight:
      "950",
  },

  observationSubtitle: {
    margin:
      "9px auto 20px",
    maxWidth:
      "440px",
    color:
      "#6c8298",
    fontSize:
      "15px",
    lineHeight:
      1.6,
    textAlign:
      "center",
  },

  observationField: {
    display:
      "flex",
    flexDirection:
      "column",
    gap:
      "8px",
    marginTop:
      "14px",
    color:
      "#435f77",
    fontSize:
      "15px",
    fontWeight:
      "900",
  },

  observationSelect: {
    width:
      "100%",
    minHeight:
      "52px",
    padding:
      "0 11px",
    border:
      "1px solid #cfdde9",
    borderRadius:
      "9px",
    background:
      "#ffffff",
    color:
      "#203c57",
    fontSize:
      "15px",
    outline:
      "none",
  },

  observationTextarea: {
    width:
      "100%",
    minHeight:
      "155px",
    padding:
      "11px",
    resize:
      "vertical",
    border:
      "1px solid #cfdde9",
    borderRadius:
      "9px",
    background:
      "#ffffff",
    color:
      "#203c57",
    fontSize:
      "15px",
    lineHeight:
      1.55,
    outline:
      "none",
    fontFamily:
      "Arial, Helvetica, sans-serif",
  },

  observationError: {
    marginTop:
      "10px",
    padding:
      "9px 10px",
    border:
      "1px solid #efcbd0",
    borderRadius:
      "8px",
    background:
      "#fff4f5",
    color:
      "#b32031",
    fontSize:
      "10px",
    lineHeight:
      1.5,
  },

  observationSaveButton: {
    width:
      "100%",
    minHeight:
      "44px",
    marginTop:
      "16px",
    padding:
      "0 14px",
    border:
      0,
    borderRadius:
      "9px",
    background:
      "#1559a6",
    color:
      "#ffffff",
    fontSize:
      "11px",
    fontWeight:
      "900",
    cursor:
      "pointer",
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

  finishReadingModal: {
    width: "min(570px,94vw)",
    padding: "32px",
    borderRadius: "24px",
    background: "#f8fbff",
    border: "1px solid #d5e3ed",
    boxShadow:
      "14px 16px 34px rgba(74,102,128,.22), -10px -10px 22px rgba(255,255,255,.95)",
    textAlign: "center",
  },

  finishReadingIcon: {
    width: "58px",
    height: "58px",
    margin: "0 auto 14px",
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    background: "#e7f6ee",
    color: "#24794b",
    fontSize: "27px",
    fontWeight: "950",
    boxShadow:
      "inset 3px 3px 8px rgba(94,135,111,.14), -4px -4px 10px rgba(255,255,255,.9)",
  },

  finishReadingTitle: {
    margin: "0",
    color: "#193c5b",
    fontSize: "28px",
    fontWeight: "950",
  },

  finishReadingText: {
    margin: "12px 0 22px",
    color: "#6c8297",
    fontSize: "17px",
    lineHeight: 1.6,
  },

  confirmModal: {
    width:
      "min(560px,94vw)",
    padding:
      "30px",
    borderRadius:
      "24px",
    background:
      "#f8fbff",
    border:
      "1px solid #d6e4ee",
    boxShadow:
      "14px 16px 34px rgba(74,102,128,.22), -10px -10px 22px rgba(255,255,255,.95)",
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
      "0",
    color:
      "#183b5b",
    fontSize:
      "26px",
    fontWeight:
      "950",
  },


  confirmText: {
    margin:
      "10px 0 0",
    color:
      "#6e8498",
    fontSize:
      "16px",
    lineHeight:
      1.65,
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
      "48px",
    padding:
      "0 20px",
    border:
      "1px solid #cfdeea",
    borderRadius:
      "13px",
    background:
      "#eef5fa",
    color:
      "#43647f",
    fontSize:
      "15px",
    fontWeight:
      "900",
    cursor:
      "pointer",
  },


  confirmButton: {
    minHeight:
      "48px",
    padding:
      "0 20px",
    border:
      0,
    borderRadius:
      "13px",
    background:
      "linear-gradient(145deg,#d44757,#b92738)",
    color:
      "#ffffff",
    fontSize:
      "15px",
    fontWeight:
      "950",
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