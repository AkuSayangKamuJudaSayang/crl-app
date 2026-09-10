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

export async function enqueueOfflineMutation(mutation) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return offlineSet(`outbox:${id}`, {
    ...mutation,
    id,
    createdAt: Date.now(),
  });
}

export async function getOfflineOutbox() {
  return offlineList("outbox:");
}

export async function removeOfflineMutation(id) {
  return offlineDelete(`outbox:${id}`);
}
