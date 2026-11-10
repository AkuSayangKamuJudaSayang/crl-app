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
