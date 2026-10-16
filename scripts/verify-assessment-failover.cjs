const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  const content = await import("../lib/assessmentContent.js");
  const guides = await import("../lib/storyComprehension.mjs");
  const recoveryHelpers = await import("../lib/offlineSyncRecovery.mjs");
  const records = new Map();
  const copy = value => value == null ? value : structuredClone(value);
  const read = async key => copy(records.get(key) ?? null);
  const write = async (key, value) => records.set(key, copy(value));
  const list = async prefix => [...records].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value: copy(value) }));
  let sequence = 0, clock = Date.now(), connected = true, responseStatus = 200, dropNext = false;
  let cloudHost, cloudRecord, beforeReply;
  const calls = [];
  const syncEvents = [];
  const session = { user: { id: 901, role: "teacher" }, offlineToken: "test-token", expiresAt: clock + 86400000, signedOut: false };
  const pool = content.cloneAssessmentContent();
  let cloudActivities = content.cloneAssessmentContent(pool);
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
    if (action === "get_learners") return Response.json({ learners: [{ id: 406, first_name: "Test", last_name: "Learner" }] });
    if (action === "get_activities") return Response.json({ activities: cloudActivities });
    if (action === "save_activities") { cloudActivities[body.period] = copy(body.content); return Response.json({ status: "ok", activities: cloudActivities }); }
    if (action === "save_assessment_records") { cloudRecord = { ...cloudRecord, ...copy(body.records[0]) }; return Response.json({ status: "ok", assessments: [cloudRecord] }); }
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
  let recoveryWriteFailure = false;
  const applyChanges = async changes => {
    const staged = new Map([...records].map(([key, value]) => [key, copy(value)]));
    for (const change of changes) { if (change.remove) staged.delete(change.key); else staged.set(change.key, copy(change.value)); }
    if (recoveryWriteFailure) throw new Error("Recovery transaction aborted");
    records.clear(); for (const [key, value] of staged) records.set(key, value);
  };
  const context = vm.createContext({ ...content, ...guides, ...recoveryHelpers, Response, Headers, URL, AbortController, TextEncoder, Date: TestDate,
    console, navigator: { onLine: false }, crypto: require("node:crypto").webcrypto,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    window: { location: { origin: "https://crl.test" }, fetch: cloudFetch, __crlOriginalFetch: cloudFetch, addEventListener() {}, removeEventListener() {}, dispatchEvent(event) { if (event.type === "crl-offline-sync-status") syncEvents.push(copy(event.detail)); }, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {} },
    useEffect: callback => callback(), setTimeout, clearTimeout,
    getOfflineTeacherSession: () => read("teacher_session"), getOfflineTeacherSnapshot: id => read(`teacher_snapshot:${id}`),
    saveOfflineTeacherSnapshot: (id, value) => write(`teacher_snapshot:${id}`, value),
    getOfflineHostSession: code => read(`host_session:${code}`), saveOfflineHostSession: (code, value) => write(`host_session:${code}`, value),
    saveOfflineTeacherSession: value => write("teacher_session", value), offlineSet: write, offlineList: list,
    offlineGet: read, offlineApplyChanges: applyChanges, getAssessmentMutations: async () => [],
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
  await sync(); // Finish the final review's disconnected automatic attempt.
  await request("save_assessment_records", { records: [{ id: saved.id, remarks: "Edited while still offline" }] }, "");
  const pending = (await list("outbox:")).map(({ value }) => value);
  assert.equal(pending.at(-1).kind, "save_assessment_records");
  await sync(); // Finish the disconnected automatic attempt before reconnecting.
  connected = true; resetProbe();
  await sync();
  assert.equal((await list("outbox:")).length, 0);
  assert.equal(cloudRecord.task1_score, 10); assert.equal(cloudRecord.task2_score, 10); assert.equal(cloudRecord.comprehension_score, 5);
  assert.equal((await read("host_session:NET234")).local_pending_sync, false);
  assert.equal(cloudRecord.remarks, "Edited while still offline");
  assert.equal(cloudRecord.id, 77);
  assert.deepEqual(calls.filter(call => call.body._offline_replay).map(call => call.action), pending.map(entry => entry.kind));
  assert.equal(syncEvents.at(-1).phase, "success");
  assert.equal(syncEvents.at(-1).completed, pending.length);
  const letterProgress = syncEvents.find(event => event.phase === "syncing" && event.current?.title === `Letter 4: ${pool.BoSY.letters[3]}`);
  assert.ok(letterProgress, "Sync progress must identify the actual queued letter");
  assert.ok(letterProgress.current.details.includes("Test Learner"));
  assert.ok(syncEvents.some(event => event.phase === "syncing" && event.current?.title === `Word 1: ${pool.BoSY.words[0]}`));
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
  const eventsBeforeAuthFailure = syncEvents.length;
  responseStatus = 401; resetProbe(); await sync();
  assert.equal((await list("outbox:")).length, queuedBeforeAuthFailure, "Unauthorized replay must retain the journal and cannot report synchronization");
  assert.equal(syncEvents.at(-1).phase, "blocked");
  assert.match(syncEvents.at(-1).message, /Sign in again/);
  assert.equal(syncEvents.slice(eventsBeforeAuthFailure).some(event => event.phase === "success"), false);
  responseStatus = 200; resetProbe(); await sync();
  assert.equal((await list("outbox:")).length, 0);
  console.log("PASS temporary relay errors fall back locally; validation errors remain visible and failed authentication cannot clear queued work");

  // A queued content save reconnects while a teacher edits it again.
  records.clear(); sequence = 0; syncEvents.length = 0;
  await write("teacher_session", session);
  await write("teacher_snapshot:901", { learners: [{ id: 406, first_name: "Test", last_name: "Learner" }], assessments: [], activities: pool });
  context.navigator.onLine = false; connected = false; resetProbe();
  const firstContent = content.cloneAssessmentContent(pool).BoSY;
  firstContent.letters[0] = "Z";
  firstContent.stories.forEach(story => { story.questions = guides.getStoryQuestions(story).map((question, index) => ({ ...question, possibleAnswer: `Teacher answer ${index + 1}` })); });
  await request("save_activities", { period: "BoSY", content: firstContent }, "");
  const firstEntry = (await list("outbox:")).at(-1).value;
  assert.ok(firstEntry.syncLabel.details.includes("Letter 1: M → Z"));
  const secondContent = copy(firstContent); secondContent.letters[0] = "Y"; secondContent.words[0] = "play";
  context.navigator.onLine = true; connected = true; resetProbe();
  beforeReply = async action => {
    assert.equal(action, "save_activities");
    await request("save_activities", { period: "BoSY", content: secondContent }, "");
  };
  await sync();
  let latestSnapshot = await read("teacher_snapshot:901");
  assert.equal(latestSnapshot.activities.BoSY.letters[0], "Y", "An older acknowledgement must not erase the newer local letter");
  assert.equal(latestSnapshot.activitiesOfflinePending, true);
  assert.equal(cloudActivities.BoSY.letters[0], "Z");
  assert.equal(syncEvents.at(-1).phase, "waiting", "New edits arriving during replay must prevent a false all-synced prompt");
  await sync();
  assert.equal(cloudActivities.BoSY.letters[0], "Y"); assert.equal(cloudActivities.BoSY.words[0], "play");
  assert.equal((await read("teacher_snapshot:901")).activitiesOfflinePending, false);
  assert.equal(syncEvents.at(-1).phase, "success");
  assert.ok(syncEvents.some(event => event.phase === "syncing" && event.current.details.includes("Word 1: clap → play")));
  console.log("PASS item-specific green prompt events and concurrent content edits remain ordered, visible and pending until the newest edit is acknowledged");

  // The same race for edits of an existing assessment record.
  cloudRecord = { id: 77, learner_id: 406, assessment_period: "BoSY", is_completed: true, task1_score: 10, task2_score: 10, story_number: 1, timer_seconds: 45, words_read: 100, total_miscues: 0, comprehension_score: 5, remarks: "Original" };
  latestSnapshot = await read("teacher_snapshot:901");
  await write("teacher_snapshot:901", { ...latestSnapshot, assessments: [cloudRecord] });
  context.navigator.onLine = false; connected = false; resetProbe();
  await request("save_assessment_records", { records: [{ id: 77, remarks: "First offline edit" }] }, "");
  context.navigator.onLine = true; connected = true; resetProbe();
  beforeReply = async action => {
    assert.equal(action, "save_assessment_records");
    await request("save_assessment_records", { records: [{ id: 77, remarks: "Newer edit during sync" }] }, "");
  };
  await sync();
  let editedRecord = (await read("teacher_snapshot:901")).assessments[0];
  assert.equal(editedRecord.remarks, "Newer edit during sync"); assert.equal(editedRecord.offline_pending, true);
  assert.equal(cloudRecord.remarks, "First offline edit");
  assert.equal(syncEvents.at(-1).phase, "waiting");
  await sync();
  assert.equal(cloudRecord.remarks, "Newer edit during sync");
  assert.equal((await read("teacher_snapshot:901")).assessments[0].offline_pending, false);
  assert.ok(syncEvents.some(event => event.phase === "syncing" && event.current.title === "Assessment record edits" && event.current.details.includes("Test Learner · BoSY")));
  console.log("PASS record editing during reconnect preserves the latest local record and names the learner being synchronized");

  const localRecord = { ...cloudRecord, id: -1234, offline_session_code: "NEW234", offline_pending: true };
  latestSnapshot = await read("teacher_snapshot:901");
  await write("teacher_snapshot:901", { ...latestSnapshot, assessments: [localRecord] });
  await write("host_session:NEW234", { code: "NEW234", teacher_id: 901, learner_id: 406, assessment_period: "BoSY", local_assessment_id: -1234, server_assessment_session_id: 77, local_pending_sync: true });
  await write("outbox:local-final", { id: "local-final", userId: 901, kind: "save_final_assessment_review", url: "/api/assessment?action=save_final_assessment_review", body: { code: "NEW234" } });
  await write("outbox:local-edit", { id: "local-edit", userId: 901, kind: "save_assessment_records", url: "/api/assessment?action=save_assessment_records", body: { records: [{ id: -1234, remarks: "New offline record edit" }] } });
  await sync();
  assert.equal((await list("outbox:")).length, 0);
  assert.equal(cloudRecord.id, 77, "An edit of a newly created offline result must replay with its acknowledged server ID");
  assert.equal(cloudRecord.remarks, "New offline record edit");
  assert.equal((await read("teacher_snapshot:901")).assessments.length, 1);
  console.log("PASS edits of newly completed offline records remap their local ID without duplicate records");

  // A failed local read must never be mistaken for an empty, synchronized queue.
  const getOutbox = context.getOfflineOutbox;
  context.getOfflineOutbox = async () => { throw new Error("IndexedDB unavailable"); };
  await sync();
  assert.equal(syncEvents.at(-1).phase, "waiting");
  context.getOfflineOutbox = getOutbox;
  // Entries owned by another signed-in teacher are retained, never uploaded.
  await write("outbox:other-account", { id: "other-account", userId: 902, kind: "update_user", url: "/api/auth?action=update_user", body: {} });
  const callsBeforeWrongAccount = calls.length;
  await sync();
  assert.equal(calls.length, callsBeforeWrongAccount);
  assert.equal((await list("outbox:")).length, 1);
  assert.match(syncEvents.at(-1).message, /account that saved/);
  assert.equal(syncEvents.at(-1).current, null);
  records.delete("outbox:other-account");
  await write("outbox:unacknowledged", { id: "unacknowledged", userId: 901, kind: "update_user", url: "/api/auth?action=update_user", body: {} });
  context.window.__crlOriginalFetch = async () => new Response("<html>Temporary gateway page</html>", { status: 200 });
  await sync();
  assert.equal((await list("outbox:")).length, 1, "An HTTP 200 gateway page is not an acknowledgement of a saved change");
  assert.equal(syncEvents.at(-1).phase, "waiting");
  context.window.__crlOriginalFetch = cloudFetch;
  records.delete("outbox:unacknowledged");
  console.log("PASS storage read failures cannot produce false success and queued writes cannot replay under another teacher account");
  await sync();
  assert.equal(syncEvents.at(-1).phase, "idle", "A stale failure must disappear when another tab has already drained the queue");
  await write("outbox:rejected", { id: "rejected", userId: 901, kind: "save_activities", url: "/api/assessment?action=save_activities", body: {} });
  context.window.__crlOriginalFetch = async () => Response.json({ error: "Story content must contain exactly 100 words." }, { status: 400 });
  await sync();
  assert.equal(syncEvents.at(-1).phase, "blocked");
  assert.match(syncEvents.at(-1).message, /exactly 100 words/);
  assert.equal((await list("outbox:")).length, 1, "Actionable errors must not discard unsynchronized work");
  records.delete("outbox:rejected"); context.window.__crlOriginalFetch = cloudFetch;
  console.log("PASS drained queues clear stale errors and rejected edits show the server's reason while remaining safely queued");

  // A deleted learner must not hold unrelated assessments and record edits
  // behind a permanently failing host_start. Preserve its COMPLETE journal.
  records.clear(); syncEvents.length = 0;
  const unavailable = { id: 406, first_name: "Deleted", last_name: "Fixture", lrn: "123456789012" };
  const available = { id: 407, first_name: "Active", last_name: "Fixture", lrn: "123456789013" };
  let roster = [available], rosterStatus = 200;
  const archivedRecord = { id: -44, learner_id: 406, assessment_period: "BoSY", task1_score: 2, task2_score: 3, remarks: "Unsent local result", offline_pending: true, offline_session_code: "OLD234" };
  let remoteRecords = [{ id: 20, learner_id: 407, assessment_period: "BoSY", is_completed: true, remarks: "Original" }];
  const recoveryCalls = [];
  const recoveryFetch = async (input, init = {}) => {
    const url = new URL(input, "https://crl.test"), action = url.searchParams.get("action");
    const body = init.body ? JSON.parse(init.body) : {};
    if (url.pathname.endsWith("/ping")) return Response.json({ ok: true });
    if (action === "get_learners") return Response.json(rosterStatus === 200 ? { status: "ok", learners: roster } : { error: "Not authenticated" }, { status: rosterStatus });
    if (action === "get_assessments") return Response.json({ status: "ok", assessments: remoteRecords });
    if (action === "get_activities") return Response.json({ status: "ok", activities: cloudActivities });
    recoveryCalls.push({ action, body: copy(body) });
    if (action === "host_start") {
      if (!roster.some(learner => learner.id === body.learner_id)) return Response.json({ error: "Learner does not belong to this teacher." }, { status: 404 });
      return Response.json({ status: "ok", code: body.offline_code, assessment_session_id: 1000 + body.learner_id });
    }
    if (action === "save_final_assessment_review") remoteRecords.push({ ...archivedRecord, id: 1406, offline_pending: false, is_completed: true });
    if (action === "save_assessment_records") {
      remoteRecords = remoteRecords.map(record => ({ ...record, ...(body.records.find(item => item.id === record.id) || {}) }));
      return Response.json({ status: "ok", assessments: remoteRecords.filter(record => body.records.some(item => item.id === record.id)) });
    }
    return Response.json({ status: "ok" });
  };
  context.window.__crlOriginalFetch = recoveryFetch;
  await write("teacher_session", session);
  await write("teacher_snapshot:901", { learners: [unavailable, available], assessments: [archivedRecord, { ...remoteRecords[0], remarks: "Newer active edit", offline_pending: true }], activities: cloudActivities, learnerTombstones: [] });
  const retainedHost = { code: "OLD234", teacher_id: 901, learner_id: 406, learner: unavailable, assessment_period: "BoSY", local_assessment_id: -44, offline_created: true, local_pending_sync: true, stage: "completed", ended: true, task1Results: [{ index: 0, isCorrect: true }], comprehensionResults: [{ questionIndex: 0, isCorrect: true }] };
  await write("host_session:OLD234", retainedHost);
  const queue = [
    { id: "deleted-start", kind: "host_start", body: { learner_id: 406, period: "BoSY", offline_code: "OLD234" } },
    { id: "deleted-mark", kind: "record_letter", body: { code: "OLD234", letter_index: 0, is_correct: true } },
    { id: "deleted-final", kind: "save_final_assessment_review", body: { code: "OLD234", remarks: "Unsent local result" } },
    { id: "mixed-edit", kind: "save_assessment_records", body: { records: [{ id: -44, remarks: "Deleted learner edit" }, { id: 20, remarks: "Older active edit" }] } },
    { id: "delete-ack", kind: "delete_learner", body: { learner_id: 406 } },
    { id: "active-start", kind: "host_start", body: { learner_id: 407, period: "MoSY", offline_code: "NEW234" } },
    { id: "active-mark", kind: "record_letter", body: { code: "NEW234", letter_index: 0, is_correct: true } },
    { id: "active-edit", kind: "save_assessment_records", body: { records: [{ id: 20, remarks: "Newer active edit" }] } },
  ];
  for (const [index, item] of queue.entries()) await write(`outbox:${item.id}`, { ...item, userId: 901, createdAt: clock + index, method: "POST", url: `/api/assessment?action=${item.kind}` });
  resetProbe(); await sync();
  assert.equal((await list("outbox:")).length, 0);
  let archives = await list("sync_recovery:901:"); assert.equal(archives.length, 1);
  const archive = archives[0].value;
  assert.deepEqual(archive.hosts[0].task1Results, retainedHost.task1Results);
  assert.deepEqual(archive.assessments[0], archivedRecord);
  assert.deepEqual(archive.entries.map(entry => entry.kind), ["host_start", "record_letter", "save_final_assessment_review", "save_assessment_records"]);
  assert.deepEqual(archive.entries.at(-1).body.records, [{ id: -44, remarks: "Deleted learner edit" }]);
  assert.equal((await read("teacher_snapshot:901")).learners.some(learner => learner.id === 406), false);
  assert.equal((await read("teacher_snapshot:901")).assessments.some(record => record.learner_id === 406), false);
  assert.equal((await read("host_session:OLD234")).offline_recovery_id, archive.id);
  assert.equal(recoveryCalls.filter(call => call.action === "host_start" && call.body.learner_id === 406).length, 1);
  assert.ok(recoveryCalls.some(call => call.action === "delete_learner"));
  assert.ok(recoveryCalls.some(call => call.action === "record_letter" && call.body.code === "NEW234"));
  assert.deepEqual(recoveryCalls.filter(call => call.action === "save_assessment_records").map(call => call.body.records[0].remarks), ["Older active edit", "Newer active edit"], "Splitting a mixed batch cannot let an older edit overwrite a newer one");
  assert.equal(remoteRecords.find(record => record.id === 20).remarks, "Newer active edit");
  assert.equal(syncEvents.at(-1).phase, "recovery");
  const attemptsBefore = recoveryCalls.length; await sync(); assert.equal(recoveryCalls.length, attemptsBefore, "Archived jobs must not keep hitting the server");
  await assert.rejects(context.retryOfflineRecovery(archive.id), /Restore this learner/);
  assert.equal((await list("sync_recovery:901:")).length, 1);
  roster = [available, { ...unavailable, lrn: "999999999999" }];
  await assert.rejects(context.retryOfflineRecovery(archive.id), /Restore this learner/);
  assert.equal((await list("outbox:")).length, 0);
  roster = [available, unavailable];
  const quarantinedHost = await read("host_session:OLD234");
  await write("host_session:OLD234", { ...quarantinedHost, offline_recovery_id: null, learner_id: 407 });
  await assert.rejects(context.retryOfflineRecovery(archive.id), /assessment code is now in use/);
  assert.equal((await list("sync_recovery:901:")).length, 1);
  await write("host_session:OLD234", quarantinedHost);
  await context.retryOfflineRecovery(archive.id); await sync();
  assert.equal((await list("sync_recovery:901:")).length, 0); assert.equal((await list("outbox:")).length, 0);
  assert.ok(recoveryCalls.some(call => call.action === "save_assessment_records" && call.body.records.some(record => record.id === 1406 && record.remarks === "Deleted learner edit")));
  console.log("PASS deleted learner journals/results are atomically preserved, deletion acknowledgements and other learners continue, mixed edits keep order, and retry requires the same restored identity");

  // An interrupted archive transaction must leave BOTH the original queue
  // and its local result intact; an unverified roster cannot trigger recovery.
  records.clear(); roster = [available]; recoveryWriteFailure = true;
  await write("teacher_session", session);
  const failureSnapshot = { learners: [unavailable], assessments: [archivedRecord], activities: cloudActivities };
  await write("teacher_snapshot:901", failureSnapshot); await write("host_session:OLD234", retainedHost);
  await write("outbox:atomic", { ...queue[0], id: "atomic", userId: 901, url: "/api/assessment?action=host_start", method: "POST" });
  resetProbe(); await sync();
  assert.equal((await list("outbox:")).length, 1); assert.equal((await list("sync_recovery:901:")).length, 0);
  assert.deepEqual(await read("teacher_snapshot:901"), failureSnapshot);
  recoveryWriteFailure = false; rosterStatus = 401; await sync();
  assert.equal((await list("outbox:")).length, 1); assert.equal((await list("sync_recovery:901:")).length, 0);
  rosterStatus = 200; await sync(); assert.equal((await list("outbox:")).length, 0); assert.equal((await list("sync_recovery:901:")).length, 1);
  const foreign = { ...archive, userId: 902 };
  assert.throws(() => recoveryHelpers.planRecoveryRetry({ archive: foreign, userId: 901, roster: [unavailable], snapshot: failureSnapshot, pending: [] }), /another teacher/);
  const foreignPlan = recoveryHelpers.planLearnerRecovery({ userId: 901, learnerId: 406, entries: [{ ...queue[0], userId: 902 }], hosts: [], snapshot: failureSnapshot, id: "foreign", now: clock, reason: "Unavailable" });
  assert.equal(foreignPlan, null);
  assert.throws(() => recoveryHelpers.planRecoveryRetry({ archive, userId: 901, roster: [unavailable], snapshot: { assessments: [{ ...archivedRecord, assessment_period: "EoSY" }] }, pending: [] }), /different assessment period/);
  console.log("PASS storage failure and failed roster verification preserve the entire queue; recovery never consumes another teacher's entries");

  // Offline deletion hides the record from the roster, but its tombstone must
  // retain enough identity and data to recover an earlier unsent record edit.
  records.clear(); roster = [available];
  await write("teacher_session", session);
  await write("teacher_snapshot:901", { learners: [unavailable, available], assessments: [archivedRecord], activities: cloudActivities });
  await write("outbox:record-only", { id: "record-only", userId: 901, kind: "save_assessment_records", createdAt: clock - 1, method: "POST", url: "/api/assessment?action=save_assessment_records", body: { records: [{ id: -44, remarks: "Keep deleted record edit" }] } });
  await context.handleOfflineTeacherMutation("delete_learner", { body: JSON.stringify({ action: "delete_learner", learner_id: 406 }) });
  assert.equal((await read("teacher_snapshot:901")).assessments.length, 0);
  assert.deepEqual((await read("teacher_snapshot:901")).learnerTombstones[0].assessments, [archivedRecord]);
  const beforeRecordReplay = context.window.__crlOriginalFetch;
  context.window.__crlOriginalFetch = async (input, init) => String(input).includes("action=save_assessment_records")
    ? Response.json({ error: "One or more assessment records were not found." }, { status: 404 }) : beforeRecordReplay(input, init);
  resetProbe(); await sync();
  assert.equal((await list("outbox:")).length, 0);
  const recordArchive = (await list("sync_recovery:901:"))[0].value;
  assert.deepEqual(recordArchive.assessments, [archivedRecord]);
  assert.equal(recordArchive.entries[0].body.records[0].remarks, "Keep deleted record edit");
  context.window.__crlOriginalFetch = beforeRecordReplay;
  const noCodePlan = recoveryHelpers.planLearnerRecovery({ userId: 901, learnerId: 406, entries: [
    { id: "target", userId: 901, kind: "host_start", body: { learner_id: 406 } },
    { id: "unrelated", userId: 901, kind: "assessment_commit", body: { learner_id: 407 } },
  ], hosts: [], snapshot: failureSnapshot, id: "no-code", now: clock, reason: "Unavailable" });
  assert.deepEqual(noCodePlan.archive.entries.map(entry => entry.id), ["target"]);
  console.log("PASS record edits remain recoverable after offline deletion without a cached host; absent codes cannot capture another learner's work");

  // A hanging in-flight request is bounded even after a good health check.
  const hanging = (input, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }));
  await assert.rejects(context.fetchCloudAssessment(hanging, "/api/assessment", {}, 5), /timed out/);
  console.log("PASS a stalled request times out for local fallback rather than blocking the assessment indefinitely");
})().catch(error => { console.error(error); process.exitCode = 1; });
