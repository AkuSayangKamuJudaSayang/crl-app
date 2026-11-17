const assert = require("node:assert/strict");
const fs = require("node:fs");

(async () => {
  const { queuedAssessmentCode, buildCanceledAssessmentPlan } =
    await import("../lib/canceledAssessmentQueue.mjs");

  const code = "AB1234", other = "XY4567";
  const host = {
    code, teacher_id: 11, learner_id: 99, stage: "word", ended: false,
    local_assessment_id: -99, server_assessment_session_id: 501,
    task1Results: [{ index: 0, isCorrect: false }],
    task2Results: [{ index: 0, isCorrect: true }],
    passageMiscues: [{ wordIndex: 2, type: "Omission" }],
  };
  const fixture = [
    { id: "start", kind: "host_start", userId: 11, body: { offline_code: code } },
    ...Array.from({ length: 35 }, (_, index) => ({
      id: "result-" + index, kind: index % 2 ? "record_word" : "record_letter",
      userId: 11, body: { code, is_correct: index % 2 === 0 },
    })),
    { id: "review", kind: "save_final_assessment_review", userId: 11, body: { code } },
    { id: "end", kind: "host_end", userId: 11, body: { code, action: "host_end" } },
    { id: "unrelated", kind: "record_word", userId: 11, body: { code: other } },
  ];
  assert.equal(fixture.length, 39);
  assert.equal(queuedAssessmentCode(fixture[0]), code, "Start uses offline_code");

  const plan = buildCanceledAssessmentPlan({
    userId: 11, codes: [code], entries: fixture, hosts: [host], now: 1000,
  });
  assert.deepEqual(plan.canceledCodes, [code]);
  assert.deepEqual(plan.canceledAssessmentIds.sort((a, b) => a - b), [-99, 501]);
  const changes = plan.changes;
  assert.equal(changes.filter(entry => entry.remove).length, 37,
    "All old starts, scoring responses and final reviews must be discarded");
  assert(!changes.some(entry => entry.key === "outbox:unrelated"),
    "Do not delete another assessment's queued work");
  const hostWrite = changes.find(entry => entry.key === "host_session:" + code)?.value;
  assert.equal(hostWrite.ended, true);
  assert.equal(hostWrite.canceled, true);
  assert.deepEqual(hostWrite.task1Results, []);
  assert.deepEqual(hostWrite.task2Results, []);
  assert.deepEqual(hostWrite.passageMiscues, []);
  assert.deepEqual(hostWrite.comprehensionResults, []);
  const cancellation = changes.find(entry => entry.key === "outbox:end")?.value;
  assert.equal(cancellation.kind, "host_end");
  assert.equal(cancellation.body.code, code);
  assert.equal(cancellation.body.auto_timeout, undefined);
  assert(!changes.some(entry => entry.key === "outbox:start" && !entry.remove),
    "Never replay canceled host starts or recreate discarded assessments");

  const applied = new Map(fixture.map(entry => ["outbox:" + entry.id, entry]));
  for (const change of changes) {
    if (change.remove) applied.delete(change.key);
    else applied.set(change.key, change.value);
  }
  const remaining = [...applied.values()].filter(v => v?.kind);
  assert.deepEqual(remaining.map(entry => entry.kind).sort(), ["host_end", "record_word"],
    "Only cancellation and unrelated work may remain");
  const resumed = buildCanceledAssessmentPlan({
    userId: 11, codes: [code], entries: remaining, hosts: [hostWrite], now: 1001,
  });
  assert(resumed.changes.every(change => !change.remove),
    "Repeated startup recovery does not recreate old scoring writes");

  const timeout = buildCanceledAssessmentPlan({
    userId: 11, codes: [code], entries: fixture, hosts: [host],
    automaticTimeout: true,
  });
  assert.equal(timeout.changes.find(entry => entry.key === "outbox:end")?.value.body.auto_timeout, true);

  const noOldEnd = buildCanceledAssessmentPlan({
    userId: 11, codes: [code],
    entries: fixture.filter(entry => entry.kind !== "host_end"), hosts: [host],
  });
  assert.equal(noOldEnd.changes.filter(entry => entry.value?.kind === "host_end").length, 1);
  assert(noOldEnd.changes.some(entry => entry.key === "outbox:start" && entry.remove));

  const completed = buildCanceledAssessmentPlan({
    userId: 11, codes: [code],
    entries: fixture, hosts: [{ ...host, stage: "completed", ended: true }],
  });
  assert.deepEqual(completed.canceledCodes, [],
    "Do not delete a deliberately saved completed assessment");
  const wrongOwner = buildCanceledAssessmentPlan({
    userId: 22, codes: [code], entries: fixture, hosts: [host],
  });
  assert.deepEqual(wrongOwner.canceledCodes, [],
    "Do not delete another teacher's session");

  const runtime = fs.readFileSync("app/components/OfflineRuntime.jsx", "utf8");
  const client = fs.readFileSync("app/teacher/assessment/AssessmentClient.jsx", "utf8");
  const api = fs.readFileSync("app/api/assessment/route.js", "utf8");
  assert(runtime.includes("oldCancellationCodes"), "Migrate old 0/38 queued cancellation on reload");
  assert(runtime.includes("discardCanceledAssessmentWork(userId, affectedCodes"),
    "Manual and timeout end must discard queued results");
  assert(runtime.includes('if (localHost?.canceled && !["host_start", "host_end"].includes(entry.kind))'),
    "Replay must ignore late results from canceled runs");
  assert(runtime.includes("if (host?.canceled) return;"), "Late local callbacks must not requeue answers");
  assert(client.includes('"host_end"') && client.includes("auto_timeout: true"),
    "Manual and one-minute auto-end use the same cancellation action");
  assert(api.includes("SELECT id FROM public.host_sessions"),
    "Cancellation must serialize against the final save transaction");
  assert(api.includes('where: { id: freshHost.assessmentSessionId, teacherId: userId, isCompleted: false }'),
    "Cancel incomplete assessment results but preserve saved assessments");

  console.log("PASS canceled assessment drops scoring and starts; old 0/38 queue compacts; 60s timeout, owned scope, completed preservation and terminal host guards");
})().catch(error => { console.error(error); process.exitCode = 1; });
