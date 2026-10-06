"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isProbablyOnline } from "../lib/localFirstStore";
import OfflineModeButton from "./OfflineModeButton";

function browserOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export default function AssessmentConnectionChoice({ period, onSelect, onClose }) {
  const dialog = useRef(null);
  const [checking, setChecking] = useState(false);
  const [online, setOnline] = useState(browserOnline);
  const close = useRef(onClose);
  close.current = onClose;

  /*
   * Only the mode that can actually work is offered. The browser flag answers
   * immediately; the probe confirms it, so a device that reports a connection
   * it cannot reach - a captive portal, a dead router - does not send the
   * teacher into an online assessment that cannot start.
   */
  useEffect(() => {
    let active = true;
    const sync = async () => {
      if (!browserOnline()) {
        if (active) setOnline(false);
        return;
      }
      const reachable = await isProbablyOnline(1800);
      if (active) setOnline(reachable.ok);
    };
    void sync();
    const onSignal = () => void sync();
    window.addEventListener("online", onSignal);
    window.addEventListener("offline", onSignal);
    window.addEventListener("crl-cloud-reachability", onSignal);
    return () => {
      active = false;
      window.removeEventListener("online", onSignal);
      window.removeEventListener("offline", onSignal);
      window.removeEventListener("crl-cloud-reachability", onSignal);
    };
  }, []);

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
    <style>{`.crl-mode-overlay{position:fixed;inset:0;z-index:13000;display:grid;place-items:center;padding:20px;background:rgba(19,34,58,.48);box-sizing:border-box;overflow:auto}.crl-mode-card{box-sizing:border-box;width:min(420px,100%);max-height:calc(100dvh - 40px);overflow:auto;padding:26px;background:#fffdf8;border:1px solid #d6dee7;border-radius:20px;color:#1a2b4c;font-family:Arial,sans-serif}.crl-mode-card h2{font-size:24px;margin:0 0 8px}.crl-mode-card p{font-size:14px;margin:0 0 20px}.crl-mode-action{display:block;box-sizing:border-box;width:100%;min-height:44px;margin:10px 0;padding:10px 16px;border:1px solid #cfd8e2;border-radius:11px;background:white;color:#1a2b4c;font:700 14px/1.4 Arial,sans-serif;cursor:pointer}.crl-mode-action:disabled{border-color:#dfe3e8;background:#f1f2f4;color:#8a919b;cursor:not-allowed}.crl-mode-card .crl-mode-note{margin:0 0 14px;font-size:12.5px;line-height:1.45;color:#5d6b7d}.crl-mode-card details{font-size:12px;margin-top:15px}.crl-mode-card a{display:block;margin:10px 0;color:#1a2b4c}`}</style>
    <section className="crl-mode-card" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="crl-mode-title">
      <h2 id="crl-mode-title">{period} Assessment</h2>
      <p>Choose your connection.</p>
      <button type="button" className="crl-mode-action" disabled={!online || checking} onClick={() => onSelect("online")}>Online Mode</button>
      <OfflineModeButton disabled={online || checking} onCheckingChange={setChecking} onReady={() => onSelect("offline")} />
      <p className="crl-mode-note">
        {online
          ? "This device has an internet connection, so offline mode is unavailable."
          : "No internet connection was found, so only offline mode is available."}
      </p>
      <button type="button" className="crl-mode-action" onClick={onClose}>Cancel</button>
      <details><summary>One-time offline setup</summary><a href="/offline-hub/CRL-Offline-Setup.zip" download>Download setup · Windows / Mac / Linux</a><a href="https://github.com/AkuSayangKamuJudaSayang/crl-app/blob/main/docs/offline-pairing-hub.md" target="_blank" rel="noreferrer">Phone and tablet setup</a></details>
    </section>
  </div>, document.body);
}
