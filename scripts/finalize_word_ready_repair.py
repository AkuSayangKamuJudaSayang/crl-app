from pathlib import Path
import subprocess

# Restore the normal validation workflow from the parent commit and remove
# temporary repair artifacts before committing the verified source changes.
subprocess.run(
    ["git", "checkout", "HEAD^", "--", ".github/workflows/deployment-validation.yml"],
    check=True,
)

for path in (
    "scripts/apply_word_ready_repair.py",
    "scripts/finalize_word_ready_repair.py",
    ".github/workflows/fix-word-transition-ready-handshake.yml",
    ".word-transition-repair-trigger",
):
    Path(path).unlink(missing_ok=True)

subprocess.run(
    ["git", "config", "user.name", "github-actions[bot]"],
    check=True,
)
subprocess.run(
    ["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
    check=True,
)
subprocess.run(
    [
        "git",
        "add",
        "app/teacher/assessment/AssessmentClient.jsx",
        "app/learner/LearnerAssessmentPage.jsx",
        "app/api/assessment/route.js",
        ".github/workflows",
        "scripts",
        ".word-transition-repair-trigger",
    ],
    check=True,
)
subprocess.run(
    ["git", "commit", "-m", "Hold first word answer until learner is ready"],
    check=True,
)
subprocess.run(["git", "push", "origin", "main"], check=True)
print("Verified transition repair committed and temporary repair artifacts removed")
