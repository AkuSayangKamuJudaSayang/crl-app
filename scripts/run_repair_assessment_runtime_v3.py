from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "scripts/repair_assessment_runtime_v2.py"
source = TARGET.read_text()

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

old_drawer = '''    body = rx1(body, r'\\n\\s*\\{miscueReviewMode && \\(\\s*<button[\\s\\S]*?<\\/button>\\s*\\)\\s*\\n\\s*\\}', '', "remove drawer review confirmation")'''
new_drawer = '''    drawer_review_pattern = r'\\n\\s*\\{miscueReviewMode && \\(\\s*<button[\\s\\S]*?<\\/button>\\s*\\)\\s*\\n\\s*\\}'\n    body, _drawer_removed = re.subn(drawer_review_pattern, '', body, count=1)'''
if old_drawer not in source:
    raise RuntimeError("Could not locate drawer cleanup.")
source = source.replace(old_drawer, new_drawer, 1)

old1 = '''    body = exact(body,\n''' + repr('''      answerActionLockRef.current = lockKey;
      setAnswerLockKey(lockKey);
      setBusy(true);''') + ''',\n''' + repr('''      answerActionLockRef.current = lockKey;
      setAnswerLockKey(lockKey);
      setComprehensionLockedQuestion(questionIndex);
      setBusy(true);''') + ''', "comprehension lock set")'''
new1 = '''    comp_start = body.index("  const recordComprehension =")
    comp_end = body.index("  const finalize =", comp_start)
    comp_segment = body[comp_start:comp_end]
    comp_segment = exact(comp_segment,
''' + repr('''      answerActionLockRef.current = lockKey;
      setAnswerLockKey(lockKey);
      setBusy(true);''') + ''',
''' + repr('''      answerActionLockRef.current = lockKey;
      setAnswerLockKey(lockKey);
      setComprehensionLockedQuestion(questionIndex);
      setBusy(true);''') + ''', "comprehension lock set")'''
if old1 not in source:
    raise RuntimeError("Could not locate comprehension lock-set patch.")
source = source.replace(old1, new1, 1)

old2 = '''    body = exact(body,\n''' + repr('''      } catch (recordError) {
        answerActionLockRef.current = "";
        setAnswerLockKey("");
        setError(''') + ''',\n''' + repr('''      } catch (recordError) {
        answerActionLockRef.current = "";
        setAnswerLockKey("");
        setComprehensionLockedQuestion(null);
        setError(''') + ''', "comprehension lock reset")'''
new2 = '''    comp_segment = exact(comp_segment,
''' + repr('''      } catch (recordError) {
        answerActionLockRef.current = "";
        setAnswerLockKey("");
        setError(''') + ''',
''' + repr('''      } catch (recordError) {
        answerActionLockRef.current = "";
        setAnswerLockKey("");
        setComprehensionLockedQuestion(null);
        setError(''') + ''', "comprehension lock reset")'''
if old2 not in source:
    raise RuntimeError("Could not locate comprehension lock-reset patch.")
source = source.replace(old2, new2, 1)

old3 = '''    body = exact(body,\n''' + repr('''                            answerLockKey ===
                            ("comprehension:" +
                              questionIndex)''') + ''',\n''' + repr('''                            (answerLockKey ===
                              ("comprehension:" +
                                questionIndex) ||
                              comprehensionLockedQuestion === questionIndex)''') + ''', "comprehension button disabled lock")'''
new3 = '''    comp_segment = exact(comp_segment,
''' + repr('''                            answerLockKey ===
                            ("comprehension:" +
                              questionIndex)''') + ''',
''' + repr('''                            (answerLockKey ===
                              ("comprehension:" +
                                questionIndex) ||
                              comprehensionLockedQuestion === questionIndex)''') + ''', "comprehension button disabled lock")
    body = body[:comp_start] + comp_segment + body[comp_end:]'''
if old3 not in source:
    raise RuntimeError("Could not locate comprehension button lock patch.")
source = source.replace(old3, new3, 1)

namespace = {"__name__": "__main__", "__file__": str(TARGET)}
exec(compile(source, str(TARGET), "exec"), namespace, namespace)
