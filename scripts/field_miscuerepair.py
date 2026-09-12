from pathlib import Path
import re

TEACHER = Path("app/teacher/assessment/AssessmentClient.jsx")
LEARNER = Path("app/learner/LearnerAssessmentPage.jsx")

QUESTION_BLOCK = '''const STORY_QUESTIONS = {
  para: [
    { index: 0, text: "What must Para look for?" },
    { index: 1, text: "What time or part of the day is it?" },
    { index: 2, text: "What does Para land on?" },
    { index: 3, text: "Who does Para see?" },
    { index: 4, text: "What else is the police officer doing besides directing traffic?" },
    { index: 5, text: "What could the police officer be feeling?" },
  ],
  fields: [
    { index: 0, text: "What is the job of Dulnuwan?" },
    { index: 1, text: "When do Ali and Dina help Dulnuwan and Bugan?" },
    { index: 2, text: "Where do they rest?" },
    { index: 3, text: "Why do they rest?" },
    { index: 4, text: "What kind of weather or day is it?" },
    { index: 5, text: "What does Dulnuwan pick up?" },
  ],
};

const QUESTIONS = STORY_QUESTIONS.para;

function getComprehensionQuestions(session) {
  const title = String(session?.story_title ?? session?.storyTitle ?? "")
    .trim()
    .toLowerCase();
  return title.includes("a day in the fields")
    ? STORY_QUESTIONS.fields
    : STORY_QUESTIONS.para;
}'''


def replace_questions(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    text, count = re.subn(r"const QUESTIONS = \[.*?\n\];", QUESTION_BLOCK, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Could not replace QUESTIONS in {path}")
    return text


def patch_teacher(text: str) -> str:
    text = text.replace(
        "  const currentQuestion =\n    QUESTIONS[\n      questionIndex\n    ];",
        "  const currentQuestions = getComprehensionQuestions(latestSessionRef.current || session);\n\n  const currentQuestion =\n    currentQuestions[\n      questionIndex\n    ];",
        1,
    )
    text = text.replace(
        "QUESTIONS.findIndex((question) => question.text === incomingContent)",
        "getComprehensionQuestions(data.session).findIndex((question) => question.text === incomingContent)",
        1,
    )
    text = text.replace(
        "QUESTIONS.findIndex(\n                  (question) =>\n                    question.text === serverContent\n                )",
        "getComprehensionQuestions(data.session).findIndex(\n                  (question) =>\n                    question.text === serverContent\n                )",
        1,
    )
    text = text.replace(
        "            current_content: QUESTIONS[0].text,\n            currentContent: QUESTIONS[0].text,",
        "            current_content: getComprehensionQuestions(latestSessionRef.current || session)[0].text,\n            currentContent: getComprehensionQuestions(latestSessionRef.current || session)[0].text,",
        1,
    )
    text = text.replace(
        "currentContent: QUESTIONS[0].text,",
        "currentContent: getComprehensionQuestions(nextSession)[0].text,",
    )

    start = text.find("  const recordComprehension =")
    end = text.find("\n  const finalize =", start)
    if start < 0 or end < 0:
        raise SystemExit("recordComprehension boundaries not found")
    record = text[start:end]
    record = record.replace(
        "    async (isCorrect) => {\n      const currentIndex = questionIndex;",
        "    async (isCorrect) => {\n      const currentQuestions = getComprehensionQuestions(latestSessionRef.current || session);\n      const currentIndex = questionIndex;",
        1,
    )
    record = record.replace("QUESTIONS.length", "currentQuestions.length")
    record = record.replace("QUESTIONS[nextIndex]", "currentQuestions[nextIndex]")
    record = record.replace("QUESTIONS[currentIndex]", "currentQuestions[currentIndex]")
    text = text[:start] + record + text[end:]
    text = text.replace(
        "{\n                        QUESTIONS.length\n                      }",
        "{\n                        currentQuestions.length\n                      }",
        1,
    )

    state_anchor = '  const [selectedMiscueType, setSelectedMiscueType] = useState(null);\n  const [timeUpSelectedWord, setTimeUpSelectedWord] = useState(null);'
    if state_anchor in text and "reversionTargetWord" not in text:
        text = text.replace(
            state_anchor,
            '  const [selectedMiscueType, setSelectedMiscueType] = useState(null);\n  const [reversionTargetWord, setReversionTargetWord] = useState("");\n  const [timeUpSelectedWord, setTimeUpSelectedWord] = useState(null);',
            1,
        )

    # Replace the complete miscue writer with a version supporting Reversion pairs.
    m_start = text.find("  const recordPassageMiscue =")
    m_end = text.find('\n  useEffect(() => {\n    if (activeStage !== "passage")', m_start)
    if m_start < 0 or m_end < 0:
        raise SystemExit("recordPassageMiscue boundaries not found")
    record_code = '''  const recordPassageMiscue =
    useCallback(
      async (
        selectedWordOverride,
        typeOverride,
        misreadWordOverride,
        reversionTargetOverride
      ) => {
        const selectedNumber = Number(selectedWordOverride ?? selectedPassageWord ?? 0);
        const selectedIndex = selectedNumber - 1;
        if (selectedIndex < 0 || selectedIndex >= 100) return;

        const nextType = String(typeOverride || selectedMiscueType || miscueType || "Substitution");
        const nextMisreadWord = String(misreadWordOverride ?? misreadWord ?? "").trim();

        if ((nextType === "Insertion" || nextType === "Substitution") && !nextMisreadWord) {
          setSelectedMiscueType(nextType);
          return;
        }

        if (nextType === "Reversion") {
          const targetNumber = Number(reversionTargetOverride ?? reversionTargetWord ?? 0);
          const targetIndex = targetNumber - 1;
          if (!Number.isInteger(targetNumber) || targetIndex < 0 || targetIndex >= 100 || targetIndex === selectedIndex) {
            setSelectedMiscueType(nextType);
            return;
          }

          const groupId = [selectedIndex, targetIndex].sort((a, b) => a - b).join("-");
          const first = {
            wordIndex: selectedIndex,
            miscueType: "Reversion",
            misreadWord: "",
            relatedWordIndex: targetIndex,
            reversionGroupId: groupId,
            reversionOrder: 1,
          };
          const second = {
            wordIndex: targetIndex,
            miscueType: "Reversion",
            misreadWord: "",
            relatedWordIndex: selectedIndex,
            reversionGroupId: groupId,
            reversionOrder: 2,
          };

          const nextMiscues = [
            ...passageMiscues.filter(
              (item) =>
                Number(item.wordIndex) !== selectedIndex &&
                Number(item.wordIndex) !== targetIndex
            ),
            first,
            second,
          ].sort((a, b) => Number(a.wordIndex) - Number(b.wordIndex));

          setPassageMiscues(nextMiscues);
          setError("");
          setMisreadWord("");
          setMiscueWordIndex(1);
          setMiscueDrawerOpen(false);
          setSelectedPassageWord(null);
          setSelectedMiscueType(null);
          setReversionTargetWord("");
          await persistPassageDraft({ miscues: nextMiscues });
          return;
        }

        const optimistic = {
          wordIndex: selectedIndex,
          miscueType: nextType,
          misreadWord: nextMisreadWord,
        };
        const nextMiscues = [
          ...passageMiscues.filter((item) => Number(item.wordIndex) !== selectedIndex),
          optimistic,
        ];

        setPassageMiscues(nextMiscues);
        setError("");
        setMisreadWord("");
        setMiscueWordIndex(1);
        setMiscueDrawerOpen(false);
        setSelectedPassageWord(null);
        setSelectedMiscueType(null);
        setReversionTargetWord("");
        await persistPassageDraft({ miscues: nextMiscues });
      },
      [
        selectedPassageWord,
        selectedMiscueType,
        miscueType,
        misreadWord,
        reversionTargetWord,
        passageMiscues,
        persistPassageDraft,
      ]
    );
'''
    text = text[:m_start] + record_code + text[m_end:]

    # Remove both ends of a Reversion pair.
    text = text.replace(
        "        const nextMiscues = passageMiscues.filter(\n          (item) => Number(item.wordIndex) !== selectedIndex\n        );",
        "        const selectedMiscue = passageMiscues.find((item) => Number(item.wordIndex) === selectedIndex);\n        const relatedIndex = selectedMiscue?.miscueType === \"Reversion\" ? Number(selectedMiscue.relatedWordIndex) : -1;\n        const nextMiscues = passageMiscues.filter((item) => Number(item.wordIndex) !== selectedIndex && Number(item.wordIndex) !== relatedIndex);",
        1,
    )

    # Existing Reversion partner is restored when a marked word is reopened.
    text = text.replace(
        "setSelectedMiscueType(existingMiscue?.miscueType || null);\n                    setMisreadWord(existingMiscue?.misreadWord || \"\");",
        "setSelectedMiscueType(existingMiscue?.miscueType || null);\n                    setReversionTargetWord(existingMiscue?.relatedWordIndex != null ? String(Number(existingMiscue.relatedWordIndex) + 1) : \"\");\n                    setMisreadWord(existingMiscue?.misreadWord || \"\");",
    )
    text = text.replace(
        "setSelectedMiscueType(\n                    existingMiscue?.miscueType ||\n                      null\n                  );\n                  setMisreadWord(",
        "setSelectedMiscueType(\n                    existingMiscue?.miscueType ||\n                      null\n                  );\n                  setReversionTargetWord(existingMiscue?.relatedWordIndex != null ? String(Number(existingMiscue.relatedWordIndex) + 1) : \"\");\n                  setMisreadWord(",
        1,
    )

    marker_anchor = '''            const isSelected =\n              Number(\n                selectedPassageWord\n              ) ===\n              currentNumber + 1;\n\n            return (\n              <button'''
    if marker_anchor not in text:
        raise SystemExit("passage marker anchor missing")
    marker_block = '''            const isSelected =\n              Number(\n                selectedPassageWord\n              ) ===\n              currentNumber + 1;\n\n            const markerStyle = annotation?.miscueType === "Omission"\n              ? { textDecoration: "line-through 3px #d12d3f", textDecorationColor: "#d12d3f" }\n              : annotation?.miscueType === "Repetition"\n                ? { textDecoration: "underline double 3px #d12d3f", textUnderlineOffset: "5px", textDecorationColor: "#d12d3f" }\n                : annotation?.miscueType === "Substitution"\n                  ? { textDecoration: "underline 3px #d12d3f", textUnderlineOffset: "5px", textDecorationColor: "#d12d3f" }\n                  : annotation?.miscueType === "SelfCorrection"\n                    ? { textDecoration: "underline 2px #2a9a59", textUnderlineOffset: "4px", textDecorationColor: "#2a9a59" }\n                    : annotation?.miscueType === "Reversion"\n                      ? { textDecoration: "underline 2px #d12d3f", textUnderlineOffset: "4px", textDecorationColor: "#d12d3f" }\n                      : {};\n            const markerGlyph = annotation?.miscueType === "Insertion"\n              ? "⌃"\n              : annotation?.miscueType === "SelfCorrection"\n                ? "✓"\n                : annotation?.miscueType === "Reversion"\n                  ? `${annotation?.reversionOrder || ""} ${Number(annotation?.relatedWordIndex) > currentNumber ? "↷" : "↶"}`.trim()\n                  : "";\n\n            return (\n              <button'''
    text = text.replace(marker_anchor, marker_block, 1)
    text = text.replace(
        '                  ...styles.passageWord,\n                  ...(annotationColor',
        '                  ...styles.passageWord,\n                  ...markerStyle,\n                  position: "relative",\n                  ...(annotationColor',
        1,
    )
    text = text.replace(
        '              >\n                {token}\n              </button>',
        '''              >\n                {annotation && markerGlyph && (\n                  <span\n                    aria-hidden="true"\n                    style={{\n                      position: "absolute",\n                      top: "-16px",\n                      left: "50%",\n                      transform: "translateX(-50%)",\n                      color: annotation.miscueType === "SelfCorrection" ? "#2a9a59" : "#d12d3f",\n                      fontSize: annotation.miscueType === "Reversion" ? "12px" : "16px",\n                      lineHeight: 1,\n                      fontWeight: 950,\n                      whiteSpace: "nowrap",\n                      pointerEvents: "none",\n                    }}\n                  >\n                    {markerGlyph}\n                    {(annotation.miscueType === "Insertion" || annotation.miscueType === "Substitution") && annotation.misreadWord ? (\n                      <span style={{ marginLeft: "3px", fontSize: "10px", fontWeight: 900 }}>{annotation.misreadWord}</span>\n                    ) : null}\n                  </span>\n                )}\n                {token}\n              </button>''',
        1,
    )

    # Overlay option list and Reversion input.
    option_old = "[['Insertion','Added word or sound','#1766a9','#dff1ff'],['Omission','Word was skipped','#b32031','#ffe5e8'],['Substitution','Another word was said','#955900','#fff0d9'],['Repetition','Word was repeated','#7041a8','#eee5ff'],['SelfCorrection','Learner corrected the error','#287447','#e2f7e9']]"
    option_new = "[['Insertion','Added word or sound','#1766a9','#dff1ff'],['Omission','Word was skipped','#b32031','#ffe5e8'],['Substitution','Another word was said','#955900','#fff0d9'],['Repetition','Word was read more than once','#7041a8','#eee5ff'],['Reversion','Word or group of words not read in order','#9c3f8f','#f2e5f2'],['SelfCorrection','Word read incorrectly at first but immediately corrected','#287447','#e2f7e9']]"
    if option_old not in text:
        raise SystemExit("miscue option list not found")
    text = text.replace(option_old, option_new, 1)
    text = text.replace(
        "onClick={() => {setSelectedMiscueType(label);if(label!=='Insertion'&&label!=='Substitution')void recordPassageMiscue(selectedPassageWord,label,'');}}",
        "onClick={() => {setSelectedMiscueType(label);if(label==='Reversion'){setReversionTargetWord('');return;}if(label!=='Insertion'&&label!=='Substitution')void recordPassageMiscue(selectedPassageWord,label,'');}}",
        1,
    )
    entry_old = '''              {(selectedMiscueType==='Insertion'||selectedMiscueType==='Substitution') && (\n                <div style={styles.miscueEntryArea}>\n                  <label style={styles.miscueEntryLabel}>What did the learner say?</label>\n                  <input type="text" value={misreadWord} onChange={e=>setMisreadWord(e.target.value)} placeholder={selectedMiscueType==='Insertion'?'Enter the word/sound added':'Enter the substituted word'} style={styles.miscueDrawerInput} disabled={recordingMiscue} autoFocus />\n                  <button type="button" style={styles.miscueApplyButton} onClick={() => void recordPassageMiscue(selectedPassageWord,selectedMiscueType,misreadWord)} disabled={recordingMiscue||!misreadWord.trim()}>Apply Miscue</button>\n                </div>\n              )}'''
    entry_new = '''              {(selectedMiscueType==='Insertion'||selectedMiscueType==='Substitution') && (\n                <div style={styles.miscueEntryArea}>\n                  <label style={styles.miscueEntryLabel}>What did the learner say?</label>\n                  <input type="text" value={misreadWord} onChange={e=>setMisreadWord(e.target.value)} placeholder={selectedMiscueType==='Insertion'?'Enter the word/sound added':'Enter the substituted word'} style={styles.miscueDrawerInput} disabled={recordingMiscue} autoFocus />\n                  <button type="button" style={styles.miscueApplyButton} onClick={() => void recordPassageMiscue(selectedPassageWord,selectedMiscueType,misreadWord)} disabled={recordingMiscue||!misreadWord.trim()}>Apply Miscue</button>\n                </div>\n              )}\n              {selectedMiscueType==='Reversion' && (\n                <div style={styles.miscueEntryArea}>\n                  <label style={styles.miscueEntryLabel}>Second word position</label>\n                  <input type="number" min="1" max="100" inputMode="numeric" value={reversionTargetWord} onChange={e=>setReversionTargetWord(e.target.value)} placeholder="Enter the other word number" style={styles.miscueDrawerInput} disabled={recordingMiscue} autoFocus />\n                  <div style={{...styles.miscueDrawerHint,marginTop:"6px"}}>The two words will be marked with order numbers and a curved reversion arrow.</div>\n                  <button type="button" style={styles.miscueApplyButton} onClick={() => void recordPassageMiscue(selectedPassageWord,'Reversion','',reversionTargetWord)} disabled={recordingMiscue||!reversionTargetWord}>Apply Reversion</button>\n                </div>\n              )}'''
    if entry_old not in text:
        raise SystemExit("miscue entry block not found")
    text = text.replace(entry_old, entry_new, 1)

    text = text.replace(
        'setMiscueDrawerOpen(false);setSelectedMiscueType(null);setMisreadWord("");',
        'setMiscueDrawerOpen(false);setSelectedMiscueType(null);setReversionTargetWord("");setMisreadWord("");',
    )
    return text


def patch_learner(text: str) -> str:
    text = text.replace(
        '      const incomingIndex = QUESTIONS.indexOf(incomingContent);\n      const priorIndex = QUESTIONS.indexOf(priorContent);',
        '      const incomingQuestions = getComprehensionQuestions(incoming);\n      const priorQuestions = getComprehensionQuestions(previous);\n      const incomingIndex = incomingQuestions.findIndex((question) => question.text === incomingContent);\n      const priorIndex = priorQuestions.findIndex((question) => question.text === priorContent);',
        1,
    )
    current_block = '''  const currentQuestions =\n    Array.isArray(\n      selectedStory?.questions\n    ) &&\n    selectedStory.questions.length\n      ? selectedStory.questions\n      : QUESTIONS;'''
    if current_block not in text:
        raise SystemExit("learner currentQuestions block not found")
    text = text.replace(current_block, '  const currentQuestions = getComprehensionQuestions(session);', 1)
    return text

teacher = patch_teacher(replace_questions(TEACHER))
learner = patch_learner(replace_questions(LEARNER))

TEACHER.write_text(teacher, encoding="utf-8")
LEARNER.write_text(learner, encoding="utf-8")

# Strong invariants: the old comprehension restraint identifiers must remain.
required_teacher = [
    "setTransitionPending(true)",
    "expected_stage: \"comprehension\"",
    "questionIndexRef.current = nextIndex",
    "crlComprehensionAnswerButton",
    "What is the job of Dulnuwan?",
    "When do Ali and Dina help Dulnuwan and Bugan?",
    "Where do they rest?",
    "Why do they rest?",
    "What kind of weather or day is it?",
    "What does Dulnuwan pick up?",
    "Reversion",
    "relatedWordIndex",
    "reversionOrder",
    "underline double",
]
required_learner = [
    "isRegressiveSession",
    "getComprehensionQuestions(session)",
    "What is the job of Dulnuwan?",
    "When do Ali and Dina help Dulnuwan and Bugan?",
    "Where do they rest?",
    "Why do they rest?",
    "What kind of weather or day is it?",
    "What does Dulnuwan pick up?",
]
for item in required_teacher:
    if item not in teacher:
        raise SystemExit(f"Teacher invariant missing: {item}")
for item in required_learner:
    if item not in learner:
        raise SystemExit(f"Learner invariant missing: {item}")
if teacher.count("const STORY_QUESTIONS = {") != 1:
    raise SystemExit("Teacher question table duplicated")
if learner.count("const STORY_QUESTIONS = {") != 1:
    raise SystemExit("Learner question table duplicated")
