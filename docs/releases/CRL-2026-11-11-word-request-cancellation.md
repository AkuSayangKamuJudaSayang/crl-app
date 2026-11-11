# CRL-App release note: 2026-11-11, score-request cancellation guard

## Symptom

The teacher dashboard's DevTools Network panel can display
`/api/assessment?action=record_word` with status `(canceled)`. Nearby
`ping`, `get_classes`, and `get_learners` GET responses can still be
`200 OK`. Browser cancellations alone do **not** prove whether the server
committed a word response.

## Root cause in the current fetch wrapper

The teacher's offline-capable `window.fetch` wrapper previously aborted
ordinary assessment POST requests after only **5,000 ms**, even when other
API requests routinely took five seconds or longer. The separate ordered
outbox replay worker aborted `record_word` after **10,000 ms**.
Both aborts appear as canceled Network entries and can trigger replay of
a response whose commit status is unknown to the browser.

## Targeted change

- Live, score-bearing assessment POST requests (including `record_word`,
  `record_letter`, and `record_comprehension`) now allow **20 seconds**
  for an acknowledgement.
- The offline outbox allows **30 seconds** for score-bearing replay,
  including a completed-session answer-verification retry.
- Non-score `host_advance` control commands retain their five-second
  online bounds; GET `learner_status`, `host_get` and final-review
  requests keep their prior bounds.
- Queued mutations stay in IndexedDB until the server acknowledges them.
  Unexpected disconnection still aborts in-flight requests and falls back
  to local recovery. Server-side idempotent checks for a finished response
  are unchanged.
- The `200` connectivity pings and ordinary dashboard refresh requests
  remain expected and are not errors.
- No database, learner roster, assessment scores, or pending outbox entries
  are cleared by this change.

## Test coverage

`scripts/verify-assessment-word-requests.cjs` checks the live and replay
timeout policies, actual runtime integration, delayed responses without
a premature abort, and real hung-request failover. The complete existing
offline assessment and synchronization verification chain remains enabled.

## Field verification / limitations

Use the existing Huawei device and browser to record several words during
an online assessment, then return to the teacher dashboard. With stable
internet, the old repeatable five-second canceled `record_word` pattern
should no longer occur. Test genuine disconnection and recovery as well:
an unsent answer must remain queued and be acknowledged when connectivity
returns. Verify each recorded word in the completed teacher scoresheet.

A one-off `(canceled)` entry is still possible if the tab closes, the user
navigates away, the network disappears, or the browser itself cancels a
request. A server response may finish after a client abort. Do not treat
a canceled entry by itself as proof of failure or proof of success; use
server-acknowledged results to establish persistence.
