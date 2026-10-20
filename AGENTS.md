# CRL-App maintenance instructions

Before changing this repository, read `docs/PROJECT_HANDOFF.md` and the latest
entry in `docs/CHANGELOG.md`. Confirm the current code and git history; these
notes do not replace inspecting the implementation.

For every system fix or modification:

1. Add or update the newest entry in `docs/CHANGELOG.md` in the same commit as
   the change. Record the date in Asia/Manila, a unique release ID, the request,
   resulting behavior, affected files, validation actually performed, and any
   migration, limitation or rollback consideration. Do not invent test results.
2. Update `docs/PROJECT_HANDOFF.md` when architecture, assessment rules, privacy,
   offline behavior, deployment targets or important product decisions change.
   Include documentation implications useful for the capstone paper.
3. Record superseded approaches explicitly. In particular, deleted-learner
   recovery and the Saved offline items feature were removed intentionally.
4. Keep full-roster statistics, teacher/section authorization, assessment
   scoring, teacher-only answer guides, local persistence and ordered sync
   intact. A limited UI preview must not truncate the underlying data.
5. Every fix or feature must finish with a clean `npm ci`, zero reported
   vulnerabilities from `npm run audit:security`, and the appropriate regression
   checks before push/deployment. This audits development, optional and peer
   dependencies at every severity. Do not hide findings with omit flags, a higher
   severity threshold, audit suppression, or an unreviewed force upgrade. Resolve
   findings and verify compatibility; an unavailable registry or failed audit
   blocks release. Commit the synchronized package manifest and lockfile whenever
   dependencies change. `npm run build` gates on this live audit, including Vercel
   and the GitHub validation workflow. A clean audit covers known registry
   advisories at that time, not a permanent absence of vulnerabilities.
   Run checks appropriate to the change. `npm run build` includes the full
   assessment verification suite. A successful build does not prove physical
   tablet-to-tablet Wi-Fi pairing. Report that limitation honestly.
6. Never commit credentials, database exports, learner identifiers, screenshots
   containing learner records, or environment files. Use synthetic test data.

Use a dated documentation release ID, such as `CRL-2026-10-17.1`, without
silently changing the npm package version. Put that ID in the commit message
so the release's exact SHA can be found without a self-referencing commit.
Only push or deploy when the user has authorized it. For an authorized release,
verify the GitHub commit and Vercel production deployment match before reporting
completion. Keep future notes current instead of depending on chat context.
