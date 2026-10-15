import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { CUSTOM_ASSESSMENT_STORIES, getCustomStoryQuestions } from "../lib/customAssessmentStories.mjs";
import { getPossibleStoryAnswer } from "../lib/storyAnswerGuides.mjs";
import { DEFAULT_ASSESSMENT_CONTENT, getAssessmentContentIssues, normalizeAssessmentPeriodContent } from "../lib/assessmentContent.js";

assert.equal(CUSTOM_ASSESSMENT_STORIES.length, 4);
assert.equal(new Set(CUSTOM_ASSESSMENT_STORIES.map(story => story.title)).size, 4);
for (const period of ["MoSY", "EoSY"]) {
  const stories = CUSTOM_ASSESSMENT_STORIES.filter(story => story.period === period);
  assert.equal(stories.length, 2);
  const normalized = normalizeAssessmentPeriodContent({ ...DEFAULT_ASSESSMENT_CONTENT[period], stories });
  assert.deepEqual(getAssessmentContentIssues(normalized), []);
  // Catalogue publication must not replace any teacher's saved content or BoSY tools.
  assert.equal(DEFAULT_ASSESSMENT_CONTENT[period].stories.length, 0);
}
for (const story of CUSTOM_ASSESSMENT_STORIES) {
  assert.equal(story.text.trim().split(/\s+/).length, 100, story.title);
  assert.equal(story.questions.length, 6);
  assert.ok(story.questions.every(question => getPossibleStoryAnswer(question).length > 0));
  assert.equal(new Set(story.questions).size, 6);
  assert.ok(story.questions.every(question => question.trim().endsWith("?")));
  assert.equal("answerKey" in story, false);
  assert.deepEqual(getCustomStoryQuestions(` ${story.title.toUpperCase().replaceAll(" ", "  ")} `), story.questions);
}
assert.equal(getCustomStoryQuestions("Para the Parrot"), null);
assert.equal(getCustomStoryQuestions("A Day in the Fields"), null);
assert.equal(getCustomStoryQuestions("Some other teacher story"), null);
const copy = getCustomStoryQuestions(CUSTOM_ASSESSMENT_STORIES[0].title);
copy[0] = "Changed";
assert.notEqual(getCustomStoryQuestions(CUSTOM_ASSESSMENT_STORIES[0].title)[0], "Changed");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}
for (const [path, fn, constant, records] of [
  ["app/teacher/assessment/AssessmentClient.jsx", "getComprehensionQuestions", "STORY_QUESTIONS", true],
  ["app/learner/LearnerAssessmentPage.jsx", "getComprehensionQuestions", "STORY_QUESTIONS", true],
  ["app/components/OfflineRuntime.jsx", "getOfflineQuestions", "STORY_QUESTIONS", false],
  ["app/teacher/page.jsx", "analyticsQuestionsForStory", "ANALYTICS_REVIEW_QUESTIONS", false],
]) {
  const source = fs.readFileSync(path, "utf8");
  const start = source.indexOf(`const ${constant} =`);
  const bank = source.slice(start, source.indexOf("\n};", start) + 3);
  const context = vm.createContext({ getCustomStoryQuestions });
  vm.runInContext(`${bank}\n${extractFunction(source, fn)}\nthis.resolve = ${fn};`, context);
  for (const story of CUSTOM_ASSESSMENT_STORIES) {
    const result = context.resolve(records ? { story_title: story.title } : story.title);
    assert.deepEqual(Array.from(result, item => records ? item.text : item), story.questions, `${path}: ${story.title}`);
    if (records) assert.deepEqual(Array.from(result, item => item.index), [0, 1, 2, 3, 4, 5]);
  }
  for (const [title, first] of [["Para the Parrot", "What must Para look for?"], ["A Day in the Fields", "What is the job of Dulnuwan?"]]) {
    const result = context.resolve(records ? { story_title: title } : title);
    assert.equal(records ? result[0].text : result[0], first);
    assert.equal(result.length, 6);
    for (const item of result) assert.ok(getPossibleStoryAnswer(records ? item.text : item));
  }
}
const route = fs.readFileSync("app/api/assessment/route.js", "utf8");
const start = route.indexOf("getCustomStoryQuestions(host.storyTitle)?.[0]");
assert.ok(start >= 0);
const end = route.indexOf('\n                    storyTitle:', start);
const expression = route.slice(start, end).trim().replace(/,$/, "");
for (const story of CUSTOM_ASSESSMENT_STORIES) {
  const first = vm.runInNewContext(expression, { getCustomStoryQuestions, host: { storyTitle: story.title } });
  assert.equal(first, story.questions[0]);
}
console.log("PASS four original passages contain exactly 100 words each, two per period, with six matched questions and answer guides; Add Story content validation accepts them.");
console.log("PASS teacher, learner, offline, analytics and server question selection agree; existing BoSY passages/questions and default period pools remain unchanged.");

for (const path of ["app/learner/LearnerAssessmentPage.jsx", "app/components/OfflineRuntime.jsx", "app/api/assessment/route.js", "lib/customAssessmentStories.mjs"]) {
  assert.ok(!fs.readFileSync(path, "utf8").includes("storyAnswerGuides"), `${path} must not import teacher answer guides`);
}
assert.equal(getPossibleStoryAnswer("Unknown question?"), "");
console.log("PASS possible answers cover all 36 questions; learner and shared runtimes do not import answer guides.");
