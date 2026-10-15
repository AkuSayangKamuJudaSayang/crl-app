"use client";

import { useEffect, useState } from "react";

export default function OfflineSyncPrompt() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const receive = event => setStatus(event.detail);
    setStatus(window.__crlOfflineSyncStatus || null);
    window.addEventListener("crl-offline-sync-status", receive);
    return () => window.removeEventListener("crl-offline-sync-status", receive);
  }, []);

  useEffect(() => {
    if (status?.phase !== "success") return undefined;
    const timer = window.setTimeout(() => setStatus(null), 6000);
    return () => window.clearTimeout(timer);
  }, [status]);

  if (!status || status.phase === "idle") return null;
  const syncing = status.phase === "syncing";
  const success = status.phase === "success";
  const completed = Number(status.completed || 0);
  const total = Number(status.total || 0);
  const heading = syncing ? "Syncing changes" : success ? "Changes synchronized" : "Changes saved on this device";

  return (
    <aside className="crl-sync-prompt" aria-label="Offline synchronization">
      <div className="crl-sync-heading" role="status" aria-live="polite" aria-atomic="true">
        <span className={`crl-sync-icon${syncing ? " crl-sync-loading" : ""}`} aria-hidden="true">
          {syncing ? "" : success ? "✓" : "↑"}
        </span>
        <strong>{heading}</strong>
        {total > 0 ? <span className="crl-sync-count">{completed}/{total}</span> : null}
      </div>
      {status.current ? (
        <div className="crl-sync-current" aria-live={syncing ? "polite" : "off"} aria-atomic="true">
          <b>{status.current.title}</b>
          {status.current.details?.length ? (
            <ul>{status.current.details.map((detail, index) => <li key={`${index}:${detail}`}>{detail}</li>)}</ul>
          ) : null}
        </div>
      ) : null}
      {total > 0 ? (
        <div className="crl-sync-track" role="progressbar" aria-label="Changes acknowledged by the server"
          aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}>
          <div style={{ width: `${Math.min(100, completed / total * 100)}%` }} />
        </div>
      ) : null}
      <p>{status.message}</p>
      {!syncing && !success ? (
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("crl-offline-sync-retry"))}>
          Retry sync
        </button>
      ) : null}
      <style jsx>{`
        .crl-sync-prompt{position:fixed;right:max(20px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));z-index:30000;box-sizing:border-box;width:min(370px,calc(100vw - 32px));padding:18px;border:1px solid #378965;border-radius:16px;background:#edf9f1;color:#125334;box-shadow:0 8px 32px #062c2029;font-family:var(--font-outfit),system-ui,sans-serif;font-size:14px;line-height:1.5}
        .crl-sync-heading{display:flex;align-items:center;gap:10px}
        .crl-sync-heading strong{font-size:15px;font-weight:650}
        .crl-sync-count{margin-left:auto;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
        .crl-sync-icon{display:grid;place-items:center;width:18px;height:18px;flex-shrink:0;font-size:18px;font-weight:700}
        .crl-sync-loading{box-sizing:border-box;border:2px solid #a4d5b8;border-top-color:#12613c;border-radius:50%;animation:crl-sync-spin .8s linear infinite}
        .crl-sync-current{margin-top:12px;max-height:min(190px,30vh);overflow:auto;overflow-wrap:anywhere}
        .crl-sync-current b{font-weight:600}
        .crl-sync-current ul{list-style:none;margin:4px 0 0;padding:0;font-size:13px}
        .crl-sync-current li+li{margin-top:3px}
        .crl-sync-track{height:4px;overflow:hidden;border-radius:4px;background:#c5e3d0;margin-top:13px}
        .crl-sync-track div{height:100%;background:#237a4e;transition:width .2s ease}
        .crl-sync-prompt p{margin:10px 0 0;font-size:12px;color:#286446}
        .crl-sync-prompt button{margin-top:12px;min-height:36px;padding:6px 12px;border:1px solid #378965;border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer}
        .crl-sync-prompt button:focus-visible{outline:2px solid currentColor;outline-offset:3px}
        :global(html[data-crl-theme="dark"]) .crl-sync-prompt{background:#103425;color:#d6f8e3;border-color:#458b66;box-shadow:0 8px 32px #0005}
        :global(html[data-crl-theme="dark"]) .crl-sync-prompt p{color:#b2dbc3}
        :global(html[data-crl-theme="dark"]) .crl-sync-loading{border-color:#38664b;border-top-color:#a7e8bf}
        :global(html[data-crl-theme="dark"]) .crl-sync-track{background:#29543d}
        :global(html[data-crl-theme="dark"]) .crl-sync-track div{background:#82d9a0}
        @keyframes crl-sync-spin{to{transform:rotate(360deg)}}
        @media(prefers-reduced-motion:reduce){.crl-sync-loading{animation:none}.crl-sync-track div{transition:none}}
        @media(max-width:480px){.crl-sync-prompt{right:16px;bottom:max(16px,env(safe-area-inset-bottom));padding:15px}}
      `}</style>
    </aside>
  );
}
