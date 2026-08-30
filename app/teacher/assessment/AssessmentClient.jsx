"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

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
  {
    index: 0,
    text: "Who was helpful in the story?",
  },
  {
    index: 1,
    text: "What did the child help with?",
  },
  {
    index: 2,
    text: "Where did the child go?",
  },
  {
    index: 3,
    text: "Why did the child help?",
  },
  {
    index: 4,
    text: "What lesson can the learner learn from the story?",
  },
  {
    index: 5,
    text: "What happened at the end?",
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

  const currentQuestion =
    QUESTIONS[
      questionIndex
    ];

  const fetchSession =
    async () => {
      if (!code) {
        setError(
          "Assessment code is missing."
        );
        setLoading(
          false
        );
        return;
      }

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

        setSession(
          data.session
        );

        if (
          data.session
            ?.stage
        ) {
          setActiveStage(
            data.session.stage
          );
        }
      } catch (fetchError) {
        setError(
          fetchError.message ||
            "Unable to load assessment."
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  useEffect(() => {
    fetchSession();

    const interval =
      window.setInterval(
        fetchSession,
        1500
      );

    return () =>
      window.clearInterval(
        interval
      );
  }, [code]);

  const joined =
    useMemo(
      () =>
        Boolean(
          session?.learner_id
        ),
      [session]
    );

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
      setBusy(
        true
      );

      try {
        const response =
          await fetch(
            "/api/assessment?action=record_letter",
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
                code,
                letter_index:
                  letterIndex,
                letter:
                  LETTERS[
                    letterIndex
                  ],
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
              "Unable to record letter result."
          );
        }

        if (
          data.scoring
            ?.hardTerminate
        ) {
          await fetchSession();
          return;
        }

        if (
          letterIndex <
          LETTERS.length -
            1
        ) {
          const nextIndex =
            letterIndex + 1;

          setLetterIndex(
            nextIndex
          );

          await updateHost(
            {
              stage:
                "letter",
              currentContent:
                LETTERS[
                  nextIndex
                ],
              storyTitle:
                "",
            }
          );
        } else {
          setWordIndex(
            0
          );

          await updateHost(
            {
              stage:
                "word",
              currentContent:
                WORDS[0],
              storyTitle:
                "",
            }
          );
        }
      } catch (recordError) {
        setError(
          recordError.message ||
            "Unable to record result."
        );
      } finally {
        setBusy(
          false
        );
      }
    };

  const recordWord =
    async (
      isCorrect
    ) => {
      setBusy(
        true
      );

      try {
        const response =
          await fetch(
            "/api/assessment?action=record_word",
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
                code,
                word_index:
                  wordIndex,
                word:
                  WORDS[
                    wordIndex
                  ],
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
              "Unable to record word result."
          );
        }

        if (
          data.scoring
            ?.hardTerminate
        ) {
          await fetchSession();
          return;
        }

        if (
          wordIndex <
          WORDS.length -
            1
        ) {
          const nextIndex =
            wordIndex + 1;

          setWordIndex(
            nextIndex
          );

          await updateHost(
            {
              stage:
                "word",
              currentContent:
                WORDS[
                  nextIndex
                ],
              storyTitle:
                "",
            }
          );
        } else {
          await updateHost(
            {
              stage:
                "passage",
              currentContent:
                "The helpful child carried the basket home. Along the way, the child stopped to help a friend. They worked together and finished before sunset.",
              storyTitle:
                "The Helpful Child",
            }
          );
        }
      } catch (recordError) {
        setError(
          recordError.message ||
            "Unable to record result."
        );
      } finally {
        setBusy(
          false
        );
      }
    };

  const recordComprehension =
    async (
      isCorrect
    ) => {
      setBusy(
        true
      );

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

          setQuestionIndex(
            nextIndex
          );

          await updateHost(
            {
              stage:
                "comprehension",
              currentContent:
                QUESTIONS[
                  nextIndex
                ].text,
              storyTitle:
                "The Helpful Child",
            }
          );
        } else {
          await finalize();
        }
      } catch (recordError) {
        setError(
          recordError.message ||
            "Unable to record result."
        );
      } finally {
        setBusy(
          false
        );
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
      setBusy(
        true
      );

      try {
        const response =
          await fetch(
            "/api/assessment?action=host_end",
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

        localStorage.removeItem(
          "crla_host_session"
        );

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
          Loading assessment...
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
    <main style={styles.page}>
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
              {period} Teacher Assessment
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
                  ? "Task 1: Letters"
                  : activeStage ===
                    "word"
                  ? "Task 2: Words"
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

          {!joined &&
          activeStage ===
            "waiting" ? (
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
                    style={
                      styles.contentDisplay
                    }
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
                    style={
                      styles.contentDisplay
                    }
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
                "passage" && (
                <>
                  <div
                    style={
                      styles.smallLabel
                    }
                  >
                    Passage
                  </div>

                  <div
                    style={
                      styles.passage
                    }
                  >
                    The helpful child carried the
                    basket home. Along the way, the
                    child stopped to help a friend.
                    They worked together and finished
                    before sunset.
                  </div>

                  <button
                    type="button"
                    style={
                      styles.primary
                    }
                    onClick={() =>
                      updateHost(
                        {
                          stage:
                            "comprehension",
                          currentContent:
                            QUESTIONS[0]
                              .text,
                          storyTitle:
                            "The Helpful Child",
                        }
                      )
                    }
                    disabled={busy}
                  >
                    Start Comprehension
                  </button>
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
                      QUESTIONS.length
                    }
                  </div>

                  <div
                    style={
                      styles.question
                    }
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
                    was reached. The learner's
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

        {busy && (
          <div
            style={
              styles.busy
            }
          >
            Saving...
          </div>
        )}
      </div>
    </main>
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
      "10px",
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
      "9px",
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
      "10px",
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