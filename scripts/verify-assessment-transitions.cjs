const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  const content = await import("../lib/assessmentContent.js");
  const storyHelpers = await import("../lib/storyComprehension.mjs");
  const catalogue = content.DEFAULT_ASSESSMENT_CONTENT.BoSY;
  let host = { id: 1, code: "ABC123", teacherId: 901, learnerId: 406, assessmentSessionId: 1, stage: "letter", currentContent: catalogue.letters[0], linkedAt: new Date(), ended: false };
  const letters = new Map();
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((condition) => matches(row, condition));
    if (typeof value === "object" && value !== null) {
      if (value.startsWith !== undefined) return String(row[key] || "").startsWith(value.startsWith);
      if (value.in) return value.in.includes(row[key]);
    }
    return row[key] === value;
  });
  const update = async ({ where, data }) => {
    if (!matches(host, where)) return [];
    host = { ...host, ...data, updatedAt: new Date() };
    return [structuredClone(host)];
  };
  const prisma = {
    hostSession: {
      findFirst: async ({ where }) => matches(host, where) ? structuredClone(host) : null,
      findUnique: async () => structuredClone(host),
      updateManyAndReturn: update,
      updateMany: async (args) => ({ count: (await update(args)).length }),
    },
    letterTaskResult: {
      findFirst: async ({ where }) => structuredClone(letters.get(where.letterIndex) || null),
      create: async ({ data }) => { const row = { id: data.letterIndex + 1, ...data }; letters.set(data.letterIndex, row); return row; },
      update: async ({ where, data }) => { const row = [...letters.values()].find((item) => item.id === where.id); Object.assign(row, data); return row; },
      deleteMany: async () => letters.clear(),
      createMany: async ({ data }) => { data.forEach((row) => letters.set(row.letterIndex, { id: row.letterIndex + 1, ...row })); },
    },
    async $transaction(callback) { return callback(prisma); },
  };
  const context = vm.createContext({ ...content, ...storyHelpers, prisma, console, process, URL, Response, Headers,
    NextResponse: { json: (value, options) => Response.json(value, options) },
  });
  const source = fs.readFileSync("app/api/assessment/route.js", "utf8")
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, "")
    .replace(/^export /gm, "");
  Object.assign(context, await import("../lib/classWorkspace.mjs"));
  vm.runInContext(source, context);
  context.testCatalogue = catalogue;
  vm.runInContext('requireTeacher = async () => ({ userId: 901 }); getLiveAssessmentContent = async () => testCatalogue;', context);
  const post = vm.runInContext("POST", context);
  const call = async (action, body) => {
    const response = await post({ nextUrl: new URL(`https://crl.test/api/assessment?action=${action}`), json: async () => ({ code: "ABC123", ...body }) });
    const data = await response.json();
    assert.ok(response.ok, JSON.stringify(data));
    return data;
  };
  await call("record_letter", { letter_index: 0, is_correct: true });
  await call("record_letter", { letter_index: 1, is_correct: true });
  const late = await call("record_letter", { letter_index: 0, is_correct: true });
  assert.equal(late.stale, true);
  assert.equal(host.currentContent, catalogue.letters[2]);
  assert.equal(letters.size, 2);
  const full = catalogue.letters.map((letter, index) => ({ index, content: letter, isCorrect: true }));
  await call("record_letter", { letter_index: 9, is_correct: true, task1_results: full });
  assert.equal(host.stage, "word");
  assert.equal(letters.size, 10);
  host = { ...host, stage: "passage", currentContent: "passage text", passageStartedAt: new Date() };
  await call("record_letter", { letter_index: 9, is_correct: true, task1_results: full });
  assert.equal(host.stage, "passage");
  assert.equal(host.currentContent, "passage text");
  // The server may have accepted a request whose HTTP response was lost.
  host = { ...host, stage: "comprehension", currentContent: "Question 1", ended: false };
  const finishedReplay = await call("finish_passage", { _offline_replay: true });
  assert.equal(finishedReplay.already_finished, true);
  assert.equal(host.stage, "comprehension");
  vm.runInContext('findHostByCode = async () => ({ ...(await prisma.hostSession.findUnique({})), learner: { id: 406 } }); enforceSensitiveRate = async () => null;', context);
  const joinedReplay = await call("host_join", { _offline_replay: true });
  assert.equal(joinedReplay.already_joined, true);
  vm.runInContext('requireTeacher = async () => ({ userId: 902 });', context);
  const unownedReplay = await context.POST({ nextUrl: new URL("https://crl.test/api/assessment?action=host_join"), json: async () => ({ code: "ABC123", _offline_replay: true }) });
  assert.notEqual(unownedReplay.status, 200, "A forged replay flag cannot bypass invitation ownership");
  vm.runInContext('requireTeacher = async () => ({ userId: 901 });', context);
  console.log("PASS lost-response join and passage-finish replay is idempotent; only the owning teacher may replay a consumed join");
  console.log("PASS online answer retries persist scores without rewinding letters or reopening completed task stages");

  host = { ...host, stage: "comprehension", currentContent: "Question 1" };
  const next = { stage: "comprehension", currentContent: "Question 2", expected_stage: "comprehension", expected_current_content: "Question 1" };
  assert.equal((await call("host_update", next)).session.current_content, "Question 2");
  assert.equal((await call("host_update", next)).stale, true);
  const experience = { stage: "learner_experience", currentContent: "LEARNER_EXPERIENCE", expected_stage: "comprehension", expected_current_content: "Question 2" };
  await call("host_advance", experience);
  assert.equal((await call("host_update", next)).stale, true);
  assert.equal(host.stage, "learner_experience");
  assert.equal((await call("host_update", { stage: "comprehension", currentContent: "Question 1" })).stale, true);
  console.log("PASS guarded online updates reject duplicate, late and legacy unguarded stage transitions");

  host = { ...host, stage: "passage", currentContent: "passage text", passageStartedAt: null, passagePausedAt: null, passagePausedSeconds: 0 };
  const firstStart = new Date(Date.now() - 3000).toISOString();
  const secondStart = new Date(Date.now() - 1000).toISOString();
  const timers = await Promise.all([
    call("passage_ready", { started_at: firstStart }),
    call("passage_ready", { started_at: secondStart }),
  ]);
  assert.equal(timers[0].passage_started_at, firstStart);
  assert.equal(timers[1].passage_started_at, firstStart);
  host.passagePausedAt = new Date();
  await call("passage_ready", { started_at: secondStart });
  assert.equal(host.passageStartedAt.toISOString(), firstStart);
  assert.ok(host.passagePausedAt);
  console.log("PASS concurrent online timer starts and later retries preserve the first start and paused state");

  // Replay a cancellation after its first server response was lost.
  let deleted = 0;
  prisma.assessmentSession = { delete: async ({ where }) => { assert.equal(where.id, 1); deleted++; letters.clear(); } };
  prisma.hostSession.update = async args => (await update(args))[0];
  host = { ...host, stage: "letter", currentContent: catalogue.letters[0], ended: false, assessmentSessionId: 1, teacherId: 901 };
  const firstEnd = await call("host_end", { _offline_replay: true });
  assert.equal(firstEnd.reset, true); assert.equal(host.ended, true); assert.equal(deleted, 1);
  const repeatedEnd = await call("host_end", { _offline_replay: true });
  assert.equal(repeatedEnd.already_ended, true); assert.equal(deleted, 1);
  const normalDuplicate = await post({ nextUrl: new URL("https://crl.test/api/assessment?action=host_end"), json: async () => ({ code: "ABC123" }) });
  assert.equal(normalDuplicate.status, 404, "Ordinary cancellation behavior remains unchanged");
  host = { ...host, ended: true, stage: "completed", assessmentSessionId: 99 };
  assert.equal((await call("host_end", { _offline_replay: true })).already_ended, true);
  assert.equal(host.assessmentSessionId, 99); assert.equal(deleted, 1, "A cancellation retry cannot delete an already completed result");
  const completedHost = structuredClone(host);
  assert.equal((await call("host_end", { code: "MISS23", _offline_replay: true })).already_ended, true);
  assert.deepEqual(structuredClone(host), completedHost); assert.equal(deleted, 1);
  host = { ...host, teacherId: 902, ended: false, stage: "letter" };
  const foreignHost = structuredClone(host);
  assert.equal((await call("host_end", { _offline_replay: true })).already_ended, true);
  assert.deepEqual(structuredClone(host), foreignHost, "A scoped no-op must never modify another teacher's host or results");
  vm.runInContext('requireTeacher = async () => ({ error: Response.json({ error: "Not authenticated" }, { status: 401 }) });', context);
  const unauthenticated = await post({ nextUrl: new URL("https://crl.test/api/assessment?action=host_end"), json: async () => ({ code: "ABC123", _offline_replay: true }) });
  assert.equal(unauthenticated.status, 401); assert.equal(deleted, 1);
  console.log("PASS cancellation replay acknowledges ended or absent owned sessions, preserves completed/foreign results, and still requires teacher authentication");
})().catch((error) => { console.error(error); process.exitCode = 1; });
