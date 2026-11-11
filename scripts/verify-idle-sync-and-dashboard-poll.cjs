const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  const {
    hasVisibleOfflineSyncWork,
    failedOfflineSyncInspection,
  } = await import("../lib/offlineSyncNotice.mjs");

  // The screenshot's notification has no item count; it was created by a
  // generic catch without ever verifying an unsent mutation.
  const phantom = { phase: "waiting",
    message: "Unable to read or synchronize saved changes. Nothing has been discarded; retrying automatically." };
  assert.equal(hasVisibleOfflineSyncWork(phantom), false);
  assert.equal(failedOfflineSyncInspection([], phantom).phase, "idle");
  assert.equal(failedOfflineSyncInspection(null, phantom).phase, "idle");
  assert.equal(hasVisibleOfflineSyncWork({ phase: "waiting", total: 0 }), false);
  assert.equal(hasVisibleOfflineSyncWork({ phase: "syncing", total: 2, completed: 0 }), true);
  assert.equal(hasVisibleOfflineSyncWork({ phase: "success", total: 2, completed: 2 }), true);
  assert.equal(hasVisibleOfflineSyncWork({ phase: "success", total: 0, completed: 0 }), false);
  const known = failedOfflineSyncInspection(null, {phase:"waiting",completed:1,total:3});
  assert.equal(known.phase,"blocked");
  assert.equal(known.total,2);
  assert.equal(hasVisibleOfflineSyncWork(known),true);
  assert.equal(failedOfflineSyncInspection([], {phase:"waiting",total:8,completed:1}).phase,"idle",
    "A confirmed empty journal must clear an obsolete progress banner");

  const runtime = fs.readFileSync("app/components/OfflineRuntime.jsx", "utf8");
  const begin = runtime.indexOf("async function performOutboxSync()");
  const end = runtime.indexOf("async function offlineTeacherData(action)", begin);
  assert(begin > 0 && end > begin);
  const source = runtime.slice(begin,end);
  const session = { user:{id:901,role:"teacher"}, offlineToken:"test-only", expiresAt:Date.now()+60000 };
  let entries=[], failure=false, maintenanceFails=true, maintenanceCalls=0;
  const events = [];
  const ctx = vm.createContext({
    navigator: {onLine:true}, console:{warn(){}},
    window: {__crlOfflineSyncStatus:phantom},
    getOfflineTeacherSession: async()=>session,
    isActiveOfflineSession: ()=>true,
    cleanupLegacyDeletedLearners: async()=>{ maintenanceCalls++; if(maintenanceFails)throw Error("Legacy maintenance error"); },
    getOfflineOutbox: async()=>{if(failure) throw Error("IndexedDB temporarily unavailable");return entries;},
    publishSyncStatus: next=>{ctx.window.__crlOfflineSyncStatus=next;events.push(next);},
    failedOfflineSyncInspection,
  });
  vm.runInContext("var outboxSyncPromise = null;\n"+source+"\nglobalThis.check = syncOutbox;",ctx);
  await ctx.check();
  assert.equal(events.at(-1).phase, "idle",
    "A maintenance failure with no real outbox entries may not show the green banner");
  assert.equal(maintenanceCalls,1,
    "Legacy recovery cleanup must still be attempted when the outbox is empty");
  assert.equal(entries.length,0);
  failure=true;
  ctx.window.__crlOfflineSyncStatus=phantom;
  await ctx.check();
  assert.equal(events.at(-1).phase, "idle",
    "A failed read with no known unsent work must not invent a pending queue");
  failure=false;
  entries=[{id:"unsent-1",userId:901,kind:"record_letter"}];
  await ctx.check();
  assert.equal(events.at(-1).phase,"blocked",
    "A real pending write needs a visible, actionable warning after maintenance fails");
  assert.equal(events.at(-1).total,1);
  assert.equal(entries.length,1,"A failed inspection must never delete the real journal");

  const page = fs.readFileSync("app/teacher/page.jsx", "utf8");
  assert(page.includes("dashboardRefreshStateRef.current.inFlight"));
  assert(page.includes("dashboardRefreshStateRef.current.rerun"));
  assert(page.includes("window.setInterval(refreshWhenVisible, 60000)"));
  assert(!/window\.setInterval\(\s*\(\) => \{\s*loadData\(true\);\s*\},\s*4000/.test(page));
  assert(page.includes("if (loading || offlineAssessment) return undefined"),
    "The timer may not refresh underneath a live offline assessment");
  assert(runtime.includes("}, 30000);"),
    "A background idle sync worker must not scan the offline DB every two seconds");

  console.log("PASS empty and unavailable IndexedDB cannot create a ghost banner; real unsent work stays visible and intact, legacy maintenance is retried, and dashboard reads are single-flight/low-frequency");
})().catch(error => { console.error(error); process.exitCode = 1; });
