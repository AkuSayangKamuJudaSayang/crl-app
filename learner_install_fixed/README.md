# CRL-App Learner install-button fix

This package updates only the learner PWA download/install flow. The normal root CRL-App routes are intentionally untouched.

## Flow

- `/learner/download` is the normal, refreshable download page.
- The download page registers `/learner-pwa-sw.js` with scope `/learner`.
- The page captures Chromium's native `beforeinstallprompt` event and only enables **Install App** when the real native prompt is available.
- The installed PWA is named **CRL-App Learner** and starts at `/learner`.
- `/learner` remains the actual learner assessment page.

## Important

A previously installed CRL-App/CRL-App Learner must be removed before retesting so the browser does not reuse stale installation metadata.
