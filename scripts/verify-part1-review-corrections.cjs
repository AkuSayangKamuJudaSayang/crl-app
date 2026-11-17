"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("app/teacher/assessment/AssessmentClient.jsx", "utf8");
const extract = (start, end) => {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert(first >= 0 && last > first, `Missing assessment source between ${start} and ${end}`);
  return source.slice(first, last);
};

async function verifySerializedCorrections() {
  const code = extract("const part1AnswerWriteChains = new Map();",
    "/*\n * How long Start Reading");
  const context = vm.createContext({});
  vm.runInContext(code + "\nglobalThis.serialize = serializePart1AnswerWrite;", context);
  let release;
  const order = [];
  const blocked = new Promise(resolve => { release = resolve; });
  const first = context.serialize("record_word", { code: "QA1234", word_index: 1 },
    async () => { order.push("incorrect-start"); await blocked; order.push("incorrect-end"); });
  const corrected = context.serialize("record_word", { code: "QA1234", word_index: 1 },
    async () => { order.push("correct-start"); });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ["incorrect-start"],
    "A later correction must wait for the preceding save of the same item");
  release();
  await Promise.all([first, corrected]);
  assert.deepEqual(order, ["incorrect-start", "incorrect-end", "correct-start"]);
  const separate = await context.serialize("record_word", { code: "QA1234", word_index: 2 },
    async () => "unrelated");
  assert.equal(separate, "unrelated");
}

function verifyPreviousItem({ oldValue, newValue }) {
  const code = extract("  const previousPart1Item = () => {", "\n  const recordLetter =");
  const shuffledWords = ["tree", "helmet", "star", "jump", "basket"];
  const record = { code: "QA1234", stage: "word", task2Results: [
    { index: 1, content: shuffledWords[1], isCorrect: oldValue }
  ] };
  const changes = [];
  const published = [];
  let resolveSave;
  const saving = new Promise(resolve => { resolveSave = resolve; });
  const context = vm.createContext({
    busy: false,
    pendingAnswerRef: { current: false },
    activeReview: { stage: "word", index: 1 },
    activeStage: "word",
    letterIndex: 10,
    wordIndex: 4,
    LETTERS: ["M", "S"],
    WORDS: shuffledWords,
    reviewedAnswer: record.task2Results[0],
    reviewStage: "word",
    reviewEntries: shuffledWords,
    latestSessionRef: { current: record },
    latestSessionVersionRef: { current: 0 },
    code: "QA1234",
    setPart1Review: value => changes.push(value),
    setError: () => {},
    setSession: value => published.push(value),
    recordPart1Result: (session, field, change) => {
      assert.equal(field, "task2Results");
      assert.equal(change.index, 1);
      assert.equal(change.content, "helmet", "Random order must be preserved");
      assert.equal(change.isCorrect, newValue);
      return { ...session, [field]: [{ ...change }] };
    },
    persistAnswerWithRetry: async (action, payload) => {
      assert.equal(action, "record_word");
      assert.equal(payload.word_index, 1);
      assert.equal(payload.word, "helmet");
      assert.equal(payload.is_correct, newValue);
      await saving;
      return { saved: true };
    },
    getMutations: async () => [],
    removeMutation: async () => {},
    queueAnswerForBackgroundSave: async () => {},
    Date
  });
  vm.runInContext(code + "\nglobalThis.correct = correctPreviousPart1Item;", context);
  const started = context.correct(newValue);
  assert.equal(published.length, 1, "Corrected response must update the local session immediately");
  assert.equal(published[0].task2Results[0].isCorrect, newValue);
  assert.equal(changes.length, 1, "The review cursor must advance immediately");
  assert.equal(changes[0].index, 2, "After correction, the teacher sees the next review item");
  assert.equal(context.pendingAnswerRef.current, false, "Network save must not lock navigation");
  resolveSave();
  return started;
}

(async () => {
  assert(source.includes("const next = recordPart1Result(latestSessionRef.current, field,"),
    "Previous-item corrections must use the durable Part 1 journal");
  assert(source.includes('background:"#2563eb"'),
    "Previous/Next button base state must be blue");
  assert(source.includes("overflow-x: clip;"), "Assessment page must not create nested vertical scrolling");
  assert(source.includes('html[data-crl-theme="dark"] .teacherAssessmentPage'),
    "Dark palette must follow the teacher's live theme");
  await verifySerializedCorrections();
  await verifyPreviousItem({ oldValue: false, newValue: true });
  await verifyPreviousItem({ oldValue: true, newValue: false });
  console.log("PASS reviewed Part 1 answer reversal, configured random order, immediate forward navigation, serialized saves, blue controls, dark mode, and single page scroll");
})().catch(error => { console.error(error); process.exitCode = 1; });
