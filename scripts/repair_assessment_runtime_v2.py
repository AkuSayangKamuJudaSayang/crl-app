from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

PARA_TITLE = "Para the Parrot"
PARA_TEXT = "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man."
FIELD_TITLE = "A Day in the Fields"
FIELD_TEXT = "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil."


def rx1(text, pattern, replacement, label, flags=re.DOTALL):
    out, n = re.subn(pattern, replacement, text, count=1, flags=flags)
    if n != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {n}")
    return out


def exact(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise RuntimeError(f"{label}: expected 1 exact match, found {n}")
    return text.replace(old, new, 1)


def patch_teacher_page():
    p = ROOT / "app/teacher/page.jsx"
    t = p.read_text()
    old = '''      {\n        id: 1,\n        title: "Para the Parrot",\n        text: "Para is a helpful parrot. Every morning, Para greets the children and helps them find their books.",\n      },\n      {\n        id: 2,\n        title: "The Helpful Friend",\n        text: "A child sees a friend carrying a heavy basket. The child helps carry it home.",\n      },'''
    new = f'''      {{\n        id: 1,\n        title: {PARA_TITLE!r},\n        text: {PARA_TEXT!r},\n      }},\n      {{\n        id: 2,\n        title: {FIELD_TITLE!r},\n        text: {FIELD_TEXT!r},\n      }},'''.replace("'", '"')
    if old in t:
        t = exact(t, old, new, "teacher BoSY story defaults")
    p.write_text(t)


def patch_api():
    p = ROOT / "app/api/assessment/route.js"
    t = p.read_text()

    t = exact(t,
'''const STORY_CHOICES = [\n  {\n    id: 1,\n    title: "Para The Parrot",\n    description: "A story about a parrot flying to the market.",\n    available: true,\n  },\n  {\n    id: 2,\n    title: "A Day In The Fields",\n    description: "Join the farmers as they work in the terraces.",\n    available: false,\n  },\n];''',
'''const STORY_CHOICES = [\n  {\n    id: 1,\n    title: "Para the Parrot",\n    description: "A story about a parrot flying to the market.",\n    available: true,\n  },\n  {\n    id: 2,\n    title: "A Day in the Fields",\n    description: "A day of farm work in the terraces.",\n    available: true,\n  },\n];''', "API story choices")

    t = exact(t,
'''      { title: "Para the Parrot", text: "Para is a helpful parrot. Every morning, Para greets the children and helps them find their books." },\n      { title: "The Helpful Friend", text: "A child sees a friend carrying a heavy basket. The child helps carry it home." },''',
        f'''      {{ title: {PARA_TITLE!r}, text: {PARA_TEXT!r} }},\n      {{ title: {FIELD_TITLE!r}, text: {FIELD_TEXT!r} }},'''.replace("'", '"'), "API BoSY defaults")

    helper = '''\nasync function getTeacherAssessmentContent(teacherId, assessmentPeriod) {\n  const rows = await prisma.assessmentContent.findMany({\n    where: { teacherId, assessmentPeriod },\n    orderBy: [\n      { category: "asc" },\n      { position: "asc" },\n    ],\n  });\n  return serializeAssessmentContent(rows)[assessmentPeriod] || { letters: [], words: [], stories: [] };\n}\n\nfunction buildStoryChoices(stories) {\n  return (Array.isArray(stories) ? stories : []).map((story, index) => ({\n    id: story.id ?? index + 1,\n    title: story.title || `Story ${index + 1}`,\n    description: "Story passage for the learner reading assessment.",\n    available: Boolean(String(story.title || "").trim() && String(story.text || "").trim()),\n  }));\n}\n'''
    t = exact(t, 'function responseJson(data, status = 200) {', helper + '\nfunction responseJson(data, status = 200) {', "API content helpers")

    legacy = f'''\n      const legacyStoryMigrations = [\n        {{ position: 1, title: "Para the Parrot", text: "Para is a helpful parrot. Every morning, Para greets the children and helps them find their books.", nextTitle: {PARA_TITLE!r}, nextText: {PARA_TEXT!r} }},\n        {{ position: 2, title: "The Helpful Friend", text: "A child sees a friend carrying a heavy basket. The child helps carry it home.", nextTitle: {FIELD_TITLE!r}, nextText: {FIELD_TEXT!r} }},\n      ];\n      for (const legacy of legacyStoryMigrations) {{\n        await prisma.assessmentContent.updateMany({{\n          where: {{ teacherId: userId, assessmentPeriod: "BoSY", category: "stories", position: legacy.position, storyTitle: legacy.title, content: legacy.text }},\n          data: {{ storyTitle: legacy.nextTitle, content: legacy.nextText }},\n        }});\n      }}\n      items = await prisma.assessmentContent.findMany({{\n        where: {{ teacherId: userId }},\n        orderBy: [{{ assessmentPeriod: "asc" }}, {{ category: "asc" }}, {{ position: "asc" }}],\n      }});\n'''.replace("'", '"')
    marker = '''      return responseJson({\n        status: "ok",\n        activities: serializeAssessmentContent(items),\n      });'''
    if legacy.strip() not in t:
        t = exact(t, marker, legacy + '\n' + marker, "legacy story migration")

    # Learner join and teacher host_get must use the selected period's database content.
    learner_join_old = '''            currentContent:\n              host.currentContent ||\n              LETTERS[0],'''
    learner_join_new = '''            currentContent:\n              host.currentContent ||\n              (await getTeacherAssessmentContent(\n                host.teacherId,\n                host.assessmentSession?.assessmentPeriod || "BoSY"\n              )).letters[0] ||\n              LETTERS[0],'''
    t = exact(t, learner_join_old, learner_join_new, "learner join first letter")

    host_get_start = '''      const host =\n        await prisma.hostSession.findFirst(\n          {\n            where: {\n              code,\n              teacherId:\n                userId,'''
    # Add content after the complete host lookup instead of relying on a broad regex.
    host_lookup_end = '''        );\n\n      if (!host) {\n        return responseJson(\n          {\n            error:\n              "Assessment session not found.",\n          },\n          404\n        );\n      }'''
    host_lookup_repl = host_lookup_end + '''\n\n      const assessmentPeriod = host.assessmentSession?.assessmentPeriod || "BoSY";\n      const assessmentContent = await getTeacherAssessmentContent(userId, assessmentPeriod);\n      const storyChoices = buildStoryChoices(assessmentContent.stories);'''
    # This exact lookup end occurs in many actions. Use the host_get section only.
    hs = t.index('    /* ---------------------------------------------------------------------- */\n    /* HOST GET')
    he = t.index('    return responseJson(\n      {\n        error:', hs)
    host_segment = t[hs:he]
    host_segment = exact(host_segment, host_lookup_end, host_lookup_repl, "host_get content query")
    host_segment = exact(host_segment, '          story_choices: STORY_CHOICES,', '          story_choices: storyChoices,\n          assessment_content: assessmentContent,', "host_get story choices")
    t = t[:hs] + host_segment + t[he:]

    # Make host_advance use DB-backed letters/words for the current teacher/period.
    hs = t.index('    /* ====================================================================== */\n    /* FAST HOST ADVANCE')
    he = t.index('    /* ====================================================================== */\n    /* HOST UPDATE', hs)
    seg = t[hs:he]
    anchor = '''      if (!host) {\n        return responseJson(\n          { error: "Active assessment session not found." },\n          404\n        );\n      }'''
    addition = anchor + '''\n\n      const runtimeContent = await getTeacherAssessmentContent(\n        host.teacherId,\n        host.assessmentSession?.assessmentPeriod || "BoSY"\n      );\n      const runtimeLetters = runtimeContent.letters?.length ? runtimeContent.letters : LETTERS;\n      const runtimeWords = runtimeContent.words?.length ? runtimeContent.words : WORDS;'''
    if anchor in seg:
        seg = exact(seg, anchor, addition, "host_advance runtime content")
    seg = seg.replace('LETTERS', 'runtimeLetters').replace('WORDS', 'runtimeWords')
    # Restore fallback constants in helper declarations if replacement touched only segment references.
    t = t[:hs] + seg + t[he:]

    # Record letter/word endpoints must validate/store the DB-backed item at that index.
    for action_name, next_marker in [("RECORD LETTER", "/* RECORD WORD"), ("RECORD WORD", "/* SELECT STORY")]:
        if action_name == "RECORD LETTER":
            hs = t.index('    /* ====================================================================== */\n    /* RECORD LETTER')
            he = t.index('    /* ====================================================================== */\n    /* RECORD WORD', hs)
            seg = t[hs:he]
            anchor = '''      if (\n        !host ||\n        !host.assessmentSessionId\n      ) {'''
            insert_after = '''      if (\n        !host ||\n        !host.assessmentSessionId\n      ) {'''
            # Insert runtime lookup immediately after the closing not-found block via the first later "      const letterIndex".
            li = seg.index('      const letterIndex =')
            seg = seg[:li] + '''      const runtimeContent = await getTeacherAssessmentContent(\n        host.teacherId,\n        host.assessmentSession?.assessmentPeriod || "BoSY"\n      );\n      const runtimeLetters = runtimeContent.letters?.length ? runtimeContent.letters : LETTERS;\n      const runtimeWords = runtimeContent.words?.length ? runtimeContent.words : WORDS;\n\n''' + seg[li:]
            seg = seg.replace('LETTERS', 'runtimeLetters').replace('WORDS', 'runtimeWords')
            t = t[:hs] + seg + t[he:]
        else:
            hs = t.index('    /* ====================================================================== */\n    /* RECORD WORD')
            he = t.index('    /* ====================================================================== */\n    /* SELECT STORY', hs)
            seg = t[hs:he]
            wi = seg.index('      const wordIndex =')
            seg = seg[:wi] + '''      const runtimeContent = await getTeacherAssessmentContent(\n        host.teacherId,\n        host.assessmentSession?.assessmentPeriod || "BoSY"\n      );\n      const runtimeLetters = runtimeContent.letters?.length ? runtimeContent.letters : LETTERS;\n      const runtimeWords = runtimeContent.words?.length ? runtimeContent.words : WORDS;\n\n''' + seg[wi:]
            seg = seg.replace('LETTERS', 'runtimeLetters').replace('WORDS', 'runtimeWords')
            t = t[:hs] + seg + t[he:]

    # Replace the old hard-coded story-selection map with database content.
    hs = t.index('    /* ====================================================================== */\n    /* SELECT STORY / START PASSAGE')
    he = t.index('    /* ====================================================================== */\n    /* PASSAGE READY / TIMER CONTROL', hs)
    old_seg = t[hs:he]
    start = old_seg.index('    if (action === "select_story") {')
    new_block = '''    if (action === "select_story") {\n      const code = normalizeCode(body?.code);\n      const storyId = Number(body?.story_id ?? body?.storyId);\n\n      if (!code || !Number.isInteger(storyId)) {\n        return responseJson(\n          { error: "Assessment code and story are required." },\n          400\n        );\n      }\n\n      const host = await prisma.hostSession.findFirst({\n        where: { code, teacherId: userId, ended: false },\n      });\n\n      if (!host) {\n        return responseJson({ error: "Active assessment session not found." }, 404);\n      }\n\n      if (host.stage !== "story_choice") {\n        return responseJson({ error: "The assessment is not currently at story selection." }, 409);\n      }\n\n      const content = await getTeacherAssessmentContent(\n        host.teacherId,\n        host.assessmentSession?.assessmentPeriod || "BoSY"\n      );\n      const stories = Array.isArray(content.stories) ? content.stories : [];\n      const selected = stories.find((story) => Number(story.id) === storyId) || stories[storyId - 1];\n\n      if (!selected || !selected.title || !selected.text) {\n        return responseJson({ error: "That story passage is not available yet." }, 409);\n      }\n\n      const updated = await prisma.hostSession.update({\n        where: { id: host.id },\n        data: {\n          stage: "passage",\n          currentContent: selected.text,\n          storyTitle: selected.title,\n          passageStartedAt: null,\n          passagePausedAt: null,\n          passagePausedSeconds: 0,\n        },\n      });\n\n      return responseJson({\n        status: "ok",\n        session: {\n          id: updated.id,\n          code: updated.code,\n          stage: updated.stage,\n          current_content: updated.currentContent,\n          story_title: updated.storyTitle,\n          learner_id: updated.learnerId,\n          ended: updated.ended,\n          connected: Boolean(updated.learnerId && updated.linkedAt),\n          linked_at: updated.linkedAt,\n          updated_at: updated.updatedAt,\n          passage_started_at: updated.passageStartedAt,\n          passage_paused_at: updated.passagePausedAt,\n          passage_paused_seconds: updated.passagePausedSeconds,\n          story_choices: buildStoryChoices(stories),\n          assessment_content: content,\n        },\n      });\n    }\n\n'''
    prefix = old_seg[:start]
    t = t[:hs] + prefix + new_block + t[he:]

    p.write_text(t)


def patch_assessment_client():
    p = ROOT / "app/teacher/assessment/AssessmentClient.jsx"
    full = p.read_text()
    marker = 'export default function TeacherAssessmentPage'
    idx = full.index(marker)
    top = full[:idx]
    body = full[idx:]

    # Add story-specific questions next to the default passage data.
    top = exact(top, f'''const FIELD_PASSAGE_TEXT =\n  "{FIELD_TEXT}";\n''', f'''const FIELD_PASSAGE_TEXT =\n  "{FIELD_TEXT}";\n\nconst FIELD_QUESTIONS = [\n  {{ index: 0, text: "Who is Dulnuwan?" }},\n  {{ index: 1, text: "Who helps Dulnuwan in the fields?" }},\n  {{ index: 2, text: "What do they do all morning?" }},\n  {{ index: 3, text: "What do they eat for lunch?" }},\n  {{ index: 4, text: "What does Dulnuwan see in the sky?" }},\n  {{ index: 5, text: "What does Dulnuwan bend down to pick?" }},\n];\n''', "field questions")

    # Only body references become runtime aliases; top-level constants stay stable fallbacks.
    body = body.replace('LETTERS', 'runtimeLetters').replace('WORDS', 'runtimeWords').replace('STORIES', 'runtimeStories').replace('QUESTIONS', 'runtimeQuestions')

    # Add runtime content state after passage/miscue state cluster.
    state_anchor = '  const [storySelecting, setStorySelecting] = useState(false);'
    state_add = '''  const [assessmentContent, setAssessmentContent] = useState({\n    letters: LETTERS,\n    words: WORDS,\n    stories: STORIES,\n  });\n  const [manualMiscueReview, setManualMiscueReview] = useState(false);\n  const [comprehensionLockedQuestion, setComprehensionLockedQuestion] = useState(null);\n  const [learnerExperienceRating, setLearnerExperienceRating] = useState(null);\n  const [observationLevel, setObservationLevel] = useState(null);\n\n  const [storySelecting, setStorySelecting] = useState(false);'''
    body = exact(body, state_anchor, state_add, "runtime assessment state")

    period_anchor = '''  const period =\n    String(initialPeriod || "BoSY").trim() ||\n    "BoSY";'''
    runtime_aliases = period_anchor + '''\n\n  const runtimeLetters = Array.isArray(assessmentContent?.letters) && assessmentContent.letters.length\n    ? assessmentContent.letters.map((value) => String(value))\n    : LETTERS;\n  const runtimeWords = Array.isArray(assessmentContent?.words) && assessmentContent.words.length\n    ? assessmentContent.words.map((value) => String(value))\n    : WORDS;\n  const runtimeStories = Array.isArray(assessmentContent?.stories) && assessmentContent.stories.length\n    ? assessmentContent.stories\n    : STORIES;'''
    body = exact(body, period_anchor, runtime_aliases, "runtime content aliases")

    # passageText is selected from the authoritative host content during passage stage.
    body = exact(body,
'''  const passageText =\n    session?.story_title === "A Day In The Fields"\n      ? FIELD_PASSAGE_TEXT\n      : PASSAGE_TEXT;''',
'''  const passageText =\n    activeStage === "passage" && String(session?.current_content || "").trim()\n      ? String(session.current_content)\n      : String(session?.story_title || "").trim().toLowerCase() === "a day in the fields"\n        ? FIELD_PASSAGE_TEXT\n        : PASSAGE_TEXT;\n  const passageWordCount = passageText.trim().split(/\\s+/).filter(Boolean).length;\n  const runtimeQuestions = String(session?.story_title || "").trim().toLowerCase() === "a day in the fields"\n    ? FIELD_QUESTIONS\n    : QUESTIONS;''', "dynamic passage and questions")

    # Initial/default state references changed by the body token replacement must use module fallbacks.
    body = body.replace('letters: runtimeLetters,\n    words: runtimeWords,\n    stories: runtimeStories,', 'letters: LETTERS,\n    words: WORDS,\n    stories: STORIES,')
    # We need defaults only inside the state initializer; the runtime aliases are declared later.

    # Hydrate content after host_get data arrives.
    body = exact(body,
'''        const data =\n          await response.json();''',
'''        const data =\n          await response.json();\n\n        const runtimeContent = data?.session?.assessment_content;\n        if (runtimeContent) {\n          setAssessmentContent({\n            letters: Array.isArray(runtimeContent.letters) && runtimeContent.letters.length ? runtimeContent.letters : LETTERS,\n            words: Array.isArray(runtimeContent.words) && runtimeContent.words.length ? runtimeContent.words : WORDS,\n            stories: Array.isArray(runtimeContent.stories) && runtimeContent.stories.length ? runtimeContent.stories : STORIES,\n          });\n        }''', "assessment client DB content hydration")

    # Story selection sends the actual DB-backed passage.
    body = exact(body,
'''        currentContent:\n          story.id === 1\n            ? PASSAGE_TEXT\n            : FIELD_PASSAGE_TEXT,\n        storyTitle: story.title,''',
'''        currentContent: String(story.text || story.content || ""),\n        storyTitle: String(story.title || ""),''', "client story content")

    # Finish Reading becomes a bottom prompt; no large review overlay is opened by the button.
    body = exact(body,
'''                            onClick={() => {\n                              setMiscueReviewMode(true);\n                              setMiscueDrawerOpen(true);\n                              setSelectedPassageWord(null);\n                              setSelectedMiscueType(null);\n                              setMisreadWord("");\n                              setError("");\n                            }}''',
'''                            onClick={() => {\n                              setManualMiscueReview(true);\n                              setMiscueDrawerOpen(false);\n                              setSelectedPassageWord(null);\n                              setSelectedMiscueType(null);\n                              setMisreadWord("");\n                              setError("");\n                            }}''', "manual finish button")
    body = exact(body, '{!timeUpSelecting && (\n                        <div style={styles.passageFinishRow}>', '{!timeUpSelecting && !manualMiscueReview && (\n                        <div style={styles.passageFinishRow}>', "manual review hides finish button")

    manual_card = '''\n\n                      {!timeUpSelecting && manualMiscueReview && (\n                        <div style={styles.timeoutWorkflowCard}>\n                          <div style={styles.timeoutStepBadge}>REVIEW</div>\n                          <div style={styles.timeoutWorkflowTitle}>Select additional miscued words</div>\n                          <p style={styles.timeoutWorkflowText}>\n                            Select any word above where you observed a miscue. This review is optional;\n                            press Confirm &amp; Proceed when finished or skip it when there are no additional miscues.\n                          </p>\n                          <button\n                            type="button"\n                            style={styles.timeoutConfirmButton}\n                            onClick={() => {\n                              setManualMiscueReview(false);\n                              void finishPassageReading(passageSeconds, passageWordCount);\n                            }}\n                            disabled={busy || passageFinalizingRef.current}\n                          >\n                            Confirm &amp; Proceed\n                          </button>\n                        </div>\n                      )}'''
    body = exact(body, '''                    </div>\n\n                    {miscueDrawerOpen && typeof document !== "undefined"''', '''                    </div>''' + manual_card + '''\n\n                    {miscueDrawerOpen && typeof document !== "undefined"''', "manual bottom prompt")

    body = rx1(body, r'\n\s*\{miscueReviewMode && \(\s*<button[\s\S]*?<\/button>\s*\)\s*\n\s*\}', '', "remove drawer review confirmation")

    # Passage values are bounded by the selected story, not a hard-coded 100.
    body = body.replace('selectedIndex >= 100', 'selectedIndex >= passageWordCount')
    body = body.replace('selectedIndex < 0 || selectedIndex >= 100', 'selectedIndex < 0 || selectedIndex >= passageWordCount')
    body = body.replace('Math.min(100,', 'Math.min(passageWordCount,')
    body = body.replace('<span> / 100</span>', '<span> / {passageWordCount}</span>')

    # Strong visible + synchronous comprehension lock.
    body = exact(body,
'''      answerActionLockRef.current = lockKey;\n      setAnswerLockKey(lockKey);\n      setBusy(true);''',
'''      answerActionLockRef.current = lockKey;\n      setAnswerLockKey(lockKey);\n      setComprehensionLockedQuestion(questionIndex);\n      setBusy(true);''', "comprehension lock set")
    body = exact(body,
'''      } catch (recordError) {\n        answerActionLockRef.current = "";\n        setAnswerLockKey("");\n        setError(''',
'''      } catch (recordError) {\n        answerActionLockRef.current = "";\n        setAnswerLockKey("");\n        setComprehensionLockedQuestion(null);\n        setError(''', "comprehension lock reset")
    body = exact(body,
'''                            answerLockKey ===\n                            ("comprehension:" +\n                              questionIndex)''',
'''                            (answerLockKey ===\n                              ("comprehension:" +\n                                questionIndex) ||\n                              comprehensionLockedQuestion === questionIndex)''', "comprehension button disabled lock")

    # Completed observation initialization.
    body = exact(body,
'''      setTerminationRemarks(\n        current?.metrics?.remarks || ""\n      );\n      setTerminationObservationError("");''',
'''      setTerminationRemarks(\n        current?.metrics?.remarks || ""\n      );\n      setLearnerExperienceRating(\n        Number(current?.metrics?.experience_rating ?? current?.metrics?.experienceRating ?? 0) || null\n      );\n      setObservationLevel(\n        Number(current?.metrics?.observation_level ?? current?.metrics?.observationLevel ?? 0) || null\n      );\n      setTerminationObservationError("");''', "observation initialization")

    body = exact(body,
'''        if (activeStage === "completed") {\n          const draft =''',
'''        if (activeStage === "completed") {\n          if (!learnerExperienceRating || !observationLevel) {\n            throw new Error("Please select the learner experience and observation level before saving the assessment.");\n          }\n          const draft =''', "observation required")

    body = exact(body,
'''          const payload = {\n            action: "commit_passage_assessment",\n            code,''',
'''          const payload = {\n            action: "commit_passage_assessment",\n            code,\n            experience_rating: Number(learnerExperienceRating),\n            observation_level: Number(observationLevel),''', "observation commit payload")

    # Completed-review overlay content.
    subtitle_old = '''              <p style={styles.observationSubtitle}>\n                {activeStage === "completed"\n                  ? "The assessment is complete. Add any optional teacher remarks before saving the assessment."\n                  : "Part 1 Task 1 ended with a score of 0. Add any optional teacher remarks before saving the assessment."}\n              </p>'''
    subtitle_new = '''              <p style={styles.observationSubtitle}>\n                {activeStage === "completed"\n                  ? "Review the assessment summary, record the learner experience and observation level, and add optional remarks before saving."\n                  : "Part 1 Task 1 ended with a score of 0. Add any optional teacher remarks before saving the assessment."}\n              </p>\n\n              {activeStage === "completed" && (\n                <div style={styles.assessmentReviewSummary}>\n                  <div style={styles.assessmentReviewGrid}>\n                    <div><span>Part 1 Task 1</span><strong>{Number(latestSessionRef.current?.metrics?.task1Score ?? latestSessionRef.current?.metrics?.task1_score ?? 0)} / {runtimeLetters.length}</strong></div>\n                    <div><span>Part 1 Task 2</span><strong>{Number(latestSessionRef.current?.metrics?.task2Score ?? latestSessionRef.current?.metrics?.task2_score ?? 0)} / {runtimeWords.length}</strong></div>\n                    <div><span>Story Choice</span><strong>{latestSessionRef.current?.story_title || "—"}</strong></div>\n                  </div>\n                  <div style={styles.assessmentReviewBlock}>\n                    <div style={styles.assessmentReviewBlockTitle}>Passage Miscues</div>\n                    {passageMiscues.length ? passageMiscues.map((item, index) => {\n                      const sourceWord = passageText.split(/\\s+/).filter(Boolean)[Number(item.wordIndex)] || "Unknown word";\n                      return <div key={`summary-miscue-${index}`} style={styles.assessmentReviewRow}><span>{sourceWord}</span><span>{item.miscueType}{item.misreadWord ? ` — learner said "${item.misreadWord}"` : ""}</span></div>;\n                    }) : <div style={styles.assessmentReviewEmpty}>No miscues recorded.</div>}\n                  </div>\n                  <div style={styles.assessmentReviewBlock}>\n                    <div style={styles.assessmentReviewBlockTitle}>Comprehension</div>\n                    <div style={styles.comprehensionResultGrid}>\n                      {runtimeQuestions.map((question, index) => {\n                        const result = passageDraftRef.current.comprehension.find((item) => Number(item.questionIndex) === index);\n                        return <div key={`summary-question-${index}`} style={result?.isCorrect ? styles.comprehensionResultCorrect : styles.comprehensionResultIncorrect}>Q{index + 1}: {result?.isCorrect ? "Correct" : "Incorrect"}</div>;\n                      })}\n                    </div>\n                  </div>\n                </div>\n              )}'''
    body = exact(body, subtitle_old, subtitle_new, "completed observation summary")

    remarks_label = '''              <label style={styles.observationField}>\n                <span>\n                  Remarks <span style={styles.optionalLabel}>(optional)</span>'''
    fields = '''              {activeStage === "completed" && (\n                <>\n                  <div style={styles.observationField}>\n                    <span>Learner Experience</span>\n                    <div style={styles.experienceEmojiRow}>\n                      {["😞", "🙁", "😐", "🙂", "😄"].map((emoji, index) => {\n                        const rating = index + 1;\n                        return <button key={`experience-${rating}`} type="button" style={rating === learnerExperienceRating ? styles.experienceEmojiSelected : styles.experienceEmojiButton} onClick={() => setLearnerExperienceRating(rating)} disabled={savingTerminationObservation} aria-label={`Learner experience ${rating} of 5`}><span>{emoji}</span><small>{rating}</small></button>;\n                      })}\n                    </div>\n                  </div>\n                  <div style={styles.observationField}>\n                    <span>Observation Level</span>\n                    <div style={styles.observationLevelRow}>\n                      {[1, 2, 3, 4].map((level) => <button key={`observation-${level}`} type="button" style={level === observationLevel ? styles.observationLevelSelected : styles.observationLevelButton} onClick={() => setObservationLevel(level)} disabled={savingTerminationObservation}>{level}</button>)}\n                    </div>\n                  </div>\n                </>\n              )}\n\n''' + remarks_label
    body = exact(body, remarks_label, fields, "completed observation controls")

    style_anchor = '  observationField: {\n    display:\n      "flex",\n    flexDirection:'
    styles = '''  assessmentReviewSummary: { display: "flex", flexDirection: "column", gap: "12px", margin: "0 0 18px", padding: "14px", border: "1px solid #d8e5ef", borderRadius: "14px", background: "#eef6fb", textAlign: "left" },\n  assessmentReviewGrid: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "8px" },\n  assessmentReviewBlock: { paddingTop: "8px", borderTop: "1px solid #dbe7f0" },\n  assessmentReviewBlockTitle: { color: "#2d5573", fontSize: "12px", fontWeight: "950", marginBottom: "7px" },\n  assessmentReviewRow: { display: "flex", justifyContent: "space-between", gap: "10px", padding: "6px 0", color: "#4f6a80", fontSize: "12px", borderBottom: "1px solid #e2ebf2" },\n  assessmentReviewEmpty: { color: "#8294a5", fontSize: "12px" },\n  comprehensionResultGrid: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "7px" },\n  comprehensionResultCorrect: { padding: "7px", borderRadius: "8px", background: "#e8f6ed", color: "#23764a", fontSize: "11px", fontWeight: "900", textAlign: "center" },\n  comprehensionResultIncorrect: { padding: "7px", borderRadius: "8px", background: "#fff0f2", color: "#b32639", fontSize: "11px", fontWeight: "900", textAlign: "center" },\n  experienceEmojiRow: { display: "flex", justifyContent: "center", gap: "8px", flexWrap: "wrap", marginTop: "4px" },\n  experienceEmojiButton: { minWidth: "58px", minHeight: "62px", border: "1px solid #d2dfeb", borderRadius: "12px", background: "#ffffff", color: "#536f86", cursor: "pointer" },\n  experienceEmojiSelected: { minWidth: "58px", minHeight: "62px", border: "2px solid #2f73c9", borderRadius: "12px", background: "#eaf3fb", color: "#1559a6", cursor: "pointer", boxShadow: "0 5px 12px rgba(47,115,201,.16)" },\n  observationLevelRow: { display: "flex", justifyContent: "center", gap: "10px", marginTop: "4px" },\n  observationLevelButton: { width: "52px", height: "44px", border: "1px solid #d2dfeb", borderRadius: "11px", background: "#ffffff", color: "#536f86", fontSize: "16px", fontWeight: "900", cursor: "pointer" },\n  observationLevelSelected: { width: "52px", height: "44px", border: "2px solid #1559a6", borderRadius: "11px", background: "#eaf3fb", color: "#1559a6", fontSize: "16px", fontWeight: "950", cursor: "pointer" },\n\n''' + style_anchor
    body = exact(body, style_anchor, styles, "assessment review styles")

    p.write_text(top + body)


def patch_commit_route():
    p = ROOT / "app/api/assessment/commit/route.js"
    t = p.read_text()
    t = exact(t, '  const remarks = String(body?.remarks ?? "").trim();', '  const remarks = String(body?.remarks ?? "").trim();\n  const experienceRating = Number(body?.experience_rating ?? body?.experienceRating ?? 0);\n  const observationLevel = Number(body?.observation_level ?? body?.observationLevel ?? 0);', "commit observation input")
    t = exact(t, '  if (remarks.length > 5000) {', '  if (experienceRating < 1 || experienceRating > 5 || !Number.isInteger(experienceRating)) {\n    return responseJson({ error: "Learner experience rating must be between 1 and 5." }, 400);\n  }\n  if (observationLevel < 1 || observationLevel > 4 || !Number.isInteger(observationLevel)) {\n    return responseJson({ error: "Observation level must be between 1 and 4." }, 400);\n  }\n\n  if (remarks.length > 5000) {', "commit observation validation")
    content_insert = '''    const storyRows = await prisma.assessmentContent.findMany({\n      where: {\n        teacherId: host.teacherId,\n        assessmentPeriod: host.assessmentSession.assessmentPeriod,\n        category: "stories",\n      },\n      orderBy: { position: "asc" },\n    });\n    const selectedStory = storyRows.find((item) => item.storyTitle === host.storyTitle);\n    const passageWordCount = selectedStory?.content\n      ? selectedStory.content.trim().split(/\\s+/).filter(Boolean).length\n      : PASSAGE_TEXT.trim().split(/\\s+/).filter(Boolean).length;\n    const safeWordsRead = Math.max(0, Math.min(passageWordCount, wordsRead));\n'''
    t = exact(t, '    if (host.stage !== "comprehension") {', content_insert + '\n    if (host.stage !== "comprehension") {', "commit story word count")
    t = t.replace('      wordIndex < 100 &&', '      wordIndex < passageWordCount &&')
    t = t.replace('  for (let index = wordsRead; index < 100; index += 1) {', '  for (let index = safeWordsRead; index < passageWordCount; index += 1) {')
    t = t.replace('      const actualWordsRead = Math.max(0, passageWordCount - totalMiscues);', '      const actualWordsRead = safeWordsRead;')
    # Keep request clamping permissive; server clamps against the actual selected story.
    t = t.replace('  const wordsRead = Math.min(\n    100,', '  const wordsRead = Math.min(\n    100000,')
    t = exact(t, '''          classificationLabel: classification,\n          remarks,\n        },''', '''          classificationLabel: classification,\n          experienceRating,\n          observationLevel,\n          remarks,\n        },''', "commit metrics update/create")
    # There are two blocks with identical text; the exact replacement above intentionally updates the first occurrence.
    remaining = '          classificationLabel: classification,\n          remarks,\n        },'
    if remaining in t:
        t = t.replace(remaining, '          classificationLabel: classification,\n          experienceRating,\n          observationLevel,\n          remarks,\n        },', 1)
    p.write_text(t)


def main():
    patch_teacher_page()
    patch_api()
    patch_assessment_client()
    patch_commit_route()
    print("assessment runtime repair patch ready")


if __name__ == "__main__":
    main()
