from pathlib import Path
import re

ROOT = Path.cwd()

PARA = "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man."
FIELDS = "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil."
LETTERS = ["M", "S", "A", "L", "O", "B", "E", "U", "R", "T"]
WORDS = ["clap", "jump", "eat", "drink", "stand", "dance", "fly", "pencil", "basket", "helmet"]


def js(value):
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def arr(values):
    return "[" + ", ".join(js(v) for v in values) + "]"


def once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise RuntimeError(f"{label}: expected 1 exact match, found {n}")
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label):
    matches = list(re.finditer(pattern, text, re.DOTALL))
    if len(matches) != 1:
        raise RuntimeError(f"{label}: expected 1 regex match, found {len(matches)}")
    m = matches[0]
    return text[:m.start()] + replacement + text[m.end():]


def patch_teacher():
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
    text = re.sub(r"[ \t]*Assessment content is stored securely in the class database\.[^\n]*\n?", "", text, count=1)
    p.write_text(text, encoding="utf-8")


def patch_client():
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
  if (Array.isArray(content.letters) && content.letters.length) LETTERS.splice(0, LETTERS.length, ...content.letters.map((item) => String(item).trim()).filter(Boolean));
  if (Array.isArray(content.words) && content.words.length) WORDS.splice(0, WORDS.length, ...content.words.map((item) => String(item).trim()).filter(Boolean));
  if (Array.isArray(content.stories) && content.stories.length) {
    STORIES.splice(0, STORIES.length, ...content.stories.map((story, index) => ({ id: story?.id ?? index + 1, title: String(story?.title || `Story ${index + 1}`).trim(), description: String(story?.description || "").trim(), text: String(story?.text || ""), available: true })));
  }
  const title = String(session?.story_title || "").trim().toLowerCase();
  const selectedStory = STORIES.find((story) => String(story?.title || "").trim().toLowerCase() === title);
  if (selectedStory?.text) {
    if (title.includes("day in the fields")) FIELD_PASSAGE_TEXT = selectedStory.text;
    else PASSAGE_TEXT = selectedStory.text;
  }
  QUESTIONS = title.includes("day in the fields") ? DEFAULT_FIELDS_QUESTIONS.slice() : DEFAULT_PARA_QUESTIONS.slice();
  return true;
}
'''
    text = once(text, "\nexport default function TeacherAssessmentPage(", helpers + "\nexport default function TeacherAssessmentPage(", "client runtime helpers")
    text = once(text, '  const [\n    session,\n    setSession,\n  ] = useState(null);', '  const [\n    session,\n    setSession,\n  ] = useState(null);\n\n  const [, setAssessmentContentVersion] = useState(0);', "client content state")
    text = once(text, '''  const passageText =
    session?.story_title === "A Day In The Fields"
      ? FIELD_PASSAGE_TEXT
      : PASSAGE_TEXT;''', '''  const passageText =
    activeStage === "passage" && String(session?.current_content || "").trim()
      ? String(session.current_content)
      : session?.story_title === "A Day In The Fields"
        ? FIELD_PASSAGE_TEXT
        : PASSAGE_TEXT;''', "client dynamic passage")
    start = text.index("  const fetchSession =")
    end = text.index("  const selectStory = useCallback(", start)
    region = text[start:end]
    target = '''        const data =
          await response.json();

        if (!response.ok) {'''
    replacement = '''        const data =
          await response.json();

        if (data?.session?.assessment_content && applyRuntimeAssessmentContent(data.session)) {
          setAssessmentContentVersion((version) => version + 1);
        }

        if (!response.ok) {'''
    region = once(region, target, replacement, "client fetchSession hydration")
    text = text[:start] + region + text[end:]
    text = once(text, '''      const next = {
        code,
        stage: "passage",
        currentContent:
          story.id === 1
            ? PASSAGE_TEXT
            : FIELD_PASSAGE_TEXT,
        storyTitle: story.title,
      };''', '''      const next = {
        code,
        stage: "passage",
        currentContent: story?.text || (story?.id === 2 ? FIELD_PASSAGE_TEXT : PASSAGE_TEXT),
        storyTitle: story.title,
      };''', "client selected story")
    text = text.replace(
        'if (selectedIndex < 0 || selectedIndex >= 100) return;',
        'if (selectedIndex < 0 || selectedIndex >= passageText.trim().split(/\\s+/).filter(Boolean).length) return;',
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
    p.write_text(text, encoding="utf-8")


def patch_route():
    p = ROOT / "app/api/assessment/route.js"
    text = p.read_text(encoding="utf-8")
    blocks = []
    for period in ("BoSY", "MoSY", "EoSY"):
        blocks.append(f'''  {period}: {{
    letters: {arr(LETTERS)},
    words: {arr(WORDS)},
    stories: [
      {{ title: "Para the Parrot", text: {js(PARA)} }},
      {{ title: "A Day in the Fields", text: {js(FIELDS)} }},
    ],
  }}''')
    defaults = "const DEFAULT_CONTENT_FOR_PERIOD = {\n" + ",\n".join(blocks) + ",\n};"
    text = regex_once(text, r"const DEFAULT_CONTENT_FOR_PERIOD = \{.*?\n\};", defaults, "API default content")

    helpers = '''\nasync function ensureTeacherPeriodContent(teacherId, period) {
  let items = await prisma.assessmentContent.findMany({ where: { teacherId, assessmentPeriod: period }, orderBy: [{ category: "asc" }, { position: "asc" }] });
  if (!items.length) {
    const defaults = DEFAULT_CONTENT_FOR_PERIOD[period] || DEFAULT_CONTENT_FOR_PERIOD.BoSY;
    const data = [];
    for (const category of ["letters", "words", "stories"]) {
      defaults[category].forEach((item, index) => {
        const story = category === "stories";
        data.push({ teacherId, assessmentPeriod: period, category, position: index + 1, content: story ? item.text : item, storyTitle: story ? item.title : null });
      });
    }
    await prisma.assessmentContent.createMany({ data });
    items = await prisma.assessmentContent.findMany({ where: { teacherId, assessmentPeriod: period }, orderBy: [{ category: "asc" }, { position: "asc" }] });
  }
  const replacements = new Map([
    ["The Helpful Friend|A child sees a friend carrying a heavy basket. The child helps carry it home.", { title: "A Day in the Fields", text: DEFAULT_CONTENT_FOR_PERIOD.BoSY.stories[1].text }],
    ["A Morning Walk|The children walk together and help one another on their way to school.", { title: "Para the Parrot", text: DEFAULT_CONTENT_FOR_PERIOD.BoSY.stories[0].text }],
    ["The Kind Child|A kind child notices someone who needs help and chooses to lend a hand.", { title: "Para the Parrot", text: DEFAULT_CONTENT_FOR_PERIOD.BoSY.stories[0].text }],
    ["Para the Parrot|Para is a helpful parrot. Every morning, Para greets the children and helps them find their books.", { title: "Para the Parrot", text: DEFAULT_CONTENT_FOR_PERIOD.BoSY.stories[0].text }],
  ]);
  for (const item of items) {
    if (item.category !== "stories") continue;
    const next = replacements.get(`${item.storyTitle || ""}|${item.content || ""}`);
    if (next) await prisma.assessmentContent.update({ where: { id: item.id }, data: { storyTitle: next.title, content: next.text } });
  }
  return prisma.assessmentContent.findMany({ where: { teacherId, assessmentPeriod: period }, orderBy: [{ category: "asc" }, { position: "asc" }] });
}
async function getTeacherRuntimeContent(teacherId, period) {
  const items = await ensureTeacherPeriodContent(teacherId, period);
  return {
    letters: items.filter((item) => item.category === "letters").map((item) => item.content || ""),
    words: items.filter((item) => item.category === "words").map((item) => item.content || ""),
    stories: items.filter((item) => item.category === "stories").map((item) => ({ id: item.id, title: item.storyTitle || "Untitled Story", description: String(item.storyTitle || "").toLowerCase() === "para the parrot" ? "A story about a parrot flying to the market." : String(item.storyTitle || "").toLowerCase() === "a day in the fields" ? "Join the farmers as they work in the terraces." : "", text: item.content || "", available: true })),
  };
}
'''
    text = once(text, "\nfunction responseJson(data, status = 200) {", helpers + "\nfunction responseJson(data, status = 200) {", "API runtime helpers")

    start = text.index('    if (\n      action ===\n      "get_activities"')
    end = text.index('    if (action === "save_activities")', start)
    region = text[start:end]
    region = regex_once(region, r'      let items = await prisma\.assessmentContent\.findMany\([\s\S]*?\n      \}\n', '''      for (const contentPeriod of Object.keys(DEFAULT_CONTENT_FOR_PERIOD)) {
        await ensureTeacherPeriodContent(userId, contentPeriod);
      }
      const items = await prisma.assessmentContent.findMany({
        where: { teacherId: userId },
        orderBy: [
          { assessmentPeriod: "asc" },
          { category: "asc" },
          { position: "asc" },
        ],
      });
''', "API get_activities replacement")
    text = text[:start] + region + text[end:]

    host_anchor = '''      if (!host.linkedAt && !connected) {
        stage = "waiting";
        currentContent = null;
      }

      return responseJson({'''
    host_replace = '''      if (!host.linkedAt && !connected) {
        stage = "waiting";
        currentContent = null;
      }

      const runtimePeriod = host.assessmentSession?.assessmentPeriod || "BoSY";
      const assessmentContent = await getTeacherRuntimeContent(userId, runtimePeriod);
      const selectedStory = assessmentContent.stories.find((story) => String(story.title || "").trim().toLowerCase() === String(host.storyTitle || "").trim().toLowerCase());
      if (stage === "passage" && selectedStory?.text) currentContent = selectedStory.text;

      return responseJson({'''
    text = once(text, host_anchor, host_replace, "API host_get runtime content")
    text = once(text, "          story_choices: STORY_CHOICES,", "          story_choices: assessmentContent.stories,\n          assessment_content: assessmentContent,", "API host_get payload")

    join_marker = '''      /*
       * The assessment code is single-use. linkedAt is the server-side
       * consumed marker. The conditional update is atomic, so two learners
       * cannot both successfully claim the same code.
       */
      const claim ='''
    join_insert = '''      const runtimePeriod = host.assessmentSession?.assessmentPeriod || "BoSY";
      const runtimeContent = await getTeacherRuntimeContent(host.teacherId, runtimePeriod);

      /*
       * The assessment code is single-use. linkedAt is the server-side
       * consumed marker. The conditional update is atomic, so two learners
       * cannot both successfully claim the same code.
       */
      const claim ='''
    text = once(text, join_marker, join_insert, "API learner join runtime content")
    text = text.replace('            currentContent:\n              host.currentContent ||\n              LETTERS[0],', '            currentContent:\n              host.currentContent ||\n              runtimeContent.letters[0] ||\n              LETTERS[0],', 1)

    start_marker = '      const host = await prisma.hostSession.create({'
    text = once(text, start_marker, '      const runtimeContent = await getTeacherRuntimeContent(userId, period);\n\n      const host = await prisma.hostSession.create({', "API host_start runtime content")
    text = text.replace('          currentContent: LETTERS[0],', '          currentContent: runtimeContent.letters[0] || LETTERS[0],', 1)

    # Restrict record-letter/word server validation and stored values to this teacher's configured period.
    lstart = text.index('    if (\n      action ===\n      "record_letter"')
    lend = text.index('    /* ====================================================================== */\n    /* RECORD WORD', lstart)
    lreg = text[lstart:lend]
    marker = '''      const letterIndex =
        Number(
          body?.letter_index ??
            body?.letterIndex
        );'''
    lreg = once(lreg, marker, '''      const letterSession = await prisma.assessmentSession.findUnique({ where: { id: host.assessmentSessionId }, select: { assessmentPeriod: true } });
      const runtimeContent = await getTeacherRuntimeContent(userId, letterSession?.assessmentPeriod || "BoSY");
      const configuredLetters = runtimeContent.letters.length ? runtimeContent.letters : LETTERS;

      const letterIndex =
        Number(
          body?.letter_index ??
            body?.letterIndex
        );''', "API record_letter runtime")
    lreg = lreg.replace('LETTERS.length', 'configuredLetters.length').replace('LETTERS[', 'configuredLetters[')
    text = text[:lstart] + lreg + text[lend:]

    wstart = text.index('    if (\n      action ===\n      "record_word"')
    wend = text.index('    /* ====================================================================== */\n    /* SELECT STORY', wstart)
    wreg = text[wstart:wend]
    marker = '''      const wordIndex =
        Number(
          body?.word_index ??
            body?.wordIndex
        );'''
    wreg = once(wreg, marker, '''      const wordSession = await prisma.assessmentSession.findUnique({ where: { id: host.assessmentSessionId }, select: { assessmentPeriod: true } });
      const runtimeContent = await getTeacherRuntimeContent(userId, wordSession?.assessmentPeriod || "BoSY");
      const configuredWords = runtimeContent.words.length ? runtimeContent.words : WORDS;

      const wordIndex =
        Number(
          body?.word_index ??
            body?.wordIndex
        );''', "API record_word runtime")
    wreg = wreg.replace('WORDS.length', 'configuredWords.length').replace('WORDS[', 'configuredWords[')
    text = text[:wstart] + wreg + text[wend:]

    # select_story should use DB row id and exact teacher ownership.
    old = '''      const stories = {
        1: {
          title: "Para The Parrot",
          passage: PASSAGE_TEXT,
        },
      };

      const selected = stories[storyId];

      if (!selected) {'''
    new = '''      const selected = await prisma.assessmentContent.findFirst({
        where: {
          id: storyId,
          teacherId: userId,
          assessmentPeriod: host.assessmentSession?.assessmentPeriod || "BoSY",
          category: "stories",
        },
      });

      if (!selected) {'''
    text = once(text, old, new, "API select_story database")
    text = text.replace('          currentContent: selected.passage,\n          storyTitle: selected.title,', '          currentContent: selected.content || "",\n          storyTitle: selected.storyTitle || "Untitled Story",', 1)

    calc_start = text.index('async function calculateMetrics(')
    calc_end = text.index('async function completeEarlyTermination(', calc_start)
    calc = text[calc_start:calc_end]
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
  const runtimeRows = sessionMeta ? await tx.assessmentContent.findMany({
    where: { teacherId: sessionMeta.teacherId, assessmentPeriod: sessionMeta.assessmentPeriod },
    orderBy: [{ category: "asc" }, { position: "asc" }],
  }) : [];
  const configuredLetterCount = Math.max(1, runtimeRows.filter((item) => item.category === "letters").length || LETTERS.length);
  const configuredWordCount = Math.max(1, runtimeRows.filter((item) => item.category === "words").length || WORDS.length);
  const metricStory = runtimeRows.find((item) => item.category === "stories" && String(item.storyTitle || "").trim().toLowerCase() === String(hostMeta?.storyTitle || "").trim().toLowerCase());
  const metricPassageWordCount = (metricStory?.content || PASSAGE_TEXT).trim().split(/\\s+/).filter(Boolean).length;

  const [
    letters,'''
    calc = regex_once(calc, r'async function calculateMetrics\([\s\S]*?\n  const \[\n    letters,', calc_insert, "API calculateMetrics dynamic header")
    calc = calc.replace('LETTERS.length', 'configuredLetterCount').replace('WORDS.length', 'configuredWordCount')
    calc = calc.replace('const passageWordCount =\n    getPassageWordCount();', 'const passageWordCount = metricPassageWordCount;')
    text = text[:calc_start] + calc + text[calc_end:]

    p.write_text(text, encoding="utf-8")


def patch_commit():
    p = ROOT / "app/api/assessment/commit/route.js"
    text = p.read_text(encoding="utf-8")
    old = '''const PASSAGE_TEXT =
  "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.";'''
    new = f'''const DEFAULT_PARA_PASSAGE = {js(PARA)};
const DEFAULT_FIELDS_PASSAGE = {js(FIELDS)};'''
    text = once(text, old, new, "commit passage defaults")
    marker = '''    if (host.stage !== "comprehension") {
      return responseJson(
        { error: "The assessment is not ready for final saving." },
        409
      );
    }'''
    injected = marker + '''

    const contentRows = await prisma.assessmentContent.findMany({
      where: { teacherId, assessmentPeriod: host.assessmentSession.assessmentPeriod, category: "stories" },
      orderBy: { position: "asc" },
    });
    const selectedStory = contentRows.find((item) => String(item.storyTitle || "").trim().toLowerCase() === String(host.storyTitle || "").trim().toLowerCase());
    const passageText = selectedStory?.content || (String(host.storyTitle || "").toLowerCase().includes("day in the fields") ? DEFAULT_FIELDS_PASSAGE : DEFAULT_PARA_PASSAGE);
'''
    text = once(text, marker, injected, "commit story lookup")
    text = text.replace('      const passageWordCount = PASSAGE_TEXT.trim().split(/\\s+/).filter(Boolean).length;', '      const passageWordCount = passageText.trim().split(/\\s+/).filter(Boolean).length;', 1)
    text = text.replace('      for (let index = wordsRead; index < 100; index += 1) {', '      for (let index = wordsRead; index < passageWordCount; index += 1) {', 1)
    p.write_text(text, encoding="utf-8")


def main():
    patch_teacher()
    patch_client()
    patch_route()
    patch_commit()
    print("Prepared verified assessment content alignment.")


if __name__ == "__main__":
    main()
