"use client";

import { useLayoutEffect, useState } from "react";

const LOADER_CSS = `
  .crlAppLoader {
    --startup-bg: #fafbfc;
    --startup-text: #1a2b4c;
    --startup-muted: #5c6c82;
    --startup-track: #e0e7ef;
    --startup-fill: #1559a6;
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
    background: var(--startup-bg);
    color: var(--startup-text);
    font-family: Arial, Helvetica, sans-serif;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
  html[data-crl-theme="dark"] .crlAppLoader, .crlAppLoaderDark {
    --startup-bg: #121c2a;
    --startup-text: #edf2f8;
    --startup-muted: #b2c0d1;
    --startup-track: #2c3c52;
    --startup-fill: #7cafe9;
  }
  .crlAppLoaderContent { width: min(320px, 100%); text-align: center; }
  .crlAppLoaderLogo { display: block; width: min(280px, 100%); height: auto; margin: 0 auto; }
  html[data-crl-theme="dark"] .crlAppLoaderLogo, .crlAppLoaderDark .crlAppLoaderLogo { box-sizing: border-box; padding: 14px; border-radius: 12px; background: #f8fbff; }
  .crlAppLoaderTitle { margin: 30px 0 20px; font-size: 18px; line-height: 1.4; font-weight: 600; letter-spacing: -.2px; }
  .crlAppLoaderTrack { height: 5px; overflow: hidden; border-radius: 999px; background: var(--startup-track); }
  .crlAppLoaderFill { width: 100%; height: 100%; border-radius: inherit; background: var(--startup-fill); transform-origin: left; transition: transform 180ms ease-out; }
  .crlAppLoaderIndeterminate { width: 35%; animation: crlStartupTravel 1.2s ease-in-out infinite; }
  .crlAppLoaderMessage { min-height: 42px; margin: 17px 0 0; color: var(--startup-muted); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
  .crlAppLoaderActivity { display: inline-block; width: 5px; height: 5px; margin: 0 8px 2px 0; border-radius: 50%; background: var(--startup-fill); animation: crlStartupPulse 1.2s ease-in-out infinite; }
  @keyframes crlStartupTravel { from { transform: translateX(-100%); } to { transform: translateX(390%); } }
  @keyframes crlStartupPulse { 50% { opacity: .35; } }
  @media (prefers-reduced-motion: reduce) {
    .crlAppLoaderFill { transition: none; }
    .crlAppLoaderIndeterminate, .crlAppLoaderActivity { animation: none; }
  }
`;

// Four startup checks, not elapsed seconds or an estimated network percentage.
// A null count represents navigation whose completion cannot be measured here.
export default function AppLoadingScreen({ completed = 0, message = "Checking your saved sign-in…" }) {
  const [dark, setDark] = useState(false);
  useLayoutEffect(() => {
    try { setDark(localStorage.getItem("crla_theme") === "dark"); } catch {}
  }, []);
  const determinate = Number.isFinite(completed);
  const count = determinate ? Math.max(0, Math.min(4, Math.floor(completed))) : null;
  return (
    <section className={`crlAppLoader${dark ? " crlAppLoaderDark" : ""}`} role="status" aria-live="polite" aria-label="Opening CRL-App">
      <style dangerouslySetInnerHTML={{ __html: LOADER_CSS }} />
      <div className="crlAppLoaderContent">
        <img className="crlAppLoaderLogo" src="/crl-app-logo.png" width="1883" height="755" alt="CRL-App" fetchPriority="high" draggable={false} />
        <h1 className="crlAppLoaderTitle">Preparing your workspace</h1>
        <div className="crlAppLoaderTrack" role="progressbar" aria-label="Startup checks" aria-valuemin={0} aria-valuemax={4} aria-valuenow={count ?? undefined} aria-valuetext={message}>
          <div className={`crlAppLoaderFill${determinate ? "" : " crlAppLoaderIndeterminate"}`} style={determinate ? { transform: `scaleX(${count / 4})` } : undefined} />
        </div>
        <p className="crlAppLoaderMessage"><span className="crlAppLoaderActivity" aria-hidden="true" />{message}</p>
      </div>
    </section>
  );
}
