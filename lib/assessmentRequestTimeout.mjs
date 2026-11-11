/*
 * Assessment data can take longer than a connectivity ping or a 5-second
 * command timeout to commit when the database is busy. A browser-aborted POST
 * has an unknown server outcome: the server may still finish committing it.
 * Keep score-bearing writes bounded, but never cut them off at the same short
 * timeout used for disposable presence/advance requests.
 *
 * Timeouts are client acknowledgement bounds, NOT proof a write failed.
 * The offline replay journal remains authoritative until acknowledged.
 */
const SCORE_BEARING_ACTIONS = new Set([
  "record_letter", "record_word", "record_comprehension",
  "record_passage_miscue", "remove_passage_miscue",
  "record_miscue", "remove_miscue", "finish_passage",
  "save_experience_rating",
]);

export function liveAssessmentRequestTimeoutMs(action, method = "POST") {
  const normalized = String(action || "").trim().toLowerCase();
  if (normalized === "save_final_assessment_review" || normalized === "host_get") return 15_000;
  if (String(method || "").toUpperCase() === "GET") return 1_800;
  if (SCORE_BEARING_ACTIONS.has(normalized)) return 20_000;
  return 5_000;
}

export function assessmentReplayRequestTimeoutMs(kind) {
  const normalized = String(kind || "").trim().toLowerCase();
  if (normalized === "save_final_assessment_review") return 45_000;
  if (SCORE_BEARING_ACTIONS.has(normalized)) return 30_000;
  return 10_000;
}
