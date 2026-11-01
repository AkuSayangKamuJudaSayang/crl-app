import {ASSESSMENT_PERIODS,DEFAULT_ASSESSMENT_CONTENT_MODE,ASSESSMENT_CONTENT_MODE_CATEGORY,normalizeAssessmentContentModes,normalizeAssessmentContentDefaults,parseAssessmentContentSettings} from './assessmentContent';
import {STORY_QUESTIONS_CATEGORY,normalizeStoryQuestions,getStoryQuestions} from './storyComprehension.mjs';
import {getPossibleStoryAnswer} from './storyAnswerGuides.mjs';
function storedStoryQuestions(story, items, period, position) {
  const metadata = items.find(item => item.assessmentPeriod === period && item.category === STORY_QUESTIONS_CATEGORY && item.position === position && item.storyTitle === story.title);
  if (metadata) {
    try { return normalizeStoryQuestions(JSON.parse(metadata.content).questions); } catch { /* Read legacy defaults below. */ }
  }
  return getStoryQuestions(story).map(question => ({ ...question, possibleAnswer: question.possibleAnswer || getPossibleStoryAnswer(question.text) }));
}

export function serializeAssessmentContent(items) {
  const result = {
    BoSY: { letters: [], words: [], stories: [] },
    MoSY: { letters: [], words: [], stories: [] },
    EoSY: { letters: [], words: [], stories: [] },
  };

  for (const item of items) {
    if (!result[item.assessmentPeriod]?.[item.category]) continue;

    if (item.category === "stories") {
      result[item.assessmentPeriod].stories.push({
        id: item.id,
        title: item.storyTitle || "Untitled Story",
        text: item.content || "",
        questions: storedStoryQuestions({ title: item.storyTitle || "Untitled Story" }, items, item.assessmentPeriod, item.position),
      });
    } else {
      result[item.assessmentPeriod][item.category].push(
        item.content || ""
      );
    }
  }

  return result;
}

/*
 * The item-selection setting lives in the same table as the content, under a
 * reserved category, so saving content must never delete it. It is stored per
 * period and always resolves to a supported mode plus a well-formed choice.
 */
export function serializeAssessmentContentMode(items) {
  const result = {};
  for (const period of ASSESSMENT_PERIODS) {
    result[period] = normalizeAssessmentContentModes(
      DEFAULT_ASSESSMENT_CONTENT_MODE
    );
  }

  for (const item of items) {
    if (item.category !== ASSESSMENT_CONTENT_MODE_CATEGORY) continue;
    if (!result[item.assessmentPeriod]) continue;
    result[item.assessmentPeriod] = parseAssessmentContentSettings(
      item.content
    ).modes;
  }

  return result;
}

export function serializeAssessmentContentDefaults(items) {
  const result = {};
  for (const period of ASSESSMENT_PERIODS) {
    result[period] = normalizeAssessmentContentDefaults(null);
  }

  for (const item of items) {
    if (item.category !== ASSESSMENT_CONTENT_MODE_CATEGORY) continue;
    if (!result[item.assessmentPeriod]) continue;
    result[item.assessmentPeriod] = parseAssessmentContentSettings(
      item.content
    ).defaults;
  }

  return result;
}
