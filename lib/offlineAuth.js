import { cachedLoginLock, offlineLockPayload, recordOfflinePasswordResult, clearLoginLock } from "./offlineLoginSecurity";
const KEY = "crla-offline-teacher-auth-v1";
const PENDING_2FA_KEY = "crla-login-pending-2fa";

async function digest(value) {
  const data = new TextEncoder().encode(value);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function rememberOfflineCredential(username, password, user, deletionPreparation = null) {
  if (typeof window === "undefined" || !username || !password || !user) return;
  clearLoginLock(username);
  const salt = `${user.id || username}:crla-local-v1`;
  const passwordHash = await digest(`${salt}:${password}`);
  localStorage.setItem(
    KEY,
    JSON.stringify({
      username: username.trim().toLowerCase(),
      passwordHash,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        section: user.section,
        school_id: user.school_id,
        school_name: user.school_name,
        role: user.role,
      },
      savedAt: Date.now(),
    })
  );
  // This certificate cannot open a session or bypass the existing 2FA gate.
  if (deletionPreparation?.certificate && deletionPreparation?.pair) {
    try {
      const {storePreparedDeletionKey}=await import('./deletionPasswordClient.mjs');
      await storePreparedDeletionKey(password,user,deletionPreparation.pair,deletionPreparation.certificate);
    } catch { /* Sign-in remains available if secure offline preparation fails. */ }
  }
}

export async function verifyOfflineCredential(username, password) {
  if (typeof window === "undefined") return { valid: false };
  const lock = cachedLoginLock(username);
  if (lock?.until > Date.now()) return { valid: false, ...offlineLockPayload(lock) };

  // Do not let the legacy password fallback bypass a live 2FA challenge.
  try {
    if (sessionStorage.getItem(PENDING_2FA_KEY) === "1") {
      return { valid: false };
    }
  } catch {
    // Continue when sessionStorage is unavailable.
  }

  const raw = localStorage.getItem(KEY);
  if (!raw) return { valid: false };

  let stored;
  try {
    stored = JSON.parse(raw);
  } catch {
    return { valid: false };
  }

  if (stored.username !== username.trim().toLowerCase()) {
    return { valid: false };
  }

  const salt = `${stored.user?.id || stored.username}:crla-local-v1`;
  const passwordHash = await digest(`${salt}:${password}`);
  const valid = passwordHash === stored.passwordHash;
  const failed = recordOfflinePasswordResult(username, valid, stored.user?.role === "admin" ? 5 : 30);
  if (failed) return { valid: false, ...failed };
  return {
    valid,
    user: stored.user,
  };
}
