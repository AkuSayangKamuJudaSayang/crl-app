const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  const content = await import("../lib/assessmentContent.js");
  const customStories = await import("../lib/storyComprehension.mjs");
  const records = new Map();
  const copy = (value) => value == null ? value : structuredClone(value);
  let sequence = 0;
  let clock = Date.now();
  class TestDate extends Date {
    constructor(value) { super(value === undefined ? clock : value); }
    static now() { return clock; }
  }
  const read = async (key) => copy(records.get(key) ?? null);
  const testClassId="11111111-1111-4111-8111-111111111111";
  const testYearId="22222222-2222-4222-8222-222222222222";
  const scopedFixture=value=>({...value,classes:value.classes||{schoolYears:[{id:testYearId,teacherId:901,startYear:2026,label:"2026-2027"}],sections:[{id:testClassId,teacherId:901,schoolYearId:testYearId,name:"Test"}],archives:[]},learners:(value.learners||[]).map(item=>({...item,class_section_id:item.class_section_id||testClassId}))});
  const write = async (key, value) => records.set(key, copy(key.startsWith("teacher_snapshot:") ? scopedFixture(value) : value));
  const list = async (prefix = "") => [...records].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value: copy(value) }));
  const session = { user: { id: 901, role: "teacher" }, offlineToken: "test-only-token", expiresAt: clock + 86400000, signedOut: false };
  await write("teacher_session", session);
  await write("teacher_snapshot:901", { learners: [406, 407, 408].map(id => ({ id, first_name: `Test${id}`, last_name: "Learner" })), assessments: [] });
  const customPool = content.cloneAssessmentContent();
  const teacherQuestions = Array.from({ length: 6 }, (_, index) => ({ text: `Offline teacher question ${index + 1}?`, possibleAnswer: `Offline supported answer ${index + 1}.` }));
  customPool.BoSY.stories[0].questions = teacherQuestions;
  const initialSnapshot = await read("teacher_snapshot:901");
  await write("teacher_snapshot:901", { ...initialSnapshot, activities: customPool });
  const context = vm.createContext({
    ...content, ...customStories, Response, Headers, URL, AbortController, TextEncoder,
    Date: TestDate, console, crypto: require("node:crypto").webcrypto,
    navigator: { onLine: false },
    window: { location: { origin: "https://crl.test" }, dispatchEvent() {}, setTimeout },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    setTimeout, clearTimeout,
    getOfflineTeacherSession: () => read("teacher_session"),
    getOfflineTeacherSnapshot: (id) => read(`teacher_snapshot:${id}`),
    saveOfflineTeacherSnapshot: (id, value) => write(`teacher_snapshot:${id}`, value),
    getOfflineHostSession: (code) => read(`host_session:${code}`),
    saveOfflineHostSession: (code, value) => write(`host_session:${code}`, value),
    saveOfflineTeacherSession: (value) => write("teacher_session", value),
    offlineList: list, offlineSet: write,
    enqueueOfflineMutation: async (value) => {
      const id = `test-${++sequence}`;
      await write(`outbox:${id}`, { ...value, id, createdAt: clock });
    },
    getOfflineOutbox: async () => (await list("outbox:")).map(({ value }) => value),
    removeOfflineMutation: (id) => records.delete(`outbox:${id}`),
  });
  Object.assign(context, await import("../lib/classWorkspace.mjs"));
  const source = fs.readFileSync("app/components/OfflineRuntime.jsx", "utf8")
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, "")
    .replace("export default function OfflineRuntime", "function OfflineRuntime");
  vm.runInContext(source, context);
  const handle = vm.runInContext("handleOfflineAssessment", context);
  const serialize = vm.runInContext("serializeOfflineMutation", context);
  // Execute the production fetch-routing branch with Wi-Fi reported online.
  // Explicit Offline Mode must not fall through to a cloud-created session.
  context.getSnapshot = () => read("teacher_snapshot:901");
  context.syncOutbox = async () => {};
  const routingStart = source.indexOf("      const offlineSessionActive = isActiveOfflineSession(tokenSession);");
  const routingEnd = source.indexOf("      // Only sessions that were created offline", routingStart);
  assert.ok(routingStart > 0 && routingEnd > routingStart);
  const route = vm.runInContext(`(async (tokenSession, body) => {
    const isAssessmentRequest = true, action = "host_start";
    const init = { method: "POST", body: JSON.stringify(body) };
    const url = new URL("https://crl.test/api/assessment?action=host_start");
    ${source.slice(routingStart, routingEnd)}
    return "cloud";
  })`, context);
  context.navigator.onLine = true;
  const localStart = await route(session, { learner_id: 406, period: "BoSY", connection_mode: "offline" });
  const localStartData = await localStart.json();
  assert.equal((await read(`host_session:${localStartData.code}`)).offline_created, true);
  assert.equal(await route(session, { learner_id: 406, period: "BoSY", connection_mode: "online" }), "cloud");
  const unprepared = await route(null, { learner_id: 406, period: "BoSY", connection_mode: "offline" });
  assert.equal(unprepared.status, 401);
  context.navigator.onLine = false;
  // Keep the subsequent full-flow assertions independent of this routing case.
  for (const key of [...records.keys()]) if (key.startsWith("host_session:") || key.startsWith("outbox:")) records.delete(key);
  console.log("PASS explicit Offline Mode stays local even with Wi-Fi online; Online Mode keeps its cloud path; unprepared devices are rejected clearly");
  const call = async (action, body = {}, code = "") => {
    const response = await serialize(() => handle(action, { method: "POST", body: JSON.stringify({ ...body, code }) }, new URL(`https://crl.test/api/assessment?action=${action}&code=${code}`)));
    const data = await response.json();
    assert.ok(response.ok, `${action}: ${JSON.stringify(data)}`);
    return data;
  };
  const start = async (learnerId = 406, period = "BoSY") => (await call("host_start", { learner_id: learnerId, period })).code;
  const code = await start();
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal((await read(`host_session:${code}`)).stage, "waiting");
  await call("learner_join", {}, code);
  const initial = await read(`host_session:${code}`);
  for (let index = 0; index < 3; index++) await call("record_letter", { letter_index: index, is_correct: true }, code);
  await call("record_letter", { letter_index: 0, is_correct: true }, code);
  assert.equal((await read(`host_session:${code}`)).current_content, initial.assessment_content.letters[3], "retried letter must not rewind the stimulus");
  const stale = await call("host_advance", { stage: "letter", currentContent: initial.assessment_content.letters[1], expected_stage: "letter", expected_current_content: initial.assessment_content.letters[0] }, code);
  assert.equal(stale.stale, true);
  assert.equal((await read(`host_session:${code}`)).current_content, initial.assessment_content.letters[3]);
  for (let index = 3; index < 9; index++) await call("record_letter", { letter_index: index, is_correct: true }, code);
  await call("host_advance", { stage: "letter", currentContent: initial.assessment_content.letters[9], item_index: 9, expected_stage: "letter", expected_current_content: initial.assessment_content.letters[9] }, code);
  await call("record_letter", { letter_index: 9, is_correct: true }, code);
  assert.equal((await read(`host_session:${code}`)).item_index, 0, "the first word must not inherit the last letter's index");
  assert.equal((await read(`host_session:${code}`)).itemIndex, 0);
  assert.equal((await read(`host_session:${code}`)).stage, "word");
  const legacy = await read(`host_session:${code}`);
  const pendingBeforeRead = (await list("outbox:")).length;
  await write(`host_session:${code}`, { ...legacy, item_index: 9, itemIndex: 9 });
  const repaired = await call("host_get", {}, code);
  assert.equal(repaired.session.item_index, 0);
  assert.equal(repaired.session.itemIndex, 0);
  assert.deepEqual(repaired.session.task1Results, legacy.task1Results);
  assert.equal((await list("outbox:")).length, pendingBeforeRead, "Derived read repair must not queue answers or reset scores");
  await call("record_word", { word_index: 0, is_correct: true }, code);
  await call("record_letter", { letter_index: 9, is_correct: true, persist_only: true }, code);
  assert.equal((await read(`host_session:${code}`)).item_index, 1, "A late letter save must preserve the current word position");
  const unique = { stage: "word", current_content: "read", item_index: 9, itemIndex: 9, assessment_content: { words: ["read", "write"] } };
  assert.equal(content.normalizeAssessmentItemPosition(unique).item_index, 0);
  for (const unknown of [ { ...unique, assessment_content: undefined }, { ...unique, current_content: "unknown" }, { ...unique, assessment_content: { words: ["read", "read"] } } ]) assert.equal(content.normalizeAssessmentItemPosition(unknown), unknown);
  const repeated = { ...unique, item_index: 1, itemIndex: 1, assessment_content: { words: ["read", "read"] } };
  assert.equal(content.normalizeAssessmentItemPosition(repeated), repeated, "Valid repeated content retains its explicitly stated position");
  console.log("PASS stage boundary resets both position aliases; legacy offline snapshots heal without rewriting answers; delayed saves, unknown content and repeated items retain their guards");
  for (let index = 0; index < 3; index++) await call("record_word", { word_index: index, is_correct: true }, code);
  await call("record_word", { word_index: 0, is_correct: true }, code);
  assert.equal((await read(`host_session:${code}`)).current_content, initial.assessment_content.words[3], "retried word must not rewind the stimulus");
  for (let index = 3; index < 10; index++) await call("record_word", { word_index: index, is_correct: true }, code);
  assert.equal((await read(`host_session:${code}`)).stage, "story_choice");
  assert.equal((await read(`host_session:${code}`)).item_index, 0);
  await call("record_letter", { letter_index: 0, is_correct: true, persist_only: true }, code);
  assert.equal((await read(`host_session:${code}`)).stage, "story_choice", "background letter persistence must preserve later stages");
  console.log("PASS all 20 task answers persist; repeated and background answers cannot rewind progress");

  await call("select_story", { story_id: 1 }, code);
  const started = await call("passage_ready", {}, code);
  clock += 5000;
  await call("passage_timer", { mode: "pause" }, code);
  const paused = await read(`host_session:${code}`);
  await call("passage_ready", {}, code);
  assert.equal((await read(`host_session:${code}`)).passage_started_at, started.passage_started_at);
  assert.equal((await read(`host_session:${code}`)).passage_paused_at, paused.passage_paused_at, "repeated start must preserve the paused timer");
  await call("passage_timer", { mode: "resume" }, code);
  clock += 60000;
  await call("record_passage_miscue", { word_index: 2, miscue_type: "Insertion" }, code);
  await call("finish_passage", { words_read: 100 }, code);
  assert.equal((await read(`host_session:${code}`)).stage, "comprehension");
  assert.equal((await read(`host_session:${code}`)).current_content, teacherQuestions[0].text);
  for (let index = 0; index < 3; index++) await call("record_comprehension", { question_index: index, is_correct: true }, code);
  const thirdQuestion = (await read(`host_session:${code}`)).current_content;
  await call("record_comprehension", { question_index: 0, is_correct: true }, code);
  assert.equal((await read(`host_session:${code}`)).current_content, thirdQuestion);
  for (let index = 3; index < 6; index++) await call("record_comprehension", { question_index: index, is_correct: index < 4 }, code);
  await call("save_experience_rating", { experience_rating: 5 }, code);
  const lateQuestion = await call("host_update", { stage: "comprehension", currentContent: thirdQuestion, expected_stage: "comprehension", expected_current_content: thirdQuestion }, code);
  assert.equal(lateQuestion.stale, true);
  assert.equal((await read(`host_session:${code}`)).stage, "teacher_review");
  const result = await call("save_final_assessment_review", {}, code);
  const saved = (await read("teacher_snapshot:901")).assessments.find((row) => row.offline_session_code === code);
  assert.equal(result.completed, true);
  assert.equal(saved.task1_results.length, 10);
  assert.equal(saved.task2_results.length, 10);
  assert.equal(saved.comprehension_results.length, 6);
  assert.deepEqual(saved.story_questions, teacherQuestions);
  assert.equal(saved.comprehension_results[5].content, teacherQuestions[5].text);
  assert.equal(saved.task1_score, 10);
  assert.equal(saved.task2_score, 10);
  assert.equal(saved.comprehension_score, 4);
  assert.equal(saved.experience_rating, 5);
  assert.equal(saved.total_miscues, 1);
  assert.equal(saved.words_read, 99);
  assert.ok(saved.offline_pending);
  const queued = (await list("outbox:")).map(({ value }) => value);
  assert.equal(queued[0].kind, "host_start");
  assert.equal(queued.at(-1).kind, "save_final_assessment_review");
  assert.ok(queued.every((entry) => entry.body.code === code || entry.body.offline_code === code));
  console.log("PASS passage timer, miscue, comprehension, experience and final record remain consistent in the offline outbox");

  const zeroCode = await start(407);
  await call("learner_join", {}, zeroCode);
  for (let index = 0; index < 10; index++) await call("record_letter", { letter_index: index, is_correct: false }, zeroCode);
  await call("save_final_assessment_review", {}, zeroCode);
  const zero = (await read("teacher_snapshot:901")).assessments.find((row) => row.offline_session_code === zeroCode);
  assert.equal(zero.words_read, 0);
  assert.equal(zero.timer_seconds, null);
  assert.equal(zero.task1_results.length, 10);
  console.log("PASS zero-score early termination records every answer and no passage words");

  const lowCode = await start(408);
  await call("learner_join", {}, lowCode);
  for (let index = 0; index < 10; index++) await call("record_letter", { letter_index: index, is_correct: index < 5 }, lowCode);
  for (let index = 0; index < 10; index++) await call("record_word", { word_index: index, is_correct: false }, lowCode);
  await call("save_final_assessment_review", {}, lowCode);
  const low = (await read("teacher_snapshot:901")).assessments.find((row) => row.offline_session_code === lowCode);
  assert.equal(low.task1_score, 5);
  assert.equal(low.task2_score, 0);
  assert.equal(low.task2_results.length, 10);
  assert.equal(low.words_read, 0);
  assert.equal(low.timer_seconds, null);
  console.log("PASS low Part 1 total saves all ten word results without inventing passage metrics");
  const all = (await read("teacher_snapshot:901")).assessments;
  assert.equal(new Set([code, zeroCode, lowCode]).size, 3);
  assert.deepEqual(all.map(row => row.learner_id).sort(), [406, 407, 408]);
  assert.deepEqual(all.find(row => row.learner_id === 406), saved, "Later learners must not overwrite the first learner's result");
  assert.equal(zero.learner_id, 407);
  assert.equal(low.learner_id, 408);
  const hosts = [code, zeroCode, lowCode];
  for (const entry of (await list("outbox:")).map(row => row.value)) {
    const runCode = entry.body.code || entry.body.offline_code;
    assert.ok(hosts.includes(runCode));
    if (entry.kind === "host_start") assert.equal(entry.body.learner_id, [406, 407, 408][hosts.indexOf(runCode)]);
  }
  console.log("PASS three different learners retain separate session codes, answers, results and correctly attributed sync entries");

  const timedCode = await start(406,"MoSY");
  await call("learner_join", {}, timedCode);
  for (let index = 0; index < 10; index++) await call("record_letter", { letter_index: index, is_correct: true }, timedCode);
  for (let index = 0; index < 10; index++) await call("record_word", { word_index: index, is_correct: true }, timedCode);
  await call("select_story", { story_id: 1 }, timedCode);
  await call("passage_ready", {}, timedCode);
  clock += 120000;
  const timed = await call("finish_passage", { words_read: 28, passage_miscues: [{ wordIndex: 2, miscueType: "Insertion" }] }, timedCode);
  const timedHost = await read(`host_session:${timedCode}`);
  assert.equal(timed.stage, "comprehension");
  assert.equal(timed.scoring.timerSeconds, 120);
  assert.equal(timed.scoring.wordsRead, 27);
  assert.equal(timedHost.passageMiscues.filter(item => item.miscueType === "Omission").length, 72);
  assert.equal(timedHost.current_content, timed.current_content);
  assert.ok((await list("outbox:")).some(({value}) => value.kind === "finish_passage" && value.body.code === timedCode && value.body.words_read === 28));
  console.log("PASS two-minute offline confirmation opens comprehension, scores only reached words and journals the chosen count for sync");
})().catch((error) => { console.error(error); process.exitCode = 1; });
