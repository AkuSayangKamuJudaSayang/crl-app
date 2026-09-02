"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const ACCENT_BLUE = "#1559a6";
const DEEP_BLUE = "#0b3368";
const LIGHT_BLUE = "#edf5ff";
const RED = "#c92335";
const TEXT = "#14243a";
const MUTED = "#708096";

function Icon({ children, size = 19, stroke = 2 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function formatDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function StatusPill({ status }) {
  const active = status === "active";
  const used = status === "used";
  const label = active ? "Active" : used ? "Used" : "Expired";
  return (
    <span className={`statusPill ${active ? "active" : used ? "used" : "expired"}`}>
      <span className="statusDot" />
      {label}
    </span>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin?action=overview", {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      const payload = await response.json().catch(() => ({}));

      if (response.status === 401 || response.status === 403) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load admin dashboard.");
      }

      setData(payload);
    } catch (requestError) {
      setError(requestError.message || "Unable to load admin dashboard.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeCode = data?.active_code || null;
  const history = data?.history || [];

  const activeHistory = useMemo(
    () => history.find((item) => item.id === activeCode?.id) || activeCode,
    [activeCode, history]
  );

  async function copyCode() {
    const code = activeHistory?.code;
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setToast("Invite code copied.");
      window.setTimeout(() => setCopied(false), 1700);
    } catch {
      setError("Your browser blocked clipboard access. Copy the code manually.");
    }
  }

  async function runCodeAction(action) {
    if (actionLoading) return;
    setActionLoading(action);
    setError("");
    setCopied(false);

    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ action }),
      });

      const payload = await response.json().catch(() => ({}));

      if (response.status === 401 || response.status === 403) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error || "Unable to update invite code.");
      }

      await loadDashboard();
      setToast(payload.message || "Invite code updated.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update invite code.");
    } finally {
      setActionLoading("");
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth?action=logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      router.replace("/login");
    }
  }

  if (loading) {
    return (
      <main className="loadingScreen">
        <div className="loadingCard">
          <div className="loadingLogo">CRL</div>
          <div className="spinner" />
          <h1>Opening Admin</h1>
          <p>Preparing your administrator workspace.</p>
        </div>
        <AdminStyles />
      </main>
    );
  }

  return (
    <>
      <AdminStyles />
      <main className="adminShell">
        <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
          <div className="brandBlock">
            <div className="brandMark">
              <span className="brandMarkInner">CRL</span>
            </div>
            <div>
              <div className="brandTitle">CRL-App</div>
              <div className="brandSubtitle">Administrator</div>
            </div>
          </div>

          <div className="sidebarLabel">CONTROL CENTER</div>
          <nav className="sideNav">
            <button className="navItem active" type="button">
              <Icon>
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </Icon>
              <span>Overview</span>
            </button>
            <button className="navItem activeSub" type="button">
              <Icon>
                <path d="M7 4h10" />
                <path d="M7 8h10" />
                <path d="M7 12h7" />
                <path d="M7 16h10" />
                <path d="M4 4h.01" />
                <path d="M4 8h.01" />
                <path d="M4 12h.01" />
                <path d="M4 16h.01" />
              </Icon>
              <span>Invite Codes</span>
            </button>
          </nav>

          <div className="sidebarBottom">
            <div className="adminIdentity">
              <div className="avatar">
                {(data?.admin?.full_name || data?.admin?.username || "A")
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
              <div className="adminIdentityText">
                <strong>{data?.admin?.full_name || "Administrator"}</strong>
                <span>@{data?.admin?.username || "admin"}</span>
              </div>
            </div>
            <button type="button" className="logoutButton" onClick={logout}>
              <Icon>
                <path d="M10 17l5-5-5-5" />
                <path d="M15 12H3" />
                <path d="M21 19V5a2 2 0 0 0-2-2h-5" />
              </Icon>
              Sign out
            </button>
          </div>
        </aside>

        {mobileOpen && (
          <button
            className="mobileBackdrop"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <section className="mainArea">
          <header className="topbar">
            <button
              className="mobileMenu"
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Icon size={21}>
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </Icon>
            </button>
            <div>
              <div className="eyebrow">ADMINISTRATOR</div>
              <h1>Invite Code Center</h1>
              <p>Manage the single-use teacher registration code for CRL-App.</p>
            </div>
            <div className="topbarBadge">
              <span className="onlineDot" />
              System ready
            </div>
          </header>

          <div className="content">
            {error && (
              <div className="alert errorAlert" role="alert">
                <span className="alertIcon">!</span>
                <span>{error}</span>
                <button type="button" onClick={() => setError("")}>×</button>
              </div>
            )}

            <section className="heroCard">
              <div className="heroText">
                <div className="heroKicker">
                  <span>CRLA</span>
                  <span className="heroDivider" />
                  <span>Teacher Registration</span>
                </div>
                <h2>One code.<br /><span>One teacher.</span></h2>
                <p>
                  Generate a fresh administrator invite whenever you need to open teacher registration.
                  Used codes remain in the audit history.
                </p>
                <div className="heroActions">
                  <button
                    type="button"
                    className="primaryButton"
                    disabled={Boolean(actionLoading)}
                    onClick={() => runCodeAction("generate_code")}
                  >
                    {actionLoading === "generate_code" ? (
                      <><span className="buttonSpinner" /> Generating...</>
                    ) : (
                      <><Icon size={18}><path d="M12 5v14" /><path d="M5 12h14" /></Icon> Generate New Code</>
                    )}
                  </button>
                  <button
                    type="button"
                    className="secondaryButton"
                    disabled={Boolean(actionLoading) || !activeCode}
                    onClick={() => runCodeAction("reset_code")}
                  >
                    {actionLoading === "reset_code" ? "Resetting..." : "Reset Active Code"}
                  </button>
                </div>
              </div>
              <div className="heroArt" aria-hidden="true">
                <div className="artGlow" />
                <div className="artRing ringOne" />
                <div className="artRing ringTwo" />
                <div className="artCard">
                  <span className="artCardLabel">ACTIVE ACCESS</span>
                  <strong>CRLA</strong>
                  <small>Teacher registration</small>
                </div>
              </div>
            </section>

            <section className="metricsGrid">
              <MetricCard label="Active code" value={data?.stats?.active_codes ?? 0} tone="blue" icon="key" />
              <MetricCard label="Used codes" value={data?.stats?.used_codes ?? 0} tone="red" icon="check" />
              <MetricCard label="Codes generated" value={data?.stats?.total_codes ?? 0} tone="violet" icon="grid" />
              <MetricCard label="Teacher accounts" value={data?.stats?.teacher_accounts ?? 0} tone="green" icon="users" />
            </section>

            <section className="workspaceGrid">
              <div className="currentCodeCard">
                <div className="sectionHeader">
                  <div>
                    <span className="sectionKicker">CURRENT</span>
                    <h3>Active teacher invite</h3>
                  </div>
                  {activeHistory ? <StatusPill status={activeHistory.status} /> : null}
                </div>

                {activeHistory ? (
                  <>
                    <div className="codeBox">
                      <div className="codeMonogram">CRLA</div>
                      <div className="codeValue">{activeHistory.code}</div>
                      <button type="button" className="copyButton" onClick={copyCode}>
                        <Icon size={18}>
                          <rect x="9" y="9" width="11" height="11" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </Icon>
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <div className="codeMeta">
                      <div><span>Created</span><strong>{formatDate(activeHistory.created_at)}</strong></div>
                      <div><span>Expires</span><strong>{activeHistory.expires_at ? formatDate(activeHistory.expires_at) : "No expiration"}</strong></div>
                    </div>
                    <div className="usageHint">
                      <Icon size={16}><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></Icon>
                      This code becomes unavailable after a teacher successfully registers.
                    </div>
                  </>
                ) : (
                  <div className="emptyCurrent">
                    <div className="emptyCurrentIcon">+</div>
                    <h4>No active invite code</h4>
                    <p>Generate a new teacher registration code to begin.</p>
                    <button type="button" className="primaryButton small" onClick={() => runCodeAction("generate_code")}>
                      Generate Code
                    </button>
                  </div>
                )}
              </div>

              <div className="quickGuide">
                <div className="sectionHeader">
                  <div>
                    <span className="sectionKicker">WORKFLOW</span>
                    <h3>How it works</h3>
                  </div>
                  <div className="guideBadge">SECURE</div>
                </div>
                <div className="guideSteps">
                  <GuideStep number="01" title="Generate" text="Create a fresh CRLA teacher invite code." />
                  <GuideStep number="02" title="Share" text="Give the active code to the teacher who needs an account." />
                  <GuideStep number="03" title="Reset" text="Generate a replacement after the active code is consumed." />
                </div>
              </div>
            </section>

            <section className="historyCard">
              <div className="historyHeader">
                <div>
                  <span className="sectionKicker">AUDIT HISTORY</span>
                  <h3>Invite code activity</h3>
                </div>
                <button type="button" className="refreshButton" onClick={loadDashboard}>
                  <Icon size={17}>
                    <path d="M20 11a8 8 0 0 0-14.9-4" />
                    <path d="M4 4v4h4" />
                    <path d="M4 13a8 8 0 0 0 14.9 4" />
                    <path d="M20 20v-4h-4" />
                  </Icon>
                  Refresh
                </button>
              </div>

              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Invite code</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length ? history.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="historyCode">
                            <span>CRLA</span>
                            {item.code.replace(/^CRLA-/, "")}
                          </div>
                        </td>
                        <td><StatusPill status={item.status} /></td>
                        <td>{formatDate(item.created_at)}</td>
                        <td>{item.expires_at ? formatDate(item.expires_at) : "No expiration"}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="4">
                          <div className="tableEmpty">No invite code history yet.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {toast && <div className="toast">{toast}</div>}
        </section>
      </main>
    </>
  );
}

function MetricCard({ label, value, tone, icon }) {
  return (
    <div className={`metricCard ${tone}`}>
      <div className="metricIcon">
        <Icon>
          {icon === "key" && <><rect x="3" y="10" width="11" height="8" rx="4" /><path d="M14 14h5" /><path d="M17 12v4" /></>}
          {icon === "check" && <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.3 2.2 2.2 4.8-5" /></>}
          {icon === "grid" && <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>}
          {icon === "users" && <><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.7-3 2.5-4.5 5.5-4.5s4.8 1.5 5.5 4.5" /><path d="M15.5 7.5a2.8 2.8 0 0 1 0 5.4" /><path d="M17 14.5c2.2.5 3.4 1.8 3.8 3.9" /></>}
        </Icon>
      </div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function GuideStep({ number, title, text }) {
  return (
    <div className="guideStep">
      <div className="stepNumber">{number}</div>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

function AdminStyles() {
  return (
    <style jsx global>{`
      :root {
        color-scheme: light;
      }

      * { box-sizing: border-box; }

      html, body {
        margin: 0;
        min-height: 100%;
      }

      body {
        font-family: Arial, Helvetica, sans-serif;
        color: ${TEXT};
        background:
          radial-gradient(circle at 10% 0%, rgba(21,89,166,.12), transparent 30%),
          radial-gradient(circle at 100% 100%, rgba(201,35,53,.08), transparent 26%),
          linear-gradient(180deg, #f7fbff 0%, #eef4fb 100%);
      }

      button, input { font: inherit; }
      button { border: 0; }

      .adminShell {
        min-height: 100vh;
        display: flex;
        background: linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%);
      }

      .sidebar {
        width: 260px;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        padding: 25px 18px 18px;
        background: linear-gradient(180deg, ${DEEP_BLUE} 0%, #082953 100%);
        color: white;
        position: sticky;
        top: 0;
        height: 100vh;
        z-index: 20;
        box-shadow: 18px 0 50px rgba(12,51,104,.12);
      }

      .brandBlock {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 6px 10px 22px;
      }

      .brandMark {
        width: 48px;
        height: 48px;
        border-radius: 15px;
        display: grid;
        place-items: center;
        background: linear-gradient(145deg, rgba(255,255,255,.19), rgba(255,255,255,.07));
        border: 1px solid rgba(255,255,255,.2);
        box-shadow: inset 0 1px rgba(255,255,255,.18), 0 12px 30px rgba(0,0,0,.16);
      }

      .brandMarkInner {
        font-weight: 900;
        font-size: 13px;
        letter-spacing: .06em;
      }

      .brandTitle { font-weight: 900; font-size: 18px; }
      .brandSubtitle { margin-top: 2px; color: rgba(255,255,255,.64); font-size: 11px; }

      .sidebarLabel {
        color: rgba(255,255,255,.42);
        letter-spacing: .16em;
        font-weight: 800;
        font-size: 9px;
        padding: 0 12px 10px;
      }

      .sideNav { display: grid; gap: 6px; }
      .navItem {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 13px;
        border-radius: 12px;
        background: transparent;
        color: rgba(255,255,255,.64);
        text-align: left;
        cursor: default;
      }

      .navItem.activeSub {
        color: white;
        background: linear-gradient(135deg, rgba(66,145,235,.28), rgba(66,145,235,.12));
        box-shadow: inset 0 0 0 1px rgba(122,184,255,.16);
      }

      .sidebarBottom { margin-top: auto; display: grid; gap: 12px; }
      .adminIdentity {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        border-radius: 15px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.07);
      }

      .avatar {
        width: 36px;
        height: 36px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background: linear-gradient(145deg, #4d96e8, #185cab);
        font-weight: 900;
        flex: 0 0 auto;
      }

      .adminIdentityText { min-width: 0; display: grid; gap: 2px; }
      .adminIdentityText strong { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .adminIdentityText span { color: rgba(255,255,255,.49); font-size: 10px; }

      .logoutButton {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 11px 12px;
        border-radius: 12px;
        background: transparent;
        color: rgba(255,255,255,.63);
        cursor: pointer;
      }
      .logoutButton:hover { color: white; background: rgba(255,255,255,.06); }

      .mainArea { min-width: 0; flex: 1; }

      .topbar {
        min-height: 126px;
        padding: 36px 46px 28px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 20px;
        border-bottom: 1px solid rgba(133,157,183,.18);
        background: rgba(248,251,255,.84);
        backdrop-filter: blur(16px);
        position: sticky;
        top: 0;
        z-index: 10;
      }

      .eyebrow {
        color: ${ACCENT_BLUE};
        font-size: 9px;
        letter-spacing: .19em;
        font-weight: 900;
      }
      .topbar h1 { margin: 6px 0 4px; font-size: 31px; line-height: 1; letter-spacing: -.045em; }
      .topbar p { margin: 0; color: ${MUTED}; font-size: 12px; }

      .topbarBadge {
        margin-top: 2px;
        padding: 9px 13px;
        display: flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        background: white;
        color: #4d6077;
        font-size: 10px;
        font-weight: 800;
        box-shadow: 0 10px 24px rgba(44,80,117,.08);
        border: 1px solid #e2ebf5;
        white-space: nowrap;
      }
      .onlineDot, .statusDot { width: 7px; height: 7px; border-radius: 50%; background: #24a464; display: inline-block; }

      .content { padding: 28px 46px 46px; max-width: 1420px; margin: 0 auto; }

      .alert {
        border-radius: 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 11px 13px;
        margin-bottom: 18px;
        font-size: 11px;
        font-weight: 700;
      }
      .errorAlert { background: #fff0f1; color: #a51d2f; border: 1px solid #f4c5cb; }
      .alertIcon { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: #ffdbe0; font-weight: 900; flex: 0 0 auto; }
      .alert button { margin-left: auto; background: transparent; color: inherit; font-size: 18px; cursor: pointer; }

      .heroCard {
        overflow: hidden;
        min-height: 308px;
        border-radius: 26px;
        background:
          radial-gradient(circle at 85% 15%, rgba(91,163,240,.34), transparent 25%),
          linear-gradient(135deg, #0b376f 0%, #155ea8 56%, #2f7fd0 100%);
        color: white;
        position: relative;
        box-shadow: 0 24px 55px rgba(21,89,166,.18);
        display: grid;
        grid-template-columns: 1.2fr .8fr;
      }

      .heroText { padding: 34px 38px; position: relative; z-index: 2; }
      .heroKicker { display: flex; align-items: center; gap: 10px; font-size: 9px; letter-spacing: .13em; font-weight: 900; opacity: .82; text-transform: uppercase; }
      .heroDivider { width: 30px; height: 1px; background: rgba(255,255,255,.35); }
      .heroText h2 { margin: 22px 0 12px; font-size: 42px; line-height: .98; letter-spacing: -.06em; }
      .heroText h2 span { color: #ddecff; }
      .heroText p { max-width: 540px; margin: 0; line-height: 1.65; color: rgba(255,255,255,.77); font-size: 12px; }
      .heroActions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 23px; }

      .primaryButton, .secondaryButton, .refreshButton, .copyButton {
        cursor: pointer;
        transition: transform .18s ease, box-shadow .18s ease, background .18s ease, opacity .18s ease;
      }
      .primaryButton:hover:not(:disabled), .secondaryButton:hover:not(:disabled), .refreshButton:hover:not(:disabled), .copyButton:hover:not(:disabled) { transform: translateY(-1px); }
      .primaryButton:active:not(:disabled), .secondaryButton:active:not(:disabled), .refreshButton:active:not(:disabled), .copyButton:active:not(:disabled) { transform: translateY(1px) scale(.99); }
      .primaryButton:disabled, .secondaryButton:disabled, .copyButton:disabled { opacity: .55; cursor: not-allowed; }

      .primaryButton {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 15px;
        border-radius: 12px;
        background: white;
        color: ${DEEP_BLUE};
        font-weight: 900;
        font-size: 11px;
        box-shadow: 0 12px 24px rgba(1,27,63,.2);
      }
      .primaryButton:hover:not(:disabled) { box-shadow: 0 16px 28px rgba(1,27,63,.28); }
      .primaryButton.small { padding: 10px 14px; }
      .secondaryButton {
        padding: 12px 15px;
        border-radius: 12px;
        background: rgba(255,255,255,.11);
        color: white;
        border: 1px solid rgba(255,255,255,.17);
        font-size: 11px;
        font-weight: 800;
      }
      .secondaryButton:hover:not(:disabled) { background: rgba(255,255,255,.16); }
      .buttonSpinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(11,51,104,.18); border-top-color: ${DEEP_BLUE}; animation: spin .8s linear infinite; }

      .heroArt { position: relative; min-height: 308px; }
      .artGlow { position: absolute; width: 280px; height: 280px; right: 38px; top: 10px; border-radius: 50%; background: rgba(255,255,255,.12); filter: blur(3px); }
      .artRing { position: absolute; border: 1px solid rgba(255,255,255,.18); border-radius: 50%; }
      .ringOne { width: 290px; height: 290px; right: 18px; top: 6px; }
      .ringTwo { width: 220px; height: 220px; right: 54px; top: 42px; }
      .artCard { position: absolute; right: 90px; top: 70px; width: 184px; padding: 22px; border-radius: 22px; background: linear-gradient(145deg, rgba(255,255,255,.22), rgba(255,255,255,.08)); border: 1px solid rgba(255,255,255,.22); box-shadow: 0 20px 60px rgba(1,24,58,.24); transform: rotate(-5deg); backdrop-filter: blur(10px); }
      .artCardLabel { display: block; font-size: 8px; letter-spacing: .18em; font-weight: 900; opacity: .62; }
      .artCard strong { display: block; margin: 22px 0 2px; font-size: 36px; letter-spacing: -.04em; }
      .artCard small { font-size: 10px; color: rgba(255,255,255,.68); }

      .metricsGrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 13px; margin-top: 14px; }
      .metricCard { display: flex; align-items: center; gap: 12px; min-height: 86px; padding: 16px; background: rgba(255,255,255,.86); border: 1px solid #dfe9f4; border-radius: 17px; box-shadow: 0 12px 28px rgba(52,92,129,.06); }
      .metricIcon { width: 39px; height: 39px; border-radius: 12px; display: grid; place-items: center; }
      .metricCard strong { display: block; font-size: 22px; letter-spacing: -.03em; }
      .metricCard span { display: block; margin-top: 2px; color: ${MUTED}; font-size: 9px; font-weight: 800; }
      .metricCard.blue .metricIcon { background: #e8f2ff; color: ${ACCENT_BLUE}; }
      .metricCard.red .metricIcon { background: #fff0f2; color: ${RED}; }
      .metricCard.violet .metricIcon { background: #f1eeff; color: #6353be; }
      .metricCard.green .metricIcon { background: #eaf8f0; color: #18834e; }

      .workspaceGrid { display: grid; grid-template-columns: 1.12fr .88fr; gap: 14px; margin-top: 14px; }
      .currentCodeCard, .quickGuide, .historyCard { background: rgba(255,255,255,.9); border: 1px solid #dfe9f4; border-radius: 20px; box-shadow: 0 15px 34px rgba(52,92,129,.055); }
      .currentCodeCard, .quickGuide { padding: 22px; }
      .sectionHeader, .historyHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
      .sectionKicker { color: #89a0b7; letter-spacing: .16em; font-size: 8px; font-weight: 900; }
      .sectionHeader h3, .historyHeader h3 { margin: 4px 0 0; font-size: 17px; letter-spacing: -.025em; }

      .statusPill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 999px; font-size: 9px; font-weight: 900; white-space: nowrap; }
      .statusPill.active { color: #187044; background: #e9f8ef; }
      .statusPill.used { color: #8b5160; background: #f7edf0; }
      .statusPill.expired { color: #946b32; background: #fff5e3; }
      .statusPill.active .statusDot { background: #25a260; }
      .statusPill.used .statusDot { background: #b37589; }
      .statusPill.expired .statusDot { background: #cc932f; }

      .codeBox { display: flex; align-items: center; gap: 12px; margin-top: 21px; padding: 15px; border-radius: 17px; background: linear-gradient(135deg, #eef6ff 0%, #f7fbff 100%); border: 1px solid #d4e3f3; }
      .codeMonogram { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: linear-gradient(145deg, ${DEEP_BLUE}, ${ACCENT_BLUE}); color: white; font-size: 9px; font-weight: 900; letter-spacing: .08em; flex: 0 0 auto; box-shadow: 0 10px 20px rgba(21,89,166,.18); }
      .codeValue { min-width: 0; flex: 1; font-family: "SFMono-Regular", Consolas, monospace; font-size: clamp(17px, 2vw, 24px); font-weight: 900; letter-spacing: .08em; color: ${DEEP_BLUE}; word-break: break-all; }
      .copyButton { display: inline-flex; align-items: center; gap: 7px; padding: 9px 10px; border-radius: 10px; background: white; color: ${ACCENT_BLUE}; font-size: 10px; font-weight: 900; border: 1px solid #d7e4f1; }
      .codeMeta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 13px; }
      .codeMeta div { display: grid; gap: 4px; padding: 10px 12px; border-radius: 12px; background: #f8fbfe; }
      .codeMeta span { color: #93a6ba; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
      .codeMeta strong { font-size: 10px; color: #4e6074; }
      .usageHint { display: flex; gap: 7px; align-items: flex-start; margin-top: 14px; color: #8191a5; font-size: 9px; line-height: 1.55; }

      .guideBadge { padding: 6px 8px; border-radius: 8px; color: ${ACCENT_BLUE}; background: #edf5ff; font-size: 8px; font-weight: 900; letter-spacing: .1em; }
      .guideSteps { display: grid; gap: 11px; margin-top: 19px; }
      .guideStep { display: grid; grid-template-columns: 44px 1fr; gap: 11px; padding: 12px; border-radius: 14px; background: #f7faff; border: 1px solid #e8eff6; }
      .stepNumber { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; background: white; color: ${ACCENT_BLUE}; border: 1px solid #dce9f6; font-size: 9px; font-weight: 900; }
      .guideStep strong { font-size: 11px; }
      .guideStep p { margin: 3px 0 0; color: ${MUTED}; font-size: 9px; line-height: 1.55; }

      .historyCard { margin-top: 14px; overflow: hidden; }
      .historyHeader { padding: 22px; }
      .refreshButton { display: inline-flex; align-items: center; gap: 7px; padding: 8px 10px; border-radius: 10px; background: #f4f8fc; color: #62788f; font-size: 9px; font-weight: 900; }
      .tableWrap { overflow-x: auto; border-top: 1px solid #e7eef5; }
      table { width: 100%; min-width: 720px; border-collapse: collapse; }
      th, td { padding: 12px 22px; text-align: left; border-bottom: 1px solid #edf2f7; }
      th { color: #8ba0b5; font-size: 8px; letter-spacing: .11em; text-transform: uppercase; font-weight: 900; }
      td { color: #64788d; font-size: 9px; }
      tbody tr:hover { background: #fbfdff; }
      .historyCode { font-family: "SFMono-Regular", Consolas, monospace; color: ${DEEP_BLUE}; font-size: 10px; font-weight: 900; letter-spacing: .06em; }
      .historyCode span { margin-right: 6px; color: ${ACCENT_BLUE}; }
      .tableEmpty { padding: 38px 20px; text-align: center; color: #8da0b3; }

      .emptyCurrent { margin-top: 20px; padding: 30px 10px 8px; text-align: center; }
      .emptyCurrentIcon { width: 46px; height: 46px; margin: 0 auto 10px; display: grid; place-items: center; border-radius: 14px; background: #edf5ff; color: ${ACCENT_BLUE}; font-size: 24px; }
      .emptyCurrent h4 { margin: 0; font-size: 14px; }
      .emptyCurrent p { margin: 7px auto 16px; max-width: 300px; color: ${MUTED}; font-size: 9px; line-height: 1.5; }

      .toast { position: fixed; right: 24px; bottom: 24px; z-index: 60; padding: 11px 14px; border-radius: 12px; color: white; background: rgba(18,38,64,.96); box-shadow: 0 14px 34px rgba(0,0,0,.18); font-size: 10px; font-weight: 800; animation: toastIn .2s ease-out; }

      .mobileMenu { display: none; }
      .mobileBackdrop { display: none; }

      .loadingScreen { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      .loadingCard { width: min(360px, 100%); padding: 30px; text-align: center; border-radius: 22px; background: white; border: 1px solid #e1eaf4; box-shadow: 0 20px 50px rgba(38,77,115,.08); }
      .loadingLogo { width: 52px; height: 52px; margin: 0 auto 15px; display: grid; place-items: center; border-radius: 16px; color: white; background: linear-gradient(145deg, ${DEEP_BLUE}, ${ACCENT_BLUE}); font-size: 11px; font-weight: 900; }
      .loadingCard h1 { margin: 0; font-size: 18px; }
      .loadingCard p { margin: 7px 0 18px; color: ${MUTED}; font-size: 10px; }
      .spinner { width: 25px; height: 25px; margin: 0 auto 16px; border-radius: 50%; border: 3px solid #dce8f4; border-top-color: ${ACCENT_BLUE}; animation: spin .8s linear infinite; }

      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

      @media (max-width: 1120px) {
        .content, .topbar { padding-left: 28px; padding-right: 28px; }
        .sidebar { width: 232px; }
        .heroCard { grid-template-columns: 1fr .55fr; }
        .heroText h2 { font-size: 36px; }
        .artCard { right: 55px; }
      }

      @media (max-width: 900px) {
        .sidebar { position: fixed; left: -270px; transition: left .22s ease; }
        .sidebar.open { left: 0; }
        .mobileBackdrop { display: block; position: fixed; inset: 0; background: rgba(9,27,51,.36); backdrop-filter: blur(2px); z-index: 15; }
        .mobileMenu { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; background: white; color: ${ACCENT_BLUE}; border: 1px solid #dce8f3; }
        .topbar { align-items: center; }
        .topbarBadge { display: none; }
        .metricsGrid { grid-template-columns: repeat(2, 1fr); }
        .workspaceGrid { grid-template-columns: 1fr; }
      }

      @media (max-width: 700px) {
        .topbar { padding: 20px 18px; min-height: 104px; }
        .content { padding: 18px; }
        .topbar h1 { font-size: 25px; }
        .heroCard { grid-template-columns: 1fr; }
        .heroText { padding: 28px 24px 24px; }
        .heroArt { display: none; }
        .heroText h2 { font-size: 34px; }
      }

      @media (max-width: 480px) {
        .content { padding: 14px; }
        .metricsGrid { grid-template-columns: 1fr; }
        .codeBox { align-items: flex-start; flex-wrap: wrap; }
        .codeValue { width: calc(100% - 58px); }
        .copyButton { width: 100%; justify-content: center; }
        .codeMeta { grid-template-columns: 1fr; }
        .historyHeader { padding: 18px; }
        th, td { padding-left: 16px; padding-right: 16px; }
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
      }
    `}</style>
  );
}
