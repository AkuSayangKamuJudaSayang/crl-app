from pathlib import Path

p = Path("app/teacher/assessment/AssessmentClient.jsx")
text = p.read_text(encoding="utf-8")
old = '''  const currentQuestions = getComprehensionQuestions(latestSessionRef.current || session);\n\n  const currentQuestion =\n    currentQuestions[\n      questionIndex\n    ];\n\n  const fetchInFlightRef =\n    useRef(false);\n\n  const latestSessionVersionRef =\n    useRef(0);\n\n  const latestSessionRef =\n    useRef(null);\n\n  const latestActiveStageRef =\n    useRef(activeStage);\n'''
new = '''  const fetchInFlightRef =\n    useRef(false);\n\n  const latestSessionVersionRef =\n    useRef(0);\n\n  const latestSessionRef =\n    useRef(null);\n\n  const latestActiveStageRef =\n    useRef(activeStage);\n\n  const currentQuestions = getComprehensionQuestions(latestSessionRef.current || session);\n\n  const currentQuestion =\n    currentQuestions[\n      questionIndex\n    ];\n'''
if old not in text:
    raise SystemExit("assessment TDZ block not found")
text = text.replace(old, new, 1)
p.write_text(text, encoding="utf-8")
