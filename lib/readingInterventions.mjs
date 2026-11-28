// Original classroom activity examples informed by DepEd's CRLA reading guidance.
export const READING_GUIDANCE_URL = 'https://www.deped.gov.ph/wp-content/uploads/DM_s2025_064r.pdf';

const presets = {
  'letter-sounds': ['Letter–sound practice', 'Use letter cards to model missed sounds and ask the learner to say each sound.'],
  'rhyming-blending': ['Oral rhyming and blending', 'Practice rhyming with familiar words, then model and practice blending sounds aloud.'],
  'word-decoding': ['Guided word decoding', 'Build simple words with letter tiles. Say each sound, blend, and reread the word.'],
  'word-families': ['Phonics and word families', 'Teach one spelling pattern at a time. Build, read, and sort simple words with that pattern.'],
  'common-words': ['Common word practice', 'Teach a few common words and practice reading them in short sentences. Review words that still need prompting.'],
  'guided-rereading': ['Guided rereading', 'Model a short passage, then reread it with the learner. Give feedback on phrasing, accuracy, and punctuation.'],
  'vocabulary-comprehension': ['Vocabulary and comprehension', 'Teach key words before reading. Ask the learner to retell a detail and explain an inference using a clue from the passage.'],
  'text-evidence': ['Text evidence and inference', 'Ask an inferential question and have the learner explain which words or details support the answer.'],
  'context-vocabulary': ['Vocabulary in context', 'Pause at an unfamiliar word and use the surrounding sentences to infer its meaning. Check by rereading.'],
  'reading-enrichment': ['Independent reading enrichment', 'Have the learner choose a grade-level text, summarize it, and discuss a connection.'],
};

const byProfile = {
  'Low Emerging Reader': ['letter-sounds', 'rhyming-blending', 'word-decoding'],
  'High Emerging Reader': ['word-families', 'common-words'],
  'Developing Reader': ['guided-rereading', 'vocabulary-comprehension'],
  'Transitioning Reader': ['text-evidence', 'context-vocabulary'],
  'Reading At Grade Level': ['reading-enrichment'],
};

export function isReadingIntervention(id) {
  return typeof id === 'string' && Object.hasOwn(presets, id);
}

export function readingInterventionOptions(profile, saved = []) {
  const forProfile = Object.hasOwn(byProfile, profile) ? byProfile[profile] : Object.keys(presets);
  return [...new Set([...forProfile, ...saved])].filter(isReadingIntervention).map(id => ({ id, label: presets[id][0] }));
}

export function readingInterventionLabels(ids) {
  return ids.filter(isReadingIntervention).map(id => presets[id][0]);
}

export function generateReadingRecommendation(ids) {
  return [...new Set(ids)].filter(isReadingIntervention).map(id => presets[id][1]).join('\n');
}
