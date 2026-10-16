const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  const stores = { outbox: new Map(), assessment_state: new Map() };
  let failCommit = false;
  // Model IndexedDB request scheduling, staged transactions and aborts while
  // executing the actual secondary-outbox implementation, including cursors.
  const indexedDB = { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = { close() {}, transaction(names) {
        const staged = Object.fromEntries(Object.entries(stores).map(([name, rows]) => [name, new Map([...rows].map(([key, row]) => [key, structuredClone(row)]))]));
        let pending = 0, aborted = false, completed = false;
        const tx = { error: null, abort() { aborted = true; queueMicrotask(() => tx.onabort?.()); } };
        const schedule = callback => {
          pending += 1;
          queueMicrotask(() => {
            if (!aborted) {
              try { callback(); } catch (error) { tx.error = error; tx.abort(); }
            }
            pending -= 1;
            if (!pending && !aborted && !completed) {
              completed = true;
              if (failCommit) { tx.error = new Error("Storage interrupted"); tx.abort(); }
              else { for (const name of names) stores[name] = staged[name]; tx.oncomplete?.(); }
            }
          });
        };
        tx.objectStore = name => ({
          put(value, key) { const id = key ?? value.id ?? value.key; staged[name].set(id, structuredClone(value)); schedule(() => {}); },
          delete(key) { staged[name].delete(key); schedule(() => {}); },
          get(key) { const result = {}; schedule(() => { result.result = structuredClone(staged[name].get(key)); result.onsuccess?.(); }); return result; },
          getAll() { const result = {}; schedule(() => { result.result = [...staged[name].values()].map(row => structuredClone(row)); result.onsuccess?.(); }); return result; },
          openCursor() {
            const result = {}, keys = [...staged[name].keys()]; let index = 0;
            const advance = () => schedule(() => {
              const key = keys[index++];
              result.result = key === undefined ? null : { value: structuredClone(staged[name].get(key)), delete: () => staged[name].delete(key), continue: advance };
              result.onsuccess?.();
            });
            advance(); return result;
          },
        });
        return tx;
      } };
      request.onsuccess();
    });
    return request;
  } };
  const source = fs.readFileSync("lib/assessmentOutbox.js", "utf8").replace(/^export /gm, "");
  const context = vm.createContext({ window: { indexedDB }, indexedDB, Date, Map, Set });
  vm.runInContext(source, context);
  const old = { id: "answer:OLD234:letter:0", payload: { code: "OLD234" }, createdAt: 1 };
  const active = { id: "answer:LIVE23:letter:0", payload: { code: "LIVE23" }, createdAt: 2 };
  await context.putMutation(old); await context.putMutation(active);
  for (const kind of ["part1-results", "passage", "comprehension", "final-review"]) {
    await context.saveAssessmentState(`${kind}:OLD234`, { code: "OLD234", results: [1] });
    await context.saveAssessmentState(`${kind}:LIVE23`, { code: "LIVE23", results: [2] });
  }
  failCommit = true;
  await assert.rejects(() => context.purgeAssessmentSessionData(["OLD234"]), /Storage interrupted/);
  assert.equal(stores.outbox.has(old.id), true); assert.equal(stores.assessment_state.has("passage:OLD234"), true);
  assert.equal(stores.assessment_state.has("deleted-session:OLD234"), false);
  failCommit = false;
  await context.purgeAssessmentSessionData(["old234"]);
  assert.equal(stores.outbox.has(old.id), false); assert.equal(stores.outbox.has(active.id), true);
  assert.equal(stores.assessment_state.has("passage:OLD234"), false);
  assert.equal(stores.assessment_state.has("passage:LIVE23"), true);
  assert.equal(stores.assessment_state.get("deleted-session:OLD234").deleted, true);
  assert.equal(await context.putMutation(old), false, "A late answer cannot recreate a deleted session");
  assert.equal(await context.saveAssessmentState("passage:OLD234", { code: "OLD234", results: [3] }), false);
  assert.equal(await context.saveAssessmentState("final-review:OLD234", { results: [3] }), false, "Code-less legacy drafts are matched by their exact key");
  assert.equal(await context.putMutation({ ...active, id: "answer:LIVE23:letter:1" }), true);
  assert.equal(await context.saveAssessmentState("passage:LIVE23", { code: "LIVE23", results: [4] }), true);
  assert.equal(stores.outbox.has(old.id), false);
  assert.ok(!fs.readFileSync("components/TeacherOfflineSettings.jsx", "utf8").includes("Saved offline items"));
  assert.ok(!fs.readFileSync("app/teacher/layout.jsx", "utf8").includes("OfflineSyncRecovery"));
  assert.ok(!fs.existsSync("app/components/OfflineSyncRecovery.jsx"));
  console.log("PASS deleted session answers and all draft types are permanently removed; failed transactions retain data, late callbacks cannot restore it and current sessions remain writable");
  console.log("PASS teacher settings no longer expose offline recovery, download or restore controls");
})().catch(error => { console.error(error); process.exitCode = 1; });
