"use client";
import { useEffect, useRef } from "react";

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
  return <div className="recovery-shade"><section ref={panel} role="dialog" aria-modal="true" aria-labelledby="assessment-recovery-title" aria-busy={busy} tabIndex={-1} className="recovery-panel">
    <h2 id="assessment-recovery-title">{title}</h2><div className="recovery-copy">{children}</div>
    {actions ? <div className="recovery-actions">{actions}</div> : null}
    <style jsx>{`
      .recovery-shade { position:fixed; inset:0; z-index:12000; background:rgba(8,20,32,.42); display:flex; align-items:center; justify-content:center; padding:20px; }
      .recovery-panel { width:100%; max-width:460px; max-height:calc(100dvh - 40px); overflow:auto; background:var(--surface,#fff); color:var(--text,#26364a); border-radius:20px; padding:28px; box-shadow:0 18px 70px #0003; outline:none; }
      h2 { margin:0 0 12px; font-size:21px; line-height:1.35; }
      .recovery-copy { font-size:15px; line-height:1.6; } .recovery-copy :global(p) { margin:0 0 12px; }
      .recovery-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:10px; margin-top:22px; }
      .recovery-actions :global(button) { min-height:44px; border:0; border-radius:11px; padding:10px 17px; cursor:pointer; font:inherit; background:#eaf0ed; color:#243c32; }
      .recovery-actions :global(button[data-primary]) { background:#237a50; color:white; } .recovery-actions :global(button:disabled) { opacity:.6; cursor:wait; }
      :global(html[data-crl-theme="dark"]) .recovery-panel, :global(body.dark) .recovery-panel { background:#18232e; color:#edf3f7; }
      @media(max-width:480px) { .recovery-panel { padding:23px; } .recovery-actions :global(button) { flex:1; } }
    `}</style>
  </section></div>;
}
