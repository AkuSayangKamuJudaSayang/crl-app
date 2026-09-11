from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "scripts/repair_assessment_runtime_v2.py"
source = TARGET.read_text()

pattern = re.compile(
    r"    # Hydrate content after host_get data arrives\.\n"
    r"    body = exact\(body,\n"
    r"'''        const data =\\n          await response\.json\(\);''',\n"
    r"'''        const data =\\n          await response\.json\(\);.*?\n"
    r"        \}\}\),\n"
    r"?        \}\}\?", re.DOTALL
)

# The generated v2 source contains a brittle global replacement around a repeated
# response.json() block. Replace that entire generated section with a scoped patch
# that searches only inside fetchSession.
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

namespace = {"__name__": "__main__", "__file__": str(TARGET)}
exec(compile(source, str(TARGET), "exec"), namespace, namespace)
