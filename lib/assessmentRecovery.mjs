import { getSessionStoryQuestions } from "./storyComprehension.mjs";
// Separate from answer/outbox stores: a synchronous crash-recovery checkpoint.
// Never cleared by unmount/pagehide; only acknowledged End/Save resolves a run.
export const RECOVERY_PREFIX = "crl-assessment-recovery-v1:";
export const LEARNER_RECOVERY_KEY = "crl-learner-recovery-v1";
export const PRESENCE_TIMEOUT_MS = 15000;
let ownerId = 0;
let activeCode = "";
const codeOf = value => String(value || "").trim().toUpperCase();
export function activateRecoveryOwner(id) { ownerId = Number(id) || 0; }
export function activateRecoveryRun(code) { activeCode = codeOf(code); }
export function readTeacherRecovery(id, storage = undefined) {
  try {
    storage ||= globalThis.localStorage;
    const value = JSON.parse(storage.getItem(`${RECOVERY_PREFIX}${Number(id)}`) || "null");
    return value?.version === 1 && Number(value.teacherId) === Number(id) && !value.resolved && value.session?.code ? value : null;
  } catch { return null; }
}
export function checkpointTeacherSession(session, ui, storage = undefined) {
  const code = codeOf(session?.code);
  const teacherId = Number(session?.teacher_id || session?.teacherId || ownerId);
  try { storage ||= globalThis.localStorage; } catch { return false; }
  if (!storage || !teacherId || !code || code !== activeCode) return false;
  const key = `${RECOVERY_PREFIX}${teacherId}`;
  try {
    const previous = JSON.parse(storage.getItem(key) || "null");
    if (previous?.resolved && codeOf(previous.code) === code) return true;
    const next = { version: 1, teacherId, savedAt: Date.now(), session: { ...session, code },
      ui: { ...(codeOf(previous?.session?.code) === code ? previous.ui : {}), ...(ui || {}) } };
    storage.setItem(key, JSON.stringify(next));
    return true;
  } catch { return false; }
}
export function resolveTeacherRecovery(code, storage = undefined) {
  const value = readTeacherRecovery(ownerId, storage);
  if (!value || codeOf(value.session.code) !== codeOf(code)) return;
  try { storage ||= globalThis.localStorage; storage.setItem(`${RECOVERY_PREFIX}${ownerId}`, JSON.stringify({ version: 1, teacherId: ownerId, code: codeOf(code), resolved: true })); } catch {}
}
export function recoveryEligible(checkpoint, { teacherId, host, tombstones = [], saved = false } = {}) {
  return Boolean(checkpoint && Number(checkpoint.teacherId) === Number(teacherId) && !saved &&
    !host?.deleted && (!host?.ended || (host.stage === "completed" && checkpoint.ui?.showTerminationObservation)) && host?.stage !== "ended" &&
    Number(host?.teacher_id ?? host?.teacherId ?? teacherId) === Number(teacherId) &&
    Number.isFinite(Number(checkpoint.session.learner_id || checkpoint.session.learnerId)) && Number(checkpoint.session.learner_id || checkpoint.session.learnerId) !== 0 &&
    !tombstones.some(item => Number(item.id) === Number(checkpoint.session.learner_id || checkpoint.session.learnerId)));
}
export function freezeRecoveredSession(session, elapsed) {
  const next = { ...session, connected: false };
  const start = new Date(session.passage_started_at || session.passageStartedAt || "").getTime();
  if (session.stage === "passage" && Number.isFinite(start) && !session.passage_paused_at && !session.passagePausedAt) {
    const seconds = Math.min(120, Math.max(0, Math.floor(Number(elapsed) || 0)));
    next.passage_paused_at = new Date(start + (Number(session.passage_paused_seconds || session.passagePausedSeconds || 0) + seconds) * 1000).toISOString();
  }
  return next;
}
// Auth/ownership and compare-and-set are enforced by the caller. This does not
// calculate or change any answer, score, classification or completion record.
export function recoveryHostPatch(host, body, now = Date.now()) {
  const stages = ["waiting", "letter", "word", "story_choice", "passage", "comprehension", "learner_experience", "teacher_review", "terminated", "completed"];
  const target = String(body.stage || "");
  if (host.ended || !stages.includes(target) || stages.indexOf(target) < stages.indexOf(host.stage) ||
      (new Date(host.updatedAt || host.updated_at || 0).getTime() > Number(body.checkpoint_at) &&
        (host.stage !== target || String(host.currentContent ?? host.current_content ?? "") !== String(body.currentContent ?? "")))) return null;
  const content = String(body.currentContent ?? "");
  if (content.length > 30000 || String(body.storyTitle || "").length > 300) throw new Error("Invalid recovery content.");
  const patch = { stage: target, currentContent: content, storyTitle: body.storyTitle == null ? host.storyTitle : String(body.storyTitle) };
  const started = host.passageStartedAt || host.passage_started_at;
  if (target === "passage" && started && !host.passagePausedAt && !host.passage_paused_at) {
    const start = new Date(started).getTime();
    const elapsed = Math.min(120, Math.max(0, Math.floor(Number(body.elapsed_seconds) || 0)));
    const paused = start + (Number(host.passagePausedSeconds || host.passage_paused_seconds || 0) + elapsed) * 1000;
    patch.passagePausedAt = new Date(Math.min(now, paused));
  }
  return patch;
}
export function rememberLearnerRecovery(session, storage = undefined) {
  try {
    storage ||= globalThis.localStorage;
    if (!session?.code || session.ended || ["ended", "completed"].includes(session.stage)) storage.removeItem(LEARNER_RECOVERY_KEY);
    else storage.setItem(LEARNER_RECOVERY_KEY, codeOf(session.code));
  } catch {}
}

export function discardRecoveryCodes(teacherId, codes, storage = undefined) {
  const draft = readTeacherRecovery(teacherId, storage);
  if (draft && codes.map(codeOf).includes(codeOf(draft.session.code))) (storage || globalThis.localStorage).setItem(`${RECOVERY_PREFIX}${Number(teacherId)}`, JSON.stringify({ version: 1, teacherId: Number(teacherId), code: codeOf(draft.session.code), resolved: true }));
}

export function mergeRecoverySession(local, incoming) {
  if (!incoming) return local;
  const order = ["waiting", "connected", "letter", "word", "story_choice", "passage", "comprehension", "learner_experience", "teacher_review", "terminated", "completed", "ended"];
  let newer = order.indexOf(incoming.stage) > order.indexOf(local.stage);
  if (incoming.stage === local.stage) {
    const content = local.assessment_content || incoming.assessment_content;
    const items = local.stage === "letter" ? content?.letters : local.stage === "word" ? content?.words : local.stage === "comprehension" ? getSessionStoryQuestions(local).map(question => question.text) : null;
    const index = value => local.stage !== "comprehension" && Number.isInteger(value.item_index) ? value.item_index : items?.indexOf(value.current_content) ?? -1;
    newer = index(incoming) > index(local) || (index(incoming) === index(local) && new Date(incoming.updated_at || 0).getTime() > new Date(local.updated_at || 0).getTime());
  }
  const mergeRows = (serverRows, localRows) => {
    const rows = new Map();
    for (const row of [...(serverRows || []), ...(localRows || [])]) rows.set(row.index ?? row.letterIndex ?? row.wordIndex ?? row.questionIndex, row);
    return Array.from(rows.values());
  };
  return { ...incoming, ...local, ...(newer ? incoming : {}),
    learner_id: Number(local.learner_id) < 0 && Number(incoming.learner_id) > 0 ? incoming.learner_id : local.learner_id,
    task1Results: mergeRows(incoming.task1Results, local.task1Results), task2Results: mergeRows(incoming.task2Results, local.task2Results),
    comprehensionResults: mergeRows(incoming.comprehensionResults, local.comprehensionResults) };
}
