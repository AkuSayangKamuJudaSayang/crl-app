"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import OfflineModeButton from "./OfflineModeButton";

export default function AssessmentConnectionChoice({ period, onSelect, onClose }) {
  const dialog = useRef(null);
  const [checking, setChecking] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector("button")?.focus();
    const keys = event => {
      if (event.key === "Escape") { close.current?.(); return; }
      if (event.key !== "Tab") return;
      const controls = [...(dialog.current?.querySelectorAll("button:not(:disabled), a[href], summary") || [])].filter(control => control.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    };
    document.addEventListener("keydown", keys);
    return () => { document.removeEventListener("keydown", keys); previous?.focus?.(); };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(<div className="crl-mode-overlay">
    <style>{`.crl-mode-overlay{position:fixed;inset:0;z-index:13000;display:grid;place-items:center;padding:20px;background:rgba(19,34,58,.48);box-sizing:border-box;overflow:auto}.crl-mode-card{box-sizing:border-box;width:min(420px,100%);max-height:calc(100dvh - 40px);overflow:auto;padding:26px;background:#fffdf8;border:1px solid #d6dee7;border-radius:20px;color:#1a2b4c;font-family:Arial,sans-serif}.crl-mode-card h2{font-size:24px;margin:0 0 8px}.crl-mode-card p{font-size:14px;margin:0 0 20px}.crl-mode-action{display:block;box-sizing:border-box;width:100%;min-height:44px;margin:10px 0;padding:10px 16px;border:1px solid #cfd8e2;border-radius:11px;background:white;color:#1a2b4c;font:700 14px/1.4 Arial,sans-serif;cursor:pointer}.crl-mode-card details{font-size:12px;margin-top:15px}.crl-mode-card a{display:block;margin:10px 0;color:#1a2b4c}`}</style>
    <section className="crl-mode-card" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="crl-mode-title">
      <h2 id="crl-mode-title">{period} Assessment</h2>
      <p>Choose your connection.</p>
      <button type="button" className="crl-mode-action" disabled={checking} onClick={() => onSelect("online")}>Online Mode</button>
      <OfflineModeButton onCheckingChange={setChecking} onReady={() => onSelect("offline")} />
      <button type="button" className="crl-mode-action" onClick={onClose}>Cancel</button>
      <details><summary>One-time offline setup</summary><a href="/offline-hub/CRL-Offline-Setup.zip" download>Download setup · Windows / Mac / Linux</a><a href="https://github.com/AkuSayangKamuJudaSayang/crl-app/blob/main/docs/offline-pairing-hub.md" target="_blank" rel="noreferrer">Phone and tablet setup</a></details>
    </section>
  </div>, document.body);
}
