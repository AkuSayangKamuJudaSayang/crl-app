from pathlib import Path

path = Path("app/learner/LearnerAssessmentPage.jsx")
text = path.read_text(encoding="utf-8")

old = '''  if (incomingStage === priorStage && (incomingStage === "letter" || incomingStage === "word")) {\n    return getStageIndex(incoming) < getStageIndex(previous);\n  }\n'''
new = '''  if (\n    incomingStage === priorStage &&\n    (incomingStage === "letter" ||\n      incomingStage === "word" ||\n      incomingStage === "comprehension")\n  ) {\n    if (incomingStage === "comprehension") {\n      const incomingContent = String(\n        incoming?.current_content ??\n          incoming?.currentContent ??\n          ""\n      ).trim();\n      const priorContent = String(\n        previous?.current_content ??\n          previous?.currentContent ??\n          ""\n      ).trim();\n      const incomingIndex = QUESTIONS.indexOf(incomingContent);\n      const priorIndex = QUESTIONS.indexOf(priorContent);\n\n      if (\n        incomingIndex >= 0 &&\n        priorIndex >= 0 &&\n        incomingIndex < priorIndex\n      ) {\n        return true;\n      }\n    }\n\n    return getStageIndex(incoming) < getStageIndex(previous);\n  }\n'''

if old not in text:
    raise SystemExit("Target isRegressiveSession block not found; refusing to modify source")

text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
verify = path.read_text(encoding="utf-8")
if 'incomingStage === "comprehension"' not in verify:
    raise SystemExit("Verification failed: comprehension regression guard not present")
print("Patched learner comprehension regression guard")
