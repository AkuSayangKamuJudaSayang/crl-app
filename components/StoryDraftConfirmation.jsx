"use client";

import { useEffect, useRef } from "react";

export default function StoryDraftConfirmation({ importing, story, onCancel, onDiscard, onSave }) {
  const dialog = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector("button")?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus?.({ preventScroll: true }); };
  }, []);

  return (
    <div className="story-draft-backdrop" onKeyDown={event => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); onCancel();
      } else if (event.key === "Tab") {
        const buttons = Array.from(dialog.current?.querySelectorAll("button") || []);
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
      }
    }}>
      <section ref={dialog} className="story-draft-dialog" role="alertdialog" aria-modal="true"
        aria-labelledby="story-draft-title" aria-describedby="story-draft-description">
        <h2 id="story-draft-title">Save unsaved changes?</h2>
        <p id="story-draft-description">{importing
          ? "This imported passage has not been saved. Continue to the story editor to add its comprehension questions and possible answers."
          : `Your ${story ? "story" : "item"} has unsaved changes. Save them to your assessment draft before closing?`}</p>
        <div className="story-draft-actions">
          <button type="button" onClick={onCancel}>Keep editing</button>
          <button type="button" onClick={onDiscard}>Discard</button>
          <button type="button" className="story-draft-save" onClick={onSave}>{importing ? "Continue" : story ? "Save Story" : "Save Changes"}</button>
        </div>
      </section>
      <style jsx>{`
        .story-draft-backdrop{position:fixed;inset:0;z-index:102;display:flex;align-items:center;justify-content:center;padding:16px;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box;background:#12203988;overscroll-behavior:contain}
        .story-draft-dialog{box-sizing:border-box;width:min(100%,440px);max-height:100%;overflow:auto;padding:24px;border:1px solid var(--crl-line,#dce3ec);border-radius:14px;background:var(--crl-surface,#fff);color:var(--crl-text,#1a2b4c);font-family:Arial,Helvetica,sans-serif;overflow-wrap:anywhere}
        h2{margin:0;font-size:20px;line-height:1.3}p{margin:14px 0 22px;font-size:14px;line-height:1.6;color:var(--crl-muted,#526076)}
        .story-draft-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
        button{min-height:44px;padding:9px 13px;border:1px solid var(--crl-line-strong,#c7d2e0);border-radius:8px;background:var(--crl-surface,#fff);color:inherit;font:700 13px/1.4 Arial,sans-serif;cursor:pointer}
        .story-draft-save{background:#2f6f52;border-color:#2f6f52;color:#fff}.story-draft-save:hover{background:#255a42}
        button:focus-visible{outline:2px solid var(--crl-text,#1a2b4c);outline-offset:3px}
        @media(max-width:480px){.story-draft-dialog{padding:20px}.story-draft-actions button{flex:1 1 110px}}
      `}</style>
    </div>
  );
}
