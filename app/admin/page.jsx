"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const INK = "#1a2b4c";
const BLUE = "#4a6fa5";
const RED = "#c0392b";
const MUTED = "#6b7789";
const LINE = "#dce3ec";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const cardStyle = {
  background: "#ffffff",
  border: `1px solid ${LINE}`,
  borderRadius: 14,
  padding: 22,
  display: "grid",
  gap: 16,
};

const labelStyle = {
  margin: 0,
  fontSize: 15,
  fontWeight: 800,
  color: INK,
  letterSpacing: "-.01em",
};

const buttonStyle = {
  height: 42,
  padding: "0 18px",
  border: 0,
  borderRadius: 10,
  background: INK,
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 800,
  fontFamily: "inherit",
  cursor: "pointer",
};

const quietButtonStyle = {
  ...buttonStyle,
  background: "transparent",
  border: `1px solid ${LINE}`,
  color: INK,
};

const smallButtonStyle = {
  padding: "0 10px",
  height: 30,
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  background: "#ffffff",
  color: INK,
  fontSize: 11,
  fontWeight: 800,
  fontFamily: "inherit",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const emptyStyle = {
  padding: "26px 0",
  textAlign: "center",
  color: MUTED,
  fontSize: 13,
  border: `1px dashed ${LINE}`,
  borderRadius: 12,
};

function EntryRow({ entry, onResolve, onDelete, busy }) {
  const [open, setOpen] = useState(false);
  const long = (entry.message || "").length > 180;
  const text = open || !long ? entry.message : `${entry.message.slice(0, 180)}…`;

  return (
    <li style={{ display: "grid", gap: 8, padding: "14px 0", borderTop: `1px solid ${LINE}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13, color: INK }}>{entry.name || "Anonymous"}</strong>
        {entry.contact ? <span style={{ fontSize: 12, color: BLUE }}>{entry.contact}</span> : null}
        <span style={{ fontSize: 12, color: MUTED, marginLeft: "auto" }}>{formatDate(entry.created_at)}</span>
      </div>

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#2a3a55", whiteSpace: "pre-wrap" }}>{text}</p>

      {long ? (
        <button type="button" onClick={() => setOpen((value) => !value)} style={{ justifySelf: "start", border: 0, background: "transparent", padding: 0, color: BLUE, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}

      {entry.page_url ? <span style={{ fontSize: 11, color: MUTED, wordBreak: "break-all" }}>{entry.page_url}</span> : null}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {entry.is_resolved ? <span style={{ fontSize: 11, fontWeight: 800, color: "#3e7a5e" }}>Resolved</span> : null}
        <button type="button" disabled={busy} onClick={() => onResolve(entry)} style={smallButtonStyle}>
          {entry.is_resolved ? "Reopen" : "Resolve"}
        </button>
        <button type="button" disabled={busy} onClick={() => onDelete(entry)} style={{ ...smallButtonStyle, color: RED, borderColor: "#f0cdc8" }}>
          Delete
        </button>
      </div>
    </li>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin?action=overview", {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 401 || response.status === 403) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Unable to load the dashboard.");

      setData(payload);
    } catch (requestError) {
      setError(requestError.message || "Unable to load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function send(body, key) {
    if (busy) return;
    setBusy(key);
    setError("");
    setCopied(false);
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 401 || response.status === 403) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Unable to complete the request.");

      await load();
      return payload;
    } catch (requestError) {
      setError(requestError.message || "Unable to complete the request.");
    } finally {
      setBusy("");
    }
  }

  async function copyCode() {
    const code = data?.active_code?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Clipboard access was blocked. Copy the code manually.");
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth?action=logout", { method: "POST", credentials: "include" });
    } finally {
      router.replace("/admin/login");
    }
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#fafafa", fontFamily: "var(--font-outfit), system-ui, sans-serif" }}>
        <div aria-label="Loading" style={{ width: 34, height: 34, borderRadius: "50%", border: `3px solid ${LINE}`, borderTopColor: INK, animation: "adminSpin .8s linear infinite" }}>
          <style jsx global>{`@keyframes adminSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </main>
    );
  }

  const activeCode = data?.active_code || null;
  const bugReports = data?.bug_reports || [];
  const feedback = data?.feedback || [];

  return (
    <main style={{ minHeight: "100dvh", background: "#fafafa", color: INK, fontFamily: "var(--font-outfit), system-ui, sans-serif", padding: "32px 20px 64px" }}>
      <div style={{ width: "min(940px, 100%)", margin: "0 auto", display: "grid", gap: 18 }}>
        <header className="adminHeader">
          <Image src="/crl-app-logo.png" alt="CRL-App" width={1883} height={755} priority className="adminHeaderLogo" />
          <div className="adminHeaderActions">
            <button type="button" onClick={load} disabled={Boolean(busy)} className="adminActionButton">
              Refresh
            </button>
            <button type="button" onClick={logout} className="adminActionButton adminActionButtonDanger">
              Logout
            </button>
          </div>
        </header>

        {error ? (
          <div role="alert" style={{ padding: "12px 14px", borderRadius: 12, background: "#fff0f2", border: "1px solid #f4c8cf", color: RED, fontSize: 13 }}>
            {error}
          </div>
        ) : null}

        {/* Teacher signup code */}
        <section style={cardStyle}>
          <h2 style={labelStyle}>Teacher signup code</h2>

          {activeCode ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "14px 16px", borderRadius: 12, background: "#f4f7fb", border: `1px solid ${LINE}` }}>
                <code style={{ fontSize: 20, fontWeight: 800, letterSpacing: ".06em", color: INK, wordBreak: "break-all" }}>
                  {activeCode.code}
                </code>
                <button type="button" onClick={copyCode} style={{ ...smallButtonStyle, marginLeft: "auto" }}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <span style={{ fontSize: 12, color: MUTED }}>
                Expires automatically once a teacher registers. Created {formatDate(activeCode.created_at)}.
              </span>
            </div>
          ) : (
            <div style={emptyStyle}>No active signup code.</div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" disabled={Boolean(busy)} onClick={() => send({ action: "generate_code" }, "generate")} style={buttonStyle}>
              {busy === "generate" ? "Generating…" : activeCode ? "Generate new code" : "Generate code"}
            </button>
            {activeCode ? (
              <button type="button" disabled={Boolean(busy)} onClick={() => send({ action: "reset_code" }, "reset")} style={quietButtonStyle}>
                {busy === "reset" ? "Resetting…" : "Reset code"}
              </button>
            ) : null}
          </div>
        </section>

        {/* Bug reports */}
        <section style={cardStyle}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <h2 style={labelStyle}>Report a Bug</h2>
            <span style={{ fontSize: 12, color: MUTED, marginLeft: "auto" }}>
              {bugReports.length} {bugReports.length === 1 ? "entry" : "entries"}
            </span>
          </div>

          {bugReports.length ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {bugReports.map((entry) => (
                <EntryRow
                  key={`bug-${entry.id}`}
                  entry={entry}
                  busy={Boolean(busy)}
                  onResolve={(item) => send({ action: "update_report", type: "bug", id: item.id, is_resolved: !item.is_resolved }, `bug-${item.id}`)}
                  onDelete={(item) => send({ action: "delete_report", type: "bug", id: item.id }, `bug-${item.id}`)}
                />
              ))}
            </ul>
          ) : (
            <div style={emptyStyle}>No bug reports yet.</div>
          )}
        </section>

        {/* Feedback */}
        <section style={cardStyle}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <h2 style={labelStyle}>Feedback</h2>
            <span style={{ fontSize: 12, color: MUTED, marginLeft: "auto" }}>
              {feedback.length} {feedback.length === 1 ? "entry" : "entries"}
            </span>
          </div>

          {feedback.length ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {feedback.map((entry) => (
                <EntryRow
                  key={`feedback-${entry.id}`}
                  entry={entry}
                  busy={Boolean(busy)}
                  onResolve={(item) => send({ action: "update_report", type: "feedback", id: item.id, is_resolved: !item.is_resolved }, `feedback-${item.id}`)}
                  onDelete={(item) => send({ action: "delete_report", type: "feedback", id: item.id }, `feedback-${item.id}`)}
                />
              ))}
            </ul>
          ) : (
            <div style={emptyStyle}>No feedback yet.</div>
          )}
        </section>
      </div>

      <style jsx global>{`
        /* The header carries the logo only — no title, no account name. */
        .adminHeader {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
          min-height: 46px;
        }

        .adminHeaderLogo {
          height: 46px;
          width: auto;
        }

        .adminHeaderActions {
          margin-left: auto;
          display: flex;
          gap: 8px;
        }

        .adminActionButton {
          height: 42px;
          padding: 0 18px;
          border: 1px solid ${LINE};
          border-radius: 10px;
          background: transparent;
          color: ${INK};
          font-family: inherit;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          transition: background-color .18s ease, border-color .18s ease,
            color .18s ease, transform .15s ease, box-shadow .18s ease;
        }

        .adminActionButton:hover:not(:disabled) {
          background: #eef3fa;
          border-color: ${BLUE};
          color: ${BLUE};
          box-shadow: 0 6px 16px rgba(74, 111, 165, .16);
        }

        .adminActionButton:active:not(:disabled) {
          transform: translateY(1px) scale(.98);
          box-shadow: none;
        }

        .adminActionButton:focus-visible {
          outline: 2px solid ${BLUE};
          outline-offset: 2px;
        }

        .adminActionButton:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        .adminActionButtonDanger {
          border-color: #f0cdc8;
          color: ${RED};
        }

        .adminActionButtonDanger:hover:not(:disabled) {
          background: #fdf1ef;
          border-color: ${RED};
          color: ${RED};
          box-shadow: 0 6px 16px rgba(192, 57, 43, .16);
        }

        @media (prefers-reduced-motion: reduce) {
          .adminActionButton { transition: none; }
        }

        @media (max-width: 520px) {
          .adminHeaderLogo { height: 38px; }
          .adminHeaderActions { width: 100%; margin-left: 0; }
          .adminActionButton { flex: 1 1 auto; }
        }
      `}</style>
    </main>
  );
}
