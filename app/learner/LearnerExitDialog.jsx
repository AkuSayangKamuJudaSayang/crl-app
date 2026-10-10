"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function LearnerExitDialog({ onCancel, onExit }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  useEffect(() => {
    const focus = document.activeElement;
    const background = Array.from(document.body.children)
      .filter(element => !element.contains(dialogRef.current))
      .map(element => [element, element.inert]);
    const surfaces = [document.documentElement, document.body].map(element => [element, element.style.overflow]);
    background.forEach(([element]) => { element.inert = true; });
    surfaces.forEach(([element]) => { element.style.overflow = "hidden"; });
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      background.forEach(([element, inert]) => { element.inert = inert; });
      surfaces.forEach(([element, overflow]) => { element.style.overflow = overflow; });
      if (focus?.isConnected) focus.focus({ preventScroll: true });
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="learner-exit-backdrop" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="learner-exit-title" aria-describedby="learner-exit-note" onMouseDown={event => {
      if (event.target === event.currentTarget) onCancel();
    }} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
      if (event.key === "Tab") {
        const buttons = dialogRef.current.querySelectorAll("button");
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <style>{`
        .learner-exit-backdrop{position:fixed;inset:0;z-index:14000;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:rgba(10,20,36,.55);overscroll-behavior:contain;font-family:Arial,Helvetica,sans-serif}
        .learner-exit-card{box-sizing:border-box;width:min(100%,360px);max-height:100%;overflow-y:auto;padding:24px;border:1px solid #d8e0e8;border-radius:14px;background:#fff;color:#1a2b4c}
        .learner-exit-card h2{margin:0;font-size:22px;line-height:1.3;font-weight:700}
        .learner-exit-card p{margin:10px 0 22px;color:#526176;font-size:14px;line-height:1.5}
        .learner-exit-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .learner-exit-actions button{min-height:44px;padding:10px 16px;border:1px solid #cfd8e2;border-radius:8px;background:#fff;color:#1a2b4c;font:700 14px/1.4 Arial,sans-serif;cursor:pointer}
        .learner-exit-actions .learner-exit-confirm{border-color:#9b2e22;background:#9b2e22;color:#fff}
        .learner-exit-actions button:focus-visible{outline:2px solid #4a6fa5;outline-offset:3px}
      `}</style>
      <section className="learner-exit-card">
        <h2 id="learner-exit-title">Exit app?</h2>
        <p id="learner-exit-note">Saved data stays on this device.</p>
        <div className="learner-exit-actions">
          <button type="button" ref={cancelRef} onClick={onCancel}>Cancel</button>
          <button type="button" className="learner-exit-confirm" onClick={onExit}>Exit</button>
        </div>
      </section>
    </div>, document.body
  );
}
