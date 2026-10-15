const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  const content = await import("../lib/assessmentContent.js");
  const guides = await import("../lib/storyComprehension.mjs");
  const records = new Map();
  const copy = value => value == null ? value : structuredClone(value);
  const read = async key => copy(records.get(key) ?? null);
  const write = async (key, value) => records.set(key, copy(value));
  const list = async prefix => [...records].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value: copy(value) }));
  let sequence = 0, clock = Date.now(), connected = true, responseStatus = 200, dropNext = false;
  let cloudHost, cloudRecord, beforeReply;
  const calls = [];
  const session = { user: { id: 901, role: "teacher" }, offlineToken: "test-token", expiresAt: clock + 86400000, signedOut: false };
  const pool = content.cloneAssessmentContent();
  await write("teacher_session", session);
  await write("teacher_snapshot:901", { learners: [{ id: 406, first_name: "Test", last_name: "Learner" }], assessments: [], activities: pool });
  class TestDate extends Date { constructor(value) { super(value === undefined ? clock : value); } static now() { return clock; } }
  const cloudFetch = async (input, init = {}) => {
    const url = new URL(input, "https://crl.test");
    if (!connected) throw new TypeError("Failed to fetch");
    if (url.pathname.endsWith("/ping")) return Response.json({ ok: true });
    const body = init.body ? JSON.parse(init.body) : {};
    const action = url.searchParams.get("action") || body.action;
    if (dropNext) { dropNext = false; connected = false; throw new TypeError("Network disconnected after successful probe"); }
    if (responseStatus !== 200) return Response.json({ error: "Temporary relay failure" }, { status: responseStatus });
    if (beforeReply) { const callback = beforeReply; beforeReply = null; await callback(action, body); }
    calls.push({ action, body: copy(body) });
    if (action === "get_learners") return Response.json({ learners: [{ id: 406 }] });
    if (action === "get_activities") return Response.json({ activities: pool });
    if (action === "get_assessments") return Response.json({ assessments: cloudRecord ? [cloudRecord] : [] });
    if (action === "host_start") {
      const code = body.offline_code || "NET234";
      cloudHost = { code, learner_id: 406, assessment_session_id: 77, assessment_period: "BoSY", stage: "waiting", connected: false, current_content: "Waiting for learner to connect...", assessment_content: { ...pool.BoSY, stories: pool.BoSY.stories.map(story => ({ ...story, available: true })) }, task1Results: [], task2Results: [], comprehensionResults: [] };
      return Response.json({ code, assessment_session_id: 77 });
    }
    if (action === "host_join" || action === "learner_join") {
      Object.assign(cloudHost, { stage: "letter", connected: true, linked_at: new Date().toISOString(), current_content: pool.BoSY.letters[0] });
    }
    if (action === "record_letter") {
      const index = Number(body.letter_index);
      cloudHost.task1Results = [...cloudHost.task1Results.filter(item => item.index !== index), { index, content: pool.BoSY.letters[index], isCorrect: Boolean(body.is_correct) }];
      cloudHost.current_content = pool.BoSY.letters[index + 1];
    }
    if (action === "record_word") {
      const index = Number(body.word_index);
      cloudHost.task2Results = [...cloudHost.task2Results.filter(item => item.index !== index), { index, content: pool.BoSY.words[index], isCorrect: Boolean(body.is_correct) }];
    }
    if (action === "record_comprehension") {
      const index = Number(body.question_index);
      cloudHost.comprehensionResults = [...cloudHost.comprehensionResults.filter(item => item.questionIndex !== index), { questionIndex: index, isCorrect: Boolean(body.is_correct) }];
    }
    if (action === "save_final_assessment_review") {
      const correct = items => items.filter(item => item.isCorrect ?? item.is_correct).length;
      cloudRecord = { id: 77, learner_id: 406, assessment_period: "BoSY", is_completed: true, task1_score: correct(cloudHost.task1Results), task2_score: correct(cloudHost.task2Results), comprehension_score: correct(cloudHost.comprehensionResults), offline_pending: false };
    }
    return Response.json({ status: "ok", session: copy(cloudHost) });
  };
  const context = vm.createContext({ ...content, ...guides, Response, Headers, URL, AbortController, TextEncoder, Date: TestDate,
    console, navigator: { onLine: false }, crypto: require("node:crypto").webcrypto,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    window: { location: { origin: "https://crl.test" }, fetch: cloudFetch, __crlOriginalFetch: cloudFetch, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {} },
    useEffect: callback => callback(), setTimeout, clearTimeout,
    getOfflineTeacherSession: () => read("teacher_session"), getOfflineTeacherSnapshot: id => read(`teacher_snapshot:${id}`),
    saveOfflineTeacherSnapshot: (id, value) => write(`teacher_snapshot:${id}`, value),
    getOfflineHostSession: code => read(`host_session:${code}`), saveOfflineHostSession: (code, value) => write(`host_session:${code}`, value),
    saveOfflineTeacherSession: value => write("teacher_session", value), offlineSet: write, offlineList: list,
    getOfflineOutbox: async () => (await list("outbox:")).map(({ value }) => value),
    enqueueOfflineMutation: async value => { const id = `test-${++sequence}`; await write(`outbox:${id}`, { ...value, id, createdAt: clock }); },
    removeOfflineMutation: id => records.delete(`outbox:${id}`),
  });
  const source = fs.readFileSync("app/components/OfflineRuntime.jsx", "utf8").replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, "").replace("export default function OfflineRuntime", "function OfflineRuntime");
  vm.runInContext(source, context);
  vm.runInContext("OfflineRuntime();", context);
  // Suppress scheduled background work; each reconnect is driven explicitly.
  context.window.setTimeout = (callback, delay) => delay === 0 ? 0 : setTimeout(callback, delay);
  const sync = () => vm.runInContext("syncOutbox()", context);
  const resetProbe = () => vm.runInContext("reachabilityProbe = { checkedAt: 0, ok: true, promise: null };", context);
  const request = async (action, body = {}, code = "NET234") => {
    const response = await context.window.fetch(`/api/assessment?action=${action}&code=${code}`, { method: "POST", body: JSON.stringify({ ...body, code }) });
    const result = await response.json(); assert.ok(response.ok, `${action}: ${JSON.stringify(result)}`); return result;
  };
  context.navigator.onLine = true;
  await request("host_start", { learner_id: 406, period: "BoSY", connection_mode: "online" });
  await request("host_join");
  for (let index = 0; index < 3; index++) await request("record_letter", { letter_index: index, is_correct: true });
  assert.equal((await list("outbox:")).length, 0, "Reachable cloud stays primary");
  // Internet disappears between ping and mutation, while Wi-Fi remains online.
  dropNext = true;
  await request("record_letter", { letter_index: 3, is_correct: true });
  assert.equal((await read("host_session:NET234")).local_pending_sync, true);
  assert.equal((await read("host_session:NET234")).task1Results.length, 4);
  const cloudCallsBeforeLocalReads = calls.length;
  const readResponse = await context.window.fetch("/api/assessment?action=host_get&code=NET234");
  assert.equal((await readResponse.json()).session.task1Results.length, 4);
  assert.equal(calls.length, cloudCallsBeforeLocalReads, "A pending local journal cannot be replaced by stale cloud polling");
  // A late reply from an already-running online request must not erase mark 4.
  await context.rememberSuccessfulAssessment("host_get", { code: "NET234" }, { session: cloudHost }, 901);
  assert.equal((await read("host_session:NET234")).task1Results.length, 4);
  for (let index = 4; index < 10; index++) await request("record_letter", { letter_index: index, is_correct: true });
  for (let index = 0; index < 10; index++) await request("record_word", { word_index: index, is_correct: true });
  await request("select_story", { story_id: 1 });
  await request("passage_ready"); clock += 45000;
  await request("finish_passage", { words_read: 100 });
  for (let index = 0; index < 6; index++) await request("record_comprehension", { question_index: index, is_correct: index < 5 });
  await request("save_experience_rating", { experience_rating: 5 });
  await request("save_final_assessment_review");
  const saved = (await read("teacher_snapshot:901")).assessments[0];
  assert.equal(saved.task1_score, 10); assert.equal(saved.task2_score, 10); assert.equal(saved.comprehension_score, 5); assert.equal(saved.offline_pending, true);
  const pending = (await list("outbox:")).map(({ value }) => value);
  assert.equal(pending.at(-1).kind, "save_final_assessment_review");
  connected = true; resetProbe();
  await sync();
  assert.equal((await list("outbox:")).length, 0);
  assert.equal(cloudRecord.task1_score, 10); assert.equal(cloudRecord.task2_score, 10); assert.equal(cloudRecord.comprehension_score, 5);
  assert.equal((await read("host_session:NET234")).local_pending_sync, false);
  assert.deepEqual(calls.filter(call => call.body._offline_replay).map(call => call.action), pending.map(entry => entry.kind));
  const countBeforeCloudRead = calls.length;
  await context.window.fetch("/api/assessment?action=host_get&code=NET234");
  assert.ok(calls.length > countBeforeCloudRead, "Cloud authority resumes after every local write is acknowledged");
  assert.equal((await read("teacher_snapshot:901")).assessments.length, 1, "Cloud reconciliation must not duplicate the locally saved result");
  console.log("PASS online start, post-probe internet loss, complete local assessment, exact scores, ordered reconnect sync, no duplicate result and return to cloud authority");

  // An offline-created invitation may reconnect while marking continues.
  records.clear(); sequence = 0; cloudRecord = null;
  await write("teacher_session", session);
  await write("teacher_snapshot:901", { learners: [{ id: 406 }], assessments: [], activities: pool });
  context.navigator.onLine = false; connected = false; resetProbe();
  const started = await request("host_start", { learner_id: 406, period: "BoSY", connection_mode: "offline" }, "");
  const localCode = started.code;
  await request("host_join", {}, localCode);
  context.navigator.onLine = true; connected = true; resetProbe();
  beforeReply = async action => {
    assert.equal(action, "host_start");
    await request("record_letter", { letter_index: 0, is_correct: true }, localCode);
  };
  await sync();
  let host = await read(`host_session:${localCode}`);
  assert.equal(host.task1Results.length, 1, "A delayed start acknowledgement must preserve the newest local mark");
  assert.equal(host.local_pending_sync, true, "A mark queued during reconnect must not lose local authority");
  assert.ok((await list("outbox:")).some(({ value }) => value.kind === "record_letter"));
  await sync(); host = await read(`host_session:${localCode}`);
  assert.equal(host.offline_created, false); assert.equal(host.local_pending_sync, false);
  assert.equal(host.code, localCode); assert.equal(host.server_code, localCode);
  console.log("PASS marking during offline-start replay retains new work, preserves the same code, and releases cloud authority only after the new mark syncs");

  responseStatus = 400;
  const rejected = await context.window.fetch(`/api/assessment?action=record_letter&code=${localCode}`, { method: "POST", body: JSON.stringify({ code: localCode, letter_index: 1, is_correct: true }) });
  assert.equal(rejected.status, 400);
  assert.equal((await list("outbox:")).length, 0, "Validation failures must not be treated as network outages");
  responseStatus = 503;
  await request("record_letter", { letter_index: 1, is_correct: true }, localCode);
  assert.ok((await list("outbox:")).length > 0, "Temporary relay failures should preserve the mark locally");
  const queuedBeforeAuthFailure = (await list("outbox:")).length;
  responseStatus = 401; resetProbe(); await sync();
  assert.equal((await list("outbox:")).length, queuedBeforeAuthFailure, "Unauthorized replay must retain the journal and cannot report synchronization");
  responseStatus = 200; resetProbe(); await sync();
  assert.equal((await list("outbox:")).length, 0);
  console.log("PASS temporary relay errors fall back locally; validation errors remain visible and failed authentication cannot clear queued work");

  // A hanging in-flight request is bounded even after a good health check.
  const hanging = (input, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }));
  await assert.rejects(context.fetchCloudAssessment(hanging, "/api/assessment", {}, 5), /timed out/);
  console.log("PASS a stalled request times out for local fallback rather than blocking the assessment indefinitely");
})().catch(error => { console.error(error); process.exitCode = 1; });
