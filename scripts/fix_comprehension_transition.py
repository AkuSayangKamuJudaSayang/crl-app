from pathlib import Path
import re

path = Path('app/teacher/assessment/AssessmentClient.jsx')
source = path.read_text(encoding='utf-8')

pattern = re.compile(r'  const recordComprehension =\n    async \(isCorrect\) => \{.*?\n    \};\n\n  const finalize =', re.S)
replacement = r'''  const recordComprehension =
    async (isCorrect) => {
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

        if (nextIndex < QUESTIONS.length) {
          const nextQuestion = QUESTIONS[nextIndex];
          const previousQuestion = QUESTIONS[currentIndex];
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
          const previousQuestion = QUESTIONS[currentIndex];
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

  const finalize ='''

patched, count = pattern.subn(replacement, source, count=1)
if count != 1:
    raise SystemExit(f'Expected one comprehension handler, found {count}')

old_style = '''                      style={{
                        ...styles.question,
                        animation:
                          "crlAssessmentContentIn .2s ease-out",
                      }}'''
if old_style in patched:
    patched = patched.replace(old_style, '                      style={styles.question}', 1)

path.write_text(patched, encoding='utf-8')
