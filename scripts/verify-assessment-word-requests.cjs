const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  const {
    liveAssessmentRequestTimeoutMs,
    assessmentReplayRequestTimeoutMs,
  } = await import("../lib/assessmentRequestTimeout.mjs");

  assert.equal(liveAssessmentRequestTimeoutMs("record_word", "POST"), 20000);
  assert.equal(liveAssessmentRequestTimeoutMs("record_letter", "POST"), 20000);
  assert.equal(liveAssessmentRequestTimeoutMs("record_comprehension", "POST"), 20000);
  assert.equal(liveAssessmentRequestTimeoutMs("host_advance", "POST"), 5000);
  assert.equal(liveAssessmentRequestTimeoutMs("learner_status", "GET"), 1800);
  assert.equal(liveAssessmentRequestTimeoutMs("host_get", "GET"), 15000);
  assert.equal(liveAssessmentRequestTimeoutMs("save_final_assessment_review", "POST"), 15000);
  assert.equal(assessmentReplayRequestTimeoutMs("record_word"), 30000);
  assert.equal(assessmentReplayRequestTimeoutMs("record_letter"), 30000);
  assert.equal(assessmentReplayRequestTimeoutMs("record_comprehension"), 30000);
  assert.equal(assessmentReplayRequestTimeoutMs("host_advance"), 10000);
  assert.equal(assessmentReplayRequestTimeoutMs("save_final_assessment_review"), 45000);

  const source = fs.readFileSync("app/components/OfflineRuntime.jsx", "utf8");
  const direct = source.indexOf('const response = isAssessmentRequest && action !== "host_start"');
  assert(direct >= 0);
  assert(source.slice(direct, direct + 360).includes("liveAssessmentRequestTimeoutMs(action, method)"),
    "The actual teacher fetch wrapper must use the timeout policy, not the old 5s POST limit");
  const replay = source.indexOf("response=response||await fetchCloudAssessment");
  assert(replay >= 0);
  assert(source.slice(replay, replay + 245).includes("assessmentReplayRequestTimeoutMs(entry.kind)"),
    "The actual durable replay must use its own longer acknowledgement timeout");
  const retry = source.indexOf("if (response.status === 404 &&");
  assert(retry >= 0 && source.slice(retry, retry + 420).includes("assessmentReplayRequestTimeoutMs(entry.kind)"),
    "A completed-session acknowledgement retry must use the same bounded timeout");
  assert(source.indexOf("await removeOfflineMutation(entry.id)") > source.indexOf("if (!response.ok) {"),
    "Queue removal must happen only after a successful response");
  assert(source.includes("const remaining = await getOfflineOutbox()"),
    "A rejected or aborted write must remain discoverable by future sync attempts");

  // Run the actual request wrapper on a deliberately delayed simulated
  // acknowledgement and verify its timer. No real backend or assessment data.
  const start = source.indexOf("async function fetchCloudAssessment(");
  const finish = source.indexOf("function normalizePeriod(", start);
  assert(start > 0 && finish > start);
  const seenTimeouts = [];
  const listeners = new Map();
  const ctx = vm.createContext({
    AbortController, TypeError, Promise,
    window: {
      setTimeout(fn, ms) { seenTimeouts.push(ms); return setTimeout(fn, ms); },
      clearTimeout, addEventListener(event, fn) { listeners.set(event, fn); },
      removeEventListener(event, fn) { if(listeners.get(event)===fn)listeners.delete(event); },
    },
  });
  vm.runInContext(source.slice(start, finish) + "\nglobalThis.testFetch = fetchCloudAssessment;", ctx);
  const slowServer = (_url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new TypeError("aborted")), { once: true });
    setTimeout(() => resolve({ status: 200, ok: true }), 20);
  });
  const response = await ctx.testFetch(slowServer, "/api/assessment?action=record_word",
    { method: "POST" }, liveAssessmentRequestTimeoutMs("record_word", "POST"));
  assert.equal(response.status, 200);
  assert(seenTimeouts.includes(20000), "The word POST must not use the old 5s timeout");
  const hung = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new TypeError("aborted")), { once: true });
  });
  await assert.rejects(ctx.testFetch(hung, "/api/assessment?action=record_word",
    { method: "POST" }, 5), /timed out|offline/,
    "An actually unresponsive connection must still abort for offline fallback");
  assert.equal(listeners.size, 0, "Offline listeners must be cleaned up after completion or failure");

  console.log("PASS live word/letter saves get 20s acknowledgement, outbox word replay gets 30s, quick host controls remain bounded, late replies are not falsely canceled at 5s, and hung requests still fall back");
})().catch(error => { console.error(error); process.exitCode = 1; });
