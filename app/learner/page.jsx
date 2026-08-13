"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

export default function LearnerPage() {
  const [
    sessionCodeInput,
    setSessionCodeInput,
  ] = useState("");

  const [
    sessionCode,
    setSessionCode,
  ] = useState("");

  const [
    joined,
    setJoined,
  ] = useState(false);

  const [
    stage,
    setStage,
  ] = useState("waiting");

  const [
    content,
    setContent,
  ] = useState("");

  const [
    storyTitle,
    setStoryTitle,
  ] = useState("");

  const [
    joinError,
    setJoinError,
  ] = useState("");

  const [
    connectionStatus,
    setConnectionStatus,
  ] = useState(
    "Connected"
  );

  const [
    isJoining,
    setIsJoining,
  ] = useState(false);

  const pollRef =
    useRef(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearInterval(
          pollRef.current
        );

        pollRef.current = null;
      }
    };
  }, []);

  async function apiCall(body) {
    let response;

    try {
      response =
        await fetch(
          "/api/assessment",
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type":
                "application/json",
            },
            cache: "no-store",
            body: JSON.stringify(
              body
            ),
          }
        );
    } catch {
      throw new Error(
        "Network error. Please try again."
      );
    }

    let data;

    try {
      data =
        await response.json();
    } catch {
      throw new Error(
        "Invalid response from server."
      );
    }

    if (
      !response.ok &&
      !data?.status
    ) {
      throw new Error(
        data?.error ||
          data?.message ||
          "Request failed."
      );
    }

    return data;
  }

  function updateDisplay(
    session
  ) {
    if (!session) {
      return;
    }

    const nextStage =
      session.stage ||
      "waiting";

    const text =
      session.current_content ??
      session.currentContent ??
      "";

    const title =
      session.story_title ??
      session.storyTitle ??
      "";

    setStage(nextStage);
    setContent(text);
    setStoryTitle(title);

    if (session.ended) {
      setConnectionStatus(
        "Session ended."
      );

      if (pollRef.current) {
        window.clearInterval(
          pollRef.current
        );

        pollRef.current =
          null;
      }

      return;
    }

    setConnectionStatus(
      "Connected ✅"
    );
  }

  async function pollSession() {
    if (!sessionCode) {
      return;
    }

    try {
      const data =
        await apiCall({
          action: "host_get",
          code: sessionCode,
        });

      if (
        data.status !==
        "ok"
      ) {
        setConnectionStatus(
          data.message ||
            "Disconnected."
        );

        return;
      }

      if (!data.session) {
        return;
      }

      updateDisplay(
        data.session
      );

      if (
        data.session.ended
      ) {
        setStage("complete");
      }
    } catch {
      setConnectionStatus(
        "Connection interrupted. Retrying..."
      );
    }
  }

  function startPolling() {
    if (pollRef.current) {
      window.clearInterval(
        pollRef.current
      );
    }

    pollRef.current =
      window.setInterval(
        pollSession,
        1500
      );
  }

  async function joinSession() {
    const code =
      sessionCodeInput
        .trim()
        .toUpperCase();

    if (
      !code ||
      code.length !== 6
    ) {
      setJoinError(
        "Please enter a valid 6-character code."
      );

      return;
    }

    setJoinError("");
    setIsJoining(true);

    try {
      const data =
        await apiCall({
          action: "host_join",
          code,
        });

      if (
        data.status !== "ok"
      ) {
        setJoinError(
          data.message ||
            "Invalid, expired, or already used code."
        );

        return;
      }

      setSessionCode(code);
      setJoined(true);

      updateDisplay(
        data.session
      );

      setConnectionStatus(
        "Connected ✅"
      );

      startPolling();
    } catch (error) {
      setJoinError(
        error instanceof Error
          ? error.message
          : "Unable to join session."
      );
    } finally {
      setIsJoining(false);
    }
  }

  function handleKeyDown(
    event
  ) {
    if (
      event.key ===
      "Enter"
    ) {
      joinSession();
    }
  }

  const isWaiting =
    stage === "waiting" ||
    stage === "linked";

  const isPassage =
    stage === "part2";

  const stageLabel =
    (() => {
      switch (stage) {
        case "waiting":
        case "linked":
          return "Session Linked";

        case "task1":
          return "Part 1 Task 1: Letter Sounds";

        case "task2":
          return "Part 1 Task 2: Word Recognition";

        case "part2":
          return `Part 2: ${
            storyTitle ||
            "Passage Reading"
          }`;

        case "complete":
          return "Assessment Concluded";

        default:
          return "Waiting for Teacher...";
      }
    })();

  const displayText =
    (() => {
      switch (stage) {
        case "waiting":
        case "linked":
          return "Waiting for teacher to begin...";

        case "task1":
        case "task2":
        case "part2":
          return (
            content || "Ready"
          );

        case "complete":
          return "Thank You! 🎉";

        default:
          return "Connecting...";
      }
    })();

  return (
    <>
      <style jsx global>{`
        :root {
          --primary: #4338ca;
          --primary-light: #6366f1;
          --bg: #f8fafc;
          --surface: #ffffff;
          --text: #1e293b;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          font-family: "Outfit", sans-serif;
        }

        html,
        body {
          min-height: 100%;
        }

        body {
          background:
            radial-gradient(
              circle at 15% 20%,
              rgba(
                99,
                102,
                241,
                0.1
              ),
              transparent 45%
            ),
            radial-gradient(
              circle at 85% 15%,
              rgba(
                16,
                185,
                129,
                0.08
              ),
              transparent 40%
            ),
            linear-gradient(
              160deg,
              #f8fafc 0%,
              #eef2ff 55%,
              #f8fafc 100%
            );
          color: var(--text);
          padding: 20px;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        .learner-header {
          background: linear-gradient(
            120deg,
            var(--primary) 0%,
            var(--primary-light) 100%
          );
          color: white;
          padding: 16px;
          border-radius: 12px;
          margin-bottom: 20px;
          text-align: center;
          width: 100%;
          max-width: 600px;
          box-shadow:
            0 8px
              20px -6px
              rgba(
                67,
                56,
                202,
                0.45
              );
        }

        .learner-header h2 {
          font-weight: 700;
          letter-spacing: 0.2px;
        }

        .container {
          width: 100%;
          max-width: 600px;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .join-box {
          background: white;
          border-radius: 16px;
          padding: 30px;
          box-shadow:
            0 20px
              45px -20px
              rgba(
                15,
                23,
                42,
                0.3
              );
          text-align: center;
          margin-bottom: 20px;
        }

        .join-box h3 {
          font-size: 1.4rem;
          margin-bottom: 10px;
        }

        .join-box p {
          color: #64748b;
          margin-bottom: 20px;
        }

        .join-box input {
          width: 100%;
          padding: 14px;
          font-size: 1.3rem;
          text-align: center;
          letter-spacing: 5px;
          border: 2px solid #dbe1ea;
          border-radius: 12px;
          outline: none;
          margin-bottom: 15px;
          text-transform: uppercase;
        }

        .join-box input:focus {
          border-color: var(
            --primary-light
          );
          box-shadow:
            0 0 0 3px
              rgba(
                99,
                102,
                241,
                0.15
              );
        }

        .join-box .btn {
          background: var(--primary);
          color: white;
          border: none;
          padding: 14px 30px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          width: 100%;
          transition: 0.2s;
        }

        .join-box .btn:hover:not(
            :disabled
          ) {
          background: var(
            --primary-light
          );
          transform: translateY(
            -2px
          );
        }

        .join-box .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .display-screen {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .display-box {
          flex: 1;
          background: #0f172a;
          color: #ffffff;
          border-radius: 16px;
          font-size: 5rem;
          font-weight: 800;
          padding: 40px;
          text-align: center;
          word-break: break-word;
          box-shadow:
            0 20px
              45px -20px
              rgba(
                15,
                23,
                42,
                0.5
              );
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 200px;
          transition: all 0.3s ease;
          white-space: pre-wrap;
        }

        .display-box.waiting {
          font-size: 2rem;
          color: #94a3b8;
          font-weight: 500;
          gap: 12px;
        }

        .display-box.passage {
          font-size: 2.2rem;
          font-weight: 400;
          text-align: left;
          align-items: flex-start;
          overflow-y: auto;
          white-space: pre-wrap;
        }

        .stage-indicator {
          font-size: 1.1rem;
          font-weight: 600;
          color: #64748b;
          margin-bottom: 15px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          text-align: center;
        }

        .status-msg {
          font-size: 1rem;
          color: #64748b;
          margin-top: 10px;
          text-align: center;
        }

        .error-msg {
          color: #ef4444;
        }

        .spinner {
          display: inline-block;
          width: 40px;
          height: 40px;
          border: 4px solid
            rgba(
              255,
              255,
              255,
              0.1
            );
          border-top: 4px solid
            var(
              --primary-light
            );
          border-radius: 50%;
          animation: spin 1s
            linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(
              360deg
            );
          }
        }

        @media (max-width: 480px) {
          .display-box {
            font-size: 3rem;
            padding: 20px;
          }

          .display-box.passage {
            font-size: 1.6rem;
          }
        }
      `}</style>

      <header className="learner-header">
        <h2>
          CRL-App · Learner
        </h2>
      </header>

      <div className="container">
        {!joined ? (
          <section className="join-box">
            <h3>
              Join Assessment
            </h3>

            <p>
              Enter the 6-character code
              provided by your teacher.
            </p>

            <input
              type="text"
              value={
                sessionCodeInput
              }
              onChange={(
                event
              ) =>
                setSessionCodeInput(
                  event.target.value
                    .toUpperCase()
                    .replace(
                      /[^A-Z0-9]/g,
                      ""
                    )
                    .slice(
                      0,
                      6
                    )
                )
              }
              onKeyDown={
                handleKeyDown
              }
              placeholder="e.g. FW2CST"
              maxLength={6}
              autoComplete="off"
              inputMode="text"
              aria-label="Assessment session code"
            />

            <button
              type="button"
              className="btn"
              onClick={
                joinSession
              }
              disabled={
                isJoining
              }
            >
              {isJoining
                ? "Connecting..."
                : "Join Session"}
            </button>

            {joinError ? (
              <div className="status-msg error-msg">
                {joinError}
              </div>
            ) : null}
          </section>
        ) : (
          <div className="display-screen">
            <div className="stage-indicator">
              {stageLabel}
            </div>

            <div
              className={`display-box ${
                isWaiting
                  ? "waiting"
                  : isPassage
                  ? "passage"
                  : ""
              }`}
            >
              {isWaiting ? (
                <>
                  <div className="spinner" />
                  <div>
                    {displayText}
                  </div>
                </>
              ) : (
                displayText
              )}
            </div>

            <div className="status-msg">
              {
                connectionStatus
              }
            </div>
          </div>
        )}
      </div>
    </>
  );
}
