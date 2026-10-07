"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function AssessmentStartConfirmation({ period, learnerName, onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    cancelRef.current?.focus();
    const handleKey = event => {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(dialogRef.current?.querySelectorAll("button") || []);
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previousFocus?.focus?.(); };
  }, [onCancel]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="modalOverlay" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="modal assessmentStartConfirmation" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="assessment-start-title" aria-describedby="assessment-start-description">
        <div className="modalHeader"><h2 id="assessment-start-title">Start {period} assessment?</h2></div>
        <div className="modalBody"><p id="assessment-start-description">Start the assessment for <strong>{learnerName}</strong>?</p></div>
        <div className="modalFooter">
          <button type="button" className="secondaryButton" ref={cancelRef} onClick={onCancel}>Cancel</button>
          <button type="button" className="toolbarButton" onClick={onConfirm}>Start Assessment</button>
        </div>
      </div>
    </div>, document.body
  );
}
