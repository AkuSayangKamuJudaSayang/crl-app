"use client";

import { useEffect } from "react";
import {
  getOfflineHostSession,
  getOfflineOutbox,
  getOfflineTeacherSession,
  getOfflineTeacherSnapshot,
  offlineSet,
  removeOfflineMutation,
  saveOfflineHostSession,
  saveOfflineTeacherSession,
  saveOfflineTeacherSnapshot,
  signOutOfflineTeacherSession,
  enqueueOfflineMutation,
} from "../../lib/teacherOfflineDb";

const SNAPSHOT_DEFAULT = {
  learners: [],
  assessments: [],
  activities: null,
  user: null,
  savedAt: 0,
};

const DEFAULT_LETTERS = ["M", "S", "A", "L", "O", "B", "E", "U", "R", "T"];
const DEFAULT_WORDS = [
  "clap", "jump", "eat", "drink", "stand",
  "dance", "fly", "pencil", "basket", "helmet",
];
const DEFAULT_STORIES = [
  {
    id: 1,
    title: "Para The Parrot",
    text: "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.",
  },
  {
    id: 2,
    title: "A Day In The Fields",
    text: "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil.",
  },
];
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
  "host_get", "host_start", "host_update", "host_advance", "host_end",
  "record_letter", "record_word", "select_story", "passage_ready",
  "passage_timer", "finish_passage", "record_passage_miscue",
  "remove_passage_miscue", "record_miscue", "remove_miscue",
  "record_comprehension", "save_experience_rating", "finalize",
  "save_final_assessment_review", "learner_join", "host_join",
  "learner_status", "learner_heartbeat",
]);

function normalizePeriod(value) {
  const period = String(value || "BoSY").trim();
  return ["BoSY", "MoSY", "EoSY"].includes(period) ? period : "BoSY";
}

function getOfflineAssessmentContent(snapshot, period) {
  const source = snapshot?.activities?.[normalizePeriod(period)] || {};
  const letters = Array.isArray(source.letters) && source.letters.length
    ? source.letters.map(String).slice(0, 10)
    : DEFAULT_LETTERS.slice();
  const words = Array.isArray(source.words) && source.words.length
    ? source.words.map(String).slice(0, 10)
    : DEFAULT_WORDS.slice();
  const sourceStories = Array.isArray(source.stories) && source.stories.length
    ? source.stories
    : DEFAULT_STORIES;
  const stories = sourceStories.map((story, index) => ({
    id: Number(story?.id ?? index + 1),
    title: String(story?.title || DEFAULT_STORIES[index]?.title || `Story ${index + 1}`),
    text: String(story?.text || story?.content || DEFAULT_STORIES[index]?.text || ""),
    description: String(story?.description || "Story passage from Manage Assessment."),
    available: Boolean(String(story?.text || story?.content || DEFAULT_STORIES[index]?.text || "").trim()),
  }));
  return { letters, words, stories };
}

function getOfflineQuestions(title) {
  return String(title || "").toLowerCase().includes("a day in the fields")
    ? STORY_QUESTIONS.fields
    : STORY_QUESTIONS.para;
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
  const comprehensionScore = passageWasAdministered
    ? comprehension.filter((item) => item?.isCorrect).length
    : 0;
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
    id: Number(host?.local_assessment_id || -Date.now()),
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
  const pending = await getOfflineOutbox().catch(() => []);
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

const DATA_ACTIONS = new Set([
  "get_learners",
  "get_assessments",
  "get_activities",
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

function mergeCachedLearners(cached, cloud) {
  const cloudLearners = Array.isArray(cloud) ? cloud.filter(Boolean) : [];
  const pending = (Array.isArray(cached) ? cached : []).filter(
    (learner) =>
      learner?.offline_pending &&
      !cloudLearners.some(
        (remote) =>
          String(remote?.lrn || "").trim() === String(learner?.lrn || "").trim()
      )
  );
  return [...cloudLearners, ...pending];
}

function mergeCachedAssessments(cached, cloud) {
  const cloudAssessments = Array.isArray(cloud) ? cloud.filter(Boolean) : [];
  const pending = (Array.isArray(cached) ? cached : []).filter(
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
      ? { ...item, learner_id: serverId, learnerId: serverId }
      : item
  );
}

async function getSnapshot(userId) {
  const saved = await getOfflineTeacherSnapshot(userId).catch(() => null);
  return {
    ...SNAPSHOT_DEFAULT,
    ...(saved || {}),
    learners: Array.isArray(saved?.learners) ? saved.learners : [],
    assessments: Array.isArray(saved?.assessments) ? saved.assessments : [],
  };
}

async function setSnapshot(userId, patch) {
  const current = await getSnapshot(userId);
  const next = { ...current, ...patch, savedAt: Date.now() };
  await saveOfflineTeacherSnapshot(userId, next);
  return next;
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
  const snapshot = await getSnapshot(userId);
  const session = await getOfflineTeacherSession().catch(() => null);
  const token = isActiveOfflineSession(session) ? extractOfflineToken(session) : "";
  const requests = [
    ["/api/assessment?action=get_learners", "learners"],
    ["/api/assessment?action=get_assessments", "assessments"],
    ["/api/assessment?action=get_activities", "activities"],
  ];

  let next = snapshot;
  for (const [url, key] of requests) {
    try {
      const response = await window.__crlOriginalFetch(
        url,
        makeBearerInit(
          {
            credentials: "include",
            cache: "no-store",
            headers: { Accept: "application/json" },
          },
          token
        )
      );
      if (!response.ok) continue;
      const data = await response.json();
      if (key === "learners") {
        next = {
          ...next,
          learners: mergeCachedLearners(next.learners, normalizeLearners(data)),
        };
      }
      if (key === "assessments") {
        next = {
          ...next,
          assessments: mergeCachedAssessments(
            next.assessments,
            normalizeAssessments(data)
          ),
        };
      }
      if (key === "activities" && data?.activities && !next.activitiesOfflinePending) {
        next = { ...next, activities: data.activities };
      }
    } catch {
      /* Warm-up is best effort. */
    }
  }

  next.savedAt = Date.now();
  await saveOfflineTeacherSnapshot(userId, next).catch(() => {});
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

async function syncOutbox() {
  if (!navigator.onLine || !window.__crlOriginalFetch) return;
  const session = await getOfflineTeacherSession().catch(() => null);
  if (!isActiveOfflineSession(session)) return;
  const token = extractOfflineToken(session);
  const entries = await getOfflineOutbox().catch(() => []);
  const learnerIdMap = new Map();
  const hostCodeMap = new Map();
  let synchronizedAny = false;

  for (const entry of entries) {
    try {
      const originalBody = entry.body || {};
      const offlineCode = String(
        entry.kind === "host_start"
          ? originalBody.offline_code || ""
          : originalBody.code || ""
      ).trim().toUpperCase();
      const localHost = offlineCode
        ? await getOfflineHostSession(offlineCode).catch(() => null)
        : null;

      // Keep an offline-created assessment on one stable local code while it
      // is active. Once the teacher saves or cancels it, replay the complete
      // ordered journal as one reconnect batch.
      if (localHost?.offline_created && !localHost?.ended) continue;

      const mappedLearnerId = learnerIdMap.get(Number(originalBody.learner_id));
      const mappedCode =
        hostCodeMap.get(String(originalBody.code || "").toUpperCase()) ||
        localHost?.server_code ||
        originalBody.code;
      const body = {
        ...originalBody,
        ...(mappedLearnerId ? { learner_id: mappedLearnerId } : {}),
        ...(mappedCode ? { code: mappedCode } : {}),
      };
      delete body.offline_code;
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

      const response = await window.__crlOriginalFetch(entry.url, init);
      // Assessment mutations are an ordered journal. If one request cannot
      // be accepted, leave it and every later request queued so stages and
      // recorded answers can never be replayed out of order.
      if (!response.ok) break;

      const data = await readResponseJson(response);
      const userId = Number(session?.user?.id || 0);
      if (userId > 0 && entry.kind === "add_learner" && data?.learner?.id && entry.localId) {
        learnerIdMap.set(Number(entry.localId), Number(data.learner.id));
        const snapshot = await getSnapshot(userId);
        await saveOfflineTeacherSnapshot(userId, {
          ...snapshot,
          learners: snapshot.learners.map((learner) =>
            Number(learner?.id) === Number(entry.localId)
              ? {
                  ...learner,
                  ...data.learner,
                  id: data.learner.id,
                }
              : learner
          ),
          assessments: replaceLearnerIdInAssessments(snapshot.assessments, entry.localId, data.learner.id),
          savedAt: Date.now(),
        });
        await rewriteQueuedReferences(
          (queuedBody) =>
            Number(queuedBody?.learner_id) === Number(entry.localId)
              ? { ...queuedBody, learner_id: Number(data.learner.id) }
              : queuedBody,
          entry.id
        );
      }

      if (entry.kind === "host_start" && offlineCode && data?.code) {
        const serverCode = String(data.code).trim().toUpperCase();
        hostCodeMap.set(offlineCode, serverCode);
        if (localHost) {
          await saveOfflineHostSession(offlineCode, {
            ...localHost,
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

      if (userId > 0 && entry.kind === "save_activities") {
        const snapshot = await getSnapshot(userId);
        await saveOfflineTeacherSnapshot(userId, {
          ...snapshot,
          activities: data?.activities || snapshot.activities,
          activitiesOfflinePending: false,
          savedAt: Date.now(),
        });
      }

      await removeOfflineMutation(entry.id);
      synchronizedAny = true;
    } catch {
      // Keep this mutation and the untouched tail for the next reconnect.
      break;
    }
  }

  if (synchronizedAny) {
    const userId = Number(session?.user?.id || 0);
    if (userId > 0) await warmTeacherSnapshot(userId);
  }
}

async function offlineTeacherData(action) {
  const session = await getOfflineTeacherSession();
  if (!isActiveOfflineSession(session)) return null;
  const userId = Number(session?.user?.id || 0);
  if (!userId) return null;
  const snapshot = await getSnapshot(userId);

  if (action === "get_learners") return jsonResponse({ status: "ok", learners: snapshot.learners, offline: true });
  if (action === "get_assessments") return jsonResponse({ status: "ok", assessments: snapshot.assessments, offline: true });
  if (action === "get_activities") {
    return jsonResponse({ status: "ok", activities: snapshot.activities || null, offline: true });
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

  if (action === "save_activities") {
    const nextActivities = body?.content || body?.activities;
    if (!nextActivities) return jsonResponse({ error: "Assessment content is missing." }, 400);
    await setSnapshot(userId, {
      activities: nextActivities,
      activitiesOfflinePending: true,
    });
    await enqueueOfflineMutation({
      kind: "save_activities",
      url: "/api/assessment?action=save_activities",
      method: "POST",
      body: { action: "save_activities", content: nextActivities },
    });
    return jsonResponse({ status: "ok", activities: nextActivities, offline: true });
  }

  if (action === "update_user") {
    const user = { ...(snapshot.user || session.user), ...(body || {}) };
    await saveOfflineTeacherSession({ ...session, user, updatedAt: Date.now() });
    await setSnapshot(userId, { user });
    await enqueueOfflineMutation({
      kind: "update_user",
      url: "/api/auth?action=update_user",
      method: "POST",
      body,
    });
    return jsonResponse({ status: "ok", user, offline: true });
  }

  if (action === "add_learner") {
    const localId = -Math.floor(Date.now() + Math.random() * 1000);
    const learner = {
      id: localId,
      lrn: String(body?.lrn || "").trim(),
      first_name: String(body?.first_name || body?.firstName || "").trim(),
      middle_name: String(body?.middle_name || body?.middleName || "").trim(),
      last_name: String(body?.last_name || body?.lastName || "").trim(),
      sex: String(body?.sex || "").trim(),
      grade_level: Number(body?.grade_level || 3),
      section: String(body?.section || snapshot.user?.section || "").trim(),
      created_at: new Date().toISOString(),
      offline_pending: true,
    };
    await setSnapshot(userId, { learners: [...snapshot.learners, learner] });
    await enqueueOfflineMutation({
      kind: "add_learner",
      localId,
      url: "/api/assessment?action=add_learner",
      method: "POST",
      body,
    });
    return jsonResponse({ status: "ok", learner, offline: true });
  }

  if (action === "delete_learner" || action === "delete_learners") {
    const ids = action === "delete_learners"
      ? (Array.isArray(body?.learner_ids) ? body.learner_ids.map(Number) : [])
      : [Number(body?.learner_id ?? body?.learnerId ?? body?.id ?? 0)];
    const lrns = action === "delete_learner"
      ? [String(body?.lrn ?? body?.LRN ?? "").trim()]
      : [];
    const nextLearners = snapshot.learners.filter((learner) => {
      const id = Number(learner?.id ?? 0);
      const lrn = String(learner?.lrn ?? learner?.LRN ?? "").trim();
      return !ids.includes(id) && !lrns.includes(lrn);
    });
    const deletedIds = snapshot.learners
      .filter((learner) => {
        const id = Number(learner?.id ?? 0);
        const lrn = String(learner?.lrn ?? learner?.LRN ?? "").trim();
        return ids.includes(id) || lrns.includes(lrn);
      })
      .map((learner) => Number(learner?.id ?? 0));
    await setSnapshot(userId, {
      learners: nextLearners,
      assessments: snapshot.assessments.filter((item) => !deletedIds.includes(Number(item?.learner_id))),
    });
    await enqueueOfflineMutation({
      kind: action,
      url: `/api/assessment?action=${action}`,
      method: "POST",
      body,
    });
    return jsonResponse({ status: "ok", deleted_learner_ids: deletedIds.filter((id) => id > 0), deleted_count: deletedIds.length, offline: true });
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
    const learnerId = Number(body?.learner_id ?? body?.learnerId ?? 0);
    const learner = snapshot.learners.find((item) => Number(item?.id) === learnerId);
    if (!learner) {
      return jsonResponse({ error: "The selected learner is not available offline." }, 404);
    }
    const period = normalizePeriod(body?.period);
    const assessmentContent = getOfflineAssessmentContent(snapshot, period);
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const host = {
      code: `OFF${suffix}`.slice(0, 20),
      teacher_id: userId,
      learner_id: learnerId,
      learner,
      assessment_period: period,
      // A teacher must remain able to administer an assessment without a
      // second connected device. A learner tab on this same device can still
      // join the local code and receives the same IndexedDB/Broadcast state.
      stage: "letter",
      current_content: assessmentContent.letters[0] || DEFAULT_LETTERS[0],
      story_title: "",
      ended: false,
      connected: true,
      linked_at: new Date().toISOString(),
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
    await enqueueOfflineMutation({
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
  let next = { ...existing, offline: true };
  const content = existing.assessment_content ||
    getOfflineAssessmentContent(await getSnapshot(userId), existing.assessment_period);
  const nowIso = new Date().toISOString();

  if (action === "learner_join") {
    next = {
      ...next,
      connected: true,
      linked_at: next.linked_at || nowIso,
      stage: ["waiting", "connected"].includes(next.stage) ? "letter" : next.stage,
      current_content:
        next.current_content || content.letters[0] || DEFAULT_LETTERS[0],
    };
  }

  if (["host_update", "host_advance"].includes(action)) {
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
    };
  }

  if (action === "record_letter") {
    const index = Number(body?.letter_index ?? body?.letterIndex);
    if (!Number.isInteger(index) || index < 0 || index >= content.letters.length) {
      return jsonResponse({ error: "Invalid letter index." }, 400);
    }
    const results = Array.isArray(body?.task1_results)
      ? body.task1_results.map((item) => ({
          index: Number(item?.index),
          content: content.letters[Number(item?.index)] || item?.content || "",
          isCorrect: Boolean(item?.isCorrect),
        }))
      : upsertOfflineResult(
          next.task1Results,
          index,
          content.letters[index],
          body?.is_correct ?? body?.isCorrect
        );
    const complete = results.length >= content.letters.length;
    const zeroScore = complete && results.every((item) => !item.isCorrect);
    next = {
      ...next,
      task1Results: results,
      stage: zeroScore ? "terminated" : complete ? "word" : "letter",
      current_content: zeroScore
        ? "ZERO_SCORE_PART1_TASK1"
        : complete
          ? content.words[0]
          : content.letters[index + 1] || next.current_content,
      connected: !zeroScore,
    };
  }

  if (action === "record_word") {
    const index = Number(body?.word_index ?? body?.wordIndex);
    if (!Number.isInteger(index) || index < 0 || index >= content.words.length) {
      return jsonResponse({ error: "Invalid word index." }, 400);
    }
    const results = Array.isArray(body?.task2_results)
      ? body.task2_results.map((item) => ({
          index: Number(item?.index),
          content: content.words[Number(item?.index)] || item?.content || "",
          isCorrect: Boolean(item?.isCorrect),
        }))
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
    next = {
      ...next,
      task2Results: results,
      stage: earlyStop ? "terminated" : complete ? "story_choice" : "word",
      current_content: earlyStop
        ? "PART1_TOTAL_LOW"
        : complete
          ? "Choose a story passage. The teacher will select it."
          : content.words[index + 1] || next.current_content,
      connected: !earlyStop,
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
    next = {
      ...next,
      passage_started_at: next.passage_started_at || body?.started_at || nowIso,
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
    const questions = getOfflineQuestions(next.story_title);
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
    const questions = getOfflineQuestions(next.story_title);
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
      current_content: questions[questionIndex + 1] || next.current_content,
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
      comprehensionResults: Array.isArray(body?.comprehension_results)
        ? body.comprehension_results
        : next.comprehensionResults,
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
      comprehensionResults: Array.isArray(body?.comprehension_results)
        ? body.comprehension_results
        : next.comprehensionResults,
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
    const snapshot = await getSnapshot(userId);
    const record = offlineAssessmentRecord(next, metrics);
    await setSnapshot(userId, {
      assessments: [
        ...snapshot.assessments.filter(
          (item) => item?.offline_session_code !== code
        ),
        record,
      ],
    });
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

  next = {
    ...next,
    assessment_content: content,
    story_choices: content.stories,
    metrics: calculateOfflineMetrics(next),
    updated_at: nowIso,
  };
  await saveOfflineHostSession(code, next);

  if (!["host_get", "learner_status", "learner_heartbeat"].includes(action)) {
    await enqueueOfflineMutation({
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
    const learner = snapshot.learners.find((item) => Number(item?.id) === learnerId) || null;
    const period = normalizePeriod(body?.period || payload?.period);
    const assessmentContent = getOfflineAssessmentContent(snapshot, period);
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
  if (!existing) return;

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
        getOfflineQuestions(next.story_title)[index] || "",
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
      comprehensionResults: Array.isArray(body?.comprehension_results)
        ? body.comprehension_results
        : next.comprehensionResults,
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
      comprehensionResults: Array.isArray(body?.comprehension_results)
        ? body.comprehension_results
        : next.comprehensionResults,
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
    const snapshot = await getSnapshot(userId);
    const record = {
      ...offlineAssessmentRecord(next, metrics),
      id: Number(next.server_assessment_session_id || -Date.now()),
      offline_pending: false,
    };
    await setSnapshot(userId, {
      assessments: [
        ...snapshot.assessments.filter(
          (item) =>
            !(
              Number(item?.learner_id) === Number(next.learner_id) &&
              String(item?.assessment_period || "") ===
                String(next.assessment_period || "")
            )
        ),
        record,
      ],
    });
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
      const tokenSession = await getOfflineTeacherSession().catch(() => null);
      const offlineToken = extractOfflineToken(tokenSession);
      const isApi = sameOrigin(pathname) && pathname.startsWith("/api/");
      const isAuthLogin = pathname === "/api/auth" && ["login", "verify_login_2fa", "signup"].includes(action);
      const isOfflineAuthVerify = pathname === "/api/auth" && action === "verify";
      const isLogout = pathname === "/api/auth" && action === "logout";
      const isTeacherData = pathname === "/api/assessment" && DATA_ACTIONS.has(action);
      const isTeacherMutation = pathname === "/api/assessment" || (pathname === "/api/auth" && action === "update_user");
      const isAssessmentRequest = pathname === "/api/assessment" && OFFLINE_ASSESSMENT_ACTIONS.has(action);

      if (isLogout) {
        await signOutOfflineTeacherSession().catch(() => {});
        try {
          return await originalFetch(input, init);
        } catch {
          return jsonResponse({ status: "ok", signed_out: true, offline: true });
        }
      }

      const offlineSessionActive = isActiveOfflineSession(tokenSession);

      // Offline-created sessions deliberately retain their local code for the
      // entire assessment. Reconnection must not send that code to the cloud
      // halfway through the flow; the ordered outbox is replayed after Save.
      if (isAssessmentRequest && url) {
        const code = String(body?.code || url.searchParams.get("code") || "")
          .trim()
          .toUpperCase();
        const localHost = code
          ? await getOfflineHostSession(code).catch(() => null)
          : null;
        if (localHost?.offline_created) {
          const localResponse = await handleOfflineAssessment(action, init, url);
          if (localResponse) return localResponse;
        }
      }

      // A known disconnected browser should never wait for an operating
      // system network timeout. Serve supported teacher work from IndexedDB
      // immediately; the same handlers are reused below for sudden failures
      // while navigator.onLine still reports true.
      if (!navigator.onLine) {
        if (!offlineSessionActive) {
          throw new TypeError(
            "CRL-App is offline and this device has no active offline teacher session."
          );
        }
        if (isOfflineAuthVerify) {
          return jsonResponse({ valid: true, user: tokenSession.user, offline: true });
        }
        if (isTeacherData) {
          const cached = await offlineTeacherData(action);
          if (cached) return cached;
        }
        if (isTeacherMutation && (init?.method || "GET").toUpperCase() !== "GET") {
          const mutation = await handleOfflineTeacherMutation(action, init);
          if (mutation) return mutation;
        }
        if (isAssessmentRequest && url) {
          const assessment = await handleOfflineAssessment(action, init, url);
          if (assessment) return assessment;
        }
        if (
          pathname === "/api/assessment/commit" &&
          (init?.method || "GET").toUpperCase() !== "GET"
        ) {
          await enqueueOfflineMutation({
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
        const response = await originalFetch(input, requestInit);

        if (response.ok) {
          if ((isAuthLogin || isOfflineAuthVerify) && pathname === "/api/auth") {
            const payload = await readResponseJson(response);
            if (payload?.user?.id && (payload?.status === "ok" || payload?.valid)) {
              await rememberSuccessfulAuth(payload, { allowSignedOut: isAuthLogin });
            }
          }

          if (isTeacherData) {
            const userId = Number(tokenSession?.user?.id || 0);
            if (userId) {
              const payload = await readResponseJson(response);
              const snapshot = await getSnapshot(userId);
              if (action === "get_learners") {
                await setSnapshot(userId, {
                  learners: mergeCachedLearners(
                    snapshot.learners,
                    normalizeLearners(payload)
                  ),
                });
              }
              if (action === "get_assessments") {
                await setSnapshot(userId, {
                  assessments: mergeCachedAssessments(
                    snapshot.assessments,
                    normalizeAssessments(payload)
                  ),
                });
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
              await rememberSuccessfulAssessment(action, body, payload, userId);
            }
          }

          return response;
        }

        if (navigator.onLine) return response;
      } catch (error) {
        if (!isNetworkError(error) && navigator.onLine) throw error;
      }

      if (!offlineSessionActive) {
        throw new TypeError("CRL-App is offline and this device has no active offline teacher session.");
      }

      if (isOfflineAuthVerify) {
        return jsonResponse({ valid: true, user: tokenSession.user, offline: true });
      }

      if (isTeacherData) {
        const cached = await offlineTeacherData(action);
        if (cached) return cached;
      }

      if (isTeacherMutation && (init?.method || "GET").toUpperCase() !== "GET") {
        const mutation = await handleOfflineTeacherMutation(action, init);
        if (mutation) return mutation;
      }

      if (isAssessmentRequest && url) {
        const assessment = await handleOfflineAssessment(action, init, url);
        if (assessment) return assessment;
      }

      if (pathname === "/api/assessment/commit" && (init?.method || "GET").toUpperCase() !== "GET") {
        await enqueueOfflineMutation({
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

    const onlineHandler = () => { void syncOutbox(); };
    window.addEventListener("online", onlineHandler);
    void syncOutbox();

    return () => {
      window.removeEventListener("online", onlineHandler);
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, []);

  return null;
}
