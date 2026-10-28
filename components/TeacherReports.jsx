"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./TeacherReports.module.css";

function ReportIcon({ type }) {
  return <span className={styles.icon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{type === "bug" ? <><rect x="7" y="7" width="10" height="13" rx="5" /><path d="M9 7V5a3 3 0 0 1 6 0v2M12 8v11M4 10h3m10 0h3M4 15h3m10 0h3M5 21l3-3m8 0 3 3" /></> : <><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M7 9h10M7 13h6" /></>}</svg></span>;
}

function ReportForm({ type, teacher, online, sendingType, setSendingType, pending, hidden }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef(null);
  const sending = sendingType === type;
  const disabled = Boolean(sendingType);
  const isBug = type === "bug";
  const title = isBug ? "Bug report" : "Feedback";
  const messageId = `teacher-report-${type}-message`;

  useEffect(() => {
    return () => request.current?.abort();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (pending.current || !message.trim()) return;
    if (!online) { setError("Connect to the internet to send.");return; }
    pending.current = true;
    setSendingType(type);setError("");setNotice("");
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/public/report", {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ type, message: message.trim(), name: teacher?.full_name || "Teacher", pageUrl: `${window.location.origin}/teacher` }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send. Try again.");
      setMessage("");setNotice(type === "bug" ? "Bug report sent." : "Feedback sent.");
    } catch (error) {
      setError(error.name === "AbortError" ? "Unable to send. Try again." : error.message || "Unable to send. Try again.");
    } finally {
      window.clearTimeout(timeout);pending.current = false;request.current = null;setSendingType("");
    }
  }

  return <section className={styles.card} hidden={hidden} aria-labelledby={`teacher-report-${type}-title`}>
    <header className={styles.header}>
      <ReportIcon type={type} />
      <div><h2 id={`teacher-report-${type}-title`}>{title}</h2><p>{isBug ? "Something not working? Let us know what happened." : "Share an idea or tell us what could work better."}</p></div>
    </header>
    <form onSubmit={submit} aria-label={title}>
      <label htmlFor={messageId}>{isBug ? "Describe the bug" : "Your feedback"}</label>
      <textarea id={messageId} aria-describedby={`${messageId}-count`} value={message} onChange={e => { setMessage(e.target.value);setNotice(""); }} placeholder={isBug ? "What were you doing, and what went wrong?" : "What would make your experience better?"} maxLength={4000} rows={7} required disabled={disabled} />
      {!online && <p className={styles.muted}>Connect to the internet to send.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <div className={styles.actions}><small id={`${messageId}-count`}>{message.length} / 4000</small><button className={styles.send} type="submit" disabled={disabled || !message.trim() || !online}>{sending ? "Sending…" : isBug ? "Send report" : "Send feedback"}</button></div>
    </form>
  </section>;
}

export default function TeacherReports({ teacher, view = null, onViewChange, onClose, returnFocusRef }) {
  const [mounted, setMounted] = useState(false);
  const [online, setOnline] = useState(true);
  const [sendingType, setSendingType] = useState("");
  const pending = useRef(false);
  const dialog = useRef(null);
  const content = useRef(null);
  const open = view !== null;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!mounted || !open) return undefined;
    const previousFocus = returnFocusRef?.current || document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [mounted, open, returnFocusRef]);

  useEffect(() => {
    if (!mounted || !open) return;
    const target = view === "choice"
      ? dialog.current?.querySelector('[data-report-choice="bug"]')
      : dialog.current?.querySelector(`#teacher-report-${view}-message`);
    (target && !target.disabled ? target : dialog.current?.querySelector('button'))?.focus({ preventScroll: true });
    if (content.current) content.current.scrollTop = 0;
  }, [mounted, open, view]);

  if (!mounted) return null;

  // Keep both forms mounted so Back/Close never discards a draft or aborts a send.
  return createPortal(<div className={styles.root} hidden={!open} onKeyDown={event => {
    if (event.key === "Escape") {
      event.preventDefault();event.stopPropagation();onClose();
    } else if (event.key === "Tab") {
      const nodes = Array.from(dialog.current?.querySelectorAll('button:not([disabled]),textarea:not([disabled])') || []).filter(node => node.getClientRects().length);
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault();nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault();nodes[0]?.focus(); }
    }
  }}>
    <section className={styles.dialog} ref={dialog} role="dialog" aria-modal="true" aria-labelledby={view === "bug" || view === "feedback" ? `teacher-report-${view}-title` : "teacher-report-choice-title"}>
      <div className={styles.toolbar}>
        {view === "choice" && <h2 id="teacher-report-choice-title" className={styles.choiceTitle}>What would you like to do?</h2>}
        {view !== "choice" && <button type="button" className={styles.back} onClick={() => onViewChange("choice")}><span aria-hidden="true">‹</span> Back</button>}
        <button type="button" className={styles.close} aria-label="Close report and feedback" onClick={onClose}><span aria-hidden="true">×</span></button>
      </div>
      <div className={styles.content} ref={content}>
        <section className={styles.chooser} hidden={view !== "choice"}>
          <p>Choose an option to continue.</p>
          <div className={styles.choices}>
            <button type="button" data-report-choice="bug" onClick={() => onViewChange("bug")}><ReportIcon type="bug" /><span><strong>Report a Bug</strong><small>Tell us about something that isn't working.</small></span><span className={styles.arrow} aria-hidden="true">›</span></button>
            <button type="button" data-report-choice="feedback" onClick={() => onViewChange("feedback")}><ReportIcon type="feedback" /><span><strong>Send Feedback</strong><small>Share an idea or suggest an improvement.</small></span><span className={styles.arrow} aria-hidden="true">›</span></button>
          </div>
        </section>
        {["bug", "feedback"].map(type => <ReportForm key={type} type={type} teacher={teacher} online={online} sendingType={sendingType} setSendingType={setSendingType} pending={pending} hidden={view !== type} />)}
      </div>
    </section>
  </div>, document.body);
}
