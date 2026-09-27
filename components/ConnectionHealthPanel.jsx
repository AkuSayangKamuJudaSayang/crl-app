"use client";

import { useCallback, useEffect, useState } from "react";
import { isProbablyOnline } from "../lib/localFirstStore";
import LocalAssessmentPairing from "./LocalAssessmentPairing";

function connectionInfo() {
  if (typeof navigator === "undefined") return { online: true };
  return { online: navigator.onLine !== false };
}

export default function ConnectionHealthPanel({
  code,
  role = "teacher",
  open = false,
  onClose,
}) {
  const [info, setInfo] = useState(connectionInfo);
  const [probe, setProbe] = useState(null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    setInfo(connectionInfo());
    try {
      setProbe(await isProbablyOnline(1800));
    } finally {
      setChecking(false);
    }
  }, [checking]);

  useEffect(() => {
    const update = () => setInfo(connectionInfo());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const online = info.online && probe?.ok !== false;

  return (
    <>
      <style>{`
        .teacher-connection-overlay{position:fixed;inset:0;z-index:10001;display:grid;place-items:center;padding:18px;background:rgba(19,34,58,.44);animation:teacherConnectionFade .2s ease-out}
        .teacher-connection-card{width:min(560px,100%);max-height:calc(100svh - 36px);overflow:auto;padding:22px;border:1px solid #d6dee7;border-radius:18px;background:#fffdf8;color:#1a2b4c;animation:teacherConnectionIn .2s ease-out}
        .teacher-connection-header{display:flex;align-items:center;justify-content:space-between;gap:16px}
        .teacher-connection-title{margin:0;font-size:19px;line-height:1.2;font-weight:900;letter-spacing:-.01em}
        .teacher-connection-close{width:38px;height:38px;flex:0 0 38px;border:1px solid #d5dde6;border-radius:10px;background:#fff;color:#1a2b4c;font-size:22px;line-height:1;cursor:pointer;transition:background .16s ease,border-color .16s ease}
        .teacher-connection-close:hover{background:#f3f6fa;border-color:#b9c6d4}
        .teacher-connection-close:active{transform:scale(.96)}
        .teacher-online-status{margin-top:14px;padding:13px 14px;display:flex;align-items:center;gap:12px;border:1px solid #d8e0e8;border-radius:14px;background:#fff}
        .teacher-online-title{font-size:13px;font-weight:900}
        .teacher-online-state{margin-left:auto;display:flex;align-items:center;gap:7px;font-size:11px;font-weight:850;white-space:nowrap}
        .teacher-online-dot{width:8px;height:8px;border-radius:50%;background:#31745a}
        .teacher-online-dot.offline{background:#9b3a35}
        .teacher-connection-action{min-height:38px;padding:0 14px;border:1px solid #cfd8e2;border-radius:10px;background:#fff;color:#1a2b4c;font:inherit;font-size:11px;font-weight:900;cursor:pointer;transition:transform .16s ease,background .16s ease,border-color .16s ease}
        .teacher-connection-action:hover:not(:disabled){background:#f3f6fa;border-color:#b9c6d4}
        .teacher-connection-action:active:not(:disabled){transform:scale(.98)}
        .teacher-connection-action:disabled{cursor:wait;opacity:.65}
        .teacher-connection-action.primary{background:#1a2b4c;border-color:#1a2b4c;color:#fff}
        .teacher-connection-action.primary:hover:not(:disabled){background:#243b66;border-color:#243b66}
        .teacher-connection-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
        @keyframes teacherConnectionFade{from{opacity:0}to{opacity:1}}
        @keyframes teacherConnectionIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @media (prefers-reduced-motion:reduce){.teacher-connection-overlay,.teacher-connection-card{animation:none}}
      `}</style>

      <div
        className="teacher-connection-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-connection-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose?.();
        }}
      >
        <section className="teacher-connection-card">
          <div className="teacher-connection-header">
            <h2 id="teacher-connection-title" className="teacher-connection-title">
              Connection Settings
            </h2>
            <button
              type="button"
              className="teacher-connection-close"
              aria-label="Close connection settings"
              onClick={() => onClose?.()}
            >
              ×
            </button>
          </div>

          <section className="teacher-online-status" aria-label="Internet connection">
            <span className="teacher-online-title">Online relay</span>
            <span className="teacher-online-state" aria-live="polite">
              <span className={`teacher-online-dot ${online ? "" : "offline"}`} />
              {checking ? "Checking" : online ? "Connected" : "Offline"}
            </span>
            <button
              type="button"
              className="teacher-connection-action"
              onClick={refresh}
              disabled={checking}
            >
              {checking ? "Checking…" : "Refresh"}
            </button>
          </section>

          <LocalAssessmentPairing code={code} role={role} onConnected={() => onClose?.()} />

          <div className="teacher-connection-actions">
            <button
              type="button"
              className="teacher-connection-action primary"
              onClick={() => onClose?.()}
            >
              Done
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
