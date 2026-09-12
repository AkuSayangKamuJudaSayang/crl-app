from pathlib import Path
import re

MARKER = "__CRL_WORD_FIRST_READY__"
teacher = Path("app/teacher/assessment/AssessmentClient.jsx")
learner = Path("app/learner/LearnerAssessmentPage.jsx")
route = Path("app/api/assessment/route.js")

t = teacher.read_text(encoding="utf-8")
l = learner.read_text(encoding="utf-8")
r = route.read_text(encoding="utf-8")

if MARKER not in t:
    t = t.replace(
        "const PASSAGE_TEXT =\n",
        'const WORD_FIRST_READY_MARKER = "__CRL_WORD_FIRST_READY__";\n\nconst PASSAGE_TEXT =\n',
        1,
    )

old_effect = '''  useEffect(() => {
    const previousStage = previousTeacherStageRef.current;

    if (
      previousStage === "letter" &&
      activeStage === "word" &&
      wordIndex === 0
    ) {
      if (wordInitialTransitionTimerRef.current) {
        window.clearTimeout(wordInitialTransitionTimerRef.current);
      }

      setWordInitialTransitionPending(true);
      wordInitialTransitionTimerRef.current =
        window.setTimeout(() => {
          wordInitialTransitionTimerRef.current = null;
          setWordInitialTransitionPending(false);
        }, 2500);
    }

    previousTeacherStageRef.current = activeStage;

    if (activeStage !== "word" || wordIndex !== 0) {
      if (wordInitialTransitionTimerRef.current) {
        window.clearTimeout(wordInitialTransitionTimerRef.current);
        wordInitialTransitionTimerRef.current = null;
      }
      setWordInitialTransitionPending(false);
    }
  }, [activeStage, wordIndex]);

  useEffect(() => {
    return () => {
      if (wordInitialTransitionTimerRef.current) {
        window.clearTimeout(wordInitialTransitionTimerRef.current);
        wordInitialTransitionTimerRef.current = null;
      }
    };
  }, []);
'''

new_effect = '''  useEffect(() => {
    const isFirstWordItem =
      activeStage === "word" &&
      wordIndex === 0;

    const learnerReportedReady =
      isFirstWordItem &&
      String(
        session?.story_title ??
          session?.storyTitle ??
          ""
      ).trim() === WORD_FIRST_READY_MARKER;

    if (isFirstWordItem) {
      setWordInitialTransitionPending(!learnerReportedReady);
    } else {
      setWordInitialTransitionPending(false);
    }

    previousTeacherStageRef.current = activeStage;
  }, [
    activeStage,
    wordIndex,
    session?.story_title,
    session?.storyTitle,
  ]);
'''

if "learnerReportedReady" not in t:
    if old_effect in t:
        t = t.replace(old_effect, new_effect, 1)
    else:
        pattern = re.compile(
            r'  useEffect\\(\\(\\) => \\{\\n    const previousStage = previousTeacherStageRef\\.current;.*?  \\}, \\[\\]\\);\\n',
            re.S,
        )
        t, replaced = pattern.subn(new_effect, t, count=1)
        if replaced != 1:
            raise SystemExit("teacher transition effect not found")

t = t.replace(
    "  const wordInitialTransitionTimerRef =\n    useRef(null);\n\n",
    "",
    1,
)

old_trigger = '''  const triggerWordPreparation = useCallback(() => {
    if (preparationTimerRef.current) window.clearTimeout(preparationTimerRef.current);
    setShowPreparationOverlay(true);
    preparationTimerRef.current = window.setTimeout(() => {
      preparationTimerRef.current = null;
      setShowPreparationOverlay(false);
    }, 2000);
  }, []);
'''

new_trigger = '''  const triggerWordPreparation = useCallback(() => {
    if (preparationTimerRef.current) {
      window.clearTimeout(preparationTimerRef.current);
    }

    setShowPreparationOverlay(true);

    preparationTimerRef.current = window.setTimeout(() => {
      preparationTimerRef.current = null;
      setShowPreparationOverlay(false);

      const announceWordReady = async () => {
        const code = normalizeCode(codeInput);
        if (!code) return;

        await new Promise((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(resolve);
          });
        });

        const payload = {
          action: "learner_word_ready",
          code,
          word_index: 0,
        };

        for (let attempt = 0; attempt < 8; attempt += 1) {
          try {
            const response = await fetch(
              "/api/assessment?action=learner_word_ready",
              {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify(payload),
              }
            );

            if (response.ok) return;
          } catch {}

          await new Promise((resolve) =>
            window.setTimeout(resolve, 250 * (attempt + 1))
          );
        }
      };

      void announceWordReady();
    }, 2000);
  }, [codeInput]);
'''

if 'action: "learner_word_ready"' not in l:
    if old_trigger not in l:
        raise SystemExit("learner preparation trigger not found")
    l = l.replace(old_trigger, new_trigger, 1)

if 'action === "learner_word_ready"' not in r:
    marker_block = '''    /* HOST UPDATE                                                             */
    /* ====================================================================== */
'''
    route_block = '''    /* LEARNER WORD PREPARATION READY                                           */
    /* ====================================================================== */

    if (action === "learner_word_ready") {
      const code = normalizeCode(body?.code);
      const wordIndex = Number(body?.word_index);

      if (!code || wordIndex !== 0) {
        return responseJson(
          { error: "Invalid learner word readiness payload." },
          400
        );
      }

      const host = await findHostByCode(code);

      if (!host || host.ended) {
        return responseJson(
          { error: "Assessment session not found." },
          404
        );
      }

      if (String(host.stage || "") !== "word") {
        return responseJson(
          { error: "Word Recognition is not the active stage." },
          409
        );
      }

      await prisma.hostSession.update({
        where: { id: host.id },
        data: { storyTitle: "__CRL_WORD_FIRST_READY__" },
      });

      return responseJson({
        ok: true,
        ready: true,
        stage: "word",
        word_index: 0,
      });
    }

'''
    if marker_block not in r:
        raise SystemExit("host update marker not found")
    r = r.replace(marker_block, route_block + marker_block, 1)

assert "WORD_FIRST_READY_MARKER" in t
assert "learnerReportedReady" in t
assert 'action: "learner_word_ready"' in l
assert "window.requestAnimationFrame" in l
assert 'action === "learner_word_ready"' in r
assert MARKER in r
assert t.count("wordInitialTransitionPending && wordIndex === 0") == 2

teacher.write_text(t, encoding="utf-8")
learner.write_text(l, encoding="utf-8")
route.write_text(r, encoding="utf-8")
print("Verified word readiness handshake source patch applied")
