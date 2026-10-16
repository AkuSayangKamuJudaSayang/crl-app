"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getOfflineTeacherSession, offlineList } from "../../lib/teacherOfflineDb";
import { getMutations } from "../../lib/assessmentOutbox";

export default function OfflineSyncRecovery() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const dialog = useRef(null);
  const load = useCallback(async () => {
    const session = await getOfflineTeacherSession();
    if (session?.signedOut || !session?.user?.id || Number(session.expiresAt) <= Date.now()) throw new Error("Sign in to the teacher account that saved these items.");
    const rows = await offlineList(`sync_recovery:${Number(session.user.id)}:`);
    setItems(rows.map(row => row.value).sort((a, b) => b.savedAt - a.savedAt));
  }, []);
  useEffect(() => {
    const refresh = () => { void load().catch(error => { setItems([]); setError(error.message); }); };
    const show = () => { setError(""); setOpen(true); refresh(); };
    window.addEventListener("crl-offline-recovery-open", show);
    window.addEventListener("crl-offline-recovery-changed", refresh);
    return () => { window.removeEventListener("crl-offline-recovery-open", show); window.removeEventListener("crl-offline-recovery-changed", refresh); };
  }, [load]);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    dialog.current?.querySelector("button")?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus?.({ preventScroll: true }); };
  }, [open]);
  const download = async item => {
    setError("");
    try {
      const session = await getOfflineTeacherSession();
      if (session?.signedOut || Number(session?.user?.id) !== Number(item.userId) || Number(session.expiresAt) <= Date.now()) throw new Error("Sign in to the teacher account that saved these items.");
      const codes = new Set(item.entries.map(entry => String(entry.body?.code || entry.body?.offline_code || "").toUpperCase()));
      const secondary = new Map((item.secondaryEntries || []).map(entry => [entry.id, entry]));
      for (const entry of await getMutations()) if (codes.has(String(entry.payload?.code || "").toUpperCase())) secondary.set(entry.id, entry);
      const blob = new Blob([JSON.stringify({ ...item, secondaryEntries: [...secondary.values()] }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = `CRL-offline-recovery-${item.id}.json`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError(error.message || "The backup could not be prepared. Your saved items are unchanged."); }
  };
  const retry = async item => {
    setError(""); setBusy(item.id);
    try {
      await new Promise((resolve, reject) => window.dispatchEvent(new CustomEvent("crl-offline-recovery-retry", { detail: { id: item.id, resolve, reject } })));
      await load();
    } catch (error) { setError(error.message || "These items could not be retried. They remain saved on this device."); }
    finally { setBusy(""); }
  };
  if (!open) return null;
  return createPortal(<div className="crl-recovery-backdrop" onKeyDown={event => {
    if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    if (event.key === "Tab") {
      const controls = Array.from(dialog.current?.querySelectorAll("button:not([disabled])") || []);
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    }
  }}><section ref={dialog} className="crl-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="crl-recovery-title">
    <header><h2 id="crl-recovery-title">Saved offline items</h2><button type="button" aria-label="Close saved offline items" onClick={() => setOpen(false)} disabled={Boolean(busy)}>×</button></header>
    <div className="crl-recovery-body"><p>Work for a learner who is no longer in this teacher account is kept here instead of blocking synchronization. Download a backup, or ask the administrator to restore the learner before retrying.</p>
      {error ? <p className="crl-recovery-error" role="alert">{error}</p> : null}
      {!items.length ? <p>No offline items are waiting for review on this device.</p> : items.map(item => <article key={item.id}>
        <h3>{[item.learner?.first_name || item.learner?.firstName, item.learner?.last_name || item.learner?.lastName].filter(Boolean).join(" ") || "Unavailable learner"}</h3>
        <small>{item.entries.length} saved changes · {new Date(item.savedAt).toLocaleString()}</small><p>{item.reason}</p>
        <div className="crl-recovery-actions"><button type="button" onClick={() => void download(item)} disabled={Boolean(busy)}>Download backup</button><button type="button" onClick={() => void retry(item)} disabled={Boolean(busy)}>{busy === item.id ? "Checking learner…" : "Retry saved items"}</button></div>
      </article>)}
    </div>
    <style jsx>{`
      .crl-recovery-backdrop{position:fixed;inset:0;z-index:31000;display:flex;align-items:center;justify-content:center;padding:16px;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box;background:#0a1424aa}
      .crl-recovery-dialog{box-sizing:border-box;display:flex;flex-direction:column;min-height:0;max-height:100%;width:min(100%,620px);overflow:hidden;border:1px solid var(--crl-line,#d8e0e8);border-radius:14px;background:var(--crl-surface,#fff);color:var(--crl-text,#1a2b4c);font-family:Arial,Helvetica,sans-serif;overflow-wrap:anywhere}
      header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;flex-shrink:0}h2{margin:0;font-size:20px;line-height:1.3}header button{font-size:24px;flex-shrink:0}
      .crl-recovery-body{min-height:0;overflow:auto;padding:0 20px 20px;overscroll-behavior:contain}p{font-size:14px;line-height:1.6;color:var(--crl-muted,#526076)}article{border:1px solid var(--crl-line,#d8e0e8);border-radius:10px;padding:16px;margin-top:16px}h3{font-size:16px;margin:0 0 8px}small{color:var(--crl-muted,#526076);font-size:12px}.crl-recovery-actions{display:flex;flex-wrap:wrap;gap:8px}
      button{min-height:44px;padding:8px 12px;border:1px solid var(--crl-line-strong,#aab8cb);border-radius:8px;background:var(--crl-surface,#fff);color:inherit;font:700 13px/1.4 Arial,sans-serif;cursor:pointer}button:focus-visible{outline:2px solid currentColor;outline-offset:2px}button:disabled{opacity:.6;cursor:wait}.crl-recovery-error{color:var(--crl-red,#92362e)}@media(max-width:480px){.crl-recovery-actions button{flex:1 1 140px}}
    `}</style>
  </section></div>, document.body);
}
