"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getAssessmentState, saveAssessmentState } from "../../lib/assessmentOutbox";
import { createAssessmentChannel, closeAssessmentChannel } from "../../lib/assessmentChannel";

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

const QUESTIONS = [
  "What must Para look for?",
  "What time or part of the day is it?",
  "What does Para land on?",
  "Who does Para see?",
  "What else is the police officer doing besides directing traffic?",
  "What could the police officer be feeling?",
];

const PASSAGE_TEXT =
  "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.";

const STORIES = [
  {
    id: 1,
    title: "Para The Parrot",
    description: "A story about a parrot flying to the market.",
  },
  {
    id: 2,
    title: "A Day In The Fields",
    description: "Join the farmers as they work in the terraces.",
  },
];


const STAGE_LABELS = {
  waiting:
    "Waiting for Teacher",
  connected:
    "Waiting for Teacher",
  letter:
    "Task 1: Letter Sounds",
  word:
    "Task 2: Words",
  passage:
    "Passage Reading",
  comprehension:
    "Comprehension",
  completed:
    "Assessment Completed",
  ended:
    "Session Ended",
};

function normalizeCode(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(
      /[^A-Za-z0-9]/g,
      ""
    )
    .trim()
    .toUpperCase()
    .slice(0, 6);
}

const WAITING_STAGES =
  new Set([
    "waiting",
    "connected",
  ]);

function isWaitingContent(
  value
) {
  const content =
    String(
      value || ""
    ).trim();

  return (
    !content ||
    /^(waiting|connection\s+inactive)/i.test(
      content
    )
  );
}


const STAGE_ORDER = {
  waiting: 0,
  connected: 0,
  letter: 10,
  word: 20,
  story_choice: 30,
  passage: 40,
  passage_paused: 40,
  comprehension: 50,
  completed: 60,
  ended: 70,
};

function getStageOrder(stage) {
  return STAGE_ORDER[String(stage || "waiting")] ?? 0;
}

function getStageIndex(session) {
  const stage = String(session?.stage || "waiting");
  if (stage === "letter") {
    const content = String(session?.current_content ?? session?.currentContent ?? "").trim();
    const index = LETTERS.indexOf(content);
    return index >= 0 ? index : 0;
  }
  if (stage === "word") {
    const content = String(session?.current_content ?? session?.currentContent ?? "").trim();
    const index = WORDS.indexOf(content);
    return index >= 0 ? index : 0;
  }
  return 0;
}

function isRegressiveSession(incoming, previous) {
  if (!incoming || !previous) return false;
  const incomingStage = String(incoming.stage || "waiting");
  const priorStage = String(previous.stage || "waiting");
  const incomingOrder = getStageOrder(incomingStage);
  const priorOrder = getStageOrder(priorStage);
  if (incomingOrder < priorOrder) return true;
  if (incomingOrder > priorOrder) return false;
  if (incomingStage === priorStage && (incomingStage === "letter" || incomingStage === "word")) {
    return getStageIndex(incoming) < getStageIndex(previous);
  }
  return false;
}

function mergeLearnerSession(
  incoming,
  previous
) {
  const next =
    incoming || {};

  const prior =
    previous || {};

  const incomingStage =
    String(
      next.stage || ""
    ).trim() ||
    "waiting";

  const incomingContent =
    String(
      next.current_content ??
        next.currentContent ??
        ""
    ).trim();

  const priorContent =
    String(
      prior.current_content ??
        prior.currentContent ??
        ""
    ).trim();

  const incomingUpdatedAt = Date.parse(String(next.updated_at || next.updatedAt || "")) || 0;
  const priorUpdatedAt = Date.parse(String(prior.updated_at || prior.updatedAt || "")) || 0;
  if (incomingUpdatedAt > 0 && priorUpdatedAt > 0 && incomingUpdatedAt < priorUpdatedAt) {
    return prior;
  }

  if (isRegressiveSession(next, prior)) {
    return prior;
  }

  const liveAfterJoin =
    Boolean(
      next.connected
    ) &&
    WAITING_STAGES.has(
      incomingStage
    );

  return {
    ...prior,
    ...next,
    stage:
      liveAfterJoin
        ? "letter"
        : incomingStage,
    current_content:
      !isWaitingContent(
        incomingContent
      )
        ? incomingContent
        : (
            !isWaitingContent(
              priorContent
            )
              ? priorContent
              : (
                  liveAfterJoin
                    ? LETTERS[0]
                    : ""
                )
          ),
  };
}

export default function LearnerPage() {
  const [
    codeInput,
    setCodeInput,
  ] = useState("");

  const [
    joined,
    setJoined,
  ] = useState(false);

  const [
    connected,
    setConnected,
  ] = useState(false);

  const [
    session,
    setSession,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    completed,
    setCompleted,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    statusMessage,
    setStatusMessage,
  ] = useState("");

  const [
    zeroScore,
    setZeroScore,
  ] = useState(false);

  const [
    showStartOverlay,
    setShowStartOverlay,
  ] = useState(false);

  const [
    showExperienceOverlay,
    setShowExperienceOverlay,
  ] = useState(false);

  const [
    selectedExperienceRating,
    setSelectedExperienceRating,
  ] = useState(null);

  const [
    savingExperienceRating,
    setSavingExperienceRating,
  ] = useState(false);

  const [
    showConnectionSettings,
    setShowConnectionSettings,
  ] = useState(false);

  const [
    showExitConfirm,
    setShowExitConfirm,
  ] = useState(false);

  const [
    checkingNetwork,
    setCheckingNetwork,
  ] = useState(false);

  const [
    networkSnapshot,
    setNetworkSnapshot,
  ] = useState({
    online: true,
    quality: "Checking...",
    connectionType: "Unknown",
    effectiveType: "",
    browserRtt: null,
    serverRtt: null,
    measuredAt: null,
  });

  const [showPreparationOverlay, setShowPreparationOverlay] = useState(false);
  const preparationTimerRef = useRef(null);
  const preparationKeyRef = useRef("");
  const assessmentChannelRef = useRef(null);
  const sessionRef = useRef(null);
  const networkProbeTimerRef = useRef(null);
  const networkProbeRequestRef = useRef(false);
  const lastRealtimeVersionRef = useRef(0);
  const lastAppliedStageRef = useRef("");
  const localSessionKeyRef = useRef("");

  const [
    countdown,
    setCountdown,
  ] = useState(null);

  const assessmentStartedRef =
    useRef(false);

  const countdownTimerRef =
    useRef(null);

  const statusRequestRef =
    useRef(false);

  const heartbeatRequestRef =
    useRef(false);

  const resetTimerRef =
    useRef(null);

  const getConnectionQuality = useCallback(
    ({ online, browserRtt, serverRtt }) => {
      if (!online) return "Offline";

      const measuredRtt =
        Number.isFinite(serverRtt)
          ? serverRtt
          : browserRtt;

      if (!Number.isFinite(measuredRtt)) {
        return "Connected";
      }

      if (measuredRtt <= 80) return "Good";
      if (measuredRtt <= 200) return "Fair";
      return "Poor";
    },
    []
  );

  const measureNetwork = useCallback(
    async () => {
      if (networkProbeRequestRef.current) {
        return;
      }

      networkProbeRequestRef.current = true;
      setCheckingNetwork(true);

      try {
        const online =
          typeof navigator === "undefined"
            ? true
            : navigator.onLine;

        const connection =
          typeof navigator !== "undefined"
            ? navigator.connection ||
              navigator.mozConnection ||
              navigator.webkitConnection ||
              null
            : null;

        const browserRtt =
          Number.isFinite(
            Number(connection?.rtt)
          )
            ? Number(connection.rtt)
            : null;

        let serverRtt = null;

        if (online) {
          const started = performance.now();
          const controller = new AbortController();
          const timeout = window.setTimeout(
            () => controller.abort(),
            3500
          );

          try {
            const response = await fetch(
              `/api/assessment/ping?ts=${Date.now()}`,
              {
                method: "GET",
                cache: "no-store",
                credentials: "include",
                signal: controller.signal,
                headers: {
                  Accept: "application/json",
                },
              }
            );

            if (response.ok) {
              serverRtt = Math.round(
                performance.now() - started
              );
            }
          } catch {
            serverRtt = null;
          } finally {
            window.clearTimeout(timeout);
          }
        }

        const connectionType =
          String(
            connection?.type ||
              (online
                ? "Internet connection"
                : "Offline")
          ).trim();

        const effectiveType =
          String(
            connection?.effectiveType || ""
          ).trim();

        setNetworkSnapshot({
          online,
          quality: getConnectionQuality({
            online,
            browserRtt,
            serverRtt,
          }),
          connectionType,
          effectiveType,
          browserRtt,
          serverRtt,
          measuredAt: Date.now(),
        });
      } finally {
        networkProbeRequestRef.current = false;
        setCheckingNetwork(false);
      }
    },
    [getConnectionQuality]
  );

  const openConnectionSettings =
    useCallback(() => {
      setShowConnectionSettings(true);
      void measureNetwork();
    }, [measureNetwork]);

  const handleExitApp =
    useCallback(() => {
      setShowExitConfirm(false);

      try {
        window.close();
      } catch {
        /* Some browsers disallow programmatic closing. */
      }

      window.setTimeout(() => {
        try {
          window.location.replace(
            "/learner/download"
          );
        } catch {
          window.location.href =
            "/learner/download";
        }
      }, 120);
    }, []);

  useEffect(() => {
    const handleOnline = () => {
      setNetworkSnapshot((current) => ({
        ...current,
        online: true,
        quality: "Checking...",
      }));
      void measureNetwork();
    };

    const handleOffline = () => {
      setNetworkSnapshot((current) => ({
        ...current,
        online: false,
        quality: "Offline",
        serverRtt: null,
      }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    void measureNetwork();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [measureNetwork]);

  useEffect(() => {
    if (networkProbeTimerRef.current) {
      window.clearInterval(
        networkProbeTimerRef.current
      );
      networkProbeTimerRef.current = null;
    }

    if (!showConnectionSettings) {
      return undefined;
    }

    networkProbeTimerRef.current =
      window.setInterval(() => {
        void measureNetwork();
      }, 5000);

    return () => {
      if (networkProbeTimerRef.current) {
        window.clearInterval(
          networkProbeTimerRef.current
        );
        networkProbeTimerRef.current = null;
      }
    };
  }, [
    showConnectionSettings,
    measureNetwork,
  ]);

  const resetToCodeEntry =
    useCallback(
      () => {
        if (
          resetTimerRef.current
        ) {
          window.clearTimeout(
            resetTimerRef.current
          );
          resetTimerRef.current =
            null;
        }

        setCodeInput("");
        setJoined(false);
        setConnected(false);
        setSession(null);
        setCompleted(false);
        setZeroScore(false);

        assessmentStartedRef.current =
          false;

        if (
          countdownTimerRef.current
        ) {
          window.clearInterval(
            countdownTimerRef.current
          );
          countdownTimerRef.current =
            null;
        }

        setCountdown(null);
        setShowStartOverlay(false);
        setShowPreparationOverlay(false);
        preparationKeyRef.current = "";
        if (preparationTimerRef.current) { window.clearTimeout(preparationTimerRef.current); preparationTimerRef.current = null; }
        setShowExperienceOverlay(false);
        setSelectedExperienceRating(null);
        setSavingExperienceRating(false);
        setStatusMessage("");
        setError("");

        try {
          window.sessionStorage.removeItem(
            "crla_learner_code"
          );
        } catch {
          /* Storage may be unavailable. */
        }
      },
      []
    );

  const serverStage =
    session?.stage ||
    "waiting";

  const stage =
    connected &&
    (
      serverStage ===
        "waiting" ||
      serverStage ===
        "connected"
    )
      ? "letter"
      : serverStage ===
        "passage_paused"
        ? "passage"
        : serverStage;

  const stageLabel =
    STAGE_LABELS[stage] ||
    "Waiting for Teacher";

  const ended =
    Boolean(
      session?.ended
    );

  useEffect(() => { sessionRef.current = session; }, [session]);

  const persistLocalLearnerSession = useCallback(async (nextSession) => {
    if (!nextSession || !localSessionKeyRef.current) return;
    try { await saveAssessmentState(localSessionKeyRef.current, { session: nextSession }); } catch {}
  }, []);

  const triggerWordPreparation = useCallback(() => {
    if (preparationTimerRef.current) window.clearTimeout(preparationTimerRef.current);
    setShowPreparationOverlay(true);
    preparationTimerRef.current = window.setTimeout(() => {
      preparationTimerRef.current = null;
      setShowPreparationOverlay(false);
    }, 2000);
  }, []);

  const applyIncomingSession = useCallback((incoming, source = "server") => {
    if (!incoming) return;
    if (source === "broadcast") {
      const version = Number(incoming.__realtimeVersion || 0);
      if (version && version <= lastRealtimeVersionRef.current) return;
      if (version) lastRealtimeVersionRef.current = version;
    }
    const current = sessionRef.current;
    if (current && isRegressiveSession(incoming, current)) return;
    const next = source === "broadcast" ? { ...(current || {}), ...incoming } : mergeLearnerSession(incoming, current);
    const priorStage = lastAppliedStageRef.current || String(current?.stage || "");
    const normalizedStage = String(next.stage || "waiting") === "passage_paused" ? "passage" : String(next.stage || "waiting");
    const currentWordIndex = normalizedStage === "word" ? getStageIndex(next) : -1;
    if (priorStage === "letter" && normalizedStage === "word" && currentWordIndex === 0) {
      const prepKey = `${localSessionKeyRef.current}:letter-word`;
      if (preparationKeyRef.current !== prepKey) {
        preparationKeyRef.current = prepKey;
        triggerWordPreparation();
      }
    }
    lastAppliedStageRef.current = normalizedStage;
    sessionRef.current = next;
    setSession(next);
    void persistLocalLearnerSession(next);
    setError("");
    setConnected(Boolean(next.connected));
  }, [persistLocalLearnerSession, triggerWordPreparation]);

  const joinAssessment =
    useCallback(
      async () => {
        const code =
          normalizeCode(
            codeInput
          );

        if (
          code.length !== 6
        ) {
          setError(
            "Please enter the 6-character assessment code."
          );
          return;
        }

        localSessionKeyRef.current = `learner:${code}`;
        preparationKeyRef.current = "";
        setLoading(true);
        setError("");
        setStatusMessage(
          "Connecting to your teacher..."
        );

        try {
          /*
           * IMPORTANT:
           *
           * Put the action in the JSON body because
           * that is the contract your current learner
           * page was already using.
           *
           * The API also accepts this exact action
           * and translates host_join to learner_join.
           */
          const response =
            await fetch(
              "/api/assessment",
              {
                method:
                  "POST",

                headers: {
                  "Content-Type":
                    "application/json",

                  Accept:
                    "application/json",
                },

                credentials:
                  "include",

                cache:
                  "no-store",

                body: JSON.stringify({
                  action:
                    "host_join",

                  code,
                }),
              }
            );

          const data =
            await response.json();

          if (
            !response.ok
          ) {
            throw new Error(
              data?.error ||
                "Unable to join the assessment."
            );
          }

          setCodeInput(
            code
          );

          const initialSession = mergeLearnerSession(data, null);
          sessionRef.current = initialSession;
          lastAppliedStageRef.current = String(initialSession.stage || "waiting");
          setSession(initialSession);
          void persistLocalLearnerSession(initialSession);

          setJoined(
            true
          );

          assessmentStartedRef.current =
            false;

          if (
            countdownTimerRef.current
          ) {
            window.clearInterval(
              countdownTimerRef.current
            );
            countdownTimerRef.current =
              null;
          }

          setCountdown(null);
          setShowStartOverlay(false);

          setConnected(
            Boolean(
              data.connected
            )
          );

          setCompleted(
            data.stage ===
              "completed"
          );

          setStatusMessage(
            data.connected
              ? "You are connected to your teacher."
              : "Waiting for your teacher..."
          );
        } catch (joinError) {
          try {
            const saved = await getAssessmentState(`learner:${code}`);
            if (saved?.session) {
              const restored = saved.session;
              sessionRef.current = restored;
              lastAppliedStageRef.current = String(restored.stage || "waiting");
              setSession(restored);
              setJoined(true);
              setConnected(Boolean(restored.connected));
              setStatusMessage("Offline mode");
              setError("");
              setLoading(false);
              return;
            }
          } catch {}
          setJoined(
            false
          );

          setConnected(
            false
          );

          setSession(
            null
          );

          setStatusMessage("");

          setError(
            joinError?.message ||
              "Unable to connect to the assessment."
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [codeInput]
    );

  useEffect(() => {
    if (
      !joined ||
      !connected ||
      completed ||
      ended ||
      assessmentStartedRef.current
    ) {
      return;
    }

    assessmentStartedRef.current =
      true;

    if (
      countdownTimerRef.current
    ) {
      window.clearInterval(
        countdownTimerRef.current
      );
    }

    let value = 3;

    setCountdown(3);
    setShowStartOverlay(true);

    countdownTimerRef.current =
      window.setInterval(
        () => {
          value -= 1;

          if (
            value <= 0
          ) {
            window.clearInterval(
              countdownTimerRef.current
            );

            countdownTimerRef.current =
              null;

            setCountdown(null);
            setShowStartOverlay(false);
            return;
          }

          setCountdown(
            value
          );
        },
        1000
      );

    return () => {
      if (
        countdownTimerRef.current
      ) {
        window.clearInterval(
          countdownTimerRef.current
        );
        countdownTimerRef.current =
          null;
      }
    };
  }, [
    joined,
    connected,
    completed,
    ended,
  ]);

  const refreshStatus =
    useCallback(
      async () => {
        if (
          statusRequestRef.current
        ) {
          return;
        }

        if (!joined) {
          return;
        }

        const code =
          normalizeCode(
            codeInput
          );

        if (
          code.length !== 6
        ) {
          return;
        }

        statusRequestRef.current =
          true;

        try {
          const response =
            await fetch(
              `/api/assessment?action=learner_status&code=${encodeURIComponent(
                code
              )}`,
              {
                method:
                  "GET",
                headers: {
                  Accept:
                    "application/json",
                },
                credentials:
                  "include",
                cache:
                  "no-store",
              }
            );

          const data =
            await response.json();

          if (
            !response.ok
          ) {
            throw new Error(
              data?.error ||
                "Unable to retrieve assessment status."
            );
          }

          applyIncomingSession(data, "server");

          setError("");

          const isConnected =
            Boolean(
              data.connected
            );

          if (
            isConnected
          ) {
            setConnected(
              true
            );

            /*
             * Countdown/start-gate state is controlled by the one-shot
             * useEffect above. Polling must never reopen it.
             */
          } else {
            setConnected(
              false
            );
          }

          if (
            data.ended ||
            data.stage ===
              "completed" ||
            data.stage ===
              "terminated"
          ) {
            const metrics =
              data.scoring;

            const scoreIsZero =
              metrics &&
              Number(
                metrics.task1Score ||
                  0
              ) === 0 &&
              Number(
                metrics.task2Score ||
                  0
              ) === 0 &&
              Number(
                metrics.comprehensionScore ||
                  0
              ) === 0;

            setZeroScore(
              Boolean(
                scoreIsZero
              )
            );

            const normalCompletion =
              data.stage ===
              "completed";

            setCompleted(
              normalCompletion ||
              Boolean(scoreIsZero)
            );

            setConnected(
              false
            );

            setStatusMessage(
              normalCompletion
                ? "Assessment completed."
                : ""
            );

            if (
              scoreIsZero
            ) {
              setShowExperienceOverlay(
                false
              );
              setSelectedExperienceRating(
                null
              );

              if (
                !resetTimerRef.current
              ) {
                resetTimerRef.current =
                  window.setTimeout(
                    resetToCodeEntry,
                    3000
                  );
              }
            } else if (
              normalCompletion
            ) {
              setSelectedExperienceRating(
                null
              );

              setShowExperienceOverlay(
                true
              );

              if (
                resetTimerRef.current
              ) {
                window.clearTimeout(
                  resetTimerRef.current
                );
                resetTimerRef.current =
                  null;
              }
            } else {
              if (
                !resetTimerRef.current
              ) {
                resetTimerRef.current =
                  window.setTimeout(
                    resetToCodeEntry,
                    700
                  );
              }
            }

            return;
          }

          setStatusMessage(
            isConnected
              ? "Connected"
              : "Reconnecting..."
          );
        } catch {
          /*
           * Keep the current live item during transient network/DB delay.
           * Do not flash the old waiting screen while the teacher is still
           * controlling the session.
           */
          setStatusMessage(
            "Reconnecting..."
          );
        } finally {
          statusRequestRef.current =
            false;
        }
      },
      [
        joined,
        codeInput,
        resetToCodeEntry,
        applyIncomingSession,
      ]
    );

  const submitExperienceRating =
    useCallback(
      async (
        rating
      ) => {
        if (
          savingExperienceRating ||
          !rating
        ) {
          return;
        }

        setSelectedExperienceRating(
          rating
        );
        setSavingExperienceRating(
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
                      "save_experience_rating",
                    code: codeInput,
                    learner_id:
                      session?.learner_id,
                    experience_rating:
                      rating,
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
                "Unable to save your rating."
            );
          }

          setShowExperienceOverlay(
            false
          );

          if (
            resetTimerRef.current
          ) {
            window.clearTimeout(
              resetTimerRef.current
            );
          }

          resetTimerRef.current =
            window.setTimeout(
              resetToCodeEntry,
              3000
            );
        } catch (ratingError) {
          setSelectedExperienceRating(
            null
          );

          setError(
            ratingError.message ||
              "Unable to save your rating."
          );
        } finally {
          setSavingExperienceRating(
            false
          );
        }
      },
      [
        codeInput,
        resetToCodeEntry,
        savingExperienceRating,
        session?.learner_id,
      ]
    );

  const sendHeartbeat =
    useCallback(
      async () => {
        if (
          heartbeatRequestRef.current
        ) {
          return;
        }

        if (
          !joined ||
          completed
        ) {
          return;
        }

        const code =
          normalizeCode(
            codeInput
          );

        if (
          code.length !== 6
        ) {
          return;
        }

        heartbeatRequestRef.current =
          true;

        try {
          const response =
            await fetch(
              "/api/assessment",
              {
                method:
                  "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                  Accept:
                    "application/json",
                },
                credentials:
                  "include",
                cache:
                  "no-store",
                body:
                  JSON.stringify({
                    action:
                      "learner_heartbeat",
                    code,
                  }),
              }
            );

          const data =
            await response.json();

          if (
            !response.ok
          ) {
            return;
          }

          if (
            data.connected
          ) {
            setConnected(
              true
            );
          }

          applyIncomingSession(data, "server");

          if (
            data.ended
          ) {
            setConnected(
              false
            );
          }
        } catch {
          /* A heartbeat failure is not itself a visual disconnect. */
        } finally {
          heartbeatRequestRef.current =
            false;
        }
      },
      [
        joined,
        completed,
        codeInput,
        applyIncomingSession,
      ]
    );



  useEffect(() => {
    if (!joined || !codeInput) return undefined;
    const channel = createAssessmentChannel(normalizeCode(codeInput), (event) => {
      const message = event?.data;
      if (!message || message.type !== "assessment_state" || message.source !== "teacher") return;
      if (message.session) applyIncomingSession({ ...message.session, __realtimeVersion: message.version }, "broadcast");
    });
    if (!channel) return undefined;
    assessmentChannelRef.current = channel;
    return () => { closeAssessmentChannel(channel); if (assessmentChannelRef.current === channel) assessmentChannelRef.current = null; };
  }, [joined, codeInput, applyIncomingSession]);

  useEffect(() => {
    if (!joined) {
      return undefined;
    }

    refreshStatus();

    const statusTimer =
      window.setInterval(
        refreshStatus,
        document.hidden
          ? 2000
          : 1000
      );

    return () => {
      window.clearInterval(
        statusTimer
      );
    };
  }, [
    joined,
    refreshStatus,
  ]);

  useEffect(() => {
    if (!joined) {
      return undefined;
    }

    const handleVisibilityChange =
      () => {
        if (!document.hidden) {
          void refreshStatus();
          void measureNetwork();
        }
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [
    joined,
    refreshStatus,
    measureNetwork,
  ]);

  useEffect(() => {
    if (
      !joined ||
      completed
    ) {
      return undefined;
    }

    sendHeartbeat();

    const heartbeatTimer =
      window.setInterval(
        sendHeartbeat,
        5000
      );

    return () => {
      window.clearInterval(
        heartbeatTimer
      );
    };
  }, [
    joined,
    completed,
    sendHeartbeat,
  ]);

  const liveContent =
    String(
      session?.current_content ??
        session?.currentContent ??
        ""
    ).trim();

  const liveContentKey = useMemo(
    () =>
      [
        stage,
        liveContent,
        session?.story_title ??
          session?.storyTitle ??
          "",
      ].join("|"),
    [
      stage,
      liveContent,
      session?.story_title,
      session?.storyTitle,
    ]
  );

  const selectedStory =
    STORIES.find(
      (story) =>
        story.title ===
        session?.story_title
    ) ||
    STORIES[0];

  const currentQuestions =
    selectedStory?.questions ||
    STORIES[0].questions;

  const liveItemIndex = useMemo(() => {
    if (
      stage === "letter"
    ) {
      return LETTERS.indexOf(
        String(liveContent)
      );
    }

    if (
      stage === "word"
    ) {
      return WORDS.indexOf(
        String(liveContent)
      );
    }

    if (
      stage === "comprehension"
    ) {
      return currentQuestions.findIndex(
        (question) =>
          typeof question === "string"
            ? question ===
              String(liveContent)
            : question.text ===
              String(liveContent)
      );
    }

    return -1;
  }, [
    stage,
    liveContent,
    currentQuestions,
  ]);

  const liveProgress =
    stage === "letter" &&
    liveItemIndex >= 0
      ? `Letter ${liveItemIndex + 1} of ${LETTERS.length}`
      : stage === "word" &&
          liveItemIndex >= 0
        ? `Word ${liveItemIndex + 1} of ${WORDS.length}`
        : stage === "comprehension" &&
            liveItemIndex >= 0
          ? `Question ${liveItemIndex + 1} of ${currentQuestions.length}`
          : "";

  const passageWords =
    useMemo(
      () =>
        String(
          session?.current_content ||
          selectedStory?.text ||
          ""
        )
          .trim()
          .split(/\s+/)
          .filter(Boolean),
      [
        session?.current_content,
        selectedStory?.text,
      ]
    );

  const displayLiveContent =
    liveContent ||
    (
      stage === "letter"
        ? LETTERS[0]
        : stage === "word"
          ? WORDS[0]
          : stage === "passage"
            ? PASSAGE_TEXT
            : stage === "comprehension"
              ? (
                  currentQuestions[0]?.text ||
                  ""
                )
              : ""
    );


  useEffect(() => {
    return () => {
      if (
        countdownTimerRef.current
      ) {
        window.clearInterval(
          countdownTimerRef.current
        );
      }

      if (
        resetTimerRef.current
      ) {
        window.clearTimeout(
          resetTimerRef.current
        );
      }

      if (
        networkProbeTimerRef.current
      ) {
        window.clearInterval(
          networkProbeTimerRef.current
        );
      }
    };
  }, []);

  if (!joined) {
    return (
      <>
        <style jsx global>{`
          * {
            box-sizing: border-box;
          }

          html,
          body {
            margin: 0;
            min-height: 100%;
            font-family:
              Arial,
              Helvetica,
              sans-serif;
            background:
              linear-gradient(
                135deg,
                #f5f8ff 0%,
                #edf7fa 100%
              );
            color: #1d3048;
          }

          button,
          input {
            font: inherit;
          }

          .page {
            min-height: 100vh;
            padding: 28px 18px;
            display: flex;
            justify-content: center;
          }

          .container {
            width: 100%;
            max-width: 520px;
            animation:
              learnerPageIn
              0.3s ease;
          }

          .brand {
            min-height: 104px;
            padding: 12px 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #ffffff;
            color: #1559a6;
            border: 5px solid #1559a6;
            border-radius: 18px;
            text-align: center;
            box-shadow:
              0 12px 28px
                rgba(
                  21,
                  89,
                  166,
                  0.10
                );
          }

          .brand-title,
          .brand-subtitle {
            display: none;
          }

          .card {
            margin-top: 15px;
            padding: 27px;
            background: #ffffff;
            border: 1px solid #dbe5ef;
            border-radius: 12px;
            box-shadow:
              0 12px 28px
                rgba(
                  33,
                  61,
                  90,
                  0.07
                );
          }

          .title {
            margin: 0;
            text-align: center;
            font-size: 21px;
            font-weight: 900;
          }

          .subtitle {
            margin: 8px 0 23px;
            text-align: center;
            color: #72859a;
            font-size: 10px;
            line-height: 1.6;
          }

          .label {
            display: block;
            margin-bottom: 8px;
            color: #314760;
            font-size: 10px;
            font-weight: 800;
          }

          .code-input {
            width: 100%;
            height: 53px;
            border: 1px solid #cbd9e7;
            border-radius: 8px;
            outline: none;
            padding: 0 14px;
            text-align: center;
            color: #18304b;
            font-size: 19px;
            font-weight: 900;
            letter-spacing: 5px;
            text-transform: uppercase;
            transition:
              border-color 0.15s ease,
              box-shadow 0.15s ease;
          }

          .code-input:focus {
            border-color: #1559a6;
            box-shadow:
              0 0 0 3px
                rgba(
                  21,
                  89,
                  166,
                  0.08
                );
          }

          .primary {
            width: 100%;
            min-height: 45px;
            margin-top: 12px;
            border: 0;
            border-radius: 8px;
            background: #1559a6;
            color: #ffffff;
            cursor: pointer;
            font-size: 11px;
            font-weight: 900;
            transition:
              transform 0.15s ease,
              background 0.15s ease,
              box-shadow 0.15s ease;
          }

          .primary:hover {
            background: #114d91;
            transform: translateY(-1px);
            box-shadow:
              0 6px 15px
                rgba(
                  21,
                  89,
                  166,
                  0.15
                );
          }

          .primary:disabled {
            cursor: wait;
            opacity: 0.55;
            transform: none;
            box-shadow: none;
          }

          .error {
            margin-top: 12px;
            padding: 10px 11px;
            background: #fff4f5;
            border: 1px solid #efc8cd;
            border-radius: 8px;
            color: #b32031;
            font-size: 10px;
            line-height: 1.5;
          }


          .connection-toolbar {
            margin-top: 12px;
            display: grid;
            grid-template-columns: minmax(0, 1fr) 118px;
            gap: 9px;
          }

          .connection-button,
          .exit-app-button {
            min-height: 44px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 900;
            cursor: pointer;
            transition:
              transform .15s ease,
              box-shadow .15s ease,
              background .15s ease,
              border-color .15s ease;
          }

          .connection-button {
            border: 1px solid #c7dced;
            background:
              linear-gradient(
                135deg,
                #eef6ff 0%,
                #e5f0fb 100%
              );
            color: #1559a6;
            box-shadow:
              0 6px 16px
                rgba(21, 89, 166, .07);
          }

          .connection-button:hover,
          .exit-app-button:hover {
            transform: translateY(-1px);
          }

          .connection-button:hover {
            border-color: #9dbddd;
            box-shadow:
              0 9px 20px
                rgba(21, 89, 166, .12);
          }

          .exit-app-button {
            border: 1px solid #f1c8ce;
            background: #fff8f9;
            color: #b32031;
          }

          .exit-app-button:hover {
            background: #fff1f3;
            box-shadow:
              0 7px 17px
                rgba(179, 32, 49, .10);
          }

          .connection-button-content {
            display: inline-flex;
            width: 100%;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }

          .connection-pill-dot {
            width: 8px;
            height: 8px;
            flex: 0 0 auto;
            border-radius: 50%;
            background: #c58a23;
            box-shadow:
              0 0 0 4px
                rgba(197, 138, 35, .09);
          }

          .connection-pill-dot.good {
            background: #1d9b61;
            box-shadow:
              0 0 0 4px
                rgba(29, 155, 97, .10);
          }

          .connection-pill-dot.poor {
            background: #d74a22;
            box-shadow:
              0 0 0 4px
                rgba(215, 74, 34, .10);
          }

          .connection-pill-dot.offline {
            background: #b32031;
            box-shadow:
              0 0 0 4px
                rgba(179, 32, 49, .09);
          }

          .brand-logo-wrap {
            width: min(100%, 470px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2px 8px;
          }

          .brand-logo {
            display: block;
            width: min(100%, 360px);
            height: auto;
            max-height: 88px;
            object-fit: contain;
          }

          .connection-button,
          .exit-app-button,
          .settings-close,
          .settings-action,
          .exit-confirm-button {
            transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
            -webkit-tap-highlight-color: transparent;
          }

          .connection-button:hover,
          .exit-app-button:hover,
          .settings-close:hover,
          .settings-action:hover:not(:disabled),
          .exit-confirm-button:hover:not(:disabled) {
            transform: translateY(-1px);
          }

          .connection-button:active,
          .exit-app-button:active,
          .settings-close:active,
          .settings-action:active:not(:disabled),
          .exit-confirm-button:active:not(:disabled) {
            transform: translateY(2px) scale(.985);
            filter: brightness(.97);
          }

          .connection-overlay {
            position: fixed;
            inset: 0;
            z-index: 1400;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            background:
              rgba(10, 33, 58, .52);
            backdrop-filter: blur(8px);
            animation: overlayFade .18s ease-out;
          }

          .connection-settings-card,
          .exit-confirm-card {
            width: 100%;
            max-width: 460px;
            padding: 24px;
            border: 1px solid #d8e5f0;
            border-radius: 20px;
            background:
              linear-gradient(
                180deg,
                #ffffff 0%,
                #f7fbff 100%
              );
            box-shadow:
              0 28px 90px
                rgba(11, 38, 66, .28);
            animation:
              overlayIn .22s ease-out;
          }

          .settings-header,
          .exit-confirm-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 14px;
          }

          .settings-title,
          .exit-confirm-title {
            margin: 0;
            color: #153d68;
            font-size: 21px;
            font-weight: 950;
          }

          .settings-subtitle,
          .exit-confirm-text {
            margin: 6px 0 0;
            color: #6d8298;
            font-size: 12px;
            line-height: 1.55;
          }

          .settings-close {
            width: 34px;
            height: 34px;
            flex: 0 0 auto;
            border: 1px solid #d8e4ee;
            border-radius: 10px;
            background: #f4f8fc;
            color: #536e87;
            cursor: pointer;
            font-size: 16px;
            font-weight: 900;
          }

          .connection-main-status {
            margin-top: 18px;
            padding: 17px;
            border-radius: 15px;
            background:
              linear-gradient(
                135deg,
                #1559a6 0%,
                #2475cc 100%
              );
            color: #ffffff;
            box-shadow:
              0 12px 26px
                rgba(21, 89, 166, .18);
          }

          .connection-main-row {
            display: flex;
            align-items: center;
            gap: 11px;
          }

          .connection-main-dot {
            width: 12px;
            height: 12px;
            flex: 0 0 auto;
            border-radius: 50%;
            background: #ffe071;
            box-shadow:
              0 0 0 6px
                rgba(255, 224, 113, .13);
          }

          .connection-main-dot.good {
            background: #8ff0c0;
            box-shadow:
              0 0 0 6px
                rgba(143, 240, 192, .12);
          }

          .connection-main-dot.poor {
            background: #ffb088;
            box-shadow:
              0 0 0 6px
                rgba(255, 176, 136, .12);
          }

          .connection-main-dot.offline {
            background: #ff929d;
            box-shadow:
              0 0 0 6px
                rgba(255, 146, 157, .12);
          }

          .connection-main-quality {
            font-size: 19px;
            font-weight: 950;
          }

          .connection-detail-grid {
            margin-top: 14px;
            display: grid;
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
            gap: 9px;
          }

          .connection-detail {
            padding: 12px;
            border: 1px solid #dbe7f1;
            border-radius: 12px;
            background: #ffffff;
          }

          .connection-detail-label {
            color: #8395a7;
            font-size: 8px;
            font-weight: 900;
            letter-spacing: .07em;
            text-transform: uppercase;
          }

          .connection-detail-value {
            margin-top: 4px;
            color: #204467;
            font-size: 12px;
            line-height: 1.35;
            font-weight: 900;
            word-break: break-word;
          }

          .connection-note {
            margin-top: 13px;
            padding: 11px 12px;
            border: 1px solid #d9e7f3;
            border-radius: 11px;
            background: #f2f7fc;
            color: #648099;
            font-size: 10px;
            line-height: 1.55;
          }

          .connection-actions,
          .exit-confirm-actions {
            margin-top: 16px;
            display: grid;
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
            gap: 9px;
          }

          .settings-action,
          .exit-confirm-button {
            min-height: 44px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 900;
          }

          .settings-action.secondary,
          .exit-confirm-button.secondary {
            border: 1px solid #d5e2ed;
            background: #ffffff;
            color: #3f5e79;
          }

          .settings-action.primary,
          .exit-confirm-button.danger {
            border: 0;
            background:
              linear-gradient(
                135deg,
                #1559a6 0%,
                #2475cc 100%
              );
            color: #ffffff;
            box-shadow:
              0 8px 20px
                rgba(21, 89, 166, .17);
          }

          .exit-confirm-button.danger {
            background:
              linear-gradient(
                135deg,
                #b32031 0%,
                #d13a4b 100%
              );
            box-shadow:
              0 8px 20px
                rgba(179, 32, 49, .16);
          }

          @keyframes learnerPageIn {
            from {
              opacity: 0;
              transform: translateY(
                8px
              );
            }

            to {
              opacity: 1;
              transform: translateY(
                0
              );
            }
          }

          @media (max-width: 560px) {
            .page {
              padding: 18px 12px;
            }

            .card {
              padding: 22px 18px;
            }
          }
        `}</style>

        <main className="page">
          <div className="container">
            <section className="brand">
              <div className="brand-logo-wrap">
                <img src="/crl-app-logo.png" alt="CRL-App logo" className="brand-logo" />
              </div>
            </section>

            <div className="connection-toolbar">
              <button
                type="button"
                className="connection-button"
                onClick={openConnectionSettings}
              >
                <span className="connection-button-content">
                  Connection Settings
                </span>
              </button>

              <button
                type="button"
                className="exit-app-button"
                onClick={() => setShowExitConfirm(true)}
              >
                Exit App
              </button>
            </div>

            <section className="card">
              <h1 className="title">
                Join Assessment
              </h1>

              <p className="subtitle">
                Enter the 6-character assessment
                code provided by your teacher.
              </p>

              <label
                className="label"
                htmlFor="assessment-code"
              >
                Assessment Code
              </label>

              <input
                id="assessment-code"
                className="code-input"
                type="text"
                value={codeInput}
                maxLength={6}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="ABC123"
                onChange={(event) => {
                  setCodeInput(
                    normalizeCode(
                      event.target.value
                    )
                  );

                  setError("");
                }}
                onKeyDown={(event) => {
                  if (
                    event.key ===
                    "Enter"
                  ) {
                    joinAssessment();
                  }
                }}
              />

              <button
                type="button"
                className="primary"
                disabled={
                  loading ||
                  codeInput.length !==
                    6
                }
                onClick={
                  joinAssessment
                }
              >
                {loading
                  ? "Connecting..."
                  : "Join Session"}
              </button>

              {error && (
                <div
                  className="error"
                  role="alert"
                >
                  {error}
                </div>
              )}
            </section>
          </div>
        
        {showConnectionSettings && (
          <div
            className="connection-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="learner-connection-title"
            onClick={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setShowConnectionSettings(false);
              }
            }}
          >
            <section className="connection-settings-card">
              <div className="settings-header">
                <div>
                  <h2
                    id="learner-connection-title"
                    className="settings-title"
                  >
                    Connection Settings
                  </h2>
                  <p className="settings-subtitle">
                    Check the current network and connection quality.
                  </p>
                </div>

                <button
                  type="button"
                  className="settings-close"
                  aria-label="Close connection settings"
                  onClick={() =>
                    setShowConnectionSettings(false)
                  }
                >
                  ×
                </button>
              </div>

              <div className="connection-main-status">
                <div className="connection-main-row">
                  <span
                    className={`connection-main-dot ${
                      networkSnapshot.online
                        ? networkSnapshot.quality === "Good"
                          ? "good"
                          : networkSnapshot.quality === "Poor"
                            ? "poor"
                            : ""
                        : "offline"
                    }`}
                  />
                  <div>
                    <div className="connection-main-quality">
                      {networkSnapshot.online
                        ? networkSnapshot.quality
                        : "Offline"}
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        opacity: 0.82,
                        fontSize: 10,
                        fontWeight: 750,
                      }}
                    >
                      {checkingNetwork
                        ? "Checking live connection..."
                        : networkSnapshot.online
                          ? "Network connection detected"
                          : "No internet connection detected"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="connection-detail-grid">
                <div className="connection-detail">
                  <div className="connection-detail-label">
                    Network / Hotspot
                  </div>
                  <div className="connection-detail-value">
                    {networkSnapshot.connectionType ||
                      "Unknown"}
                  </div>
                </div>


                <div className="connection-detail">
                  <div className="connection-detail-label">
                    Server latency
                  </div>
                  <div className="connection-detail-value">
                    {Number.isFinite(
                      networkSnapshot.serverRtt
                    )
                      ? `${networkSnapshot.serverRtt} ms`
                      : "Unavailable"}
                  </div>
                </div>

              </div>


              <div className="connection-actions">
                <button
                  type="button"
                  className="settings-action secondary"
                  onClick={() => measureNetwork()}
                  disabled={checkingNetwork}
                >
                  {checkingNetwork
                    ? "Checking..."
                    : "Test Again"}
                </button>

                <button
                  type="button"
                  className="settings-action primary"
                  onClick={() =>
                    setShowConnectionSettings(false)
                  }
                >
                  Done
                </button>
              </div>
            </section>
          </div>
        )}

        {showExitConfirm && (
          <div
            className="connection-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="learner-exit-title"
            onClick={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setShowExitConfirm(false);
              }
            }}
          >
            <section className="exit-confirm-card">
              <div className="exit-confirm-header">
                <div>
                  <h2
                    id="learner-exit-title"
                    className="exit-confirm-title"
                  >
                    Exit CRL-App Learner?
                  </h2>
                  <p className="exit-confirm-text">
                    Your saved local assessment data will remain
                    on this device. Do you really want to leave the app?
                  </p>
                </div>

                <button
                  type="button"
                  className="settings-close"
                  aria-label="Cancel exit"
                  onClick={() =>
                    setShowExitConfirm(false)
                  }
                >
                  ×
                </button>
              </div>

              <div className="exit-confirm-actions">
                <button
                  type="button"
                  className="exit-confirm-button secondary"
                  onClick={() =>
                    setShowExitConfirm(false)
                  }
                >
                  Stay in App
                </button>

                <button
                  type="button"
                  className="exit-confirm-button danger"
                  onClick={handleExitApp}
                >
                  Exit App
                </button>
              </div>
            </section>
          </div>
        )}

        {showConnectionSettings && (
          <div
            className="connection-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="learner-connection-title"
            onClick={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setShowConnectionSettings(false);
              }
            }}
          >
            <section className="connection-settings-card">
              <div className="settings-header">
                <div>
                  <h2
                    id="learner-connection-title"
                    className="settings-title"
                  >
                    Connection Settings
                  </h2>
                  <p className="settings-subtitle">
                    Check the current network and connection quality.
                  </p>
                </div>

                <button
                  type="button"
                  className="settings-close"
                  aria-label="Close connection settings"
                  onClick={() =>
                    setShowConnectionSettings(false)
                  }
                >
                  ×
                </button>
              </div>

              <div className="connection-main-status">
                <div className="connection-main-row">
                  <span
                    className={`connection-main-dot ${
                      networkSnapshot.online
                        ? networkSnapshot.quality === "Good"
                          ? "good"
                          : networkSnapshot.quality === "Poor"
                            ? "poor"
                            : ""
                        : "offline"
                    }`}
                  />
                  <div>
                    <div className="connection-main-quality">
                      {networkSnapshot.online
                        ? networkSnapshot.quality
                        : "Offline"}
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        opacity: 0.82,
                        fontSize: 10,
                        fontWeight: 750,
                      }}
                    >
                      {checkingNetwork
                        ? "Checking live connection..."
                        : networkSnapshot.online
                          ? "Network connection detected"
                          : "No internet connection detected"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="connection-detail-grid">
                <div className="connection-detail">
                  <div className="connection-detail-label">
                    Network / Hotspot
                  </div>
                  <div className="connection-detail-value">
                    {networkSnapshot.connectionType ||
                      "Unknown"}
                  </div>
                </div>


                <div className="connection-detail">
                  <div className="connection-detail-label">
                    Server latency
                  </div>
                  <div className="connection-detail-value">
                    {Number.isFinite(
                      networkSnapshot.serverRtt
                    )
                      ? `${networkSnapshot.serverRtt} ms`
                      : "Unavailable"}
                  </div>
                </div>

              </div>


              <div className="connection-actions">
                <button
                  type="button"
                  className="settings-action secondary"
                  onClick={() => measureNetwork()}
                  disabled={checkingNetwork}
                >
                  {checkingNetwork
                    ? "Checking..."
                    : "Test Again"}
                </button>

                <button
                  type="button"
                  className="settings-action primary"
                  onClick={() =>
                    setShowConnectionSettings(false)
                  }
                >
                  Done
                </button>
              </div>
            </section>
          </div>
        )}

        {showExitConfirm && (
          <div
            className="connection-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="learner-exit-title"
            onClick={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setShowExitConfirm(false);
              }
            }}
          >
            <section className="exit-confirm-card">
              <div className="exit-confirm-header">
                <div>
                  <h2
                    id="learner-exit-title"
                    className="exit-confirm-title"
                  >
                    Exit CRL-App Learner?
                  </h2>
                  <p className="exit-confirm-text">
                    Your saved local assessment data will remain
                    on this device. Do you really want to leave the app?
                  </p>
                </div>

                <button
                  type="button"
                  className="settings-close"
                  aria-label="Cancel exit"
                  onClick={() =>
                    setShowExitConfirm(false)
                  }
                >
                  ×
                </button>
              </div>

              <div className="exit-confirm-actions">
                <button
                  type="button"
                  className="exit-confirm-button secondary"
                  onClick={() =>
                    setShowExitConfirm(false)
                  }
                >
                  Stay in App
                </button>

                <button
                  type="button"
                  className="exit-confirm-button danger"
                  onClick={handleExitApp}
                >
                  Exit App
                </button>
              </div>
            </section>
          </div>
        )}
</main>
      </>
    );
  }

  return (
    <>
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          min-height: 100%;
          font-family:
            Arial,
            Helvetica,
            sans-serif;
          background:
            linear-gradient(
              145deg,
              #f3f8ff 0%,
              #eef8f7 100%
            );
          color: #18324f;
        }

        button {
          font: inherit;
        }

        .page {
          min-height: 100vh;
          padding: 22px 16px 34px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }

        .container {
          width: 100%;
          max-width: 940px;
          animation:
            learnerPageIn
            .28s
            ease-out;
        }

        .brand {
          min-height: 128px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 14px 26px;
          border: 5px solid #1559a6;
          border-radius: 20px;
          background: #ffffff;
          box-shadow:
            0 14px 34px
              rgba(
                21,
                89,
                166,
                .11
              );
        }

        .brand-title,
        .brand-subtitle {
          display: none;
        }

        .card {
          position: relative;
          margin-top: 16px;
          min-height: 570px;
          padding: 34px 28px 40px;
          border:
            1px solid #d9e5ef;
          border-radius: 20px;
          background: #ffffff;
          box-shadow:
            0 18px 40px
              rgba(
                27,
                59,
                92,
                .08
              );
          overflow: hidden;
        }

        .card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 5px;
          background: #1559a6;
        }

        .live {
          width: 100%;
          min-height: 485px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          animation:
            liveItemIn
            .24s
            ease-out;
        }

        .progress {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          margin-bottom: 18px;
          padding: 7px 14px;
          border-radius: 999px;
          background: #edf4fb;
          color: #4f6e8a;
          font-size: 13px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: .03em;
        }

        .letter {
          min-width: 220px;
          color: #1559a6;
          font-size: clamp(
            145px,
            22vw,
            220px
          );
          line-height: .9;
          font-weight: 950;
          letter-spacing: -.05em;
          text-shadow:
            0 10px 24px
              rgba(
                21,
                89,
                166,
                .10
              );
          animation:
            itemPop
            .24s
            ease-out;
        }

        .word {
          min-width: 260px;
          color: #1559a6;
          font-size: clamp(
            72px,
            10vw,
            110px
          );
          line-height: 1;
          font-weight: 950;
          letter-spacing: -.035em;
          animation:
            itemPop
            .24s
            ease-out;
        }

        .passage-title {
          margin-bottom: 18px;
          color: #1559a6;
          font-size: clamp(
            24px,
            3.4vw,
            34px
          );
          font-weight: 950;
        }

        .passage {
          max-width: 820px;
          margin: 0 auto;
          padding: 22px 24px;
          border:
            1px solid #d9e6ef;
          border-radius: 16px;
          background: #f7fbfe;
          color: #29445f;
          font-size: clamp(
            21px,
            2.4vw,
            29px
          );
          line-height: 1.7;
          font-weight: 650;
          text-align: left;
          box-shadow:
            inset 0 1px 0
              rgba(
                255,
                255,
                255,
                .85
              );
        }

        .question {
          width: 100%;
          max-width: 790px;
          min-height: 180px;
          padding: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border:
            1px solid #d9e5ef;
          border-radius: 16px;
          background: #f7fbfe;
          color: #203a55;
          font-size: clamp(
            28px,
            4vw,
            46px
          );
          line-height: 1.3;
          font-weight: 900;
          text-align: center;
          animation:
            itemPop
            .24s
            ease-out;
        }

        .story-grid {
          width: 100%;
          max-width: 820px;
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .story-card {
          min-height: 230px;
          padding: 24px;
          border:
            1px solid #d9e5ef;
          border-radius: 18px;
          background: #fbfdff;
          box-shadow:
            0 10px 24px
              rgba(
                30,
                64,
                94,
                .055
              );
          text-align: left;
          animation:
            itemPop
            .22s
            ease-out;
        }

        .story-card:nth-child(2) {
          animation-delay: .04s;
        }

        .story-icon {
          width: 54px;
          height: 54px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 15px;
          background: #edf4fb;
          font-size: 28px;
        }

        .story-card-title {
          margin-top: 16px;
          color: #203951;
          font-size: 21px;
          font-weight: 950;
        }


        .state {
          width: 100%;
          max-width: 650px;
          min-height: 390px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          animation:
            liveItemIn
            .24s
            ease-out;
        }

        .zero-score-state {
          min-height: 480px;
          justify-content: center;
        }

        .state-icon {
          width: 68px;
          height: 68px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: #edf4fb;
          color: #1559a6;
          font-size: 28px;
          font-weight: 950;
        }

        .state-icon.success {
          background: #eaf8f0;
          color: #18834e;
        }

        .state-icon.danger {
          background: #fff0f2;
          color: #c92335;
        }

        .friendly-icon {
          width: 78px;
          height: 78px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: #fff6d9;
          box-shadow:
            0 8px 22px
              rgba(
                161,
                118,
                19,
                .10
              );
          font-size: 38px;
          animation:
            friendlyPop
            .34s
            cubic-bezier(
              .22,
              .61,
              .36,
              1
            );
        }

        .state-title {
          margin: 0;
          color: #203951;
          font-size: clamp(
            25px,
            3.6vw,
            36px
          );
          font-weight: 950;
        }

        .state-text {
          max-width: 580px;
          margin: 10px auto 0;
          color: #70859a;
          font-size: 16px;
          line-height: 1.7;
        }

        .zero-score {
          max-width: 600px;
          margin: 14px 0 0;
          padding: 18px 22px;
          border-radius: 15px;
          background: #f4f8fd;
          color: #315271;
          font-size: 17px;
          line-height: 1.65;
          font-weight: 750;
        }

        .error {
          margin-top: 15px;
          padding: 10px 13px;
          border:
            1px solid #efc8cd;
          border-radius: 10px;
          background: #fff4f5;
          color: #b32031;
          font-size: 13px;
        }

        .overlay {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background:
            rgba(
              18,
              37,
              58,
              .48
            );
          backdrop-filter:
            blur(6px);
          animation:
            overlayFade
            .18s
            ease-out;
        }

        .overlay-card {
          width: 100%;
          max-width: 430px;
          padding: 30px;
          border:
            1px solid #d7e2ec;
          border-radius: 20px;
          background: #ffffff;
          box-shadow:
            0 28px 80px
              rgba(
                14,
                36,
                58,
                .24
              );
          text-align: center;
          animation:
            overlayIn
            .22s
            ease-out;
        }

        .overlay-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: #edf4fb;
          color: #1559a6;
          font-size: 28px;
          font-weight: 950;
        }

        .overlay-title {
          margin: 0;
          color: #203951;
          font-size: 25px;
          font-weight: 950;
        }

        .overlay-text {
          max-width: 350px;
          margin: 10px auto 0;
          color: #71869a;
          font-size: 14px;
          line-height: 1.7;
        }

        .rating-grid {
          display: grid;
          grid-template-columns:
            repeat(5, minmax(0, 1fr));
          gap: 8px;
          margin-top: 18px;
        }

        .rating-button {
          min-height: 78px;
          padding: 7px 4px;
          border:
            1px solid #d7e2ec;
          border-radius: 12px;
          background: #ffffff;
          color: #536a80;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          transition:
            transform .15s ease,
            border-color .15s ease,
            background .15s ease;
        }

        .rating-button:hover {
          transform:
            translateY(-1px);
          border-color: #9eb6cf;
          background: #f8fbfe;
        }

        .rating-button.selected {
          border-color: #1559a6;
          background: #edf4fb;
        }

        .rating-emoji {
          font-size: 30px;
          line-height: 1;
        }

        .rating-number {
          color: #71869a;
          font-size: 10px;
          font-weight: 900;
        }


        .preparation-card {
          width: 86px !important;
          height: 86px;
          padding: 0 !important;
          display: grid;
          place-items: center;
          border-radius: 20px !important;
        }
        .preparation-spinner {
          width: 30px;
          height: 30px;
          border: 3px solid rgba(20, 89, 166, .18);
          border-top-color: #1459a6;
          border-radius: 50%;
          animation: learnerPreparationSpin .72s linear infinite;
        }
        @keyframes learnerPreparationSpin { to { transform: rotate(360deg); } }
        .countdown-number {
          width: 110px;
          height: 110px;
          margin: 6px auto 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: #edf4fb;
          color: #1559a6;
          font-size: 64px;
          line-height: 1;
          font-weight: 950;
          animation:
            countdownPop
            .45s
            cubic-bezier(
              .22,
              .61,
              .36,
              1
            );
        }

        .countdown-label {
          margin: 0;
          color: #71869a;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: .02em;
        }

        @keyframes learnerPageIn {
          from {
            opacity: 0;
            transform:
              translateY(10px);
          }
          to {
            opacity: 1;
            transform:
              translateY(0);
          }
        }

        @keyframes liveItemIn {
          from {
            opacity: 0;
            transform:
              translateY(10px)
              scale(.985);
          }
          to {
            opacity: 1;
            transform:
              translateY(0)
              scale(1);
          }
        }

        @keyframes itemPop {
          from {
            opacity: 0;
            transform:
              translateY(8px)
              scale(.97);
          }
          to {
            opacity: 1;
            transform:
              translateY(0)
              scale(1);
          }
        }

        @keyframes friendlyPop {
          from {
            opacity: 0;
            transform:
              scale(.78)
              translateY(5px);
          }

          to {
            opacity: 1;
            transform:
              scale(1)
              translateY(0);
          }
        }

        @keyframes overlayFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes overlayIn {
          from {
            opacity: 0;
            transform:
              translateY(10px)
              scale(.985);
          }
          to {
            opacity: 1;
            transform:
              translateY(0)
              scale(1);
          }
        }

        @keyframes countdownPop {
          from {
            opacity: .2;
            transform:
              scale(.72);
          }
          to {
            opacity: 1;
            transform:
              scale(1);
          }
        }

        @media (max-width: 680px) {
          .page {
            padding: 12px 9px 24px;
          }

          .brand {
            min-height: 106px;
            padding: 10px 14px;
            border-width: 4px;
            border-radius: 16px;
          }

          .brand-logo {
            width: min(100%, 270px);
            max-height: 68px;
          }

          .card {
            min-height: 510px;
            margin-top: 12px;
            padding: 24px 14px 28px;
            border-radius: 16px;
          }

          .live {
            min-height: 430px;
          }

          .letter {
            min-width: 0;
            font-size: clamp(
              118px,
              34vw,
              170px
            );
          }

          .word {
            min-width: 0;
            font-size: clamp(
              58px,
              17vw,
              84px
            );
          }

          .passage {
            padding: 18px;
            font-size: 19px;
            line-height: 1.7;
          }

          .story-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .story-card {
            min-height: 170px;
            padding: 18px;
          }

          .story-card-title {
            font-size: 19px;
          }

          .question {
            min-height: 160px;
            padding: 20px;
            font-size: 24px;
          }

          .state {
            min-height: 380px;
          }

          .overlay {
            padding:
              12px;
          }

          .overlay-card {
            padding: 24px 18px;
            border-radius: 17px;
          }

          .countdown-number {
            width: 96px;
            height: 96px;
            font-size: 56px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration:
              .01ms !important;
            animation-iteration-count:
              1 !important;
            transition-duration:
              .01ms !important;
          }
        }
      `}</style>

      <main className="page">
        <div className="container">
          <section className="brand">
            <div className="brand-logo-wrap">
              <img src="/crl-app-logo.png" alt="CRL-App logo" className="brand-logo" />
            </div>
          </section>


          <div className="connection-toolbar">
            <button
              type="button"
              className="connection-button"
              onClick={openConnectionSettings}
            >
              <span className="connection-button-content">
                <span
                  className={`connection-pill-dot ${
                    networkSnapshot.online
                    ? networkSnapshot.quality === "Good"
                      ? "good"
                      : networkSnapshot.quality === "Poor"
                        ? "poor"
                        : ""
                    : "offline"
                  }`}
                />
                Connection Settings
              </span>
            </button>

            <button
              type="button"
              className="exit-app-button"
              onClick={() => setShowExitConfirm(true)}
            >
              Exit App
            </button>
          </div>

          <section className="card">
            {zeroScore &&
            (completed ||
              stage === "completed" ||
              stage === "terminated" ||
              ended) ? (
              <div
                className="state zero-score-state"
                key="zero-score"
                aria-live="polite"
              >
                <div className="friendly-icon">
                  🌟
                </div>

                <h2 className="state-title">
                  You did your best!
                </h2>
              </div>
            ) : completed ||
              stage === "completed" ? (
              <div
                className="state"
                key="completed"
                aria-live="polite"
              >
                <div
                  className="state-icon success"
                >
                  ✓
                </div>

                <h2 className="state-title">
                  Assessment Completed
                </h2>

                <p className="state-text">
                  Your assessment has been
                  recorded and saved.
                </p>
              </div>
            ) : ended ||
              stage === "ended" ||
              stage === "terminated" ? (
              <div
                className="state"
                key="ended"
                aria-live="polite"
              >
                <div
                  className="state-icon danger"
                >
                  !
                </div>

                <h2 className="state-title">
                  Assessment Ended
                </h2>

                <p className="state-text">
                  This assessment session has ended.
                </p>

                <p className="state-text">
                  Returning to the code entry...
                </p>
              </div>
            ) : stage ===
              "story_choice" ? (
              <div
                className="live"
                key="story-choice"
                aria-live="polite"
              >
                <div>
                  <div className="story-grid">
                    {STORIES.map(
                      (story) => (
                        <div
                          className="story-card"
                          key={story.id}
                          aria-label={
                            story.title
                          }
                        >
                          <div className="story-icon">
                            {
                              story.id ===
                              1
                                ? "🦜"
                                : "🌾"
                            }
                          </div>

                          <div
                            className="story-card-title"
                          >
                            {story.title}
                          </div>

                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            ) : stage ===
              "waiting" ||
              stage ===
                "connected" ? (
              <div
                className="state"
                key="waiting"
              >
                <div className="state-icon">
                  …
                </div>

                <h2 className="state-title">
                  Ready
                </h2>

                <p className="state-text">
                  Please wait.
                </p>
              </div>
            ) : (
              <div
                className="live"
                key={`${stage}|${liveContent}|${session?.story_title ?? ""}`}
                aria-live="polite"
              >
                <div>
                  {liveProgress && (
                    <div className="progress">
                      {liveProgress}
                    </div>
                  )}

                  {stage ===
                    "letter" && (
                    <div className="letter">
                      {liveContent ||
                        LETTERS[0]}
                    </div>
                  )}

                  {stage ===
                    "word" && (
                    <div className="word">
                      {liveContent ||
                        WORDS[0]}
                    </div>
                  )}

                  {stage ===
                    "passage" && (
                    <div>
                      <div
                        className="passage-title"
                      >
                        {session?.story_title ||
                          selectedStory.title}
                      </div>

                      <div className="passage">
                        {passageWords.join(
                          " "
                        )}
                      </div>
                    </div>
                  )}

                  {stage ===
                    "comprehension" && (
                    <div className="question">
                      {liveContent}
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div
                className="error"
                role="alert"
              >
                {error}
              </div>
            )}
          </section>
        </div>
      </main>

      {showExperienceOverlay &&
        completed &&
        !zeroScore && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="experience-rating-title"
        >
          <div className="overlay-card">
            <div className="overlay-icon">
              💬
            </div>

            <h2
              id="experience-rating-title"
              className="overlay-title"
            >
              How did the assessment feel?
            </h2>

            <p className="overlay-text">
              Choose the emoji that best matches your experience.
            </p>

            <div className="rating-grid">
              {[
                ["😟", 1],
                ["🙁", 2],
                ["😐", 3],
                ["🙂", 4],
                ["🤩", 5],
              ].map(
                ([emoji, rating]) => (
                  <button
                    key={rating}
                    type="button"
                    className={`rating-button${
                      selectedExperienceRating ===
                      rating
                        ? " selected"
                        : ""
                    }`}
                    onClick={() =>
                      submitExperienceRating(
                        rating
                      )
                    }
                    disabled={
                      savingExperienceRating
                    }
                    aria-label={`Rating ${rating} out of 5`}
                  >
                    <span className="rating-emoji">
                      {emoji}
                    </span>
                    <span className="rating-number">
                      {rating}
                    </span>
                  </button>
                )
              )}
            </div>

            {savingExperienceRating && (
              <div className="rating-saving">
                Saving...
              </div>
            )}
          </div>
        </div>
      )}

      {showPreparationOverlay && !completed && !ended && (
        <div className="overlay" role="status" aria-live="polite" aria-label="Preparing word assessment">
          <div className="overlay-card preparation-card">
            <div className="preparation-spinner" aria-hidden="true" />
          </div>
        </div>
      )}

      {showStartOverlay &&
        connected &&
        !completed &&
        !ended &&
        countdown !== null && (
        <div
          className="overlay"
          role="status"
          aria-live="assertive"
          aria-label="Assessment starting"
        >
          <div className="overlay-card">
            <div
              className="countdown-number"
              key={countdown}
            >
              {countdown}
            </div>

            <h2 className="overlay-title">
              Get Ready!
            </h2>

            <p className="countdown-label">
              Assessment starting
            </p>
          </div>
        </div>
      )}
    </>
  );
}
