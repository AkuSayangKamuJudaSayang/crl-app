import { getCustomStoryQuestions } from "./customAssessmentStories.mjs";

export const STORY_QUESTION_COUNT = 6;
export const STORY_QUESTION_LIMIT = 500;
export const STORY_ANSWER_LIMIT = 1000;
export const STORY_QUESTIONS_CATEGORY = "story_questions";

const ORIGINAL_QUESTIONS = {
  "para the parrot": [
    "What must Para look for?", "What time or part of the day is it?",
    "What does Para land on?", "Who does Para see?",
    "What else is the police officer doing besides directing traffic?",
    "What could the police officer be feeling?",
  ],
  "a day in the fields": [
    "What is the job of Dulnuwan?", "When do Ali and Dina help Dulnuwan and Bugan?",
    "Where do they rest?", "Why do they rest?",
    "What kind of weather or day is it?", "What does Dulnuwan pick up?",
  ],
};
const titleKey = value => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

export function normalizeStoryQuestions(value) {
  return Array.isArray(value) ? value.map(item => ({
    text: String(typeof item === "string" ? item : item?.text ?? "").trim(),
    possibleAnswer: String(item?.possibleAnswer ?? "").trim(),
  })) : [];
}

export function getStoryQuestions(story) {
  if (story && Object.prototype.hasOwnProperty.call(story, "questions")) return normalizeStoryQuestions(story.questions);
  const title = titleKey(story?.title);
  return normalizeStoryQuestions(getCustomStoryQuestions(title) || ORIGINAL_QUESTIONS[title]);
}

export function getStoryQuestionIssues(story, { requireAnswers = false } = {}) {
  const questions = getStoryQuestions(story);
  if (questions.length !== STORY_QUESTION_COUNT) return ["Enter exactly 6 comprehension questions."];
  return questions.flatMap((question, index) => {
    const issues = [];
    if (!question.text || question.text.length > STORY_QUESTION_LIMIT) issues.push(`Question ${index + 1} must contain 1–${STORY_QUESTION_LIMIT} characters.`);
    if ((requireAnswers && !question.possibleAnswer) || question.possibleAnswer.length > STORY_ANSWER_LIMIT) issues.push(`Possible answer ${index + 1} must contain 1–${STORY_ANSWER_LIMIT} characters.`);
    return issues;
  });
}

export function getSessionStoryQuestions(session) {
  const title = titleKey(session?.story_title ?? session?.storyTitle);
  const stories = session?.assessment_content?.stories || session?.story_choices || [];
  const story = stories.find(item => titleKey(item?.title) === title);
  const questions = getStoryQuestions(story || { title });
  // Old sessions created before editable questions retain their original prompts.
  const resolved = questions.length ? questions : normalizeStoryQuestions(
    title.includes("a day in the fields") ? ORIGINAL_QUESTIONS["a day in the fields"] : ORIGINAL_QUESTIONS["para the parrot"]
  );
  return resolved.map((question, index) => ({ ...question, index }));
}

export function learnerStory(story) {
  const { questions, ...rest } = story || {};
  return { ...rest, questions: getStoryQuestions(story).map(question => ({ text: question.text })) };
}

export function learnerAssessmentContent(content) {
  return content ? { ...content, stories: (content.stories || []).map(learnerStory) } : content;
}

export function learnerSessionContent(session) {
  if (!session) return session;
  return {
    ...session,
    ...(session.assessment_content ? { assessment_content: learnerAssessmentContent(session.assessment_content) } : {}),
    ...(Array.isArray(session.story_choices) ? { story_choices: session.story_choices.map(learnerStory) } : {}),
  };
}
