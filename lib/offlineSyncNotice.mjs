/**
 * The teacher sync banner must represent actual, durable unsent writes.
 * Storage-maintenance and read failures are NOT proof that the queue contains
 * anything. Never turn an unknown error into a perpetual "changes saved"
 * notification, and never report synchronization if an acknowledged write is
 * still pending.
 */
export function hasVisibleOfflineSyncWork(status) {
  if (!status || typeof status !== "object") return false;
  const total = Number(status.total);
  const completed = Number(status.completed || 0);
  if (!Number.isFinite(total) || total <= 0 ||
      !Number.isFinite(completed) || completed < 0) return false;
  if (status.phase === "success") return completed >= total;
  return ["waiting", "syncing", "blocked"].includes(status.phase) && completed < total;
}

export function failedOfflineSyncInspection(entries, previous = null) {
  // A successful empty queue read overrides an old status from a previous
  // session or browser tab, including an old "waiting" notification.
  if (Array.isArray(entries) && entries.length === 0) return { phase: "idle" };
  const previousPending = ["waiting", "syncing", "blocked"].includes(previous?.phase)
    ? Math.max(0, Number(previous.total || 0) - Number(previous.completed || 0))
    : 0;
  const pending = Array.isArray(entries) ? entries.length
    : Number.isFinite(previousPending) ? previousPending : 0;
  if (!Number.isFinite(pending) || pending <= 0) return { phase: "idle" };
  return {
    phase: "blocked",
    completed: 0,
    total: pending,
    current: previous?.current || null,
    message: "Saved offline changes could not be read or synchronized. Nothing has been discarded. Check browser storage and retry synchronization.",
  };
}
