"use client";

import { useEffect, useState } from "react";

export default function TeacherOfflineSyncNotice({ userId }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let dismiss;
    const readStatus = event => {
      window.clearTimeout(dismiss);
      const next = event?.detail || window.__crlOfflineSyncStatus;
      setStatus(next);
      if (next?.phase === "success") {
        const timeLeft = 4000 - (Date.now() - next.finishedAt);
        if (timeLeft > 0) dismiss = window.setTimeout(() => setStatus(null), timeLeft);
        else setStatus(null);
      }
    };
    readStatus();
    window.addEventListener("crl-offline-sync-status", readStatus);
    return () => {
      window.clearTimeout(dismiss);
      window.removeEventListener("crl-offline-sync-status", readStatus);
    };
  }, []);

  if (Number(status?.userId) !== Number(userId)) return null;
  const syncing = status.phase === "syncing" && status.current?.finishedAssessment &&
    status.completed < status.total;
  const saved = status.phase === "success" && status.assessmentRecordsSynced;
  if (!syncing && !saved) return null;

  return (
    <div className="teacher-offline-sync-notice" role="status">
      {syncing ? "Syncing offline assessment records to the cloud…" : "Offline assessment records synced."}
      <style jsx>{`
        .teacher-offline-sync-notice {
          position: fixed;
          right: max(16px, env(safe-area-inset-right));
          bottom: max(16px, env(safe-area-inset-bottom));
          z-index: 310;
          max-width: min(360px, calc(100vw - 32px));
          padding: 14px 18px;
          border: 1px solid #2f6c51;
          border-radius: 12px;
          background: #215640;
          color: #fff;
          box-shadow: 0 4px 16px rgba(20, 57, 41, .22);
          font-size: 13px;
          font-weight: 700;
          line-height: 1.45;
        }
      `}</style>
    </div>
  );
}
