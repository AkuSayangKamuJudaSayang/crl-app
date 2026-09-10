"use client";

import { useEffect } from "react";
import {
  saveOfflineTeacherSession,
  saveOfflineTeacherSnapshot,
} from "../../lib/teacherOfflineDb";

export default function TeacherOfflinePreload() {
  useEffect(() => {
    let cancelled = false;

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

        const session = {
          version: 1,
          user: data.user,
          offlineToken: data.offlineToken,
          expiresAt: Number(data.expiresAt || 0),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await saveOfflineTeacherSession(session);

        const snapshot = {
          learners: [],
          assessments: [],
          activities: null,
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
          snapshot.learners = Array.isArray(payload?.learners) ? payload.learners : [];
        }
        if (assessmentsResponse.ok) {
          const payload = await assessmentsResponse.json();
          snapshot.assessments = Array.isArray(payload?.assessments) ? payload.assessments : [];
        }
        if (activitiesResponse.ok) {
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
    return () => { cancelled = true; };
  }, []);

  return null;
}
