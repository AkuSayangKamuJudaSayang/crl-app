/*
 * A teacher-selected last word at the 120-second cutoff is passage
 * evidence displayed alongside miscues, but never sent as a word-error
 * miscue. The server already saves its position via words_read and uses
 * actual reading errors for accuracy. Derive the marker on every reload.
 */
export const LAST_WORD_READ_MISCUE = "Last Word Read";

export function passageCutoffMarker({ timerSeconds, wordsRead, passageWords } = {}) {
  const seconds = Number(timerSeconds);
  const position = Number(wordsRead);
  if (!Number.isFinite(seconds) || seconds < 120 ||
      !Number.isInteger(position) || position < 1 ||
      !Array.isArray(passageWords) || position > passageWords.length) return null;
  const word = String(passageWords[position - 1] || "").trim();
  if (!word) return null;
  return {
    wordIndex: position - 1,
    word,
    miscueType: LAST_WORD_READ_MISCUE,
    isCutoffMarker: true,
    misreadWord: "",
  };
}

/*
 * The furthest word marked with an actual reading miscue is the earliest
 * defensible last-word position. Word indices are zero-based in the stored
 * miscue journal, while the teacher selects one-based passage positions.
 * Reversion can identify two word positions: honor the furthest of either.
 */
export function minimumLastWordReadPosition(miscues) {
  const observations = Array.isArray(miscues) ? miscues : [];
  let minimum = 1;
  for (const item of observations) {
    if (!item || item.isCutoffMarker || item.miscueType === LAST_WORD_READ_MISCUE) continue;
    for (const candidate of [item.wordIndex, item.relatedWordIndex]) {
      if (candidate == null || candidate === "") continue;
      const index = Number(candidate);
      if (Number.isSafeInteger(index) && index >= 0 && index < 100) {
        minimum = Math.max(minimum, index + 1);
      }
    }
  }
  return minimum;
}

export function canSelectLastWordRead(position, miscues, totalWords = 100) {
  const word = Number(position);
  const count = Number(totalWords);
  return Number.isSafeInteger(word) && Number.isSafeInteger(count) &&
    count > 0 && word >= minimumLastWordReadPosition(miscues) && word <= count;
}
