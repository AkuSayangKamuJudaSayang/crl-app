"use client";

import { useEffect } from "react";
import {
  getOfflineHostSession,
  getOfflineOutbox,
  getOfflineTeacherSession,
  getOfflineTeacherSnapshot,
  offlineGet,
  offlineSet,
  removeOfflineMutation,
  saveOfflineHostSession,
  saveOfflineTeacherSession,
  saveOfflineTeacherSnapshot,
  enqueueOfflineMutation,
} from "../../lib/teacherOfflineDb";

const SNAPSHOT_DEFAULT = {
  learners: [],
  assessments: [],
  activities: null,
  user: null,
  savedAt: 0,
};

const DATA_ACTIONS = new Set([
  "get_learners",
  "get_assessments",
  "get_activities",
]);

const OFFLINE_HANDLED_ASSESSMENT_ACTIONS = new Set([
  "host_get",
  "host_start",
  "select_story",
  "host_update",
  "host_advance",
  "host_end",
  "record_letter",
  "record_word",
  "finish_passage",
  "record_miscue",
  "remove_miscue",
  "record_comprehension",
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
  return String(session?.offlineToken || session?.token || "").trim();
}

async function bootstrapOfflineSession() {
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

    const session = {
      version: 1,
      user: data.user,
      offlineToken: data.offlineToken,
      expiresAt: Number(data.expiresAt || 0),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveOfflineTeacherSession(session);
    return session;
  } catch {
    return null;
  }
}

async function rememberSuccessfulAuth(payload) {
  if (!payload?.user?.id) return;
  const existing = await getOfflineTeacherSession().catch(() => null);
  await saveOfflineTeacherSession({
    ...(existing || {}),
    user: payload.user,
    updatedAt: Date.now(),
  }).catch(() => {});

  const bootstrapped = await bootstrapOfflineSession();
  if (bootstrapped?.user?.id) {
    await setSnapshot(bootstrapped.user.id, { user: bootstrapped.user });
    await warmTeacherSnapshot(bootstrapped.user.id);
  }
}

async function warmTeacherSnapshot(userId) {
  const snapshot = await getSnapshot(userId);
  const requests = [
    ["/api/assessment?action=get_learners", "learners"],
    ["/api/assessment?action=get_assessments", "assessments"],
    ["/api/assessment?action=get_activities", "activities"],
  ];

  let next = snapshot;
  for (const [url, key] of requests) {
    try {
      const response = await window.__crlOriginalFetch(url, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (key === "learners") next = { ...next, learners: normalizeLearners(data) };
      if (key === "assessments") next = { ...next, assessments: normalizeAssessments(data) };
      if (key === "activities" && data?.activities) next = { ...next, activities: data.activities };
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
  const token = extractOfflineToken(session);
  const entries = await getOfflineOutbox().catch(() => []);

  for (const entry of entries) {
    try {
      const body = entry.body || {};
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
      if (!response.ok) continue;

      const data = await readResponseJson(response);
      const userId = Number(session?.user?.id || 0);
      if (userId > 0 && entry.kind === "add_learner" && data?.learner?.id && entry.localId) {
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
      }

      await removeOfflineMutation(entry.id);
    } catch {
      /* Keep the mutation for the next reconnect. */
    }
  }
}

async function offlineTeacherData(action) {
  const session = await getOfflineTeacherSession();
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
  const userId = Number(session?.user?.id || 0);
  if (!userId) return null;
  const body = requestBody(init);
  const snapshot = await getSnapshot(userId);

  if (action === "save_activities") {
    const nextActivities = body?.content || body?.activities;
    if (!nextActivities) return jsonResponse({ error: "Assessment content is missing." }, 400);
    await setSnapshot(userId, { activities: nextActivities });
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
  const userId = Number(session?.user?.id || 0);
  if (!userId) return null;
  const body = requestBody(init);
  const code = String(body?.code || url.searchParams.get("code") || "").trim().toUpperCase();

  if (action === "host_start") {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const host = {
      code: `OFF${suffix}`.slice(0, 20),
      teacher_id: userId,
      learner_id: Number(body?.learner_id || 0) || null,
      assessment_period: body?.period || "BoSY",
      stage: "waiting",
      current_content: null,
      story_title: "",
      ended: false,
      connected: false,
      offline: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await saveOfflineHostSession(host.code, host);
    await enqueueOfflineMutation({
      kind: "host_start",
      url: "/api/assessment?action=host_start",
      method: "POST",
      body: { ...body, offline_code: host.code },
    });
    return jsonResponse({ status: "ok", code: host.code, offline: true });
  }

  if (!code) return null;
  const existing = await getOfflineHostSession(code);

  if (action === "host_get") {
    if (!existing) return jsonResponse({ error: "Assessment session not found offline." }, 404);
    return jsonResponse({ status: "ok", session: existing, offline: true });
  }

  if (!existing) return jsonResponse({ error: "Assessment session not found offline." }, 404);

  const next = {
    ...existing,
    ...(body?.stage ? { stage: body.stage } : {}),
    ...(body?.currentContent !== undefined ? { current_content: body.currentContent } : {}),
    ...(body?.current_content !== undefined ? { current_content: body.current_content } : {}),
    ...(body?.storyTitle !== undefined ? { story_title: body.storyTitle } : {}),
    ...(body?.story_title !== undefined ? { story_title: body.story_title } : {}),
    ...(action === "select_story" ? {
      stage: "passage",
      story_title: body?.story_id === 1 ? "Para The Parrot" : "A Day In The Fields",
    } : {}),
    ...(action === "host_end" ? { stage: body?.stage || "completed", ended: true } : {}),
    updated_at: new Date().toISOString(),
    offline: true,
  };

  await saveOfflineHostSession(code, next);

  if (action !== "host_get") {
    await enqueueOfflineMutation({
      kind: action,
      url: `/api/assessment?action=${action}`,
      method: "POST",
      body,
    });
  }

  if (action === "host_update" || action === "host_advance" || action === "select_story" || action === "host_end") {
    return jsonResponse({ status: "ok", session: next, offline: true });
  }

  return jsonResponse({ status: "ok", offline: true, session: next });
}

export default function OfflineRuntime() {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (!window.__crlOriginalFetch) {
      window.__crlOriginalFetch = window.fetch.bind(window);
    }

    const originalFetch = window.__crlOriginalFetch;
    let disposed = false;

    const wrappedFetch = async (input, init) => {
      const inputUrl = typeof input === "string" ? input : input?.url;
      const { url, pathname, action } = parseAction(inputUrl || "");
      const tokenSession = await getOfflineTeacherSession().catch(() => null);
      const offlineToken = extractOfflineToken(tokenSession);
      const isApi = sameOrigin(pathname) && pathname.startsWith("/api/");
      const isAuthLogin = pathname === "/api/auth" && ["login", "verify_login_2fa", "signup"].includes(action);
      const isOfflineAuthVerify = pathname === "/api/auth" && action === "verify";
      const isTeacherData = pathname === "/api/assessment" && DATA_ACTIONS.has(action);
      const isTeacherMutation = pathname === "/api/assessment" || (pathname === "/api/auth" && action === "update_user");
      const isAssessmentMutation = pathname === "/api/assessment" && OFFLINE_HANDLED_ASSESSMENT_ACTIONS.has(action);

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
              void rememberSuccessfulAuth(payload);
            }
          }

          if (isTeacherData) {
            const userId = Number(tokenSession?.user?.id || 0);
            if (userId) {
              const payload = await readResponseJson(response);
              if (action === "get_learners") await setSnapshot(userId, { learners: normalizeLearners(payload) });
              if (action === "get_assessments") await setSnapshot(userId, { assessments: normalizeAssessments(payload) });
              if (action === "get_activities" && payload?.activities) await setSnapshot(userId, { activities: payload.activities });
            }
          }

          return response;
        }

        if (navigator.onLine) return response;
      } catch (error) {
        if (!isNetworkError(error) && navigator.onLine) throw error;
      }

      if (!tokenSession || Number(tokenSession.expiresAt || 0) <= Date.now()) {
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

      if (isAssessmentMutation) {
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
      disposed = true;
      window.removeEventListener("online", onlineHandler);
      if (!disposed) window.fetch = originalFetch;
    };
  }, []);

  return null;
}
