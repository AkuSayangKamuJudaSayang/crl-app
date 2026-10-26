"use client";
import { classIdOf, schoolYearLabel, sectionName, UUID_PATTERN, validateRemarkRecords, validateLearnerDeletion, periodEligibility } from "../../lib/classWorkspace.mjs";
import { analyticsClassScope } from "../../lib/analyticsClassScope.mjs";
import { recoveryHostPatch, discardRecoveryCodes } from "../../lib/assessmentRecovery.mjs";


import { useEffect } from "react";
import { purgeAssessmentSessionData } from "../../lib/assessmentOutbox";
import { disconnectAssessmentPeer } from "../../lib/assessmentPeer";
import { planDeletedLearnerCleanup, queuedLearnerIds } from "../../lib/offlineLearnerDeletion.mjs";
import { getSessionStoryQuestions, getStoryQuestions, getStoryQuestionIssues } from "../../lib/storyComprehension.mjs";
import {
  getOfflineHostSession,
  getOfflineOutbox,
  getOfflineTeacherSession,
  getOfflineTeacherSnapshot,
  offlineList,
  offlineSet,
  offlineApplyChanges,
  removeOfflineMutation,
  saveOfflineHostSession,
  saveOfflineTeacherSession,
  saveOfflineTeacherSnapshot,
  signOutOfflineTeacherSession,
  enqueueOfflineMutation,
} from "../../lib/teacherOfflineDb";
import {
  DEFAULT_ASSESSMENT_CONTENT,
  cloneAssessmentContent,
  getAssessmentContentIssues,
  normalizeAssessmentContentDefaults,
  normalizeAssessmentContentModes,
  normalizeAssessmentPeriodContent,
  selectAssessmentContentForRun,
} from "../../lib/assessmentContent";

const SNAPSHOT_DEFAULT = {
  classes: { schoolYears: [], sections: [], archives: [] },
  rosterVersion: 0,
  learners: [],
  assessments: [],
  learnerTombstones: [],
  activities: null,
  contentMode: null,
  contentDefaults: null,
  user: null,
  savedAt: 0,
};

const STORY_QUESTIONS = {
  para: [
    "What must Para look for?",
    "What time or part of the day is it?",
    "What does Para land on?",
    "Who does Para see?",
    "What else is the police officer doing besides directing traffic?",
    "What could the police officer be feeling?",
  ],
  fields: [
    "What is the job of Dulnuwan?",
    "When do Ali and Dina help Dulnuwan and Bugan?",
    "Where do they rest?",
    "Why do they rest?",
    "What kind of weather or day is it?",
    "What does Dulnuwan pick up?",
  ],
};

const OFFLINE_ASSESSMENT_ACTIONS = new Set([
  "host_recover", "host_get", "host_start", "host_update", "host_advance", "host_end",
  "record_letter", "record_word", "select_story", "passage_ready",
  "passage_timer", "finish_passage", "record_passage_miscue",
  "remove_passage_miscue", "record_miscue", "remove_miscue",
  "record_comprehension", "save_experience_rating", "finalize",
  "save_final_assessment_review", "learner_join", "host_join",
  "learner_status", "learner_heartbeat",
]);

const ASSESSMENT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let offlineMutationChain = Promise.resolve();
let snapshotMutationChain = Promise.resolve();
let outboxSyncPromise = null;
let reachabilityProbe = { checkedAt: 0, ok: true, promise: null };

function announceCloudReachability(ok) {
  try {
    window.dispatchEvent(new CustomEvent("crl-cloud-reachability", {
      detail: { online: Boolean(ok) },
    }));
  } catch {}
}

function announceTeacherDataUpdated(reason = "sync") {
  try {
    window.dispatchEvent(new CustomEvent("crl-teacher-data-updated", {
      detail: { reason },
    }));
  } catch {}
}

// Publish only meaningful transitions; the two-second retry loop must not
// repeatedly announce an unchanged waiting state to assistive technology.
function publishSyncStatus(status) {
  try {
    const previous = window.__crlOfflineSyncStatus;
    if (JSON.stringify(previous) === JSON.stringify(status)) return;
    window.__crlOfflineSyncStatus = status;
    window.dispatchEvent(new CustomEvent("crl-offline-sync-status", { detail: status }));
  } catch {}
}

function syncLearnerName(learner) {
  return [learner?.first_name || learner?.firstName, learner?.last_name || learner?.lastName]
    .filter(Boolean).join(" ").trim();
}

function describeContentChanges(previous, next) {
  const changes = [];
  for (const [category, label] of [["letters", "Letter"], ["words", "Word"], ["stories", "Story"]]) {
    const before = previous?.[category] || [];
    const after = next?.[category] || [];
    for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
      if (JSON.stringify(before[index]) === JSON.stringify(after[index])) continue;
      const name = item => category === "stories" ? item?.title : item;
      const oldName = name(before[index]);
      const newName = name(after[index]);
      changes.push(`${label} ${index + 1}: ${oldName && newName && oldName !== newName ? `${oldName} → ` : ""}${newName || oldName || "item"}${after[index] === undefined ? " (removed)" : ""}`);
    }
  }
  return changes;
}

async function describeOfflineMutation(entry, userId) {
  if (entry.syncLabel) return entry.syncLabel;
  const body = entry.body || {};
  const snapshot = await getSnapshot(userId);
  const host = (body.code || body.offline_code)
    ? await getOfflineHostSession(body.code || body.offline_code) : null;
  const learnerId = body.learner_id ?? body.learnerId ?? host?.learner_id;
  const learner = host?.learner || [...snapshot.learners, ...snapshot.learnerTombstones]
    .find(item => Number(item.id) === Number(learnerId) || Number(item.local_id) === Number(learnerId));
  const period = body.period || host?.assessment_period || "";
  const details = [];
  if (["save_school_year","edit_school_year"].includes(entry.kind)) details.push(schoolYearLabel(body.start_year));
  if(entry.kind === "save_class_section") details.push(body.name || "Section");
  if (syncLearnerName(learner)) details.push(syncLearnerName(learner));
  if (period) details.push(period);
  let title;
  const content = host?.assessment_content || {};
  if (entry.kind === "record_letter" || entry.kind === "record_word") {
    const letter = entry.kind === "record_letter";
    const index = Number(letter ? body.letter_index ?? body.letterIndex : body.word_index ?? body.wordIndex);
    const value = (letter ? content.letters : content.words)?.[index];
    title = `${letter ? "Letter" : "Word"} ${Number.isInteger(index) ? index + 1 : "result"}${value ? `: ${value}` : ""}`;
  } else if (entry.kind === "record_comprehension") {
    title = `Comprehension question ${Number(body.question_index ?? body.questionIndex) + 1}`;
    if (host?.story_title) details.push(host.story_title);
  } else if (entry.kind === "save_assessment_records") {
    title = "Assessment record edits";
    const editedIds = new Set((body.records || []).map(record => Number(record.id)));
    for (const record of snapshot.assessments.filter(item => editedIds.has(Number(item.id)))) {
      const name = syncLearnerName(record.learner || snapshot.learners.find(item => Number(item.id) === Number(record.learner_id)));
      details.push([name || "Learner assessment", record.assessment_period].filter(Boolean).join(" · "));
    }
  } else if (entry.kind === "save_activities") {
    title = "Assessment content";
    for (const category of ["letters", "words", "stories"]) {
      const values = body.content?.[category];
      if (values?.length) details.push(`${category[0].toUpperCase()}${category.slice(1)}: ${values.map(item => typeof item === "object" ? item.title : item).join(", ")}`);
    }
  } else if (["delete_learner", "delete_learners"].includes(entry.kind)) {
    title = "Learner removal";
    const ids = new Set((body.learner_ids || [learnerId]).map(Number));
    details.push(...[...snapshot.learners, ...snapshot.learnerTombstones].filter(item => ids.has(Number(item.id))).map(syncLearnerName).filter(Boolean));
  } else {
    title = ({
      save_school_year: "Add school year", edit_school_year: "Edit school year", save_class_section: "Section details",
      host_start: "Assessment session", learner_join: "Learner connection", host_join: "Learner connection",
      host_recover: "Recovered assessment", host_update: "Assessment progress", host_advance: "Assessment progress", host_end: "End assessment",
      select_story: "Story selection", passage_ready: "Start reading passage", passage_timer: "Reading timer",
      finish_passage: "Passage result", record_passage_miscue: "Passage miscue", remove_passage_miscue: "Remove passage miscue",
      record_miscue: "Reading miscue", remove_miscue: "Remove reading miscue", save_experience_rating: "Learner experience",
      finalize: "Assessment result", save_final_assessment_review: "Final assessment review",
      assessment_commit: "Assessment result", save_content_mode: "Assessment content settings",
      update_user: "Profile changes", add_learner: "New learner",
    })[entry.kind] || "Saved changes";
    if (entry.kind === "add_learner") details.push(syncLearnerName(body));
    if (/story|passage|miscue/.test(entry.kind) && host?.story_title) details.push(host.story_title);
  }
  return { title, details: [...new Set(details.filter(Boolean))] };
}

async function queueOfflineMutation(mutation, hostSession = null) {
  const session = await getOfflineTeacherSession();
  const userId = Number(session?.user?.id || 0);
  const syncLabel = await describeOfflineMutation(mutation, userId).catch(() => ({ title: "Saved changes", details: [] }));
  await enqueueOfflineMutation({ ...mutation, userId, syncLabel }, hostSession);
  const pending = await getOfflineOutbox().catch(() => null);
  if (!pending) return; // The write is durable even if a subsequent status read fails.
  const current = window.__crlOfflineSyncStatus;
  if (current?.phase === "syncing") {
    publishSyncStatus({ ...current, total: current.completed + pending.length });
  } else {
    publishSyncStatus({ phase: "waiting", completed: 0, total: pending.length, current: syncLabel,
      message: "Saved on this device. Sync resumes automatically when connected." });
  }
}

function serializeOfflineMutation(task) {
  const next = offlineMutationChain.then(task, task);
  offlineMutationChain = next.catch(() => {});
  return next;
}

function makeAssessmentCode() {
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += ASSESSMENT_CODE_ALPHABET[
      Math.floor(Math.random() * ASSESSMENT_CODE_ALPHABET.length)
    ];
  }
  return code;
}

async function generateOfflineAssessmentCode() {
  const storedHosts = await offlineList("host_session:").catch(() => []);
  const used = new Set(
    storedHosts.map((entry) => String(entry?.value?.code || "").trim().toUpperCase())
  );
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = makeAssessmentCode();
    if (!used.has(code) && !window.__crlAssessmentPeerStoreV1?.sessions?.has(code)) return code;
  }
  throw new Error("Unable to generate a unique assessment code.");
}

async function canReachCloud(originalFetch, maxAgeMs = 2500) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  if (Date.now() - reachabilityProbe.checkedAt < maxAgeMs) return reachabilityProbe.ok;
  if (reachabilityProbe.promise) return reachabilityProbe.promise;

  reachabilityProbe.promise = (async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1800);
    try {
      const response = await originalFetch(`/api/assessment/ping?offline_probe=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      reachabilityProbe = { checkedAt: Date.now(), ok: response.ok, promise: null };
      announceCloudReachability(response.ok);
      return response.ok;
    } catch {
      reachabilityProbe = { checkedAt: Date.now(), ok: false, promise: null };
      announceCloudReachability(false);
      return false;
    } finally {
      window.clearTimeout(timer);
    }
  })();
  return reachabilityProbe.promise;
}

// Bound an in-flight request too: a successful ping cannot guarantee that
// the next assessment request will finish before the connection disappears.
async function fetchCloudAssessment(originalFetch, input, init = {}, timeoutMs = 1800) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const incomingSignal = init?.signal;
  let connectionLost = false;
  const onOffline = () => { connectionLost = true; controller.abort(); };
  window.addEventListener?.("offline", onOffline, { once: true });
  if (incomingSignal?.aborted) controller.abort();
  else incomingSignal?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await originalFetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut || connectionLost) throw new TypeError("Assessment connection timed out or went offline; continue from the local copy.");
    throw error;
  } finally {
    window.clearTimeout(timer);
    incomingSignal?.removeEventListener("abort", abort);
    window.removeEventListener?.("offline", onOffline);
  }
}

function normalizePeriod(value) {
  const period = String(value || "BoSY").trim();
  return ["BoSY", "MoSY", "EoSY"].includes(period) ? period : "BoSY";
}

function getOfflineContentModes(snapshot, period) {
  const normalizedPeriod = normalizePeriod(period);
  return normalizeAssessmentContentModes(
    snapshot?.contentMode?.[normalizedPeriod]
  );
}

function getOfflineContentDefaults(snapshot, period) {
  const normalizedPeriod = normalizePeriod(period);
  return normalizeAssessmentContentDefaults(
    snapshot?.contentDefaults?.[normalizedPeriod]
  );
}

/*
 * Mirrors the server's catalogue read exactly: the full saved pool is narrowed
 * to what one assessment administers, using the same mode and the same seed
 * (the assessment code). An assessment that starts online and is later resumed
 * offline therefore keeps the very same letters, words and stories.
 */
function getOfflineAssessmentContent(snapshot, period, seed) {
  const normalizedPeriod = normalizePeriod(period);
  const defaults = cloneAssessmentContent(DEFAULT_ASSESSMENT_CONTENT);
  const source = snapshot?.activities?.[normalizedPeriod] || defaults[normalizedPeriod];
  const normalized = normalizeAssessmentPeriodContent(source);
  const trimmed = selectAssessmentContentForRun(
    normalized,
    getOfflineContentModes(snapshot, normalizedPeriod),
    seed,
    getOfflineContentDefaults(snapshot, normalizedPeriod)
  );
  const stories = trimmed.stories.map((story, index) => ({
    id: story?.id ?? `${normalizedPeriod.toLowerCase()}-story-${index + 1}`,
    title: String(story?.title || `Story ${index + 1}`),
    text: String(story?.text || ""),
    questions: getStoryQuestions(story),
    description: String(story?.description || "Story passage from Manage Assessment."),
    available: Boolean(String(story?.text || "").trim()),
  }));
  return {
    letters: trimmed.letters,
    words: trimmed.words,
    stories,
  };
}

function getOfflineQuestions(title, content) {
  return getSessionStoryQuestions({ story_title: title, assessment_content: content }).map(question => question.text);
}

function upsertOfflineResult(results, index, content, isCorrect, indexKey = "index") {
  const normalizedIndex = Number(index);
  const next = (Array.isArray(results) ? results : []).filter(
    (item) => Number(item?.[indexKey] ?? item?.index) !== normalizedIndex
  );
  next.push({
    [indexKey]: normalizedIndex,
    ...(indexKey !== "index" ? { index: normalizedIndex } : {}),
    content,
    isCorrect: Boolean(isCorrect),
  });
  return next.sort(
    (left, right) =>
      Number(left?.[indexKey] ?? left?.index) -
      Number(right?.[indexKey] ?? right?.index)
  );
}

function mergeOfflineComprehension(current, submitted) {
  if (!Array.isArray(submitted)) {
    return Array.isArray(current) ? current : [];
  }

  const byIndex = new Map();

  for (const item of Array.isArray(current) ? current : []) {
    const index = Number(item?.questionIndex ?? item?.question_index);
    if (Number.isInteger(index)) byIndex.set(index, item);
  }

  for (const item of submitted) {
    const index = Number(item?.questionIndex ?? item?.question_index);
    if (!Number.isInteger(index)) continue;
    byIndex.set(index, {
      questionIndex: index,
      isCorrect: Boolean(item?.isCorrect ?? item?.is_correct),
    });
  }

  return Array.from(byIndex.values()).sort(
    (left, right) =>
      Number(left.questionIndex) - Number(right.questionIndex)
  );
}

function mergeOfflineTaskResults(current, submitted, content) {
  const byIndex = new Map();
  for (const item of [...(Array.isArray(current) ? current : []), ...submitted]) {
    const index = Number(item?.index);
    if (!Number.isInteger(index) || index < 0 || index >= content.length) continue;
    byIndex.set(index, { index, content: content[index], isCorrect: Boolean(item?.isCorrect) });
  }
  return Array.from(byIndex.values()).sort((left, right) => left.index - right.index);
}

function calculateOfflineReadingProfile(totalPart1, readingAccuracy, comprehensionScore) {
  if (Number(totalPart1 || 0) <= 10) return "Low Emerging Reader";
  if (Number(readingAccuracy || 0) <= 25) return "High Emerging Reader";
  if (Number(readingAccuracy || 0) <= 50) {
    return Number(comprehensionScore || 0) === 0
      ? "High Emerging Reader"
      : "Developing Reader";
  }
  if (Number(readingAccuracy || 0) <= 75) {
    return Number(comprehensionScore || 0) <= 2
      ? "Developing Reader"
      : "Transitioning Reader";
  }
  return Number(comprehensionScore || 0) <= 4
    ? "Transitioning Reader"
    : "Reading At Grade Level";
}

function normalizeAssessmentAction(action) {
  const value = String(action || "").trim().toLowerCase();
  if (["host_join", "host-join", "join", "learner-join"].includes(value)) {
    return "learner_join";
  }
  if (["heartbeat", "learner-heartbeat"].includes(value)) {
    return "learner_heartbeat";
  }
  return value;
}

function passageWordsForHost(host) {
  const story = (host?.assessment_content?.stories || []).find(
    (item) =>
      String(item?.title || "").trim().toLowerCase() ===
      String(host?.story_title || "").trim().toLowerCase()
  );
  return String(story?.text || host?.current_content || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function calculateOfflineMetrics(host) {
  const task1 = Array.isArray(host?.task1Results) ? host.task1Results : [];
  const task2 = Array.isArray(host?.task2Results) ? host.task2Results : [];
  const miscues = Array.isArray(host?.passageMiscues) ? host.passageMiscues : [];
  const comprehension = Array.isArray(host?.comprehensionResults)
    ? host.comprehensionResults
    : [];
  const task1Score = task1.filter((item) => item?.isCorrect).length;
  const task2Score = task2.filter((item) => item?.isCorrect).length;
  const totalPart1Score = task1Score + task2Score;
  const timerSeconds =
    host?.timer_seconds !== null &&
    host?.timer_seconds !== undefined &&
    Number.isInteger(Number(host.timer_seconds))
    ? Math.max(0, Math.min(120, Number(host.timer_seconds)))
    : null;
  const passageWordCount = passageWordsForHost(host).length || 100;
  const passageWasAdministered = totalPart1Score > 10 && timerSeconds !== null;
  const totalMiscues = passageWasAdministered ? miscues.length : 0;
  const wordsRead = passageWasAdministered
    ? Math.max(0, passageWordCount - totalMiscues)
    : 0;
  const readingAccuracy = passageWasAdministered ? wordsRead : 0;
  /*
   * Comprehension answers can only exist once the passage stage actually ran,
   * so a recorded answer is always authoritative. Gating the score behind the
   * passage timer made a marked 3/6 read back as 0/6 whenever the timer value
   * had not been captured yet.
   */
  const comprehensionScore = comprehension.filter(
    (item) => item?.isCorrect
  ).length;
  const wpm = passageWasAdministered && timerSeconds > 0
    ? Number(((wordsRead / timerSeconds) * 60).toFixed(2))
    : null;

  return {
    task1Score,
    task2Score,
    totalPart1Score,
    part1ReadingLevel:
      totalPart1Score === 0
        ? "Full Refresher"
        : totalPart1Score <= 10
          ? "Moderate Refresher"
          : totalPart1Score <= 16
            ? "Light Refresher"
            : "Grade Ready",
    totalMiscues,
    wordsRead,
    passageWordCount,
    readingAccuracy,
    miscueAccuracy: readingAccuracy,
    timerSeconds,
    wpm,
    comprehensionScore,
    experienceRating: host?.experience_rating ?? null,
    observationLevel: host?.observation_level ?? null,
    remarks: host?.remarks || "",
    passageMiscues: passageWasAdministered ? miscues : [],
    storyNumber: String(host?.story_title || "").toLowerCase().includes("fields")
      ? 2
      : host?.story_title
        ? 1
        : null,
    classification: calculateOfflineReadingProfile(
      totalPart1Score,
      readingAccuracy,
      comprehensionScore
    ),
  };
}

function offlineAssessmentRecord(host, metrics) {
  return {
    id: Number(host?.server_assessment_session_id || host?.local_assessment_id || -Date.now()),
    learner_id: Number(host?.learner_id || 0),
    teacher_id: Number(host?.teacher_id || 0),
    assessment_period: normalizePeriod(host?.assessment_period),
    date_administered: host?.created_at || new Date().toISOString(),
    overall_classification: metrics.classification,
    is_completed: true,
    task1_score: metrics.task1Score,
    task2_score: metrics.task2Score,
    total_miscues: metrics.totalMiscues,
    miscue_accuracy: metrics.readingAccuracy,
    comprehension_score: metrics.comprehensionScore,
    classification_label: metrics.classification,
    timer_seconds: metrics.timerSeconds,
    experience_rating: metrics.experienceRating,
    observation_level: metrics.observationLevel,
    remarks: metrics.remarks || null,
    words_read: metrics.wordsRead,
    wpm: metrics.wpm,
    learner: host?.learner || null,
    task1_results: host?.task1Results || [],
    task2_results: host?.task2Results || [],
    passage_miscues: host?.passageMiscues || [],
    comprehension_results: host?.comprehensionResults || [],
    story_number: metrics.storyNumber,
    story_title: host?.story_title || null,
    story_questions: getSessionStoryQuestions(host).map(({ text, possibleAnswer }) => ({ text, possibleAnswer })),
    story_text: (host?.assessment_content?.stories || host?.story_choices || []).find(
      (story) => String(story?.title || "").trim().toLowerCase() ===
        String(host?.story_title || "").trim().toLowerCase()
    )?.text || "",
    offline_pending: true,
    offline_session_code: host?.code,
  };
}

function mergeHostPayload(host, payload) {
  const incoming = payload?.session || payload;
  if (!incoming || typeof incoming !== "object") return host;
  return {
    ...host,
    ...incoming,
    current_content:
      incoming.current_content ?? incoming.currentContent ?? host?.current_content ?? null,
    story_title:
      incoming.story_title ?? incoming.storyTitle ?? host?.story_title ?? "",
    task1Results:
      incoming.task1Results ?? payload?.task1Results ?? host?.task1Results ?? [],
    task2Results:
      incoming.task2Results ?? payload?.task2Results ?? host?.task2Results ?? [],
    comprehensionResults:
      incoming.comprehensionResults ??
      payload?.comprehensionResults ??
      host?.comprehensionResults ?? [],
    passageMiscues:
      incoming.metrics?.passageMiscues ??
      host?.passageMiscues ?? [],
    assessment_content:
      incoming.assessment_content ?? payload?.assessment_content ?? host?.assessment_content,
    story_choices:
      incoming.story_choices ?? payload?.story_choices ?? host?.story_choices,
    updated_at: new Date().toISOString(),
  };
}

async function rewriteQueuedReferences(transform, skippedId = "") {
  const pending = await getOfflineOutbox();
  await Promise.all(
    pending
      .filter((entry) => entry?.id && entry.id !== skippedId)
      .map(async (entry) => {
        const nextBody = transform(entry.body || {});
        if (nextBody === entry.body) return;
        await offlineSet(`outbox:${entry.id}`, { ...entry, body: nextBody });
      })
  );
}

const DATA_ACTIONS = new Set(["get_classes",
  "get_learners",
  "get_assessments",
  "get_activities",
  "get_assessment_detail",
]);

function sameOrigin(pathname) {
  return typeof window !== "undefined" && pathname.startsWith("/");
}

function parseAction(input) {
  try {
    const url = new URL(input, window.location.origin);
    return {
      url,
      pathname: url.pathname,
      action: String(url.searchParams.get("action") || "").trim().toLowerCase(),
    };
  } catch {
    return { url: null, pathname: "", action: "" };
  }
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

async function readResponseJson(response) {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

function isNetworkError(error) {
  return error instanceof TypeError || /network|fetch|offline|failed to fetch/i.test(String(error?.message || error));
}

function normalizeLearners(payload) {
  return Array.isArray(payload?.learners) ? payload.learners.filter(Boolean) : [];
}

function normalizeAssessments(payload) {
  return Array.isArray(payload?.assessments) ? payload.assessments.filter(Boolean) : [];
}

function learnerIdentity(learner) {
  return {
    id: Number(learner?.id ?? learner?.learner_id ?? learner?.learnerId ?? 0),
    lrn: String(learner?.lrn ?? learner?.LRN ?? "").trim(),
    class_section_id: classIdOf(learner),
  };
}

function sameLearner(left, right) {
  const a = learnerIdentity(left);
  const b = learnerIdentity(right);
  return (a.id && b.id && a.id === b.id) || (a.lrn && b.lrn && a.lrn === b.lrn && a.class_section_id === b.class_section_id);
}

function mergeCachedLearners(cached, cloud, tombstones = [], classes = null) {
  const live = row => !(classes?.deletedSectionIds||[]).includes(classIdOf(row));
  cached=(cached||[]).filter(live);cloud=(cloud||[]).filter(live);
  const deleted = Array.isArray(tombstones) ? tombstones.filter(Boolean) : [];
  const cloudLearners = (Array.isArray(cloud) ? cloud.filter(Boolean) : []).filter(
    (learner) => !deleted.some((tombstone) => sameLearner(learner, tombstone))
  );
  const pending = (Array.isArray(cached) ? cached : []).filter(
    (learner) =>
      learner?.offline_pending &&
      !deleted.some((tombstone) => sameLearner(learner, tombstone)) &&
      !cloudLearners.some(
        (remote) => sameLearner(remote, learner)
      )
  );
  return [...cloudLearners, ...pending];
}

function mergeCachedAssessments(cached, cloud, classes = null) {
  const live = row => !(classes?.deletedSectionIds||[]).includes(classIdOf(row.learner)||classIdOf(row));
  cached=(cached||[]).filter(live);cloud=(cloud||[]).filter(live);
  const cachedAssessments = Array.isArray(cached) ? cached.filter(Boolean) : [];
  const cloudAssessments = (Array.isArray(cloud) ? cloud.filter(Boolean) : []).map(
    (remote) => {
      const local = cachedAssessments.find(
        (item) => Number(item?.id) === Number(remote?.id)
      );
      return local?.offline_pending ? { ...remote, ...local } : local ? { ...local, ...remote } : remote;
    }
  );
  const pending = cachedAssessments.filter(
    (assessment) =>
      assessment?.offline_pending &&
      !cloudAssessments.some(
        (remote) =>
          Number(remote?.learner_id) === Number(assessment?.learner_id) &&
          String(remote?.assessment_period || "") ===
            String(assessment?.assessment_period || "") &&
          Boolean(remote?.is_completed)
      )
  );
  return [...cloudAssessments, ...pending];
}

function requestBody(init) {
  if (!init?.body) return {};
  try {
    return typeof init.body === "string" ? JSON.parse(init.body) : {};
  } catch {
    return {};
  }
}

function replaceLearnerIdInAssessments(assessments, localId, serverId) {
  return assessments.map((item) =>
    Number(item?.learner_id ?? item?.learnerId) === Number(localId)
      ? {
          ...item,
          learner_id: serverId,
          learnerId: serverId,
          learner: item?.learner
            ? {
                ...item.learner,
                id: serverId,
                local_id: Number(localId),
              }
            : item?.learner,
        }
      : item
  );
}

function replaceLearnerReferencesInBody(body, localId, serverId) {
  if (!body || typeof body !== "object") return body;
  const next = { ...body };
  if (Number(next.learner_id) === Number(localId)) {
    next.learner_id = Number(serverId);
  }
  if (Number(next.learnerId) === Number(localId)) {
    next.learnerId = Number(serverId);
  }
  if (Array.isArray(next.learner_ids)) {
    next.learner_ids = next.learner_ids.map((value) =>
      Number(value) === Number(localId) ? Number(serverId) : value
    );
  }
  return next;
}

function mergeClassCatalog(cached, cloud, entries=[]) {
  const deletedYearIds=[...new Set([...(cached?.deletedYearIds||[]),...(cloud?.deletedYearIds||[])])];
  const deletedSectionIds=[...new Set([...(cached?.deletedSectionIds||[]),...(cloud?.deletedSectionIds||[])])];
  const pending=new Set(entries.filter(entry=>["save_school_year","edit_school_year","save_class_section"].includes(entry.kind)).map(entry=>entry.body?.id));
  const merge=key=>[...(cloud?.[key]||[]).filter(item=>!pending.has(item.id)),...(cached?.[key]||[]).filter(item=>pending.has(item.id))];
  const cloudArchives=cloud?.archives||[];
  const pendingArchives=(cached?.archives||[]).filter(item=>item.offline_pending && !cloudArchives.some(saved=>saved.kind==="learner" && Number(saved.sourceLearnerId)===Number(item.sourceLearnerId)));
  return {schoolYears:merge("schoolYears").filter(x=>!deletedYearIds.includes(x.id)).sort((a,b)=>a.startYear-b.startYear),sections:merge("sections").filter(x=>!deletedSectionIds.includes(x.id)&&!deletedYearIds.includes(x.schoolYearId)),deletedYearIds,deletedSectionIds,archives:cloud?.archives ? [...pendingArchives,...cloudArchives] : cached?.archives||[]};
}
async function rememberLearnerArchives(userId, archives) {
  if (!Array.isArray(archives) || !archives.length) return;
  const ids=new Set(archives.map(item=>item.id));
  const learners=new Set(archives.map(item=>Number(item.sourceLearnerId)));
  await updateSnapshot(userId,current=>({classes:{...current.classes,archives:[...archives,...(current.classes?.archives||[]).filter(item=>!ids.has(item.id)&&!(item.offline_pending&&learners.has(Number(item.sourceLearnerId))))]}}));
}
async function reconcileClassCatalog(userId, cloud, alreadySerialized=false) {
  if (!Array.isArray(cloud?.schoolYears)||!Array.isArray(cloud?.sections)) return;
  const work=async()=>{
    let current=await getSnapshot(userId);
    const deadYears=new Set(cloud.deletedYearIds||[]),deadSections=new Set(cloud.deletedSectionIds||[]);
    for(const section of current.classes?.sections||[]) if(deadYears.has(section.schoolYearId))deadSections.add(section.id);
    for(const learner of current.learners)if(deadSections.has(classIdOf(learner))) await discardDeletedLearner(userId,Number(learner.id),true);
    const changes=[],alias=cloud.year_alias;
    for(const entry of await getOfflineOutbox()){
      if(Number(entry.userId)!==userId)continue;
      const body=entry.body||{};
      const deleted=deadSections.has(body.class_section_id)||deadYears.has(body.school_year_id)||["save_school_year","edit_school_year"].includes(entry.kind)&&deadYears.has(body.id)||entry.kind==="save_class_section"&&deadSections.has(body.id);
      if(deleted){changes.push({key:`outbox:${entry.id}`,remove:true});continue;}
      if(alias&&["save_class_section","edit_school_year"].includes(entry.kind)){
        const next={...body};if(next.school_year_id===alias.from)next.school_year_id=alias.to;if(entry.kind==="edit_school_year"&&next.id===alias.from)next.id=alias.to;
        changes.push({key:`outbox:${entry.id}`,value:{...entry,body:next}});
      }
    }
    if(changes.length)await offlineApplyChanges(changes);
    current=await getSnapshot(userId);
    const cached=alias?{...current.classes,schoolYears:(current.classes?.schoolYears||[]).filter(x=>x.id!==alias.from),sections:(current.classes?.sections||[]).map(x=>x.schoolYearId===alias.from?{...x,schoolYearId:alias.to}:x)}:current.classes;
    const pending=await getOfflineOutbox();
    await updateSnapshot(userId,()=>({classes:mergeClassCatalog(cached,cloud,pending)}));
  };
  return alreadySerialized?work():serializeOfflineMutation(work);
}
// Bind only pre-upgrade, unscoped work to the uniquely matching backfilled
// 2026 class. Never move already scoped work or infer a newer enrollment.
async function upgradeLegacyClassWork(userId, catalog) {
  if (!Array.isArray(catalog?.schoolYears) || !Array.isArray(catalog?.sections)) return;
  await serializeOfflineMutation(async () => {
    const snapshot = await getSnapshot(userId);
    const legacyYears = new Set(catalog.schoolYears.filter(year => year.startYear === 2026).map(year => year.id));
    const match = row => {
      const name = String(row?.section || snapshot.user?.section || "Unassigned").trim().toLowerCase();
      const candidates = catalog.sections.filter(section => legacyYears.has(section.schoolYearId) && section.name.toLowerCase() === name && !section.archivedAt);
      return candidates.length === 1 ? candidates[0].id : null;
    };
    const learners = snapshot.learners.map(row => classIdOf(row) ? row : { ...row, class_section_id: match(row) });
    const changes = [];
    for (const entry of await getOfflineOutbox()) {
      if (Number(entry.userId) !== userId || entry.kind !== "add_learner" || classIdOf(entry.body)) continue;
      const id = match(entry.body);
      if (id) changes.push({ key: `outbox:${entry.id}`, value: { ...entry, body: { ...entry.body, class_section_id: id, roster_version: snapshot.rosterVersion || 0 } } });
    }
    if (changes.length || learners.some((row, index) => classIdOf(row) !== classIdOf(snapshot.learners[index]))) {
      changes.push({ key: `teacher_snapshot:${userId}`, value: { ...snapshot, learners, savedAt: Date.now() } });
      await offlineApplyChanges(changes);
    }
  });
}
async function reconcileRosterVersion(userId, value) {
  if(!Number.isInteger(value)||value<0)return;
  if(value<=Number((await getSnapshot(userId)).rosterVersion||0))return;
  await serializeOfflineMutation(async()=>{
    const current=await getSnapshot(userId);
    if(value<=Number(current.rosterVersion||0))return;
    const hosts=(await offlineList("host_session:")).map(row=>row.value).filter(host=>Number(host.teacher_id)===userId);
    const codes=hosts.map(host=>host.code);
    const entries=await getOfflineOutbox();
    const related=entry=>OFFLINE_ASSESSMENT_ACTIONS.has(entry.kind)||["add_learner","delete_learner","delete_learners","save_assessment_records","assessment_commit"].includes(entry.kind);
    const changes=entries.filter(entry=>(!entry.userId||Number(entry.userId)===userId)&&related(entry)).map(entry=>({key:`outbox:${entry.id}`,remove:true}));
    for(const host of hosts) changes.push({key:`host_session:${host.code}`,value:{code:host.code,teacher_id:userId,learner_id:host.learner_id,ended:true,deleted:true,stage:"ended",local_delete_pending:true}});
    for(const row of await offlineList(`sync_recovery:${userId}:`))changes.push({key:row.key,remove:true});
    changes.push({key:`teacher_snapshot:${userId}`,value:{...current,learners:[],assessments:[],learnerTombstones:[],deletedLearners:[],classes:{...current.classes,archives:[]},rosterVersion:value,savedAt:Date.now()}});
    await offlineApplyChanges(changes);
    await finishDeletedSessionCleanup(userId,codes);
    announceTeacherDataUpdated("roster-reset");
  });
}

async function getSnapshot(userId) {
  const saved = await getOfflineTeacherSnapshot(userId).catch(() => null);
  return {
    ...SNAPSHOT_DEFAULT,
    ...(saved || {}),
    learners: Array.isArray(saved?.learners) ? saved.learners : [],
    assessments: Array.isArray(saved?.assessments) ? saved.assessments : [],
    learnerTombstones: Array.isArray(saved?.learnerTombstones)
      ? saved.learnerTombstones
      : [],
  };
}

function updateSnapshot(userId, updater) {
  const task = async () => {
    const current = await getSnapshot(userId);
    const patch = typeof updater === "function"
      ? await updater(current)
      : updater;
    const next = { ...current, ...(patch || {}), savedAt: Date.now() };
    await saveOfflineTeacherSnapshot(userId, next);
    return next;
  };
  const pending = snapshotMutationChain.then(task, task);
  snapshotMutationChain = pending.catch(() => {});
  return pending;
}

function setSnapshot(userId, patch) {
  return updateSnapshot(userId, patch);
}

function extractOfflineToken(session) {
  if (session?.signedOut) return "";
  return String(session?.offlineToken || session?.token || "").trim();
}

function isActiveOfflineSession(session) {
  return Boolean(
    session &&
    !session.signedOut &&
    extractOfflineToken(session) &&
    Number(session.expiresAt || 0) > Date.now() &&
    Number(session.user?.id || 0) > 0
  );
}

async function bootstrapOfflineSession({ allowSignedOut = false } = {}) {
  try {
    const response = await fetch("/api/auth/offline", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.offlineToken || !data?.user?.id) return null;
    const existing = await getOfflineTeacherSession().catch(() => null);
    if (existing?.signedOut && !allowSignedOut) return null;

    const session = {
      version: 1,
      user: data.user,
      offlineToken: data.offlineToken,
      expiresAt: Number(data.expiresAt || 0),
      signedOut: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveOfflineTeacherSession(session);
    return session;
  } catch {
    return null;
  }
}

async function rememberSuccessfulAuth(payload, { allowSignedOut = false } = {}) {
  if (!payload?.user?.id) return;
  const existing = await getOfflineTeacherSession().catch(() => null);
  if (existing?.signedOut && !allowSignedOut) return;
  await saveOfflineTeacherSession({
    ...(existing || {}),
    user: payload.user,
    signedOut: false,
    updatedAt: Date.now(),
  }).catch(() => {});

  const bootstrapped = await bootstrapOfflineSession({ allowSignedOut });
  if (bootstrapped?.user?.id) {
    await setSnapshot(bootstrapped.user.id, { user: bootstrapped.user });
    void warmTeacherSnapshot(bootstrapped.user.id);
  }
}

async function warmTeacherSnapshot(userId) {
  const session = await getOfflineTeacherSession().catch(() => null);
  const token = isActiveOfflineSession(session) ? extractOfflineToken(session) : "";
  const requests = [
    ["/api/assessment?action=get_classes", "classes"],
    ["/api/assessment?action=get_learners", "learners"],
    ["/api/assessment?action=get_assessments", "assessments"],
    ["/api/assessment?action=get_activities", "activities"],
  ];

  const responses = await Promise.all(
    requests.map(async ([url, key]) => {
      try {
        const response = await fetchCloudAssessment(
          window.__crlOriginalFetch,
          url,
          makeBearerInit(
            {
              credentials: "include",
              cache: "no-store",
              headers: { Accept: "application/json" },
            },
            token
          ),
          10000
        );
        if (!response.ok) return [key, null];
        return [key, await response.json()];
      } catch {
        return [key, null];
      }
    })
  );

  const cloud = Object.fromEntries(responses);
  if(cloud.classes) await reconcileRosterVersion(userId,cloud.classes.roster_version);
  if(cloud.learners) await reconcileRosterVersion(userId,cloud.learners.roster_version);
  const currentVersion = Number((await getSnapshot(userId)).rosterVersion || 0);
  for (const key of ["learners", "assessments"]) {
    if (cloud[key] && Number(cloud[key].roster_version || 0) < currentVersion) cloud[key] = null;
  }
  if (cloud.classes?.sections) { await reconcileClassCatalog(userId, cloud.classes); await upgradeLegacyClassWork(userId, cloud.classes); }
  const pendingClasses = await getOfflineOutbox();

  await updateSnapshot(userId, (current) => ({
    ...(cloud.classes?.sections ? { classes: mergeClassCatalog(current.classes, cloud.classes, pendingClasses) } : {}),
    ...(cloud.learners
      ? {
          learners: mergeCachedLearners(
            current.learners,
            normalizeLearners(cloud.learners),
            current.learnerTombstones, current.classes
          ),
        }
      : {}),
    ...(cloud.assessments
      ? {
          assessments: mergeCachedAssessments(
            current.assessments,
            normalizeAssessments(cloud.assessments), current.classes
          ),
        }
      : {}),
    ...(cloud.activities?.activities && !current.activitiesOfflinePending
      ? { activities: cloud.activities.activities }
      : {}),
    ...(cloud.activities?.contentMode && !current.contentModeOfflinePending
      ? { contentMode: cloud.activities.contentMode }
      : {}),
    ...(cloud.activities?.contentDefaults && !current.contentModeOfflinePending
      ? { contentDefaults: cloud.activities.contentDefaults }
      : {}),
  })).catch(() => {});
}

function makeBearerInit(init, token) {
  const next = { ...(init || {}) };
  const headers = new Headers(next.headers || {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  next.headers = headers;
  return next;
}

async function finishDeletedSessionCleanup(userId, codes) {
  if (!codes.length) return;
  // The terminal host markers are committed first. If this second database
  // fails, its pending flag retries cleanup and blocks all late writes.
  await purgeAssessmentSessionData(codes);
  const changes = [];
  for (const code of codes) {
    const host = await getOfflineHostSession(code);
    if (host?.deleted && Number(host.teacher_id) === userId) changes.push({ key: `host_session:${code}`, value: { ...host, local_delete_pending: false } });
    disconnectAssessmentPeer(code);
  }
  if (changes.length) await offlineApplyChanges(changes);
  try { discardRecoveryCodes(userId, codes); } catch {}
  try {
    const saved = JSON.parse(window.localStorage?.getItem("crla_host_session") || "null");
    if (codes.includes(String(saved?.code || saved?.session?.code || "").toUpperCase())) window.localStorage.removeItem("crla_host_session");
  } catch {}
}

async function discardDeletedLearner(userId, learnerId, alreadySerialized = false) {
  const work = async () => {
    const commit = async () => {
      const active = await getOfflineTeacherSession();
      if (!isActiveOfflineSession(active) || Number(active.user.id) !== userId) return 0;
      const snapshot = await getOfflineTeacherSnapshot(userId) || SNAPSHOT_DEFAULT;
      const entries = await getOfflineOutbox();
      const hosts = (await offlineList("host_session:")).map(item => item.value);
      const archives = await offlineList(`sync_recovery:${userId}:`);
      const plan = planDeletedLearnerCleanup({ userId, learnerId, snapshot, entries, hosts, archives, now: Date.now() });
      if (!plan) return 0;
      await offlineApplyChanges(plan.changes);
      await finishDeletedSessionCleanup(userId, plan.codes);
      announceTeacherDataUpdated("learner-deleted");
      return plan.removed;
    };
    const pending = snapshotMutationChain.then(commit, commit);
    snapshotMutationChain = pending.catch(() => {});
    return pending;
  };
  return alreadySerialized ? work() : serializeOfflineMutation(work);
}

async function cleanupLegacyDeletedLearners(userId) {
  const archives = await offlineList(`sync_recovery:${userId}:`);
  const hosts = (await offlineList("host_session:")).map(item => item.value);
  const ids = new Set(archives.filter(row => Number(row.value?.userId) === userId).map(row => Number(row.value.learnerId)));
  for (const host of hosts) if (host?.offline_recovery_id && Number(host.teacher_id) === userId) ids.add(Number(host.learner_id));
  for (const id of ids) await discardDeletedLearner(userId, id);
  const pending = (await offlineList("host_session:")).map(row => row.value)
    .filter(host => host?.deleted && host.local_delete_pending && Number(host.teacher_id) === userId);
  if (pending.length) await serializeOfflineMutation(() => finishDeletedSessionCleanup(userId, pending.map(host => host.code)));
}

async function reconcileUnavailableLearners(entries, userId, token) {
  if (!entries.some(entry=>!entry.userId||Number(entry.userId)===userId)) return 0;
  const catalogResponse=await fetchCloudAssessment(window.__crlOriginalFetch,"/api/assessment?action=get_classes",makeBearerInit({credentials:"include",cache:"no-store"},token),10000);
  const catalog=await readResponseJson(catalogResponse);
  if(catalogResponse.ok&&catalog?.status==="ok"&&!catalog.offline){await reconcileRosterVersion(userId,catalog.roster_version);await reconcileClassCatalog(userId,catalog);}
  const snapshot = await getOfflineTeacherSnapshot(userId) || SNAPSHOT_DEFAULT;
  const hosts = (await offlineList("host_session:")).map(row => row.value);
  const candidates = queuedLearnerIds({ userId, entries, hosts, snapshot });
  if (!candidates.length && !entries.some(entry=>entry.kind==="add_learner")) return 0;
  const response = await fetchCloudAssessment(window.__crlOriginalFetch, "/api/assessment?action=get_learners",
    makeBearerInit({ credentials: "include", cache: "no-store", headers: { Accept: "application/json" } }, token), 10000);
  const data = await readResponseJson(response);
  if (!response.ok || data?.status !== "ok" || !Array.isArray(data.learners) || data.offline) return 0;
  await reconcileRosterVersion(userId,data.roster_version);
  if (Number(data.roster_version || 0) < Number((await getSnapshot(userId)).rosterVersion || 0)) return 0;
  const ownedIds = new Set(data.learners.map(learner => Number(learner.id)));
  let removed = 0;
  for (const learnerId of candidates) if (learnerId > 0 && !ownedIds.has(learnerId)) {
    removed += await discardDeletedLearner(userId, learnerId);
  }
  return removed;
}

async function performOutboxSync() {
  const session = await getOfflineTeacherSession();
  if (!isActiveOfflineSession(session)) {
    publishSyncStatus({ phase: "idle" });
    return;
  }
  const userId = Number(session.user.id);
  await cleanupLegacyDeletedLearners(userId);
  const entries = await getOfflineOutbox();
  if (!entries.length) {
    if (window.__crlOfflineSyncStatus?.phase !== "success") publishSyncStatus({ phase: "idle" });
    return;
  }
  const token = extractOfflineToken(session);
  const learnerIdMap = new Map();
  const hostCodeMap = new Map();
  let synchronizedAny = false;
  let discarded = 0;
  let completed = 0;
  let failure = "";
  let blocked = false;
  let current = null;
  if (!navigator.onLine || !window.__crlOriginalFetch || !await canReachCloud(window.__crlOriginalFetch)) {
    publishSyncStatus({ phase: "waiting", completed: 0, total: entries.length,
      message: "Saved on this device. Waiting for an internet connection." });
    return;
  }
  // Verify the roster once before replay, so obsolete learners from older
  // versions are cleared without repeatedly submitting known-invalid starts.
  discarded += await reconcileUnavailableLearners(entries, userId, token);
  if (entries.some(entry => entry.kind === "add_learner" && !classIdOf(entry.body))) await warmTeacherSnapshot(userId);
  for (const queuedEntry of entries) {
    try {
      const activeSession = await getOfflineTeacherSession();
      if (!isActiveOfflineSession(activeSession) || Number(activeSession.user.id) !== userId) {
        publishSyncStatus({ phase: "idle" });
        return;
      }
      // Re-read after preceding acknowledgements may have replaced local IDs.
      const pending = await getOfflineOutbox();
      const entry = pending.find(item => item.id === queuedEntry.id);
      if (!entry) continue;
      if (entry.userId && Number(entry.userId) !== userId) {
        blocked = true;
        failure = "Sign in to the account that saved these changes to synchronize them.";
        current = null;
        break;
      }
      current = await describeOfflineMutation(entry, userId);
      publishSyncStatus({ phase: "syncing", completed, total: completed + pending.length, current,
        message: "Keep this app open while changes are being synchronized." });
      const originalBody = entry.body || {};
      const offlineCode = String(
        entry.kind === "host_start"
          ? originalBody.offline_code || ""
          : originalBody.code || ""
      ).trim().toUpperCase();
      const localHost = offlineCode
        ? await getOfflineHostSession(offlineCode).catch(() => null)
        : null;
      if (localHost?.deleted && Number(localHost.teacher_id) === userId) {
        const removed = await discardDeletedLearner(userId, localHost.learner_id);
        if (removed) { discarded += removed; continue; }
      }

      const mappedLearnerId = learnerIdMap.get(
        Number(originalBody.learner_id ?? originalBody.learnerId)
      );
      const mappedLearnerIds = Array.isArray(originalBody.learner_ids)
        ? originalBody.learner_ids.map((value) =>
            learnerIdMap.get(Number(value)) || value
          )
        : null;
      const mappedCode =
        hostCodeMap.get(String(originalBody.code || "").toUpperCase()) ||
        localHost?.server_code ||
        originalBody.code;
      const body = {
        ...originalBody,
        _offline_replay: true,
        ...(mappedLearnerId ? { learner_id: mappedLearnerId } : {}),
        ...(mappedLearnerIds ? { learner_ids: mappedLearnerIds } : {}),
        ...(mappedCode ? { code: mappedCode } : {}),
      };
      const init = makeBearerInit(
        {
          method: entry.method || "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        },
        token
      );

      const response = await fetchCloudAssessment(window.__crlOriginalFetch, entry.url, init,
        entry.kind === "save_final_assessment_review" ? 45000 : 10000);
      // Assessment mutations are an ordered journal. If one request cannot
      // be accepted, leave it and every later request queued so stages and
      // recorded answers can never be replayed out of order.
      if (!response.ok) {
        const rejected = await readResponseJson(response);
        if ([403, 404].includes(response.status)) {
          const removed = await reconcileUnavailableLearners([{ ...entry, body }], userId, token);
          if (removed) {
            discarded += removed;
            // A mixed record-edit batch may still contain valid learners.
            // Replay its remaining portion before any newer edits after it.
            if ((await getOfflineOutbox()).some(item => item.id === entry.id)) entries.splice(entries.indexOf(queuedEntry) + 1, 0, { id: entry.id });
            continue;
          }
        }
        const reason = typeof rejected?.error === "string" ? rejected.error.trim().slice(0, 240) : "";
        blocked = response.status >= 400 && response.status < 500;
        failure = response.status === 401 || response.status === 403
          ? "Sign in again to continue syncing. Your queued changes are still saved on this device."
          : response.status >= 400 && response.status < 500
            ? `${reason || "The server could not accept this item."} Your changes remain saved on this device. Retry after resolving the issue.`
            : "Connection interrupted. Your changes remain saved and will retry automatically.";
        break;
      }

      const data = await readResponseJson(response);
      if (!data || typeof data !== "object" || data.error || data.status === "error" ||
        (entry.kind === "host_start" && !data.code)) {
        throw new Error("The server did not acknowledge this change.");
      }
      await serializeOfflineMutation(async () => {
        const later = (await getOfflineOutbox()).filter(item => item.id !== entry.id);
        const hasLaterKind = kind => later.some(item => item.kind === kind);
        if (userId > 0 && ["save_school_year", "edit_school_year", "save_class_section"].includes(entry.kind)) {
          await reconcileClassCatalog(userId,data,true);
          const remaining=await getOfflineOutbox();
          const pending=remaining.filter(item=>item.id!==entry.id && ["save_school_year","edit_school_year","save_class_section"].includes(item.kind));
          await updateSnapshot(userId,current=>({classes:mergeClassCatalog(current.classes,data,pending)}));
        }
        if (userId > 0 && entry.kind === "add_learner" && data?.learner?.id && entry.localId) {
          learnerIdMap.set(Number(entry.localId), Number(data.learner.id));
          await updateSnapshot(userId, (current) => ({
            learners: current.learners.map((learner) =>
              Number(learner?.id) === Number(entry.localId)
                ? {
                    ...learner,
                    ...data.learner,
                    id: data.learner.id,
                    local_id: Number(entry.localId),
                    offline_pending: false,
                  }
                : learner
            ),
            classes: {...current.classes, archives: (current.classes?.archives||[]).map(item=>item.offline_pending && Number(item.sourceLearnerId)===Number(entry.localId) ? {...item,sourceLearnerId:Number(data.learner.id)} : item)},
            assessments: replaceLearnerIdInAssessments(current.assessments, entry.localId, data.learner.id),
            learnerTombstones: current.learnerTombstones.map((tombstone) =>
              Number(tombstone?.id) === Number(entry.localId)
                ? { ...tombstone, id: Number(data.learner.id) }
                : tombstone
            ),
          }));
          await rewriteQueuedReferences(
            (queuedBody) => replaceLearnerReferencesInBody(
              queuedBody,
              entry.localId,
              data.learner.id
            ),
            entry.id
          );
          const localHosts = await offlineList("host_session:").catch(() => []);
          await Promise.all(
            localHosts
              .filter(({ value }) => Number(value?.learner_id) === Number(entry.localId))
              .map(({ value }) => saveOfflineHostSession(value.code, {
                ...value,
                learner_id: Number(data.learner.id),
                learner: value.learner
                  ? { ...value.learner, ...data.learner, id: Number(data.learner.id) }
                  : data.learner,
              }))
          );
        }

        if (
          userId > 0 &&
          ["delete_learner", "delete_learners"].includes(entry.kind)
        ) {
          const deletedIds = new Set(
            (entry.kind === "delete_learners"
              ? body.learner_ids || []
              : [body.learner_id]
            ).map(Number)
          );
          const deletedLrn = String(body?.lrn || "").trim();
          await rememberLearnerArchives(userId, data.learner_archives);
          for (const id of deletedIds) await discardDeletedLearner(userId, id, true);
          await updateSnapshot(userId, (current) => ({
            learnerTombstones: current.learnerTombstones.filter((tombstone) => {
              const identity = learnerIdentity(tombstone);
              return !deletedIds.has(identity.id) &&
                !(deletedLrn && identity.lrn === deletedLrn);
            }),
          }));
        }

        if (entry.kind === "host_start" && offlineCode && data?.code) {
          const serverCode = String(data.code).trim().toUpperCase();
          if (serverCode !== offlineCode) {
            throw new Error("The cloud relay did not preserve the offline assessment code.");
          }
          hostCodeMap.set(offlineCode, serverCode);
          if (localHost) {
            const latestHost = await getOfflineHostSession(offlineCode);
            if (latestHost) await saveOfflineHostSession(offlineCode, {
              ...latestHost,
              server_code: serverCode,
              server_assessment_session_id: data?.assessment_session_id ?? null,
              synced_at: new Date().toISOString(),
            });
          }
          await rewriteQueuedReferences(
            (queuedBody) =>
              String(queuedBody?.code || "").trim().toUpperCase() === offlineCode
                ? { ...queuedBody, code: serverCode }
                : queuedBody,
            entry.id
          );
        }

        if (userId > 0 && entry.kind === "save_activities" && !hasLaterKind("save_activities")) {
          await updateSnapshot(userId, (current) => ({
            activities: data?.activities || current.activities,
            ...(data?.contentMode && !hasLaterKind("save_content_mode") ? { contentMode: data.contentMode } : {}),
            activitiesOfflinePending: false,
          }));
        }

        if (userId > 0 && entry.kind === "save_content_mode" && !hasLaterKind("save_content_mode")) {
          await updateSnapshot(userId, (current) => ({
            contentMode: data?.contentMode || current.contentMode,
            contentDefaults: data?.contentDefaults || current.contentDefaults,
            contentModeOfflinePending: false,
          }));
        }

        if (userId > 0 && entry.kind === "save_assessment_records") {
          const savedRecords = Array.isArray(data?.assessments)
            ? data.assessments
            : [];
          if (savedRecords.length) {
            const pendingRecordIds = new Set(later.filter(item => item.kind === "save_assessment_records")
              .flatMap(item => item.body?.records || []).map(item => Number(item.id)));
            const byId = new Map(
              savedRecords.filter(assessment => !pendingRecordIds.has(Number(assessment.id)))
                .map((assessment) => [Number(assessment.id), assessment])
            );
            await updateSnapshot(userId, (current) => ({
              assessments: current.assessments.map((assessment) =>
                byId.has(Number(assessment.id))
                  ? {
                      ...assessment,
                      ...byId.get(Number(assessment.id)),
                      offline_pending: false,
                    }
                  : assessment
              ),
            }));
          }
        }

        if (entry.kind === "save_final_assessment_review" && localHost?.server_assessment_session_id) {
          const serverId = Number(localHost.server_assessment_session_id);
          const localId = Number(localHost.local_assessment_id);
          const pendingEdit = later.some(item => item.kind === "save_assessment_records" &&
            item.body?.records?.some(record => [localId, serverId].includes(Number(record.id))));
          await updateSnapshot(userId, current => ({
            assessments: current.assessments.map(record => record.offline_session_code === offlineCode
              ? { ...record, id: serverId, offline_pending: pendingEdit } : record),
          }));
          // Records edited before their offline-created session reached the
          // server must use that session's acknowledged ID when replayed.
          await rewriteQueuedReferences(queuedBody => Array.isArray(queuedBody.records)
            ? { ...queuedBody, records: queuedBody.records.map(record => Number(record.id) === localId
              ? { ...record, id: serverId } : record) } : queuedBody, entry.id);
        }

        await removeOfflineMutation(entry.id);
      });
      synchronizedAny = true;
      completed += 1;
    } catch {
      // Keep this mutation and the untouched tail for the next reconnect.
      failure = "Sync paused. Your changes remain saved on this device and will retry automatically.";
      break;
    }
  }

  if (synchronizedAny) {
    // Release local authority only after checking the journal and updating
    // its host in the same mutation queue. A mark entered during reconnect
    // must keep the run local until that new mark has also been acknowledged.
    await serializeOfflineMutation(async () => {
      const remainingEntries = await getOfflineOutbox();
      const pendingCodes = new Set(remainingEntries.map(entry =>
        String(entry?.body?.offline_code || entry?.body?.code || "").trim().toUpperCase()
      ).filter(Boolean));
      const storedHosts = await offlineList("host_session:").catch(() => []);
      for (const { value: host } of storedHosts) {
        if (!host || host.deleted || pendingCodes.has(String(host.code || "").trim().toUpperCase())) continue;
        const serverReady = !host.offline_created || Boolean(host.server_code);
        if (serverReady && (host.local_pending_sync || host.offline_created)) {
          await saveOfflineHostSession(host.code, {
            ...host, local_pending_sync: false, offline_created: false, offline: false,
            synced_at: new Date().toISOString(),
          });
        }
      }
    });

    const userId = Number(session?.user?.id || 0);
    if (userId > 0) await warmTeacherSnapshot(userId);
    announceTeacherDataUpdated("outbox-synchronized");
  }
  await serializeOfflineMutation(async () => {
    const remaining = await getOfflineOutbox();
    const activeSession = await getOfflineTeacherSession();
    if (!isActiveOfflineSession(activeSession) || Number(activeSession.user.id) !== userId) {
      publishSyncStatus({ phase: "idle" });
    } else if (remaining.length) {
      publishSyncStatus({ phase: blocked ? "blocked" : "waiting", completed, total: completed + remaining.length, current,
        message: failure || "More changes are queued. Synchronization continues automatically." });
    } else if (synchronizedAny) {
      publishSyncStatus({ phase: "success", completed, total: completed, current,
        message: "All queued changes have been acknowledged by the server." });
    } else if (discarded) {
      publishSyncStatus({ phase: "idle" });
    }
  });
}

function syncOutbox() {
  if (outboxSyncPromise) return outboxSyncPromise;
  // A second open teacher tab must not replay the same journal concurrently.
  const replay = navigator.locks?.request
    ? navigator.locks.request("crl-teacher-outbox-sync", { ifAvailable: true }, lock => lock ? performOutboxSync() : undefined)
    : performOutboxSync();
  outboxSyncPromise = replay.catch(() => {
    publishSyncStatus({ phase: "waiting", message: "Unable to read or synchronize saved changes. Nothing has been discarded; retrying automatically." });
  }).finally(() => {
    outboxSyncPromise = null;
  });
  return outboxSyncPromise;
}

async function offlineTeacherData(action) {
  const url = arguments[1];
  const session = await getOfflineTeacherSession();
  if (!isActiveOfflineSession(session)) return null;
  const userId = Number(session?.user?.id || 0);
  if (!userId) return null;
  const snapshot = await getSnapshot(userId);

  if (action === "get_classes") return jsonResponse({ status: "ok", ...(snapshot.classes || SNAPSHOT_DEFAULT.classes), roster_version: snapshot.rosterVersion || 0, offline: true });
  if (action === "get_learners") return jsonResponse({ status: "ok", learners: snapshot.learners, roster_version:snapshot.rosterVersion||0, offline: true });
  if (action === "get_assessments") return jsonResponse({ status: "ok", assessments: snapshot.assessments, offline: true });
  if (action === "get_assessment_detail") {
    const assessmentId = Number(url?.searchParams?.get("assessment_id"));
    const assessment = snapshot.assessments.find(
      (item) => Number(item?.id) === assessmentId
    );
    if (!assessment) return jsonResponse({ error: "Assessment result is not available offline." }, 404);
    const classSectionId = url?.searchParams?.get("class_section_id");
    if (classSectionId) {
      const section = snapshot.classes?.sections?.find(row => row.id === classSectionId);
      if (!analyticsClassScope(snapshot.classes, section?.schoolYearId, classSectionId, snapshot.learners, [assessment], userId).assessments.length) return jsonResponse({error:"Assessment result is not available in this class."},404);
    }
    return jsonResponse({ status: "ok", assessment, offline: true });
  }
  if (action === "get_activities") {
    return jsonResponse({
      status: "ok",
      activities: snapshot.activities || null,
      contentMode: snapshot.contentMode || null,
      contentDefaults: snapshot.contentDefaults || null,
      offline: true,
    });
  }
  return null;
}

async function handleOfflineTeacherMutation(action, init) {
  const session = await getOfflineTeacherSession();
  if (!isActiveOfflineSession(session)) return null;
  const userId = Number(session?.user?.id || 0);
  if (!userId) return null;
  const body = requestBody(init);
  const snapshot = await getSnapshot(userId);

  if (["save_school_year", "edit_school_year", "save_class_section"].includes(action)) {
    if (!UUID_PATTERN.test(String(body.id || ""))) return jsonResponse({error:"A valid class identifier is required."},400);
    const classes = {...SNAPSHOT_DEFAULT.classes, ...(snapshot.classes || {})};
    let next;
    try {
      if (["save_school_year", "edit_school_year"].includes(action)) {
        const currentYear=classes.schoolYears.find(item=>item.id===body.id);
        if(action==="edit_school_year"&&(!currentYear||currentYear.archivedAt))return jsonResponse({error:"Choose an active school year."},409);
        if((classes.deletedYearIds||[]).includes(body.id))return jsonResponse({error:"This school year was deleted."},409);
        const label=schoolYearLabel(body.start_year);
        const existing=classes.schoolYears.find(item=>item.startYear===Number(body.start_year));
        if (existing && existing.id!==body.id) return jsonResponse({error:"This school year already exists. Choose it from the menu."},409);
        next={...classes,schoolYears:[...classes.schoolYears.filter(item=>item.id!==body.id),{id:body.id,startYear:Number(body.start_year),label,teacherId:userId,offline_pending:true}]};
      } else {
        const name=sectionName(body.name), year=classes.schoolYears.find(item=>item.id===body.school_year_id);
        if(!year||year.archivedAt||(classes.deletedSectionIds||[]).includes(body.id)) return jsonResponse({error:"Choose an active school year and section."},409);
        const existing=classes.sections.find(item=>item.id===body.id);
        if(existing?.archivedAt || existing && existing.schoolYearId!==year.id) return jsonResponse({error:"This section cannot be changed."},409);
        if(classes.sections.some(item=>item.id!==body.id && item.schoolYearId===year.id && item.name.toLowerCase()===name.toLowerCase())) return jsonResponse({error:"This section already exists in the school year."},409);
        next={...classes,sections:[...classes.sections.filter(item=>item.id!==body.id),{...existing,id:body.id,schoolYearId:year.id,teacherId:userId,name,nameKey:name.toLowerCase(),offline_pending:true}]};
      }
    } catch(error){return jsonResponse({error:error.message},400);}
    await updateSnapshot(userId,current=>({classes:next,...(action==='save_class_section'?{learners:current.learners.map(item=>classIdOf(item)===body.id?{...item,section:body.name.trim()}:item)}:{})}));
    await queueOfflineMutation({kind:action,url:`/api/assessment?action=${action}`,method:"POST",body});
    return jsonResponse({status:"ok",...next,roster_version:snapshot.rosterVersion||0,offline:true});
  }

  if (action === "save_activities") {
    const period = normalizePeriod(body?.period);
    const source = body?.content || body?.activities;
    const periodContent = source?.[period] || source;
    if (!periodContent) {
      return jsonResponse({ error: "Assessment content is missing." }, 400);
    }
    const normalized = normalizeAssessmentPeriodContent(periodContent);
    const issues = getAssessmentContentIssues(normalized);
    normalized.stories.forEach((story, index) => {
      for (const message of getStoryQuestionIssues(story, { requireAnswers: true })) issues.push({ category: "stories", index, message: `Story ${index + 1}: ${message}` });
    });
    if (issues.length) {
      return jsonResponse(
        { error: "Assessment content is incomplete.", issues },
        400
      );
    }
    const nextActivities = {
      ...cloneAssessmentContent(snapshot.activities || DEFAULT_ASSESSMENT_CONTENT),
      [period]: normalized,
    };
    await setSnapshot(userId, {
      activities: nextActivities,
      activitiesOfflinePending: true,
    });
    await queueOfflineMutation({
      syncLabel: { title: "Assessment content", details: [period, ...describeContentChanges(snapshot.activities?.[period], normalized)] },
      kind: "save_activities",
      url: "/api/assessment?action=save_activities",
      method: "POST",
      body: {
        action: "save_activities",
        period,
        content: normalized,
      },
    });
    return jsonResponse({
      status: "ok",
      period,
      activities: nextActivities,
      offline: true,
    });
  }

  if (action === "save_content_mode") {
    const period = normalizePeriod(body?.period);
    /*
     * Whatever the request leaves out keeps its stored value, so a mode-only
     * change from an older bundle cannot drop the chosen fixed set.
     */
    const modes = normalizeAssessmentContentModes(
      body?.modes ??
        body?.mode ??
        (snapshot.contentMode || {})[period]
    );
    const defaults =
      body?.defaults === undefined
        ? (snapshot.contentDefaults || {})[period] || null
        : normalizeAssessmentContentDefaults(body.defaults);
    const nextContentMode = {
      ...(snapshot.contentMode || {}),
      [period]: modes,
    };
    const nextContentDefaults = {
      ...(snapshot.contentDefaults || {}),
      [period]: defaults,
    };
    await setSnapshot(userId, {
      contentMode: nextContentMode,
      contentDefaults: nextContentDefaults,
      contentModeOfflinePending: true,
    });
    await queueOfflineMutation({
      kind: "save_content_mode",
      url: "/api/assessment?action=save_content_mode",
      method: "POST",
      body: {
        action: "save_content_mode",
        period,
        modes,
        ...(body?.defaults === undefined ? {} : { defaults }),
      },
    });
    return jsonResponse({
      status: "ok",
      period,
      modes,
      mode: modes.letters,
      defaults,
      contentMode: nextContentMode,
      contentDefaults: nextContentDefaults,
      offline: true,
    });
  }

  if (action === "update_user") {
    const schoolId = String(body?.school_id ?? body?.schoolId ?? "").trim();
    const schoolName = String(body?.school_name ?? body?.schoolName ?? "").trim();
    if (!/^\d{6}$/.test(schoolId)) {
      return jsonResponse({ error: "School ID must contain exactly 6 numbers." }, 400);
    }
    if (!schoolName) {
      return jsonResponse({ error: "School name is required." }, 400);
    }
    const user = { ...(snapshot.user || session.user), ...(body || {}) };
    await saveOfflineTeacherSession({ ...session, user, updatedAt: Date.now() });
    await setSnapshot(userId, { user });
    await queueOfflineMutation({
      kind: "update_user",
      url: "/api/auth?action=update_user",
      method: "POST",
      body,
    });
    return jsonResponse({ status: "ok", user, offline: true });
  }

  if (action === "add_learner") {
    const selectedClass=snapshot.classes?.sections?.find(item=>item.id===body.class_section_id);
    if(!selectedClass || selectedClass.archivedAt || snapshot.classes?.schoolYears?.find(y=>y.id===selectedClass.schoolYearId)?.archivedAt) return jsonResponse({error:"Choose an active school year and section first."},409);
    const lrn = String(body?.lrn || "").trim();
    const existingLearner = snapshot.learners.find(
      (item) => String(item?.lrn ?? item?.LRN ?? "").trim() === lrn && classIdOf(item) === body.class_section_id
    );
    if (existingLearner) {
      return jsonResponse({
        error: "A learner with this LRN already exists.",
        learner: existingLearner,
      }, 409);
    }
    const localId = -Math.floor(Date.now() + Math.random() * 1000);
    const learner = {
      id: localId,
      lrn,
      first_name: String(body?.first_name || body?.firstName || "").trim(),
      middle_name: String(body?.middle_name || body?.middleName || "").trim(),
      suffix: String(body?.suffix || "").trim(),
      last_name: String(body?.last_name || body?.lastName || "").trim(),
      sex: String(body?.sex || "").trim(),
      grade_level: Number(body?.grade_level || 3),
      section: selectedClass.name,
      class_section_id: selectedClass.id,
      created_at: new Date().toISOString(),
      offline_pending: true,
    };
    await updateSnapshot(userId, (current) => ({
      learners: [
        ...current.learners.filter((item) => !sameLearner(item, learner)),
        learner,
      ],
      learnerTombstones: current.learnerTombstones.filter(
        (tombstone) => !sameLearner(tombstone, learner)
      ),
    }));
    await queueOfflineMutation({
      kind: "add_learner",
      localId,
      url: "/api/assessment?action=add_learner",
      method: "POST",
      body,
    });
    return jsonResponse({ status: "ok", learner, offline: true });
  }

  if (action === "save_assessment_records") {
    let records;
    try { records=validateRemarkRecords(body?.records); } catch(error){return jsonResponse({error:error.message},400);}
    const edits=new Map(records.map(record=>[record.id,record]));
    for(const record of records){
      const assessment=snapshot.assessments.find(item=>Number(item.id)===record.id);
      const learner=snapshot.learners.find(item=>Number(item.id)===Number(assessment?.learner_id));
      if(!assessment?.is_completed || !learner) return jsonResponse({error:"Completed assessment record not found."},404);
      if(snapshot.classes?.sections?.find(item=>item.id===classIdOf(learner))?.archivedAt) return jsonResponse({error:"This section is archived."},409);
    }
    const updated=snapshot.assessments.map(item=>edits.has(Number(item.id))?{...item,remarks:edits.get(Number(item.id)).remarks,offline_pending:true}:item);
    await updateSnapshot(userId,()=>({assessments:updated}));
    await queueOfflineMutation({kind:"save_assessment_records",url:"/api/assessment?action=save_assessment_records",method:"POST",body:{action:"save_assessment_records",records}});
    return jsonResponse({status:"ok",assessments:updated.filter(item=>edits.has(Number(item.id))),offline:true});
  }

  if (action === "delete_learner" || action === "delete_learners") {
    const ids = action === "delete_learners"
      ? (Array.isArray(body?.learner_ids) ? body.learner_ids.map(Number) : [])
      : [Number(body?.learner_id ?? body?.learnerId ?? body?.id ?? 0)];
    const lrns = action === "delete_learner"
      ? [String(body?.lrn ?? body?.LRN ?? "").trim()]
      : [];
    const deletedIds = snapshot.learners
      .filter((learner) => {
        const id = Number(learner?.id ?? 0);
        const lrn = String(learner?.lrn ?? learner?.LRN ?? "").trim();
        return ids.includes(id);
      })
      .map((learner) => Number(learner?.id ?? 0));
    const deletedLearners = snapshot.learners.filter((learner) => {
      const id = Number(learner?.id ?? 0);
      const lrn = String(learner?.lrn ?? learner?.LRN ?? "").trim();
      return ids.includes(id);
    });
    try { validateLearnerDeletion(deletedLearners, body, ids.length); } catch(error){return jsonResponse({error:error.message},400);}
    await updateSnapshot(userId, (current) => ({
      classes: {...current.classes, archives: [
        ...(current.classes?.archives || []),
        ...deletedLearners.map(learner => {
          const section=current.classes?.sections?.find(item=>item.id===classIdOf(learner));
          const year=current.classes?.schoolYears?.find(item=>item.id===section?.schoolYearId);
          return {id:`pending-learner:${learner.id}`,kind:"learner",sourceLearnerId:Number(learner.id),sourceSectionId:classIdOf(learner),learnerName:syncLearnerName(learner),schoolYearLabel:year?.label||"",sectionName:section?.name||"",learnerCount:1,createdAt:new Date().toISOString(),offline_pending:true};
        })
      ]},
      learners: current.learners.filter((learner) => {
        const id = Number(learner?.id ?? 0);
        const lrn = String(learner?.lrn ?? learner?.LRN ?? "").trim();
        return !ids.includes(id);
      }),
      assessments: current.assessments.filter(
        (item) => !deletedIds.includes(Number(item?.learner_id))
      ),
      learnerTombstones: [
        ...current.learnerTombstones.filter(
          (tombstone) => !deletedLearners.some(
            (learner) => sameLearner(tombstone, learner)
          )
        ),
        ...deletedLearners.map((learner) => ({
          ...learnerIdentity(learner),
          assessments: current.assessments.filter(item => Number(item.learner_id) === Number(learner.id)),
          deleted_at: new Date().toISOString(),
          offline_pending: true,
        })),
      ],
    }));
    await queueOfflineMutation({
      kind: action,
      syncLabel: { title: "Learner removal", details: deletedLearners.map(syncLearnerName).filter(Boolean) },
      url: `/api/assessment?action=${action}`,
      method: "POST",
      body,
    });
    return jsonResponse({ status: "ok", deleted_learner_ids: deletedIds.filter((id) => id !== 0), deleted_count: deletedIds.length, offline: true });
  }

  return null;
}

async function handleOfflineAssessment(action, init, url) {
  const session = await getOfflineTeacherSession();
  if (!isActiveOfflineSession(session)) return null;
  const userId = Number(session?.user?.id || 0);
  if (!userId) return null;
  const body = requestBody(init);
  action = normalizeAssessmentAction(action || body?.action);
  const code = String(body?.code || url.searchParams.get("code") || "").trim().toUpperCase();

  if (action === "host_start") {
    const snapshot = await getSnapshot(userId);
    const requestedLearnerId = Number(body?.learner_id ?? body?.learnerId ?? 0);
    const learner = snapshot.learners.find(
      (item) =>
        Number(item?.id) === requestedLearnerId ||
        Number(item?.local_id) === requestedLearnerId
    );
    if (!learner) {
      return jsonResponse({ error: "The selected learner is not available offline." }, 404);
    }
    const learnerId = Number(learner.id);
    const period = normalizePeriod(body?.period);
    const selectedClass=snapshot.classes?.sections?.find(item=>item.id===classIdOf(learner));
    if(!selectedClass || selectedClass.archivedAt || snapshot.classes?.schoolYears?.find(y=>y.id===selectedClass.schoolYearId)?.archivedAt || body.class_section_id && body.class_section_id!==classIdOf(learner)) return jsonResponse({error:"Choose the learner's active class."},409);
    const issue=periodEligibility(snapshot.assessments,learnerId,period);
    if(issue) return jsonResponse({error:issue},409);
    /*
     * The code is the run seed, so it is issued before the items are drawn.
     * The learner joins this same code and is handed this same set.
     */
    const offlineCode = await generateOfflineAssessmentCode();
    const assessmentContent = getOfflineAssessmentContent(snapshot, period, offlineCode);
    const contentIssues = getAssessmentContentIssues(assessmentContent);
    if (contentIssues.length) {
      return jsonResponse(
        {
          error: `${period} assessment content is incomplete. Finish it in Manage Assessment before starting.`,
          issues: contentIssues,
        },
        400
      );
    }

    const storedHosts = await offlineList("host_session:").catch(() => []);
    for (const entry of storedHosts) {
      const stale = entry?.value;
      if (
        !stale ||
        stale.ended ||
        Number(stale.learner_id) !== learnerId
      ) {
        continue;
      }

      const staleCode = String(stale.code || "").trim().toUpperCase();
      if (!staleCode) continue;

      await saveOfflineHostSession(staleCode, {
        ...stale,
        stage: "ended",
        current_content: "Assessment invitation expired.",
        connected: false,
        ended: true,
        updated_at: new Date().toISOString(),
      });
      await queueOfflineMutation({
        kind: "host_end",
        url: "/api/assessment?action=host_end",
        method: "POST",
        body: { action: "host_end", code: staleCode },
      });
    }

    const host = {
      code: offlineCode,
      teacher_id: userId,
      learner_id: learnerId,
      learner,
      assessment_period: period,
      // Offline start still begins with an invitation. The first assessment
      // item is released only after a learner joins the newly issued code.
      stage: "waiting",
      current_content: "Waiting for learner to connect...",
      story_title: "",
      ended: false,
      connected: false,
      linked_at: null,
      offline: true,
      offline_created: true,
      assessment_content: assessmentContent,
      story_choices: assessmentContent.stories,
      task1Results: [],
      task2Results: [],
      passageMiscues: [],
      comprehensionResults: [],
      timer_seconds: null,
      experience_rating: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await saveOfflineHostSession(host.code, host);
    await queueOfflineMutation({
      kind: "host_start",
      offlineCode: host.code,
      url: "/api/assessment?action=host_start",
      method: "POST",
      body: {
        action: "host_start",
        learner_id: learnerId,
        period,
        offline_code: host.code,
      },
    });
    return jsonResponse({
      status: "ok",
      code: host.code,
      learner_id: learnerId,
      period,
      offline: true,
    });
  }

  if (!code) return null;
  const existing = await getOfflineHostSession(code).catch(() => null);

  if (action === "host_get") {
    if (!existing) return jsonResponse({ error: "Assessment session not found offline." }, 404);
    if (existing.deleted) return jsonResponse({ error: "This learner has been deleted.", deleted: true }, 410);
    const hostWithMetrics = {
      ...existing,
      metrics: calculateOfflineMetrics(existing),
    };
    return jsonResponse({
      status: "ok",
      session: hostWithMetrics,
      task1Results: hostWithMetrics.task1Results || [],
      task2Results: hostWithMetrics.task2Results || [],
      comprehensionResults: hostWithMetrics.comprehensionResults || [],
      offline: true,
    });
  }

  if (!existing) return jsonResponse({ error: "Assessment session not found offline." }, 404);
  if (existing.deleted) return jsonResponse({ error: "This learner has been deleted.", deleted: true }, 410);

  if (action === "host_recover") {
    if (Number(existing.teacher_id || existing.teacherId) !== userId || Number(existing.learner_id) !== Number(body?.learner_id)) return jsonResponse({ error: "Assessment does not belong to this teacher." }, 403);
    const patch = recoveryHostPatch(existing, body);
    if (!patch) return jsonResponse({ status: "ok", stale: true, session: existing, offline: true });
    const restored = { ...existing, stage: patch.stage, current_content: patch.currentContent, story_title: patch.storyTitle,
      ...(patch.passagePausedAt ? { passage_paused_at: patch.passagePausedAt.toISOString() } : {}), local_pending_sync: true, updated_at: new Date().toISOString() };
    await queueOfflineMutation({ kind: action, url: `/api/assessment?action=${action}`, method: "POST", body: { ...body, action, code } }, restored);
    return jsonResponse({ status: "ok", session: restored, offline: true });
  }

  if (existing.ended && action === "learner_join") {
    return jsonResponse({ error: "This assessment code has expired." }, 410);
  }

  let next = { ...existing, offline: true };
  /*
   * A session that was created before the run content was stored with it - an
   * assessment started in the cloud and picked up here, or an older local
   * record - has to be measured against the run it is actually administering.
   * The draw is seeded by the assessment code, exactly as the server seeds it,
   * so leaving the seed out here would advance the session through a different
   * order than the one the teacher's screen and the learner are following.
   */
  let content = existing.assessment_content;
  if (!content) {
    content = getOfflineAssessmentContent(
      await getSnapshot(userId),
      existing.assessment_period,
      existing.code
    );
  }
  if (!existing.assessment_content && content) {
    /* Heal the record so every device reads the same administered items. */
    next = {
      ...next,
      assessment_content: content,
      story_choices: next.story_choices?.length ? next.story_choices : content.stories,
    };
  }
  const nowIso = new Date().toISOString();

  if (action === "learner_join") {
    const beginsAssessment = ["waiting", "connected"].includes(next.stage);
    next = {
      ...next,
      connected: true,
      linked_at: next.linked_at || nowIso,
      stage: beginsAssessment ? "letter" : next.stage,
      current_content: beginsAssessment
        ? content.letters[0] || DEFAULT_LETTERS[0]
        : next.current_content,
    };
  }

  if (["host_update", "host_advance"].includes(action)) {
    const expectedStage = String(body?.expected_stage ?? body?.expectedStage ?? "").trim();
    const expectedContent = body?.expected_current_content ?? body?.expectedCurrentContent ?? null;
    if (!expectedStage || expectedContent === null || next.ended ||
      next.stage !== expectedStage ||
      (next.current_content !== String(expectedContent) && !String(next.current_content || "").startsWith("Waiting"))) {
      return jsonResponse({ status: "ok", stale: true, session: next, offline: true });
    }
    next = {
      ...next,
      ...(body?.stage ? { stage: String(body.stage) } : {}),
      ...(body?.currentContent !== undefined
        ? { current_content: body.currentContent }
        : {}),
      ...(body?.current_content !== undefined
        ? { current_content: body.current_content }
        : {}),
      ...(body?.storyTitle !== undefined
        ? { story_title: body.storyTitle }
        : {}),
      ...(body?.story_title !== undefined
        ? { story_title: body.story_title }
        : {}),
      /*
       * The item number is stored with the state that names it, so a fallback
       * read states the same item the live link is on instead of trailing it by
       * one and pulling the learner's screen backwards.
       */
      ...(Number.isInteger(Number(body?.item_index ?? body?.itemIndex))
        ? {
            item_index: Number(body?.item_index ?? body?.itemIndex),
            itemIndex: Number(body?.item_index ?? body?.itemIndex),
          }
        : {}),
    };
  }

  if (action === "record_letter") {
    const index = Number(body?.letter_index ?? body?.letterIndex);
    if (!Number.isInteger(index) || index < 0 || index >= content.letters.length) {
      return jsonResponse({ error: "Invalid letter index." }, 400);
    }
    const results = Array.isArray(body?.task1_results)
      ? mergeOfflineTaskResults(next.task1Results, body.task1_results, content.letters)
      : upsertOfflineResult(
          next.task1Results,
          index,
          content.letters[index],
          body?.is_correct ?? body?.isCorrect
        );
    const complete = results.length >= content.letters.length;
    const zeroScore = complete && results.every((item) => !item.isCorrect);
    const advances = body?.persist_only !== true && next.stage === "letter" &&
      (next.current_content === content.letters[index] || complete);
    next = {
      ...next,
      task1Results: results,
      stage: advances ? (zeroScore ? "terminated" : complete ? "word" : "letter") : next.stage,
      current_content: !advances ? next.current_content : zeroScore
        ? "ZERO_SCORE_PART1_TASK1"
        : complete
          ? content.words[0]
          : content.letters[index + 1] || next.current_content,
      connected: advances && zeroScore ? false : next.connected,
    };
  }

  if (action === "record_word") {
    const index = Number(body?.word_index ?? body?.wordIndex);
    if (!Number.isInteger(index) || index < 0 || index >= content.words.length) {
      return jsonResponse({ error: "Invalid word index." }, 400);
    }
    const results = Array.isArray(body?.task2_results)
      ? mergeOfflineTaskResults(next.task2Results, body.task2_results, content.words)
      : upsertOfflineResult(
          next.task2Results,
          index,
          content.words[index],
          body?.is_correct ?? body?.isCorrect
        );
    const complete = results.length >= content.words.length;
    const task1Score = (next.task1Results || []).filter((item) => item?.isCorrect).length;
    const task2Score = results.filter((item) => item?.isCorrect).length;
    const earlyStop = complete && task1Score + task2Score <= 10;
    const advances = body?.persist_only !== true && next.stage === "word" &&
      (next.current_content === content.words[index] || complete);
    next = {
      ...next,
      task2Results: results,
      stage: advances ? (earlyStop ? "terminated" : complete ? "story_choice" : "word") : next.stage,
      current_content: !advances ? next.current_content : earlyStop
        ? "PART1_TOTAL_LOW"
        : complete
          ? "Choose a story passage. The teacher will select it."
          : content.words[index + 1] || next.current_content,
      connected: advances && earlyStop ? false : next.connected,
    };
  }

  if (action === "select_story") {
    const storyId = Number(body?.story_id ?? body?.storyId);
    const story = content.stories.find((item) => Number(item?.id) === storyId) ||
      content.stories[storyId - 1];
    if (!story?.available) {
      return jsonResponse({ error: "That story passage is not available offline." }, 409);
    }
    next = {
      ...next,
      stage: "passage",
      story_title: story.title,
      current_content: story.text,
      passage_started_at: null,
      passage_paused_at: null,
      passage_paused_seconds: 0,
      timer_seconds: null,
    };
  }

  if (action === "passage_ready") {
    if (next.stage !== "passage") {
      return jsonResponse(
        { error: "The story is still being prepared. Please wait a moment before starting the timer." },
        409
      );
    }
    if (!next.passage_started_at) next = {
      ...next,
      passage_started_at: body?.started_at || nowIso,
      passage_paused_at: null,
      passage_paused_seconds: 0,
    };
  }

  if (action === "passage_timer") {
    if (!next.passage_started_at) {
      return jsonResponse({ error: "The passage timer has not started yet." }, 409);
    }
    const mode = String(body?.mode || "").toLowerCase();
    if (mode === "pause" && !next.passage_paused_at) {
      next = { ...next, passage_paused_at: nowIso };
    } else if (mode === "resume" && next.passage_paused_at) {
      const added = Math.max(
        0,
        Math.floor((Date.now() - new Date(next.passage_paused_at).getTime()) / 1000)
      );
      next = {
        ...next,
        passage_paused_at: null,
        passage_paused_seconds: Number(next.passage_paused_seconds || 0) + added,
      };
    }
  }

  if (["record_passage_miscue", "record_miscue"].includes(action)) {
    const wordIndex = Number(body?.word_index ?? body?.wordIndex);
    const item = {
      wordIndex,
      word: passageWordsForHost(next)[wordIndex] || "",
      miscueType: String(body?.miscue_type ?? body?.miscueType ?? ""),
      misreadWord: String(body?.misread_word ?? body?.misreadWord ?? ""),
    };
    next = {
      ...next,
      passageMiscues: [
        ...(next.passageMiscues || []).filter(
          (miscue) => Number(miscue?.wordIndex) !== wordIndex
        ),
        item,
      ].sort((left, right) => Number(left.wordIndex) - Number(right.wordIndex)),
    };
  }

  if (["remove_passage_miscue", "remove_miscue"].includes(action)) {
    const wordIndex = Number(body?.word_index ?? body?.wordIndex);
    next = {
      ...next,
      passageMiscues: (next.passageMiscues || []).filter(
        (miscue) => Number(miscue?.wordIndex) !== wordIndex
      ),
    };
  }

  if (action === "finish_passage") {
    const startedAt = new Date(next.passage_started_at || nowIso).getTime();
    const activePauseSeconds = next.passage_paused_at
      ? Math.max(0, Math.floor((Date.now() - new Date(next.passage_paused_at).getTime()) / 1000))
      : 0;
    const timerSeconds = Math.max(
      0,
      Math.min(
        120,
        Math.floor((Date.now() - startedAt) / 1000) -
          Number(next.passage_paused_seconds || 0) -
          activePauseSeconds
      )
    );
    const submitted = Array.isArray(body?.passage_miscues)
      ? body.passage_miscues.map((item) => ({
          wordIndex: Number(item?.wordIndex ?? item?.word_index),
          word: item?.word || "",
          miscueType: String(item?.miscueType ?? item?.miscue_type ?? ""),
          misreadWord: String(item?.misreadWord ?? item?.misread_word ?? ""),
        }))
      : next.passageMiscues || [];
    const passageWords = passageWordsForHost(next);
    const requestedWordsRead = Math.max(
      0,
      Math.min(passageWords.length || 100, Number(body?.words_read ?? body?.wordsRead ?? 100))
    );
    const wordsReached = timerSeconds < 120 ? passageWords.length || 100 : requestedWordsRead;
    const miscuesByIndex = new Map(
      submitted.map((item) => [Number(item.wordIndex), item])
    );
    for (let index = wordsReached; index < (passageWords.length || 100); index += 1) {
      if (!miscuesByIndex.has(index)) {
        miscuesByIndex.set(index, {
          wordIndex: index,
          word: passageWords[index] || "",
          miscueType: "Omission",
          misreadWord: "",
        });
      }
    }
    const questions = getOfflineQuestions(next.story_title, next.assessment_content || content);
    next = {
      ...next,
      passageMiscues: Array.from(miscuesByIndex.values()).sort(
        (left, right) => Number(left.wordIndex) - Number(right.wordIndex)
      ),
      timer_seconds: timerSeconds,
      passage_paused_at: null,
      stage: "comprehension",
      current_content: questions[0],
    };
  }

  if (action === "record_comprehension") {
    const questionIndex = Number(body?.question_index ?? body?.questionIndex);
    const questions = getOfflineQuestions(next.story_title, next.assessment_content || content);
    if (
      !Number.isInteger(questionIndex) ||
      questionIndex < 0 ||
      questionIndex >= questions.length
    ) {
      return jsonResponse({ error: "Invalid comprehension question index." }, 400);
    }
    const results = upsertOfflineResult(
      next.comprehensionResults,
      questionIndex,
      questions[questionIndex] || "",
      body?.is_correct ?? body?.isCorrect,
      "questionIndex"
    );
    next = {
      ...next,
      comprehensionResults: results,
      current_content: next.stage === "comprehension" &&
        next.current_content === questions[questionIndex] && body?.persist_only !== true
        ? questions[questionIndex + 1] || next.current_content
        : next.current_content,
    };
  }

  if (action === "save_experience_rating") {
    next = {
      ...next,
      experience_rating: Number(body?.experience_rating ?? body?.experienceRating),
      timer_seconds: Number(body?.timer_seconds ?? next.timer_seconds),
      passageMiscues: Array.isArray(body?.passage_miscues)
        ? body.passage_miscues
        : next.passageMiscues,
      comprehensionResults: mergeOfflineComprehension(
        next.comprehensionResults,
        body?.comprehension_results
      ),
      stage: "teacher_review",
      current_content: "TEACHER_REVIEW",
    };
  }

  if (action === "finalize") {
    next = { ...next, stage: "teacher_review", current_content: "TEACHER_REVIEW" };
  }

  if (action === "save_final_assessment_review") {
    const task1Results = Array.isArray(body?.task1_results)
      ? body.task1_results
      : next.task1Results;
    const task2Results = Array.isArray(body?.task2_results)
      ? body.task2_results
      : next.task2Results;
    next = {
      ...next,
      task1Results,
      task2Results,
      passageMiscues: Array.isArray(body?.passage_miscues)
        ? body.passage_miscues
        : next.passageMiscues,
      comprehensionResults: mergeOfflineComprehension(
        next.comprehensionResults,
        body?.comprehension_results
      ),
      timer_seconds:
        next.stage === "terminated"
          ? null
          : Number(body?.timer_seconds ?? next.timer_seconds),
      observation_level:
        next.stage === "terminated"
          ? null
          : Number(body?.observation_level ?? body?.observationLevel) || null,
      remarks: String(body?.remarks || "").trim(),
      stage: "completed",
      current_content: "Assessment completed.",
      connected: false,
      ended: true,
    };
    const metrics = calculateOfflineMetrics(next);
    const localAssessmentId = Number(next.local_assessment_id || -Date.now());
    next.local_assessment_id = localAssessmentId;
    next.metrics = metrics;
    const record = offlineAssessmentRecord(next, metrics);
    await updateSnapshot(userId, (current) => ({
      assessments: [
        ...current.assessments.filter(
          (item) => item?.offline_session_code !== code
        ),
        record,
      ],
    }));
  }

  if (action === "host_end") {
    next = {
      ...next,
      stage: "ended",
      current_content: "Assessment session ended by teacher.",
      connected: false,
      ended: true,
    };
  }

  const queuesMutation = ![
    "host_get",
    "learner_status",
    "learner_heartbeat",
  ].includes(action);

  next = {
    ...next,
    assessment_content: content,
    story_choices: content.stories,
    metrics: calculateOfflineMetrics(next),
    local_pending_sync:
      Boolean(next.local_pending_sync) || queuesMutation,
    updated_at: nowIso,
  };
  await saveOfflineHostSession(code, next);

  if (queuesMutation) {
    await queueOfflineMutation({
      kind: action,
      url: `/api/assessment?action=${action}`,
      method: "POST",
      body: { ...body, action, code },
    });
  }

  if (["learner_status", "learner_heartbeat"].includes(action)) {
    return jsonResponse({
      status: next.ended ? (next.stage === "completed" ? "completed" : "ended") : "ok",
      ...next,
      completed: next.stage === "completed",
      offline: true,
    });
  }

  if (action === "learner_join") {
    return jsonResponse({
      status: "ok",
      ...next,
      period: next.assessment_period,
      offline: true,
    });
  }

  if (["host_update", "host_advance", "select_story", "host_end"].includes(action)) {
    if (action === "host_end" && navigator.onLine) void syncOutbox();
    return jsonResponse({ status: "ok", session: next, offline: true });
  }

  if (action === "passage_ready") {
    return jsonResponse({
      status: "ok",
      timer_started: true,
      passage_started_at: next.passage_started_at,
      passage_paused_at: next.passage_paused_at,
      passage_paused_seconds: next.passage_paused_seconds,
      session: next,
      offline: true,
    });
  }

  if (action === "passage_timer") {
    return jsonResponse({
      status: "ok",
      paused: Boolean(next.passage_paused_at),
      passage_started_at: next.passage_started_at,
      passage_paused_at: next.passage_paused_at,
      passage_paused_seconds: next.passage_paused_seconds,
      offline: true,
    });
  }

  if (action === "finish_passage") {
    return jsonResponse({
      status: "ok",
      stage: next.stage,
      current_content: next.current_content,
      story_title: next.story_title,
      scoring: next.metrics,
      offline: true,
    });
  }

  if (action === "save_experience_rating") {
    return jsonResponse({ status: "ok", scoring: next.metrics, offline: true });
  }

  if (action === "save_final_assessment_review") {
    if (navigator.onLine) void syncOutbox();
    return jsonResponse({
      status: "ok",
      saved: true,
      completed: true,
      classification: next.metrics.classification,
      experienceRating: next.metrics.experienceRating,
      metrics: next.metrics,
      offline: true,
    });
  }

  if (["record_letter", "record_word"].includes(action)) {
    const terminated = next.stage === "terminated";
    return jsonResponse({
      status: "ok",
      completed: false,
      terminated,
      early_termination: terminated
        ? next.current_content === "ZERO_SCORE_PART1_TASK1"
          ? "part1_task1_zero"
          : "part1_total_low"
        : null,
      scoring: { ...next.metrics, hardTerminate: terminated },
      session: next,
      offline: true,
    });
  }

  return jsonResponse({
    status: "ok",
    saved: true,
    offline: true,
    session: next,
    scoring: next.metrics,
  });
}

async function rememberSuccessfulAssessment(action, body, payload, userId) {
  if (!userId || !payload || typeof payload !== "object") return;
  action = normalizeAssessmentAction(action || body?.action);

  if (action === "host_start" && payload?.code) {
    const snapshot = await getSnapshot(userId);
    const learnerId = Number(body?.learner_id ?? body?.learnerId ?? payload?.learner_id);
    const retired = await getOfflineHostSession(payload.code);
    if (retired?.deleted && Number(retired.learner_id) === learnerId) return;
    const learner = snapshot.learners.find((item) => Number(item?.id) === learnerId) || null;
    const period = normalizePeriod(body?.period || payload?.period);
    /* Same seed as the server used for this run, so the cached copy matches. */
    const assessmentContent = getOfflineAssessmentContent(
      snapshot,
      period,
      String(payload?.code || "").trim().toUpperCase()
    );
    await saveOfflineHostSession(payload.code, {
      code: String(payload.code).toUpperCase(),
      teacher_id: userId,
      learner_id: learnerId,
      learner,
      assessment_period: period,
      stage: "waiting",
      current_content: "Waiting for learner to connect...",
      story_title: "",
      ended: false,
      connected: false,
      linked_at: null,
      offline: false,
      offline_created: false,
      server_assessment_session_id: payload?.assessment_session_id ?? null,
      assessment_content: assessmentContent,
      story_choices: assessmentContent.stories,
      task1Results: [],
      task2Results: [],
      passageMiscues: [],
      comprehensionResults: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return;
  }

  const code = String(body?.code || payload?.session?.code || payload?.code || "")
    .trim()
    .toUpperCase();
  if (!code) return;
  const existing = await getOfflineHostSession(code).catch(() => null);
  if (!existing || existing.local_pending_sync || existing.deleted) return;

  let next = mergeHostPayload(existing, payload);
  const content = next.assessment_content || existing.assessment_content;
  if (action === "record_letter" && content?.letters) {
    const index = Number(body?.letter_index ?? body?.letterIndex);
    if (Number.isInteger(index)) {
      next.task1Results = Array.isArray(body?.task1_results)
        ? body.task1_results
        : upsertOfflineResult(
            next.task1Results,
            index,
            content.letters[index],
            body?.is_correct ?? body?.isCorrect
          );
    }
  }
  if (action === "record_word" && content?.words) {
    const index = Number(body?.word_index ?? body?.wordIndex);
    if (Number.isInteger(index)) {
      next.task2Results = Array.isArray(body?.task2_results)
        ? body.task2_results
        : upsertOfflineResult(
            next.task2Results,
            index,
            content.words[index],
            body?.is_correct ?? body?.isCorrect
          );
    }
  }
  if (action === "record_comprehension") {
    const index = Number(body?.question_index ?? body?.questionIndex);
    if (Number.isInteger(index)) {
      next.comprehensionResults = upsertOfflineResult(
        next.comprehensionResults,
        index,
        getOfflineQuestions(next.story_title, next.assessment_content || content)[index] || "",
        body?.is_correct ?? body?.isCorrect,
        "questionIndex"
      );
    }
  }
  if (action === "save_experience_rating") {
    next = {
      ...next,
      experience_rating: Number(
        body?.experience_rating ?? body?.experienceRating ?? next.experience_rating
      ) || null,
      timer_seconds: Number(body?.timer_seconds ?? next.timer_seconds),
      passageMiscues: Array.isArray(body?.passage_miscues)
        ? body.passage_miscues
        : next.passageMiscues,
      comprehensionResults: mergeOfflineComprehension(
        next.comprehensionResults,
        body?.comprehension_results
      ),
    };
  }
  if (action === "save_final_assessment_review") {
    next = {
      ...next,
      task1Results: Array.isArray(body?.task1_results)
        ? body.task1_results
        : next.task1Results,
      task2Results: Array.isArray(body?.task2_results)
        ? body.task2_results
        : next.task2Results,
      passageMiscues: Array.isArray(body?.passage_miscues)
        ? body.passage_miscues
        : next.passageMiscues,
      comprehensionResults: mergeOfflineComprehension(
        next.comprehensionResults,
        body?.comprehension_results
      ),
      timer_seconds:
        next.stage === "terminated"
          ? null
          : Number(body?.timer_seconds ?? next.timer_seconds),
      observation_level:
        next.stage === "terminated"
          ? null
          : Number(body?.observation_level ?? body?.observationLevel) || null,
      remarks: String(body?.remarks || "").trim(),
      stage: "completed",
      ended: true,
      connected: false,
    };
    const metrics = calculateOfflineMetrics(next);
    next.metrics = metrics;
    const record = {
      ...offlineAssessmentRecord(next, metrics),
      id: Number(next.server_assessment_session_id || -Date.now()),
      offline_pending: false,
    };
    await updateSnapshot(userId, (current) => ({
      assessments: [
        ...current.assessments.filter(
          (item) =>
            !(
              Number(item?.learner_id) === Number(next.learner_id) &&
              String(item?.assessment_period || "") ===
                String(next.assessment_period || "")
            )
        ),
        record,
      ],
    }));
    void warmTeacherSnapshot(userId);
  }
  next.metrics = calculateOfflineMetrics(next);
  next.updated_at = new Date().toISOString();
  await saveOfflineHostSession(code, next);
}

export default function OfflineRuntime() {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (!window.__crlOriginalFetch) {
      window.__crlOriginalFetch = window.fetch.bind(window);
    }

    const originalFetch = window.__crlOriginalFetch;
    const wrappedFetch = async (input, init) => {
      const inputUrl = typeof input === "string" ? input : input?.url;
      const parsed = parseAction(inputUrl || "");
      const body = requestBody(init);
      const url = parsed.url;
      const pathname = parsed.pathname;
      const action = normalizeAssessmentAction(parsed.action || body?.action);
      // Public learner entry must not depend on a teacher's IndexedDB session,
      // cached bearer token, local host projection or five-second mutation path.
      if (pathname === "/api/assessment/join" && (init?.method || "GET").toUpperCase() === "POST") {
        return fetchCloudAssessment(originalFetch, input, { ...init, credentials: "omit" }, 15000);
      }
      // Presence must be live proof. Never replay or answer it from IndexedDB.
      if (pathname === "/api/assessment/presence") {
        const cached = body?.role === "teacher" ? await getOfflineTeacherSession().catch(() => null) : null;
        const token = extractOfflineToken(cached);
        const presenceInit = token ? makeBearerInit(init, token) : init;
        const response = await fetchCloudAssessment(originalFetch, input, presenceInit, 10000);
        if (response.ok) {
          reachabilityProbe = { checkedAt: Date.now(), ok: true, promise: null };
          announceCloudReachability(true);
        }
        return response;
      }
      const tokenSession = await getOfflineTeacherSession().catch(() => null);
      const offlineToken = extractOfflineToken(tokenSession);
      const isApi = sameOrigin(pathname) && pathname.startsWith("/api/");
      const isAuthLogin = pathname === "/api/auth" && ["login", "verify_login_2fa", "signup"].includes(action);
      const isOfflineAuthVerify = pathname === "/api/auth" && action === "verify";
      const isLogout = pathname === "/api/auth" && action === "logout";
      const isTeacherData = pathname === "/api/assessment" && DATA_ACTIONS.has(action);
      const isTeacherMutation = pathname === "/api/assessment" || (pathname === "/api/auth" && action === "update_user");
      const isAssessmentRequest = pathname === "/api/assessment" && OFFLINE_ASSESSMENT_ACTIONS.has(action);
      const method = (init?.method || "GET").toUpperCase();
      const canUseLocalTeacherData =
        isTeacherData ||
        (isTeacherMutation && method !== "GET") ||
        isAssessmentRequest ||
        (pathname === "/api/assessment/commit" && method !== "GET");

      if (["archive_class","archive_school_year","delete_school_year","delete_class_section","import_class_archive","restore_learner_archives"].includes(action) && (await getOfflineOutbox()).some(entry=>!entry.userId||Number(entry.userId)===Number(tokenSession?.user?.id))) return jsonResponse({error:"Wait for saved changes to finish syncing before archiving or importing a section."},409);
      if (isLogout) {
        publishSyncStatus({ phase: "idle" });
        await signOutOfflineTeacherSession().catch(() => {});
        try {
          return await originalFetch(input, init);
        } catch {
          return jsonResponse({ status: "ok", signed_out: true, offline: true });
        }
      }

      const offlineSessionActive = isActiveOfflineSession(tokenSession);

      if (isAssessmentRequest && action === "host_start" && body?.connection_mode === "offline" && !offlineSessionActive) {
        return jsonResponse({ status: "error", error: "Sign in online once to prepare Offline Mode." }, 401);
      }

      // A learner created offline can be assessed immediately, including the
      // narrow reconnect window where the roster still holds its negative
      // local ID while cloud reconciliation is replacing it. Starting this
      // session locally preserves a stable invitation code and lets the
      // ordered outbox replay the learner before the assessment.
      if (
        offlineSessionActive &&
        isAssessmentRequest &&
        action === "host_start"
      ) {
        const requestedLearnerId = Number(body?.learner_id ?? body?.learnerId ?? 0);
        const userId = Number(tokenSession?.user?.id || 0);
        const snapshot = userId ? await getSnapshot(userId) : null;
        const pendingLearner = snapshot?.learners?.find(
          (learner) =>
            Number(learner?.id) === requestedLearnerId ||
            Number(learner?.local_id) === requestedLearnerId
        );
        if (body?.connection_mode === "offline" || requestedLearnerId < 0 || pendingLearner?.offline_pending) {
          const localResponse = await serializeOfflineMutation(
            () => handleOfflineAssessment(action, init, url)
          );
          if (localResponse) {
            if (navigator.onLine) window.setTimeout(() => void syncOutbox(), 0);
            return localResponse;
          }
          if (body?.connection_mode === "offline") return jsonResponse({ status: "error", error: "Offline assessment data is not ready. Open your class online once." }, 503);
        }
      }

      // Only sessions that were created offline, or that currently have
      // unsynchronised local writes, are local-first. An online-created host is
      // also mirrored to IndexedDB for continuity, but its normal host_get
      // reads must still reach the cloud: that is where a learner joining on a
      // separate device updates the session. Treating every mirrored host as
      // local-first left the teacher permanently on the stale "waiting"
      // snapshot even though the learner had joined successfully.
      if ((isAssessmentRequest || pathname === "/api/assessment/commit") && url) {
        const code = String(body?.code || url.searchParams.get("code") || "")
          .trim()
          .toUpperCase();
        const localHost = code
          ? await getOfflineHostSession(code).catch(() => null)
          : null;
        if (localHost?.deleted && (!localHost.teacher_id || Number(localHost.teacher_id) === Number(tokenSession?.user?.id))) {
          return jsonResponse({ error: "This learner has been deleted.", deleted: true }, 410);
        }
        if (localHost?.offline_created || localHost?.local_pending_sync) {
          const localResponse = await serializeOfflineMutation(
            () => handleOfflineAssessment(action, init, url)
          );
          if (localResponse) {
            if (navigator.onLine) window.setTimeout(() => void syncOutbox(), 0);
            return localResponse;
          }
        }
      }

      if (offlineSessionActive && !isAssessmentRequest &&
        (["save_school_year", "edit_school_year", "save_class_section", "save_activities", "save_content_mode", "save_assessment_records", "add_learner", "delete_learner", "delete_learners", "update_user"].includes(action) && method !== "GET" ||
          isTeacherData && ["get_classes", "get_activities", "get_assessment_detail"].includes(action)) &&
        (await getOfflineOutbox()).length) {
        const localResponse = method === "GET"
          ? await offlineTeacherData(action, url)
          : await serializeOfflineMutation(() => handleOfflineTeacherMutation(action, init));
        if (localResponse) {
          if (navigator.onLine) window.setTimeout(() => void syncOutbox(), 0);
          return localResponse;
        }
      }

      // A known disconnected browser should never wait for an operating
      // system network timeout. Serve supported teacher work from IndexedDB
      // immediately; the same handlers are reused below for sudden failures
      // while navigator.onLine still reports true.
      const cloudReachable =
        navigator.onLine &&
        (!offlineSessionActive || !canUseLocalTeacherData || await canReachCloud(originalFetch));

      if (!cloudReachable) {
        if (!offlineSessionActive) {
          throw new TypeError(
            "CRL-App is offline and this device has no active offline teacher session."
          );
        }
        if (isOfflineAuthVerify) {
          return jsonResponse({ valid: true, user: tokenSession.user, offline: true });
        }
        if (isTeacherData) {
          const cached = await offlineTeacherData(action, url);
          if (cached) return cached;
        }
        if (isTeacherMutation && method !== "GET") {
          const mutation = await serializeOfflineMutation(
            () => handleOfflineTeacherMutation(action, init)
          );
          if (mutation) return mutation;
        }
        if (isAssessmentRequest && url) {
          const assessment = await serializeOfflineMutation(
            () => handleOfflineAssessment(action, init, url)
          );
          if (assessment) return assessment;
        }
        if (
          pathname === "/api/assessment/commit" &&
          method !== "GET"
        ) {
          await queueOfflineMutation({
            kind: "assessment_commit",
            url: "/api/assessment/commit",
            method: "POST",
            body,
          });
          return jsonResponse({ status: "queued", offline: true });
        }
        throw new TypeError(
          "CRL-App is offline. This request will be retried automatically when the connection returns."
        );
      }

      let requestInit = init;
      if (offlineToken && isApi && !isAuthLogin) {
        requestInit = makeBearerInit(init, offlineToken);
      }

      try {
        const response = isAssessmentRequest && action !== "host_start"
          ? await fetchCloudAssessment(originalFetch, input, requestInit,
              action === "save_final_assessment_review" || action === "host_get" ? 15000 : method === "GET" ? 1800 : 5000)
          : await originalFetch(input, requestInit);

        if (response.ok) {
          if ((isAuthLogin || isOfflineAuthVerify) && pathname === "/api/auth") {
            const payload = await readResponseJson(response);
            if (payload?.user?.id && (payload?.status === "ok" || payload?.valid)) {
              await rememberSuccessfulAuth(payload, { allowSignedOut: isAuthLogin });
            }
          }

          if (pathname === "/api/assessment" && ["save_school_year","edit_school_year","save_class_section","archive_class","archive_school_year","delete_school_year","delete_class_section","import_class_archive","restore_learner_archives"].includes(action) && tokenSession?.user?.id) {
            const payload=await readResponseJson(response);
            if(payload?.schoolYears) await reconcileClassCatalog(Number(tokenSession.user.id),payload);
          }
          if (isTeacherData) {
            const userId = Number(tokenSession?.user?.id || 0);
            if (userId) {
              const payload = await readResponseJson(response);
              const snapshot = await getSnapshot(userId);
              if (["get_learners", "get_classes", "get_assessments"].includes(action)) await reconcileRosterVersion(userId,payload?.roster_version);
              // An old in-flight read cannot repopulate a reset roster.
              if (["get_learners", "get_assessments"].includes(action)) {
                const latest = await getSnapshot(userId);
                if (Number(payload?.roster_version || 0) < Number(latest.rosterVersion || 0)) {
                  return jsonResponse({ status: "ok", roster_version: latest.rosterVersion, [action === "get_learners" ? "learners" : "assessments"]: action === "get_learners" ? latest.learners : latest.assessments });
                }
              }
              if (action === "get_classes") {
                await reconcileClassCatalog(userId,payload);
                await upgradeLegacyClassWork(userId, payload);
                const pending=await getOfflineOutbox();
                const saved=await updateSnapshot(userId,current=>({classes:mergeClassCatalog(current.classes,payload,pending)}));
                return jsonResponse({...payload,...saved.classes});
              }
              if (action === "get_learners") {
                const cloudLearners = normalizeLearners(payload);
                const nextSnapshot = await updateSnapshot(userId, (current) => ({
                  learners: mergeCachedLearners(
                    current.learners,
                    cloudLearners,
                    current.learnerTombstones, current.classes
                  ),
                }));
                const learners = nextSnapshot.learners;
                // The visible roster must receive the reconciled local-first
                // view too. Returning the raw cloud response made a newly
                // added offline learner disappear during the reconnect window
                // even though it was still safely stored in IndexedDB.
                return jsonResponse({ ...(payload || {}), learners });
              }
              if (action === "get_assessments") {
                const cloudAssessments = normalizeAssessments(payload);
                const nextSnapshot = await updateSnapshot(userId, (current) => ({
                  assessments: mergeCachedAssessments(
                    current.assessments,
                    cloudAssessments, current.classes
                  ),
                }));
                const assessments = nextSnapshot.assessments;
                return jsonResponse({ ...(payload || {}), assessments });
              }
              if (action === "get_assessment_detail" && payload?.assessment) {
                const pendingRecord = snapshot.assessments.find(assessment => Number(assessment.id) === Number(payload.assessment.id) && assessment.offline_pending);
                if (pendingRecord) return await offlineTeacherData(action, url) || response;
                await updateSnapshot(userId, (current) => ({
                  assessments: current.assessments.map((assessment) =>
                    Number(assessment?.id) === Number(payload.assessment.id)
                      ? { ...assessment, ...payload.assessment }
                      : assessment
                  ),
                }));
              }
              if (action === "get_activities" && (snapshot.activitiesOfflinePending || snapshot.contentModeOfflinePending)) {
                return await offlineTeacherData(action, url) || response;
              }
              if (
                action === "get_activities" &&
                payload?.activities &&
                !snapshot.activitiesOfflinePending
              ) {
                await setSnapshot(userId, { activities: payload.activities });
              }
            }
          }

          if (isAssessmentRequest) {
            const userId = Number(tokenSession?.user?.id || 0);
            if (userId > 0) {
              const payload = await readResponseJson(response);
              await serializeOfflineMutation(() => rememberSuccessfulAssessment(action, body, payload, userId));
            }
          }

          if (offlineSessionActive && pathname === "/api/assessment" && ["delete_learner", "delete_learners"].includes(action)) {
            const ids = action === "delete_learners" ? body.learner_ids || [] : [body.learner_id];
            const payload = await readResponseJson(response);
            await serializeOfflineMutation(async () => {
              await rememberLearnerArchives(Number(tokenSession.user.id), payload?.learner_archives);
              for (const id of ids) await discardDeletedLearner(Number(tokenSession.user.id), Number(id), true);
            });
          }
          return response;
        }

        const temporaryAssessmentFailure = isAssessmentRequest && [502, 503, 504].includes(response.status);
        if (navigator.onLine && !temporaryAssessmentFailure) return response;
      } catch (error) {
        const interruptedAssessment = isAssessmentRequest && error?.name === "AbortError";
        if (!isNetworkError(error) && !interruptedAssessment && navigator.onLine) throw error;
      }
      reachabilityProbe = { checkedAt: Date.now(), ok: false, promise: null };
      announceCloudReachability(false);

      if (!offlineSessionActive) {
        throw new TypeError("CRL-App is offline and this device has no active offline teacher session.");
      }

      if (isOfflineAuthVerify) {
        return jsonResponse({ valid: true, user: tokenSession.user, offline: true });
      }

      if (isTeacherData) {
        const cached = await offlineTeacherData(action, url);
        if (cached) return cached;
      }

      if (isTeacherMutation && (init?.method || "GET").toUpperCase() !== "GET") {
        const mutation = await serializeOfflineMutation(
          () => handleOfflineTeacherMutation(action, init)
        );
        if (mutation) return mutation;
      }

      if (isAssessmentRequest && url) {
        const assessment = await serializeOfflineMutation(
          () => handleOfflineAssessment(action, init, url)
        );
        if (assessment) return assessment;
      }

      if (pathname === "/api/assessment/commit" && (init?.method || "GET").toUpperCase() !== "GET") {
        await queueOfflineMutation({
          kind: "assessment_commit",
          url: "/api/assessment/commit",
          method: "POST",
          body: requestBody(init),
        });
        return jsonResponse({ status: "queued", offline: true });
      }

      throw new TypeError("CRL-App is offline. This request will be retried automatically when the connection returns.");
    };

    window.fetch = wrappedFetch;

    const onlineHandler = () => {
      reachabilityProbe = { checkedAt: 0, ok: true, promise: null };
      void syncOutbox();
    };
    window.addEventListener("online", onlineHandler);
    window.addEventListener("crl-offline-sync-retry", onlineHandler);
    const syncTimer = window.setInterval(() => {
      if (navigator.onLine) void syncOutbox();
    }, 2000);
    void syncOutbox();

    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("crl-offline-sync-retry", onlineHandler);
      window.clearInterval(syncTimer);
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, []);

  return null;
}
