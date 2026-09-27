"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isProbablyOnline } from "../lib/localFirstStore";
import LocalAssessmentPairing from "./LocalAssessmentPairing";

function connectionInfo() {
  if (typeof navigator === "undefined") return { online: true };
  const link = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    online: navigator.onLine !== false,
    type: link?.type || "unknown",
    effectiveType: link?.effectiveType || "unknown",
    browserRtt: Number.isFinite(link?.rtt) ? Number(link.rtt) : null,
  };
}

export default function ConnectionHealthPanel({ code, role = "teacher" }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(connectionInfo);
  const [probe, setProbe] = useState(null);
  const [checking, setChecking] = useState(false);

  const testConnection = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    setInfo(connectionInfo());
    try { setProbe(await isProbablyOnline(1800)); }
    finally { setChecking(false); }
  }, [checking]);

  useEffect(() => {
    const update = () => setInfo(connectionInfo());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const link = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    link?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      link?.removeEventListener?.("change", update);
    };
  }, []);

  useEffect(() => {
    if (open) void testConnection();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const quality = useMemo(() => {
    if (!info.online) return "Offline";
    if (probe && probe.ok === false) return "Unavailable";
    const latency = probe?.latencyMs ?? info.browserRtt;
    if (!Number.isFinite(latency)) return "Connected";
    if (latency <= 100) return "Good";
    if (latency <= 260) return "Fair";
    return "Slow";
  }, [info, probe]);

  return (
    <>
      <style>{`
        .teacher-connection-trigger{position:fixed;right:16px;bottom:16px;z-index:10000;min-height:46px;padding:0 16px;border:1px solid #cbd5df;border-radius:12px;background:#fffdf8;color:#1a2b4c;font-size:11px;font-weight:900;cursor:pointer;transition:transform .16s ease,background .16s ease,border-color .16s ease}.teacher-connection-trigger:hover{background:#f8f4eb;border-color:#aebbc9}.teacher-connection-trigger:active{transform:scale(.98)}.teacher-connection-overlay{position:fixed;inset:0;z-index:10001;display:grid;place-items:center;padding:18px;background:rgba(19,34,58,.44);animation:teacherConnectionFade .2s ease-out}.teacher-connection-card{width:min(560px,100%);max-height:calc(100svh - 36px);overflow:auto;padding:22px;border:1px solid #d6dee7;border-radius:18px;background:#fffdf8;color:#1a2b4c;animation:teacherConnectionIn .2s ease-out}.teacher-connection-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.teacher-connection-title{margin:0;font-size:20px;line-height:1.2;font-weight:950}.teacher-connection-copy{margin:5px 0 0;color:#66758a;font-size:11px;line-height:1.55}.teacher-connection-close{width:40px;height:40px;border:1px solid #d5dde6;border-radius:10px;background:#fff;color:#1a2b4c;font-size:23px;cursor:pointer}.teacher-online-status{margin-top:16px;padding:14px;border:1px solid #d8e0e8;border-radius:14px;background:#fff}.teacher-online-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.teacher-online-title{font-size:13px;font-weight:900}.teacher-online-state{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:850}.teacher-online-dot{width:8px;height:8px;border-radius:50%;background:#31745a}.teacher-online-dot.offline{background:#9b3a35}.teacher-online-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:11px}.teacher-online-cell{padding:10px;border:1px solid #e3e8ee;border-radius:10px;background:#fffdf8}.teacher-online-label{color:#738094;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}.teacher-online-value{margin-top:4px;font-size:11px;font-weight:900}.teacher-connection-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.teacher-connection-action{min-height:42px;padding:0 15px;border:1px solid #ccd6e0;border-radius:10px;background:#fff;color:#1a2b4c;font-size:11px;font-weight:900;cursor:pointer}.teacher-connection-action.primary{border-color:#1a2b4c;background:#1a2b4c;color:#fff}@keyframes teacherConnectionFade{from{opacity:0}to{opacity:1}}@keyframes teacherConnectionIn{from{opacity:0;transform:scale(.985) translateY(5px)}to{opacity:1;transform:none}}@media(max-width:560px){.teacher-connection-trigger{right:12px;bottom:12px;min-height:44px}.teacher-connection-overlay{align-items:end;padding:10px}.teacher-connection-card{max-height:calc(100svh - 20px);padding:18px 14px;border-radius:17px}.teacher-online-grid{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){.teacher-connection-trigger{transition:none}.teacher-connection-overlay,.teacher-connection-card{animation:none}}
      `}</style>
      <button type="button" className="teacher-connection-trigger" onClick={() => setOpen(true)}>Connection</button>
      {open && (
        <div className="teacher-connection-overlay" role="dialog" aria-modal="true" aria-labelledby="teacher-connection-title" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="teacher-connection-card">
            <div className="teacher-connection-header">
              <div>
                <h2 id="teacher-connection-title" className="teacher-connection-title">Connection Settings</h2>
                <p className="teacher-connection-copy">Monitor the online relay or pair directly through hotspot and USB tethering.</p>
              </div>
              <button type="button" className="teacher-connection-close" aria-label="Close connection settings" onClick={() => setOpen(false)}>×</button>
            </div>

            <section className="teacher-online-status" aria-label="Internet connection">
              <div className="teacher-online-head">
                <div className="teacher-online-title">Online relay</div>
                <div className="teacher-online-state"><span className={`teacher-online-dot ${quality === "Offline" || quality === "Unavailable" ? "offline" : ""}`} />{checking ? "Checking" : quality}</div>
              </div>
              <div className="teacher-online-grid">
                <div className="teacher-online-cell"><div className="teacher-online-label">Network</div><div className="teacher-online-value">{info.type === "unknown" ? (info.online ? "Connected" : "Offline") : info.type}</div></div>
                <div className="teacher-online-cell"><div className="teacher-online-label">Server latency</div><div className="teacher-online-value">{Number.isFinite(probe?.latencyMs) ? `${probe.latencyMs} ms` : "—"}</div></div>
                <div className="teacher-online-cell"><div className="teacher-online-label">Link</div><div className="teacher-online-value">{info.effectiveType || "Unknown"}</div></div>
              </div>
            </section>

            <LocalAssessmentPairing code={code} role={role} />

            <div className="teacher-connection-actions">
              <button type="button" className="teacher-connection-action" onClick={testConnection} disabled={checking}>{checking ? "Checking…" : "Test Online"}</button>
              <button type="button" className="teacher-connection-action primary" onClick={() => setOpen(false)}>Done</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
