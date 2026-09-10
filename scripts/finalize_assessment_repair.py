from pathlib import Path

client = Path('app/teacher/assessment/AssessmentClient.jsx')
text = client.read_text()

if 'import { createPortal } from "react-dom";' not in text:
    marker = 'import {\n  useCallback,'
    if marker not in text:
        raise SystemExit('React import marker not found')
    text = text.replace(marker, 'import { createPortal } from "react-dom";\n\n' + marker, 1)

old = '                      Results have been saved\n                      to the database.'
new = '                      Results are ready to be saved\n                      to the database after your final review.'
if old in text:
    text = text.replace(old, new, 1)

client.write_text(text)

route = Path('app/api/assessment/commit/route.js')
r = route.read_text()
old_classification = '''      const classification =
        task1Score + task2Score <= 10
          ? calculatePart1Classification(task1Score, task2Score)
          : calculatePart2Classification(
              miscueAccuracy,
              comprehensionScore
            );'''
new_classification = '''      // This endpoint is only reachable after passage reading and all
      // comprehension responses are staged. The existing assessment rules
      // therefore classify the completed Part 2 result directly from reading
      // accuracy + comprehension; Part 1 hard-stop cases never reach here.
      const classification = calculatePart2Classification(
        miscueAccuracy,
        comprehensionScore
      );'''
if old_classification not in r:
    raise SystemExit('commit classification block not found')
r = r.replace(old_classification, new_classification, 1)
route.write_text(r)

print('Final runtime repair prepared')
