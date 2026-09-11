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


def patch_teacher_page():
    p = ROOT / "app/teacher/page.jsx"
    t = p.read_text()
    # Keep the Manage Assessment page's story labels/content aligned with the assessment vocabulary.
    t = re.sub(
        r'(?s)const DEFAULT_CONTENT = \{.*?\n\};\n\nfunction responseJson',
        f'''const DEFAULT_CONTENT = {{
  BoSY: {{
    letters: LETTERS,
    words: WORDS,
    stories: [
      {{ id: 1, title: "Para the Parrot", text: {js(PARA)} }},
      {{ id: 2, title: "A Day in the Fields", text: {js(FIELDS)} }},
    ],
  }},
  MoSY: {{
    letters: LETTERS,
    words: WORDS,
    stories: [
      {{ id: 1, title: "A Day in the Fields", text: {js(FIELDS)} }},
    ],
  }},
  EoSY: {{
    letters: LETTERS,
    words: WORDS,
    stories: [
      {{ id: 1, title: "A Day in the Fields", text: {js(FIELDS)} }},
    ],
  }},
}};

function responseJson''',
        t,
        count=1,
    )
    p.write_text(t)


def patch_client():
    p = ROOT / "app/teacher/assessment/AssessmentClient.jsx"
    t = p.read_text()

    # Runtime assessment content is mutable per teacher/period and comes from the DB.
    t = t.replace("const LETTERS = [", "let LETTERS = [", 1)
    t = t.replace("const WORDS = [", "let WORDS = [", 1)
    t = t.replace("const STORIES = [", "let STORIES = [", 1)

    helper = '''\nfunction applyLiveAssessmentContent(session) {\n  const content = session?.assessment_content;\n  if (!content) return false;\n\n  if (Array.isArray(content.letters) && content.letters.length) {\n    LETTERS = content.letters.map((value) => String(value));\n  }\n\n  if (Array.isArray(content.words) && content.words.length) {\n    WORDS = content.words.map((value) => String(value));\n  }\n\n  if (Array.isArray(content.stories) && content.stories.length) {\n    STORIES = content.stories.map((story, index) => ({\n      id: Number(story?.id ?? index + 1),\n      title: String(story?.title || `Story ${index + 1}`),\n      description: String(story?.description || ""),\n      text: String(story?.text || ""),\n      available: Boolean(String(story?.text || "").trim()),\n    }));\n  }\n\n  return true;\n}\n'''
    if "function applyLiveAssessmentContent" not in t:
        t = t.replace('\nexport default function TeacherAssessmentPage(', helper + '\nexport default function TeacherAssessmentPage(', 1)

    # Make the second story selectable even before hydration. Hydration will replace its text/title from DB.
    t = t.replace('    available: false,', '    text: FIELD_PASSAGE_TEXT,\n    available: true,', 1)

    # Hydrate DB content from host_get before the current session is installed.
    fetch_marker = '        const data =\n          await response.json();'
    if 'applyLiveAssessmentContent(data.session)' not in t:
        t = t.replace(
            fetch_marker,
            fetch_marker + '''\n\n        if (data?.session?.assessment_content) {\n          applyLiveAssessmentContent(data.session);\n        }''',
            1,
        )

    # The server's selected current_content is authoritative for the active passage.
    t = re.sub(
        r'(?s)  const passageText =.*?\n\n  const pendingAnswerRef =',
        '''  const passageText =\n    String(\n      session?.current_content ||\n        session?.currentContent ||\n        ""\n    ).trim() ||\n    (String(session?.story_title || "").trim().toLowerCase() === "a day in the fields"\n      ? FIELD_PASSAGE_TEXT\n      : PASSAGE_TEXT);\n\n  const pendingAnswerRef =''',
        t,
        count=1,
    )

    # Send the actual story text selected from hydrated assessment content.
    t = re.sub(
        r'currentContent:\s*\n\s*story\.id === 1\s*\n\s*\? PASSAGE_TEXT\s*\n\s*:\s*FIELD_PASSAGE_TEXT,',
        'currentContent: String(story?.text || ""),',
        t,
        count=1,
    )

    p.write_text(t)


def insert_api_helper(t):
    if "async function getLiveAssessmentContent(" in t:
        return t
    helper = '''\n\nasync function getLiveAssessmentContent(teacherId, assessmentPeriod) {\n  const rows = await prisma.assessmentContent.findMany({\n    where: { teacherId, assessmentPeriod },\n    orderBy: [{ category: "asc" }, { position: "asc" }],\n  });\n\n  return {\n    letters: rows\n      .filter((row) => row.category === "letters")\n      .map((row) => row.content || ""),\n    words: rows\n      .filter((row) => row.category === "words")\n      .map((row) => row.content || ""),\n    stories: rows\n      .filter((row) => row.category === "stories")\n      .map((row) => ({\n        id: row.id,\n        title: row.storyTitle || "Untitled Story",\n        description: "Story passage from Manage Assessment.",\n        text: row.content || "",\n        available: Boolean(String(row.content || "").trim()),\n      })),\n  };\n}\n'''
    return t.replace('\nfunction responseJson(data, status = 200) {', helper + '\nfunction responseJson(data, status = 200) {', 1)


def patch_host_get(t):
    marker = '    /* HOST GET'
    start = t.index(marker)
    next_marker = t.find('    /*', start + len(marker))
    if next_marker == -1:
        raise RuntimeError("HOST GET block end not found")
    block = t[start:next_marker]

    if 'assessment_content:' not in block:
        line = '          story_choices: STORY_CHOICES,'
        if line not in block:
            raise RuntimeError("HOST GET story_choices line not found")
        replacement = '''      const assessmentPeriod =\n        host.assessmentSession?.assessmentPeriod || "BoSY";\n      const liveAssessmentContent = await getLiveAssessmentContent(\n        host.teacherId,\n        assessmentPeriod\n      );\n      const liveStoryChoices = liveAssessmentContent.stories;\n\n''' + line.replace('STORY_CHOICES', 'liveStoryChoices') + '''\n          assessment_content: liveAssessmentContent,'''
        block = block.replace(line, replacement, 1)

    return t[:start] + block + t[next_marker:]


def patch_select_story(t):
    marker = '    /* ====================================================================== */\n    /* SELECT STORY / START PASSAGE'
    start = t.index(marker)
    next_marker = t.find('    /*', start + len(marker))
    if next_marker == -1:
        raise RuntimeError("SELECT STORY block end not found")
    block = t[start:next_marker]

    if 'getLiveAssessmentContent(host.teacherId' not in block:
        pattern = r'(?s)      const stories = \{.*?      const selected = stories\[storyId\];'
        replacement = '''      const liveAssessmentContent = await getLiveAssessmentContent(\n        host.teacherId,\n        host.assessmentSession?.assessmentPeriod || "BoSY"\n      );\n      const stories = liveAssessmentContent.stories;\n      const selected = stories.find((story) => Number(story.id) === storyId);'''
        block = one_regex(block, pattern, replacement, "SELECT STORY DB content")

    block = block.replace('          currentContent: selected.passage,', '          currentContent: selected.text,', 1)
    block = block.replace('          story_choices: STORY_CHOICES,', '          story_choices: stories,\n          assessment_content: liveAssessmentContent,', 1)
    return t[:start] + block + t[next_marker:]


def patch_letter_record(t):
    marker = '    /* ====================================================================== */\n    /* RECORD LETTER'
    start = t.index(marker)
    next_marker = t.find('    /*', start + len(marker))
    if next_marker == -1:
        raise RuntimeError("RECORD LETTER block end not found")
    block = t[start:next_marker]
    if 'const runtimeContent = await getLiveAssessmentContent' not in block:
        insert_point = block.find('      const letter =')
        if insert_point == -1:
            raise RuntimeError("RECORD LETTER value lookup not found")
        runtime = '''      const runtimeContent = await getLiveAssessmentContent(\n        host.teacherId,\n        host.assessmentSession?.assessmentPeriod || "BoSY"\n      );\n      const runtimeLetters = runtimeContent.letters;\n\n'''
        block = block[:insert_point] + runtime + block[insert_point:]
        block = block.replace('LETTERS[', 'runtimeLetters[')
        block = block.replace('LETTERS.length', 'runtimeLetters.length')
        block = block.replace(' : WORDS[0]', ' : runtimeContent.words[0]')
    return t[:start] + block + t[next_marker:]


def patch_word_record(t):
    marker = '    /* ====================================================================== */\n    /* RECORD WORD'
    start = t.index(marker)
    next_marker = t.find('    /*', start + len(marker))
    if next_marker == -1:
        raise RuntimeError("RECORD WORD block end not found")
    block = t[start:next_marker]
    if 'const runtimeContent = await getLiveAssessmentContent' not in block:
        insert_point = block.find('      const word =')
        if insert_point == -1:
            raise RuntimeError("RECORD WORD value lookup not found")
        runtime = '''      const runtimeContent = await getLiveAssessmentContent(\n        host.teacherId,\n        host.assessmentSession?.assessmentPeriod || "BoSY"\n      );\n      const runtimeWords = runtimeContent.words;\n\n'''
        block = block[:insert_point] + runtime + block[insert_point:]
        block = block.replace('WORDS[', 'runtimeWords[')
        block = block.replace('WORDS.length', 'runtimeWords.length')
    return t[:start] + block + t[next_marker:]


def patch_api():
    p = ROOT / "app/api/assessment/route.js"
    t = p.read_text()
    t = insert_api_helper(t)
    t = patch_host_get(t)
    t = patch_select_story(t)
    t = patch_letter_record(t)
    t = patch_word_record(t)
    p.write_text(t)


def main():
    patch_teacher_page()
    patch_client()
    patch_api()
    print("Live DB assessment alignment applied.")


if __name__ == "__main__":
    main()
