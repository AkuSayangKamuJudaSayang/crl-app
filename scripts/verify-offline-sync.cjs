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
  const restored = { code: "TST234", teacher_id: 901, learner_id: 406, local_pending_sync: true, stage: "word" };
  await db.enqueueOfflineMutation({ kind: "host_recover", userId: 901, body: { code: "TST234" } }, restored);
  assert.equal(stored.get("host_session:TST234").stage, "word");
  assert.equal((await db.getOfflineOutbox()).at(-1).kind, "host_recover");
  await assert.rejects(() => db.enqueueOfflineMutation({ kind: "host_recover", userId: 902, body: { code: "TST234" } }, restored), /ownership/);
  console.log("PASS recovered host projection and ordered replay commit together with ownership validation");

  // Execute the production allocator with a staged transaction and a failure
  // on the journal write, after the host/record writes have been requested.
  const atomicRecords = new Map();
  let failJournal = false;
  const transaction = (mode, callback) => new Promise((resolve, reject) => {
    const staged = new Map(atomicRecords);
    const store = {
      put(value, key) {
        if (failJournal && key.startsWith('outbox:')) throw Error('Synthetic quota failure');
        staged.set(key, structuredClone(value));
      },
      get(key) {
        const request = { result: staged.get(key) };
        queueMicrotask(() => {
          try {
            request.onsuccess();
            atomicRecords.clear();
            for (const [key, value] of staged) atomicRecords.set(key, value);
            resolve();
          } catch (error) { reject(error); }
        });
        return request;
      },
    };
    try { callback(store); } catch (error) { reject(error); }
  });
  const allocator = vm.createContext({ Date, Math, transaction });
  vm.runInContext(source + '\nwithStore = transaction;', allocator);
  const waiting = { code: 'NEW234', teacher_id: 901, learner_id: 406, stage: 'waiting', assessment_period: 'MoSY' };
  const invitation = { kind: 'host_start', userId: 901, body: { offline_code: waiting.code, period: 'MoSY' } };
  failJournal = true;
  await assert.rejects(() => allocator.enqueueOfflineMutation(invitation, waiting), /quota failure/);
  assert.equal(atomicRecords.size, 0);
  failJournal = false;
  await allocator.enqueueOfflineMutation(invitation, waiting);
  assert.equal(atomicRecords.get('host_session:NEW234').assessment_period, 'MoSY');
  const previous = structuredClone([...atomicRecords]);
  const completed = { ...waiting, stage: 'completed' };
  const snapshot = { assessments: [{ offline_session_code: waiting.code, assessment_period: 'MoSY', is_completed: true }] };
  const final = { kind: 'save_final_assessment_review', userId: 901, body: { code: waiting.code } };
  failJournal = true;
  await assert.rejects(() => allocator.enqueueOfflineMutation(final, completed, snapshot), /quota failure/);
  assert.deepEqual([...atomicRecords], previous, 'A failed journal must also roll back the completed record and checkpoint');
  failJournal = false;
  await allocator.enqueueOfflineMutation(final, completed, snapshot);
  assert.equal(atomicRecords.get('host_session:NEW234').stage, 'completed');
  assert.equal(atomicRecords.get('teacher_snapshot:901').assessments[0].assessment_period, 'MoSY');
  assert.equal([...atomicRecords.keys()].filter(key => key.startsWith('outbox:')).length, 2);
  await assert.rejects(() => allocator.enqueueOfflineMutation({ ...invitation, userId: 902 }, waiting), /ownership/);
  await assert.rejects(() => allocator.enqueueOfflineMutation({ ...invitation, body: { offline_code: 'BAD234' } }, waiting), /ownership/);
  await assert.rejects(() => allocator.enqueueOfflineMutation(invitation, waiting, snapshot), /projection/);
  console.log('PASS starts and completed records commit with their checkpoint and replay; injected journal failures retain every previous value and ownership guards reject mismatches');
  // An existing pre-upgrade entry also remains readable and correctly ordered.
  stored.set("outbox:legacy", { id: "legacy", kind: "host_start", createdAt: clock - 60000 });
  assert.equal((await db.getOfflineOutbox())[0].kind, "host_start");
  console.log("PASS durable replay order for same-millisecond answers, concurrent enqueues, clock rollback, reload and existing queued entries");

  // Exercise the real transaction wrapper. A synchronous cloning error on a
  // later write must abort all earlier requests, not commit half a deletion.
  const persisted = new Map([["outbox:pending", { id: "pending" }]]);
  let aborted = false;
  const indexedDB = { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = {
        close() {},
        transaction() {
          const staged = new Map(persisted);
          const tx = {
            objectStore: () => ({
              put(value, key) {
                if (value?.uncloneable) throw new Error("DataCloneError");
                staged.set(key, structuredClone(value));
              },
              delete: key => staged.delete(key),
            }),
            abort() { aborted = true; queueMicrotask(() => tx.onabort?.()); },
          };
          queueMicrotask(() => {
            if (aborted) return;
            persisted.clear(); for (const [key, value] of staged) persisted.set(key, value);
            tx.oncomplete?.();
          });
          return tx;
        },
      };
      request.onsuccess();
    });
    return request;
  } };
  const atomic = vm.createContext({ window: {}, indexedDB });
  vm.runInContext(source, atomic);
  await assert.rejects(() => atomic.offlineApplyChanges([
    { key: "host_session:OLD234", value: { deleted: true } },
    { key: "outbox:pending", remove: true },
    { key: "teacher_snapshot:901", value: { uncloneable: true } },
  ]), /DataCloneError/);
  assert.equal(aborted, true);
  assert.equal(persisted.has("outbox:pending"), true);
  assert.equal(persisted.has("host_session:OLD234"), false);
  aborted = false;
  await atomic.offlineApplyChanges([
    { key: "host_session:OLD234", value: { deleted: true } },
    { key: "outbox:pending", remove: true },
  ]);
  assert.equal(persisted.has("outbox:pending"), false);
  assert.equal(persisted.has("host_session:OLD234"), true);
  console.log("PASS terminal deletion marker and queue removal commit together; synchronous storage failures abort all writes");
})().catch(error => { console.error(error); process.exitCode = 1; });
