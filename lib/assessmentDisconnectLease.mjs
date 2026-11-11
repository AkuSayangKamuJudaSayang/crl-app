/*
 * A wall-clock connection lease, independent of the reading timer and the
 * transient React/RTC state. Both installed PWAs can be suspended or closed;
 * performance.now() resets on reload, so the last verified peer response is
 * saved separately from the recovery checkpoint.
 *
 * Do not treat a browser "online" event as a peer acknowledgement.
 */
export const ASSESSMENT_DISCONNECT_GRACE_MS = 60_000;
const PREFIX = "crl-assessment-peer-seen-v1:";
const memory = new Map();

function keyFor(role, code) {
  const id = String(code || "").trim().toUpperCase();
  return ["teacher", "learner"].includes(role) && /^[A-Z0-9]{6}$/.test(id)
    ? `${PREFIX}${role}:${id}` : "";
}

function localStore(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

export function readAssessmentPeerSeen(role, code, storage) {
  const key = keyFor(role, code);
  if (!key) return 0;
  let value = memory.get(key) || 0;
  try {
    const saved = Number(localStore(storage)?.getItem(key));
    if (Number.isFinite(saved) && saved > value) value = saved;
  } catch {}
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function recordAssessmentPeerSeen(role, code, now = Date.now(), storage) {
  const key = keyFor(role, code), timestamp = Number(now);
  if (!key || !Number.isFinite(timestamp) || timestamp <= 0) return false;
  const latest = Math.max(readAssessmentPeerSeen(role, code, storage), timestamp);
  memory.set(key, latest);
  try { localStore(storage)?.setItem(key, String(latest)); } catch {}
  return true;
}

export function assessmentPeerLeaseExpired(role, code, fallbackAt = 0, now = Date.now(), storage) {
  const lastSeen = readAssessmentPeerSeen(role, code, storage) || Number(fallbackAt);
  return Number.isFinite(lastSeen) && lastSeen > 0 &&
    Number.isFinite(now) && now - lastSeen >= ASSESSMENT_DISCONNECT_GRACE_MS;
}

export function clearAssessmentPeerSeen(role, code, storage) {
  const key = keyFor(role, code);
  if (!key) return;
  memory.delete(key);
  try { localStore(storage)?.removeItem(key); } catch {}
}
