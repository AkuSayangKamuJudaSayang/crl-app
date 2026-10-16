"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export default function PairingSettingsDialog({ title, description, onClose, children }) {
  const id = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousDialog = previousFocus?.closest('[role="dialog"]');
    const background = Array.from(document.body.children)
      .filter(element => !element.contains(dialogRef.current))
      .map(element => [element, element.inert]);
    const surfaces = [document.documentElement, document.body].map(element => [element, element.style.overflow]);
    background.forEach(([element]) => { element.inert = true; });
    surfaces.forEach(([element]) => { element.style.overflow = "hidden"; });
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      background.forEach(([element, inert]) => { element.inert = inert; });
      surfaces.forEach(([element, overflow]) => { element.style.overflow = overflow; });
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      else previousDialog?.querySelector("button")?.focus({ preventScroll: true });
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="crl-pair-dialog-backdrop" onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current.querySelectorAll('button:not([disabled]), textarea, [href], [tabindex="0"]'))
        .filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <style>{`
        .crl-pair-dialog-backdrop{position:fixed;inset:0;z-index:14000;display:grid;place-items:center;box-sizing:border-box;padding:16px;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:rgba(10,20,36,.6);overscroll-behavior:contain;font-family:Arial,Helvetica,sans-serif}
        .crl-pair-dialog{box-sizing:border-box;width:min(100%,520px);max-height:100%;overflow-y:auto;overscroll-behavior:contain;padding:20px;border:1px solid var(--crl-line,#d8e0e8);border-radius:14px;background:var(--crl-surface,#fff);color:var(--crl-text,#1a2b4c)}
        .crl-pair-dialog-header{display:flex;align-items:center;justify-content:space-between;gap:12px}.crl-pair-dialog h2{margin:0;font-size:20px;line-height:1.35}.crl-pair-dialog p{font-size:14px;line-height:1.5;color:var(--crl-muted,#526176)}
        .crl-pair-dialog-close{flex:0 0 44px;width:44px;height:44px;border:0;border-radius:8px;background:transparent;color:inherit;font:26px/1 Arial,sans-serif;cursor:pointer}.crl-pair-dialog-close:focus-visible{outline:2px solid #4a6fa5;outline-offset:2px}
        .crl-pair-dialog .local-pair-qr{width:min(100%,280px)}.crl-pair-dialog .local-pair-qr.is-expanded{width:100%}.crl-pair-dialog .local-pair-actions{display:flex;flex-wrap:wrap;gap:10px}.crl-pair-dialog .local-pair-actions button{flex:1 1 120px}
      `}</style>
      <section className="crl-pair-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} ref={dialogRef}>
        <header className="crl-pair-dialog-header">
          <h2 id={`${id}-title`}>{title}</h2>
          <button type="button" ref={closeRef} className="crl-pair-dialog-close" aria-label={`Close ${title}`} onClick={onClose}>×</button>
        </header>
        <p id={`${id}-description`}>{description}</p>
        {children}
      </section>
    </div>, document.body
  );
}
