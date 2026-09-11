from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "scripts/repair_assessment_runtime_v2.py"
source = TARGET.read_text()

def replace_labeled(src, label, replacement, call_prefix="    body = exact(body,"):
    pos = src.find(label)
    if pos < 0:
        raise RuntimeError(f"label not found: {label}")
    start = src.rfind(call_prefix, 0, pos)
    if start < 0:
        raise RuntimeError(f"patch start not found: {label}")
    end = src.find(")", pos)
    if end < 0:
        raise RuntimeError(f"patch end not found: {label}")
    return src[:start] + replacement + src[end + 1:]

# Scope hydration to fetchSession only.
hydration_replacement = '''    fetch_start = body.index("  const fetchSession =")
    fetch_end = body.index("  const selectStory =", fetch_start)
    fetch_segment = body[fetch_start:fetch_end]
    fetch_segment = exact(
        fetch_segment,
        """        const data =
          await response.json();""",
        """        const data =
          await response.json();

        const runtimeContent = data?.session?.assessment_content;
        if (runtimeContent) {
          setAssessmentContent({
            letters: Array.isArray(runtimeContent.letters) && runtimeContent.letters.length ? runtimeContent.letters : LETTERS,
            words: Array.isArray(runtimeContent.words) && runtimeContent.words.length ? runtimeContent.words : WORDS,
            stories: Array.isArray(runtimeContent.stories) && runtimeContent.stories.length ? runtimeContent.stories : STORIES,
          });
        }""",
        "assessment client DB content hydration",
    )
    body = body[:fetch_start] + fetch_segment + body[fetch_end:]
'''
source = replace_labeled(source, '"assessment client DB content hydration")', hydration_replacement)

# Make the optional drawer-confirmation cleanup idempotent because the current
# baseline may already have no matching block.
drawer_pos = source.find('"remove drawer review confirmation")')
if drawer_pos < 0:
    raise RuntimeError("drawer cleanup label not found")
drawer_start = source.rfind("    body = rx1(", 0, drawer_pos)
if drawer_start < 0:
    raise RuntimeError("drawer cleanup start not found")
drawer_end = source.find(")", drawer_pos)
if drawer_end < 0:
    raise RuntimeError("drawer cleanup end not found")
drawer_end += 1
source = source[:drawer_start] + "    # Drawer confirmation cleanup is optional; current baseline may already have removed it.\n    body = body\n" + source[drawer_end:]

# Scope comprehension locking to recordComprehension only.
lock_replacement = '''    comp_start = body.index("  const recordComprehension =")
    comp_end = body.index("  const finalize =", comp_start)
    comp_segment = body[comp_start:comp_end]
    comp_segment = exact(
        comp_segment,
        """      answerActionLockRef.current = lockKey;
      setAnswerLockKey(lockKey);
      setBusy(true);""",
        """      answerActionLockRef.current = lockKey;
      setAnswerLockKey(lockKey);
      setComprehensionLockedQuestion(questionIndex);
      setBusy(true);""",
        "comprehension lock set",
    )
'''
source = replace_labeled(source, '"comprehension lock set")', lock_replacement)

reset_replacement = '''    comp_segment = exact(
        comp_segment,
        """      } catch (recordError) {
        answerActionLockRef.current = "";
        setAnswerLockKey("");
        setError(''' + "'" + '''""",
        """      } catch (recordError) {
        answerActionLockRef.current = "";
        setAnswerLockKey("");
        setComprehensionLockedQuestion(null);
        setError(''' + "'" + '''""",
        "comprehension lock reset",
    )
'''
source = replace_labeled(source, '"comprehension lock reset")', reset_replacement)

button_replacement = '''    comp_segment = exact(
        comp_segment,
        """                            answerLockKey ===
                            ("comprehension:" +
                              questionIndex)""",
        """                            (answerLockKey ===
                              ("comprehension:" +
                                questionIndex) ||
                              comprehensionLockedQuestion === questionIndex)""",
        "comprehension button disabled lock",
    )
    body = body[:comp_start] + comp_segment + body[comp_end:]
'''
source = replace_labeled(source, '"comprehension button disabled lock")', button_replacement)

namespace = {"__name__": "__main__", "__file__": str(TARGET)}
exec(compile(source, str(TARGET), "exec"), namespace, namespace)
