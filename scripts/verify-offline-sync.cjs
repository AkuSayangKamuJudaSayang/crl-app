const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  const stored = new Map();
  let clock = Date.now();
  let transactions = Promise.resolve();
  // Model the read/write transaction boundary while executing the production
  // allocator and outbox reader, including a persisted counter after reload.
  const withStore = (mode, callback) => {
    const run = transactions.then(() => new Promise((resolve, reject) => {
      callback({
        get(key) {
          const request = { result: stored.get(key) };
          queueMicrotask(() => { try { request.onsuccess(); resolve(); } catch (error) { reject(error); } });
          return request;
        },
        put(value, key) { stored.set(key, structuredClone(value)); },
      });
    }));
    transactions = run.catch(() => {});
    return run;
  };
  const source = fs.readFileSync("lib/teacherOfflineDb.js", "utf8").replace(/^export /gm, "");
  const load = () => {
    const context = vm.createContext({ Date: { now: () => clock }, Math, testWithStore: withStore,
      testList: async prefix => [...stored].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value: structuredClone(value) })),
    });
    vm.runInContext(source + "\nwithStore = testWithStore; offlineList = testList;", context);
    return context;
  };
  let db = load();
  await Promise.all(Array.from({ length: 20 }, (_, index) => db.enqueueOfflineMutation({ kind: "record_letter", body: { letter_index: index } })));
  let entries = await db.getOfflineOutbox();
  assert.deepEqual(Array.from(entries, entry => entry.body.letter_index), Array.from({ length: 20 }, (_, index) => index));
  assert.equal(new Set(Array.from(entries, entry => entry.sequence)).size, 20);
  clock -= 60000;
  db = load();
  await db.enqueueOfflineMutation({ kind: "record_word", body: { word_index: 0 } });
  entries = await db.getOfflineOutbox();
  assert.equal(entries.at(-1).kind, "record_word", "A clock correction and page reload must not move a later word before earlier letters");
  // An existing pre-upgrade entry also remains readable and correctly ordered.
  stored.set("outbox:legacy", { id: "legacy", kind: "host_start", createdAt: clock - 60000 });
  assert.equal((await db.getOfflineOutbox())[0].kind, "host_start");
  console.log("PASS durable replay order for same-millisecond answers, concurrent enqueues, clock rollback, reload and existing queued entries");
})().catch(error => { console.error(error); process.exitCode = 1; });
