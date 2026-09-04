#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${1:-$(pwd)}"
PROJECT_ROOT="$(cd -- "$PROJECT_ROOT" && pwd)"

copy_file() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname -- "$dst")"
  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then
    printf 'unchanged: %s\n' "${dst#"$PROJECT_ROOT"/}"
    return
  fi
  cp "$src" "$dst"
  printf 'updated:   %s\n' "${dst#"$PROJECT_ROOT"/}"
}

copy_file "$SCRIPT_DIR/app/learner/page.jsx" "$PROJECT_ROOT/app/learner/page.jsx"
copy_file "$SCRIPT_DIR/app/learner/layout.jsx" "$PROJECT_ROOT/app/learner/layout.jsx"
copy_file "$SCRIPT_DIR/app/learner/LearnerPwaShell.jsx" "$PROJECT_ROOT/app/learner/LearnerPwaShell.jsx"
copy_file "$SCRIPT_DIR/app/learner/download/page.jsx" "$PROJECT_ROOT/app/learner/download/page.jsx"
copy_file "$SCRIPT_DIR/app/learner/download/layout.jsx" "$PROJECT_ROOT/app/learner/download/layout.jsx"
copy_file "$SCRIPT_DIR/app/learner/download/manifest.webmanifest/route.js" "$PROJECT_ROOT/app/learner/download/manifest.webmanifest/route.js"
copy_file "$SCRIPT_DIR/public/learner-pwa-sw.js" "$PROJECT_ROOT/public/learner-pwa-sw.js"
copy_file "$SCRIPT_DIR/public/icons/icon-192.png" "$PROJECT_ROOT/public/icons/icon-192.png"
copy_file "$SCRIPT_DIR/public/icons/icon-512.png" "$PROJECT_ROOT/public/icons/icon-512.png"
copy_file "$SCRIPT_DIR/public/icons/maskable-512.png" "$PROJECT_ROOT/public/icons/maskable-512.png"

# Remove older conflicting learner manifest implementations.
rm -f "$PROJECT_ROOT/app/learner/manifest.js"
rm -rf "$PROJECT_ROOT/app/learner/manifest.webmanifest"

printf '\n===============================================\n'
printf 'CRL-App Learner PWA final route-separated fix applied.\n'
printf 'Download page: /learner/download\n'
printf 'Installed app name: CRL-App Learner\n'
printf 'Installed app start URL: /learner\n'
printf 'Installed app scope: /learner\n'
printf '===============================================\n'
printf '\nMain app files app/manifest.js and app/page.jsx were not modified by this script.\n'
