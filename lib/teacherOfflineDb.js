const DB_NAME = "crl-app-teacher-offline-db";
const DB_VERSION = 1;
const STORE = "kv";

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb() {
  if (!isBrowser()) return Promise.reject(new Error("IndexedDB is unavailable."));

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open offline database."));
  });
}

async function withStore(mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let result;

    try {
      result = callback(store);
    } catch (error) {
      // A synchronous put/clone failure must not commit earlier writes.
      try { transaction.abort(); } catch {}
      reject(error);
      db.close();
      return;
    }

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("Offline database transaction failed."));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error("Offline database transaction was aborted."));
    };
  });
}

export async function offlineGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => {
      const value = request.result;
      db.close();
      resolve(value === undefined ? null : value);
    };
    request.onerror = () => {
      const error = request.error || new Error("Unable to read offline data.");
      db.close();
      reject(error);
    };
  });
}

export async function offlineSet(key, value) {
  return withStore("readwrite", (store) => store.put(value, key));
}

export async function offlineDelete(key) {
  return withStore("readwrite", (store) => store.delete(key));
}

export async function offlineList(prefix = "") {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).openCursor();
    const entries = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        db.close();
        resolve(entries);
        return;
      }
      if (!prefix || String(cursor.key).startsWith(prefix)) {
        entries.push({ key: cursor.key, value: cursor.value });
      }
      cursor.continue();
    };
    request.onerror = () => {
      const error = request.error || new Error("Unable to list offline data.");
      db.close();
      reject(error);
    };
  });
}

export async function saveOfflineTeacherSession(session) {
  return offlineSet("teacher_session", session);
}

export async function getOfflineTeacherSession() {
  return offlineGet("teacher_session");
}

export async function clearOfflineTeacherSession() {
  return offlineDelete("teacher_session");
}

export async function signOutOfflineTeacherSession() {
  const session = await getOfflineTeacherSession().catch(() => null);
  return saveOfflineTeacherSession({
    ...(session || {}),
    signedOut: true,
    signedOutAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function activateOfflineTeacherSession() {
  const session = await getOfflineTeacherSession().catch(() => null);
  if (
    !session ||
    !session.offlineToken ||
    Number(session.expiresAt || 0) <= Date.now()
  ) {
    return null;
  }

  const active = {
    ...session,
    signedOut: false,
    signedOutAt: null,
    updatedAt: Date.now(),
  };
  await saveOfflineTeacherSession(active);
  return active;
}

export async function saveOfflineTeacherSnapshot(userId, snapshot) {
  return offlineSet(`teacher_snapshot:${Number(userId)}`, snapshot);
}

export async function getOfflineTeacherSnapshot(userId) {
  return offlineGet(`teacher_snapshot:${Number(userId)}`);
}

export async function saveOfflineHostSession(code, session) {
  return offlineSet(`host_session:${String(code).toUpperCase()}`, session);
}

export async function getOfflineHostSession(code) {
  return offlineGet(`host_session:${String(code).toUpperCase()}`);
}

export async function deleteOfflineHostSession(code) {
  return offlineDelete(`host_session:${String(code).toUpperCase()}`);
}

export async function enqueueOfflineMutation(mutation, hostSession = null, teacherSnapshot = null) {
  const mutationCode = mutation.kind === "host_start" ? mutation.body?.offline_code : mutation.body?.code;
  if (hostSession && (String(hostSession.code).toUpperCase() !== String(mutationCode).toUpperCase() ||
    Number(hostSession.teacher_id || hostSession.teacherId) !== Number(mutation.userId))) throw new Error("Offline host ownership mismatch.");
  if (teacherSnapshot && (!hostSession || mutation.kind !== "save_final_assessment_review" || hostSession.stage !== "completed")) throw new Error("Invalid completed assessment projection.");
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const entry = {
    ...mutation,
    id,
    createdAt: Date.now(),
    body: ["add_learner", "delete_learner", "delete_learners", "save_activities"].includes(mutation.kind)
      ? { ...mutation.body, _audit_occurred_at: mutation.body?._audit_occurred_at || new Date().toISOString() }
      : mutation.body,
  };
  // Allocate order and persist the entry in one transaction. Random ID suffixes
  // cannot order two answers saved in the same millisecond, and wall clocks
  // can move backwards while an assessment is offline.
  return withStore("readwrite", store => {
    // Starts, answers, stage changes and recovery commit their checkpoint and
    // replay entry together. A failed write must never leave only one half.
    if (hostSession) store.put(hostSession, `host_session:${String(hostSession.code).toUpperCase()}`);
    if (teacherSnapshot) store.put(teacherSnapshot, `teacher_snapshot:${Number(mutation.userId)}`);
    const counter = store.get("outbox_sequence");
    counter.onsuccess = () => {
      const sequence = Math.max(Number(counter.result || 0) + 1, Date.now() * 1000);
      store.put(sequence, "outbox_sequence");
      store.put({ ...entry, sequence }, `outbox:${id}`);
    };
  });
}

export async function getOfflineOutbox() {
  const entries = await offlineList("outbox:");

  // offlineList intentionally exposes the IndexedDB key alongside its value,
  // while the sync runtime consumes the stored mutation itself. Returning the
  // wrappers here made every queued request look empty and silently prevented
  // reconnect synchronization.
  return entries
    .map((entry) => entry?.value)
    .filter((entry) => entry?.id)
    .sort(
      (left, right) =>
        Number(left?.sequence || Number(left?.createdAt || 0) * 1000) -
        Number(right?.sequence || Number(right?.createdAt || 0) * 1000)
    );
}

export async function removeOfflineMutation(id) {
  return offlineDelete(`outbox:${id}`);
}

// Commit recovery copies before removing active queue references, atomically.
export async function offlineApplyChanges(changes) {
  return withStore("readwrite", store => {
    for (const change of changes) {
      if (change.remove) store.delete(change.key);
      else store.put(change.value, change.key);
    }
  });
}
