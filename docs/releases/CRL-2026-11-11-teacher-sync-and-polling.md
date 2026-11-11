# CRL-App CRL-2026-11-11.47: Teacher background sync and dashboard reads

## Reproduction / cause

A teacher dashboard screenshot showed the bottom-right green toast:
"Changes saved on this device" / "Unable to read or synchronize saved changes.
Nothing has been discarded; retrying automatically." without any pending item
count, even after older assessments had finished.

Investigation found three independent causes:

1. The outbox replay loop declared `const entry` inside `try`, but its
   `catch` accessed `entry?.kind`. When a real mutation failed in that block,
   the handler threw `ReferenceError: entry is not defined`. The *outer*
   catch then published a generic waiting status with no verified items.
2. Legacy deleted-learner maintenance ran before checking whether an outbox
   existed. A failure in background cleanup could therefore show the same
   unsynced warning for a teacher with an empty queue. The runtime retried
   this idle task every two seconds.
3. `TeacherPage.loadData` fetched learners, assessments, activities and classes
   every four seconds even though some network requests lasted five or more
   seconds. Reads overlapped and added database and client work.

## Fix

- Keep the replay entry variable within scope of both `try` and `catch`.
  A failed or unacknowledged mutation stays stored and reports its real
  actionable message. No queued entry is removed without server acknowledgement.
- Check the actual outbox before maintenance. If there are no pending writes,
  retry legacy maintenance silently and clear any stale global sync status.
  A broken inspection *without verified unsent work* must not fabricate a
  progress notice. A known pending write remains visible if its replay fails.
- Require a positive pending count for the sync notice, keeping the normal
  progress view, retry controls, teacher-only privacy and blocked deletion
  confirmation. Clear the shared success status after it has been shown.
- Reduce idle IndexedDB sync checks to 30 seconds, with immediate checks on
  reconnect/manual retry and on returning to the visible tab.
- Make the teacher dashboard full refresh single-flight, coalesce overlapping
  calls, and change its background safety interval from 4 to 60 seconds.
  Offline sync events, visibility/focus and actual browser online events still
  trigger refresh; a live local assessment suppresses this background poll.
- No IndexedDB database, offline journal, completed assessment, learner,
  or classroom record is automatically wiped by this fix.

## Verification

The required build pipeline still runs the existing teacher, learner, offline
replay, scoresheet/export, privacy and assessment regression tests. New
`verify-idle-sync-and-dashboard-poll.cjs` covers empty outboxes, failed
storage reads, maintenance failures, preservation of confirmed pending writes,
and the new refresh cadence. The existing offline failover suite asserts that
HTTP 200 without a valid acknowledgement is *blocked*, never falsely cleared.

## Device acceptance

On the teacher's browser that previously showed the warning:

1. Load the teacher dashboard while signed in, with DevTools Network open.
   There should be no repeating 4-second `get_learners` or `get_assessments`
   requests, and no popup with unknown item count.
2. Observe the 60-second visible-tab safety poll. Test manual refresh and a
   saved change; the dashboard should update promptly and never overlap loads.
3. Test a real offline answer and reconnection. The queue notice must describe
   the mutation and disappear after its server acknowledgement, without
   losing the answer or duplicating a record.
4. Test a rejected replay. The teacher must still see the blocked item and
   retry action, and the stored item must survive reload.
5. Confirm that existing completed BOSY/MOSY/EOSY scores and downloaded
   G3 English scoresheets remain unchanged.

### Limitation

A screenshot or network trace alone cannot establish what is stored in that
user's browser-specific IndexedDB. This release intentionally does not clear
unknown unsynced data or make any claim that a specific local queue is empty.
Verified pending changes remain protected until synchronization succeeds.
