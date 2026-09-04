# CRL-App Learner PWA update

This package separates the learner installation page from the actual learner assessment page.

## Routes

- `/learner/download` — normal, refreshable download/install website.
- `/learner` — actual learner assessment interface, rendered only when the page is running as the installed standalone PWA. Normal browser visits are redirected back to `/learner/download`.
- `/login` — unchanged teacher login route.

## PWA identity

The learner install manifest is served from `/learner/download/manifest.webmanifest` and uses:

- name: `CRL-App Learner`
- id: `/learner-app`
- start_url: `/learner`
- scope: `/learner`
- display: `standalone`

The download page no longer shows a manual-install instruction overlay. When the browser exposes `beforeinstallprompt`, clicking **Install App** opens the native installation prompt directly.

## Pull-to-refresh

`LearnerPwaShell.jsx` only suppresses pull-to-refresh when the learner route is running in standalone mode. The download page remains a normal website.

## Root app safety

This package intentionally does not replace the root `app/manifest.js` or `app/page.jsx`.
