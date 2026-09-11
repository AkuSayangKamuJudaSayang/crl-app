from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "scripts/repair_assessment_runtime_v2.py"
source = TARGET.read_text()

# Replace only the generated patch block identified by its unique label. This
# avoids matching the many identical answer-lock snippets in AssessmentClient.
def replace_labeled(src, label, replacement):
    pos = src.find(label)
    if pos < 0:
        raise RuntimeError(f"label not found: {label}")
    start = src.rfind("    body = exact(body,", 0, pos)
    if start < 0:
        raise RuntimeError(f"patch start not found: {label}")
    end = src.find("\n    )", pos)
    if end < 0:
        raise RuntimeError(f"patch end not found: {label}")
    end += len("\n    )")
    return src[:start] + replacement + src[end:]

source = replace_labeled(source, '"comprehension lock set")', '''    comp_start = body.index("  const recordComprehension =")
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
''')

source = replace_labeled(source, '"comprehension lock reset")', '''    comp_segment = exact(
        comp_segment,
        """      } catch (recordError) {
        answerActionLockRef.current = "";
        setAnswerLockKey("");
        setError(""", 
        """      } catch (recordError) {
        answerActionLockRef.current = "";
        setAnswerLockKey("");
        setComprehensionLockedQuestion(null);
        setError(""",
        "comprehension lock reset",
    )
''')

source = replace_labeled(source, '"comprehension button disabled lock")', '''    comp_segment = exact(
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
''')

namespace = {"__name__": "__main__", "__file__": str(TARGET)}
exec(compile(source, str(TARGET), "exec"), namespace, namespace)
