"use client";

import {
  useCallback,
  useEffect,
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

const STORY_TITLE =
  "Para the Parrot";

const STORY_TEXT =
  "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.";

export default function TeacherAssessmentPage() {
  const [
    sessionCode,
    setSessionCode,
  ] = useState("");

  const [
    learnerId,
    setLearnerId,
  ] = useState("");

  const [
    period,
    setPeriod,
  ] = useState("");

  const [
    currentStage,
    setCurrentStage,
  ] = useState("waiting");

  const [
    currentIndex,
    setCurrentIndex,
  ] = useState(0);

  const [
    items,
    setItems,
  ] = useState([]);

  const [
    sessionId,
    setSessionId,
  ] = useState(null);

  const [
    isComplete,
    setIsComplete,
  ] = useState(false);

  const [
    isProcessing,
    setIsProcessing,
  ] = useState(false);

  const [
    toast,
    setToast,
  ] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  const pollRef =
    useRef(null);

  const toastTimerRef =
    useRef(null);

  const mountedRef =
    useRef(true);

  useEffect(() => {
    mountedRef.current =
      true;

    return () => {
      mountedRef.current =
        false;

      if (pollRef.current) {
        window.clearInterval(
          pollRef.current
        );

        pollRef.current = null;
      }

      if (
        toastTimerRef.current
      ) {
        window.clearTimeout(
          toastTimerRef.current
        );

        toastTimerRef.current =
          null;
      }
    };
  }, []);

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

    setSessionCode(
      (
        params.get("code") ||
        ""
      )
        .trim()
        .toUpperCase()
    );

    setLearnerId(
      params.get(
        "learner_id"
      ) || ""
    );

    setPeriod(
      params.get("period") ||
        ""
    );
  }, []);

  function showToast(
    message,
    type = "success"
  ) {
    setToast({
      visible: true,
      message,
      type,
    });

    if (
      toastTimerRef.current
    ) {
      window.clearTimeout(
        toastTimerRef.current
      );
    }

    toastTimerRef.current =
      window.setTimeout(
        () => {
          if (
            mountedRef.current
          ) {
            setToast(
              (
                current
              ) => ({
                ...current,
                visible:
                  false,
              })
            );
          }
        },
        3000
      );
  }

  async function apiCall(
    body
  ) {
    const response =
      await fetch(
        "/api/assessment",
        {
          method: "POST",
          credentials:
            "include",
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

    let data;

    try {
      data =
        await response.json();
    } catch {
      throw new Error(
        "Invalid server response."
      );
    }

    if (!response.ok) {
      throw new Error(
        data?.error ||
          data?.message ||
          "Request failed."
      );
    }

    return data;
  }

  const updateHostSession =
    useCallback(
      async (
        stage,
        content,
        storyTitle = ""
      ) => {
        if (!sessionCode) {
          return;
        }

        try {
          await apiCall({
            action:
              "host_update",
            code:
              sessionCode,
            stage,
            currentContent:
              content,
            storyTitle,
          });
        } catch (error) {
          console.error(
            "Unable to update host session:",
            error
          );

          showToast(
            error instanceof Error
              ? error.message
              : "Unable to sync assessment.",
            "error"
          );
        }
      },
      [sessionCode]
    );

  const initializeFromSession =
    useCallback(
      async (session) => {
        if (!session) {
          return;
        }

        let nextStage =
          session.stage ||
          "waiting";

        if (
          nextStage ===
          "waiting"
        ) {
          setCurrentStage(
            "waiting"
          );

          setItems([]);

          setCurrentIndex(0);

          return;
        }

        if (
          nextStage ===
          "linked"
        ) {
          nextStage =
            "task1";

          setCurrentStage(
            "task1"
          );

          setItems(LETTERS);

          setCurrentIndex(0);

          await updateHostSession(
            "task1",
            LETTERS[0]
          );

          showToast(
            "Learner connected!",
            "success"
          );

          return;
        }

        if (
          nextStage ===
          "task1"
        ) {
          setCurrentStage(
            "task1"
          );

          setItems(LETTERS);

          return;
        }

        if (
          nextStage ===
          "task2"
        ) {
          setCurrentStage(
            "task2"
          );

          setItems(WORDS);

          return;
        }

        if (
          nextStage ===
          "part2"
        ) {
          setCurrentStage(
            "part2"
          );

          setItems([
            STORY_TEXT,
          ]);

          return;
        }

        setIsComplete(true);

        setCurrentStage(
          "complete"
        );
      },
      [updateHostSession]
    );

  useEffect(() => {
    if (!sessionCode) {
      return;
    }

    let cancelled = false;

    async function startAssessment() {
      try {
        const response =
          await apiCall({
            action:
              "host_get",
            code:
              sessionCode,
          });

        if (cancelled) {
          return;
        }

        if (
          response.status !==
            "ok" ||
          !response.session
        ) {
          showToast(
            "Invalid or expired session.",
            "error"
          );

          return;
        }

        if (
          response.session
            .ended
        ) {
          setCurrentStage(
            "complete"
          );

          setIsComplete(true);

          return;
        }

        await initializeFromSession(
          response.session
        );

        if (
          response.session
            .stage ===
          "waiting"
        ) {
          if (
            pollRef.current
          ) {
            window.clearInterval(
              pollRef.current
            );
          }

          pollRef.current =
            window.setInterval(
              async () => {
                if (
                  cancelled
                ) {
                  return;
                }

                try {
                  const pollResponse =
                    await apiCall(
                      {
                        action:
                          "host_get",
                        code:
                          sessionCode,
                      }
                    );

                  if (
                    pollResponse.status ===
                      "ok" &&
                    pollResponse.session
                      ?.stage ===
                      "linked"
                  ) {
                    if (
                      pollRef.current
                    ) {
                      window.clearInterval(
                        pollRef.current
                      );

                      pollRef.current =
                        null;
                    }

                    if (
                      mountedRef.current
                    ) {
                      setCurrentStage(
                        "task1"
                      );

                      setItems(
                        LETTERS
                      );

                      setCurrentIndex(
                        0
                      );

                      showToast(
                        "Learner connected!",
                        "success"
                      );
                    }

                    await updateHostSession(
                      "task1",
                      LETTERS[0]
                    );
                  }
                } catch {
                  // Keep polling through temporary packet loss.
                }
              },
              1500
            );
        }
      } catch (error) {
        if (!cancelled) {
          showToast(
            error instanceof
              Error
              ? error.message
              : "Connection failed.",
            "error"
          );
        }
      }
    }

    startAssessment();

    return () => {
      cancelled = true;

      if (
        pollRef.current
      ) {
        window.clearInterval(
          pollRef.current
        );

        pollRef.current =
          null;
      }
    };
  }, [
    sessionCode,
    initializeFromSession,
    updateHostSession,
  ]);

  async function createAssessmentSession() {
    if (
      !learnerId ||
      !period
    ) {
      throw new Error(
        "Learner and assessment period are required."
      );
    }

    const response =
      await apiCall({
        action:
          "start_session",
        learner_id:
          Number(
            learnerId
          ),
        period:
          period.length === 4
            ? period.charAt(
                0
              ).toUpperCase() +
              period
                .slice(1)
                .toLowerCase()
            : period,
      });

    if (
      !response.session_id
    ) {
      throw new Error(
        "Failed to create assessment session."
      );
    }

    setSessionId(
      Number(
        response.session_id
      )
    );

    return Number(
      response.session_id
    );
  }

  async function recordResponse(
    isCorrect
  ) {
    if (
      isComplete ||
      isProcessing ||
      currentStage ===
        "waiting" ||
      currentStage ===
        "part2" ||
      currentStage ===
        "complete"
    ) {
      return;
    }

    const currentItem =
      items[currentIndex];

    if (!currentItem) {
      return;
    }

    setIsProcessing(true);

    try {
      let activeSessionId =
        sessionId;

      if (
        !activeSessionId
      ) {
        activeSessionId =
          await createAssessmentSession();
      }

      const action =
        currentStage ===
        "task1"
          ? "record_letter"
          : "record_word";

      const response =
        await apiCall({
          action,
          session_id:
            activeSessionId,
          index:
            currentIndex,
          letter:
            currentStage ===
            "task1"
              ? currentItem
              : undefined,
          word:
            currentStage ===
            "task2"
              ? currentItem
              : undefined,
          is_correct:
            isCorrect,
        });

      if (
        response.status ===
        "terminated"
      ) {
        setIsComplete(true);

        setCurrentStage(
          "complete"
        );

        await apiCall({
          action:
            "host_update",
          code:
            sessionCode,
          stage:
            "complete",
          currentContent:
            "Thank You! 🎉",
          storyTitle: "",
          ended: true,
        });

        showToast(
          `Assessment terminated: ${response.classification}`,
          "error"
        );

        return;
      }

      const nextIndex =
        currentIndex + 1;

      if (
        currentStage ===
        "task1"
      ) {
        if (
          nextIndex >=
          LETTERS.length
        ) {
          setCurrentStage(
            "task2"
          );

          setItems(WORDS);

          setCurrentIndex(
            0
          );

          await updateHostSession(
            "task2",
            WORDS[0]
          );

          showToast(
            "Task 1 complete! Moving to words.",
            "success"
          );
        } else {
          setCurrentIndex(
            nextIndex
          );

          await updateHostSession(
            "task1",
            LETTERS[nextIndex]
          );
        }

        return;
      }

      if (
        currentStage ===
        "task2"
      ) {
        if (
          nextIndex >=
          WORDS.length
        ) {
          setCurrentStage(
            "part2"
          );

          setItems([
            STORY_TEXT,
          ]);

          setCurrentIndex(
            0
          );

          await updateHostSession(
            "part2",
            STORY_TEXT,
            STORY_TITLE
          );

          showToast(
            "Task 2 complete! Now reading passage.",
            "success"
          );
        } else {
          setCurrentIndex(
            nextIndex
          );

          await updateHostSession(
            "task2",
            WORDS[nextIndex]
          );
        }
      }
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Error recording response.",
        "error"
      );
    } finally {
      if (
        mountedRef.current
      ) {
        setIsProcessing(
          false
        );
      }
    }
  }

  async function finishPassage() {
    if (
      isComplete ||
      currentStage !==
        "part2" ||
      isProcessing
    ) {
      return;
    }

    setIsProcessing(true);

    try {
      let activeSessionId =
        sessionId;

      if (
        !activeSessionId
      ) {
        activeSessionId =
          await createAssessmentSession();
      }

      const response =
        await apiCall({
          action:
            "finalize_session",
          session_id:
            activeSessionId,
          timer_seconds: 0,
        });

      if (
        response.status !==
        "finalized"
      ) {
        throw new Error(
          "Assessment could not be finalized."
        );
      }

      setIsComplete(true);

      setCurrentStage(
        "complete"
      );

      await apiCall({
        action:
          "host_update",
        code:
          sessionCode,
        stage:
          "complete",
        currentContent:
          "Thank You! 🎉",
        storyTitle: "",
        ended: true,
      });

      showToast(
        `Assessment finalized: ${response.classification}`,
        "success"
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Error finalizing assessment.",
        "error"
      );
    } finally {
      if (
        mountedRef.current
      ) {
        setIsProcessing(
          false
        );
      }
    }
  }

  async function endHostSession() {
    if (!sessionCode) {
      return;
    }

    try {
      await apiCall({
        action:
          "host_end",
        code:
          sessionCode,
      });
    } catch (error) {
      console.error(
        "Unable to end host session:",
        error
      );
    }

    setIsComplete(true);

    setCurrentStage(
      "complete"
    );
  }

  const currentItem =
    currentStage === "part2"
      ? STORY_TEXT
      : items[currentIndex] ||
        "—";

  const stageLabel =
    currentStage ===
    "waiting"
      ? "Waiting for Learner..."
      : currentStage ===
        "task1"
      ? "Part 1 Task 1: Letter Sounds"
      : currentStage ===
        "task2"
      ? "Part 1 Task 2: Word Recognition"
      : currentStage ===
        "part2"
      ? "Part 2: Passage Reading"
      : "Assessment Complete";

  const progressText =
    currentStage ===
    "waiting"
      ? `Provide this code to the learner: ${sessionCode}`
      : currentStage ===
        "task1"
      ? `Letter ${
          currentIndex + 1
        } of ${LETTERS.length}`
      : currentStage ===
        "task2"
      ? `Word ${
          currentIndex + 1
        } of ${WORDS.length}`
      : currentStage ===
        "part2"
      ? "Read the passage aloud"
      : "";

  return (
    <>
      <style jsx global>{`
        :root {
          --primary: #6c5ce7;
          --primary-light: #a29bfe;
          --success: #00b894;
          --danger: #e17055;
          --bg: #0a0a1a;
          --surface: rgba(
            255,
            255,
            255,
            0.06
          );
          --text: #fff;
          --text-secondary: rgba(
            255,
            255,
            255,
            0.7
          );
          --border: rgba(
            255,
            255,
            255,
            0.08
          );
        }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        html,
        body {
          min-height: 100%;
        }

        body {
          font-family: "Outfit",
            sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
        }

        button {
          font: inherit;
        }

        .container {
          max-width: 700px;
          width: 100%;
        }

        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--surface);
          border: 1px solid
            var(--border);
          border-radius: 16px;
          padding: 16px 20px;
          margin-bottom: 20px;
          backdrop-filter: blur(
            10px
          );
          -webkit-backdrop-filter: blur(
            10px
          );
        }

        header h1 {
          font-size: 1.3rem;
          font-weight: 700;
        }

        .code-box {
          background: rgba(
            108,
            92,
            231,
            0.2
          );
          border: 1px solid
            var(--primary);
          border-radius: 10px;
          padding: 6px 16px;
          font-size: 1.2rem;
          font-weight: 700;
          letter-spacing: 2px;
          color: var(
            --primary-light
          );
        }

        .assessment-area {
          background: var(--surface);
          border: 1px solid
            var(--border);
          border-radius: 16px;
          padding: 30px;
          text-align: center;
          min-height: 300px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(
            10px
          );
          -webkit-backdrop-filter: blur(
            10px
          );
        }

        .display-item {
          font-size: 6rem;
          font-weight: 800;
          margin: 20px 0;
          background: linear-gradient(
            135deg,
            #fff,
            var(--primary-light)
          );
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .display-item.passage {
          font-size: 1.8rem;
          font-weight: 400;
          -webkit-text-fill-color: #fff;
          text-align: left;
          white-space: pre-wrap;
          max-height: 300px;
          overflow-y: auto;
          width: 100%;
        }

        .stage-label {
          font-size: 1rem;
          color: var(
            --text-secondary
          );
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .progress-text {
          margin: 10px 0;
          font-size: 0.9rem;
          color: var(
            --text-secondary
          );
        }

        .btn-group {
          display: flex;
          gap: 20px;
          margin-top: 30px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .btn {
          padding: 14px 40px;
          border: none;
          border-radius: 14px;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          transition: 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }

        .btn:active:not(
            :disabled
          ) {
          transform: scale(
            0.96
          );
        }

        .btn:hover:not(
            :disabled
          ) {
          transform: translateY(
            -2px
          );
        }

        .btn-correct {
          background: var(
            --success
          );
          color: #fff;
          box-shadow:
            0 4px
              20px
              rgba(
                0,
                184,
                148,
                0.3
              );
        }

        .btn-incorrect {
          background: var(
            --danger
          );
          color: #fff;
          box-shadow:
            0 4px
              20px
              rgba(
                225,
                112,
                85,
                0.3
              );
        }

        .btn-end {
          background: var(
            --danger
          );
          color: #fff;
        }

        .btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none !important;
        }

        .toast {
          position: fixed;
          bottom: 30px;
          left: 50%;
          transform: translateX(
            -50%
          );
          background: #1a1a2e;
          border: 1px solid
            var(--border);
          border-radius: 12px;
          padding: 12px 24px;
          z-index: 999;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow:
            0 10px
              40px
              rgba(
                0,
                0,
                0,
                0.5
              );
          font-size: 0.85rem;
          min-width: 260px;
          justify-content: center;
        }

        .toast.success {
          border-color: var(
            --success
          );
        }

        .toast.error {
          border-color: var(
            --danger
          );
        }

        .toast.success .icon {
          color: var(
            --success
          );
        }

        .toast.error .icon {
          color: var(
            --danger
          );
        }

        .spinner {
          display: inline-block;
          width: 50px;
          height: 50px;
          border: 5px solid
            rgba(
              255,
              255,
              255,
              0.1
            );
          border-top: 5px solid
            var(
              --primary-light
            );
          border-radius: 50%;
          animation: spin 1s
            linear infinite;
          margin: 20px 0;
        }

        @keyframes spin {
          to {
            transform: rotate(
              360deg
            );
          }
        }

        @media (max-width: 480px) {
          .display-item {
            font-size: 4rem;
          }

          .display-item.passage {
            font-size: 1.4rem;
          }

          .btn {
            padding: 12px 24px;
            font-size: 0.9rem;
          }

          header {
            gap: 12px;
          }

          .code-box {
            font-size: 1rem;
            padding: 6px 10px;
          }
        }
      `}</style>

      <div className="container">
        <header>
          <h1>
            📖 Assessment
          </h1>

          <div className="code-box">
            Code:{" "}
            <span>
              {sessionCode ||
                "------"}
            </span>
          </div>
        </header>

        <div className="assessment-area">
          <div className="stage-label">
            {stageLabel}
          </div>

          {currentStage ===
          "waiting" ? (
            <div
              className="display-item"
              style={{
                fontSize:
                  "1rem",
                background:
                  "none",
                WebkitTextFillColor:
                  "currentColor",
              }}
            >
              <div className="spinner" />
            </div>
          ) : (
            <div
              className={`display-item ${
                currentStage ===
                "part2"
                  ? "passage"
                  : ""
              }`}
            >
              {
                currentItem
              }
            </div>
          )}

          <div className="progress-text">
            {
              progressText
            }
          </div>

          <div className="btn-group">
            {currentStage ===
              "task1" ||
            currentStage ===
              "task2" ? (
              <>
                <button
                  type="button"
                  className="btn btn-correct"
                  disabled={
                    isProcessing
                  }
                  onClick={() =>
                    recordResponse(
                      true
                    )
                  }
                >
                  ✓ Correct
                </button>

                <button
                  type="button"
                  className="btn btn-incorrect"
                  disabled={
                    isProcessing
                  }
                  onClick={() =>
                    recordResponse(
                      false
                    )
                  }
                >
                  ✕ Incorrect
                </button>
              </>
            ) : null}

            {currentStage ===
            "part2" ? (
              <button
                type="button"
                className="btn btn-end"
                disabled={
                  isProcessing
                }
                onClick={
                  finishPassage
                }
              >
                ⚑ Finish
              </button>
            ) : null}

            {currentStage ===
            "complete" ? (
              <span
                style={{
                  color:
                    "#00b894",
                  fontWeight:
                    700,
                }}
              >
                🎉 Assessment Complete
              </span>
            ) : null}
          </div>

          {!isComplete &&
          sessionCode &&
          currentStage ===
            "waiting" ? (
            <button
              type="button"
              className="btn btn-end"
              style={{
                marginTop:
                  "20px",
              }}
              onClick={
                endHostSession
              }
            >
              End Session
            </button>
          ) : null}
        </div>
      </div>

      {toast.visible ? (
        <div
          className={`toast ${toast.type}`}
        >
          <span className="icon">
            {toast.type ===
            "success"
              ? "✓"
              : "!"}
          </span>

          <span>
            {
              toast.message
            }
          </span>
        </div>
      ) : null}
    </>
  );
}
