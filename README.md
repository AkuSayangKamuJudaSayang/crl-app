# CRL-App Learner PWA Fix

## Routes
- `/learner/download` — browser-only install/download landing page.
- `/learner` — original learner assessment/join page. This is the installed PWA start URL.

## PWA manifest
The install landing page explicitly uses `/learner/download/manifest.webmanifest`.
That manifest is named `CRL-App Learner` and starts at `/learner`.

## Pull-to-refresh
Pull-to-refresh prevention is intentionally limited to the installed learner experience. The download page remains an ordinary browser page and can be refreshed normally.
