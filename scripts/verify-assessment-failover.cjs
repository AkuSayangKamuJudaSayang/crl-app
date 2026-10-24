const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  const content = await import("../lib/assessmentContent.js");
  const guides = await import("../lib/storyComprehension.mjs");
  const deletionHelpers = await import("../lib/offlineLearnerDeletion.mjs");
  const records = new Map();
  const copy = value => value == null ? value : structuredClone(value);
  const read = async key => copy(records.get(key) ?? null);
  const testClassId="11111111-1111-4111-8111-111111111111";
  const testYearId="22222222-2222-4222-8222-222222222222";
  const scopedFixture=value=>({...value,classes:value.classes||{schoolYears:[{id:testYearId,teacherId:901,startYear:2026,label:"2026-2027"}],sections:[{id:testClassId,teacherId:901,schoolYearId:testYearId,name:"Test"}],archives:[]},learners:(value.learners||[]).map(item=>({...item,class_section_id:item.class_section_id||testClassId}))});
  const write = async (key, value) => records.set(key, copy(key.startsWith("teacher_snapshot:") ? scopedFixture(value) : value));
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
    if (beforeReply && init.method === "POST") { const callback = beforeReply; beforeReply = null; await callback(action, body); }
    calls.push({ action, body: copy(body) });
    if (action === "get_learners") return Response.json({ status: "ok", learners: [{ id: 406, first_name: "Test", last_name: "Learner" }] });
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
  let recoveryWriteFailure = false, secondaryFailure = false;
  const secondary = new Map(), drafts = new Map();
  const disconnected = [];
  const applyChanges = async changes => {
    const staged = new Map([...records].map(([key, value]) => [key, copy(value)]));
    for (const change of changes) { if (change.remove) staged.delete(change.key); else staged.set(change.key, copy(change.value)); }
    if (recoveryWriteFailure) throw new Error("Recovery transaction aborted");
    records.clear(); for (const [key, value] of staged) records.set(key, value);
  };
  const context = vm.createContext({ ...content, ...guides, ...deletionHelpers, Response, Headers, URL, AbortController, TextEncoder, Date: TestDate,
    console, navigator: { onLine: false }, crypto: require("node:crypto").webcrypto,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    window: { location: { origin: "https://crl.test" }, fetch: cloudFetch, __crlOriginalFetch: cloudFetch, addEventListener() {}, removeEventListener() {}, dispatchEvent(event) { if (event.type === "crl-offline-sync-status") syncEvents.push(copy(event.detail)); }, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {} },
    useEffect: callback => callback(), setTimeout, clearTimeout,
    getOfflineTeacherSession: () => read("teacher_session"), getOfflineTeacherSnapshot: id => read(`teacher_snapshot:${id}`),
    saveOfflineTeacherSnapshot: (id, value) => write(`teacher_snapshot:${id}`, value),
    getOfflineHostSession: code => read(`host_session:${code}`), saveOfflineHostSession: (code, value) => write(`host_session:${code}`, value),
    saveOfflineTeacherSession: value => write("teacher_session", value), offlineSet: write, offlineList: list,
    offlineApplyChanges: applyChanges,
    disconnectAssessmentPeer: code => disconnected.push(code),
    purgeAssessmentSessionData: async codes => {
      if (secondaryFailure) throw new Error("Secondary cleanup interrupted");
      for (const [id, item] of secondary) if (codes.includes(item.payload.code)) secondary.delete(id);
      for (const [id, item] of drafts) if (codes.includes(item.code)) drafts.delete(id);
    },
    getOfflineOutbox: async () => (await list("outbox:")).map(({ value }) => value),
    enqueueOfflineMutation: async value => { const id = `test-${++sequence}`; await write(`outbox:${id}`, { ...value, id, createdAt: clock }); },
    removeOfflineMutation: id => records.delete(`outbox:${id}`),
  });
  Object.assign(context, await import("../lib/classWorkspace.mjs"));
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
  // behind a permanently failing host_start. Discard only confirmed deleted work.
  records.clear(); syncEvents.length = 0;
  const unavailable = { id: 406, first_name: "Deleted", last_name: "Fixture", lrn: "123456789012" };
  const available = { id: 407, first_name: "Active", last_name: "Fixture", lrn: "123456789013" };
  let roster = [available], rosterStatus = 200, rosterOffline = false;
  const archivedRecord = { id: -44, learner_id: 406, assessment_period: "BoSY", task1_score: 2, task2_score: 3, remarks: "Unsent local result", offline_pending: true, offline_session_code: "OLD234" };
  let remoteRecords = [{ id: 20, learner_id: 407, assessment_period: "BoSY", is_completed: true, remarks: "Original" }];
  const recoveryCalls = [];
  const recoveryFetch = async (input, init = {}) => {
    const url = new URL(input, "https://crl.test"), action = url.searchParams.get("action");
    const body = init.body ? JSON.parse(init.body) : {};
    if (url.pathname.endsWith("/ping")) return Response.json({ ok: true });
    if (action === "get_learners") return Response.json(rosterStatus === 200 ? { status: "ok", learners: roster, offline: rosterOffline } : { error: "Not authenticated" }, { status: rosterStatus });
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
  assert.equal((await list("sync_recovery:901:")).length, 0);
  const retired = await read("host_session:OLD234");
  assert.equal(retired.deleted, true); assert.equal(retired.local_delete_pending, false);
  assert.equal(retired.learner, undefined); assert.equal(retired.task1Results, undefined);
  assert.equal((await read("teacher_snapshot:901")).assessments.some(record => record.learner_id === 406), false);
  assert.equal(recoveryCalls.filter(call => call.action === "host_start" && call.body.learner_id === 406).length, 0, "Preflight must not send obsolete learner sessions");
  assert.ok(recoveryCalls.some(call => call.action === "delete_learner"));
  assert.ok(recoveryCalls.some(call => call.action === "record_letter" && call.body.code === "NEW234"));
  assert.deepEqual(recoveryCalls.filter(call => call.action === "save_assessment_records").map(call => call.body.records[0].remarks), ["Older active edit", "Newer active edit"]);
  assert.equal(remoteRecords.find(record => record.id === 20).remarks, "Newer active edit");
  assert.equal(syncEvents.at(-1).phase, "success");
  const attemptsBefore = recoveryCalls.length; await sync(); assert.equal(recoveryCalls.length, attemptsBefore);
  const deletedResponse = await context.window.fetch("/api/assessment?action=record_letter", { method: "POST", body: JSON.stringify({ action: "record_letter", code: "OLD234", letter_index: 1, is_correct: true }) });
  assert.equal(deletedResponse.status, 410); assert.equal((await deletedResponse.json()).deleted, true);
  assert.equal((await list("outbox:")).length, 0);
  console.log("PASS deleted learner work is discarded before replay, terminal sessions reject new answers, mixed edits keep order and current learners synchronize");

  // Migrate existing archives even when the active queue is empty/offline.
  records.clear(); secondary.clear(); drafts.clear();
  await write("teacher_session", session);
  const legacy = { version: 1, id: "legacy", userId: 901, learnerId: 406, learner: unavailable, entries: queue.slice(0, 3), hosts: [retainedHost], assessments: [archivedRecord] };
  const foreign = { ...legacy, id: "other-account", userId: 902 };
  await write("sync_recovery:901:legacy", legacy); await write("sync_recovery:902:other-account", foreign);
  await write("host_session:OLD234", { ...retainedHost, offline_recovery_id: "legacy" });
  await write("host_session:LIVE23", { code: "LIVE23", teacher_id: 901, learner_id: 407, learner: available, task1Results: [{ index: 0, isCorrect: true }] });
  const liveSnapshot = { learners: [available], assessments: [{ ...remoteRecords[0], offline_pending: true }], activities: cloudActivities };
  await write("teacher_snapshot:901", liveSnapshot);
  secondary.set("old-answer", { payload: { code: "OLD234" } }); secondary.set("active-answer", { payload: { code: "LIVE23" } });
  drafts.set("old-draft", { code: "OLD234", comprehension: [1, 2] }); drafts.set("active-draft", { code: "LIVE23", comprehension: [1] });
  context.navigator.onLine = false;
  context.window.__crlOfflineSyncStatus = { phase: "recovery" };
  await sync();
  assert.equal((await list("sync_recovery:901:")).length, 0); assert.deepEqual(await read("sync_recovery:902:other-account"), foreign);
  assert.equal(secondary.has("old-answer"), false); assert.equal(drafts.has("old-draft"), false);
  assert.equal(secondary.has("active-answer"), true); assert.equal(drafts.has("active-draft"), true);
  assert.deepEqual((await read("teacher_snapshot:901")).assessments, liveSnapshot.assessments);
  assert.ok(disconnected.includes("OLD234")); assert.equal(syncEvents.at(-1).phase, "idle");
  console.log("PASS an empty/offline queue still purges legacy backups, answers and drafts while preserving current learners and other teacher accounts");

  // Primary storage failure and failed roster verification cannot be treated
  // as an empty roster. Secondary failure remains resumable after reload.
  records.clear(); roster = [available]; recoveryWriteFailure = true;
  context.navigator.onLine = true;
  await write("teacher_session", session);
  const failureSnapshot = scopedFixture({ learners: [unavailable], assessments: [archivedRecord], activities: cloudActivities });
  await write("teacher_snapshot:901", failureSnapshot); await write("host_session:OLD234", retainedHost);
  await write("outbox:atomic", { ...queue[0], id: "atomic", userId: 901, url: "/api/assessment?action=host_start", method: "POST" });
  resetProbe(); await sync();
  assert.equal((await list("outbox:")).length, 1); assert.deepEqual(await read("teacher_snapshot:901"), failureSnapshot);
  recoveryWriteFailure = false; rosterStatus = 401; await sync();
  assert.equal((await list("outbox:")).length, 1); assert.deepEqual(await read("teacher_snapshot:901"), failureSnapshot);
  rosterStatus = 200; rosterOffline = true; await sync();
  assert.equal((await list("outbox:")).length, 1); assert.deepEqual(await read("teacher_snapshot:901"), failureSnapshot);
  rosterOffline = false; secondaryFailure = true;
  secondary.set("retry-old", { payload: { code: "OLD234" } }); await sync();
  assert.equal((await read("host_session:OLD234")).local_delete_pending, true);
  assert.equal(secondary.has("retry-old"), true);
  secondaryFailure = false; await sync();
  assert.equal((await read("host_session:OLD234")).local_delete_pending, false);
  assert.equal(secondary.has("retry-old"), false); assert.equal((await list("outbox:")).length, 0);
  const foreignEntries = [{ ...queue[0], userId: 902 }];
  assert.deepEqual(deletionHelpers.queuedLearnerIds({ userId: 901, entries: foreignEntries, hosts: [], snapshot: failureSnapshot }), []);
  console.log("PASS storage failure and failed authentication retain unverified work; interrupted secondary cleanup retries safely and account boundaries are preserved");

  records.clear(); roster = [available];
  await write("teacher_session", session);
  await write("teacher_snapshot:901", { learners: [unavailable, available], assessments: [archivedRecord], activities: cloudActivities });
  await write("outbox:record-only", { id: "record-only", userId: 901, kind: "save_assessment_records", createdAt: clock - 1, method: "POST", url: "/api/assessment?action=save_assessment_records", body: { records: [{ id: -44, remarks: "Deleted record edit" }] } });
  await context.handleOfflineTeacherMutation("delete_learner", { body: JSON.stringify({ action: "delete_learner", learner_id: 406, confirmation: unavailable.first_name, deletion_reason: "Synthetic test removal" }) });
  resetProbe(); await sync();
  assert.equal((await list("outbox:")).length, 0); assert.equal((await list("sync_recovery:901:")).length, 0);
  assert.equal((await read("teacher_snapshot:901")).assessments.length, 1); // Only the cloud's active learner record.
  const noCode = deletionHelpers.planDeletedLearnerCleanup({ userId: 901, learnerId: 406, entries: [
    { id: "target", userId: 901, kind: "host_start", body: { learner_id: 406 } },
    { id: "unrelated", userId: 901, kind: "assessment_commit", body: { learner_id: 407 } },
  ], hosts: [], snapshot: failureSnapshot, now: clock });
  assert.equal(noCode.removed, 1); assert.equal(noCode.changes.some(change => change.key === "outbox:unrelated"), false);
  const reused = deletionHelpers.planDeletedLearnerCleanup({ userId: 901, learnerId: 406,
    entries: [{ id: "new-code-owner", userId: 901, kind: "record_letter", body: { code: "OLD234" } }],
    hosts: [{ code: "OLD234", teacher_id: 901, learner_id: 407 }],
    snapshot: liveSnapshot, archives: [{ key: "sync_recovery:901:legacy", value: legacy }], now: clock });
  assert.deepEqual(reused.codes, []);
  assert.equal(reused.changes.some(change => ["host_session:OLD234", "outbox:new-code-owner"].includes(change.key)), false);
  assert.equal(reused.changes.some(change => change.key === "sync_recovery:901:legacy" && change.remove), true);
  console.log("PASS record-only edits are discarded after confirmed deletion without a cached host; unrelated sessions are never captured");

  // A hanging in-flight request is bounded even after a good health check.
  const hanging = (input, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }));
  await assert.rejects(context.fetchCloudAssessment(hanging, "/api/assessment", {}, 5), /timed out/);
  console.log("PASS a stalled request times out for local fallback rather than blocking the assessment indefinitely");
  // The same LRN in another enrollment must never be captured by deletion.
  records.clear();
  await write("teacher_session",session);
  const classB="33333333-3333-4333-8333-333333333333";
  await write("teacher_snapshot:901",scopedFixture({learners:[{id:601,lrn:"000000000001",first_name:"ALPHA",last_name:"TEST",class_section_id:testClassId},{id:602,lrn:"000000000001",first_name:"BETA",last_name:"TEST",class_section_id:classB}],assessments:[{id:701,learner_id:601,assessment_period:"BoSY",is_completed:true,task1_score:4,remarks:"Original"}],activities:pool,classes:{schoolYears:[{id:testYearId,teacherId:901,startYear:2026,label:"2026-2027"}],sections:[{id:testClassId,teacherId:901,schoolYearId:testYearId,name:"Mars"},{id:classB,teacherId:901,schoolYearId:testYearId,name:"Venus"}],archives:[]}}));
  let response=await context.handleOfflineTeacherMutation("delete_learner",{body:JSON.stringify({learner_id:601,confirmation:"WRONG",deletion_reason:"Synthetic incorrect enrollment"})});
  assert.equal(response.status,400);assert.equal((await read("teacher_snapshot:901")).learners.length,2);
  response=await context.handleOfflineTeacherMutation("save_assessment_records",{body:JSON.stringify({records:[{id:701,remarks:"Attempt",task1_score:10}]})});
  assert.equal(response.status,400);assert.equal((await read("teacher_snapshot:901")).assessments[0].task1_score,4);
  response=await context.handleOfflineTeacherMutation("delete_learner",{body:JSON.stringify({learner_id:601,confirmation:"ALPHA",deletion_reason:"Synthetic incorrect enrollment"})});
  assert.equal(response.status,200);assert.deepEqual((await read("teacher_snapshot:901")).learners.map(x=>x.id),[602]);
  response=await context.handleOfflineAssessment("host_start",{body:JSON.stringify({learner_id:602,period:"MoSY",class_section_id:classB})},new URL("https://crl.test/api/assessment"));
  assert.equal(response.status,409);
  await write("outbox:other-owner",{id:"other-owner",userId:902,kind:"add_learner",body:{first_name:"OTHER"}});
  await write("outbox:keep-content",{id:"keep-content",userId:901,kind:"save_activities",body:{period:"BoSY",content:pool.BoSY}});
  await context.reconcileRosterVersion(901,1);
  assert.equal((await read("teacher_snapshot:901")).learners.length,0);
  assert.equal((await read("teacher_snapshot:901")).rosterVersion,1);
  assert.ok(await read("outbox:other-owner"));assert.ok(await read("outbox:keep-content"));assert.equal((await list("outbox:")).length,2);
  const resetSnapshot=await read("teacher_snapshot:901");
  await write("teacher_snapshot:901",{...resetSnapshot,learners:[{id:603,first_name:"NEW",class_section_id:classB}]});
  await context.reconcileRosterVersion(901,1);
  assert.equal((await read("teacher_snapshot:901")).learners[0].id,603,"The acknowledged reset cannot erase later enrollments");
  connected = true; responseStatus = 200; context.navigator.onLine = true; resetProbe();
  const staleRead = await context.window.fetch("/api/assessment?action=get_learners");
  const stalePayload = await staleRead.json();
  assert.deepEqual(stalePayload.learners.map(row => row.id), [603], "A delayed pre-reset roster response cannot revive deleted learners");
  await context.warmTeacherSnapshot(901);
  assert.equal((await read("teacher_snapshot:901")).learners[0].id,603,"Snapshot warming also rejects pre-reset learner payloads");
  console.log("PASS per-class identity isolates repeated LRNs, typed deletion/reasons are enforced, scores reject edits, offline periods require prerequisites and a roster reset removes only stale learner work once");
  records.set("teacher_snapshot:901", {user:{section:"Test"}, learners:[{id:-77,section:"Test",first_name:"SYNTHETIC"}], assessments:[],rosterVersion:0});
  await write("outbox:legacyclass", {id:"legacyclass",userId:901,kind:"add_learner",body:{section:"Test",first_name:"SYNTHETIC"}});
  await vm.runInContext(`upgradeLegacyClassWork(901,{schoolYears:[{id:"${testYearId}",startYear:2026}],sections:[{id:"${testClassId}",schoolYearId:"${testYearId}",name:"Test"}]})`,context);
  assert.equal((await read("teacher_snapshot:901")).learners[0].class_section_id,testClassId);
  assert.equal((await read("outbox:legacyclass")).body.class_section_id,testClassId);
  console.log("PASS pre-upgrade queued enrollments bind only to the uniquely matching original school year and section");
  const liveClass="abababab-abab-4bab-8bab-abababababab",deadClass="cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
  records.set("teacher_snapshot:901", {learners:[{id:701,class_section_id:deadClass},{id:702,class_section_id:liveClass}],assessments:[],classes:{schoolYears:[{id:testYearId,startYear:2026}],sections:[{id:deadClass,schoolYearId:testYearId},{id:liveClass,schoolYearId:testYearId}]}});
  await write("outbox:dead-class-add",{id:"dead-class-add",userId:901,kind:"add_learner",body:{class_section_id:deadClass}});
  await write("outbox:live-class-add",{id:"live-class-add",userId:901,kind:"add_learner",body:{class_section_id:liveClass}});
  await write("outbox:foreign-class-add",{id:"foreign-class-add",userId:902,kind:"add_learner",body:{class_section_id:deadClass}});
  await context.reconcileClassCatalog(901,{schoolYears:[{id:testYearId,startYear:2026}],sections:[{id:liveClass,schoolYearId:testYearId}],deletedSectionIds:[deadClass],deletedYearIds:[],archives:[]});
  assert.deepEqual((await read("teacher_snapshot:901")).learners.map(x=>x.id),[702]);assert.equal(await read("outbox:dead-class-add"),null);assert.ok(await read("outbox:live-class-add"));assert.ok(await read("outbox:foreign-class-add"));
  const aliasFrom="edededed-eded-4ded-8ded-edededededed",aliasTo="efefefef-efef-4fef-8fef-efefefefefef";
  await write("outbox:alias-section",{id:"alias-section",userId:901,kind:"save_class_section",body:{id:liveClass,school_year_id:aliasFrom,name:"SYNTHETIC"}});
  await context.reconcileClassCatalog(901,{schoolYears:[{id:aliasTo,startYear:2027}],sections:[],deletedSectionIds:[],deletedYearIds:[],archives:[],year_alias:{from:aliasFrom,to:aliasTo}});
  assert.equal((await read("outbox:alias-section")).body.school_year_id,aliasTo);
  console.log("PASS class tombstones discard only the deleted class's obsolete enrollment work; other classes/accounts survive and duplicate-year aliases remap queued sections");
})().catch(error => { console.error(error); process.exitCode = 1; });
