"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./TeacherReports.module.css";

function ReportForm({ type, teacher, online, sendingType, setSendingType, pending }) {
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

  return <section className={styles.card} aria-labelledby={`teacher-report-${type}-title`}>
    <header className={styles.header}>
      <span className={styles.icon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{isBug ? <><rect x="7" y="7" width="10" height="13" rx="5" /><path d="M9 7V5a3 3 0 0 1 6 0v2M12 8v11M4 10h3m10 0h3M4 15h3m10 0h3M5 21l3-3m8 0 3 3" /></> : <><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M7 9h10M7 13h6" /></>}</svg></span>
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

export default function TeacherReports({ teacher }) {
  const [online, setOnline] = useState(true);
  const [sendingType, setSendingType] = useState("");
  const pending = useRef(false);

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

  return <div className={styles.root}>
    {["bug", "feedback"].map(type => <ReportForm key={type} type={type} teacher={teacher} online={online} sendingType={sendingType} setSendingType={setSendingType} pending={pending} />)}
  </div>;
}
