from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "scripts/repair_assessment_runtime_v2.py"
source = TARGET.read_text()

start = source.find("    # Hydrate content after host_get data arrives.")
end = source.find("    # Story selection sends the actual DB-backed passage.", start)
if start < 0 or end < 0:
    raise RuntimeError("Could not locate the generated hydration section in v2 script.")

replacement = '''    # Hydrate content after host_get data arrives.
    fetch_start = body.index("  const fetchSession =")
    fetch_end = body.index("  const selectStory =", fetch_start)
    fetch_segment = body[fetch_start:fetch_end]
    fetch_segment = exact(
        fetch_segment,
        ''' + repr('''        const data =
          await response.json();''') + ''',
        ''' + repr('''        const data =
          await response.json();

        const runtimeContent = data?.session?.assessment_content;
        if (runtimeContent) {
          setAssessmentContent({
            letters: Array.isArray(runtimeContent.letters) && runtimeContent.letters.length ? runtimeContent.letters : LETTERS,
            words: Array.isArray(runtimeContent.words) && runtimeContent.words.length ? runtimeContent.words : WORDS,
            stories: Array.isArray(runtimeContent.stories) && runtimeContent.stories.length ? runtimeContent.stories : STORIES,
          });
        }''') + ''',
        "assessment client DB content hydration",
    )
    body = body[:fetch_start] + fetch_segment + body[fetch_end:]

'''
source = source[:start] + replacement + source[end:]

# The v2 script also has a deliberately strict optional cleanup for a drawer
# confirmation that may already be absent in the current baseline. Make that
# cleanup idempotent rather than allowing it to abort an otherwise valid repair.
old = '''    body = rx1(body, r'\\n\\s*\\{miscueReviewMode && \\(\\s*<button[\\s\\S]*?<\\/button>\\s*\\)\\s*\\n\\s*\\}', '', "remove drawer review confirmation")'''
new = '''    drawer_review_pattern = r'\\n\\s*\\{miscueReviewMode && \\(\\s*<button[\\s\\S]*?<\\/button>\\s*\\)\\s*\\n\\s*\\}'\n    body, _drawer_removed = re.subn(drawer_review_pattern, '', body, count=1)'''
if old not in source:
    raise RuntimeError("Could not locate drawer cleanup patch in v2 script.")
source = source.replace(old, new, 1)

namespace = {"__name__": "__main__", "__file__": str(TARGET)}
exec(compile(source, str(TARGET), "exec"), namespace, namespace)
