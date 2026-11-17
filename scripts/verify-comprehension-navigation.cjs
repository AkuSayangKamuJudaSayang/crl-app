"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { transform } = require("next/dist/build/swc");

const source = fs.readFileSync("app/teacher/assessment/AssessmentClient.jsx", "utf8");
function extract(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Unable to extract assessment section ${start} / ${end}`);
  return source.slice(a, b);
}

async function checkHistoryHandlers() {
  const code = extract("  const previousComprehensionItem = () => {", "  const recordComprehension =");
  const questions = Array.from({ length: 6 }, (_, i) => ({ text: `Shuffled question ${i + 1}?` }));
  const corrections = [], sessions = [], network = [], savedDrafts = [];
  let resolveNetwork;
  const heldSave = new Promise(resolve => { resolveNetwork = resolve; });
  const record = {
    code: "QA1234", stage: "comprehension",
    current_content: questions[3].text,
    comprehensionResults: [{ questionIndex: 1, isCorrect: false }],
  };
  const context = vm.createContext({
    busy: false, activeStage: "comprehension", comprehensionReviewIndex: null,
    questionIndex: 3, currentQuestions: questions,
    pendingAnswerRef: { current: false },
    code: "QA1234", session: record, latestSessionRef: { current: record },
    latestSessionVersionRef: { current: 0 }, comprehensionPersistPromiseRef: { current: Promise.resolve() },
    setComprehensionReviewIndex(next) { context.comprehensionReviewIndex = next; corrections.push(next); },
    reviewedComprehensionAnswer: null,
    setError() {},
    setSession(next) { sessions.push(next); },
    recordComprehensionResult(entry) {
      assert.equal(entry.questionIndex, 1);
      assert.equal(entry.isCorrect, true);
      return [{ ...entry }];
    },
    persistPassageDraft: async value => { savedDrafts.push(value); },
    persistAnswerWithRetry: async (action, payload) => {
      assert.equal(action, "record_comprehension");
      assert.equal(payload.question_index, 1);
      assert.equal(payload.is_correct, true);
      assert.equal(payload.persist_only, true);
      network.push(payload);
      await heldSave;
      return { saved: true };
    },
    queueAnswerForBackgroundSave: async () => { throw Error("No fallback expected for successful test"); },
    getMutations: async () => [],
    removeMutation: async () => {},
    Date,
  });
  vm.runInContext(code + [
    "",
    "globalThis.previous = previousComprehensionItem;",
    "globalThis.next = nextComprehensionItem;",
    "globalThis.correct = correctPreviousComprehensionItem;",
  ].join("\n"), context);

  context.previous();
  assert.equal(context.comprehensionReviewIndex, 2, "Previous reviews the last completed question");
  context.previous();
  assert.equal(context.comprehensionReviewIndex, 1);
  context.next();
  assert.equal(context.comprehensionReviewIndex, 2);
  context.next();
  assert.equal(context.comprehensionReviewIndex, null, "Next returns to the live question");
  context.next();
  assert.equal(context.comprehensionReviewIndex, null, "Next cannot skip an unanswered live question");
  context.previous(); context.previous();
  context.reviewedComprehensionAnswer = { questionIndex: 1, isCorrect: false };
  context.correct(true);
  assert.equal(context.comprehensionReviewIndex, 2, "Correction advances to the next review question");
  assert.equal(context.pendingAnswerRef.current, false, "Network saving cannot lock future navigation");
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].current_content, questions[3].text,
    "Correcting history must never rewind the learner's current question");
  assert.equal(sessions[0].comprehensionResults[0].isCorrect, true);
  assert.equal(savedDrafts.length, 1, "Correction writes the passage recovery draft");
  assert.equal(savedDrafts[0].comprehension[0].questionIndex, 1);
  assert.equal(network.length, 1, "Correction submits exactly the configured question index");
  resolveNetwork();
  await context.comprehensionPersistPromiseRef.current;
  assert.equal(context.latestSessionRef.current.stage, "comprehension");
  assert.equal(context.questionIndex, 3, "Question progress must not be changed by history review");

  context.comprehensionReviewIndex = 0;
  context.previous();
  assert.equal(context.comprehensionReviewIndex, 0, "Previous cannot go before question 1");
  context.activeStage = "learner_experience";
  context.next();
  assert.equal(context.comprehensionReviewIndex, 0,
    "Review navigation is inert outside comprehension");
}

async function checkSerializedQuestionCorrections() {
  const writer = extract("const part1AnswerWriteChains = new Map();",
    "/*\n * How long Start Reading");
  const sandbox = vm.createContext({});
  vm.runInContext(writer + "\nglobalThis.serialize = serializePart1AnswerWrite;", sandbox);
  let release;
  const suspended = new Promise(resolve => { release = resolve; });
  const events = [];
  const first = sandbox.serialize("record_comprehension",
    { code: "QA1234", question_index: 1 },
    async () => { events.push("old-start"); await suspended; events.push("old-end"); });
  const second = sandbox.serialize("record_comprehension",
    { code: "QA1234", question_index: 1 },
    async () => { events.push("new-save"); });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(events, ["old-start"], "A corrected mark waits for the older write");
  release();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["old-start", "old-end", "new-save"],
    "The latest Correct/Incorrect mark wins if server writes overlap");
}

async function checkButtons() {
  const from = '                {activeStage ===\n                  "comprehension" && (';
  const to = '                {activeStage ===\n                  "completed" && (';
  const body = extract(from, to);
  const keys = [
    "activeStage", "displayComprehensionIndex", "displayComprehensionQuestion",
    "comprehensionReviewIndex", "reviewedComprehensionAnswer", "currentQuestions",
    "questionIndex", "busy", "pendingAnswerRef", "styles",
    "previousComprehensionItem", "nextComprehensionItem", "answerRestraintPending",
    "answerLockKey", "recordComprehension", "correctPreviousComprehensionItem",
    "getPossibleStoryAnswer",
  ];
  const js = 'module.exports = function(p) { const { ' + keys.join(",") +
    ' } = p; return <>' + body + '</>; }';
  const compiled = await transform(js, {
    filename: "ComprehensionReviewRegression.jsx",
    jsc: { parser: { syntax: "ecmascript", jsx: true },
      transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  });
  const module = { exports: {} };
  vm.runInNewContext(compiled.code, { module, exports: module.exports, require });
  const props = {
    activeStage: "comprehension", displayComprehensionIndex: 1,
    displayComprehensionQuestion: { text: "Which animal visited the river?", possibleAnswer: "The bird." },
    comprehensionReviewIndex: 1,
    reviewedComprehensionAnswer: { questionIndex: 1, isCorrect: true },
    currentQuestions: Array.from({length:6}, (_, i) => ({text:`Question ${i+1}?`})),
    questionIndex: 3, busy: false, pendingAnswerRef: {current:false},
    styles: {}, previousComprehensionItem(){}, nextComprehensionItem(){},
    answerRestraintPending: true, answerLockKey: "comprehension:3",
    recordComprehension(){}, correctPreviousComprehensionItem(){},
    getPossibleStoryAnswer: () => "",
  };
  const html = renderToStaticMarkup(React.createElement(module.exports, props));
  assert(html.includes('aria-label="Comprehension question history"'));
  assert(html.includes('Previous item') && html.includes('Next item'));
  assert(html.includes("Question 2 of") && html.includes("Which animal visited the river?"));
  assert(/<button[^>]*disabled=""[^>]*>Correct<\/button>/.test(html),
    "The already-marked correct choice must be locked during review");
  assert(/<button[^>]*>Incorrect<\/button>/.test(html),
    "The opposite choice must stay enabled for correction");
  const reversed = renderToStaticMarkup(React.createElement(module.exports, {
    ...props, reviewedComprehensionAnswer: { questionIndex: 1, isCorrect: false },
  }));
  assert(/<button[^>]*disabled=""[^>]*>Incorrect<\/button>/.test(reversed),
    "The already-marked incorrect choice must be locked during review");
  const live = renderToStaticMarkup(React.createElement(module.exports, {
    ...props, comprehensionReviewIndex:null, displayComprehensionIndex:3,
    displayComprehensionQuestion:{text:"Live question four"},
  }));
  assert(live.includes("Live question four"));
  assert(/<button[^>]*disabled=""[^>]*>Next item<\/button>/.test(live),
    "Next cannot advance an unanswered live question");
}

function checkConfirmationSavingAndScrolling() {
  const ratingButtons = extract('{EXPERIENCE_RATING_CHOICES.map(', '{savingExperienceRating && (');
  assert(ratingButtons.includes("setPendingExperienceRating(rating)"),
    "Selecting a face must open confirmation instead of submitting directly");
  assert(!ratingButtons.includes("saveLearnerExperienceRating(rating)"),
    "An accidental face press must never persist a rating");
  assert(source.includes('aria-labelledby="experience-rating-confirm-title"'));
  assert(source.includes('>Cancel</button>') && source.includes('>Confirm</button>'));
  assert(source.includes('void saveLearnerExperienceRating(confirmed)'),
    "Only Confirm submits the rating");
  assert(source.includes('data-crl-assessment-save-progress'),
    "Final save must display a persistent progress notice");
  assert(source.includes('Saving {String(period || "BoSY").toUpperCase()} assessment…'),
    "Progress notice must name the actual BOSY/MOSY/EOSY period");
  assert(source.includes('savingTerminationObservation && ('),
    "Progress notice must only exist while the final result is being saved");
  assert(source.includes('html.crlAssessmentSingleScroll') &&
    source.includes('body.crlAssessmentSingleScroll'));
  assert(source.includes('document.documentElement.classList.remove("crlAssessmentSingleScroll")'),
    "The one-scrollbar rule must clean up on leaving the assessment");
  assert(source.includes('overflow-y: visible !important;') &&
    source.includes('overflow-y: auto !important;'));
}

(async () => {
  await checkHistoryHandlers();
  await checkSerializedQuestionCorrections();
  await checkButtons();
  checkConfirmationSavingAndScrolling();
  console.log("PASS comprehension Previous/Next and reversible Correct/Incorrect, ordered save, review-only learner view, rating confirmation, period-specific saving notice, single viewport scrollbar");
})().catch(error => { console.error(error); process.exitCode = 1; });
