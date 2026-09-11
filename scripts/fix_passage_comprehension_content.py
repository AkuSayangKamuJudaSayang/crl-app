from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

PARA_TITLE = "Para the Parrot"
PARA_TEXT = "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man."
FIELD_TITLE = "A Day in the Fields"
FIELD_TEXT = "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil."
FIELD_QUESTIONS = [
    "Who is Dulnuwan?",
    "Who helps Dulnuwan in the fields?",
    "What do they do all morning?",
    "What do they eat for lunch?",
    "What does Dulnuwan see in the sky?",
    "What does Dulnuwan bend down to pick?",
]


def replace_exact(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


def replace_regex(text, pattern, new, label, flags=re.DOTALL):
    m = list(re.finditer(pattern, text, flags))
    if len(m) != 1:
        raise RuntimeError(f"{label}: expected 1 regex match, found {len(m)}")
    x = m[0]
    return text[:x.start()] + new + text[x.end():]


def patch_teacher_page():
    path = ROOT / "app/teacher/page.jsx"
    text = path.read_text()
    old = '''      {\n        id: 1,\n        title: "Para the Parrot",\n        text: "Para is a helpful parrot. Every morning, Para greets the children and helps them find their books.",\n      },\n      {\n        id: 2,\n        title: "The Helpful Friend",\n        text: "A child sees a friend carrying a heavy basket. The child helps carry it home.",\n      },'''
    new = f'''      {{\n        id: 1,\n        title: {PARA_TITLE!r},\n        text: {PARA_TEXT!r},\n      }},\n      {{\n        id: 2,\n        title: {FIELD_TITLE!r},\n        text: {FIELD_TEXT!r},\n      }},'''.replace("'", '"')
    if old in text:
        text = replace_exact(text, old, new, "teacher BoSY stories")
    path.write_text(text)


def patch_api_route():
    path = ROOT / "app/api/assessment/route.js"
    text = path.read_text()

    text = replace_exact(
        text,
        '''const STORY_CHOICES = [\n  {\n    id: 1,\n    title: "Para The Parrot",\n    description: "A story about a parrot flying to the market.",\n    available: true,\n  },\n  {\n    id: 2,\n    title: "A Day In The Fields",\n    description: "Join the farmers as they work in the terraces.",\n    available: false,\n  },\n];''',
        '''const STORY_CHOICES = [\n  {\n    id: 1,\n    title: "Para the Parrot",\n    description: "A story about a parrot flying to the market.",\n    available: true,\n  },\n  {\n    id: 2,\n    title: "A Day in the Fields",\n    description: "A day of farm work in the terraces.",\n    available: true,\n  },\n];''',
        "API story choices",
    )

    text = replace_exact(
        text,
        '''      { title: "Para the Parrot", text: "Para is a helpful parrot. Every morning, Para greets the children and helps them find their books." },\n      { title: "The Helpful Friend", text: "A child sees a friend carrying a heavy basket. The child helps carry it home." },''',
        f'''      {{ title: {PARA_TITLE!r}, text: {PARA_TEXT!r} }},\n      {{ title: {FIELD_TITLE!r}, text: {FIELD_TEXT!r} }},'''.replace("'", '"'),
        "API BoSY defaults",
    )

    helper = '''\nasync function getTeacherAssessmentContent(teacherId, assessmentPeriod) {\n  const rows = await prisma.assessmentContent.findMany({\n    where: { teacherId, assessmentPeriod },\n    orderBy: [\n      { category: "asc" },\n      { position: "asc" },\n    ],\n  });\n\n  return serializeAssessmentContent(rows)[assessmentPeriod] || {\n    letters: [],\n    words: [],\n    stories: [],\n  };\n}\n\nfunction buildStoryChoices(stories) {\n  return (Array.isArray(stories) ? stories : []).map((story, index) => ({\n    id: story.id ?? index + 1,\n    title: story.title || `Story ${index + 1}`,\n    description: index === 0\n      ? "A story passage for the learner reading assessment."\n      : "A story passage for the learner reading assessment.",\n    available: Boolean(String(story.title || "").trim() && String(story.text || "").trim()),\n  }));\n}\n'''
    text = replace_exact(
        text,
        '''function responseJson(data, status = 200) {''',
        helper + '''\nfunction responseJson(data, status = 200) {''',
        "API content helpers",
    )

    legacy_migration = f'''\n      const legacyStoryMigrations = [\n        {{\n          position: 1,\n          title: "Para the Parrot",\n          text: "Para is a helpful parrot. Every morning, Para greets the children and helps them find their books.",\n          nextTitle: {PARA_TITLE!r},\n          nextText: {PARA_TEXT!r},\n        }},\n        {{\n          position: 2,\n          title: "The Helpful Friend",\n          text: "A child sees a friend carrying a heavy basket. The child helps carry it home.",\n          nextTitle: {FIELD_TITLE!r},\n          nextText: {FIELD_TEXT!r},\n        }},\n      ];\n\n      for (const legacy of legacyStoryMigrations) {{\n        await prisma.assessmentContent.updateMany({{\n          where: {{\n            teacherId: userId,\n            assessmentPeriod: "BoSY",\n            category: "stories",\n            position: legacy.position,\n            storyTitle: legacy.title,\n            content: legacy.text,\n          }},\n          data: {{\n            storyTitle: legacy.nextTitle,\n            content: legacy.nextText,\n          }},\n        }});\n      }}\n\n      items = await prisma.assessmentContent.findMany({{\n        where: {{ teacherId: userId }},\n        orderBy: [\n          {{ assessmentPeriod: "asc" }},\n          {{ category: "asc" }},\n          {{ position: "asc" }},\n        ],\n      }});\n'''.replace("'", '"')

    anchor = '''      return responseJson({\n        status: "ok",\n        activities: serializeAssessmentContent(items),\n      });'''
    if legacy_migration.strip() not in text:
        text = replace_exact(text, anchor, legacy_migration + "\n" + anchor, "legacy content migration")

    host_segment_pattern = r'(\/\* HOST GET[\s\S]*?if \(\s*action ===\s*"host_get"\s*\) \{[\s\S]*?const host =\s*await findHostByCode\(\s*code\s*\);)(\s*\n\s*if \(!host\) \{)'
    host_insert = r'''\n\n      const assessmentPeriod =\n        host.assessmentSession?.assessmentPeriod ||\n        "BoSY";\n      const assessmentContent = await getTeacherAssessmentContent(\n        host.teacherId,\n        assessmentPeriod\n      );\n      const storyChoices = buildStoryChoices(assessmentContent.stories);'''
    text, count = re.subn(host_segment_pattern, r'\1' + host_insert + r'\2', text, count=1, flags=re.DOTALL)
    if count != 1:
        raise RuntimeError("host_get content hydration anchor not found")

    text = replace_exact(text, '          story_choices: STORY_CHOICES,', '          story_choices: storyChoices,\n          assessment_content: assessmentContent,', "host_get dynamic content")

    select_story_pattern = r'(if \(action === "select_story"\) \{)[\s\S]*?(\n\s*/\* ====================================================================== \*/\n\s*/\* PASSAGE READY / TIMER CONTROL)'
    select_story_replacement = f'''if (action === "select_story") {{\n      const code = normalizeCode(body?.code);\n      const storyId = Number(body?.story_id ?? body?.storyId);\n\n      if (!code || !Number.isInteger(storyId)) {{\n        return responseJson(\n          {{ error: "Assessment code and story are required." }},\n          400\n        );\n      }}\n\n      try {{\n        const host = await findHostByCode(code);\n        if (!host || host.teacherId !== (await requireTeacher(request)).userId) {{\n          return responseJson({{ error: "Assessment session not found." }}, 404);\n        }}\n\n        const assessmentPeriod = host.assessmentSession?.assessmentPeriod || "BoSY";\n        const contentRows = await prisma.assessmentContent.findMany({{\n          where: {{\n            teacherId: host.teacherId,\n            assessmentPeriod,\n            category: "stories",\n          }},\n          orderBy: {{ position: "asc" }},\n        }});\n        const story = contentRows.find((item) => item.id === storyId) || contentRows[storyId - 1];\n\n        if (!story || !story.storyTitle || !story.content) {{\n          return responseJson({{ error: "Selected story is not available." }}, 404);\n        }}\n\n        const updated = await prisma.hostSession.update({{\n          where: {{ id: host.id }},\n          data: {{\n            stage: "passage",\n            currentContent: story.content,\n            storyTitle: story.storyTitle,\n            ended: false,\n            linkedAt: host.linkedAt || new Date(),\n          }},\n        }});\n\n        return responseJson({{\n          status: "ok",\n          session: {{\n            id: updated.id,\n            code: updated.code,\n            stage: updated.stage,\n            current_content: updated.currentContent,\n            story_title: updated.storyTitle,\n            story_choices: buildStoryChoices(contentRows.map((item) => ({{\n              id: item.id,\n              title: item.storyTitle,\n              text: item.content,\n            }}))),\n            assessment_content: {{\n              letters: (await getTeacherAssessmentContent(host.teacherId, assessmentPeriod)).letters,\n              words: (await getTeacherAssessmentContent(host.teacherId, assessmentPeriod)).words,\n              stories: (await getTeacherAssessmentContent(host.teacherId, assessmentPeriod)).stories,\n            }},\n            connected: Boolean(updated.learnerId && updated.linkedAt),\n            linked_at: updated.linkedAt,\n            updated_at: updated.updatedAt,\n            passage_started_at: updated.passageStartedAt,\n            passage_paused_at: updated.passagePausedAt,\n            passage_paused_seconds: updated.passagePausedSeconds,\n          }},\n        }});\n      }} catch (error) {{\n        console.error("select_story error:", error);\n        return responseJson({{ error: "Unable to start the selected story." }}, 500);\n      }}\n    }}\1?''' # never used
    # The previous replacement is intentionally built below without the trailing marker.
    replacement = select_story_replacement[:-len("\n    }}\1?")] if False else None
    m = re.search(select_story_pattern, text, flags=re.DOTALL)
    if not m:
        raise RuntimeError("select_story block not found")
    new_block = f'''if (action === "select_story") {{\n      const code = normalizeCode(body?.code);\n      const storyId = Number(body?.story_id ?? body?.storyId);\n\n      if (!code || !Number.isInteger(storyId)) {{\n        return responseJson(\n          {{ error: "Assessment code and story are required." }},\n          400\n        );\n      }}\n\n      try {{\n        const auth = await requireTeacher(request);\n        if (auth.error) return auth.error;\n\n        const host = await findHostByCode(code);\n        if (!host || host.teacherId !== auth.userId) {{\n          return responseJson({{ error: "Assessment session not found." }}, 404);\n        }}\n\n        const assessmentPeriod = host.assessmentSession?.assessmentPeriod || "BoSY";\n        const content = await getTeacherAssessmentContent(host.teacherId, assessmentPeriod);\n        const storyChoices = content.stories || [];\n        const story = storyChoices.find((item) => Number(item.id) === storyId) || storyChoices[storyId - 1];\n\n        if (!story || !story.title || !story.text) {{\n          return responseJson({{ error: "Selected story is not available." }}, 404);\n        }}\n\n        const updated = await prisma.hostSession.update({{\n          where: {{ id: host.id }},\n          data: {{\n            stage: "passage",\n            currentContent: story.text,\n            storyTitle: story.title,\n            ended: false,\n            linkedAt: host.linkedAt || new Date(),\n          }},\n        }});\n\n        return responseJson({{\n          status: "ok",\n          session: {{\n            id: updated.id,\n            code: updated.code,\n            stage: updated.stage,\n            current_content: updated.currentContent,\n            story_title: updated.storyTitle,\n            story_choices: buildStoryChoices(content.stories),\n            assessment_content: content,\n            connected: Boolean(updated.learnerId && updated.linkedAt),\n            linked_at: updated.linkedAt,\n            updated_at: updated.updatedAt,\n            passage_started_at: updated.passageStartedAt,\n            passage_paused_at: updated.passagePausedAt,\n            passage_paused_seconds: updated.passagePausedSeconds,\n          }},\n        }});\n      }} catch (error) {{\n        console.error("select_story error:", error);\n        return responseJson({{ error: "Unable to start the selected story." }}, 500);\n      }}\n    }}'''
    text = text[:m.start(1)] + new_block + text[m.end(1):m.start(2)] + m.group(2)

    path.write_text(text)


def patch_assessment_client():
    path = ROOT / "app/teacher/assessment/AssessmentClient.jsx"
    text = path.read_text()

    text = replace_exact(text, 'const STORIES = [', 'const DEFAULT_STORIES = [', "assessment client stories declaration")
    text = replace_exact(text, 'const QUESTIONS = [', 'const DEFAULT_QUESTIONS = [', "assessment client questions declaration")

    field_questions = '''\nconst FIELD_QUESTIONS = [\n  { index: 0, text: "Who is Dulnuwan?" },\n  { index: 1, text: "Who helps Dulnuwan in the fields?" },\n  { index: 2, text: "What do they do all morning?" },\n  { index: 3, text: "What do they eat for lunch?" },\n  { index: 4, text: "What does Dulnuwan see in the sky?" },\n  { index: 5, text: "What does Dulnuwan bend down to pick?" },\n];\n'''
    text = replace_exact(text, 'const FIELD_PASSAGE_TEXT =\n  "' + FIELD_TEXT + '";\n', 'const FIELD_PASSAGE_TEXT =\n  "' + FIELD_TEXT + '";\n' + field_questions, "assessment client field questions")

    state_anchor = '  const [storySelecting, setStorySelecting] = useState(false);'
    state_add = '''  const [storySelecting, setStorySelecting] = useState(false);\n  const [assessmentContent, setAssessmentContent] = useState({\n    letters: LETTERS,\n    words: WORDS,\n    stories: DEFAULT_STORIES,\n  });\n  const [manualMiscueReview, setManualMiscueReview] = useState(false);\n  const [comprehensionLockedQuestion, setComprehensionLockedQuestion] = useState(null);\n  const [learnerExperienceRating, setLearnerExperienceRating] = useState(null);\n  const [observationLevel, setObservationLevel] = useState(null);'''
    text = replace_exact(text, state_anchor, state_add, "assessment client runtime state")

    local_anchor = '  const period =\n    String(initialPeriod || "BoSY").trim() ||\n    "BoSY";'
    local_aliases = local_anchor + '''\n\n  const LETTERS = Array.isArray(assessmentContent?.letters) && assessmentContent.letters.length\n    ? assessmentContent.letters.map((value) => String(value))\n    : globalsThisDoesNotExist;'''
    # Use a safer insertion with explicit module aliases to avoid shadowing TDZ.\n
    # The local aliases need the module constants, so rename the module declarations first.\n    text = replace_exact(text, 'const LETTERS = [', 'const DEFAULT_LETTERS = [', "assessment client letters declaration")
    text = replace_exact(text, 'const WORDS = [', 'const DEFAULT_WORDS = [', "assessment client words declaration")
    text = replace_exact(text, 'const STORIES = [', 'const DEFAULT_STORIES = [', "assessment client stories already renamed") if 'const STORIES = [' in text else text
    # DEFAULT_STORIES declaration was already created above; fix the runtime state references.
    text = replace_exact(text, '    letters: LETTERS,\n    words: WORDS,', '    letters: DEFAULT_LETTERS,\n    words: DEFAULT_WORDS,', "runtime state default arrays")

    aliases = '''\n\n  const LETTERS = Array.isArray(assessmentContent?.letters) && assessmentContent.letters.length\n    ? assessmentContent.letters.map((value) => String(value))\n    : DEFAULT_LETTERS;\n  const WORDS = Array.isArray(assessmentContent?.words) && assessmentContent.words.length\n    ? assessmentContent.words.map((value) => String(value))\n    : DEFAULT_WORDS;\n  const STORIES = Array.isArray(assessmentContent?.stories) && assessmentContent.stories.length\n    ? assessmentContent.stories\n    : DEFAULT_STORIES;\n  const QUESTIONS = String(session?.story_title || "").trim().toLowerCase() === "a day in the fields"\n    ? FIELD_QUESTIONS\n    : DEFAULT_QUESTIONS;\n  const passageWordCount = passageText.split(/\\s+/).filter(Boolean).length;'''
    # passageText isn't defined until later, so insert aliases just after passageText declaration instead.
    text = replace_exact(text, '  const passageText =\n    session?.story_title === "A Day In The Fields"\n      ? FIELD_PASSAGE_TEXT\n      : PASSAGE_TEXT;', '''  const passageText =\n    activeStage === "passage" && String(session?.current_content || "").trim()\n      ? String(session.current_content)\n      : String(session?.story_title || "").trim().toLowerCase() === "a day in the fields"\n        ? FIELD_PASSAGE_TEXT\n        : PASSAGE_TEXT;\n\n  const LETTERS = Array.isArray(assessmentContent?.letters) && assessmentContent.letters.length\n    ? assessmentContent.letters.map((value) => String(value))\n    : DEFAULT_LETTERS;\n  const WORDS = Array.isArray(assessmentContent?.words) && assessmentContent.words.length\n    ? assessmentContent.words.map((value) => String(value))\n    : DEFAULT_WORDS;\n  const STORIES = Array.isArray(assessmentContent?.stories) && assessmentContent.stories.length\n    ? assessmentContent.stories\n    : DEFAULT_STORIES;\n  const QUESTIONS = String(session?.story_title || "").trim().toLowerCase() === "a day in the fields"\n    ? FIELD_QUESTIONS\n    : DEFAULT_QUESTIONS;\n  const passageWordCount = passageText.split(/\\s+/).filter(Boolean).length;''', "assessment client runtime content aliases")

    # Restore the constants used by the initial runtime state after module rename.
    text = replace_exact(text, '    letters: DEFAULT_LETTERS,\n    words: DEFAULT_WORDS,\n    stories: DEFAULT_STORIES,', '    letters: DEFAULT_LETTERS,\n    words: DEFAULT_WORDS,\n    stories: DEFAULT_STORIES,', "assessment client runtime defaults noop")

    hydration = '''\n      const runtimeContent = data?.session?.assessment_content;\n      if (runtimeContent) {\n        setAssessmentContent({\n          letters: Array.isArray(runtimeContent.letters) && runtimeContent.letters.length\n            ? runtimeContent.letters\n            : DEFAULT_LETTERS,\n          words: Array.isArray(runtimeContent.words) && runtimeContent.words.length\n            ? runtimeContent.words\n            : DEFAULT_WORDS,\n          stories: Array.isArray(runtimeContent.stories) && runtimeContent.stories.length\n            ? runtimeContent.stories\n            : DEFAULT_STORIES,\n        });\n      }\n'''
    text = replace_exact(text, '''        const data =\n          await response.json();\n\n        if (!response.ok) {''', hydration + '''\n        const data =\n          await response.json();\n\n        if (!response.ok) {''', "assessment client host_get hydration")

    # The previous replacement accidentally put hydration before data. Correct it by swapping the exact malformed block if present.
    malformed = hydration + '''\n        const data =\n          await response.json();'''
    if malformed in text:
        text = replace_exact(text, malformed, '''        const data =\n          await response.json();\n''' + hydration.replace('''      const runtimeContent = data?.session?.assessment_content;''', '''        const runtimeContent = data?.session?.assessment_content;''').replace('''        setAssessmentContent''','''        setAssessmentContent'''), "fix hydration order")

    # Story selection must use the selected DB-backed object, not hard-coded passages.
    text = replace_exact(text, '''        currentContent:\n          story.id === 1\n            ? PASSAGE_TEXT\n            : FIELD_PASSAGE_TEXT,\n        storyTitle: story.title,''', '''        currentContent: String(story.text || story.content || ""),\n        storyTitle: String(story.title || ""),''', "assessment client story selection")
    text = replace_exact(text, 'setActiveStage("passage");\n\n      try {', 'setActiveStage("passage");\n      setManualMiscueReview(false);\n\n      try {', "reset manual passage review")

    # Manual Finish Reading is a bottom prompt, never the large review overlay.
    text = replace_exact(text, '''                            onClick={() => {\n                              setMiscueReviewMode(true);\n                              setMiscueDrawerOpen(true);\n                              setSelectedPassageWord(null);\n                              setSelectedMiscueType(null);\n                              setMisreadWord("");\n                              setError("");\n                            }}''', '''                            onClick={() => {\n                              setManualMiscueReview(true);\n                              setMiscueDrawerOpen(false);\n                              setSelectedPassageWord(null);\n                              setSelectedMiscueType(null);\n                              setMisreadWord("");\n                              setError("");\n                            }}''', "manual finish button")
    text = replace_exact(text, '{!timeUpSelecting && (\n                        <div style={styles.passageFinishRow}>', '{!timeUpSelecting && !manualMiscueReview && (\n                        <div style={styles.passageFinishRow}>', "hide finish while reviewing miscues")

    manual_card = '''\n\n                      {!timeUpSelecting && manualMiscueReview && (\n                        <div style={styles.timeoutWorkflowCard}>\n                          <div style={styles.timeoutStepBadge}>REVIEW</div>\n                          <div style={styles.timeoutWorkflowTitle}>Check for additional miscued words</div>\n                          <p style={styles.timeoutWorkflowText}>\n                            Select any word above where you observed a miscue, add the miscue type,\n                            and optionally enter the word the learner actually said. This review is optional.\n                          </p>\n                          <button\n                            type="button"\n                            style={styles.timeoutConfirmButton}\n                            onClick={() => {\n                              setManualMiscueReview(false);\n                              void finishPassageReading(passageSeconds, passageWordCount);\n                            }}\n                            disabled={busy || passageFinalizingRef.current}\n                          >\n                            Confirm &amp; Proceed\n                          </button>\n                        </div>\n                      )}'''
    text = replace_exact(text, '''                    </div>\n\n                    {miscueDrawerOpen && typeof document !== "undefined"''', '''                    </div>''' + manual_card + '''\n\n                    {miscueDrawerOpen && typeof document !== "undefined"''', "manual bottom review prompt")

    # Remove the review-mode confirm button from the miscue drawer.
    drawer_confirm_pattern = r'\n\s*\{miscueReviewMode && \(\s*<button[\s\S]*?<\/button>\s*\)\s*\n\s*\}'}
    text, n = re.subn(drawer_confirm_pattern, '', text, count=1)
    if n != 1:
        raise RuntimeError("miscue drawer confirm button block not found")

    # Passage limits must follow the selected story length.
    text = text.replace('Math.min(100,', 'Math.min(passageWordCount,')
    text = text.replace('selectedIndex >= 100', 'selectedIndex >= passageWordCount')
    text = text.replace('selectedIndex < 0 || selectedIndex >= 100', 'selectedIndex < 0 || selectedIndex >= passageWordCount')
    text = text.replace('setPassageWordsRead(number);', 'setPassageWordsRead(number);')
    text = text.replace('{passageWordsRead\n                                  ? passageWordsRead\n                                  : "Not selected"}\n                                <span> / 100</span>', '{passageWordsRead\n                                  ? passageWordsRead\n                                  : "Not selected"}\n                                <span> / {passageWordCount}</span>')

    # Comprehension restraint: lock synchronously and visibly for the current question.
    text = replace_exact(text, '      answerActionLockRef.current = lockKey;\n      setAnswerLockKey(lockKey);\n      setBusy(true);', '      answerActionLockRef.current = lockKey;\n      setAnswerLockKey(lockKey);\n      setComprehensionLockedQuestion(questionIndex);\n      setBusy(true);', "comprehension lock state")
    text = replace_exact(text, '''      } catch (recordError) {\n        answerActionLockRef.current = "";\n        setAnswerLockKey("");\n        setError(''', '''      } catch (recordError) {\n        answerActionLockRef.current = "";\n        setAnswerLockKey("");\n        setComprehensionLockedQuestion(null);\n        setError(''', "comprehension lock error reset")
    text = replace_exact(text, '                            answerLockKey ===\n                            ("comprehension:" +\n                              questionIndex)', '                            (answerLockKey ===\n                              ("comprehension:" +\n                                questionIndex) ||\n                              comprehensionLockedQuestion === questionIndex)', "comprehension button restraint")

    # Observation state initialization when the completed assessment modal opens.
    text = replace_exact(text, '''      setTerminationRemarks(\n        current?.metrics?.remarks || ""\n      );\n      setTerminationObservationError("");''', '''      setTerminationRemarks(\n        current?.metrics?.remarks || ""\n      );\n      setLearnerExperienceRating(\n        Number(current?.metrics?.experience_rating ?? current?.metrics?.experienceRating ?? 0) || null\n      );\n      setObservationLevel(\n        Number(current?.metrics?.observation_level ?? current?.metrics?.observationLevel ?? 0) || null\n      );\n      setTerminationObservationError("");''', "completed observation initialization")

    # Completed save payload carries both new observation fields.
    text = replace_exact(text, '''          const payload = {\n            action: "commit_passage_assessment",\n            code,''', '''          const payload = {\n            action: "commit_passage_assessment",\n            code,\n            experience_rating: Number(learnerExperienceRating || 0),\n            observation_level: Number(observationLevel || 0),''', "assessment completion observation payload")
    text = replace_exact(text, '''          if (!response || !response.ok) {\n            await putMutation({''', '''          if (!response || !response.ok) {\n            if (Number(payload.experience_rating) < 1 || Number(payload.experience_rating) > 5) {\n              throw new Error("Please select a learner experience rating from 1 to 5.");\n            }\n            if (Number(payload.observation_level) < 1 || Number(payload.observation_level) > 4) {\n              throw new Error("Please select an observation level from 1 to 4.");\n            }\n            await putMutation({''', "observation validation")

    # Replace completed observation modal body with the required reviewer panel.
    old_start = '''              <p style={styles.observationSubtitle}>\n                {activeStage === "completed"\n                  ? "The assessment is complete. Add any optional teacher remarks before saving the assessment."\n                  : "Part 1 Task 1 ended with a score of 0. Add any optional teacher remarks before saving the assessment."}\n              </p>'''
    new_start = '''              <p style={styles.observationSubtitle}>\n                {activeStage === "completed"\n                  ? "Review the assessment summary, record the learner experience and observation level, and add optional remarks before saving."\n                  : "Part 1 Task 1 ended with a score of 0. Add any optional teacher remarks before saving the assessment."}\n              </p>\n\n              {activeStage === "completed" && (\n                <div style={styles.assessmentReviewSummary}>\n                  <div style={styles.assessmentReviewGrid}>\n                    <div><span>Part 1 Task 1</span><strong>{Number(latestSessionRef.current?.metrics?.task1Score ?? latestSessionRef.current?.metrics?.task1_score ?? 0)} / {LETTERS.length}</strong></div>\n                    <div><span>Part 1 Task 2</span><strong>{Number(latestSessionRef.current?.metrics?.task2Score ?? latestSessionRef.current?.metrics?.task2_score ?? 0)} / {WORDS.length}</strong></div>\n                    <div><span>Story Choice</span><strong>{latestSessionRef.current?.story_title || "—"}</strong></div>\n                  </div>\n\n                  <div style={styles.assessmentReviewBlock}>\n                    <div style={styles.assessmentReviewBlockTitle}>Passage Miscues</div>\n                    {passageMiscues.length ? passageMiscues.map((item, index) => {\n                      const sourceWord = passageText.split(/\\s+/).filter(Boolean)[Number(item.wordIndex)] || "Unknown word";\n                      return (\n                        <div key={`summary-miscue-${index}`} style={styles.assessmentReviewRow}>\n                          <span>{sourceWord}</span>\n                          <span>{item.miscueType}{item.misreadWord ? ` — learner said "${item.misreadWord}"` : ""}</span>\n                        </div>\n                      );\n                    }) : <div style={styles.assessmentReviewEmpty}>No miscues recorded.</div>}\n                  </div>\n\n                  <div style={styles.assessmentReviewBlock}>\n                    <div style={styles.assessmentReviewBlockTitle}>Comprehension</div>\n                    <div style={styles.comprehensionResultGrid}>\n                      {passageDraftRef.current.comprehension.map((item) => (\n                        <div key={`summary-question-${item.questionIndex}`} style={item.isCorrect ? styles.comprehensionResultCorrect : styles.comprehensionResultIncorrect}>\n                          Q{Number(item.questionIndex) + 1}: {item.isCorrect ? "Correct" : "Incorrect"}\n                        </div>\n                      ))}\n                    </div>\n                  </div>\n                </div>\n              )}'''
    text = replace_exact(text, old_start, new_start, "completed observation summary")

    # Add completed-only fields before the remarks field.
    insert_before = '''              <label style={styles.observationField}>\n                <span>\n                  Remarks <span style={styles.optionalLabel}>(optional)</span>'''
    fields = '''              {activeStage === "completed" && (\n                <>\n                  <div style={styles.observationField}>\n                    <span>Learner Experience</span>\n                    <div style={styles.experienceEmojiRow}>\n                      {[\"😞\", \"🙁\", \"😐\", \"🙂\", \"😄\"].map((emoji, index) => {\n                        const rating = index + 1;\n                        return (\n                          <button\n                            key={`experience-${rating}`}\n                            type="button"\n                            style={rating === learnerExperienceRating ? styles.experienceEmojiSelected : styles.experienceEmojiButton}\n                            onClick={() => setLearnerExperienceRating(rating)}\n                            disabled={savingTerminationObservation}\n                            aria-label={`Learner experience ${rating} of 5`}\n                          >\n                            <span>{emoji}</span><small>{rating}</small>\n                          </button>\n                        );\n                      })}\n                    </div>\n                  </div>\n\n                  <div style={styles.observationField}>\n                    <span>Observation Level</span>\n                    <div style={styles.observationLevelRow}>\n                      {[1, 2, 3, 4].map((level) => (\n                        <button\n                          key={`observation-level-${level}`}\n                          type="button"\n                          style={level === observationLevel ? styles.observationLevelSelected : styles.observationLevelButton}\n                          onClick={() => setObservationLevel(level)}\n                          disabled={savingTerminationObservation}\n                        >\n                          {level}\n                        </button>\n                      ))}\n                    </div>\n                  </div>\n                </>\n              )}\n\n''' + insert_before
    text = replace_exact(text, insert_before, fields, "completed observation fields")

    # Add validation before beginning completed commit fetch.
    text = replace_exact(text, '''        if (activeStage === "completed") {\n          const draft =''', '''        if (activeStage === "completed") {\n          if (!learnerExperienceRating || !observationLevel) {\n            throw new Error("Please select the learner experience and observation level before saving the assessment.");\n          }\n          const draft =''', "completed observation required validation")

    # Add styles for the reviewer panel.
    style_anchor = '''  observationField: {\n    display:\n      "flex",'''
    styles = '''  assessmentReviewSummary: {\n    display: "flex",\n    flexDirection: "column",\n    gap: "12px",\n    margin: "0 0 18px",\n    padding: "14px",\n    border: "1px solid #d8e5ef",\n    borderRadius: "14px",\n    background: "#eef6fb",\n    textAlign: "left",\n  },\n  assessmentReviewGrid: {\n    display: "grid",\n    gridTemplateColumns: "repeat(3,minmax(0,1fr))",\n    gap: "8px",\n  },\n  assessmentReviewGridItem: {},\n  assessmentReviewGrid: {},\n  assessmentReviewBlock: {\n    paddingTop: "8px",\n    borderTop: "1px solid #dbe7f0",\n  },\n  assessmentReviewBlockTitle: {\n    color: "#2d5573",\n    fontSize: "12px",\n    fontWeight: "950",\n    marginBottom: "7px",\n  },\n  assessmentReviewRow: {\n    display: "flex",\n    justifyContent: "space-between",\n    gap: "10px",\n    padding: "6px 0",\n    color: "#4f6a80",\n    fontSize: "12px",\n    borderBottom: "1px solid #e2ebf2",\n  },\n  assessmentReviewEmpty: {\n    color: "#8294a5",\n    fontSize: "12px",\n  },\n  comprehensionResultGrid: {\n    display: "grid",\n    gridTemplateColumns: "repeat(3,minmax(0,1fr))",\n    gap: "7px",\n  },\n  comprehensionResultCorrect: {\n    padding: "7px",\n    borderRadius: "8px",\n    background: "#e8f6ed",\n    color: "#23764a",\n    fontSize: "11px",\n    fontWeight: "900",\n    textAlign: "center",\n  },\n  comprehensionResultIncorrect: {\n    padding: "7px",\n    borderRadius: "8px",\n    background: "#fff0f2",\n    color: "#b32639",\n    fontSize: "11px",\n    fontWeight: "900",\n    textAlign: "center",\n  },\n  experienceEmojiRow: {\n    display: "flex",\n    justifyContent: "center",\n    gap: "8px",\n    flexWrap: "wrap",\n    marginTop: "4px",\n  },\n  experienceEmojiButton: {\n    minWidth: "58px",\n    minHeight: "62px",\n    border: "1px solid #d2dfeb",\n    borderRadius: "12px",\n    background: "#ffffff",\n    color: "#536f86",\n    cursor: "pointer",\n  },\n  experienceEmojiSelected: {\n    minWidth: "58px",\n    minHeight: "62px",\n    border: "2px solid #2f73c9",\n    borderRadius: "12px",\n    background: "#eaf3fb",\n    color: "#1559a6",\n    cursor: "pointer",\n    boxShadow: "0 5px 12px rgba(47,115,201,.16)",\n  },\n  observationLevelRow: {\n    display: "flex",\n    justifyContent: "center",\n    gap: "10px",\n    marginTop: "4px",\n  },\n  observationLevelButton: {\n    width: "52px",\n    height: "44px",\n    border: "1px solid #d2dfeb",\n    borderRadius: "11px",\n    background: "#ffffff",\n    color: "#536f86",\n    fontSize: "16px",\n    fontWeight: "900",\n    cursor: "pointer",\n  },\n  observationLevelSelected: {\n    width: "52px",\n    height: "44px",\n    border: "2px solid #1559a6",\n    borderRadius: "11px",\n    background: "#eaf3fb",\n    color: "#1559a6",\n    fontSize: "16px",\n    fontWeight: "950",\n    cursor: "pointer",\n  },\n\n''' + style_anchor
    text = replace_exact(text, style_anchor, styles, "assessment review styles")

    path.write_text(text)


def patch_commit_route():
    path = ROOT / "app/api/assessment/commit/route.js"
    text = path.read_text()

    text = replace_exact(text, 'const PASSAGE_TEXT =\n  "' + PARA_TEXT + '";', 'const PASSAGE_TEXT =\n  "' + PARA_TEXT + '";', "commit passage constant noop")

    text = replace_exact(text, '''  const remarks = String(body?.remarks ?? "").trim();''', '''  const remarks = String(body?.remarks ?? "").trim();\n  const experienceRating = Number(body?.experience_rating ?? body?.experienceRating ?? 0);\n  const observationLevel = Number(body?.observation_level ?? body?.observationLevel ?? 0);''', "commit observation input")

    text = replace_exact(text, '''  if (remarks.length > 5000) {''', '''  if (experienceRating < 1 || experienceRating > 5 || !Number.isInteger(experienceRating)) {\n    return responseJson({ error: "Learner experience rating must be between 1 and 5." }, 400);\n  }\n\n  if (observationLevel < 1 || observationLevel > 4 || !Number.isInteger(observationLevel)) {\n    return responseJson({ error: "Observation level must be between 1 and 4." }, 400);\n  }\n\n  if (remarks.length > 5000) {''', "commit observation validation")

    host_insert = '''\n    const assessmentContent = await prisma.assessmentContent.findMany({\n      where: {\n        teacherId: host.teacherId,\n        assessmentPeriod: host.assessmentSession.assessmentPeriod,\n        category: "stories",\n      },\n      orderBy: { position: "asc" },\n    });\n    const selectedStory = assessmentContent.find(\n      (item) => item.storyTitle === host.storyTitle\n    );\n    const passageWordCount = selectedStory?.content\n      ? selectedStory.content.trim().split(/\\s+/).filter(Boolean).length\n      : PASSAGE_TEXT.trim().split(/\\s+/).filter(Boolean).length;\n    const safeWordsRead = Math.min(passageWordCount, wordsRead);\n'''
    text = replace_exact(text, '''    if (host.stage !== "comprehension") {''', host_insert + '''\n    if (host.stage !== "comprehension") {''', "commit dynamic passage content")

    # Dynamic passage bounds and time-limit omissions.
    text = text.replace('wordIndex >= 0 &&\n      wordIndex < 100', 'wordIndex >= 0 &&\n      wordIndex < passageWordCount')
    text = text.replace('for (let index = wordsRead; index < 100; index += 1)', 'for (let index = safeWordsRead; index < passageWordCount; index += 1)')
    text = text.replace('const actualWordsRead = Math.max(0, passageWordCount - totalMiscues);', 'const actualWordsRead = safeWordsRead;')
    text = text.replace('  const wordsRead = Math.min(\n    100,', '  const wordsRead = Math.min(\n    100000,')

    text = replace_exact(text, '''          timerSeconds,\n          classificationLabel: classification,\n          remarks,''', '''          timerSeconds,\n          classificationLabel: classification,\n          experienceRating,\n          observationLevel,\n          remarks,''', "commit observation metrics update")
    text = replace_exact(text, '''          timerSeconds,\n          classificationLabel: classification,\n          remarks,\n        },''', '''          timerSeconds,\n          classificationLabel: classification,\n          experienceRating,\n          observationLevel,\n          remarks,\n        },''', "commit observation metrics create")

    path.write_text(text)


def main():
    patch_teacher_page()
    patch_api_route()
    patch_assessment_client()
    patch_commit_route()
    print("CRL assessment passage/comprehension/content patch prepared.")


if __name__ == "__main__":
    main()
