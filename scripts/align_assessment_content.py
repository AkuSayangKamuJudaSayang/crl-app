from __future__ import annotations

from pathlib import Path
import re

ROOT = Path.cwd()
PARA = "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man."
FIELDS = "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil."
LETTERS = ["M", "S", "A", "L", "O", "B", "E", "U", "R", "T"]
WORDS = ["clap", "jump", "eat", "drink", "stand", "dance", "fly", "pencil", "basket", "helmet"]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one exact match, found {count}")
    return text.replace(old, new, 1)


def replace_regex(text: str, pattern: str, new: str, label: str, flags: int = re.DOTALL) -> str:
    matches = list(re.finditer(pattern, text, flags))
    if len(matches) != 1:
        raise RuntimeError(f"{label}: expected exactly one regex match, found {len(matches)}")
    match = matches[0]
    return text[:match.start()] + new + text[match.end():]


def js_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def js_array(values: list[str]) -> str:
    return "[" + ", ".join(js_string(v) for v in values) + "]"


def patch_teacher_page() -> None:
    path = ROOT / "app/teacher/page.jsx"
    text = path.read_text(encoding="utf-8")

    defaults = f'''const DEFAULT_CONTENT = {{
  BoSY: {{
    letters: {js_array(LETTERS)},
    words: {js_array(WORDS)},
    stories: [
      {{
        id: 1,
        title: "Para the Parrot",
        text: {js_string(PARA)},
      }},
      {{
        id: 2,
        title: "A Day in the Fields",
        text: {js_string(FIELDS)},
      }},
    ],
  }},
  MoSY: {{
    letters: {js_array(LETTERS)},
    words: {js_array(WORDS)},
    stories: [
      {{
        id: 1,
        title: "Para the Parrot",
        text: {js_string(PARA)},
      }},
      {{
        id: 2,
        title: "A Day in the Fields",
        text: {js_string(FIELDS)},
      }},
    ],
  }},
  EoSY: {{
    letters: {js_array(LETTERS)},
    words: {js_array(WORDS)},
    stories: [
      {{
        id: 1,
        title: "Para the Parrot",
        text: {js_string(PARA)},
      }},
      {{
        id: 2,
        title: "A Day in the Fields",
        text: {js_string(FIELDS)},
      }},
    ],
  }},
}};'''
    text = replace_regex(
        text,
        r"const DEFAULT_CONTENT = \{.*?\n\};",
        defaults,
        "teacher DEFAULT_CONTENT",
    )

    text, count = re.subn(
        r"\s*<[^>]*>\s*Assessment content is stored securely in the class database\.\s*</[^>]*>",
        "",
        text,
        count=1,
        flags=re.DOTALL,
    )
    if count != 1:
        if "Assessment content is stored securely in the class database." in text:
            text = text.replace("Assessment content is stored securely in the class database.", "", 1)
        else:
            raise RuntimeError("Manage Assessment subtitle was not found")

    path.write_text(text, encoding="utf-8")


def patch_assessment_client() -> None:
    path = ROOT / "app/teacher/assessment/AssessmentClient.jsx"
    text = path.read_text(encoding="utf-8")

    text = replace_once(text, "const LETTERS = [", "let LETTERS = [", "assessment client LETTERS declaration")
    text = replace_once(text, "const WORDS = [", "let WORDS = [", "assessment client WORDS declaration")
    text = replace_once(text, "const STORIES = [", "let STORIES = [", "assessment client STORIES declaration")
    text = replace_once(text, "const PASSAGE_TEXT =", "let PASSAGE_TEXT =", "assessment client PASSAGE_TEXT declaration")
    text = replace_once(text, "const FIELD_PASSAGE_TEXT =", "let FIELD_PASSAGE_TEXT =", "assessment client FIELD_PASSAGE_TEXT declaration")
    text = replace_once(text, "const QUESTIONS = [", "let QUESTIONS = [", "assessment client QUESTIONS declaration")

    runtime_constants = f'''\nconst DEFAULT_PARA_QUESTIONS = [
  {{ index: 0, text: "What must Para look for?" }},
  {{ index: 1, text: "What time or part of the day is it?" }},
  {{ index: 2, text: "What does Para land on?" }},
  {{ index: 3, text: "Who does Para see?" }},
  {{ index: 4, text: "What else is the police officer doing besides directing traffic?" }},
  {{ index: 5, text: "What could the police officer be feeling?" }},
];

const DEFAULT_FIELDS_QUESTIONS = [
  {{ index: 0, text: "Who is Dulnuwan?" }},
  {{ index: 1, text: "Who helps Dulnuwan in the fields?" }},
  {{ index: 2, text: "What does Dulnuwan do to the field today?" }},
  {{ index: 3, text: "What do Bugan, Ali, and Dina do?" }},
  {{ index: 4, text: "What do they eat for lunch?" }},
  {{ index: 5, text: "What does Dulnuwan bend to pick up?" }},
];

function applyRuntimeAssessmentContent(session) {{
  const content = session?.assessment_content;
  if (!content) return false;

  if (Array.isArray(content.letters) && content.letters.length) {{
    LETTERS.length = 0;
    LETTERS.push(...content.letters.map((item) => String(item).trim()).filter(Boolean));
  }}

  if (Array.isArray(content.words) && content.words.length) {{
    WORDS.length = 0;
    WORDS.push(...content.words.map((item) => String(item).trim()).filter(Boolean));
  }}

  if (Array.isArray(content.stories) && content.stories.length) {{
    STORIES.length = 0;
    STORIES.push(...content.stories.map((story, index) => ({{
      id: story?.id ?? index + 1,
      title: String(story?.title || `Story ${{index + 1}}`).trim(),
      description: String(story?.description || "").trim(),
      text: String(story?.text || ""),
      available: true,
    }})));
  }}

  const storyTitle = String(session?.story_title || "").trim().toLowerCase();
  const story = STORIES.find(
    (item) => String(item?.title || "").trim().toLowerCase() === storyTitle
  );

  if (story?.text) {{
    if (storyTitle.includes("day in the fields")) FIELD_PASSAGE_TEXT = story.text;
    else PASSAGE_TEXT = story.text;
  }}

  QUESTIONS = storyTitle.includes("day in the fields")
    ? DEFAULT_FIELDS_QUESTIONS.slice()
    : DEFAULT_PARA_QUESTIONS.slice();

  return true;
}}
'''

    text = replace_once(
        text,
        "\nexport default function TeacherAssessmentPage(",
        runtime_constants + "\nexport default function TeacherAssessmentPage(",
        "assessment client runtime content helpers",
    )

    text = replace_once(
        text,
        '  const [\n    session,\n    setSession,\n  ] = useState(null);',
        '  const [\n    session,\n    setSession,\n  ] = useState(null);\n\n  const [, setAssessmentContentVersion] = useState(0);',
        "assessment client content rerender state",
    )

    text = replace_once(
        text,
        '''  const passageText =
    session?.story_title === "A Day In The Fields"
      ? FIELD_PASSAGE_TEXT
      : PASSAGE_TEXT;''',
        '''  const passageText =
    activeStage === "passage" &&
    String(session?.current_content || "").trim()
      ? String(session.current_content)
      : session?.story_title === "A Day In The Fields"
        ? FIELD_PASSAGE_TEXT
        : PASSAGE_TEXT;''',
        "assessment client dynamic passage text",
    )

    text = replace_once(
        text,
        '''        const data =
          await response.json();

        if (!response.ok) {''',
        '''        const data =
          await response.json();

        if (data?.session?.assessment_content) {
          if (applyRuntimeAssessmentContent(data.session)) {
            setAssessmentContentVersion((version) => version + 1);
          }
        }

        if (!response.ok) {''',
        "assessment client host_get content hydration",
    )

    text = replace_once(
        text,
        '''      const next = {
        code,
        stage: "passage",
        currentContent:
          story.id === 1
            ? PASSAGE_TEXT
            : FIELD_PASSAGE_TEXT,
        storyTitle: story.title,
      };''',
        '''      const next = {
        code,
        stage: "passage",
        currentContent:
          story?.text ||
          (story?.id === 2 ? FIELD_PASSAGE_TEXT : PASSAGE_TEXT),
        storyTitle: story.title,
      };''',
        "assessment client selected story runtime text",
    )

    # Use the configured passage length everywhere the stable client previously assumed 100.
    text = text.replace(
        'const selectedIndex =\n          Number(selectedPassageWord || 0) - 1;\n\n        if (selectedIndex < 0 || selectedIndex >= 100) return;',
        'const selectedIndex =\n          Number(selectedPassageWord || 0) - 1;\n        const passageWordCount = passageText.trim().split(/\\s+/).filter(Boolean).length;\n\n        if (selectedIndex < 0 || selectedIndex >= passageWordCount) return;',
        1,
    )
    text = text.replace(
        'if (selectedIndex < 0 || selectedIndex >= 100) return;\n\n        const nextType',
        'const passageWordCount = passageText.trim().split(/\\s+/).filter(Boolean).length;\n        if (selectedIndex < 0 || selectedIndex >= passageWordCount) return;\n\n        const nextType',
        1,
    )
    text = text.replace(
        'const wordsRead = Math.min(\n            100,',
        'const wordsRead = Math.min(\n            passageText.trim().split(/\\s+/).filter(Boolean).length,',
        1,
    )
    text = text.replace(
        '(passageSeconds >= 120\n                    ? passageWordsRead || 0\n                    : 100)',
        '(passageSeconds >= 120\n                    ? passageWordsRead || 0\n                    : passageText.trim().split(/\\s+/).filter(Boolean).length)',
        1,
    )
    text = text.replace(
        'passageSeconds >= 120\n                                    ? passageWordsRead || 0\n                                    : 100',
        'passageSeconds >= 120\n                                    ? passageWordsRead || 0\n                                    : passageText.trim().split(/\\s+/).filter(Boolean).length',
        1,
    )
    text = text.replace('> / 100</span>', '> / {passageText.trim().split(/\\s+/).filter(Boolean).length}</span>', 1)

    path.write_text(text, encoding="utf-8")


def patch_assessment_api() -> None:
    path = ROOT / "app/api/assessment/route.js"
    text = path.read_text(encoding="utf-8")

    defaults = f'''const DEFAULT_CONTENT_FOR_PERIOD = {{
  BoSY: {{
    letters: {js_array(LETTERS)},
    words: {js_array(WORDS)},
    stories: [
      {{ title: "Para the Parrot", text: {js_string(PARA)} }},
      {{ title: "A Day in the Fields", text: {js_string(FIELDS)} }},
    ],
  }},
  MoSY: {{
    letters: {js_array(LETTERS)},
    words: {js_array(WORDS)},
    stories: [
      {{ title: "Para the Parrot", text: {js_string(PARA)} }},
      {{ title: "A Day in the Fields", text: {js_string(FIELDS)} }},
    ],
  }},
  EoSY: {{
    letters: {js_array(LETTERS)},
    words: {js_array(WORDS)},
    stories: [
      {{ title: "Para the Parrot", text: {js_string(PARA)} }},
      {{ title: "A Day in the Fields", text: {js_string(FIELDS)} }},
    ],
  }},
}};'''
    text = replace_regex(text, r"const DEFAULT_CONTENT_FOR_PERIOD = \{.*?\n\};", defaults, "assessment API default content")

    helpers = '''\n\nasync function ensureTeacherPeriodContent(teacherId, period) {\n  let items = await prisma.assessmentContent.findMany({\n    where: { teacherId, assessmentPeriod: period },\n    orderBy: [{ category: "asc" }, { position: "asc" }],\n  });\n\n  if (!items.length) {\n    const defaults = DEFAULT_CONTENT_FOR_PERIOD[period] || DEFAULT_CONTENT_FOR_PERIOD.BoSY;\n    const data = [];\n    for (const category of ["letters", "words", "stories"]) {\n      defaults[category].forEach((item, index) => {\n        const isStory = category === "stories";\n        data.push({\n          teacherId,\n          assessmentPeriod: period,\n          category,\n          position: index + 1,\n          content: isStory ? item.text : item,\n          storyTitle: isStory ? item.title : null,\n        });\n      });\n    }\n    await prisma.assessmentContent.createMany({ data });\n    items = await prisma.assessmentContent.findMany({\n      where: { teacherId, assessmentPeriod: period },\n      orderBy: [{ category: "asc" }, { position: "asc" }],\n    });\n  }\n\n  // Repair only the known placeholder stories from older CRL-App versions.\n  const placeholders = new Map([\n    ["The Helpful Friend|A child sees a friend carrying a heavy basket. The child helps carry it home.", { title: "A Day in the Fields", text: DEFAULT_CONTENT_FOR_PERIOD.BoSY.stories[1].text }],\n    ["A Morning Walk|The children walk together and help one another on their way to school.", { title: "Para the Parrot", text: DEFAULT_CONTENT_FOR_PERIOD.BoSY.stories[0].text }],\n    ["The Kind Child|A kind child notices someone who needs help and chooses to lend a hand.", { title: "Para the Parrot", text: DEFAULT_CONTENT_FOR_PERIOD.BoSY.stories[0].text }],\n    ["Para the Parrot|Para is a helpful parrot. Every morning, Para greets the children and helps them find their books.", { title: "Para the Parrot", text: DEFAULT_CONTENT_FOR_PERIOD.BoSY.stories[0].text }],\n  ]);\n\n  for (const item of items) {\n    if (item.category !== "stories") continue;\n    const repair = placeholders.get(`${item.storyTitle || ""}|${item.content || ""}`);\n    if (!repair) continue;\n    await prisma.assessmentContent.update({\n      where: { id: item.id },\n      data: { storyTitle: repair.title, content: repair.text },\n    });\n  }\n\n  items = await prisma.assessmentContent.findMany({\n    where: { teacherId, assessmentPeriod: period },\n    orderBy: [{ category: "asc" }, { position: "asc" }],\n  });\n  return items;\n}\n\nasync function getTeacherRuntimeContent(teacherId, period) {\n  const items = await ensureTeacherPeriodContent(teacherId, period);\n  return {\n    letters: items.filter((item) => item.category === "letters").map((item) => item.content || ""),\n    words: items.filter((item) => item.category === "words").map((item) => item.content || ""),\n    stories: items.filter((item) => item.category === "stories").map((item) => ({\n      id: item.id,\n      title: item.storyTitle || "Untitled Story",\n      description:\n        String(item.storyTitle || "").toLowerCase() === "para the parrot"\n          ? "A story about a parrot flying to the market."\n          : String(item.storyTitle || "").toLowerCase() === "a day in the fields"\n            ? "Join the farmers as they work in the terraces."\n            : "",
      text: item.content || "",\n      available: true,\n    })),\n  };\n}\n'''
    text = replace_once(text, "\nfunction responseJson(data, status = 200) {", helpers + "\nfunction responseJson(data, status = 200) {", "assessment API runtime helpers")

    # get_activities: seed/migrate independently by period and never return the made-up placeholders.
    old_get = '''      let items = await prisma.assessmentContent.findMany({
        where: { teacherId: userId },
        orderBy: [
          { assessmentPeriod: "asc" },
          { category: "asc" },
          { position: "asc" },
        ],
      });

      if (!items.length) {
        const seed = [];
        for (const period of Object.keys(DEFAULT_CONTENT_FOR_PERIOD)) {
          const periodContent = DEFAULT_CONTENT_FOR_PERIOD[period];

          for (const category of ["letters", "words", "stories"]) {
            periodContent[category].forEach((item, index) => {
              seed.push({
                teacherId: userId,
                assessmentPeriod: period,
                category,
                position: index + 1,
                content: category === "stories" ? item.text : item,
                storyTitle: category === "stories" ? item.title : null,
              });
            });
          }
        }

        await prisma.assessmentContent.createMany({ data: seed });
        items = await prisma.assessmentContent.findMany({
          where: { teacherId: userId },
          orderBy: [
            { assessmentPeriod: "asc" },
            { category: "asc" },
            { position: "asc" },
          ],
        });
      }'''
    new_get = '''      for (const contentPeriod of Object.keys(DEFAULT_CONTENT_FOR_PERIOD)) {
        await ensureTeacherPeriodContent(userId, contentPeriod);
      }

      const items = await prisma.assessmentContent.findMany({
        where: { teacherId: userId },
        orderBy: [
          { assessmentPeriod: "asc" },
          { category: "asc" },
          { position: "asc" },
        ],
      });'''
    text = replace_once(text, old_get, new_get, "assessment API get_activities")

    # host_get: expose the exact teacher-owned content in the same session payload used by Conduct Assessment.
    text = replace_once(
        text,
        '''      if (!host.linkedAt && !connected) {
        stage = "waiting";
        currentContent = null;
      }

      return responseJson({''',
        '''      if (!host.linkedAt && !connected) {
        stage = "waiting";
        currentContent = null;
      }

      const runtimePeriod = host.assessmentSession?.assessmentPeriod || "BoSY";
      const assessmentContent = await getTeacherRuntimeContent(userId, runtimePeriod);
      const selectedStory = assessmentContent.stories.find(
        (story) => String(story.title || "").trim().toLowerCase() ===
          String(host.storyTitle || "").trim().toLowerCase()
      );
      if (stage === "passage" && selectedStory?.text) {
        currentContent = selectedStory.text;
      }

      return responseJson({''',
        "assessment API host_get runtime content",
    )
    text = replace_once(text, "          story_choices: STORY_CHOICES,", "          story_choices: assessmentContent.stories,\n          assessment_content: assessmentContent,", "assessment API host_get content payload")

    # learner_join: initialize the first item from this teacher's assessment content.
    marker = '''      /*
       * The assessment code is single-use. linkedAt is the server-side
       * consumed marker. The conditional update is atomic, so two learners
       * cannot both successfully claim the same code.
       */
      const claim ='''
    insertion = '''      const runtimePeriod = host.assessmentSession?.assessmentPeriod || "BoSY";
      const runtimeContent = await getTeacherRuntimeContent(host.teacherId, runtimePeriod);

      /*
       * The assessment code is single-use. linkedAt is the server-side
       * consumed marker. The conditional update is atomic, so two learners
       * cannot both successfully claim the same code.
       */
      const claim ='''
    text = replace_once(text, marker, insertion, "assessment API learner join runtime content")
    text = text.replace(
        '            currentContent:\n              host.currentContent ||\n              LETTERS[0],',
        '            currentContent:\n              host.currentContent ||\n              runtimeContent.letters[0] ||\n              LETTERS[0],',
        1,
    )

    # select_story: select by teacher-owned story row, never by a hard-coded story.
    old_story = '''      const stories = {
        1: {
          title: "Para The Parrot",
          passage: PASSAGE_TEXT,
        },
      };

      const selected = stories[storyId];

      if (!selected) {'''
    new_story = '''      const selected = await prisma.assessmentContent.findFirst({
        where: {
          id: storyId,
          teacherId: userId,
          assessmentPeriod: host.assessmentSession?.assessmentPeriod || "BoSY",
          category: "stories",
        },
      });

      if (!selected) {'''
    text = replace_once(text, old_story, new_story, "assessment API select_story database row")
    text = text.replace(
        '          currentContent: selected.passage,\n          storyTitle: selected.title,',
        '          currentContent: selected.content || "",\n          storyTitle: selected.storyTitle || "Untitled Story",',
        1,
    )

    # Host start: first letter comes from the selected teacher content.
    start_marker = '''      const host = await prisma.hostSession.create({'''
    insert = '''      const runtimeContent = await getTeacherRuntimeContent(userId, period);

      const host = await prisma.hostSession.create({'''
    text = replace_once(text, start_marker, insert, "assessment API host_start runtime content")
    text = text.replace(
        '          currentContent: LETTERS[0],',
        '          currentContent: runtimeContent.letters[0] || LETTERS[0],',
        1,
    )

    # record_letter: validate/store the configured teacher item.
    letter_marker = '''      const letterIndex =
        Number(
          body?.letter_index ??
            body?.letterIndex
        );'''
    letter_insert = '''      const letterSession = await prisma.assessmentSession.findUnique({
        where: { id: host.assessmentSessionId },
        select: { assessmentPeriod: true },
      });
      const runtimeContent = await getTeacherRuntimeContent(
        userId,
        letterSession?.assessmentPeriod || "BoSY"
      );
      const configuredLetters = runtimeContent.letters.length ? runtimeContent.letters : LETTERS;

      const letterIndex =
        Number(
          body?.letter_index ??
            body?.letterIndex
        );'''
    text = replace_once(text, letter_marker, letter_insert, "assessment API record_letter runtime items")
    rstart = text.index('    if (\n      action ===\n      "record_letter"')
    rend = text.index('    /* ====================================================================== */\n    /* RECORD WORD', rstart)
    reg = text[rstart:rend]
    reg = reg.replace('LETTERS.length', 'configuredLetters.length')
    reg = reg.replace('LETTERS[', 'configuredLetters[')
    text = text[:rstart] + reg + text[rend:]

    # record_word: validate/store the configured teacher item.
    word_marker = '''      const wordIndex =
        Number(
          body?.word_index ??
            body?.wordIndex
        );'''
    word_insert = '''      const wordSession = await prisma.assessmentSession.findUnique({
        where: { id: host.assessmentSessionId },
        select: { assessmentPeriod: true },
      });
      const runtimeContent = await getTeacherRuntimeContent(
        userId,
        wordSession?.assessmentPeriod || "BoSY"
      );
      const configuredWords = runtimeContent.words.length ? runtimeContent.words : WORDS;

      const wordIndex =
        Number(
          body?.word_index ??
            body?.wordIndex
        );'''
    text = replace_once(text, word_marker, word_insert, "assessment API record_word runtime items")
    wstart = text.index('    if (\n      action ===\n      "record_word"')
    wend = text.index('    /* ====================================================================== */\n    /* SELECT STORY', wstart)
    reg = text[wstart:wend]
    reg = reg.replace('WORDS.length', 'configuredWords.length')
    reg = reg.replace('WORDS[', 'configuredWords[')
    text = text[:wstart] + reg + text[wend:]

    # calculateMetrics: use configured item counts and the selected story passage word count.
    calc_marker = '''async function calculateMetrics(
  tx,
  assessmentSessionId
) {
  const [
    letters,'''
    calc_insert = '''async function calculateMetrics(
  tx,
  assessmentSessionId
) {
  const sessionMeta = await tx.assessmentSession.findUnique({
    where: { id: assessmentSessionId },
    select: { teacherId: true, assessmentPeriod: true },
  });
  const hostMeta = await tx.hostSession.findFirst({
    where: { assessmentSessionId },
    select: { storyTitle: true },
  });
  const runtimeRows = sessionMeta
    ? await tx.assessmentContent.findMany({
        where: {
          teacherId: sessionMeta.teacherId,
          assessmentPeriod: sessionMeta.assessmentPeriod,
        },
        orderBy: [{ category: "asc" }, { position: "asc" }],
      })
    : [];
  const configuredLetterCount = Math.max(
    1,
    runtimeRows.filter((item) => item.category === "letters").length || LETTERS.length
  );
  const configuredWordCount = Math.max(
    1,
    runtimeRows.filter((item) => item.category === "words").length || WORDS.length
  );
  const metricStory = runtimeRows.find(
    (item) =>
      item.category === "stories" &&
      String(item.storyTitle || "").trim().toLowerCase() ===
        String(hostMeta?.storyTitle || "").trim().toLowerCase()
  );
  const metricPassageWordCount = (metricStory?.content || PASSAGE_TEXT).trim().split(/\\s+/).filter(Boolean).length;

  const [
    letters,'''
    text = replace_once(text, calc_marker, calc_insert, "assessment API calculateMetrics runtime metadata")
    cstart = text.index('async function calculateMetrics(')
    cend = text.index('async function completeEarlyTermination(', cstart)
    reg = text[cstart:cend]
    reg = reg.replace('LETTERS.length', 'configuredLetterCount')
    reg = reg.replace('WORDS.length', 'configuredWordCount')
    reg = reg.replace('const passageWordCount =\n    getPassageWordCount();', 'const passageWordCount = metricPassageWordCount;')
    text = text[:cstart] + reg + text[cend:]

    path.write_text(text, encoding="utf-8")


def patch_commit_api() -> None:
    path = ROOT / "app/api/assessment/commit/route.js"
    text = path.read_text(encoding="utf-8")

    text = replace_once(
        text,
        'const PASSAGE_TEXT =\n  "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.";',
        f'''const DEFAULT_PARA_PASSAGE = {js_string(PARA)};\nconst DEFAULT_FIELDS_PASSAGE = {js_string(FIELDS)};''',
        "commit route passage defaults",
    )

    needle = '''    if (host.stage !== "comprehension") {
      return responseJson(
        { error: "The assessment is not ready for final saving." },
        409
      );
    }'''
    injected = needle + '''

    const contentRows = await prisma.assessmentContent.findMany({
      where: {
        teacherId,
        assessmentPeriod: host.assessmentSession.assessmentPeriod,
        category: "stories",
      },
      orderBy: { position: "asc" },
    });
    const selectedStory = contentRows.find(
      (item) =>
        String(item.storyTitle || "").trim().toLowerCase() ===
        String(host.storyTitle || "").trim().toLowerCase()
    );
    const passageText =
      selectedStory?.content ||
      (String(host.storyTitle || "").toLowerCase().includes("day in the fields")
        ? DEFAULT_FIELDS_PASSAGE
        : DEFAULT_PARA_PASSAGE);
'''
    text = replace_once(text, needle, injected, "commit route dynamic story lookup")
    text = replace_once(text, '      const passageWordCount = PASSAGE_TEXT.trim().split(/\\s+/).filter(Boolean).length;', '      const passageWordCount = passageText.trim().split(/\\s+/).filter(Boolean).length;', "commit route passage word count")
    text = text.replace('      for (let index = wordsRead; index < 100; index += 1) {', '      for (let index = wordsRead; index < passageWordCount; index += 1) {', 1)

    path.write_text(text, encoding="utf-8")


def main() -> None:
    patch_teacher_page()
    patch_assessment_client()
    patch_assessment_api()
    patch_commit_api()
    print("Assessment content alignment applied.")


if __name__ == "__main__":
    main()
