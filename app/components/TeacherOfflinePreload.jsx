"use client";

import { useEffect } from "react";
import {
  getOfflineTeacherSession,
  saveOfflineTeacherSession,
} from "../../lib/teacherOfflineDb";

export default function TeacherOfflinePreload() {
  useEffect(() => {
    let cancelled = false;
    const warmOfflineTools = () => {
      if (cancelled || !navigator.onLine) return;
      navigator.serviceWorker?.ready.then((registration) => {
        if (!cancelled) registration.active?.postMessage({ type: "WARM_CRLA_APP" });
      }).catch(() => {});
      void Promise.all([
        import("../../lib/offlineClassRecordImport"),
        import("../../lib/offlineExcelExport"),
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
        await saveOfflineTeacherSession(session, { allowSignedOut: false });

        if (cancelled) return;
        window.dispatchEvent(new Event("crl-offline-session-ready"));

        // OfflineRuntime merges these reads with the latest local snapshot.
        // A separate write here could restore a stale pending record.
        await Promise.all([
          fetch("/api/assessment?action=get_learners", { credentials: "include", cache: "no-store" }),
          fetch("/api/assessment?action=get_assessments", { credentials: "include", cache: "no-store" }),
          fetch("/api/assessment?action=get_activities", { credentials: "include", cache: "no-store" }),
        ]);
      } catch {
        // Offline preparation is retried when the connection returns.
      }
    }

    void preload();
    const onOnline = () => {
      warmOfflineTools();
      void preload();
    };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, []);

  return null;
}
