from __future__ import annotations

from pathlib import Path
import re

ROOT = Path.cwd()
PARA = "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man."
FIELDS = "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil."
LETTERS = ["M", "S", "A", "L", "O", "B", "E", "U", "R", "T"]
WORDS = ["clap", "jump", "eat", "drink", "stand", "dance", "fly", "pencil", "basket", "helmet"]


def js(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def arr(values: list[str]) -> str:
    return "[" + ", ".join(js(v) for v in values) + "]"


def once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {n}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    matches = list(re.finditer(pattern, text, re.DOTALL))
    if len(matches) != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {len(matches)}")
    m = matches[0]
    return text[:m.start()] + replacement + text[m.end():]


def patch_teacher_page() -> None:
    p = ROOT / "app/teacher/page.jsx"
    text = p.read_text(encoding="utf-8")
    defaults = f'''const DEFAULT_CONTENT = {{
  BoSY: {{
    letters: {arr(LETTERS)},
    words: {arr(WORDS)},
    stories: [
      {{ id: 1, title: "Para the Parrot", text: {js(PARA)} }},
      {{ id: 2, title: "A Day in the Fields", text: {js(FIELDS)} }},
    ],
  }},
  MoSY: {{
    letters: {arr(LETTERS)},
    words: {arr(WORDS)},
    stories: [
      {{ id: 1, title: "Para the Parrot", text: {js(PARA)} }},
      {{ id: 2, title: "A Day in the Fields", text: {js(FIELDS)} }},
    ],
  }},
  EoSY: {{
    letters: {arr(LETTERS)},
    words: {arr(WORDS)},
    stories: [
      {{ id: 1, title: "Para the Parrot", text: {js(PARA)} }},
      {{ id: 2, title: "A Day in the Fields", text: {js(FIELDS)} }},
    ],
  }},
}};'''
    text = regex_once(text, r"const DEFAULT_CONTENT = \{.*?\n\};", defaults, "teacher DEFAULT_CONTENT")
    text = re.sub(
        r"\s*<[^>]+>\s*Assessment content is stored securely in the class database\.\s*</[^>]+>",
        "",
        text,
        count=1,
        flags=re.DOTALL,
    )
    text = text.replace("Assessment content is stored securely in the class database.", "", 1)
    p.write_text(text, encoding="utf-8")


def patch_assessment_client() -> None:
    p = ROOT / "app/teacher/assessment/AssessmentClient.jsx"
    text = p.read_text(encoding="utf-8")
    for old, new, label in [
        ("const LETTERS = [", "let LETTERS = [", "client LETTERS"),
        ("const WORDS = [", "let WORDS = [", "client WORDS"),
        ("const STORIES = [", "let STORIES = [", "client STORIES"),
        ("const PASSAGE_TEXT =", "let PASSAGE_TEXT =", "client PASSAGE_TEXT"),
        ("const FIELD_PASSAGE_TEXT =", "let FIELD_PASSAGE_TEXT =", "client FIELD_PASSAGE_TEXT"),
        ("const QUESTIONS = [", "let QUESTIONS = [", "client QUESTIONS"),
    ]:
        text = once(text, old, new, label)

    helpers = '''\nconst DEFAULT_PARA_QUESTIONS = [
  { index: 0, text: "What must Para look for?" },
  { index: 1, text: "What time or part of the day is it?" },
  { index: 2, text: "What does Para land on?" },
  { index: 3, text: "Who does Para see?" },
  { index: 4, text: "What else is the police officer doing besides directing traffic?" },
  { index: 5, text: "What could the police officer be feeling?" },
];

const DEFAULT_FIELDS_QUESTIONS = [
  { index: 0, text: "Who is Dulnuwan?" },
  { index: 1, text: "Who helps Dulnuwan in the fields?" },
  { index: 2, text: "What does Dulnuwan do to the field today?" },
  { index: 3, text: "What do Bugan, Ali, and Dina do?" },
  { index: 4, text: "What do they eat for lunch?" },
  { index: 5, text: "What does Dulnuwan bend to pick up?" },
];

function applyRuntimeAssessmentContent(session) {
  const content = session?.assessment_content;
  if (!content) return false;

  if (Array.isArray(content.letters) && content.letters.length) {
    LETTERS.splice(0, LETTERS.length, ...content.letters.map((item) => String(item).trim()).filter(Boolean));
  }
  if (Array.isArray(content.words) && content.words.length) {
    WORDS.splice(0, WORDS.length, ...content.words.map((item) => String(item).trim()).filter(Boolean));
  }
  if (Array.isArray(content.stories) && content.stories.length) {
    STORIES.splice(
      0,
      STORIES.length,
      ...content.stories.map((story, index) => ({
        id: story?.id ?? index + 1,
        title: String(story?.title || `Story ${index + 1}`).trim(),
        description: String(story?.description || "").trim(),
        text: String(story?.text || ""),
        available: true,
      }))
    );
  }

  const title = String(session?.story_title || "").trim().toLowerCase();
  const story = STORIES.find((item) => String(item?.title || "").trim().toLowerCase() === title);
  if (story?.text) {
    if (title.includes("day in the fields")) FIELD_PASSAGE_TEXT = story.text;
    else PASSAGE_TEXT = story.text;
  }
  QUESTIONS = title.includes("day in the fields")
    ? DEFAULT_FIELDS_QUESTIONS.slice()
    : DEFAULT_PARA_QUESTIONS.slice();
  return true;
}
'''
    text = once(text, "\nexport default function TeacherAssessmentPage(", helpers + "\nexport default function TeacherAssessmentPage(", "client runtime helpers")
    text = once(
        text,
        '  const [\n    session,\n    setSession,\n  ] = useState(null);',
        '  const [\n    session,\n    setSession,\n  ] = useState(null);\n\n  const [, setAssessmentContentVersion] = useState(0);',
        "client content rerender state",
    )
    text = once(
        text,
        '''  const passageText =
    session?.story_title === "A Day In The Fields"
      ? FIELD_PASSAGE_TEXT
      : PASSAGE_TEXT;''',
        '''  const passageText =
    activeStage === "passage" && String(session?.current_content || "").trim()
      ? String(session.current_content)
      : session?.story_title === "A Day In The Fields"
        ? FIELD_PASSAGE_TEXT
        : PASSAGE_TEXT;''',
        "client dynamic passage text",
    )
    start = text.index("  const fetchSession =")
    end = text.index("  const selectStory = useCallback(", start)
    region = text[start:end]
    old = '''        const data =
          await response.json();

        if (!response.ok) {'''
    new = '''        const data =
          await response.json();

        if (data?.session?.assessment_content && applyRuntimeAssessmentContent(data.session)) {
          setAssessmentContentVersion((version) => version + 1);
        }

        if (!response.ok) {'''
    region = once(region, old, new, "client host_get hydration")
    text = text[:start] + region + text[end:]

    text = once(
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
        "client selected story content",
    )

    path_text = text
    path_text = path_text.replace(
        'const selectedIndex =\n          Number(selectedPassageWord || 0) - 1;\n\n        if (selectedIndex < 0 || selectedIndex >= 100) return;',
        'const selectedIndex =\n          Number(selectedPassageWord || 0) - 1;\n        const passageWordCount = passageText.trim().split(/\\s+/).filter(Boolean).length;\n\n        if (selectedIndex < 0 || selectedIndex >= passageWordCount) return;',
        1,
    )
    path_text = path_text.replace(
        'if (selectedIndex < 0 || selectedIndex >= 100) return;\n\n        const nextType',
        'const passageWordCount = passageText.trim().split(/\\s+/).filter(Boolean).length;\n        if (selectedIndex < 0 || selectedIndex >= passageWordCount) return;\n\n        const nextType',
        1,
    )
    path_text = path_text.replace(
        'const wordsRead = Math.min(\n            100,',
        'const wordsRead = Math.min(\n            passageText.trim().split(/\\s+/).filter(Boolean).length,',
        1,
    )
    path_text = path_text.replace(
        '(passageSeconds >= 120\n                    ? passageWordsRead || 0\n                    : 100)',
        '(passageSeconds >= 120\n                    ? passageWordsRead || 0\n                    : passageText.trim().split(/\\s+/).filter(Boolean).length)',
        1,
    )
    path_text = path_text.replace(
        'passageSeconds >= 120\n                                    ? passageWordsRead || 0\n                                    : 100',
        'passageSeconds >= 120\n                                    ? passageWordsRead || 0\n                                    : passageText.trim().split(/\\s+/).filter(Boolean).length',
        1,
    )
    path_text = path_text.replace('> / 100</span>', '> / {passageText.trim().split(/\\s+/).filter(Boolean).length}</span>', 1)
    p.write_text(path_text, encoding="utf-8")


def patch_assessment_api() -> None:
    p = ROOT / "app/api/assessment/route.js"
    text = p.read_text(encoding="utf-8")
    defaults = f'''const DEFAULT_CONTENT_FOR_PERIOD = {{
  BoSY: {{
    letters: {arr(LETTERS)},
    words: {arr(WORDS)},
    stories: [
      {{ title: "Para the Parrot", text: {js(PARA)} }},
      {{ title: "A Day in the Fields", text: {js(FIELDS)} }},
    ],
  }},
  MoSY: {{
    letters: {arr(LETTERS)},
    words: {arr(WORDS)},
    stories: [
      {{ title: "Para the Parrot", text: {js(PARA)} }},
      {{ title: "A Day in the Fields", text: {js(FIELDS)} }},
    ],
  }},
  EoSY: {{
    letters: {arr(LETTERS)},
    words: {arr(WORDS)},
    stories: [
      {{ title: "Para the Parrot", text: {js(PARA)} }},
      {{ title: "A Day in the Fields", text: {js(FIELDS)} }},
    ],
  }},
}};'''
    text = regex_once(text, r"const DEFAULT_CONTENT_FOR_PERIOD = \{.*?\n\};", defaults, "assessment API defaults")

    helpers = '''\n\nasync function ensureTeacherPeriodContent(teacherId, period) {
  let items = await prisma.assessmentContent.findMany({
    where: { teacherId, assessmentPeriod: period },
    orderBy: [{ category: "asc" }, { position: "asc" }],
  });
  if (!items.length) {
    const defaults = DEFAULT_CONTENT_FOR_PERIOD[period] || DEFAULT_CONTENT_FOR_PERIOD.BoSY;
    const data = [];
    for (const category of ["letters", "words", "stories"]) {
      defaults[category].forEach((item, index) => {
        const isStory = category === "stories";
        data.push({
          teacherId,
          assessmentPeriod: period,
          category,
          position: index + 1,
          content: isStory ? item.text : item,
          storyTitle: isStory ? item.title : null,
        });
      });
    }
    await prisma.assessmentContent.createMany({ data });
  }
  return prisma.assessmentContent.findMany({
    where: { teacherId, assessmentPeriod: period },
    orderBy: [{ category: "asc" }, { position: "asc" }],
  });
}

async function getTeacherRuntimeContent(teacherId, period) {
  const items = await ensureTeacherPeriodContent(teacherId, period);
  return {
    letters: items.filter((item) => item.category === "letters").map((item) => item.content || ""),
    words: items.filter((item) => item.category === "words").map((item) => item.content || ""),
    stories: items.filter((item) => item.category === "stories").map((item) => ({
      id: item.id,
      title: item.storyTitle || "Untitled Story",
      description:
        String(item.storyTitle || "").toLowerCase() === "para the parrot"
          ? "A story about a parrot flying to the market."
          : String(item.storyTitle || "").toLowerCase() === "a day in the fields"
            ? "Join the farmers as they work in the terraces."
            : "",
      text: item.content || "",
      available: true,
    })),
  };
}
'''
    text = once(text, "\nfunction responseJson(data, status = 200) {", helpers + "\nfunction responseJson(data, status = 200) {", "assessment runtime helpers")

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

      let items = await prisma.assessmentContent.findMany({
        where: { teacherId: userId },
        orderBy: [
          { assessmentPeriod: "asc" },
          { category: "asc" },
          { position: "asc" },
        ],
      });

      const legacy = new Map([
        [
          "The Helpful Friend|A child sees a friend carrying a heavy basket. The child helps carry it home.",
          { title: "A Day in the Fields", text: ''' + js(FIELDS) + ''' },
        ],
        [
          "A Morning Walk|The children walk together and help one another on their way to school.",
          { title: "Para the Parrot", text: ''' + js(PARA) + ''' },
        ],
        [
          "The Kind Child|A kind child notices someone who needs help and chooses to lend a hand.",
          { title: "Para the Parrot", text: ''' + js(PARA) + ''' },
        ],
        [
          "Para the Parrot|Para is a helpful parrot. Every morning, Para greets the children and helps them find their books.",
          { title: "Para the Parrot", text: ''' + js(PARA) + ''' },
      ]);

      for (const item of items) {
        if (item.category !== "stories") continue;
        const repair = legacy.get(`${item.storyTitle || ""}|${item.content || ""}`);
        if (repair) {
          await prisma.assessmentContent.update({
            where: { id: item.id },
            data: repair,
          });
        }
      }
      items = await prisma.assessmentContent.findMany({
        where: { teacherId: userId },
        orderBy: [
          { assessmentPeriod: "asc" },
          { category: "asc" },
          { position: "asc" },
        ],
      });'''
    text = once(text, old_get, new_get, "assessment API get_activities")

    host_anchor = '''      if (!host.linkedAt && !connected) {
        stage = "waiting";
        currentContent = null;
      }

      return responseJson({'''
    host_new = '''      if (!host.linkedAt && !connected) {
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

      return responseJson({'''
    text = once(text, host_anchor, host_new, "assessment API host_get content")
    text = once(text, "          story_choices: STORY_CHOICES,", "          story_choices: assessmentContent.stories,\n          assessment_content: assessmentContent,", "assessment API host_get payload")

    learner_anchor = '''      /*
       * The assessment code is single-use. linkedAt is the server-side
       * consumed marker. The conditional update is atomic, so two learners
       * cannot both successfully claim the same code.
       */
      const claim ='''
    text = once(text, learner_anchor, '''      const runtimePeriod = host.assessmentSession?.assessmentPeriod || "BoSY";
      const runtimeContent = await getTeacherRuntimeContent(host.teacherId, runtimePeriod);

      /*
       * The assessment code is single-use. linkedAt is the server-side
       * consumed marker. The conditional update is atomic, so two learners
       * cannot both successfully claim the same code.
       */
      const claim =''', "assessment API learner join content")
    text = text.replace(
        '            currentContent:\n              host.currentContent ||\n              LETTERS[0],',
        '            currentContent:\n              host.currentContent ||\n              runtimeContent.letters[0] ||\n              LETTERS[0],',
        1,
    )

    select_story_old = '''      const stories = {
        1: {
          title: "Para The Parrot",
          passage: PASSAGE_TEXT,
        },
      };

      const selected = stories[storyId];

      if (!selected) {'''
    select_story_new = '''      const selected = await prisma.assessmentContent.findFirst({
        where: {
          id: storyId,
          teacherId: userId,
          assessmentPeriod: host.assessmentSession?.assessmentPeriod || "BoSY",
          category: "stories",
        },
      });

      if (!selected) {'''
    text = once(text, select_story_old, select_story_new, "assessment API select_story")
    text = text.replace(
        '          currentContent: selected.passage,\n          storyTitle: selected.title,',
        '          currentContent: selected.content || "",\n          storyTitle: selected.storyTitle || "Untitled Story",',
        1,
    )

    start_host = '      const host = await prisma.hostSession.create({'
    text = once(text, start_host, '      const runtimeContent = await getTeacherRuntimeContent(userId, period);\n\n      const host = await prisma.hostSession.create({', "assessment API host_start content")
    text = text.replace('          currentContent: LETTERS[0],', '          currentContent: runtimeContent.letters[0] || LETTERS[0],', 1)

    letter_start = '    if (\n      action ===\n      "record_letter"'
    lstart = text.index(letter_start)
    lend = text.index('    /* ====================================================================== */\n    /* RECORD WORD', lstart)
    region = text[lstart:lend]
    marker = '''      const letterIndex =
        Number(
          body?.letter_index ??
            body?.letterIndex
        );'''
    insert = '''      const letterSession = await prisma.assessmentSession.findUnique({
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
    region = once(region, marker, insert, "assessment API record_letter configured items")
    region = region.replace('LETTERS.length', 'configuredLetters.length')
    region = region.replace('LETTERS[', 'configuredLetters[')
    text = text[:lstart] + region + text[lend:]

    word_start = '    if (\n      action ===\n      "record_word"'
    wstart = text.index(word_start)
    wend = text.index('    /* ====================================================================== */\n    /* SELECT STORY', wstart)
    region = text[wstart:wend]
    marker = '''      const wordIndex =
        Number(
          body?.word_index ??
            body?.wordIndex
        );'''
    insert = '''      const wordSession = await prisma.assessmentSession.findUnique({
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
    region = once(region, marker, insert, "assessment API record_word configured items")
    region = region.replace('WORDS.length', 'configuredWords.length')
    region = region.replace('WORDS[', 'configuredWords[')
    text = text[:wstart] + region + text[wend:]

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
  const configuredLetterCount = Math.max(1, runtimeRows.filter((item) => item.category === "letters").length || LETTERS.length);
  const configuredWordCount = Math.max(1, runtimeRows.filter((item) => item.category === "words").length || WORDS.length);
  const metricStory = runtimeRows.find(
    (item) =>
      item.category === "stories" &&
      String(item.storyTitle || "").trim().toLowerCase() ===
        String(hostMeta?.storyTitle || "").trim().toLowerCase()
  );
  const metricPassageWordCount = (metricStory?.content || PASSAGE_TEXT).trim().split(/\\s+/).filter(Boolean).length;

  const [
    letters,'''
    text = once(text, calc_marker, calc_insert, "assessment API calculateMetrics metadata")
    cstart = text.index('async function calculateMetrics(')
    cend = text.index('async function completeEarlyTermination(', cstart)
    region = text[cstart:cend]
    region = region.replace('LETTERS.length', 'configuredLetterCount')
    region = region.replace('WORDS.length', 'configuredWordCount')
    region = region.replace('const passageWordCount =\n    getPassageWordCount();', 'const passageWordCount = metricPassageWordCount;')
    text = text[:cstart] + region + text[cend:]
    p.write_text(text, encoding="utf-8")


def patch_commit_api() -> None:
    p = ROOT / "app/api/assessment/commit/route.js"
    text = p.read_text(encoding="utf-8")
    text = once(
        text,
        'const PASSAGE_TEXT =\n  "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.";',
        f'''const DEFAULT_PARA_PASSAGE = {js(PARA)};\nconst DEFAULT_FIELDS_PASSAGE = {js(FIELDS)};''',
        "commit API passage constants",
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
    text = once(text, needle, injected, "commit API story lookup")
    text = text.replace('      const passageWordCount = PASSAGE_TEXT.trim().split(/\\s+/).filter(Boolean).length;', '      const passageWordCount = passageText.trim().split(/\\s+/).filter(Boolean).length;', 1)
    text = text.replace('      for (let index = wordsRead; index < 100; index += 1) {', '      for (let index = wordsRead; index < passageWordCount; index += 1) {', 1)
    p.write_text(text, encoding="utf-8")


def main() -> None:
    patch_teacher_page()
    patch_assessment_client()
    patch_assessment_api()
    patch_commit_api()
    print("Assessment content alignment v2 applied.")


if __name__ == "__main__":
    main()
