const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  const content = await import("../lib/assessmentContent.js");
  const records = new Map();
  const copy = (value) => value == null ? value : structuredClone(value);
  let sequence = 0;
  let clock = Date.now();
  class TestDate extends Date {
    constructor(value) { super(value === undefined ? clock : value); }
    static now() { return clock; }
  }
  const read = async (key) => copy(records.get(key) ?? null);
  const write = async (key, value) => records.set(key, copy(value));
  const list = async (prefix = "") => [...records].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value: copy(value) }));
  const session = { user: { id: 901, role: "teacher" }, offlineToken: "test-only-token", expiresAt: clock + 86400000, signedOut: false };
  await write("teacher_session", session);
  await write("teacher_snapshot:901", { learners: [{ id: 406, first_name: "Test", last_name: "Learner" }], assessments: [] });
  const context = vm.createContext({
    ...content, Response, Headers, URL, AbortController, TextEncoder,
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
  const source = fs.readFileSync("app/components/OfflineRuntime.jsx", "utf8")
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, "")
    .replace("export default function OfflineRuntime", "function OfflineRuntime");
  vm.runInContext(source, context);
  const handle = vm.runInContext("handleOfflineAssessment", context);
  const serialize = vm.runInContext("serializeOfflineMutation", context);
  const call = async (action, body = {}, code = "") => {
    const response = await serialize(() => handle(action, { method: "POST", body: JSON.stringify({ ...body, code }) }, new URL(`https://crl.test/api/assessment?action=${action}&code=${code}`)));
    const data = await response.json();
    assert.ok(response.ok, `${action}: ${JSON.stringify(data)}`);
    return data;
  };
  const start = async () => (await call("host_start", { learner_id: 406, period: "BoSY" })).code;
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
  for (let index = 3; index < 10; index++) await call("record_letter", { letter_index: index, is_correct: true }, code);
  assert.equal((await read(`host_session:${code}`)).stage, "word");
  for (let index = 0; index < 3; index++) await call("record_word", { word_index: index, is_correct: true }, code);
  await call("record_word", { word_index: 0, is_correct: true }, code);
  assert.equal((await read(`host_session:${code}`)).current_content, initial.assessment_content.words[3], "retried word must not rewind the stimulus");
  for (let index = 3; index < 10; index++) await call("record_word", { word_index: index, is_correct: true }, code);
  assert.equal((await read(`host_session:${code}`)).stage, "story_choice");
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

  const zeroCode = await start();
  await call("learner_join", {}, zeroCode);
  for (let index = 0; index < 10; index++) await call("record_letter", { letter_index: index, is_correct: false }, zeroCode);
  await call("save_final_assessment_review", {}, zeroCode);
  const zero = (await read("teacher_snapshot:901")).assessments.find((row) => row.offline_session_code === zeroCode);
  assert.equal(zero.words_read, 0);
  assert.equal(zero.timer_seconds, null);
  assert.equal(zero.task1_results.length, 10);
  console.log("PASS zero-score early termination records every answer and no passage words");

  const lowCode = await start();
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
})().catch((error) => { console.error(error); process.exitCode = 1; });
