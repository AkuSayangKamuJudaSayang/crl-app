"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import LocalAssessmentPairing from "./LocalAssessmentPairing";
import { disconnectAssessmentPeer, findLinkedAssessmentPeerSession, getTeacherDevicePairingCode, subscribeAssessmentLink } from "../lib/assessmentPeer";

export default function TeacherOfflineSettings({ offline }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useEffect(() => {
    const follow = () => {
      const linked = findLinkedAssessmentPeerSession("teacher");
      if (linked) setCode(linked.code);
    };
    follow();
    return subscribeAssessmentLink(follow);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const background = triggerRef.current?.closest("main");
    const previousInert = background?.inert;
    if (background) background.inert = true;

    // The dashboard has its own scroller. Lock it as well as the document.
    const surfaces = new Set([document.documentElement, document.body]);
    for (let element = triggerRef.current?.parentElement; element; element = element.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(element).overflowY)) surfaces.add(element);
    }
    const overflows = Array.from(surfaces, element => [element, element.style.overflow]);
    overflows.forEach(([element]) => { element.style.overflow = "hidden"; });
    const scrollX = window.scrollX, scrollY = window.scrollY;
    const body = document.body;
    const bodyStyles = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width };
    Object.assign(body.style, { position: "fixed", top: `-${scrollY}px`, left: `-${scrollX}px`, right: "0", width: "100%" });
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      overflows.forEach(([element, overflow]) => { element.style.overflow = overflow; });
      Object.assign(body.style, bodyStyles);
      window.scrollTo(scrollX, scrollY);
      if (background) background.inert = previousInert;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  const handleDialogKey = event => {
    // Enlarged QR codes have their own portal above these settings.
    if (event.target.closest('[role="dialog"]') !== dialogRef.current) return;
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current.querySelectorAll('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])')).filter(element => element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const prepare = () => { setCode(getTeacherDevicePairingCode()); setOpen(true); };
  return <>
    <style>{`
      .crl-roster-offline{box-sizing:border-box;padding:13px 16px;margin:0;min-width:0;border-bottom:1px solid var(--crl-line,#edf1f7)}
      .crl-offline-settings-button{box-sizing:border-box;min-height:44px;max-width:100%;padding:9px 14px;border:1px solid #244d73;border-radius:9px;background:#244d73;color:#fff;font:700 13px/1.4 Arial,sans-serif;cursor:pointer;white-space:normal;text-align:center}
      .crl-offline-settings-button:hover{background:#1c3e5d;border-color:#1c3e5d}
      .crl-offline-settings-button:focus-visible,.crl-offline-settings-close:focus-visible{outline:2px solid #4a6fa5;outline-offset:3px}
      .crl-offline-settings-backdrop{position:fixed;inset:0;z-index:13100;display:flex;align-items:center;justify-content:center;padding:16px;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box;background:rgba(10,20,36,.58);overscroll-behavior:contain}
      .crl-offline-settings-dialog{box-sizing:border-box;width:100%;max-width:540px;max-height:100%;min-height:0;display:flex;flex-direction:column;border:1px solid #d8e0e8;border-radius:14px;background:#fff;color:#1a2b4c;font-family:Arial,Helvetica,sans-serif;overflow:hidden;animation:crlOfflineSettingsOpen .18s ease-out}
      .crl-offline-settings-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #e3e8ee;flex-shrink:0}
      .crl-offline-settings-header h2{margin:0;font-size:20px;line-height:1.3}
      .crl-offline-settings-close{display:grid;place-items:center;flex:0 0 44px;width:44px;height:44px;border:0;border-radius:8px;background:transparent;color:inherit;font:28px/1 Arial,sans-serif;cursor:pointer}
      .crl-offline-settings-body{padding:16px;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
      .crl-offline-settings-note{margin:0 0 14px;font-size:13px;line-height:1.5;color:#526176}
      .crl-offline-settings-body .local-pair-section{margin:0;padding:0;border:0}
      .crl-offline-settings-body>.local-pair-button{margin-top:14px}
      .crl-offline-settings-footer{display:flex;justify-content:flex-end;padding:12px 16px;border-top:1px solid #e3e8ee;flex-shrink:0}
      .crl-offline-settings-footer .crl-offline-settings-button{min-width:88px}
      @keyframes crlOfflineSettingsOpen{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      @media(max-width:760px){.crl-roster-offline>.crl-offline-settings-button{width:100%}}
      @media(prefers-reduced-motion:reduce){.crl-offline-settings-dialog{animation:none}}
    `}</style>
    <section className="crl-roster-offline" aria-label="Offline mode settings">
      <button type="button" className="crl-offline-settings-button" ref={triggerRef} aria-haspopup="dialog" aria-expanded={open} onClick={prepare}>Offline Mode Settings</button>
    </section>
    {open && code && typeof document !== "undefined" ? createPortal(
      <div className="crl-offline-settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }} onKeyDown={handleDialogKey}>
        <section className="crl-offline-settings-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="crl-offline-settings-title">
          <header className="crl-offline-settings-header">
            <h2 id="crl-offline-settings-title">Offline Mode Settings</h2>
            <button type="button" className="crl-offline-settings-close" ref={closeRef} aria-label="Close Offline Mode Settings" onClick={() => setOpen(false)}>×</button>
          </header>
          <div className="crl-offline-settings-body">
            {offline ? <p className="crl-offline-settings-note">Connect the learner device once for this sitting.</p> : null}
            <LocalAssessmentPairing code={code} role="teacher" offline={offline} displayOnly={!offline} deviceOnly />
            {offline ? <button type="button" className="local-pair-button secondary" onClick={() => {
              disconnectAssessmentPeer(code);
              setCode(getTeacherDevicePairingCode());
            }}>Pair a different device</button> : null}
          </div>
          <footer className="crl-offline-settings-footer">
            <button type="button" className="crl-offline-settings-button" onClick={() => setOpen(false)}>Done</button>
          </footer>
        </section>
      </div>, document.body
    ) : null}
  </>;
}
