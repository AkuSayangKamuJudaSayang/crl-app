import { getRecordProfile } from './recordViewModel.mjs';

const resultDate = row => Date.parse(row.date_administered || row.assessment_date) || 0;

export function latestLearnerPeriodResults(assessments) {
  const byLearner = new Map();
  for (const assessment of assessments) {
    const learnerId = String(assessment.learner_id);
    const period = assessment.assessment_period;
    if (!byLearner.has(learnerId)) byLearner.set(learnerId, {});
    const periods = byLearner.get(learnerId);
    const previous = periods[period];
    // A saved result takes precedence over an unfinished attempt.
    if (previous) {
      const completionOrder = Number(Boolean(assessment.is_completed)) - Number(Boolean(previous.is_completed));
      const order = completionOrder || resultDate(assessment) - resultDate(previous) || Number(assessment.id) - Number(previous.id);
      if (!(order > 0)) continue;
    }
    periods[period] = assessment;
  }
  return byLearner;
}

export function learnerPeriodStatus(result) {
  if (!result) return 'Not yet assessed';
  if (!result.is_completed) return 'Incomplete';
  return result.offline_pending ? 'Completed · Sync pending' : 'Completed';
}

export function learnerPeriodProfile(result) {
  return result?.is_completed ? getRecordProfile(result) : '';
}

function learnerMiscueType(item) {
  const type = String(item.miscue_type ?? item.miscueType ?? item.type ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return type === 'lastwordread' || item.isCutoffMarker ? '' : type || 'miscue';
}

export function countLearnerMiscues(detail) {
  if (!Array.isArray(detail?.passage_miscues)) return null;
  const counts = new Map();
  for (const item of detail.passage_miscues) {
    const key = learnerMiscueType(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function passageWordKey(word) {
  return String(word ?? '').normalize('NFC').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function compareLearnerMiscueWords(entries, selectedType, knownTypes) {
  const wordsToCompare = new Map();
  const periods = entries.map(({ period, saved, passage, loading }) => {
    const words = String(saved?.story_text ?? '').trim().split(/\s+/).filter(Boolean);
    const positions = new Map();
    for (const [index, word] of words.entries()) {
      const key = passageWordKey(word);
      if (!key) continue;
      if (!positions.has(key)) positions.set(key, []);
      positions.get(key).push(index + 1);
    }
    const recorded = saved?.passage_miscues;
    const unavailable = !saved ? 'No completed assessment' : !passage ? 'Not administered' :
      loading ? 'Loading…' : !Array.isArray(recorded) ? 'Miscue details unavailable' : '';
    const byWord = new Map();
    if (!unavailable) {
      for (const [index, item] of recorded.entries()) {
        const type = learnerMiscueType(item);
        if (!type) continue;
        const position = item.word_index ?? item.wordIndex ?? item.index;
        const wordIndex = position != null && position !== '' && Number.isInteger(Number(position)) && Number(position) >= 0 ? Number(position) : null;
        const word = (wordIndex === null ? '' : words[wordIndex]) || item.word || item.original_word;
        const normalized = passageWordKey(word);
        // Without the actual word, a position cannot be matched across passages.
        const key = normalized || `unresolved:${period}:${wordIndex ?? index}`;
        const label = word || (wordIndex === null ? 'Word unavailable' : `Word ${wordIndex + 1}`);
        if (!byWord.has(key)) byWord.set(key, []);
        byWord.get(key).push({
          type,
          position: wordIndex === null ? null : wordIndex + 1,
          misreadWord: String(item.misread_word ?? item.misreadWord ?? '').trim(),
          originalType: item.miscue_type ?? item.miscueType ?? item.type,
        });
        if (selectedType === type || (selectedType === 'other' && !knownTypes.has(type))) {
          if (!wordsToCompare.has(key)) wordsToCompare.set(key, { label, normalized });
        }
      }
    }
    return { period, title: saved?.story_title, words, positions, byWord, unavailable };
  });
  return [...wordsToCompare.entries()].map(([key, { label, normalized }]) => ({
    key,
    label,
    periods: periods.map(({ period, title, words, positions, byWord, unavailable }) => {
      const observations = byWord.get(key) || [];
      const occurrences = positions.get(normalized) || [];
      const note = observations.length ? null : unavailable ||
        (!normalized || !words.length ? 'Matching word unavailable' : occurrences.length ? 'No miscue recorded' : 'Word not in passage');
      return { period, title, observations, occurrences, note };
    }),
  }));
}

export function formatLearnerReadingTime(value) {
  const seconds = Math.round(Number(value));
  if (value == null || value === '' || !Number.isFinite(seconds) || seconds < 0) return 'Not recorded';
  return `${Math.floor(seconds / 60)} min ${seconds % 60} sec`;
}
