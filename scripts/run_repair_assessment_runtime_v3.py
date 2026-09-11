from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "scripts/repair_assessment_runtime_v2.py"
source = TARGET.read_text()

# Scope the runtime-content hydration patch to fetchSession only.
start = source.find("    # Hydrate content after host_get data arrives.")
end = source.find("    # Story selection sends the actual DB-backed passage.", start)
if start < 0 or end < 0:
    raise RuntimeError("Could not locate hydration section.")
hydration = '''    # Hydrate content after host_get data arrives.
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
source = source[:start] + hydration + source[end:]

# Make the drawer review-confirm cleanup idempotent.
drawer_pattern = r"    body = rx1\(body, r'\\n\\s*\\{miscueReviewMode && \\(\\s*<button[\\s\\S]*?<\\/button>\\s*\\)\\s*\\n\\s*\\}', '', \"remove drawer review confirmation\"\)"
drawer_replacement = '''    drawer_review_pattern = r'\\n\\s*\\{miscueReviewMode && \\(\\s*<button[\\s\\S]*?<\\/button>\\s*\\)\\s*\\n\\s*\\}'
    body, _drawer_removed = re.subn(drawer_review_pattern, '', body, count=1)'''
source, n = re.subn(drawer_pattern, drawer_replacement, source, count=1)
if n != 1:
    raise RuntimeError("Could not locate drawer cleanup patch.")

# The lock pattern appears in letter, word, and comprehension handlers. Replace
# only the comprehension handler's exact-patch blocks.
lock_pattern = r'''    body = exact\(body,
''' + r"'''[\s\S]*?''',
'''[\s\S]*?''', \"comprehension lock set\"\)" + r'''
'''
lock_replacement = '''    comp_start = body.index("  const recordComprehension =")
    comp_end = body.index("  const finalize =", comp_start)
    comp_segment = body[comp_start:comp_end]
    comp_segment = exact(comp_segment,
''' + r"'''" + '''      answerActionLockRef.current = lockKey;
      setAnswerLockKey(lockKey);
      setBusy(true);''' + r"'''" + ''',
''' + r"'''" + '''      answerActionLockRef.current = lockKey;
      setAnswerLockKey(lockKey);
      setComprehensionLockedQuestion(questionIndex);
      setBusy(true);''' + r"'''" + ''', "comprehension lock set")
'''
source, n = re.subn(lock_pattern, lock_replacement, source, count=1)
if n != 1:
    raise RuntimeError("Could not locate comprehension lock-set patch.")

reset_pattern = r'''    body = exact\(body,
''' + r"'''[\s\S]*?''',
'''[\s\S]*?''', \"comprehension lock reset\"\)" + r'''
'''
reset_replacement = '''    comp_segment = exact(comp_segment,
''' + r"'''" + '''      } catch (recordError) {
        answerActionLockRef.current = "";
        setAnswerLockKey("");
        setError(''' + r"'''" + ''',
''' + r"'''" + '''      } catch (recordError) {
        answerActionLockRef.current = "";
        setAnswerLockKey("");
        setComprehensionLockedQuestion(null);
        setError(''' + r"'''" + ''', "comprehension lock reset")
'''
source, n = re.subn(reset_pattern, reset_replacement, source, count=1)
if n != 1:
    raise RuntimeError("Could not locate comprehension lock-reset patch.")

button_pattern = r'''    body = exact\(body,
''' + r"'''[\s\S]*?''',
'''[\s\S]*?''', \"comprehension button disabled lock\"\)" + r'''
'''
button_replacement = '''    comp_segment = exact(comp_segment,
''' + r"'''" + '''                            answerLockKey ===
                            ("comprehension:" +
                              questionIndex)''' + r"'''" + ''',
''' + r"'''" + '''                            (answerLockKey ===
                              ("comprehension:" +
                                questionIndex) ||
                              comprehensionLockedQuestion === questionIndex)''' + r"'''" + ''', "comprehension button disabled lock")
    body = body[:comp_start] + comp_segment + body[comp_end:]
'''
source, n = re.subn(button_pattern, button_replacement, source, count=1)
if n != 1:
    raise RuntimeError("Could not locate comprehension button lock patch.")

namespace = {"__name__": "__main__", "__file__": str(TARGET)}
exec(compile(source, str(TARGET), "exec"), namespace, namespace)
