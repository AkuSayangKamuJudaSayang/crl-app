"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const ACCENT_BLUE = "#3a5a7d";
const DEEP_BLUE = "#2c4563";
const LIGHT_BLUE = "#e9eef4";
const RED = "#9c4a5b";
const TEXT = "#1f2937";
const MUTED = "#64748b";

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
        router.replace("/admin/login");
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
        router.replace("/admin/login");
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
      router.replace("/admin/login");
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
                      <><Icon size={18}><path d="M12 5v14" /><path d="M5 12h14" /></Icon> Generate</>
                    )}
                  </button>
                  <button
                    type="button"
                    className="secondaryButton"
                    disabled={Boolean(actionLoading)}
                    onClick={() => runCodeAction("reset_code")}
                  >
                    {actionLoading === "reset_code" ? "Resetting..." : "Reset"}
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
                      Generate
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
        font-family: "Outfit", Arial, Helvetica, sans-serif;
        color: ${TEXT};
        background: #ffffff;
      }

      button, input { font: inherit; }
      button { border: 0; }

      .adminShell {
        min-height: 100vh;
        display: flex;
        background: #ffffff;
      }

      .sidebar {
        width: 260px;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        padding: 25px 18px 18px;
        background: #ffffff;
        color: #1f2937;
        position: sticky;
        top: 0;
        height: 100vh;
        z-index: 20;
        border-right: 1px solid #e5e8ed;
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
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: ${DEEP_BLUE};
        color: #ffffff;
        border: 0;
      }

      .brandMarkInner {
        font-weight: 900;
        font-size: 13px;
        letter-spacing: .06em;
      }

      .brandTitle { font-weight: 900; font-size: 17px; color: #1f2937; }
      .brandSubtitle { margin-top: 2px; color: #64748b; font-size: 11px; }

      .sidebarLabel {
        color: #94a3b8;
        letter-spacing: .16em;
        font-weight: 800;
        font-size: 9px;
        padding: 0 12px 10px;
      }

      .sideNav {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .navItem {
        width: 100%;
        min-height: 94px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        padding: 13px;
        border: 1px solid #e5e8ed;
        border-radius: 14px;
        background: #ffffff;
        color: #475569;
        font-size: 11.5px;
        font-weight: 700;
        line-height: 1.3;
        text-align: left;
        cursor: default;
        transition: border-color 150ms ease, color 150ms ease, background 150ms ease;
      }

      .navItem.activeSub {
        color: #ffffff;
        background: ${DEEP_BLUE};
        border-color: ${DEEP_BLUE};
      }

      .sidebarBottom { margin-top: auto; display: grid; gap: 12px; }
      .adminIdentity {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        border-radius: 14px;
        background: #ffffff;
        border: 1px solid #e5e8ed;
      }

      .avatar {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        background: ${DEEP_BLUE};
        color: #ffffff;
        font-weight: 900;
        flex: 0 0 auto;
      }

      .adminIdentityText { min-width: 0; display: grid; gap: 2px; }
      .adminIdentityText strong { color: #1f2937; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .adminIdentityText span { color: #64748b; font-size: 10px; }

      .logoutButton {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 11px 12px;
        border-radius: 10px;
        background: transparent;
        color: #64748b;
        cursor: pointer;
        transition: background 150ms ease, color 150ms ease;
      }
      .logoutButton:hover { color: ${RED}; background: #f4e9ec; }

      .mainArea { min-width: 0; flex: 1; }

      .topbar {
        min-height: 116px;
        padding: 32px 46px 24px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 20px;
        border-bottom: 1px solid #e5e8ed;
        background: #ffffff;
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
      .topbar h1 { margin: 6px 0 4px; font-size: 26px; line-height: 1; letter-spacing: -.03em; font-weight: 900; }
      .topbar p { margin: 0; color: ${MUTED}; font-size: 12px; }

      .topbarBadge {
        margin-top: 2px;
        padding: 8px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        background: #ffffff;
        color: #475569;
        font-size: 10px;
        font-weight: 800;
        border: 1px solid #e5e8ed;
        white-space: nowrap;
      }
      .onlineDot, .statusDot { width: 7px; height: 7px; border-radius: 50%; background: #3f7d5f; display: inline-block; }

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
      .errorAlert { background: #f4e9ec; color: #7a3746; border: 1px solid #e8d4da; }
      .alertIcon { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: #e8d4da; font-weight: 900; flex: 0 0 auto; }
      .alert button { margin-left: auto; background: transparent; color: inherit; font-size: 18px; cursor: pointer; }

      .heroCard {
        overflow: hidden;
        min-height: 264px;
        border-radius: 16px;
        background: ${DEEP_BLUE};
        color: white;
        position: relative;
        display: grid;
        grid-template-columns: 1.2fr .8fr;
      }

      .heroText { padding: 30px 34px; position: relative; z-index: 2; }
      .heroKicker { display: flex; align-items: center; gap: 10px; font-size: 9px; letter-spacing: .13em; font-weight: 900; opacity: .82; text-transform: uppercase; }
      .heroDivider { width: 30px; height: 1px; background: rgba(255,255,255,.35); }
      .heroText h2 { margin: 20px 0 12px; font-size: 34px; line-height: 1.02; letter-spacing: -.04em; font-weight: 900; }
      .heroText h2 span { color: #dde5ee; }
      .heroText p { max-width: 540px; margin: 0; line-height: 1.65; color: rgba(255,255,255,.74); font-size: 12px; }
      .heroActions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 21px; }

      .primaryButton, .secondaryButton, .refreshButton, .copyButton {
        cursor: pointer;
        transition: transform 150ms ease, background 150ms ease, border-color 150ms ease, opacity 150ms ease;
      }
      .primaryButton:hover:not(:disabled), .secondaryButton:hover:not(:disabled), .refreshButton:hover:not(:disabled), .copyButton:hover:not(:disabled) { transform: translateY(-1px); }
      .primaryButton:active:not(:disabled), .secondaryButton:active:not(:disabled), .refreshButton:active:not(:disabled), .copyButton:active:not(:disabled) { transform: scale(.97); }
      .primaryButton:disabled, .secondaryButton:disabled, .copyButton:disabled { opacity: .55; cursor: not-allowed; }

      .primaryButton {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 15px;
        border-radius: 10px;
        background: #ffffff;
        color: ${DEEP_BLUE};
        font-weight: 800;
        font-size: 11px;
        border: 1px solid #ffffff;
      }
      .primaryButton:hover:not(:disabled) { background: #e9eef4; border-color: #e9eef4; }
      .primaryButton.small { padding: 10px 14px; }
      .secondaryButton {
        padding: 12px 15px;
        border-radius: 10px;
        background: transparent;
        color: #ffffff;
        border: 1px solid rgba(255,255,255,.28);
        font-size: 11px;
        font-weight: 800;
      }
      .secondaryButton:hover:not(:disabled) { background: rgba(255,255,255,.12); }
      .buttonSpinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(11,51,104,.18); border-top-color: ${DEEP_BLUE}; animation: spin .8s linear infinite; }

      .heroArt { position: relative; min-height: 308px; }
      .artGlow { position: absolute; width: 280px; height: 280px; right: 38px; top: 10px; border-radius: 50%; background: rgba(255,255,255,.12); filter: blur(3px); }
      .artRing { position: absolute; border: 1px solid rgba(255,255,255,.18); border-radius: 50%; }
      .ringOne { width: 290px; height: 290px; right: 18px; top: 6px; }
      .ringTwo { width: 220px; height: 220px; right: 54px; top: 42px; }
      .artCard { position: absolute; right: 90px; top: 70px; width: 184px; padding: 22px; border-radius: 14px; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.22); transform: rotate(-5deg); }
      .artCardLabel { display: block; font-size: 8px; letter-spacing: .18em; font-weight: 900; opacity: .62; }
      .artCard strong { display: block; margin: 22px 0 2px; font-size: 36px; letter-spacing: -.04em; }
      .artCard small { font-size: 10px; color: rgba(255,255,255,.68); }

      .metricsGrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 13px; margin-top: 14px; }
      .metricCard { display: flex; align-items: center; gap: 12px; min-height: 86px; padding: 16px; background: #ffffff; border: 1px solid #e5e8ed; border-radius: 14px; transition: border-color 150ms ease; }
      .metricCard:hover { border-color: #d8dde3; }
      .metricIcon { width: 39px; height: 39px; border-radius: 10px; display: grid; place-items: center; }
      .metricCard strong { display: block; font-size: 22px; letter-spacing: -.03em; }
      .metricCard span { display: block; margin-top: 2px; color: ${MUTED}; font-size: 9px; font-weight: 800; }
      .metricCard.blue .metricIcon { background: #e9eef4; color: ${ACCENT_BLUE}; }
      .metricCard.red .metricIcon { background: #f4e9ec; color: ${RED}; }
      .metricCard.violet .metricIcon { background: #eef2f7; color: #465362; }
      .metricCard.green .metricIcon { background: #e7f0ea; color: #3f7d5f; }

      .workspaceGrid { display: grid; grid-template-columns: 1.12fr .88fr; gap: 14px; margin-top: 14px; }
      .currentCodeCard, .quickGuide, .historyCard { background: #ffffff; border: 1px solid #e5e8ed; border-radius: 14px; }
      .currentCodeCard, .quickGuide { padding: 22px; }
      .sectionHeader, .historyHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
      .sectionKicker { color: #94a3b8; letter-spacing: .16em; font-size: 8px; font-weight: 900; }
      .sectionHeader h3, .historyHeader h3 { margin: 4px 0 0; font-size: 17px; letter-spacing: -.025em; }

      .statusPill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 999px; font-size: 9px; font-weight: 900; white-space: nowrap; }
      .statusPill.active { color: #2f6149; background: #e7f0ea; }
      .statusPill.used { color: #7a3746; background: #f4e9ec; }
      .statusPill.expired { color: #7d5f2e; background: #f3ede0; }
      .statusPill.active .statusDot { background: #3f7d5f; }
      .statusPill.used .statusDot { background: #9c4a5b; }
      .statusPill.expired .statusDot { background: #a07b3f; }

      .codeBox { display: flex; align-items: center; gap: 12px; margin-top: 21px; padding: 15px; border-radius: 14px; background: #ffffff; border: 1px solid #e5e8ed; }
      .codeMonogram { width: 46px; height: 46px; border-radius: 12px; display: grid; place-items: center; background: ${DEEP_BLUE}; color: white; font-size: 9px; font-weight: 900; letter-spacing: .08em; flex: 0 0 auto; }
      .codeValue { min-width: 0; flex: 1; font-family: "SFMono-Regular", Consolas, monospace; font-size: clamp(17px, 2vw, 24px); font-weight: 900; letter-spacing: .08em; color: ${DEEP_BLUE}; word-break: break-all; }
      .copyButton { display: inline-flex; align-items: center; gap: 7px; padding: 9px 10px; border-radius: 10px; background: white; color: ${ACCENT_BLUE}; font-size: 10px; font-weight: 900; border: 1px solid #e5e8ed; }
      .codeMeta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 13px; }
      .codeMeta div { display: grid; gap: 4px; padding: 10px 12px; border-radius: 12px; background: #ffffff; border: 1px solid #e5e8ed; }
      .codeMeta span { color: #94a3b8; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
      .codeMeta strong { font-size: 10px; color: #24303d; }
      .usageHint { display: flex; gap: 7px; align-items: flex-start; margin-top: 14px; color: #64748b; font-size: 9px; line-height: 1.55; }

      .guideBadge { padding: 6px 8px; border-radius: 8px; color: ${ACCENT_BLUE}; background: #e9eef4; font-size: 8px; font-weight: 900; letter-spacing: .1em; }
      .guideSteps { display: grid; gap: 11px; margin-top: 19px; }
      .guideStep { display: grid; grid-template-columns: 44px 1fr; gap: 11px; padding: 12px; border-radius: 14px; background: #ffffff; border: 1px solid #e5e8ed; }
      .stepNumber { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; background: white; color: ${ACCENT_BLUE}; border: 1px solid #e5e8ed; font-size: 9px; font-weight: 900; }
      .guideStep strong { font-size: 11px; }
      .guideStep p { margin: 3px 0 0; color: ${MUTED}; font-size: 9px; line-height: 1.55; }

      .historyCard { margin-top: 14px; overflow: hidden; }
      .historyHeader { padding: 22px; }
      .refreshButton { display: inline-flex; align-items: center; gap: 7px; padding: 8px 10px; border-radius: 10px; background: #ffffff; border: 1px solid #e5e8ed; color: #475569; font-size: 9px; font-weight: 900; }
      .tableWrap { overflow-x: auto; border-top: 1px solid #e5e8ed; }
      table { width: 100%; min-width: 720px; border-collapse: collapse; }
      th, td { padding: 12px 22px; text-align: left; border-bottom: 1px solid #e5e8ed; }
      th { color: #94a3b8; font-size: 8px; letter-spacing: .11em; text-transform: uppercase; font-weight: 900; }
      td { color: #475569; font-size: 9px; }
      tbody tr:hover { background: #f8fafc; }
      .historyCode { font-family: "SFMono-Regular", Consolas, monospace; color: ${DEEP_BLUE}; font-size: 10px; font-weight: 900; letter-spacing: .06em; }
      .historyCode span { margin-right: 6px; color: ${ACCENT_BLUE}; }
      .tableEmpty { padding: 38px 20px; text-align: center; color: #94a3b8; }

      .emptyCurrent { margin-top: 20px; padding: 30px 10px 8px; text-align: center; }
      .emptyCurrentIcon { width: 46px; height: 46px; margin: 0 auto 10px; display: grid; place-items: center; border-radius: 14px; background: #e9eef4; color: ${ACCENT_BLUE}; font-size: 24px; }
      .emptyCurrent h4 { margin: 0; font-size: 14px; }
      .emptyCurrent p { margin: 7px auto 16px; max-width: 300px; color: ${MUTED}; font-size: 9px; line-height: 1.5; }

      .toast { position: fixed; right: 24px; bottom: 24px; z-index: 60; padding: 11px 14px; border-radius: 10px; color: white; background: #1f2937; box-shadow: none; font-size: 10px; font-weight: 800; animation: toastIn .2s ease-out; }

      .mobileMenu { display: none; }
      .mobileBackdrop { display: none; }

      .loadingScreen { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      .loadingCard { width: min(360px, 100%); padding: 30px; text-align: center; border-radius: 14px; background: white; border: 1px solid #e5e8ed; }
      .loadingLogo { width: 52px; height: 52px; margin: 0 auto 15px; display: grid; place-items: center; border-radius: 14px; color: white; background: ${DEEP_BLUE}; font-size: 11px; font-weight: 900; }
      .loadingCard h1 { margin: 0; font-size: 18px; }
      .loadingCard p { margin: 7px 0 18px; color: ${MUTED}; font-size: 10px; }
      .spinner { width: 25px; height: 25px; margin: 0 auto 16px; border-radius: 50%; border: 3px solid #e5e8ed; border-top-color: ${ACCENT_BLUE}; animation: spin .8s linear infinite; }

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
        .mobileMenu { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; background: white; color: ${ACCENT_BLUE}; border: 1px solid #e5e8ed; }
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
