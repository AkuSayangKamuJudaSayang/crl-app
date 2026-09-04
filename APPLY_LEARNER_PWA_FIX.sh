#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "${1:-.}" && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# This script is intentionally safe to run when the patch files are already
# inside the project itself. It never cp's a file onto itself.

mkdir -p "$ROOT/app/learner/manifest.webmanifest"

install_file() {
  local src="$1"
  local dst="$2"

  if [[ "$(readlink -f "$src")" == "$(readlink -f "$dst" 2>/dev/null || true)" ]]; then
    return 0
  fi

  cp "$src" "$dst"
}

install_file "$SCRIPT_DIR/app/learner/layout.jsx" \
  "$ROOT/app/learner/layout.jsx"
install_file "$SCRIPT_DIR/app/learner/LearnerPwaShell.jsx" \
  "$ROOT/app/learner/LearnerPwaShell.jsx"
install_file "$SCRIPT_DIR/app/learner/manifest.webmanifest/route.js" \
  "$ROOT/app/learner/manifest.webmanifest/route.js"

# IMPORTANT: do not touch app/learner/page.jsx. Your complete learner page
# stays exactly as it is in the project.

# Remove only the old competing learner manifest metadata route.
rm -f "$ROOT/app/learner/manifest.js"

printf '\n===============================================\n'
printf 'CRL-App Learner PWA fix applied successfully.\n'
printf '===============================================\n'
printf 'Learner page:       /learner\n'
printf 'Learner manifest:   /learner/manifest.webmanifest\n'
printf 'Installed name:     CRL-App Learner\n'
printf 'Installed ID:       /learner\n'
printf 'Start URL:           /learner\n'
printf 'Scope:               /learner\n'
printf '\nUnchanged:\n'
printf '  app/page.jsx\n'
printf '  app/manifest.js\n'
printf '  app/learner/page.jsx\n'
printf '  teacher routes\n'
printf '  assessment API\n'
printf '\nRemoved (when present): app/learner/manifest.js\n'
printf '\nNext: git diff -- app/learner app/manifest.js app/page.jsx\n'
