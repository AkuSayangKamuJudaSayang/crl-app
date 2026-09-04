#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"
rm -rf app/learner/app
rm -rf app/learner/manifest.webmanifest
printf '%s\n' 'CRL-App Learner install-button fix applied.'
printf '%s\n' 'Download page: /learner/download'
printf '%s\n' 'Installed app: /learner'
printf '%s\n' 'The download page registers the learner service worker and waits for the native install event.'
