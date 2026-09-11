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

drawer_pos = source.find('"remove drawer review confirmation")')
if drawer_pos < 0:
    raise RuntimeError("drawer cleanup label not found")
drawer_start = source.rfind("    body = rx1(", 0, drawer_pos)
drawer_end = source.find(")", drawer_pos)
if drawer_start < 0 or drawer_end < 0:
    raise RuntimeError("drawer cleanup block not found")
source = source[:drawer_start] + "    body = body\n" + source[drawer_end + 1:]

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
    body = body[:comp_start] + comp_segment + body[comp_end:]
'''
source = replace_labeled(source, '"comprehension lock set")', lock_replacement)

reset_pos = source.find('"comprehension lock reset")')
if reset_pos < 0:
    raise RuntimeError("comprehension reset label not found")
reset_start = source.rfind("    body = exact(body,", 0, reset_pos)
reset_end = source.find(")", reset_pos)
if reset_start < 0 or reset_end < 0:
    raise RuntimeError("comprehension reset block not found")
source = source[:reset_start] + "    body = body\n" + source[reset_end + 1:]

button_old = '''                            answerLockKey ===
                            ("comprehension:" +
                              questionIndex)'''
button_new = '''                            (answerLockKey ===
                              ("comprehension:" +
                                questionIndex) ||
                              comprehensionLockedQuestion === questionIndex)'''
if button_old in source:
    source = source.replace(button_old, button_new, 1)
elif 'comprehensionLockedQuestion === questionIndex' not in source:
    raise RuntimeError("comprehension button disabled lock: expected source pattern not found")

namespace = {"__name__": "__main__", "__file__": str(TARGET)}
exec(compile(source, str(TARGET), "exec"), namespace, namespace)
