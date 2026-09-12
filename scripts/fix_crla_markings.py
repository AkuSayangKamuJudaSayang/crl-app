from pathlib import Path

p = Path('app/teacher/assessment/AssessmentClient.jsx')
text = p.read_text(encoding='utf-8')
old = '''                {annotation && markerGlyph && (\n                  <span'''
new = '''                {annotation && (markerGlyph || ((annotation.miscueType === "Insertion" || annotation.miscueType === "Substitution") && annotation.misreadWord)) && (\n                  <span'''
if old not in text:
    raise SystemExit('marker render guard not found')
text = text.replace(old, new, 1)
old2 = ': annotation?.miscueType === "Insertion"\n              ? "⌃"'
new2 = ': annotation?.miscueType === "Insertion"\n              ? "^"'
if old2 not in text:
    raise SystemExit('insertion marker not found')
text = text.replace(old2, new2, 1)
p.write_text(text, encoding='utf-8')
