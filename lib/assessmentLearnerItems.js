"use client";

/*
 * Which items a run actually administers.
 *
 * A teacher may save more letters, words and stories than one run needs, and
 * every assessment narrows that pool to exactly what it will administer - the
 * saved order, or a draw from the assessment's own seed. Both devices have to
 * measure a learner's position in that administered run, not in some default
 * list: the learner's copy of the two default lists is only a fallback for a
 * session that carries no content of its own.
 *
 * Reading the defaults instead of the assessment's items is not a cosmetic
 * mistake. The learner's position is what tells it whether an incoming packet
 * moves it forward; a position computed against the wrong list makes a genuine
 * next item look like a step backwards, and a step backwards is dropped as a
 * stale packet. The screen then sits on an item the teacher has already passed.
 */

export const FALLBACK_LETTERS = Object.freeze([
  "M",
  "S",
  "A",
  "L",
  "O",
  "B",
  "E",
  "U",
  "R",
  "T",
]);

export const FALLBACK_WORDS = Object.freeze([
  "clap",
  "jump",
  "eat",
  "drink",
  "stand",
  "dance",
  "fly",
  "pencil",
  "basket",
  "helmet",
]);

function readItems(value, fallback) {
  if (!Array.isArray(value) || !value.length) return fallback;
  const items = value.map((item) => String(item));
  return items.length ? items : fallback;
}

export function getAssessmentLetters(session) {
  return readItems(session?.assessment_content?.letters, FALLBACK_LETTERS);
}

export function getAssessmentWords(session) {
  return readItems(session?.assessment_content?.words, FALLBACK_WORDS);
}

/*
 * True when the session carries the items this assessment administers, rather
 * than the defaults standing in for a packet that carried none. Only then can
 * the defaults be trusted to state a position.
 */
export function hasOwnAssessmentItems(session) {
  if (!session?.assessment_content) return false;
  return Boolean(getAssessmentItemsForStage(session)?.length);
}

/*
 * The administered list for one stage, or null when the stage does not count
 * items this way.
 */
export function getAssessmentItemsForStage(session, stage = session?.stage) {
  const name = String(stage || "waiting");
  if (name === "letter") return getAssessmentLetters(session);
  if (name === "word") return getAssessmentWords(session);
  return null;
}

/*
 * The administered list for the stage being run, and where the session sits in
 * it. A null position means the stage does not count items this way, and an
 * index of -1 means the content is not one of the administered items at all.
 */
export function getAssessmentItemPosition(session) {
  const items = getAssessmentItemsForStage(session);
  if (!items) return null;
  const content = String(
    session?.current_content ?? session?.currentContent ?? ""
  ).trim();
  return { items, index: items.indexOf(content) };
}

/*
 * The item number the teacher stated for this packet, or null when it stated
 * none. This is the only position that holds regardless of which order a device
 * happens to be holding, so it is what a comparison should use first.
 */
export function getStatedItemIndex(session) {
  const value = Number(session?.item_index ?? session?.itemIndex);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/*
 * Two sessions can only be compared by position when they are running the very
 * same administered items. A packet that carries no content of its own, or an
 * assessment whose pool changed underneath it, must never be judged by a
 * position measured against a different list: a real next item would look like
 * a step backwards, and the learner drops those.
 */
export function hasSameAssessmentItems(previous, incoming) {
  const before = getAssessmentItemsForStage(previous);
  const after = getAssessmentItemsForStage(incoming);
  if (!before || !after || before.length !== after.length) return false;
  for (let index = 0; index < before.length; index += 1) {
    if (before[index] !== after[index]) return false;
  }
  return true;
}
