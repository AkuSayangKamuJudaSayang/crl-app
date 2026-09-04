const DB_NAME = "crl-local-first";
const DB_VERSION = 1;
const STORE = "records";

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open local database."));
  });
}

export async function localGet(key, fallback = null) {
  try {
    const db = await openDb();
    if (!db) return fallback;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result?.value ?? fallback);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return fallback;
  }
}

export async function localSet(key, value) {
  try {
    const db = await openDb();
    if (!db) return false;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key, value, updatedAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Local database transaction aborted."));
    });
    return true;
  } catch {
    return false;
  }
}

export async function localRemove(key) {
  try {
    const db = await openDb();
    if (!db) return false;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

function queueKey(userKey) {
  return `queue:${userKey || "anonymous"}`;
}

export async function queueLocalOperation(userKey, operation) {
  const key = queueKey(userKey);
  const current = (await localGet(key, [])) || [];
  if (operation.action === "delete_learner" && operation.body?.learner_id != null) {
    const localId = String(operation.body.learner_id);
    if (localId.startsWith("local-")) {
      const filtered = current.filter((item) => !(item.action === "add_learner" && item.localId === localId));
      await localSet(key, filtered);
      return null;
    }
  }
  const entry = {
    id: operation.id || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`),
    localId: operation.localId || operation.body?.local_id || null,
    createdAt: Date.now(),
    attempts: 0,
    ...operation,
  };
  current.push(entry);
  await localSet(key, current);
  return entry;
}

export async function readLocalQueue(userKey) {
  return (await localGet(queueKey(userKey), [])) || [];
}

export async function replaceLocalQueue(userKey, queue) {
  return localSet(queueKey(userKey), queue || []);
}

export async function clearLocalQueue(userKey) {
  return localRemove(queueKey(userKey));
}

export function localUserKey(user) {
  const username = String(user?.username || user?.user_name || "unknown").trim().toLowerCase();
  const id = String(user?.id || "").trim();
  return `teacher:${username || id || "unknown"}`;
}

export async function saveTeacherSnapshot(user, learners, assessments) {
  const key = `teacher-snapshot:${localUserKey(user)}`;
  await localSet(key, {
    user,
    learners: learners || [],
    assessments: assessments || [],
    savedAt: Date.now(),
  });
}

export async function getTeacherSnapshot(user) {
  return localGet(`teacher-snapshot:${localUserKey(user)}`, null);
}

export async function isProbablyOnline(timeoutMs = 1800) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  if (typeof fetch !== "function") return false;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const started = performance.now();
    const response = await fetch(`/api/assessment/ping?ts=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const latencyMs = Math.round(performance.now() - started);
    return { ok: response.ok, latencyMs };
  } catch {
    return { ok: false, latencyMs: null };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function syncTeacherQueue({ userKey, send }) {
  if (!userKey || typeof send !== "function") return { synced: 0, pending: 0 };
  const queue = await readLocalQueue(userKey);
  if (!queue.length) return { synced: 0, pending: 0 };
  const remaining = [];
  let synced = 0;

  for (const item of queue) {
    try {
      const result = await send(item);
      if (result?.ok === false) throw new Error(result.error || "Sync failed");
      synced += 1;
    } catch {
      remaining.push({ ...item, attempts: Number(item.attempts || 0) + 1 });
      remaining.push(...queue.slice(queue.indexOf(item) + 1));
      break;
    }
  }

  await replaceLocalQueue(userKey, remaining);
  return { synced, pending: remaining.length };
}
