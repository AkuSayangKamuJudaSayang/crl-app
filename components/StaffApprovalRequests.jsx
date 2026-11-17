"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ClassDialog from "./ClassDialog";
import styles from "./StaffApprovalRequests.module.css";

/**
 * Reviewer-scoped, read-only request metadata. The server decides whether a
 * selected applicant can be approved; browser buttons never activate accounts.
 */
export default function StaffApprovalRequests({ entries = [], onReview, busy = false, reviewer = "coordinator" }) {
  const [selection, setSelection] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState(null);
  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => setFeedback(null), 4500);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  const requests = (Array.isArray(entries) ? entries : []).filter(entry=>entry.role===(reviewer==="admin"?"reading_coordinator":"teacher"));
  const roleLabel = role => role === "reading_coordinator" ? "Reading Coordinator" : "Teacher";
  const review = async () => {
    if (!selection || submitting || busy) return;
    setSubmitting(true);
    setError("");
    try {
      const { entry, decision } = selection;
      const ok = await onReview(entry.id, decision);
      if (ok === false) throw new Error("Unable to review this request. Refresh and try again.");
      setSelection(null);
      setFeedback({
        message: decision === "approve"
          ? `${roleLabel(entry.role)} account approved. They can now sign in.`
          : "Registration rejected.",
        kind: decision === "approve" ? "success" : "neutral"
      });
    } catch (reason) {
      setError(reason?.message || "Unable to complete the review.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <section aria-label="Staff account approvals" style={{ padding: "16px", maxWidth: "1050px" }}>
      <header style={{ marginBottom: 18 }}>
        <h2 style={{ margin: "0 0 7px", fontSize: "1.25rem" }}>Account approvals</h2>
        <p style={{ margin: 0, lineHeight: 1.5, opacity: .75 }}>
          {reviewer === "admin"
            ? "Approve Reading Coordinator registrations for your school. Teacher registrations are reviewed by the Reading Coordinator."
            : "Approve teacher registrations for your school. Reading Coordinators are approved by the school Administrator."}
          {" "}Applicants cannot sign in until approved.
        </p>
      </header>
      {requests.length === 0 && <p role="status" style={{ padding: "18px", border: "1px solid var(--crl-line, #d9e3ee)", borderRadius: 12 }}>No pending account requests.</p>}
      <div style={{ display: "grid", gap: 12 }}>
        {requests.map(entry => (
          <article key={entry.id} style={{ padding: 16, border: "1px solid var(--crl-line, #d9e3ee)", borderRadius: 14, background: "var(--crl-surface, transparent)" }}>
            <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                <strong style={{ display: "block", fontSize: 16 }}>{entry.fullName}</strong>
                <small style={{ opacity: .75 }}>{roleLabel(entry.role)} · {entry.schoolName || entry.schoolId}</small>
                <p style={{ margin: "8px 0 2px" }}>{entry.email || "No email"} · @{entry.username}</p>
                <small style={{ opacity: .7 }}>Requested {new Date(entry.createdAt).toLocaleString("en-PH")}</small>
              </div>
              <div className={styles.listActions}>
                <button type="button" className={`${styles.action} ${styles.reject}`} disabled={busy || submitting} onClick={() => {setError("");setFeedback(null);setSelection({entry,decision:"reject"});}}>Reject</button>
                <button type="button" className={`${styles.action} ${styles.approve}`} disabled={busy || submitting} onClick={() => {setError("");setFeedback(null);setSelection({entry,decision:"approve"});}}>Approve</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {selection && <ClassDialog title={selection.decision === "approve" ? "Approve account?" : "Reject registration?"} busy={submitting} onClose={() => {setSelection(null);setError("");}}>
        <p style={{ lineHeight: 1.6 }}>
          {selection.decision === "approve"
            ? `Allow ${selection.entry.fullName} (${roleLabel(selection.entry.role)}) to sign in and access your school?`
            : `Reject the pending registration for ${selection.entry.fullName}?`}
        </p>
        {error && <p role="alert" style={{ color: "#b5253a" }}>{error}</p>}
        <div className={styles.dialogActions}>
          <button type="button" className={`${styles.action} ${styles.cancel}`} disabled={submitting} onClick={() => {setSelection(null);setError("");}}>Cancel</button>
          <button type="button" className={`${styles.action} ${selection.decision === "approve" ? styles.confirmApprove : styles.confirmReject}`} disabled={submitting} onClick={review}>
            {submitting ? "Please wait..." : selection.decision === "approve" ? "Confirm approval" : "Confirm rejection"}
          </button>
        </div>
      </ClassDialog>}
      {feedback && typeof document !== "undefined" && createPortal(
        <div className={`${styles.toast} ${feedback.kind === "success" ? styles.toastSuccess : styles.toastNeutral}`} role="status" aria-live="polite">
          <span className={styles.toastIcon} aria-hidden="true">✓</span>
          <span>{feedback.message}</span>
        </div>, document.body)}
    </section>
  );
}
