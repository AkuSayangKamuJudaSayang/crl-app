# CRL-App release note: server disconnect grace, bounded sync retries and login assets
Date: 2026-11-17

## 1. Backend assessment timeout
- Previously, the database retained unfinished active assessment hosts for 24 hours. The 60-second grace existed on clients only. A closed teacher/learner app therefore left a hidden live host until manual cleanup.
- `public.crl_expire_assessment_hosts()` now closes **linked, unfinished active reading stages** when the server has not received a teacher presence challenge for at least 60 seconds. The associated unfinished assessment record, scores, miscues and metrics are removed; completed assessment rows are never deleted.
- A 15-second Supabase `pg_cron` sweep applies this rule independently of web sessions, browsers or Railway traffic. Manual teacher-review and unclaimed invitations keep the pre-existing long recovery allowance.
- If one unfinished assessment expires, any other incomplete active host owned by the same teacher in the same class section is also closed. Another teacher or section is not touched.
- The batch uses advisory and host row locks, in the same order as starting and finalizing assessment transactions. Completed scoresheets are protected by an explicit `is_completed=false` deletion predicate.
- High-frequency `host_get` and `host_presence` no longer perform a global expiration scan for every request; the scheduled database job owns the lease. Other low-frequency safety reads remain.
- **Offline/LAN limitation:** A cloud server cannot observe a peer connection running entirely without internet. A cloud-started session silent for 60 seconds will be expired by the backend even when a local-only peer link remains alive. Teacher and learner still maintain their own 60-second local lease and can work offline, but cloud replay of an already-expired server run may be canceled. This needs an explicitly verified device-to-device continuity protocol for strong offline reconciliation; it must not be represented as guaranteed solely by server heartbeat timestamps.

## 2. Stuck assessment sync / 409 conflicts
- Server queued replay and `persist_only` requests for canceled hosts receive a typed `410 ASSESSMENT_CANCELED` response (with manual-vs-auto-timeout metadata) rather than a generic 409.
- The teacher IndexedDB offline outbox removes only confirmed canceled runs and their unsent scoring writes, while retaining unrelated learners' queued operations.
- Both offline-runtime and assessment answer journals pause automatic retries of stable 4xx business conflicts. This prevents every-second/every-30-second retry storms. Explicit Retry and online reconnection reattempt; new teacher corrections invalidate a blocked old answer.
- A locally **completed** offline record is retained for manual reconciliation instead of being silently deleted when the server considers that same code canceled.
- Teacher End Session is idempotent when a late automatic cleanup already closed the host; it cannot delete a completed assessment.
- The server never treats arbitrary 409 conflicts as permission to drop results.

## 3. Login / PWA
- Removed references to three nonexistent `/login-slides/learners-*.svg` files from `public/sw.js`.
- Kept the three real classroom WebP slideshow assets and bumped the cache generation to v120.

## Verification / release gates
- Mandatory `scripts/verify-server-disconnect-sync-assets.cjs` added to `verify:assessment`.
- Require passing GitHub Actions build, database migration execution, pg_cron status, expired host cleanup, and successful Railway production deployment before considering the task complete.
- No unrelated UI, coordinator content, permission, scoring or export rules were intentionally changed.
