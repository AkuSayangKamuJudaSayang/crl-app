"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

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
    finishing,
    setFinishing,
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

  const stage =
    session?.stage ||
    "waiting";

  const stageLabel =
    STAGE_LABELS[stage] ||
    "Waiting for Teacher";

  const ended =
    Boolean(
      session?.ended
    );

  const canFinish =
    joined &&
    connected &&
    !completed &&
    !ended &&
    !finishing &&
    stage !== "waiting";

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
            data
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
            data
          );

          const isConnected =
            Boolean(
              data.connected
            );

          setConnected(
            isConnected
          );

          if (
            data.stage ===
            "completed"
          ) {
            setCompleted(
              true
            );

            setConnected(
              false
            );
          }

          if (
            data.ended &&
            data.stage !==
              "completed"
          ) {
            setConnected(
              false
            );
          }

          setStatusMessage(
            isConnected
              ? "You are connected to your teacher."
              : "Connection lost. Trying to reconnect..."
          );
        } catch {
          setConnected(
            false
          );

          if (
            !completed
          ) {
            setStatusMessage(
              "Connection lost. Trying to reconnect..."
            );
          }
        }
      },
      [
        joined,
        codeInput,
        completed,
      ]
    );

  const sendHeartbeat =
    useCallback(
      async () => {
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

                body: JSON.stringify({
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
            setConnected(
              false
            );
            return;
          }

          setConnected(
            Boolean(
              data.connected
            )
          );

          setSession(
            (current) => ({
              ...(current ||
                {}),
              ...data,
            })
          );

          if (
            data.ended
          ) {
            setConnected(
              false
            );

            if (
              data.stage ===
              "completed"
            ) {
              setCompleted(
                true
              );
            }
          }
        } catch {
          setConnected(
            false
          );
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
        2500
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

  const finishAssessment =
    useCallback(
      async () => {
        if (!canFinish) {
          return;
        }

        const confirmed =
          window.confirm(
            "Are you sure you want to finish the assessment? The current assessment period will be marked as completed."
          );

        if (!confirmed) {
          return;
        }

        setFinishing(
          true
        );

        setError("");

        try {
          const code =
            normalizeCode(
              codeInput
            );

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
                    "learner_finish",

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
                "Unable to finish the assessment."
            );
          }

          setCompleted(
            true
          );

          setConnected(
            false
          );

          setSession(
            (current) => ({
              ...(current ||
                {}),
              stage:
                "completed",
              ended:
                true,
              connected:
                false,
            })
          );

          setStatusMessage(
            "Assessment completed successfully."
          );
        } catch (finishError) {
          setError(
            finishError?.message ||
              "Unable to finish the assessment."
          );
        } finally {
          setFinishing(
            false
          );
        }
      },
      [
        canFinish,
        codeInput,
      ]
    );

  const description =
    useMemo(() => {
      switch (stage) {
        case "waiting":
        case "connected":
          return "You are connected. Please wait for your teacher to begin the assessment.";

        case "letter":
          return "Follow your teacher's instructions for the letter-sound task.";

        case "word":
          return "Follow your teacher's instructions for the word task.";

        case "passage":
          return "Read the passage as directed by your teacher.";

        case "comprehension":
          return "Answer the comprehension questions as directed by your teacher.";

        case "completed":
          return "Your assessment has been completed and saved.";

        case "ended":
          return "The teacher session has ended. This does not automatically complete the assessment.";

        default:
          return "Please wait for instructions from your teacher.";
      }
    }, [stage]);

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
                CRL-App · Learner
              </div>

              <div className="brand-subtitle">
                Comprehensive Rapid Literacy
                Assessment
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
          color: #1d3048;
        }

        .page {
          min-height: 100vh;
          padding: 22px 18px 36px;
          display: flex;
          justify-content: center;
        }

        .container {
          width: 100%;
          max-width: 860px;
          animation:
            learnerPageIn
            0.25s ease;
        }

        .header {
          padding: 17px 20px;
          background: #ffffff;
          border: 1px solid #dbe5ef;
          border-radius: 12px;
          box-shadow:
            0 8px 20px
              rgba(
                33,
                61,
                90,
                0.05
              );
        }

        .header-title {
          margin: 0;
          color: #1559a6;
          font-size: 20px;
          font-weight: 900;
        }

        .header-subtitle {
          margin-top: 4px;
          color: #7b8ea2;
          font-size: 9px;
        }

        .code-box {
          margin-top: 13px;
          padding: 21px 18px;
          background: #1559a6;
          border-radius: 12px;
          text-align: center;
          color: #ffffff;
          box-shadow:
            0 9px 22px
              rgba(
                21,
                89,
                166,
                0.12
              );
        }

        .code-label {
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
          opacity: 0.82;
          text-transform: uppercase;
        }

        .code {
          margin-top: 5px;
          font-size: 32px;
          font-weight: 900;
          letter-spacing: 7px;
        }

        .connection {
          margin-top: 7px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 7px;
          font-size: 9px;
          font-weight: 800;
        }

        .connection-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #d28b24;
        }

        .connection-dot.connected {
          background: #27a467;
        }

        .card {
          margin-top: 13px;
          padding: 23px;
          background: #ffffff;
          border: 1px solid #dbe5ef;
          border-radius: 12px;
          box-shadow:
            0 10px 25px
              rgba(
                33,
                61,
                90,
                0.06
              );
        }

        .stage-label {
          color: #8495a7;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .stage-title {
          margin: 5px 0 0;
          color: #1b3049;
          font-size: 22px;
          font-weight: 900;
        }

        .description {
          margin: 8px 0 0;
          max-width: 700px;
          color: #75889c;
          font-size: 10px;
          line-height: 1.65;
        }

        .waiting,
        .completed,
        .ended {
          padding: 40px 18px;
          text-align: center;
          animation:
            contentIn
            0.2s ease;
        }

        .icon {
          width: 58px;
          height: 58px;
          margin: 0 auto 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: #edf4fb;
          color: #1559a6;
          font-size: 24px;
          font-weight: 900;
        }

        .icon.success {
          background: #eaf7ef;
          color: #19814f;
        }

        .icon.danger {
          background: #fff0f2;
          color: #c92335;
        }

        .content-title {
          margin: 0;
          color: #1b3049;
          font-size: 18px;
          font-weight: 900;
        }

        .content-text {
          max-width: 520px;
          margin: 8px auto 0;
          color: #74879b;
          font-size: 10px;
          line-height: 1.7;
        }

        .finish {
          width: 100%;
          min-height: 45px;
          margin-top: 18px;
          border: 0;
          border-radius: 8px;
          background: #c92335;
          color: #ffffff;
          cursor: pointer;
          font-size: 11px;
          font-weight: 900;
        }

        .finish:hover {
          background: #b62031;
        }

        .finish:disabled {
          cursor: wait;
          opacity: 0.55;
        }

        .error {
          margin-top: 13px;
          padding: 10px 11px;
          background: #fff4f5;
          border: 1px solid #efc8cd;
          border-radius: 8px;
          color: #b32031;
          font-size: 10px;
        }

        @keyframes contentIn {
          from {
            opacity: 0;
            transform: translateY(
              5px
            );
          }

          to {
            opacity: 1;
            transform: translateY(
              0
            );
          }
        }

        @media (max-width: 700px) {
          .page {
            padding: 15px 12px 30px;
          }

          .card {
            padding: 18px;
          }

          .code {
            font-size: 27px;
            letter-spacing: 5px;
          }
        }
      `}</style>

      <main className="page">
        <div className="container">
          <header className="header">
            <h1 className="header-title">
              CRL-App
            </h1>

            <div className="header-subtitle">
              Comprehensive Rapid Literacy
              Assessment
            </div>
          </header>

          <section className="code-box">
            <div className="code-label">
              Assessment Code
            </div>

            <div className="code">
              {normalizeCode(
                codeInput
              )}
            </div>

            <div className="connection">
              <span
                className={`connection-dot ${
                  connected
                    ? "connected"
                    : ""
                }`}
              />

              <span>
                {connected
                  ? "Learner connected"
                  : "Connection inactive"}
              </span>
            </div>
          </section>

          <section className="card">
            <div className="stage-label">
              Current Stage
            </div>

            <h2 className="stage-title">
              {stageLabel}
            </h2>

            <p className="description">
              {description}
            </p>

            {completed ||
            stage ===
              "completed" ? (
              <div className="completed">
                <div className="icon success">
                  ✓
                </div>

                <h3 className="content-title">
                  Assessment Completed
                </h3>

                <p className="content-text">
                  The current assessment period has
                  been completed and saved to the
                  database.
                </p>
              </div>
            ) : stage ===
                "ended" ||
              ended ? (
              <div className="ended">
                <div className="icon danger">
                  !
                </div>

                <h3 className="content-title">
                  Session Ended
                </h3>

                <p className="content-text">
                  The teacher ended the controller
                  session. This does not automatically
                  mark the assessment as completed.
                </p>
              </div>
            ) : stage ===
              "waiting" ? (
              <div className="waiting">
                <div className="icon">
                  …
                </div>

                <h3 className="content-title">
                  Waiting for Teacher
                </h3>

                <p className="content-text">
                  {statusMessage ||
                    "You are connected and waiting for your teacher to begin."}
                </p>
              </div>
            ) : (
              <>
                <div
                  className="waiting"
                  style={{
                    paddingBottom:
                      18,
                  }}
                >
                  <div className="icon">
                    ✓
                  </div>

                  <h3 className="content-title">
                    {stageLabel}
                  </h3>

                  <p className="content-text">
                    Please follow the instructions
                    provided by your teacher.
                  </p>
                </div>

                {canFinish && (
                  <button
                    type="button"
                    className="finish"
                    disabled={
                      finishing
                    }
                    onClick={
                      finishAssessment
                    }
                  >
                    {finishing
                      ? "Finishing Assessment..."
                      : "Finish Assessment"}
                  </button>
                )}
              </>
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
    </>
  );
}