import { learnerPeriodProfile } from './learnerPeriodResults.mjs';
import { readLearnerRecommendations } from './learnerRecommendations.mjs';

// Classroom activity examples adapted from DepEd's CRLA instructional focus,
// not assessment items or official ARAL placement decisions.
export const READING_GUIDANCE_URL = 'https://www.deped.gov.ph/wp-content/uploads/DM_s2025_064r.pdf';

const guidance = {
  'Low Emerging Reader': {
    recommendation: 'Start with the letter sounds the learner missed, then practice blending those sounds to read simple words.',
    interventions: [
      ['Letter–sound practice', 'Review a few missed sounds with letter cards. Model each sound and have the learner say it when shown the letter.'],
      ['Oral rhyming and blending', 'Say two familiar words and ask if they rhyme. Model how to join separate sounds, then have the learner blend them aloud.'],
      ['Guided word decoding', 'Build simple words with letter tiles. Have the learner say each sound, blend the sounds, and reread the whole word.'],
    ],
  },
  'High Emerging Reader': {
    recommendation: 'Build accurate word reading with familiar spelling patterns before moving to longer text.',
    interventions: [
      ['Phonics and word families', 'Teach one spelling pattern at a time. Build, read, and sort simple words with that pattern.'],
      ['Common word practice', 'Teach a few common words and practice reading them in short sentences. Review any words that still need prompting.'],
    ],
  },
  'Developing Reader': {
    recommendation: 'Build fluency and understanding with guided rereading, vocabulary, and questions about the text.',
    interventions: [
      ['Guided rereading', 'Model a short passage, then reread it with the learner. Give feedback on phrasing, accuracy, and punctuation.'],
      ['Vocabulary and comprehension', 'Teach key words before reading. Ask the learner to retell a detail and explain an inference using a clue from the passage.'],
    ],
  },
  'Transitioning Reader': {
    recommendation: 'Practice explaining answers with evidence from the text and working out unfamiliar words in context.',
    interventions: [
      ['Text evidence and inference', 'Ask an inferential question and have the learner explain which words or details support the answer.'],
      ['Vocabulary in context', 'Pause at an unfamiliar word and use the surrounding sentences to infer its meaning. Check the meaning by rereading.'],
    ],
  },
  'Reading At Grade Level': {
    recommendation: 'Continue reading enrichment with varied grade-level texts and discussion.',
    interventions: [
      ['Independent reading enrichment', 'Let the learner choose a grade-level text, summarize the main idea, and discuss how it connects to another text or experience.'],
    ],
  },
};

export function readingFollowUpGuidance(profile) {
  if (Object.hasOwn(guidance, profile)) return guidance[profile];
  return {
    recommendation: '',
    interventions: Object.values(guidance).flatMap(item => item.interventions),
  };
}

export function matchesReadingFollowUp(learner, result, period, profileFilter, recommendationFilter) {
  const profile = learnerPeriodProfile(result);
  const saved = Boolean(readLearnerRecommendations(learner.period_recommendations)[period]);
  return (!profileFilter || profile === profileFilter || (profileFilter === 'unassessed' && !profile)) &&
    (!recommendationFilter || saved === (recommendationFilter === 'with'));
}
