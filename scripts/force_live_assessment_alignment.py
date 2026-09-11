from pathlib import Path
import re

ROOT = Path.cwd()
PARA = "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man."
FIELDS = "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil."


def js(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'


def one_regex(text, pattern, repl, label):
    out, n = re.subn(pattern, repl, text, count=1, flags=re.S)
    if n != 1:
        raise RuntimeError(f"{label}: expected one match, found {n}")
    return out


def one(text, old, new, label):
    if text.count(old) != 1:
        raise RuntimeError(f"{label}: expected one exact match, found {text.count(old)}")
    return text.replace(old, new, 1)


def patch_teacher_page():
    p = ROOT / 'app/teacher/page.jsx'
    t = p.read_text()
    old = '''const DEFAULT_CONTENT = {\n  BoSY: {\n    letters: LETTERS,\n    words: WORDS,\n    stories: [\n      {\n        id: 1,\n        title: "Para the Parrot",\n        text: "Para is a helpful parrot. Every morning, Para greets the children and helps them find their books.",\n      },\n      {\n        id: 2,\n        title: "The Helpful Friend",\n        text: "A child sees a friend carrying a heavy basket. The child helps carry it home.",\n      },\n    ],\n  },\n  MoSY: {\n    letters: LETTERS,\n    words: WORDS,\n    stories: [\n      {\n        id: 1,\n        title: "A Morning Walk",\n        text: "The children walk together and help one another on their way to school.",\n      },\n    ],\n  },\n  EoSY: {\n    letters: LETTERS,\n    words: WORDS,\n    stories: [\n      {\n        id: 1,\n        title: "The Kind Child",\n        text: "A kind child notices someone who needs help and chooses to lend a hand.",\n      },\n    ],\n  },\n};'''
    if old in t:
        t = one(t, old, f'''const DEFAULT_CONTENT = {{\n  BoSY: {{\n    letters: LETTERS,\n    words: WORDS,\n    stories: [\n      {{ id: 1, title: "Para the Parrot", text: {js(PARA)} }},\n      {{ id: 2, title: "A Day in the Fields", text: {js(FIELDS)} }},\n    ],\n  }},\n  MoSY: {{\n    letters: LETTERS,\n    words: WORDS,\n    stories: [\n      {{ id: 1, title: "A Day in the Fields", text: {js(FIELDS)} }},\n    ],\n  }},\n  EoSY: {{\n    letters: LETTERS,\n    words: WORDS,\n    stories: [\n      {{ id: 1, title: "A Day in the Fields", text: {js(FIELDS)} }},\n    ],\n  }},\n}};''', 'teacher DEFAULT_CONTENT alignment')
    p.write_text(t)


def patch_client():
    p = ROOT / 'app/teacher/assessment/AssessmentClient.jsx'
    t = p.read_text()
    for old, new, label in [
        ('const LETTERS = [', 'let LETTERS = [', 'client LETTERS declaration'),
        ('const WORDS = [', 'let WORDS = [', 'client WORDS declaration'),
        ('const STORIES = [', 'let STORIES = [', 'client STORIES declaration'),
    ]:
        if old in t:
            t = one(t, old, new, label)

    helper = '''\nfunction applyLiveAssessmentContent(session) {\n  const content = session?.assessment_content;\n  if (!content) return false;\n  if (Array.isArray(content.letters) && content.letters.length) LETTERS = content.letters.map((v) => String(v));\n  if (Array.isArray(content.words) && content.words.length) WORDS = content.words.map((v) => String(v));\n  if (Array.isArray(content.stories) && content.stories.length) {\n    STORIES = content.stories.map((story, index) => ({\n      id: Number(story?.id ?? index + 1),\n      title: String(story?.title || `Story ${index + 1}`),\n      description: String(story?.description || ""),\n      text: String(story?.text || ""),\n      available: Boolean(String(story?.text || "").trim()),\n    }));\n  }\n  return true;\n}\n'''
    if 'function applyLiveAssessmentContent' not in t:
        t = one(t, '\nexport default function TeacherAssessmentPage(', helper + '\nexport default function TeacherAssessmentPage(', 'client live content helper')
    if 'setAssessmentContentVersion' not in t:
        t = one(t, '  const [\n    session,\n    setSession,\n  ] = useState(null);', '  const [\n    session,\n    setSession,\n  ] = useState(null);\n  const [, setAssessmentContentVersion] = useState(0);', 'client content rerender state')

    fetch_start = t.index('  const fetchSession =')
    fetch_end = t.index('  const selectStory = useCallback(', fetch_start)
    fetch = t[fetch_start:fetch_end]
    if 'applyLiveAssessmentContent(data.session)' not in fetch:
        fetch = one(fetch, '''        const data =\n          await response.json();''', '''        const data =\n          await response.json();\n\n        if (data?.session?.assessment_content && applyLiveAssessmentContent(data.session)) {\n          setAssessmentContentVersion((version) => version + 1);\n        }''', 'client fetchSession live DB hydration')
    t = t[:fetch_start] + fetch + t[fetch_end:]

    t = one_regex(t, r'  const passageText =\s*session\?\.story_title === "A Day In The Fields"\s*\? FIELD_PASSAGE_TEXT\s*:\s*PASSAGE_TEXT;', '''  const passageText =\n    activeStage === "passage" && String(session?.current_content || "").trim()\n      ? String(session.current_content)\n      : String(session?.story_title || "").trim().toLowerCase() === "a day in the fields"\n        ? FIELD_PASSAGE_TEXT\n        : PASSAGE_TEXT;''', 'client dynamic passage text')

    t = one_regex(t, r'      const next = \{\s*code,\s*stage: "passage",\s*currentContent:\s*story\.id === 1\s*\? PASSAGE_TEXT\s*:\s*FIELD_PASSAGE_TEXT,\s*storyTitle: story\.title,\s*\};', '''      const next = {\n        code,\n        stage: "passage",\n        currentContent: String(story?.text || ""),\n        storyTitle: String(story?.title || ""),\n      };''', 'client story text from DB')

    t = t.replace('    available: false,', '    available: true,', 1)
    p.write_text(t)


def insert_api_helpers(t):
    if 'async function getLiveAssessmentContent(' in t:
        return t
    helpers = '''\n\nasync function getLiveAssessmentContent(teacherId, assessmentPeriod) {\n  const rows = await prisma.assessmentContent.findMany({\n    where: { teacherId, assessmentPeriod },\n    orderBy: [{ category: "asc" }, { position: "asc" }],\n  });\n  return {\n    letters: rows.filter((r) => r.category === "letters").map((r) => r.content || ""),\n    words: rows.filter((r) => r.category === "words").map((r) => r.content || ""),\n    stories: rows.filter((r) => r.category === "stories").map((r) => ({\n      id: r.id,\n      title: r.storyTitle || "Untitled Story",\n      description: "Story passage from Manage Assessment.",\n      text: r.content || "",\n      available: Boolean(String(r.content || "").trim()),\n    })),\n  };\n}\n'''
    return one(t, '\nfunction responseJson(data, status = 200) {', helpers + '\nfunction responseJson(data, status = 200) {', 'API live content helper')


def patch_api():
    p = ROOT / 'app/api/assessment/route.js'
    t = p.read_text()
    t = insert_api_helpers(t)

    # Host GET: load the exact teacher/period content and expose it to the client.
    hs = t.index('    /* HOST GET')
    he = t.index('    /*', hs + 10)
    host = t[hs:he]
    if 'liveAssessmentContent' not in host:
        host = one(host, '\n      return responseJson({', '''\n      const assessmentPeriod = host.assessmentSession?.assessmentPeriod || "BoSY";\n      const liveAssessmentContent = await getLiveAssessmentContent(host.teacherId, assessmentPeriod);\n      const liveStoryChoices = liveAssessmentContent.stories;\n\n      return responseJson({''', 'API host GET DB content')
    host = host.replace('          story_choices: STORY_CHOICES,', '          story_choices: liveStoryChoices,\n          assessment_content: liveAssessmentContent,', 1)
    t = t[:hs] + host + t[he:]

    # Story selection: resolve the live teacher-owned DB story.
    hs = t.index('    /* SELECT STORY / START PASSAGE')
    he = t.index('    /* PASSAGE READY / TIMER CONTROL', hs)
    seg = t[hs:he]
    if 'getLiveAssessmentContent(host.teacherId' not in seg:
        seg = one_regex(seg, r'      const stories = \{[\s\S]*?      const selected = stories\[storyId\];', '''      const liveAssessmentContent = await getLiveAssessmentContent(\n        host.teacherId,\n        host.assessmentSession?.assessmentPeriod || "BoSY"\n      );\n      const stories = liveAssessmentContent.stories;\n      const selected = stories.find((story) => Number(story.id) === storyId) || stories[storyId - 1];''', 'API DB story selection')
    seg = seg.replace('          currentContent: selected.passage,', '          currentContent: selected.text,', 1)
    seg = seg.replace('          story_choices: STORY_CHOICES,', '          story_choices: stories,\n          assessment_content: liveAssessmentContent,', 1)
    t = t[:hs] + seg + t[he:]

    # Letter scoring uses live DB letters.
    if 'const runtimeContent = await getLiveAssessmentContent(host.teacherId' not in t[t.index('    /* RECORD LETTER'):t.index('    /* RECORD WORD')]:
        hs = t.index('    /* RECORD LETTER')
        he = t.index('    /* RECORD WORD', hs)
        seg = t[hs:he]
        seg = one_regex(seg, r'(\s*const letter =\s*)LETTERS\[\s*letterIndex\s*\];', r'\1runtimeLetters[letterIndex];', 'API letter runtime value')
        insert = '''      const runtimeContent = await getLiveAssessmentContent(\n        host.teacherId,\n        host.assessmentSession?.assessmentPeriod || "BoSY"\n      );\n      const runtimeLetters = runtimeContent.letters;\n'''
        seg = one_regex(seg, r'(\s*const letterIndex =[\s\S]*?;\n)', r'\1' + insert, 'API letter runtime arrays')
        seg = seg.replace('nextIndex < LETTERS.length ? "letter" : "word"', 'nextIndex < runtimeLetters.length ? "letter" : "word"', 1)
        seg = seg.replace('nextIndex < LETTERS.length ? LETTERS[nextIndex] : WORDS[0]', 'nextIndex < runtimeLetters.length ? runtimeLetters[nextIndex] : (await getLiveAssessmentContent(host.teacherId, host.assessmentSession?.assessmentPeriod || "BoSY")).words[0]', 1)
        t = t[:hs] + seg + t[he:]

    # Word scoring uses live DB words.
    hs = t.index('    /* RECORD WORD')
    he = t.index('    /* SELECT STORY / START PASSAGE', hs)
    seg = t[hs:he]
    if 'const runtimeWords = runtimeContent.words;' not in seg:
        insert = '''      const runtimeContent = await getLiveAssessmentContent(\n        host.teacherId,\n        host.assessmentSession?.assessmentPeriod || "BoSY"\n      );\n      const runtimeWords = runtimeContent.words;\n\n'''
        seg = one_regex(seg, r'(\s*const wordIndex =[\s\S]*?;\n)', r'\1' + insert, 'API word runtime arrays')
        seg = seg.replace('WORDS[\n        wordIndex\n      ]', 'runtimeWords[\n        wordIndex\n      ]', 1)
        seg = seg.replace('wordIndex < WORDS.length - 1', 'wordIndex < runtimeWords.length - 1', 1)
        seg = seg.replace('WORDS[wordIndex + 1]', 'runtimeWords[wordIndex + 1]', 1)
    t = t[:hs] + seg + t[he:]
    p.write_text(t)


def main():
    patch_teacher_page()
    patch_client()
    patch_api()
    print('Live DB assessment alignment applied.')


if __name__ == '__main__':
    main()
