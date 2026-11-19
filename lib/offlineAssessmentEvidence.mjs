function indexedRows(rows, indexKey, valueKey, length, expected) {
  if (!Array.isArray(rows) || rows.length !== length) return null;
  const ordered = Array(length).fill(null);
  for (const row of rows) {
    const index = row?.[indexKey];
    const value = valueKey && row?.[valueKey];
    if (!Number.isInteger(index) || index < 0 || index >= length || ordered[index] ||
      typeof row?.isCorrect !== "boolean" || (valueKey && (
        typeof value !== "string" || !value.trim() || (expected && value !== expected[index])
      ))) return null;
    ordered[index] = { [indexKey]: index, ...(valueKey ? { [valueKey]: value } : {}), isCorrect: row.isCorrect };
  }
  return ordered;
}

export function offlineAssessmentEvidence(record, catalogue) {
  const letters = indexedRows(record.letters, "letterIndex", "letter", 10, catalogue?.letters);
  if (!letters) return null;
  const zeroScore = !letters.some(row => row.isCorrect);
  const words = indexedRows(record.words, "wordIndex", "word", zeroScore ? 0 : 10, catalogue?.words);
  if (!words) return null;
  const stopped = zeroScore || [...letters, ...words].filter(row => row.isCorrect).length <= 10;
  const comprehension = indexedRows(record.comprehension, "questionIndex", null, stopped ? 0 : 6);
  if (!comprehension || !Array.isArray(record.miscues)) return null;

  if (stopped) {
    if (record.miscues.length || record.storyTitle || record.timerSeconds != null ||
        record.experienceRating != null || record.observationLevel != null) return null;
    return { letters, words, comprehension, miscues: [], storyTitle: null,
      timerSeconds: null, experienceRating: null, observationLevel: null };
  }

  const storyTitle = typeof record.storyTitle === "string" ? record.storyTitle.trim() : "";
  if (!storyTitle || storyTitle.length > 200 || (catalogue && !catalogue.stories.some(story => story.title === storyTitle && story.text?.trim())) ||
      !Number.isInteger(record.timerSeconds) || record.timerSeconds < 0 || record.timerSeconds > 120 ||
      ![1, 2, 3, 4, 5].includes(record.experienceRating) ||
      ![1, 2, 3, 4].includes(record.observationLevel)) return null;

  if (record.miscues.length > 100) return null;
  const byIndex = new Map();
  for (const item of record.miscues) {
    if (!Number.isInteger(item?.wordIndex) || item.wordIndex < 0 || item.wordIndex >= 100 ||
      !["Insertion", "Omission", "Substitution", "Repetition", "SelfCorrection", "Reversion"].includes(item.miscueType) ||
      (item.misreadWord != null && (typeof item.misreadWord !== "string" || item.misreadWord.trim().length > 100)) || byIndex.has(item.wordIndex)) return null;
    byIndex.set(item.wordIndex, {
      wordIndex: item.wordIndex,
      miscueType: item.miscueType,
      misreadWord: item.misreadWord?.trim() || null,
    });
  }
  return {
    letters, words, comprehension,
    miscues: [...byIndex.values()].sort((a, b) => a.wordIndex - b.wordIndex),
    storyTitle, timerSeconds: record.timerSeconds, experienceRating: record.experienceRating,
    observationLevel: record.observationLevel,
  };
}

export function matchesCompletedAssessment(evidence, record) {
  const metrics = record.sessionMetrics || {};
  const storyTitle = evidence.storyTitle
    ? record.hostSessions?.find(host => host.storyTitle === evidence.storyTitle)?.storyTitle
    : null;
  const saved = offlineAssessmentEvidence({
    storyTitle,
    timerSeconds: metrics.timerSeconds,
    experienceRating: metrics.experienceRating,
    observationLevel: metrics.observationLevel,
    letters: record.letterResults,
    words: record.wordResults,
    comprehension: record.comprehensionResults,
    miscues: record.passageMiscues,
  });
  return saved !== null && JSON.stringify(evidence) === JSON.stringify(saved);
}
