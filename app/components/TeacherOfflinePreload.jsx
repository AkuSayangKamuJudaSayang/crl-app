"use client";

import { useEffect } from "react";
import {
  getOfflineTeacherSession,
  getOfflineTeacherSnapshot,
  saveOfflineTeacherSession,
  saveOfflineTeacherSnapshot,
} from "../../lib/teacherOfflineDb";

export default function TeacherOfflinePreload() {
  useEffect(() => {
    let cancelled = false;
    const warmOfflineTools = () => {
      if (cancelled || !navigator.onLine) return;
      void Promise.all([
        import("../../lib/offlineClassRecordImport"),
        import("xlsx"),
      ]).catch(() => {});
    };
    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(warmOfflineTools, { timeout: 5000 })
        : window.setTimeout(warmOfflineTools, 1800);

    async function preload() {
      if (!navigator.onLine) return;

      try {
        const response = await fetch("/api/auth/offline", {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!data?.user?.id || !data?.offlineToken || cancelled) return;
        const existingSession = await getOfflineTeacherSession().catch(() => null);
        if (existingSession?.signedOut) return;

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

        const retained = await getOfflineTeacherSnapshot(data.user.id).catch(() => null);
        const snapshot = {
          ...(retained || {}),
          learners: Array.isArray(retained?.learners) ? retained.learners : [],
          assessments: Array.isArray(retained?.assessments) ? retained.assessments : [],
          activities: retained?.activities || null,
          user: data.user,
          savedAt: Date.now(),
        };

        const [learnersResponse, assessmentsResponse, activitiesResponse] = await Promise.all([
          fetch("/api/assessment?action=get_learners", { credentials: "include", cache: "no-store" }),
          fetch("/api/assessment?action=get_assessments", { credentials: "include", cache: "no-store" }),
          fetch("/api/assessment?action=get_activities", { credentials: "include", cache: "no-store" }),
        ]);

        if (learnersResponse.ok) {
          const payload = await learnersResponse.json();
          const cloud = Array.isArray(payload?.learners) ? payload.learners : [];
          const pending = snapshot.learners.filter(
            (learner) =>
              learner?.offline_pending &&
              !cloud.some(
                (remote) =>
                  String(remote?.lrn || "").trim() ===
                  String(learner?.lrn || "").trim()
              )
          );
          snapshot.learners = [...cloud, ...pending];
        }
        if (assessmentsResponse.ok) {
          const payload = await assessmentsResponse.json();
          const cloud = Array.isArray(payload?.assessments) ? payload.assessments : [];
          const pending = snapshot.assessments.filter(
            (assessment) =>
              assessment?.offline_pending &&
              !cloud.some(
                (remote) =>
                  Number(remote?.learner_id) === Number(assessment?.learner_id) &&
                  String(remote?.assessment_period || "") ===
                    String(assessment?.assessment_period || "") &&
                  Boolean(remote?.is_completed)
              )
          );
          snapshot.assessments = [...cloud, ...pending];
        }
        if (activitiesResponse.ok && !snapshot.activitiesOfflinePending) {
          const payload = await activitiesResponse.json();
          snapshot.activities = payload?.activities || null;
        }

        if (!cancelled) {
          snapshot.savedAt = Date.now();
          await saveOfflineTeacherSnapshot(data.user.id, snapshot);
        }
      } catch {
        // Offline preparation is retried when the connection returns.
      }
    }

    void preload();
    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, []);

  return null;
}
