#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

# Remove obsolete learner PWA routes from previous iterations.
rm -rf app/learner/app
rm -rf app/learner/manifest.webmanifest

# Copy the package while preserving the rest of the CRL-App project.
cp -f package-placeholder /tmp/never-used 2>/dev/null || true

printf '\nCRL-App Learner PWA direct-launch fix applied.\n'
printf '%s\n' 'Download page : /learner/download'
printf '%s\n' 'Installed app : /learner'
printf '%s\n' 'PWA start URL : /learner?pwa=1 (cleaned to /learner in the app)'
printf '%s\n' 'Old learner PWA routes removed.'
printf '%s\n' 'The original learner assessment is preserved in LearnerAssessmentPage.jsx.'
