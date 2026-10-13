"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./TeacherReports.module.css";

export default function TeacherReports({ teacher }) {
  const [type, setType] = useState("bug");
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const request = useRef(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      request.current?.abort();
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (pending.current || !message.trim()) return;
    if (!online) { setError("Connect to the internet to send.");return; }
    pending.current = true;
    setSending(true);setError("");setNotice("");
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
      window.clearTimeout(timeout);pending.current = false;request.current = null;setSending(false);
    }
  }

  return <section className={styles.root} aria-label="Report and Feedback">
    <h2>Report and Feedback</h2>
    <form onSubmit={submit}>
      <div className={styles.options} role="group" aria-label="Submission type">
        <button type="button" aria-pressed={type === "bug"} disabled={sending} onClick={() => { setType("bug");setError("");setNotice(""); }}>Bug report</button>
        <button type="button" aria-pressed={type === "feedback"} disabled={sending} onClick={() => { setType("feedback");setError("");setNotice(""); }}>Feedback</button>
      </div>
      <label htmlFor="teacher-report-message">{type === "bug" ? "Describe the bug" : "Your feedback"}</label>
      <textarea id="teacher-report-message" value={message} onChange={e => { setMessage(e.target.value);setNotice(""); }} maxLength={4000} rows={7} required disabled={sending} />
      {!online && <p className={styles.muted}>Connect to the internet to send.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <div className={styles.actions}><small>{message.length} / 4000</small><button className={styles.send} type="submit" disabled={sending || !message.trim() || !online}>{sending ? "Sending…" : "Send"}</button></div>
    </form>
  </section>;
}
