"use client";

import { useState } from "react";
import ClassDialog from "./ClassDialog";

/**
 * Reviewer-scoped, read-only request metadata. The server decides whether a
 * selected applicant can be approved; browser buttons never activate accounts.
 */
export default function StaffApprovalRequests({ entries = [], onReview, busy = false, reviewer = "coordinator" }) {
  const [selection, setSelection] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const requests = Array.isArray(entries) ? entries : [];
  const roleLabel = role => role === "reading_coordinator" ? "Reading Coordinator" : "Teacher";
  const review = async () => {
    if (!selection || submitting || busy) return;
    setSubmitting(true);
    setError("");
    try {
      const ok = await onReview(selection.entry.id, selection.decision);
      if (ok === false) throw new Error("Unable to review this request. Refresh and try again.");
      setSelection(null);
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
            ? "Approve teacher and Reading Coordinator registrations for your school."
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" disabled={busy || submitting} onClick={() => { setError("");setSelection({entry,decision:"reject"}); }} style={{ borderRadius: 9, padding: "10px 16px", border: "1px solid #bb3342", color: "#a32232", background: "transparent", cursor: "pointer", fontWeight: 700 }}>Reject</button>
                <button type="button" disabled={busy || submitting} onClick={() => { setError("");setSelection({entry,decision:"approve"}); }} style={{ borderRadius: 9, padding: "10px 16px", border: 0, color: "#fff", background: "#176c45", cursor: "pointer", fontWeight: 700 }}>Approve</button>
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
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" disabled={submitting} onClick={() => {setSelection(null);setError("");}}>Cancel</button>
          <button type="button" disabled={submitting} onClick={review} style={{ background: selection.decision === "approve" ? "#176c45" : "#b3253a", color: "#fff", border: 0, borderRadius: 9, padding: "10px 18px", fontWeight: 700 }}>
            {submitting ? "Reviewing..." : selection.decision === "approve" ? "Confirm approval" : "Confirm rejection"}
          </button>
        </div>
      </ClassDialog>}
    </section>
  );
}
