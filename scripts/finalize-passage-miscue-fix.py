from pathlib import Path
import re

runner = Path("scripts/apply-passage-miscue-fix.py").read_text(encoding="utf-8")

old_validation = '''if "reversionTargetWord" in text:\n    raise SystemExit("reversionTargetWord still exists after patch")'''

cleanup = r'''# Final cleanup for the browser-driven reversion flow.
text = re.sub(r'^\s*reversionTargetWord,\s*$\n', '', text, flags=re.M)
text = re.sub(r'\n\s*const \[reversionTargetWord, setReversionTargetWord\] = useState\(""\);\n', '\n', text)
text = re.sub(
    r'\n\s*\{selectedMiscueType===\'Reversion\' && \(\n\s*<div style=\{styles\.miscueEntryArea\}>\n\s*<label style=\{styles\.miscueEntryLabel\}>Second word position</label>\n\s*<input type="number"[^\n]*\n\s*<div style=\{\{\.\.\.styles\.miscueDrawerHint[^\n]*\n\s*<button type="button"[^\n]*>Apply Reversion</button>\n\s*</div>\n\s*\)\}',
    '\n',
    text,
    count=1,
)
text = re.sub(r'\n\s*reversionTargetWord,\n', '\n', text)
if "reversionTargetWord" in text:
    raise SystemExit("reversionTargetWord remains after final cleanup")'''

if old_validation not in runner:
    raise SystemExit("Expected validation block was not found in the existing repair script.")

runner = runner.replace(old_validation, cleanup, 1)

# Remove any remaining dependency-array reference that the original patch did not need.
runner = runner.replace(
    '        reversionTargetWord,\n',
    '',
)

# Make sure the generated JSX is written even though the original script still contains
# its historical validation section.
exec(compile(runner, "scripts/apply-passage-miscue-fix.py", "exec"))
