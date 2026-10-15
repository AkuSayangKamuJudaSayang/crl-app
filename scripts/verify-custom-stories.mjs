import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { CUSTOM_ASSESSMENT_STORIES } from "../lib/customAssessmentStories.mjs";
import { getPossibleStoryAnswer } from "../lib/storyAnswerGuides.mjs";
import * as guides from "../lib/storyComprehension.mjs";
import * as content from "../lib/assessmentContent.js";

const { getStoryQuestions, getStoryQuestionIssues, getSessionStoryQuestions, learnerSessionContent } = guides;
const defaults = content.cloneAssessmentContent();
for (const period of content.ASSESSMENT_PERIODS) {
  const pool = defaults[period];
  assert.equal(pool.stories.length, 2);
  assert.deepEqual(content.getAssessmentContentIssues(pool), []);
  for (const story of pool.stories) {
    assert.equal(story.text.trim().split(/\s+/).length, 100, story.title);
    assert.equal(story.questions.length, 6);
    for (const question of story.questions) assert.ok(getPossibleStoryAnswer(question.text));
  }
}
assert.equal(CUSTOM_ASSESSMENT_STORIES.length, 4);
assert.equal(new Set(CUSTOM_ASSESSMENT_STORIES.map(story => story.title)).size, 4);
const custom = {
  id: 101, title: "Teacher's own new story", text: defaults.MoSY.stories[0].text,
  questions: Array.from({ length: 6 }, (_, index) => ({ text: `Teacher question ${index + 1}?`, possibleAnswer: `Supported answer ${index + 1}.` })),
};
assert.deepEqual(getStoryQuestionIssues(custom, { requireAnswers: true }), []);
for (const length of [0, 5, 7]) assert.ok(getStoryQuestionIssues({ ...custom, questions: Array.from({ length }, () => custom.questions[0]) }, { requireAnswers: true }).length);
for (const field of ["text", "possibleAnswer"]) {
  const questions = structuredClone(custom.questions); questions[3][field] = "  ";
  assert.ok(getStoryQuestionIssues({ ...custom, questions }, { requireAnswers: true }).length);
}
assert.ok(getStoryQuestionIssues({ ...custom, questions: custom.questions.map(item => ({ ...item, text: "a".repeat(501) })) }).length);
const source = fs.readFileSync("app/api/assessment/route.js", "utf8");
function extractFunction(source, name, async = false) {
  const start = source.indexOf(`${async ? "async " : ""}function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}
const context = vm.createContext({ ...content, ...guides, getPossibleStoryAnswer });
vm.runInContext(["storedStoryQuestions", "assessmentContentRows", "serializeAssessmentContent"].map(name => extractFunction(source, name)).join("\n"), context);
const rows = context.assessmentContentRows(42, "MoSY", { ...defaults.MoSY, stories: [custom, defaults.MoSY.stories[1]] });
assert.equal(rows.filter(row => row.category === "stories").length, 2);
assert.equal(rows.filter(row => row.category === guides.STORY_QUESTIONS_CATEGORY).length, 2);
assert.ok(rows.every(row => row.teacherId === 42 && row.assessmentPeriod === "MoSY"));
const roundTrip = JSON.parse(JSON.stringify(context.serializeAssessmentContent(rows).MoSY.stories[0]));
assert.deepEqual(JSON.parse(JSON.stringify(roundTrip.questions)), custom.questions);
assert.deepEqual(content.cloneAssessmentContent({ MoSY: { stories: [roundTrip] } }).MoSY.stories[0].questions, custom.questions);
assert.deepEqual(content.normalizeAssessmentPeriodContent({ stories: [roundTrip] }).stories[0].questions, custom.questions);
const session = { story_title: custom.title, assessment_content: { stories: [roundTrip] }, story_choices: [roundTrip] };
assert.deepEqual(getSessionStoryQuestions(session).map(({ text, possibleAnswer }) => ({ text, possibleAnswer })), custom.questions);
const learner = learnerSessionContent(session);
assert.ok(!JSON.stringify(learner).includes("Supported answer"));
assert.deepEqual(getSessionStoryQuestions(learner).map(question => question.text), custom.questions.map(question => question.text));
assert.equal(session.assessment_content.stories[0].questions[0].possibleAnswer, custom.questions[0].possibleAnswer);
for (const [path, name, args, expected] of [
  ["app/teacher/assessment/AssessmentClient.jsx", "getComprehensionQuestions", [session], true],
  ["app/learner/LearnerAssessmentPage.jsx", "getComprehensionQuestions", [learner], true],
  ["app/components/OfflineRuntime.jsx", "getOfflineQuestions", [custom.title, session.assessment_content], false],
]) {
  const ctx = vm.createContext({ ...guides });
  vm.runInContext(extractFunction(fs.readFileSync(path, "utf8"), name)+`\nthis.resolve = ${name};`, ctx);
  const result = ctx.resolve(...args);
  assert.deepEqual(Array.from(result, item => expected ? item.text : item), custom.questions.map(item => item.text));
}
assert.ok(source.includes("currentContent:\n                      firstQuestion"));
assert.ok(source.includes("liveAssessmentContent.stories.map(learnerStory)"));
assert.ok(source.includes('if (items.some(item => item.assessmentPeriod === period && item.category === "stories")) continue;'));
for (const path of ["lib/assessmentPeer.js", "lib/assessmentChannel.js"]) assert.ok(fs.readFileSync(path, "utf8").includes("learnerSessionContent"));
console.log("PASS six shared 100-word default stories, 36 question guides, strict six-pair validation, database row round-trip, saved question routing and answer-free learner payloads.");

// Exercise the production backfill twice: shared defaults persist once and an
// existing teacher pool is left intact, including its own question guides.
const database = rows.map(row => ({ ...row }));
const table = {
  findMany: async ({ where }) => database.filter(row => row.teacherId === where.teacherId),
  findFirst: async ({ where }) => database.find(row => Object.entries(where).every(([key, value]) => row[key] === value)),
  createMany: async ({ data }) => {
    for (const row of data) {
      const exists = database.some(item => item.teacherId === row.teacherId && item.assessmentPeriod === row.assessmentPeriod && item.category === row.category && item.position === row.position);
      if (!exists) database.push({ ...row });
    }
  },
};
const db = { assessmentContent: table, $queryRaw: async () => [] };
db.$transaction = callback => callback(db);
Object.assign(context, { prisma: db, DEFAULT_CONTENT_FOR_PERIOD: defaults, LEGACY_PLACEHOLDER_STORIES: [], LEGACY_BOSY_STORIES: [], invalidateLiveAssessmentContent() {} });
vm.runInContext(extractFunction(source, "readTeacherAssessmentContent", true), context);
await context.readTeacherAssessmentContent(42);
const firstRead = JSON.stringify(database);
await context.readTeacherAssessmentContent(42);
assert.equal(JSON.stringify(database), firstRead);
assert.equal(database.find(row => row.assessmentPeriod === "MoSY" && row.category === "stories").storyTitle, custom.title);
for (const period of ["BoSY", "EoSY"]) {
  const seeded = context.serializeAssessmentContent(database)[period].stories;
  assert.equal(seeded.length, 2);
  assert.ok(seeded.every(story => story.questions.length === 6 && story.questions.every(question => question.possibleAnswer)));
}
assert.ok(getStoryQuestionIssues({ title: "Para the Parrot", questions: null }, { requireAnswers: true }).length);
console.log("PASS shared defaults backfill empty period pools idempotently without replacing teacher stories or questions.");
