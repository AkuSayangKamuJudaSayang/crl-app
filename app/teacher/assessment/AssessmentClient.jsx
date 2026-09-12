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
  getAssessmentState,
  getMutations,
  putMutation,
  removeAssessmentState,
  removeMutation,
  saveAssessmentState,
} from "../../../lib/assessmentOutbox";
import {
  createAssessmentChannel,
  closeAssessmentChannel,
  createAssessmentRealtimeChannel,
  getAssessmentWordGateKey,
  publishAssessmentState,
  publishAssessmentRealtimeState,
} from "../../../lib/assessmentChannel";

let LETTERS = [
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

let WORDS = [
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

let STORIES = [
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
    available: true,
  },
];

async function fetchWithTimeout(input, init = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const PASSAGE_TEXT =
  "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.";

const FIELD_PASSAGE_TEXT =
  "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil.";

const STORY_QUESTIONS = {
  para: [
    { index: 0, text: "What must Para look for?" },
    { index: 1, text: "What time or part of the day is it?" },
    { index: 2, text: "What does Para land on?" },
    { index: 3, text: "Who does Para see?" },
    { index: 4, text: "What else is the police officer doing besides directing traffic?" },
    { index: 5, text: "What could the police officer be feeling?" },
  ],
  fields: [
    { index: 0, text: "What is the job of Dulnuwan?" },
    { index: 1, text: "When do Ali and Dina help Dulnuwan and Bugan?" },
    { index: 2, text: "Where do they rest?" },
    { index: 3, text: "Why do they rest?" },
    { index: 4, text: "What kind of weather or day is it?" },
    { index: 5, text: "What does Dulnuwan pick up?" },
  ],
};

const QUESTIONS = STORY_QUESTIONS.para;

function getComprehensionQuestions(session) {
  const title = String(session?.story_title ?? session?.storyTitle ?? "")
    .trim()
    .toLowerCase();
  return title.includes("a day in the fields")
    ? STORY_QUESTIONS.fields
    : STORY_QUESTIONS.para;
}

function applyLiveAssessmentContent(session) {
  const content = session?.assessment_content;
  if (!content) return false;
  if (Array.isArray(content.letters) && content.letters.length) {
    LETTERS = content.letters.map((value) => String(value));
  }
  if (Array.isArray(content.words) && content.words.length) {
    WORDS = content.words.map((value) => String(value));
  }
  if (Array.isArray(content.stories) && content.stories.length) {
    STORIES = content.stories.map((story, index) => ({
      id: Number(story?.id ?? index + 1),
      title: String(story?.title || `Story ${index + 1}`),
      description: String(story?.description || "Story passage from Manage Assessment."),
      text: String(story?.text || ""),
      available: Boolean(String(story?.text || "").trim()),
    }));
  }
  return true;
}

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

  const learnerDisplayNameRef = useRef("");
  const [stableLearnerDisplayName, setStableLearnerDisplayName] = useState("");

  const [
    session,
    setSession,
  ] = useState(null);
  const [, setAssessmentContentVersion] = useState(0);

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
    terminationRemarks,
    setTerminationRemarks,
  ] = useState("");

  const [
    savingTerminationObservation,
    setSavingTerminationObservation,
  ] = useState(false);

  const [finalObservationLevel, setFinalObservationLevel] = useState("");
  const [finalReadingProfile, setFinalReadingProfile] = useState("");

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
      const classification =
        current?.metrics?.classification ||
        current?.metrics?.classificationLabel ||
        "";

      setTerminationRemarks(current?.metrics?.remarks || "");
      setFinalObservationLevel(
        current?.metrics?.observationLevel != null
          ? String(current.metrics.observationLevel)
          : ""
      );
      setFinalReadingProfile(classification);
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

  const questionIndexRef = useRef(0);

  useEffect(() => {
    questionIndexRef.current = questionIndex;
  }, [questionIndex]);

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
  const [miscueReviewMode, setMiscueReviewMode] = useState(false);
  const [selectedPassageWord, setSelectedPassageWord] = useState(null);
  const [passageMiscues, setPassageMiscues] = useState([]);
  const [selectedMiscueType, setSelectedMiscueType] = useState(null);
  const [reversionSelecting, setReversionSelecting] = useState(false);
  const [reversionSourceWord, setReversionSourceWord] = useState(null);
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

  // Synchronous guard for answer buttons. React state updates are async, so
  // this ref closes the small race where rapid double-clicks could otherwise
  // enter the same answer handler before answerLockKey re-renders.
  const answerActionLockRef =
    useRef("");

  const [
    transitionPending,
    setTransitionPending,
  ] = useState(false);

  // Restrain the first Word Recognition answer controls while the learner
  // completes the mandatory Letter Sounds -> Word Recognition loading gate.
  const [
    wordInitialTransitionPending,
    setWordInitialTransitionPending,
  ] = useState(false);

  const wordInitialTransitionGateKeyRef = useRef("");
  const learnerWordReadyKeysRef = useRef(new Set());
  const wordInitialTransitionTimerRef = useRef(null);

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

  const fetchInFlightRef =
    useRef(false);

  const latestSessionVersionRef =
    useRef(0);

  const latestSessionRef =
    useRef(null);

  const latestActiveStageRef =
    useRef(activeStage);

  const assessmentChannelRef =
    useRef(null);

  const currentQuestions = getComprehensionQuestions(latestSessionRef.current || session);

  const currentQuestion =
    currentQuestions[
      questionIndex
    ];

  const passageText =
    activeStage === "passage" && String(session?.current_content || "").trim()
      ? String(session.current_content)
      : String(session?.story_title || "").trim().toLowerCase() === "a day in the fields"
        ? FIELD_PASSAGE_TEXT
        : PASSAGE_TEXT;

  const pendingAnswerRef =
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
  );

  useEffect(() => {
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

        if (data?.session?.assessment_content && applyLiveAssessmentContent(data.session)) {
          setAssessmentContentVersion((version) => version + 1);
        }

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

        if (data?.session?.stage === "learner_experience") {
          assessmentSaveLockRef.current = false;
          latestSessionRef.current = data.session;
          latestActiveStageRef.current = "learner_experience";
          setSession(data.session);
          setActiveStage("learner_experience");
          return;
        }

        if (data?.session?.stage === "teacher_review") {
          latestSessionRef.current = data.session;
          latestActiveStageRef.current = "teacher_review";
          setSession(data.session);
          setActiveStage("teacher_review");
          if (!terminationObservationHandledRef.current) {
            terminationObservationHandledRef.current = true;
            openAssessmentSaveModal(data.session);
          }
          return;
        }

        if (
          data?.session &&
          data.session.stage === "completed" &&
          !terminationObservationHandledRef.current
        ) {
          latestSessionRef.current = data.session;
          latestActiveStageRef.current = "completed";
          setSession(data.session);
          setActiveStage("completed");
          terminationObservationHandledRef.current = true;
          openAssessmentSaveModal(data.session);
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

        const incomingStage = String(data.session?.stage || "");
        const incomingContent = String(
          data.session?.current_content ??
            data.session?.currentContent ??
            ""
        );
        const incomingComprehensionIndex =
          incomingStage === "comprehension"
            ? getComprehensionQuestions(data.session).findIndex((question) => question.text === incomingContent)
            : -1;

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

          if (
            currentStage === "comprehension" &&
            incomingComprehensionIndex >= 0 &&
            incomingComprehensionIndex < questionIndexRef.current
          ) {
            return;
          }

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
                getComprehensionQuestions(data.session).findIndex(
                  (question) =>
                    question.text === serverContent
                );

              if (serverIndex >= questionIndexRef.current) {
                questionIndexRef.current = serverIndex;
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
        currentContent: String(story?.text || ""),
        storyTitle: String(story?.title || ""),
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

            const markerStyle = annotation?.miscueType === "Omission"
              ? { textDecoration: "line-through 3px #d12d3f", textDecorationColor: "#d12d3f" }
              : annotation?.miscueType === "Repetition"
                ? { textDecoration: "underline double 3px #d12d3f", textUnderlineOffset: "5px", textDecorationColor: "#d12d3f" }
                : annotation?.miscueType === "Substitution"
                  ? { textDecoration: "underline 3px #d12d3f", textUnderlineOffset: "5px", textDecorationColor: "#d12d3f" }
                  : annotation?.miscueType === "SelfCorrection"
                    ? { textDecoration: "underline 2px #2a9a59", textUnderlineOffset: "4px", textDecorationColor: "#2a9a59" }
                    : annotation?.miscueType === "Reversion"
                      ? { textDecoration: "underline 2px #d12d3f", textUnderlineOffset: "4px", textDecorationColor: "#d12d3f" }
                      : {};
            const markerGlyph = annotation?.miscueType === "Insertion"
              ? "⌃"
              : annotation?.miscueType === "SelfCorrection"
                ? "✓"
                : annotation?.miscueType === "Reversion"
                  ? `${annotation?.reversionOrder || ""} ${Number(annotation?.relatedWordIndex) > currentNumber ? "↷" : "↶"}`.trim()
                  : "";

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
                  ...markerStyle,
                  position: "relative",
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

                  if (miscueReviewMode) {
                    setSelectedPassageWord(number);
                    setMiscueWordIndex(number);
                    setSelectedMiscueType(existingMiscue?.miscueType || null);
                    setMisreadWord(existingMiscue?.misreadWord || "");
                    setMiscueDrawerOpen(true);
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
                {annotation && (markerGlyph || ((annotation.miscueType === "Insertion" || annotation.miscueType === "Substitution") && annotation.misreadWord)) && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: "-16px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      color: annotation.miscueType === "SelfCorrection" ? "#2a9a59" : "#d12d3f",
                      fontSize: annotation.miscueType === "Reversion" ? "12px" : "16px",
                      lineHeight: 1,
                      fontWeight: 950,
                      whiteSpace: "nowrap",
                      pointerEvents: "none",
                    }}
                  >
                    {markerGlyph}
                    {(annotation.miscueType === "Insertion" || annotation.miscueType === "Substitution") && annotation.misreadWord ? (
                      <span style={{ marginLeft: "3px", fontSize: "10px", fontWeight: 900 }}>{annotation.misreadWord}</span>
                    ) : null}
                  </span>
                )}
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
        miscueReviewMode,
      ]
    );

  const finishPassageReading =
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
          setReversionSelecting(false);
          setReversionSourceWord(null);
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
            current_content: getComprehensionQuestions(latestSessionRef.current || session)[0].text,
            currentContent: getComprehensionQuestions(latestSessionRef.current || session)[0].text,
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
                  currentContent: getComprehensionQuestions(nextSession)[0].text,
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
                currentContent: getComprehensionQuestions(nextSession)[0].text,
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

  const removePassageMiscue =
    useCallback(
      async () => {
        const selectedIndex =
          Number(selectedPassageWord || 0) - 1;

        if (selectedIndex < 0 || selectedIndex >= 100) return;

        const selectedMiscue = passageMiscues.find((item) => Number(item.wordIndex) === selectedIndex);
        const relatedIndex = selectedMiscue?.miscueType === "Reversion" ? Number(selectedMiscue.relatedWordIndex) : -1;
        const nextMiscues = passageMiscues.filter((item) => Number(item.wordIndex) !== selectedIndex && Number(item.wordIndex) !== relatedIndex);

        setPassageMiscues(nextMiscues);
        setSelectedMiscueType(null);
        setMisreadWord("");
        setError("");
        setMiscueDrawerOpen(false);
        setSelectedPassageWord(null);
        setReversionSelecting(false);
        setReversionSourceWord(null);

        await persistPassageDraft({
          miscues: nextMiscues,
        });
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
        misreadWordOverride,
        reversionTargetOverride
      ) => {
        const selectedNumber = Number(selectedWordOverride ?? selectedPassageWord ?? 0);
        const selectedIndex = selectedNumber - 1;
        if (selectedIndex < 0 || selectedIndex >= 100) return;

        const nextType = String(typeOverride || selectedMiscueType || miscueType || "Substitution");
        const nextMisreadWord = String(misreadWordOverride ?? misreadWord ?? "").trim();

        if ((nextType === "Insertion" || nextType === "Substitution") && !nextMisreadWord) {
          setSelectedMiscueType(nextType);
          return;
        }

        if (nextType === "Reversion") {
          const targetNumber = Number(reversionTargetOverride ?? 0);
          const targetIndex = targetNumber - 1;
          if (!Number.isInteger(targetNumber) || targetIndex < 0 || targetIndex >= 100 || targetIndex === selectedIndex) {
            setSelectedMiscueType(nextType);
            return;
          }

          const groupId = [selectedIndex, targetIndex].sort((a, b) => a - b).join("-");
          const first = {
            wordIndex: selectedIndex,
            miscueType: "Reversion",
            misreadWord: "",
            relatedWordIndex: targetIndex,
            reversionGroupId: groupId,
            reversionOrder: 1,
          };
          const second = {
            wordIndex: targetIndex,
            miscueType: "Reversion",
            misreadWord: "",
            relatedWordIndex: selectedIndex,
            reversionGroupId: groupId,
            reversionOrder: 2,
          };

          const nextMiscues = [
            ...passageMiscues.filter(
              (item) =>
                Number(item.wordIndex) !== selectedIndex &&
                Number(item.wordIndex) !== targetIndex
            ),
            first,
            second,
          ].sort((a, b) => Number(a.wordIndex) - Number(b.wordIndex));

          setPassageMiscues(nextMiscues);
          setError("");
          setMisreadWord("");
          setMiscueWordIndex(1);
          setMiscueDrawerOpen(false);
          setSelectedPassageWord(null);
          setSelectedMiscueType(null);
          setReversionSelecting(false);
          setReversionSourceWord(null);
          await persistPassageDraft({ miscues: nextMiscues });
          return;
        }

        const optimistic = {
          wordIndex: selectedIndex,
          miscueType: nextType,
          misreadWord: nextMisreadWord,
        };
        const nextMiscues = [
          ...passageMiscues.filter((item) => Number(item.wordIndex) !== selectedIndex),
          optimistic,
        ];

        setPassageMiscues(nextMiscues);
        setError("");
        setMisreadWord("");
        setMiscueWordIndex(1);
        setMiscueDrawerOpen(false);
        setSelectedPassageWord(null);
        setSelectedMiscueType(null);
        setReversionSelecting(false);
        setReversionSourceWord(null);
        await persistPassageDraft({ miscues: nextMiscues });
      },
      [
        selectedPassageWord,
        selectedMiscueType,
        miscueType,
        misreadWord,
        passageMiscues,
        persistPassageDraft,
      ]
    );

  useEffect(() => {
    if (activeStage !== "passage") {
      setMiscueDrawerOpen(false);
      setSelectedPassageWord(null);
      setSelectedMiscueType(null);
      setReversionSelecting(false);
      setReversionSourceWord(null);
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

    if (miscueReviewMode) {
      if (passageTimerRef.current) {
        window.clearInterval(passageTimerRef.current);
        passageTimerRef.current = null;
      }
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
    miscueReviewMode,
    session?.passage_started_at,
    session?.passageStartedAt,
  ]);

  const handleLearnerAssessmentControl = useCallback(
    (message) => {
      const control = message?.control;
      if (control?.action !== "word_first_item_ready") return;

      const incomingCode = String(control.code || "").trim().toUpperCase();
      if (incomingCode !== String(code || "").trim().toUpperCase()) return;

      const gateKey = String(control.gate_key || "");
      if (!gateKey) return;

      // Keep this listener stable across React session updates during the final
      // Letter -> Word handoff. Always read the current session from the ref so
      // the learner readiness signal cannot be lost during listener recreation.
      const current = latestSessionRef.current;
      if (!current) return;

      const expectedGateKey = getAssessmentWordGateKey(code, current);
      if (gateKey !== expectedGateKey) return;

      learnerWordReadyKeysRef.current.add(gateKey);

      const currentStage = String(current?.stage || latestActiveStageRef.current || "");
      const currentContent = String(current?.current_content ?? current?.currentContent ?? "").trim();
      const currentIsFirstWord = currentStage === "word" && WORDS.indexOf(currentContent) === 0;

      if (currentIsFirstWord && wordInitialTransitionGateKeyRef.current === gateKey) {
        learnerWordReadyKeysRef.current.delete(gateKey);
        if (wordInitialTransitionTimerRef.current) {
          window.clearTimeout(wordInitialTransitionTimerRef.current);
          wordInitialTransitionTimerRef.current = null;
        }
        setWordInitialTransitionPending(false);
      }
    },
    [code]
  );

  useEffect(() => {
    if (activeStage === "word" && wordIndex === 0) {
      const current = latestSessionRef.current || session;
      const gateKey = getAssessmentWordGateKey(code, current);

      if (wordInitialTransitionGateKeyRef.current !== gateKey) {
        if (wordInitialTransitionTimerRef.current) {
          window.clearTimeout(wordInitialTransitionTimerRef.current);
          wordInitialTransitionTimerRef.current = null;
        }

        wordInitialTransitionGateKeyRef.current = gateKey;
        learnerWordReadyKeysRef.current.delete(gateKey);
        setWordInitialTransitionPending(true);

        // The learner's mandatory Letter -> Word transition overlay lasts
        // 2 seconds. The learner readiness packet is the primary unlock path.
        // This guarded local fallback sits just beyond that overlay so a lost
        // cross-device control packet can never leave the teacher stranded.
        wordInitialTransitionTimerRef.current = window.setTimeout(() => {
          wordInitialTransitionTimerRef.current = null;

          if (
            wordInitialTransitionGateKeyRef.current === gateKey &&
            latestActiveStageRef.current === "word" &&
            WORDS.indexOf(
              String(
                latestSessionRef.current?.current_content ??
                  latestSessionRef.current?.currentContent ??
                  ""
              ).trim()
            ) === 0
          ) {
            learnerWordReadyKeysRef.current.delete(gateKey);
            setWordInitialTransitionPending(false);
          }
        }, 2300);
      }

      if (learnerWordReadyKeysRef.current.has(gateKey)) {
        learnerWordReadyKeysRef.current.delete(gateKey);
        if (wordInitialTransitionTimerRef.current) {
          window.clearTimeout(wordInitialTransitionTimerRef.current);
          wordInitialTransitionTimerRef.current = null;
        }
        setWordInitialTransitionPending(false);
      }

      return;
    }

    wordInitialTransitionGateKeyRef.current = "";
    learnerWordReadyKeysRef.current.clear();
    if (wordInitialTransitionTimerRef.current) {
      window.clearTimeout(wordInitialTransitionTimerRef.current);
      wordInitialTransitionTimerRef.current = null;
    }
    setWordInitialTransitionPending(false);
  }, [activeStage, wordIndex, code, session]);

  useEffect(() => {
    if (!code) return undefined;
    const channel = createAssessmentChannel(code, (event) => {
      const message = event?.data;
      if (!message || message.type !== "assessment_control" || message.source !== "learner") return;
      handleLearnerAssessmentControl(message);
    });
    if (!channel) return undefined;
    return () => closeAssessmentChannel(channel);
  }, [code, handleLearnerAssessmentControl]);

  useEffect(() => {
    if (!code) return undefined;
    let cancelled = false;
    let channel = null;
    void createAssessmentRealtimeChannel(code, (message) => {
      if (cancelled || !message || message.source !== "learner") return;
      handleLearnerAssessmentControl(message);
    }).then((nextChannel) => {
      if (cancelled) {
        try { nextChannel?.unsubscribe(); } catch {}
        return;
      }
      channel = nextChannel;
    });
    return () => {
      cancelled = true;
      try { channel?.unsubscribe(); } catch {}
    };
  }, [code, handleLearnerAssessmentControl]);

  useEffect(() => {
    return () => {
      if (wordInitialTransitionTimerRef.current) {
        window.clearTimeout(wordInitialTransitionTimerRef.current);
        wordInitialTransitionTimerRef.current = null;
      }
    };
  }, []);

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
    const learner = session?.learner;
    if (!learner || typeof learner !== "object") return;

    const parts = [
      learner.first_name,
      learner.middle_name
        ? `${String(learner.middle_name).trim().charAt(0).toUpperCase()}.`
        : null,
      learner.last_name,
      learner.suffix,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const resolvedName = parts.join(" ").trim();
    if (!resolvedName) return;

    if (learnerDisplayNameRef.current !== resolvedName) {
      learnerDisplayNameRef.current = resolvedName;
      setStableLearnerDisplayName(resolvedName);
    }
  }, [session]);

  useEffect(() => {
    latestActiveStageRef.current = activeStage;
  }, [activeStage]);

  useEffect(() => {
    const currentKey =
      activeStage === "letter"
        ? `letter:${letterIndex}`
        : activeStage === "word"
          ? `word:${wordIndex}`
          : "";

    if (answerLockKey && currentKey && answerLockKey !== currentKey) {
      if (answerActionLockRef.current === answerLockKey) {
        answerActionLockRef.current = "";
      }
      setAnswerLockKey("");
    }
  }, [activeStage, letterIndex, wordIndex, answerLockKey]);

  useEffect(() => {
    if (!code) return undefined;
    const channel = createAssessmentChannel(code);
    assessmentChannelRef.current = channel;
    return () => {
      closeAssessmentChannel(channel);
      if (assessmentChannelRef.current === channel) {
        assessmentChannelRef.current = null;
      }
    };
  }, [code]);


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
            !mutationId.startsWith("advance:") &&
            !mutationId.startsWith("stage:") &&
            !mutationId.startsWith("final:")
          ) {
            continue;
          }

          let saved = false;

          for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
            try {
              const endpoint =
                mutation.action === "commit_passage_assessment"
                  ? "/api/assessment/commit"
                  : `/api/assessment?action=${encodeURIComponent(
                      mutation.action
                    )}`;

              const response = await fetch(
                endpoint,
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
        answerActionLockRef.current === lockKey ||
        pendingAnswerRef.current
      ) {
        return;
      }

      answerActionLockRef.current = lockKey;
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
        publishAssessmentState(assessmentChannelRef.current, {
          source: "teacher",
          session: optimisticLetterSession,
        });
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
            const response = await fetchWithTimeout(
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

        if (!data) {
          answerActionLockRef.current = "";
          setAnswerLockKey("");
          return;
        }

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

          const experienceSession = {
            ...terminalSession,
            stage: "learner_experience",
            current_content: "LEARNER_EXPERIENCE",
            currentContent: "LEARNER_EXPERIENCE",
            ended: false,
            connected: true,
          };

          latestSessionRef.current = experienceSession;
          latestActiveStageRef.current = "learner_experience";
          setSession(experienceSession);
          setActiveStage("learner_experience");
          terminationObservationHandledRef.current = false;
          assessmentSaveLockRef.current = false;
          void publishAssessmentRealtimeState(code, experienceSession);
          return;
        }

        setWordIndex(0);

        if (data.session) {
          const nextSession = {
            ...data.session,
            connected:
              data.session.connected ??
              latestSessionRef.current?.connected ??
              true,
          };

          latestSessionRef.current = nextSession;
          latestActiveStageRef.current = String(nextSession.stage || "");
          latestSessionVersionRef.current = Date.now();
          setSession(nextSession);
          setActiveStage(nextSession.stage);

          // The final letter answer advances the authoritative host session
          // directly. Publish that resulting Word 1 state immediately so the
          // learner does not have to wait for polling/realtime to catch up.
          publishAssessmentState(assessmentChannelRef.current, {
            source: "teacher",
            session: nextSession,
          });
          void publishAssessmentRealtimeState(code, nextSession);
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
        answerActionLockRef.current === lockKey ||
        pendingAnswerRef.current
      ) {
        return;
      }

      answerActionLockRef.current = lockKey;
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
        publishAssessmentState(assessmentChannelRef.current, {
          source: "teacher",
          session: optimisticWordSession,
        });
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
            const response = await fetchWithTimeout(
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

        if (!data) {
          answerActionLockRef.current = "";
          setAnswerLockKey("");
          return;
        }

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
    async (isCorrect) => {
      const currentQuestions = getComprehensionQuestions(latestSessionRef.current || session);
      const currentIndex = questionIndex;
      const lockKey =
        "comprehension:" + currentIndex;

      if (
        answerActionLockRef.current === lockKey ||
        pendingAnswerRef.current ||
        transitionPending
      ) {
        return;
      }

      answerActionLockRef.current = lockKey;
      setAnswerLockKey(lockKey);
      setBusy(true);
      setTransitionPending(true);
      pendingAnswerRef.current = true;

      try {
        const existing = Array.isArray(
          passageDraftRef.current.comprehension
        )
          ? passageDraftRef.current.comprehension
          : [];

        const nextComprehension = [
          ...existing.filter(
            (item) => Number(item.questionIndex) !== currentIndex
          ),
          {
            questionIndex: currentIndex,
            isCorrect: Boolean(isCorrect),
          },
        ].sort(
          (a, b) =>
            Number(a.questionIndex) - Number(b.questionIndex)
        );

        await persistPassageDraft({
          comprehension: nextComprehension,
        });

        const nextIndex = currentIndex + 1;

        if (nextIndex < currentQuestions.length) {
          const nextQuestion = currentQuestions[nextIndex];
          const previousQuestion = currentQuestions[currentIndex];
          const nextSession = {
            ...(latestSessionRef.current || {}),
            stage: "comprehension",
            current_content: nextQuestion.text,
            currentContent: nextQuestion.text,
          };

          questionIndexRef.current = nextIndex;
          setQuestionIndex(nextIndex);
          latestSessionRef.current = nextSession;
          latestActiveStageRef.current = "comprehension";
          latestSessionVersionRef.current = Date.now();
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
                  currentContent: nextQuestion.text,
                  storyTitle:
                    nextSession.story_title || "Para the Parrot",
                  expected_stage: "comprehension",
                  expected_current_content: previousQuestion?.text || "",
                  item_index: nextIndex,
                }),
              }
            );
            const data = await response.json().catch(() => null);
            if (!response.ok) {
              throw new Error(data?.error || "host update failed");
            }
            if (
              data?.session &&
              !data?.stale &&
              String(data.session.stage || "") === "comprehension"
            ) {
              latestSessionRef.current = {
                ...latestSessionRef.current,
                ...data.session,
                current_content:
                  data.session.current_content ??
                  data.session.currentContent ??
                  latestSessionRef.current?.current_content,
                currentContent:
                  data.session.current_content ??
                  data.session.currentContent ??
                  latestSessionRef.current?.currentContent,
                connected:
                  data.session.connected ??
                  latestSessionRef.current?.connected ??
                  true,
              };
              latestActiveStageRef.current = "comprehension";
              void publishAssessmentRealtimeState(code, latestSessionRef.current);
            }
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
                expected_stage: "comprehension",
                expected_current_content: previousQuestion?.text || "",
                item_index: nextIndex,
              },
              createdAt: Date.now(),
            });
          }
        } else {
          const previousQuestion = currentQuestions[currentIndex];
          const experienceSession = {
            ...(latestSessionRef.current || {}),
            stage: "learner_experience",
            ended: false,
            connected: true,
            current_content: "LEARNER_EXPERIENCE",
            currentContent: "LEARNER_EXPERIENCE",
          };

          assessmentSaveLockRef.current = false;
          terminationObservationHandledRef.current = false;

          try {
            const response = await fetchWithTimeout(
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
                  code,
                  stage: "learner_experience",
                  currentContent: "LEARNER_EXPERIENCE",
                  storyTitle:
                    latestSessionRef.current?.story_title || "",
                  expected_stage: "comprehension",
                  expected_current_content: previousQuestion?.text || "",
                }),
              }
            );
            const data = await response.json().catch(() => null);
            if (!response.ok) {
              throw new Error(
                data?.error || "Unable to advance to learner experience."
              );
            }
            const authoritativeSession =
              data?.session && !data?.stale
                ? {
                    ...latestSessionRef.current,
                    ...data.session,
                    stage: "learner_experience",
                    current_content:
                      data.session.current_content ??
                      data.session.currentContent ??
                      "LEARNER_EXPERIENCE",
                    currentContent:
                      data.session.current_content ??
                      data.session.currentContent ??
                      "LEARNER_EXPERIENCE",
                    connected: data.session.connected ?? true,
                    ended: false,
                  }
                : experienceSession;
            latestSessionRef.current = authoritativeSession;
            latestActiveStageRef.current = "learner_experience";
            setSession(authoritativeSession);
            setActiveStage("learner_experience");
            void publishAssessmentRealtimeState(code, authoritativeSession);
          } catch {
            await putMutation({
              id: `stage:learner_experience:${String(code).toUpperCase()}`,
              action: "host_advance",
              payload: {
                code,
                stage: "learner_experience",
                currentContent: "LEARNER_EXPERIENCE",
                storyTitle: latestSessionRef.current?.story_title || "",
                expected_stage: "comprehension",
                expected_current_content: previousQuestion?.text || "",
              },
              createdAt: Date.now(),
            });
            latestSessionRef.current = experienceSession;
            latestActiveStageRef.current = "learner_experience";
            setSession(experienceSession);
            setActiveStage("learner_experience");
            void publishAssessmentRealtimeState(code, experienceSession);
          }
        }
      } catch (recordError) {
        answerActionLockRef.current = "";
        setAnswerLockKey("");
        setError(recordError.message || "Unable to record result.");
      } finally {
        pendingAnswerRef.current = false;
        setBusy(false);
        setTransitionPending(false);
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

      const observationLevel = Number(finalObservationLevel);
      const readingProfile = String(finalReadingProfile || "").trim();
      const remarks = terminationRemarks.trim();

      setSavingTerminationObservation(true);
      setTerminationObservationError("");

      try {
        const response = await fetch("/api/assessment?action=save_final_assessment_review", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            action: "save_final_assessment_review",
            code,
            observation_level: observationLevel,
            reading_profile: readingProfile,
            remarks,
          }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to save the final assessment review.");

        latestSessionRef.current = {
          ...(latestSessionRef.current || {}),
          stage: "completed",
          ended: true,
          connected: false,
          metrics: {
            ...(latestSessionRef.current?.metrics || {}),
            ...(data.metrics || {}),
            classification: data.classification || readingProfile,
            observationLevel,
            remarks,
            experienceRating: data.experienceRating ?? latestSessionRef.current?.metrics?.experienceRating ?? null,
          },
        };
        latestActiveStageRef.current = "completed";
        setSession(latestSessionRef.current);
        setActiveStage("completed");
        setShowTerminationObservation(false);
        assessmentSaveLockRef.current = false;
        setTerminationObservationError("");

        void publishAssessmentRealtimeState(code, latestSessionRef.current);
        window.location.replace("/teacher");
      } catch (error) {
        setTerminationObservationError(error?.message || "Unable to save the assessment.");
      } finally {
        setSavingTerminationObservation(false);
      }
    },
    [code, finalObservationLevel, finalReadingProfile, savingTerminationObservation, terminationRemarks]
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

        const endedSession = {
          ...(data?.session || latestSessionRef.current || {}),
          code,
          stage: "ended",
          current_content: "Assessment session ended by teacher.",
          currentContent: "Assessment session ended by teacher.",
          ended: true,
          connected: false,
        };

        latestSessionRef.current = endedSession;
        latestActiveStageRef.current = "ended";
        setSession(endedSession);
        setActiveStage("ended");
        setAnswerLockKey("");
        answerActionLockRef.current = "";
        pendingAnswerRef.current = false;
        assessmentSaveLockRef.current = false;

        publishAssessmentState(assessmentChannelRef.current, {
          source: "teacher",
          session: endedSession,
        });
        void publishAssessmentRealtimeState(code, endedSession);

        try {
          localStorage.removeItem(
            "crla_host_session"
          );
        } catch {
          /* Storage may be unavailable. */
        }

        await new Promise((resolve) => window.setTimeout(resolve, 400));

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
        .crlIntroLayout {
          width: 100%;
        }

        /*
         * Keep the intro cards mounted and use GPU-friendly opacity/transform
         * transitions instead of clip-path/scale animations. This makes the
         * learner-connection transition feel smooth and avoids the "snap /
         * bounce / jitter" visible in the previous recording.
         */
        .crlIntroLayout {
          width: 100%;
        }

        /*
         * Connected-state transition
         * --------------------------
         * Keep one fixed outer frame for the entire transition. The waiting
         * state uses a 32% / 68% split. When the learner connects, the first
         * track smoothly contracts to zero while the assessment track grows
         * leftward into the exact same frame.
         *
         * Because the assessment card remains in grid column 2 in both states,
         * its contents move/resize naturally with the animated track instead
         * of being remounted in a different layout. The connected status is
         * its own grid row, so it never changes the assessment card's
         * final dimensions.
         */
        /*
         * Connection transition
         * ----------------------
         * Keep the assessment workspace itself stable. The code card is an
         * absolute left-hand panel and the assessment card reserves the
         * remaining space with a margin/width pair. On connection those
         * dimensions animate to zero/100%, creating the requested leftward
         * expansion without changing the page's underlying structure.
         *
         * The learner-connected banner is a separate normal-flow block, so
         * it can never overlap the assessment card.
         */
        .crlIntroLayoutWaiting,
        .crlIntroLayoutJoined {
          position: relative;
          width: 100%;
          margin-top: 20px;
          margin-bottom: 22px;
          min-width: 0;
          box-sizing: border-box;
        }

        .crlIntroLayoutWaiting .crlIntroCodeCard,
        .crlIntroLayoutJoined .crlIntroCodeCardJoined {
          position: absolute;
          top: 0;
          left: 0;
          width: 32%;
          height: 100%;
          min-width: 0;
          box-sizing: border-box;
          overflow: hidden;
          z-index: 4;
          pointer-events: none;
          backface-visibility: hidden;
          transform: translateZ(0);
        }

        .crlIntroLayoutWaiting .crlIntroCodeCard {
          opacity: 1;
          clip-path: inset(0 0 0 0);
          transform: translate3d(0,0,0);
        }

        .crlIntroLayoutJoined .crlIntroCodeCardJoined {
          animation:
            crlIntroCodeWipe .96s cubic-bezier(.16,1,.3,1) both;
        }

        .crlIntroLayoutWaiting .crlIntroAssessmentCard,
        .crlIntroLayoutJoined .crlIntroAssessmentCardJoined {
          position: relative;
          display: block;
          width: calc(68% - 11px);
          margin-left: calc(32% + 11px);
          min-width: 0;
          max-width: none;
          box-sizing: border-box;
          z-index: 1;
          opacity: 1;
          transform: translate3d(0,0,0);
          transition:
            width 1.05s cubic-bezier(.16,1,.3,1),
            margin-left 1.05s cubic-bezier(.16,1,.3,1),
            box-shadow .65s cubic-bezier(.16,1,.3,1);
        }

        .crlIntroLayoutJoined .crlIntroAssessmentCardJoined {
          width: 100%;
          margin-left: 0;
        }

        @keyframes crlIntroCodeWipe {
          0% {
            opacity: 1;
            clip-path: inset(0 0 0 0);
            transform: translate3d(0,0,0);
          }
          18% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            clip-path: inset(0 100% 0 0);
            transform: translate3d(-10px,0,0);
          }
        }

        .crlIntroConnectedCard {
          width: 100%;
          min-height: 0;
          max-height: 0;
          margin: 0;
          padding: 0 20px;
          overflow: hidden;
          box-sizing: border-box;
          opacity: 0;
          transform: translate3d(0,-12px,0) scale(.97);
          transform-origin: center center;
        }

        .crlIntroConnectedCard.crlIntroConnectedCardVisible {
          max-height: 68px;
          margin:
            18px 0 0;
          padding: 14px 20px;
          opacity: 1;
          transform: translate3d(0,0,0) scale(1);
          animation:
            crlIntroConnectedPop .78s cubic-bezier(.16,1,.3,1) both;
          animation-delay: .70s;
        }

        @keyframes crlIntroConnectedPop {
          0% {
            opacity: 0;
            transform:
              translate3d(0,-12px,0)
              scale(.97);
          }
          45% {
            opacity: .55;
          }
          78% {
            opacity: 1;
            transform:
              translate3d(0,1px,0)
              scale(1.006);
          }
          100% {
            opacity: 1;
            transform:
              translate3d(0,0,0)
              scale(1);
          }
        }

        @media (max-width: 900px) {
          .crlIntroLayoutWaiting,
          .crlIntroLayoutJoined {
            margin-top: 18px;
            margin-bottom: 18px;
          }

          .crlIntroLayoutWaiting .crlIntroCodeCard,
          .crlIntroLayoutJoined .crlIntroCodeCardJoined {
            position: relative;
            width: 100%;
            height: auto;
            min-height: 0;
            margin: 0;
          }

          .crlIntroLayoutWaiting .crlIntroAssessmentCard,
          .crlIntroLayoutJoined .crlIntroAssessmentCardJoined {
            width: 100%;
            margin-left: 0;
            margin-top: 18px;
          }

          .crlIntroLayoutJoined .crlIntroCodeCardJoined {
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            height: 0;
            min-height: 0;
          }

          .crlIntroConnectedCard.crlIntroConnectedCardVisible {
            max-height: 68px;
            margin-top: 18px;
            padding: 14px 16px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .crlIntroLayoutJoined .crlIntroCodeCardJoined {
            animation: none !important;
            opacity: 0 !important;
          }

          .crlIntroLayoutWaiting .crlIntroAssessmentCard,
          .crlIntroLayoutJoined .crlIntroAssessmentCardJoined {
            transition-duration: .01ms !important;
          }

          .crlIntroConnectedCard.crlIntroConnectedCardVisible {
            animation: none !important;
            max-height: 78px;
            opacity: 1;
            transform: none !important;
          }
        }

        .crlAnswerButton:hover:not(:disabled) {
          transform: translateY(-2px);
          filter: brightness(1.04);
          box-shadow:
            8px 10px 18px rgba(60,88,112,.20);
        }

        .crlAnswerButton:active:not(:disabled) {
          transform: translateY(1px) scale(.985);
          box-shadow:
            3px 4px 8px rgba(60,88,112,.18);
        }

        .crlComprehensionAnswerButton:disabled,
        .successButton:disabled,
        .dangerButton:disabled {
          cursor: not-allowed !important;
          opacity: .52 !important;
          filter: grayscale(.18) !important;
          transform: none !important;
          box-shadow: 3px 4px 9px rgba(73,96,116,.08) !important;
        }

        .crlAnswerButton:disabled {
          cursor: not-allowed !important;
          opacity: .62;
          filter: grayscale(.08);
          box-shadow:
            3px 4px 9px rgba(73,96,116,.10);
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

        @media (max-width: 720px) {
          .teacherAssessmentPage header {
            align-items: flex-start !important;
            flex-wrap: wrap !important;
          }

          .teacherAssessmentPage header > div:first-child {
            min-width: 0 !important;
            flex: 1 1 100% !important;
          }

          .teacherAssessmentPage header button {
            margin-left: auto !important;
          }
        }

        /* Final alignment pass: the header and assessment workspace
           must share one exact responsive width boundary. */
        .teacherAssessmentPage > div {
          width: 100% !important;
          max-width: 1180px !important;
          box-sizing: border-box !important;
        }

        .teacherAssessmentPage > div > header {
          width: 100% !important;
          max-width: none !important;
          box-sizing: border-box !important;
        }

        .crlIntroLayoutWaiting,
        .crlIntroLayoutJoined {
          width: 100% !important;
          max-width: none !important;
          box-sizing: border-box !important;
        }

        .crlIntroLayoutWaiting .crlIntroCodeCard,
        .crlIntroLayoutJoined .crlIntroCodeCardJoined {
          width: 32% !important;
          min-width: 0 !important;
          max-width: none !important;
          box-sizing: border-box !important;
        }

        .crlIntroLayoutWaiting .crlIntroAssessmentCard {
          width: calc(68% - 11px) !important;
          margin-left: calc(32% + 11px) !important;
          min-width: 0 !important;
          max-width: none !important;
          box-sizing: border-box !important;
        }

        .crlIntroLayoutJoined .crlIntroAssessmentCardJoined {
          width: 100% !important;
          margin-left: 0 !important;
          min-width: 0 !important;
          max-width: none !important;
          box-sizing: border-box !important;
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
              {stableLearnerDisplayName || "Learner"}
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

        <div
          className={
            joined
              ? "crlIntroConnectedCard crlIntroConnectedCardVisible"
              : "crlIntroConnectedCard"
          }
          style={styles.connectedStatusCard}
        >
          <span
            style={{
              ...styles.dot,
              background: "#18834e",
            }}
          />
          Learner connected
        </div>

        <div
          className={
            joined
              ? "crlIntroLayout crlIntroLayoutJoined"
              : "crlIntroLayout crlIntroLayoutWaiting"
          }
        >
          <section
            className={
              joined
                ? "crlIntroCodeCard crlIntroCodeCardJoined"
                : "crlIntroCodeCard"
            }
            aria-hidden={
              joined
            }
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

          <section
            className={
              joined
                ? "crlIntroAssessmentCard crlIntroAssessmentCardJoined"
                : "crlIntroAssessmentCard"
            }
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
                  the Learner App and enter the
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
                        className="crlAnswerButton crlComprehensionAnswerButton"
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
                        className="crlAnswerButton crlComprehensionAnswerButton"
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
                        className="crlAnswerButton"
                        style={
                          styles.successButton
                        }
                        disabled={
                          busy ||
                          transitionPending ||
                          (wordInitialTransitionPending && wordIndex === 0) ||
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
                        className="crlAnswerButton"
                        style={
                          styles.dangerButton
                        }
                        disabled={
                          busy ||
                          transitionPending ||
                          (wordInitialTransitionPending && wordIndex === 0) ||
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
                      {passageSeconds < 120 && !miscueReviewMode && (
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
                      )}

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

                      {miscueReviewMode && !timeUpSelecting && (
                        <div style={styles.miscueInlinePrompt}>
                          <div style={styles.miscueInlinePromptBadge}>REVIEW</div>
                          <div style={styles.miscueInlinePromptTitle}>Review passage miscues</div>
                          <div style={styles.miscueInlinePromptText}>
                            Optionally press any word in the original passage above where you observed a miscue. Leave every word unchanged when there are no miscues.
                          </div>
                          <button
                            type="button"
                            style={styles.miscueInlineConfirmButton}
                            onClick={() =>
                              void finishPassageReading(
                                passageSeconds,
                                passageSeconds >= 120 ? passageWordsRead || 0 : 100
                              )
                            }
                            disabled={busy || passageFinalizingRef.current}
                          >
                            Confirm & Continue
                          </button>
                        </div>
                      )}

                      {!miscueReviewMode && !timeUpSelecting && (
                        <div style={styles.passageFinishRow}>
                          <button
                            type="button"
                            style={styles.primaryPassageButton}
                            onClick={() => {
                              passageClockRef.current.frozenSeconds = passageSeconds;
                              if (passageTimerRef.current) {
                                window.clearInterval(passageTimerRef.current);
                                passageTimerRef.current = null;
                              }
                              setTimeUpSelecting(false);
                              setTimeUpReviewConfirmed(false);
                              setMiscueReviewMode(true);
                              setMiscueDrawerOpen(false);
                              setReversionSelecting(false);
                              setReversionSourceWord(null);
                              setSelectedPassageWord(null);
                              setSelectedMiscueType(null);
                              setMisreadWord("");
                              setError("");
                            }}
                            disabled={
                              busy ||
                              passageFinalizingRef.current
                            }
                          >
                            Finish Reading
                          </button>
                        </div>
                      )}
                    </div>

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
                        currentQuestions.length
                      }
                    </div>

                    <div
                      key={`question-${questionIndex}-${session?.current_content ?? ""}`}
                      style={styles.question}
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
                        className="crlAnswerButton crlComprehensionAnswerButton"
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
                        className="crlAnswerButton crlComprehensionAnswerButton"
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
        </div>

        {reversionSelecting && reversionSourceWord && (
          <div style={styles.reversionOverlay} role="dialog" aria-modal="true" aria-labelledby="reversion-picker-title">
            <div style={styles.reversionPickerCard}>
              <div style={styles.reversionPickerHeader}>
                <div>
                  <div style={styles.miscueDrawerEyebrow}>REVERSION OBSERVATION</div>
                  <div id="reversion-picker-title" style={styles.reversionPickerTitle}>Select the word the learner reversed</div>
                  <div style={styles.miscueDrawerHint}>The original passage is masked while you select the second word. The selected first word is highlighted. Press the word that was read before the selected word, then the pair will be recorded automatically.</div>
                </div>
                <button
                  type="button"
                  style={styles.miscueDrawerClose}
                  aria-label="Cancel reversion selection"
                  onClick={() => {
                    setReversionSelecting(false);
                    setReversionSourceWord(null);
                    setSelectedPassageWord(null);
                    setSelectedMiscueType(null);
                    setError("");
                  }}
                >
                  ×
                </button>
              </div>

              <div style={styles.reversionSourceBadge}>
                Selected first word: <strong>{passageText.split(/\s+/).filter(Boolean)[Number(reversionSourceWord) - 1] || "Selected word"}</strong>
              </div>

              <div style={styles.reversionPassageMask}>
                {(() => {
                  let wordNumber = 0;
                  return passageText.split(/(\s+)/).map((token, index) => {
                    if (!token.trim()) return token;
                    const number = ++wordNumber;
                    const isSource = number === Number(reversionSourceWord);
                    const annotation = passageMiscues.find((item) => Number(item.wordIndex) === number - 1);
                    return (
                      <button
                        key={`reversion-word-${index}`}
                        type="button"
                        style={{
                          ...styles.reversionWordButton,
                          ...(isSource ? styles.reversionSourceWord : {}),
                          ...(annotation ? styles.reversionExistingMiscueWord : {}),
                        }}
                        disabled={recordingMiscue || isSource}
                        onClick={() => {
                          if (isSource) return;
                          void recordPassageMiscue(Number(reversionSourceWord), 'Reversion', '', number);
                        }}
                        aria-label={`Reversion word ${number}: ${token}${isSource ? ' (selected first word)' : ''}`}
                      >
                        {isSource && <span style={styles.reversionWordMarker}>1</span>}
                        {token}
                      </button>
                    );
                  });
                })()}
              </div>

              <div style={styles.reversionPickerHint}>
                Press the other word in the passage to complete the reversion pair. The two words will be saved with CRLA-style order markers and the reversion direction.
              </div>
            </div>
          </div>
        )}

        {miscueDrawerOpen && selectedPassageWord && (
          <div style={styles.miscueOverlay} role="dialog" aria-modal="true" aria-labelledby="passage-miscue-title">
            <div style={styles.miscueDrawer}>
              <div style={styles.miscueDrawerHeader}>
                <div>
                  <div style={styles.miscueDrawerEyebrow}>MISCUE OBSERVATION</div>
                  <div id="passage-miscue-title" style={styles.miscueDrawerWord}>{passageText.split(/\s+/).filter(Boolean)[Number(selectedPassageWord)-1] || "Selected word"}</div>
                  <div style={styles.miscueDrawerHint}>Choose the miscue type observed for this word.</div>
                </div>
                <button type="button" style={styles.miscueDrawerClose} aria-label="Close miscue options" onClick={() => {setMiscueDrawerOpen(false);setSelectedPassageWord(null);setSelectedMiscueType(null);setReversionSelecting(false);setReversionSourceWord(null);setMisreadWord("");}}>×</button>
              </div>
              <div style={styles.miscueTypeGrid}>
                {[['Insertion','Added word or sound','#1766a9','#dff1ff'],['Omission','Word was skipped','#b32031','#ffe5e8'],['Substitution','Another word was said','#955900','#fff0d9'],['Repetition','Word was read more than once','#7041a8','#eee5ff'],['Reversion','Word or group of words not read in order','#9c3f8f','#f2e5f2'],['SelfCorrection','Word read incorrectly at first but immediately corrected','#287447','#e2f7e9']].map(([label,description,color,background]) => (
                  <button key={label} type="button" disabled={recordingMiscue} style={{...styles.miscueTypeButton,color,background,borderColor:color,...(selectedMiscueType===label?styles.miscueTypeButtonSelected:{})}} onClick={() => {
                    setSelectedMiscueType(label);
                    if(label==='Reversion'){
                      setMiscueDrawerOpen(false);
                      setReversionSourceWord(Number(selectedPassageWord));
                      setReversionSelecting(true);
                      setError("");
                      return;
                    }
                    if(label!=='Insertion'&&label!=='Substitution')void recordPassageMiscue(selectedPassageWord,label,'');
                  }}>
                    <span style={styles.miscueTypeText}><span style={styles.miscueTypeName}>{label==='SelfCorrection'?'Self-Correction':label}</span><span style={styles.miscueTypeDescription}>{description}</span></span>
                    <span style={{...styles.miscueTypeArrow,color}}>→</span>
                  </button>
                ))}
              </div>
              {(selectedMiscueType==='Insertion'||selectedMiscueType==='Substitution') && (
                <div style={styles.miscueEntryArea}>
                  <label style={styles.miscueEntryLabel}>What did the learner say?</label>
                  <input type="text" value={misreadWord} onChange={e=>setMisreadWord(e.target.value)} placeholder={selectedMiscueType==='Insertion'?'Enter the word/sound added':'Enter the substituted word'} style={styles.miscueDrawerInput} disabled={recordingMiscue} autoFocus />
                  <button type="button" style={styles.miscueApplyButton} onClick={() => void recordPassageMiscue(selectedPassageWord,selectedMiscueType,misreadWord)} disabled={recordingMiscue||!misreadWord.trim()}>Apply Miscue</button>
                </div>
              )}
              {passageMiscues.some(item=>Number(item.wordIndex)===Number(selectedPassageWord)-1) && <button type="button" style={styles.removeMiscueButton} onClick={() => void removePassageMiscue()} disabled={recordingMiscue}>Remove Miscue</button>}
            </div>
          </div>
        )}

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
          <div style={styles.observationModalOverlay} role="dialog" aria-modal="true" aria-labelledby="final-assessment-review-title">
            <div style={{ ...styles.observationModal, width: "min(1100px,96vw)", maxWidth: "1100px", maxHeight: "92vh", overflowY: "auto" }}>
              <div style={styles.observationIcon}>📊</div>
              <h2 id="final-assessment-review-title" style={styles.observationTitle}>Final Assessment Review</h2>
              <p style={styles.observationSubtitle}>Review the complete CRLA record before saving it to Assessment Records.</p>

              {(() => {
                const metrics = session?.metrics || {};
                const task1 = Array.isArray(session?.task1Results) ? session.task1Results : [];
                const task2 = Array.isArray(session?.task2Results) ? session.task2Results : [];
                const comp = Array.isArray(session?.comprehensionResults) ? session.comprehensionResults : [];
                const miscues = Array.isArray(metrics.passageMiscues) ? metrics.passageMiscues : [];
                const wordsRead = Number(metrics.wordsRead ?? Math.max(0, 100 - Number(metrics.totalMiscues || 0)));
                const totalTime = Number(metrics.timerSeconds || 0);
                const wpm = metrics.wpm == null ? (totalTime ? Number(((wordsRead / totalTime) * 60).toFixed(2)) : null) : Number(metrics.wpm);
                const experience = Number(metrics.experienceRating || 0);
                const storyNumber = Number(metrics.storyNumber || 0);
                const emoji = ["", "😟", "🙁", "😐", "🙂", "🤩"][experience] || "—";
                const profileOptions = [
                  "Low Emerging Reader",
                  "High Emerging Reader",
                  "Developing Reader",
                  "Transitioning Reader",
                  "Reading at Grade Level",
                ];

                return (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "10px", marginTop: "16px" }}>
                      {[
                        ["Story Number", storyNumber ? `Story ${storyNumber}` : (session?.story_title || "—")],
                        ["Total Miscues", metrics.totalMiscues ?? 0],
                        ["Words Read in 2 Minutes", wordsRead],
                        ["Total Used Time", totalTime ? `${totalTime}s` : "0s"],
                        ["WPM", wpm == null ? "—" : wpm.toFixed(2)],
                        ["Reading %", `${wordsRead}%`],
                        ["Total Correct Answers", `${metrics.comprehensionScore ?? comp.filter((item) => item.isCorrect).length} / ${QUESTIONS.length}`],
                        ["Learner Experience", experience ? `${emoji} ${experience}/5` : "Pending"],
                      ].map(([label, value]) => (
                        <div key={label} style={{ padding: "12px", border: "1px solid #dbe7f0", borderRadius: "12px", background: "#ffffff" }}>
                          <div style={{ color: "#71879b", fontSize: "10px", fontWeight: "900", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
                          <div style={{ marginTop: "4px", color: "#183d5d", fontSize: "18px", fontWeight: "950" }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px", marginTop: "14px" }}>
                      {[
                        ["Part 1 Task 1 — Letter Sounds", task1],
                        ["Part 1 Task 2 — Word Recognition", task2],
                      ].map(([title, items]) => (
                        <section key={title} style={{ padding: "14px", border: "1px solid #dbe7f0", borderRadius: "14px", background: "#f9fcff" }}>
                          <h3 style={{ margin: 0, color: "#244966", fontSize: "15px", fontWeight: "950" }}>{title}</h3>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "7px", marginTop: "10px" }}>
                            {items.map((item) => (
                              <div key={`${title}-${item.index}`} style={{ padding: "8px 10px", borderRadius: "9px", background: item.isCorrect ? "#eaf8f0" : "#fff1f3", color: item.isCorrect ? "#237548" : "#b32031", fontSize: "12px", fontWeight: "900" }}>
                                {Number(item.index) + 1}. {item.content} — {item.isCorrect ? "Correct" : "Incorrect"}
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>

                    <section style={{ marginTop: "12px", padding: "14px", border: "1px solid #dbe7f0", borderRadius: "14px", background: "#f9fcff" }}>
                      <h3 style={{ margin: 0, color: "#244966", fontSize: "15px", fontWeight: "950" }}>Passage Miscues — Story {storyNumber || "—"}</h3>
                      <div style={{ display: "grid", gap: "6px", marginTop: "9px" }}>
                        {miscues.length ? miscues.map((item, index) => (
                          <div key={`${item.wordIndex}-${item.miscueType}-${index}`} style={{ padding: "8px 10px", borderRadius: "9px", background: "#ffffff", border: "1px solid #e1eaf1", color: "#36536d", fontSize: "12px" }}>
                            Word {Number(item.wordIndex) + 1}: <strong>{item.word || "Selected word"}</strong> — {item.miscueType}{item.misreadWord ? ` (said: ${item.misreadWord})` : ""}
                          </div>
                        )) : <div style={{ color: "#73879a", fontSize: "12px" }}>No miscues recorded.</div>}
                      </div>
                    </section>

                    <section style={{ marginTop: "12px", padding: "14px", border: "1px solid #dbe7f0", borderRadius: "14px", background: "#f9fcff" }}>
                      <h3 style={{ margin: 0, color: "#244966", fontSize: "15px", fontWeight: "950" }}>Comprehension Questions</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "7px", marginTop: "9px" }}>
                        {comp.map((item) => (
                          <div key={`comp-${item.questionIndex}`} style={{ padding: "8px 10px", borderRadius: "9px", background: item.isCorrect ? "#eaf8f0" : "#fff1f3", color: item.isCorrect ? "#237548" : "#b32031", fontSize: "12px", fontWeight: "900" }}>
                            Question {Number(item.questionIndex) + 1} — {item.isCorrect ? "Correct" : "Incorrect"}
                          </div>
                        ))}
                      </div>
                    </section>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "16px" }}>
                      <label style={styles.observationField}>
                        <span>Observation Level</span>
                        <select value={finalObservationLevel} onChange={(event) => setFinalObservationLevel(event.target.value)} style={styles.observationSelect} disabled={savingTerminationObservation}>
                          <option value="">Select Observation Level</option>
                          <option value="1">Level 1: Reads word by word</option>
                          <option value="2">Level 2: Reads word in chunks</option>
                          <option value="3">Level 3: Reads fluently but ignores punctuation</option>
                          <option value="4">Level 4: Reads fluently with proper expression</option>
                        </select>
                      </label>
                      <label style={styles.observationField}>
                        <span>Reading Profile</span>
                        <select value={finalReadingProfile} onChange={(event) => setFinalReadingProfile(event.target.value)} style={styles.observationSelect} disabled={savingTerminationObservation}>
                          <option value="">Select Reading Profile</option>
                          {profileOptions.map((profile) => <option key={profile} value={profile}>{profile}</option>)}
                        </select>
                      </label>
                    </div>

                    <label style={styles.observationField}>
                      <span>Remarks <span style={styles.optionalLabel}>(optional)</span></span>
                      <textarea value={terminationRemarks} onChange={(event) => setTerminationRemarks(event.target.value)} disabled={savingTerminationObservation} maxLength={5000} placeholder="Enter your observation or remarks for this learner..." style={styles.observationTextarea} />
                    </label>
                  </>
                );
              })()}

              {terminationObservationError && <div style={styles.observationError} role="alert">{terminationObservationError}</div>}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "16px" }}>
                <button type="button" style={styles.backDashboardButton} onClick={() => window.location.replace("/teacher")} disabled={savingTerminationObservation}>Back to Dashboard</button>
                <button type="button" style={styles.observationSaveButton} onClick={saveTerminationObservation} disabled={savingTerminationObservation || !Number(finalObservationLevel) || !finalReadingProfile}>
                  {savingTerminationObservation ? "Saving Assessment..." : "Save Assessment"}
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
      "1180px",
    margin:
      "0 auto",
  },

  header: {
    width:
      "100%",
    margin:
      "0",
    minHeight:
      "78px",
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
      "100%",
    minHeight:
      "250px",
    margin:
      "0",
    padding:
      "28px",
    display:
      "flex",
    flexDirection:
      "column",
    alignItems:
      "center",
    justifyContent:
      "center",
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
    boxSizing:
      "border-box",
  },

  codeLabel: {
    fontSize:
      "12px",
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
      "10px",
    fontSize:
      "48px",
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
      "100%",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    gap:
      "10px",
    borderRadius:
      "18px",
    background:
      "linear-gradient(145deg,#f3faf5,#e7f3eb)",
    border:
      "1px solid #d2e4d8",
    color:
      "#2a7b4d",
    fontSize:
      "19px",
    fontWeight:
      "950",
    boxShadow:
      "0 8px 18px rgba(114,145,127,.12)",
    boxSizing:
      "border-box",
  },

  assessmentCard: {
    width:
      "100%",
    minHeight:
      "440px",
    margin:
      "0",

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
    minHeight:
      "430px",
    padding:
      "88px 44px",
    display:
      "flex",
    flexDirection:
      "column",
    alignItems:
      "center",
    justifyContent:
      "center",
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
      "#213b57",
    fontSize:
      "32px",
    lineHeight:
      1.2,
    fontWeight:
      "950",
  },

  muted: {
    margin:
      "14px auto 20px",
    maxWidth:
      "740px",
    color:
      "#73879b",
    fontSize:
      "16px",
    lineHeight:
      1.7,
  },

  stagePanel: {
    padding:
      "30px",
    textAlign:
      "center",
  },

  counter: {
    color:
      "#6f8498",
    fontSize:
      "14px",
    fontWeight:
      "800",
  },

  contentDisplay: {
    minHeight:
      "260px",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    color:
      "#1559a6",
    fontSize:
      "108px",
    fontWeight:
      "950",
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
      "170px",
    minHeight:
      "50px",
    border:
      0,
    borderRadius:
      "14px",
    background:
      "linear-gradient(145deg,#24955d,#18834e)",
    color:
      "#ffffff",
    fontSize:
      "16px",
    fontWeight:
      "950",
    cursor:
      "pointer",
    transition:
      "transform .14s ease, box-shadow .14s ease, filter .14s ease",
    boxShadow:
      "6px 7px 14px rgba(39,117,77,.18)",
  },

  dangerButton: {
    minWidth:
      "170px",
    minHeight:
      "50px",
    border:
      0,
    borderRadius:
      "14px",
    background:
      "linear-gradient(145deg,#d63c50,#c92335)",
    color:
      "#ffffff",
    fontSize:
      "16px",
    fontWeight:
      "950",
    cursor:
      "pointer",
    transition:
      "transform .14s ease, box-shadow .14s ease, filter .14s ease",
    boxShadow:
      "6px 7px 14px rgba(171,55,68,.18)",
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

  miscueInlinePrompt: { width: "min(760px,100%)", margin: "0 auto", padding: "18px", borderRadius: "18px", background: "linear-gradient(145deg,#f8fbff,#edf5fb)", border: "1px solid #d5e2ec", boxShadow: "8px 10px 20px rgba(63,96,128,.12), -5px -5px 10px rgba(255,255,255,.92)", textAlign: "left" },
  miscueInlinePromptBadge: { display: "inline-block", padding: "4px 8px", borderRadius: "999px", background: "#e7f0f8", color: "#2769a8", fontSize: "11px", fontWeight: "950", letterSpacing: ".08em" },
  miscueInlinePromptTitle: { marginTop: "7px", color: "#1f435f", fontSize: "22px", fontWeight: "950" },
  miscueInlinePromptText: { marginTop: "6px", color: "#6f8498", fontSize: "14px", lineHeight: 1.5 },
  miscueInlineSelectedWord: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginTop: "12px", padding: "10px 12px", borderRadius: "12px", background: "#ffffff", border: "1px solid #dbe7f0" },
  miscueInlineSelectedLabel: { color: "#7a8ea1", fontSize: "10px", fontWeight: "900", textTransform: "uppercase", letterSpacing: ".08em" },
  miscueInlineTypeGrid: { display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: "8px", marginTop: "12px" },
  miscueInlineTypeButton: { minHeight: "64px", padding: "8px", borderRadius: "11px", border: "1px solid", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", textAlign: "left" },
  miscueInlineTypeButtonSelected: { boxShadow: "0 0 0 2px rgba(47,115,201,.22)", transform: "translateY(-1px)" },
  miscueInlineTypeName: { display: "block", fontSize: "11px", lineHeight: 1.15 },
  miscueInlineTypeHint: { display: "block", marginTop: "4px", color: "#6e8192", fontSize: "9px", lineHeight: 1.25 },
  miscueInlineTypeArrow: { fontSize: "15px", fontWeight: "950" },
  miscueInlineEntry: { display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "end", marginTop: "11px" },
  miscueInlineEntryLabel: { gridColumn: "1 / -1", color: "#60778c", fontSize: "10px", fontWeight: "900" },
  miscueInlineInput: { minHeight: "42px", padding: "0 11px", borderRadius: "10px", border: "1px solid #cfdde8", background: "#ffffff", color: "#213b57", outline: "none" },
  miscueInlineApplyButton: { minHeight: "42px", padding: "0 13px", border: 0, borderRadius: "10px", background: "linear-gradient(145deg,#2f73c9,#1559a6)", color: "#ffffff", fontSize: "11px", fontWeight: "950", cursor: "pointer" },
  miscueInlineConfirmButton: { width: "100%", minHeight: "48px", marginTop: "13px", border: 0, borderRadius: "12px", background: "linear-gradient(145deg,#2f8f61,#1e744c)", color: "#ffffff", fontSize: "15px", fontWeight: "950", cursor: "pointer" },

  reversionOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 6000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    background: "rgba(9,28,46,.72)",
    backdropFilter: "blur(9px)",
    WebkitBackdropFilter: "blur(9px)",
  },

  reversionPickerCard: {
    width: "min(1040px,96vw)",
    maxHeight: "92vh",
    overflowY: "auto",
    padding: "28px",
    borderRadius: "24px",
    background: "linear-gradient(145deg,#f8fbff,#edf5fb)",
    border: "1px solid #d3e1ec",
    boxShadow: "0 30px 80px rgba(14,37,57,.35)",
  },

  reversionPickerHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "18px",
  },

  reversionPickerTitle: {
    marginTop: "6px",
    color: "#183e60",
    fontSize: "28px",
    lineHeight: 1.2,
    fontWeight: "950",
  },

  reversionSourceBadge: {
    marginTop: "18px",
    padding: "12px 14px",
    borderRadius: "13px",
    background: "#e7f1fb",
    border: "1px solid #c7dbed",
    color: "#275b87",
    fontSize: "14px",
    fontWeight: "800",
  },

  reversionPassageMask: {
    marginTop: "16px",
    padding: "22px",
    borderRadius: "18px",
    background: "#ffffff",
    border: "1px solid #d7e4ed",
    boxShadow: "inset 3px 3px 10px rgba(132,159,180,.10), 0 10px 26px rgba(60,91,116,.10)",
    color: "#243c55",
    fontSize: "20px",
    lineHeight: 2,
  },

  reversionWordButton: {
    position: "relative",
    border: "1px solid transparent",
    borderRadius: "7px",
    margin: "0 2px",
    padding: "2px 5px",
    background: "transparent",
    color: "#243c55",
    font: "inherit",
    lineHeight: "inherit",
    cursor: "pointer",
    transition: "background .12s ease, color .12s ease, box-shadow .12s ease, transform .12s ease",
  },

  reversionWordButtonHover: {
    background: "#e7f2fc",
    color: "#1559a6",
  },

  reversionSourceWord: {
    background: "#cfe5f8",
    color: "#1559a6",
    borderColor: "#4b91cf",
    boxShadow: "inset 0 -3px 0 #4b91cf, 0 3px 9px rgba(74,136,190,.18)",
    cursor: "default",
  },

  reversionExistingMiscueWord: {
    boxShadow: "inset 0 -2px 0 rgba(180,74,90,.32)",
  },

  reversionWordMarker: {
    position: "absolute",
    top: "-15px",
    left: "50%",
    transform: "translateX(-50%)",
    color: "#2f73c9",
    fontSize: "12px",
    lineHeight: 1,
    fontWeight: "950",
    pointerEvents: "none",
  },

  reversionPickerHint: {
    marginTop: "12px",
    color: "#71869a",
    fontSize: "13px",
    lineHeight: 1.55,
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

  miscueReviewSection: {
    marginBottom: "18px",
    padding: "16px",
    borderRadius: "16px",
    background: "#f3f8fc",
    border: "1px solid #dbe7f0",
  },
  miscueReviewTitle: {
    color: "#1f4b69",
    fontSize: "18px",
    fontWeight: "950",
  },
  miscueReviewText: {
    marginTop: "6px",
    color: "#70869a",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  miscueReviewWordGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    maxHeight: "220px",
    overflowY: "auto",
    marginTop: "12px",
    padding: "10px",
    borderRadius: "12px",
    background: "#ffffff",
    border: "1px solid #dfe9f1",
  },
  miscueReviewWordButton: {
    border: "1px solid #d4e0ea",
    borderRadius: "8px",
    background: "#f8fbfe",
    color: "#36536b",
    padding: "5px 7px",
    fontSize: "13px",
    cursor: "pointer",
  },
  miscueReviewWordMarked: {
    borderColor: "#e3ae6a",
    background: "#fff2df",
  },
  miscueReviewWordSelected: {
    boxShadow: "0 0 0 2px #2f73c9",
    background: "#eaf3fb",
    color: "#1559a6",
  },
  miscueReviewConfirmButton: {
    width: "100%",
    minHeight: "50px",
    marginTop: "18px",
    border: 0,
    borderRadius: "13px",
    background: "linear-gradient(145deg,#2f8f61,#1e744c)",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "950",
    cursor: "pointer",
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
      "none",
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
      "#ffffff",
    color:
      "#2a5c86",
    fontSize:
      "15px",
    fontWeight:
      "900",
    cursor:
      "pointer",
    boxShadow:
      "none",
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
      "none",
    textAlign:
      "center",
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
    textAlign:
      "center",
  },


  confirmText: {
    margin:
      "12px auto 0",
    maxWidth:
      "470px",
    color:
      "#6e8498",
    fontSize:
      "16px",
    lineHeight:
      1.65,
    textAlign:
      "center",
  },


  confirmActions: {
    display:
      "flex",
    justifyContent:
      "center",
    alignItems:
      "center",
    gap:
      "12px",
    marginTop:
      "22px",
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