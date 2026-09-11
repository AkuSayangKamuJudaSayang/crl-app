from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "scripts/repair_assessment_runtime_v2.py"
source = TARGET.read_text()

label = '"assessment client DB content hydration",'
label_pos = source.find(label)
if label_pos < 0:
    raise RuntimeError("Could not locate the brittle hydration patch in v2 script.")

start = source.rfind("    body = exact(body,", 0, label_pos)
if start < 0:
    raise RuntimeError("Could not locate hydration exact() call start.")

close = source.find("    )", label_pos)
if close < 0:
    raise RuntimeError("Could not locate hydration exact() call end.")
close += len("    )")

replacement = '''    fetch_start = body.index("  const fetchSession =")
    fetch_end = body.index("  const selectStory =", fetch_start)
    fetch_segment = body[fetch_start:fetch_end]
    fetch_segment = exact(
        fetch_segment,
        "        const data =\\n          await response.json();",
        '''        const data =\\n          await response.json();\\n\\n        const runtimeContent = data?.session?.assessment_content;\\n        if (runtimeContent) {\\n          setAssessmentContent({\\n            letters: Array.isArray(runtimeContent.letters) && runtimeContent.letters.length ? runtimeContent.letters : LETTERS,\\n            words: Array.isArray(runtimeContent.words) && runtimeContent.words.length ? runtimeContent.words : WORDS,\\n            stories: Array.isArray(runtimeContent.stories) && runtimeContent.stories.length ? runtimeContent.stories : STORIES,\\n          });\\n        }''',
        "assessment client DB content hydration",
    )
    body = body[:fetch_start] + fetch_segment + body[fetch_end:]
'''

source = source[:start] + replacement + source[close:]

namespace = {"__name__": "__main__", "__file__": str(TARGET)}
exec(compile(source, str(TARGET), "exec"), namespace, namespace)
