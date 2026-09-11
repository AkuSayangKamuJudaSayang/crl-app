from pathlib import Path
import re

ROOT = Path.cwd()

PARA = "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man."
FIELDS = "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil."


def js(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'


def sub_once(text, pattern, replacement, label):
    out, n = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if n != 1:
        raise RuntimeError(f"{label}: expected one match, found {n}")
    return out


def patch_teacher_page():
    p = ROOT / "app/teacher/page.jsx"
    t = p.read_text()
    t = sub_once(
        t,
        r'(BoSY:\s*\{\s*letters:\s*LETTERS,\s*words:\s*WORDS,\s*stories:\s*\[)\s*\{[\s\S]*?\}\s*,\s*\{[\s\S]*?\}\s*,\s*\]',
        r'''\1
      { id: 1, title: "Para the Parrot", text: ''' + js(PARA) + r''' },
      { id: 2, title: "A Day in the Fields", text: ''' + js(FIELDS) + r''' },
    ]''',
        "teacher BoSY story defaults",
    )
    p.write_text(t)


def patch_client():
    p = ROOT / "app/teacher/assessment/AssessmentClient.jsx"
    t = p.read_text()

    t = t.replace("const LETTERS = [", "let LETTERS = [", 1)
    t = t.replace("const WORDS = [", "let WORDS = [", 1)
    t = t.replace("const STORIES = [", "let STORIES = [", 1)

    helper = '''\nfunction applyLiveAssessmentContent(session) {\n  const content = session?.assessment_content;\n  if (!content) return false;\n  if (Array.isArray(content.letters) && content.letters.length) {\n    LETTERS = content.letters.map((value) => String(value));\n  }\n  if (Array.isArray(content.words) && content.words.length) {\n    WORDS = content.words.map((value) => String(value));\n  }\n  if (Array.isArray(content.stories) && content.stories.length) {\n    STORIES = content.stories.map((story, index) => ({\n      id: Number(story?.id ?? index + 1),\n      title: String(story?.title || `Story ${index + 1}`),\n      description: String(story?.description || "Story passage from Manage Assessment."),\n      text: String(story?.text || ""),\n      available: Boolean(String(story?.text || "").trim()),\n    }));\n  }\n  return true;\n}\n'''
    if "function applyLiveAssessmentContent" not in t:
        t = t.replace("\nexport default function TeacherAssessmentPage(", helper + "\nexport default function TeacherAssessmentPage(", 1)

    if "setAssessmentContentVersion" not in t:
        t = t.replace(
            "  const [\n    session,\n    setSession,\n  ] = useState(null);",
            "  const [\n    session,\n    setSession,\n  ] = useState(null);\n  const [, setAssessmentContentVersion] = useState(0);",
            1,
        )

    fetch_start = t.index("  const fetchSession =")
    fetch_end = t.index("  const selectStory = useCallback(", fetch_start)
    fetch = t[fetch_start:fetch_end]
    if "applyLiveAssessmentContent(data.session)" not in fetch:
        fetch = fetch.replace(
            "        const data =\n          await response.json();",
            "        const data =\n          await response.json();\n\n        if (data?.session?.assessment_content && applyLiveAssessmentContent(data.session)) {\n          setAssessmentContentVersion((version) => version + 1);\n        }",
            1,
        )
    t = t[:fetch_start] + fetch + t[fetch_end:]

    t = sub_once(
        t,
        r'  const passageText =\s*session\?\.story_title === "A Day In The Fields"\s*\? FIELD_PASSAGE_TEXT\s*:\s*PASSAGE_TEXT;',
        '''  const passageText =\n    activeStage === "passage" && String(session?.current_content || "").trim()\n      ? String(session.current_content)\n      : String(session?.story_title || "").trim().toLowerCase() === "a day in the fields"\n        ? FIELD_PASSAGE_TEXT\n        : PASSAGE_TEXT;''',
        "client live passage",
    )

    t = sub_once(
        t,
        r'      const next = \{\s*code,\s*stage:\s*"passage",\s*currentContent:\s*story\.id === 1\s*\? PASSAGE_TEXT\s*:\s*FIELD_PASSAGE_TEXT,\s*storyTitle:\s*story\.title,\s*\};',
        '''      const next = {\n        code,\n        stage: "passage",\n        currentContent: String(story?.text || ""),\n        storyTitle: String(story?.title || ""),\n      };''',
        "client DB story content",
    )

    t = t.replace("available: false", "available: true", 1)
    p.write_text(t)


def patch_api():
    p = ROOT / "app/api/assessment/route.js"
    t = p.read_text()

    if "async function getLiveAssessmentContent(" not in t:
        helper = '''\n\nasync function getLiveAssessmentContent(teacherId, assessmentPeriod) {\n  const rows = await prisma.assessmentContent.findMany({\n    where: { teacherId, assessmentPeriod },\n    orderBy: [{ category: "asc" }, { position: "asc" }],\n  });\n  return {\n    letters: rows.filter((row) => row.category === "letters").map((row) => row.content || ""),\n    words: rows.filter((row) => row.category === "words").map((row) => row.content || ""),\n    stories: rows.filter((row) => row.category === "stories").map((row) => ({\n      id: row.id,\n      title: row.storyTitle || "Untitled Story",\n      description: "Story passage from Manage Assessment.",\n      text: row.content || "",\n      available: Boolean(String(row.content || "").trim()),\n    })),\n  };\n}\n'''
        t = t.replace("\nfunction responseJson(data, status = 200) {", helper + "\nfunction responseJson(data, status = 200) {", 1)

    # Host GET: use the DB content in the response every time the assessment polls.
    story_marker = "          story_choices: STORY_CHOICES,"
    story_pos = t.index(story_marker)
    return_pos = t.rfind("return responseJson({", 0, story_pos)
    if return_pos < 0:
        raise RuntimeError("API host GET: could not locate response before story choices")
    insert_point = t.rfind("\n", 0, return_pos) + 1
    live_defs = '''      const assessmentPeriod = host.assessmentSession?.assessmentPeriod || "BoSY";\n      const liveAssessmentContent = await getLiveAssessmentContent(host.teacherId, assessmentPeriod);\n      const liveStoryChoices = liveAssessmentContent.stories;\n\n'''
    if "const liveAssessmentContent = await getLiveAssessmentContent(host.teacherId, assessmentPeriod);" not in t[insert_point:return_pos + 50]:
        t = t[:insert_point] + live_defs + t[insert_point:]
    t = t.replace(
        "          story_choices: STORY_CHOICES,",
        "          story_choices: liveStoryChoices,\n          assessment_content: liveAssessmentContent,",
        1,
    )

    # Story selection: replace the old in-memory map with the teacher's current DB stories.
    select_start = t.index("    /* SELECT STORY / START PASSAGE")
    select_end = t.index("    /* PASSAGE READY / TIMER CONTROL", select_start)
    seg = t[select_start:select_end]
    if "const liveAssessmentContent = await getLiveAssessmentContent" not in seg:
        seg = sub_once(
            seg,
            r'      const stories = \{[\s\S]*?      const selected = stories\[storyId\];',
            '''      const liveAssessmentContent = await getLiveAssessmentContent(\n        host.teacherId,\n        host.assessmentSession?.assessmentPeriod || "BoSY"\n      );\n      const stories = liveAssessmentContent.stories;\n      const selected = stories.find((story) => Number(story.id) === storyId) || stories[storyId - 1];''',
            "API story selection",
        )
    seg = seg.replace("          currentContent: selected.passage,", "          currentContent: selected.text,", 1)
    seg = seg.replace(
        "          story_choices: STORY_CHOICES,",
        "          story_choices: stories,\n          assessment_content: liveAssessmentContent,",
        1,
    )
    t = t[:select_start] + seg + t[select_end:]

    # Letter scoring/progression uses current DB letters.
    letter_start = t.index("    /* RECORD LETTER")
    letter_end = t.index("    /* RECORD WORD", letter_start)
    letter_seg = t[letter_start:letter_end]
    if "const runtimeAssessmentContent = await getLiveAssessmentContent" not in letter_seg:
        first_if = letter_seg.find("      if (")
        live = '''      const runtimeAssessmentContent = await getLiveAssessmentContent(\n        host.teacherId,\n        host.assessmentSession?.assessmentPeriod || "BoSY"\n      );\n      const runtimeLetters = runtimeAssessmentContent.letters;\n\n'''
        letter_seg = letter_seg[:first_if] + live + letter_seg[first_if:]
        letter_seg = letter_seg.replace("LETTERS[letterIndex]", "runtimeLetters[letterIndex]", 1)
        letter_seg = letter_seg.replace("nextIndex < LETTERS.length", "nextIndex < runtimeLetters.length", 1)
        letter_seg = letter_seg.replace("nextIndex < LETTERS.length ? LETTERS[nextIndex] : WORDS[0]", "nextIndex < runtimeLetters.length ? runtimeLetters[nextIndex] : (runtimeAssessmentContent.words[0] || WORDS[0])", 1)
    t = t[:letter_start] + letter_seg + t[letter_end:]

    # Word scoring/progression uses current DB words.
    word_start = t.index("    /* RECORD WORD")
    word_end = t.index("    /* SELECT STORY / START PASSAGE", word_start)
    word_seg = t[word_start:word_end]
    if "const runtimeAssessmentContent = await getLiveAssessmentContent" not in word_seg:
        first_if = word_seg.find("      if (")
        live = '''      const runtimeAssessmentContent = await getLiveAssessmentContent(\n        host.teacherId,\n        host.assessmentSession?.assessmentPeriod || "BoSY"\n      );\n      const runtimeWords = runtimeAssessmentContent.words;\n\n'''
        word_seg = word_seg[:first_if] + live + word_seg[first_if:]
        word_seg = re.sub(r"WORDS\[\s*wordIndex\s*\]", "runtimeWords[wordIndex]", word_seg, count=1)
        word_seg = word_seg.replace("wordIndex < WORDS.length - 1", "wordIndex < runtimeWords.length - 1", 1)
        word_seg = re.sub(r"WORDS\[wordIndex \+ 1\]", "runtimeWords[wordIndex + 1]", word_seg, count=1)
    t = t[:word_start] + word_seg + t[word_end:]

    p.write_text(t)


def main():
    patch_teacher_page()
    patch_client()
    patch_api()
    print("Live DB assessment alignment applied.")


if __name__ == "__main__":
    main()
