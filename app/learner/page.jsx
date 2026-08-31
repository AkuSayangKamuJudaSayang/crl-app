"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

  const statusRequestRef =
    useRef(false);

  const heartbeatRequestRef =
    useRef(false);

  const resetTimerRef =
    useRef(null);

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
      : serverStage;

  const stageLabel =
    STAGE_LABELS[stage] ||
    "Waiting for Teacher";

  const ended =
    Boolean(
      session?.ended
    );

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

          setSession(
            mergeLearnerSession(
              data,
              null
            )
          );

          setJoined(
            true
          );

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

          setSession(
            (current) =>
              mergeLearnerSession(
                data,
                current
              )
          );

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
          }

          if (
            data.ended ||
            data.stage ===
              "completed"
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

            setCompleted(
              data.stage ===
                "completed"
            );

            setConnected(
              false
            );

            setStatusMessage(
              data.stage ===
              "completed"
                ? "Assessment completed."
                : "Session ended."
            );

            if (
              !resetTimerRef.current
            ) {
              resetTimerRef.current =
                window.setTimeout(
                  resetToCodeEntry,
                  data.stage ===
                  "completed"
                    ? 2600
                    : 700
                );
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

          setSession(
            (current) =>
              mergeLearnerSession(
                data,
                current
              )
          );

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
      ]
    );



  useEffect(() => {
    if (!joined) {
      return undefined;
    }

    refreshStatus();

    const statusTimer =
      window.setInterval(
        refreshStatus,
        600
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
      return QUESTIONS.indexOf(
        String(liveContent)
      );
    }

    return -1;
  }, [
    stage,
    liveContent,
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
          ? `Question ${liveItemIndex + 1} of ${QUESTIONS.length}`
          : "";

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
                  QUESTIONS[0]?.text ||
                  ""
                )
              : ""
    );

  const description =
    useMemo(() => {
      switch (stage) {
        case "waiting":
        case "connected":
          return "The assessment has not started yet. Please wait for your teacher.";

        case "letter":
          return "Follow your teacher's instructions. The current letter is shown here in real time.";

        case "word":
          return "Follow your teacher's instructions. The current word is shown here in real time.";

        case "passage":
          return "Read the passage aloud as directed by your teacher.";

        case "comprehension":
          return "Listen to your teacher and answer the question aloud. The next question appears automatically after your teacher records the response.";

        case "terminated":
          return "The CRLA stopping rule was reached. Your assessment has been recorded and completed.";

        case "completed":
          return "Your assessment has been completed and saved automatically.";

        case "ended":
          return "The teacher session has ended.";

        default:
          return "Please wait for instructions from your teacher.";
      }
    }, [stage]);

  useEffect(() => {
    return () => {
      if (
        resetTimerRef.current
      ) {
        window.clearTimeout(
          resetTimerRef.current
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
            padding: 20px;
            background: #1559a6;
            color: #ffffff;
            border-radius: 12px;
            text-align: center;
            box-shadow:
              0 10px 24px
                rgba(
                  21,
                  89,
                  166,
                  0.14
                );
          }

          .brand-title {
            font-size: 23px;
            font-weight: 900;
          }

          .brand-subtitle {
            margin-top: 5px;
            font-size: 10px;
            opacity: 0.85;
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
              <div className="brand-title">
                CRL-App
              </div>

            </section>

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
              135deg,
              #f5f8ff 0%,
              #edf7fa 100%
            );
          color: #18324f;
        }

        .page {
          min-height: 100vh;
          padding: 24px 18px 38px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }

        .learner-shell {
          width: 100%;
          max-width: 920px;
          animation:
            learnerPageIn
            0.3s
            ease-out;
        }

        .learner-brand {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 92px;
          padding: 18px 22px;
          background: #ffffff;
          border: 1px solid #dbe5ef;
          border-radius: 18px;
          box-shadow:
            0 12px 30px
              rgba(
                30,
                67,
                105,
                0.07
              );
        }

        .learner-brand-title {
          margin: 0;
          color: #1559a6;
          font-size: clamp(
            30px,
            5vw,
            48px
          );
          line-height: 1;
          font-weight: 950;
          letter-spacing: -0.025em;
          text-align: center;
        }

        .assessment-card {
          margin-top: 16px;
          min-height: 560px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 42px 28px 48px;
          background: #ffffff;
          border: 1px solid #dbe5ef;
          border-radius: 20px;
          box-shadow:
            0 16px 36px
              rgba(
                30,
                67,
                105,
                0.08
              );
          overflow: hidden;
        }

        .progress {
          margin-bottom: 22px;
          color: #71869d;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.03em;
          text-align: center;
        }

        .live-area {
          width: 100%;
          min-height: 320px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 12px 12px 24px;
          text-align: center;
          animation:
            liveItemIn
            0.22s
            cubic-bezier(
              0.22,
              0.61,
              0.36,
              1
            );
        }

        .live-item {
          color: #1559a6;
          font-weight: 950;
          line-height: 1.05;
          text-align: center;
          word-break: break-word;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .live-item.letter {
          min-height: 220px;
          font-size: clamp(
            110px,
            19vw,
            190px
          );
        }

        .live-item.word {
          min-height: 170px;
          font-size: clamp(
            56px,
            9vw,
            92px
          );
        }

        .live-item.question {
          min-height: 180px;
          max-width: 820px;
          color: #18324f;
          font-size: clamp(
            28px,
            4vw,
            44px
          );
          line-height: 1.25;
        }

        .live-item.passage {
          min-height: 220px;
          max-width: 800px;
          color: #18324f;
          font-size: clamp(
            24px,
            3.3vw,
            36px
          );
          line-height: 1.6;
          font-weight: 700;
        }

        .waiting-state,
        .completed-state,
        .ended-state {
          width: 100%;
          min-height: 320px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          animation:
            liveItemIn
            0.22s
            ease-out;
        }

        .state-title {
          margin: 0;
          color: #18324f;
          font-size: clamp(
            26px,
            4vw,
            38px
          );
          font-weight: 900;
        }

        .state-text {
          max-width: 640px;
          margin: 12px auto 0;
          color: #71869d;
          font-size: 16px;
          line-height: 1.7;
        }

        .zero-score {
          max-width: 650px;
          margin: 12px 0 0;
          padding: 18px 20px;
          border-radius: 14px;
          background: #f4f8fd;
          color: #315271;
          font-size: 18px;
          line-height: 1.65;
          font-weight: 700;
        }

        .reset-text {
          margin-top: 14px;
          color: #8193a6;
          font-size: 14px;
          font-weight: 700;
        }

        .error {
          margin-top: 10px;
          color: #b32031;
          font-size: 13px;
          text-align: center;
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
              translateY(8px)
              scale(0.985);
          }
          to {
            opacity: 1;
            transform:
              translateY(0)
              scale(1);
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

        @media (max-width: 640px) {
          .page {
            padding: 14px 10px 24px;
          }

          .learner-brand {
            min-height: 74px;
            border-radius: 14px;
          }

          .assessment-card {
            min-height: 460px;
            padding: 24px 14px 30px;
            border-radius: 14px;
          }

          .live-area {
            min-height: 280px;
          }

          .live-item.letter {
            min-height: 190px;
          }

          .state-text,
          .zero-score {
            font-size: 15px;
          }
        }
      `}</style>

      <main className="page">
        <div className="learner-shell">
          <section className="learner-brand">
            <h1 className="learner-brand-title">
              CRL-App
            </h1>
          </section>

          <section className="assessment-card">
            {completed ||
            stage === "completed" ? (
              <div
                className="completed-state"
                key="completed"
                aria-live="polite"
              >
                <h2 className="state-title">
                  {zeroScore
                    ? "You did your best!"
                    : "Assessment Completed"}
                </h2>

                {zeroScore ? (
                  <p className="zero-score">
                    Keep practicing. Next time,
                    listen carefully to your
                    teacher&apos;s instructions.
                    You can improve with practice.
                  </p>
                ) : (
                  <p className="state-text">
                    Your assessment has been
                    completed.
                  </p>
                )}

                <p className="reset-text">
                  Returning to the code entry...
                </p>
              </div>
            ) : ended ||
              stage === "ended" ||
              stage === "terminated" ? (
              <div
                className="ended-state"
                key="ended"
                aria-live="polite"
              >
                <h2 className="state-title">
                  Assessment Ended
                </h2>

                <p className="state-text">
                  This assessment session has ended.
                </p>

                <p className="reset-text">
                  Returning to the code entry...
                </p>
              </div>
            ) : stage === "letter" ||
              stage === "word" ||
              stage === "passage" ||
              stage === "comprehension" ? (
              <div
                className="live-area"
                key={liveContentKey}
                aria-live="polite"
              >
                {liveProgress && (
                  <div className="progress">
                    {liveProgress}
                  </div>
                )}

                {stage === "letter" ? (
                  <div className="live-item letter">
                    {displayLiveContent}
                  </div>
                ) : stage === "word" ? (
                  <div className="live-item word">
                    {displayLiveContent}
                  </div>
                ) : stage === "passage" ? (
                  <div className="live-item passage">
                    {displayLiveContent}
                  </div>
                ) : (
                  <div className="live-item question">
                    {displayLiveContent}
                  </div>
                )}
              </div>
            ) : connected ? (
              <div
                className="live-area"
                key="connected-fallback"
                aria-live="polite"
              >
                <div className="live-item letter">
                  {LETTERS[0]}
                </div>
              </div>
            ) : (
              <div
                className="waiting-state"
                key="waiting"
                aria-live="polite"
              >
                <h2 className="state-title">
                  Waiting for assessment
                </h2>

                <p className="state-text">
                  Please wait for your teacher.
                </p>
              </div>
            )}

            {error && !completed && (
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
    </>
  );
}
