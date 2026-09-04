# CRL-App Learner PWA

The learner download page is `/learner/download`.

The installed PWA is named **CRL-App Learner** and starts at `/learner`.

`/learner` is the assessment application in standalone display mode and redirects normal browser visits to `/learner/download`.

The install button uses the browser's standard `beforeinstallprompt` event when the browser exposes it. Browsers that do not support programmatic PWA installation cannot be forced to install by webpage JavaScript.
