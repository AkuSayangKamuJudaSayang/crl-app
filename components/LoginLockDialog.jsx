"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./LoginLockDialog.module.css";

export default function LoginLockDialog({ lock, onClose }) {
  const panel = useRef(null);
  const [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const focus = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; panel.current?.focus();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(timer); document.body.style.overflow = overflow; focus?.focus?.(); };
  }, []);
  const remaining = Math.max(0, Math.ceil((Date.parse(lock.locked_until) - now) / 1000)) || 0;
  async function send() {
    if (busy || sent) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth?action=request_account_unlock", { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unlock_token: lock.unlock_token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send the request.");
      setSent(true);
    } catch (e) { setError(e.message || "Connect to the internet and try again."); }
    finally { setBusy(false); }
  }
  return createPortal(<div className={styles.shade} onKeyDown={e => {
    if (e.key === "Escape" && !busy) { e.preventDefault(); onClose(); }
    if (e.key !== "Tab") return;
    const buttons = Array.from(panel.current.querySelectorAll("button:not([disabled])"));
    if (!buttons.length) { e.preventDefault(); panel.current.focus(); }
    else if (e.shiftKey && (document.activeElement === buttons[0] || document.activeElement === panel.current)) { e.preventDefault(); buttons.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === buttons.at(-1)) { e.preventDefault(); buttons[0].focus(); }
  }}><section className={styles.panel} ref={panel} role="dialog" aria-modal="true" aria-labelledby="login-lock-title" aria-busy={busy} tabIndex={-1}>
    <h2 id="login-lock-title">Account temporarily locked</h2>
    <p>Seven incorrect passwords have temporarily locked sign-in to this account.</p>
    <p>{remaining ? `Try again in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}.` : "Close this notice and try signing in again to check the current lock."}</p>
    {lock.can_request_unlock ? <p>You can ask an administrator to review and unlock your teacher account.</p> : lock.offline ? <p>Connect to the internet and retry sign-in to check the server lock or request administrator assistance.</p> : <p>This sign-in page does not offer early unlock requests. Try again after the lock expires.</p>}
    {sent && <p className={styles.success} role="status">Request sent to the administrator. You can also wait for the lock to expire.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}><button type="button" disabled={busy} onClick={onClose}>Close</button>{lock.can_request_unlock && lock.unlock_token && <button type="button" className={styles.primary} disabled={busy || sent || !remaining} onClick={send}>{busy ? "Sending…" : sent ? "Request sent" : "Request unlock"}</button>}</div>
  </section></div>, document.body);
}
