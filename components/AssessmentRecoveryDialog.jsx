"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./AssessmentRecoveryDialog.module.css";

export default function AssessmentRecoveryDialog({ title, children, actions, busy = false }) {
  const panel = useRef(null);
  useEffect(() => {
    try { document.documentElement.setAttribute("data-crl-theme", localStorage.getItem("crla_theme") === "dark" ? "dark" : "light"); } catch {}
    const previous = document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = panel.current;
    node?.focus();
    const trap = event => {
      if (event.key !== "Tab") return;
      const buttons = Array.from(node?.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]') || []);
      if (!buttons.length) { event.preventDefault(); node?.focus(); return; }
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    node?.addEventListener("keydown", trap);
    return () => { document.body.style.overflow = bodyOverflow; node?.removeEventListener("keydown", trap); previous?.focus?.(); };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(<div className={styles.shade}><section ref={panel} role="dialog" aria-modal="true" aria-labelledby="assessment-recovery-title" aria-busy={busy} tabIndex={-1} className={styles.panel}>
    <h2 id="assessment-recovery-title">{title}</h2><div className={styles.copy}>{children}</div>
    {actions ? <div className={styles.actions}>{actions}</div> : null}
  </section></div>, document.body);
}
