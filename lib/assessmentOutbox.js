"use client";

const DB_NAME = "crl-app-assessment-db";
const DB_VERSION = 2;
const OUTBOX_STORE = "outbox";
const STATE_STORE = "assessment_state";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const sessionCode = value => String(value?.payload?.code || value?.code || String(value?.key || "").split(":").at(-1) || "").trim().toUpperCase();
const deletionKey = code => `deleted-session:${code}`;

async function writeSessionData(storeName, value, code) {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...new Set([storeName, STATE_STORE])], "readwrite");
    let written = false;
    const write = () => {
      try { tx.objectStore(storeName).put(value); written = true; }
      catch (error) { tx.abort(); reject(error); }
    };
    if (code) {
      const guard = tx.objectStore(STATE_STORE).get(deletionKey(code));
      guard.onsuccess = () => { if (!guard.result?.deleted) write(); };
    } else write();
    tx.oncomplete = () => { db.close(); resolve(written); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("IndexedDB transaction aborted.")); };
  });
}

export async function putMutation(entry) {
  return writeSessionData(OUTBOX_STORE, entry, sessionCode(entry));
}

// Erase only the selected deleted sessions, including drafts. Minimal terminal
// flags share the write transaction so callbacks from an old tab cannot put
// the removed answers back after cleanup or a page reload.
export async function purgeAssessmentSessionData(codes) {
  const targets = new Set(codes.map(code => String(code).trim().toUpperCase()).filter(Boolean));
  if (!targets.size) return;
  const db = await openDb();
  if (!db) throw new Error("Offline assessment storage is unavailable.");
  return new Promise((resolve, reject) => {
    const tx = db.transaction([OUTBOX_STORE, STATE_STORE], "readwrite");
    for (const code of targets) tx.objectStore(STATE_STORE).put({ key: deletionKey(code), deleted: true });
    for (const name of [OUTBOX_STORE, STATE_STORE]) {
      const request = tx.objectStore(name).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (!String(cursor.value?.key || "").startsWith("deleted-session:") && targets.has(sessionCode(cursor.value))) cursor.delete();
        cursor.continue();
      };
    }
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("Deleted session cleanup was interrupted.")); };
  });
}

export async function removeMutation(id) {
  const db = await openDb();
  if (!db) return false;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    tx.objectStore(OUTBOX_STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getMutations() {
  const db = await openDb();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readonly");
    const request = tx.objectStore(OUTBOX_STORE).getAll();

    request.onsuccess = () => {
      const rows = Array.isArray(request.result) ? request.result : [];
      rows.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
      db.close();
      resolve(rows);
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function countMutations() {
  const db = await openDb();
  if (!db) return 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readonly");
    const request = tx.objectStore(OUTBOX_STORE).count();

    request.onsuccess = () => {
      db.close();
      resolve(Number(request.result || 0));
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function saveAssessmentState(key, state) {
  const value = { ...state, key, savedAt: Date.now() };
  return writeSessionData(STATE_STORE, value, sessionCode(value));
}

export async function getAssessmentState(key) {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STATE_STORE, "readonly");
    const request = tx.objectStore(STATE_STORE).get(key);

    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function removeAssessmentState(key) {
  const db = await openDb();
  if (!db) return false;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STATE_STORE, "readwrite");
    tx.objectStore(STATE_STORE).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
