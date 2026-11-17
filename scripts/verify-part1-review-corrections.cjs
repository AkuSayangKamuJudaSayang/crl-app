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

/*
 * Reproduce the production crash, not merely an isolated click handler.
 * The old implementation read part1ResultsDraftRef during an active review
 * render before its useRef() declaration. The initial live render passed,
 * then Previous/Next switched activeReview on and raised ReferenceError.
 *
 * Evaluate the REAL source statements in their original component order;
 * a future accidental reorder reintroduces the same temporal dead zone and
 * fails this regression test before production deployment.
 */
function verifyReviewRenderInitializationOrder() {
  const reviewDeclarations = extract("  const activeReview = part1Review &&", "  const passageText =");
  const journalAndAnswer = extract(
    "  const part1ResultsDraftRef = useRef({",
    "  /*\n   * Comprehension journal"
  );
  assert(source.indexOf("const part1ResultsDraftRef = useRef({") <
    source.indexOf("const reviewedAnswer = activeReview"),
    "The local Part 1 answer journal must be initialized before review mode reads it");

  const executable = `
    (() => {
      const { code, activeStage, part1Review, letterIndex, wordIndex,
              LETTERS, WORDS, latestSessionRef, session, initialRecovery } = input;
      const useRef = value => ({ current: value });
      ${reviewDeclarations}
      ${journalAndAnswer}
      return {
        stage: displayPart1Stage,
        index: displayPart1Index,
        selected: reviewedAnswer?.isCorrect ?? null,
        value: reviewEntries[displayPart1Index] ?? null,
        journalCode: part1ResultsDraftRef.current.code,
      };
    })()`;

  const letters = ["Z", "Y", "M", "P", "B", "L", "G", "T", "K", "A"];
  // Intentionally shuffled to verify item identity is by configured index,
  // never by the default/alphabetical order or a display-only re-sort.
  const words = ["quilt", "river", "bear", "home"];
  const tests = [
    {
      name: "First Previous into a marked letter",
      stage: "letter", review: { stage: "letter", index: 2 },
      letterIndex: 3, wordIndex: 0, field: "task1Results", index: 2,
      saved: false, server: true, expectedStage: "letter", item: "M",
    },
    {
      name: "Next through previously marked letter",
      stage: "letter", review: { stage: "letter", index: 1 },
      letterIndex: 3, wordIndex: 0, field: "task1Results", index: 1,
      saved: true, server: false, expectedStage: "letter", item: "Y",
    },
    {
      name: "Previous into randomly arranged word",
      stage: "word", review: { stage: "word", index: 1 },
      letterIndex: 10, wordIndex: 3, field: "task2Results", index: 1,
      saved: true, server: false, expectedStage: "word", item: "river",
    },
    {
      name: "Next through randomly arranged word",
      stage: "word", review: { stage: "word", index: 2 },
      letterIndex: 10, wordIndex: 3, field: "task2Results", index: 2,
      saved: false, server: true, expectedStage: "word", item: "bear",
    },
    {
      name: "Previous across word-to-letter boundary",
      stage: "word", review: { stage: "letter", index: 9 },
      letterIndex: 10, wordIndex: 2, field: "task1Results", index: 9,
      saved: true, server: false, expectedStage: "letter", item: "A",
    },
  ];

  for (const example of tests) {
    const record = { index: example.index, content: example.item,
      isCorrect: example.saved };
    const serverRecord = { ...record, isCorrect: example.server };
    const input = {
      code: "QA1234", activeStage: example.stage,
      part1Review: example.review, letterIndex: example.letterIndex,
      wordIndex: example.wordIndex, LETTERS: letters, WORDS: words,
      initialRecovery: { session: {
        task1Results: example.field === "task1Results" ? [record] : [],
        task2Results: example.field === "task2Results" ? [record] : [],
      } },
      latestSessionRef: { current: { [example.field]: [serverRecord] } },
      session: { [example.field]: [serverRecord] },
    };
    let result;
    try {
      result = vm.runInNewContext(executable, { input });
    } catch (error) {
      throw new Error(`${example.name} must render without a temporal-dead-zone crash: ${error.message}`);
    }
    assert.equal(result.stage, example.expectedStage, example.name);
    assert.equal(result.index, example.index, example.name);
    assert.equal(result.value, example.item, example.name);
    assert.equal(result.selected, example.saved,
      `${example.name}: the most recent local mark controls the button state`);
    assert.equal(result.journalCode, input.code);
  }

  const noReviewInput = {
    code: "QA1234", activeStage: "letter", part1Review: null,
    letterIndex: 0, wordIndex: 0, LETTERS: letters, WORDS: words,
    initialRecovery: null, latestSessionRef: { current: null }, session: null,
  };
  const noReview = vm.runInNewContext(executable, { input: noReviewInput });
  assert.equal(noReview.selected, null);
  assert.equal(noReview.index, 0);
  assert.equal(noReview.value, "Z");
}

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
  verifyReviewRenderInitializationOrder();
  await verifySerializedCorrections();
  await verifyPreviousItem({ oldValue: false, newValue: true });
  await verifyPreviousItem({ oldValue: true, newValue: false });
  console.log("PASS full review-render initialization (Previous/Next/letter/word/boundary/random order), reviewed Part 1 answer reversal, configured random order, immediate forward navigation, serialized saves, blue controls, dark mode, and single page scroll");
})().catch(error => { console.error(error); process.exitCode = 1; });
