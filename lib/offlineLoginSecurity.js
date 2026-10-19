const key = username => `crla-login-lock-v1:${String(username).trim().toLowerCase()}`;
export function cachedLoginLock(username) {
  try { return JSON.parse(localStorage.getItem(key(username)) || "null"); } catch { return null; }
}
export function rememberLoginLock(username, payload) {
  try { localStorage.setItem(key(username), JSON.stringify({ failures: 7, until: Date.parse(payload.locked_until), minutes: payload.lock_minutes || 30 })); } catch {}
}
export function clearLoginLock(username) {
  try { localStorage.removeItem(key(username)); } catch {}
}
export function offlineLockPayload(lock) {
  return { code: "ACCOUNT_LOCKED", locked: true, offline: true, locked_until: new Date(lock.until).toISOString(), lock_minutes: lock.minutes, can_request_unlock: false };
}
export function recordOfflinePasswordResult(username, valid, minutes = 30) {
  const previous = cachedLoginLock(username), now = Date.now();
  if (previous?.until > now) return offlineLockPayload(previous);
  if (valid) { clearLoginLock(username); return null; }
  const failures = (previous?.until ? 0 : previous?.failures || 0) + 1;
  const next = { failures, until: failures >= 7 ? now + minutes * 60000 : null, minutes };
  // Fail closed for this offline password check if durable storage is unavailable.
  try { localStorage.setItem(key(username), JSON.stringify(next)); } catch { return { locked: true, offline: true, error: "Offline sign-in is unavailable. Connect to the internet and try again." }; }
  return next.until ? offlineLockPayload(next) : null;
}
