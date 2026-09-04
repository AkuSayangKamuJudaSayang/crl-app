"use client";

import { useEffect, useState } from "react";

const SLIDES = [
  "/login-slides/classroom-1.png",
  "/login-slides/classroom-2.png",
  "/login-slides/classroom-3.png",
];

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true
  );
}

export default function LearnerDownloadPage() {
  const [slide, setSlide] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/learner-pwa-sw.js", { scope: "/learner" })
        .catch(() => undefined);
    }

    // The child layout provides the learner manifest server-side. Do not replace
    // it after hydration because beforeinstallprompt is evaluated by the browser
    // before this effect is guaranteed to run.
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setInstalling(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (isStandaloneMode()) setInstalled(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlide((value) => (value + 1) % SLIDES.length);
    }, 5200);

    return () => window.clearInterval(timer);
  }, []);

  async function installApp() {
    if (installed || installing) return;

    if (!deferredPrompt) {
      // Some browsers expose installation only through their own UI and do not
      // provide beforeinstallprompt. We intentionally do not show instructions
      // or an overlay here.
      return;
    }

    setInstalling(true);

    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
      setInstalling(false);
    }
  }

  return (
    <main className="download-page">
      <style jsx global>{`
        :root {
          --blue-950: #062653;
          --blue-900: #0a377c;
          --blue-800: #1257aa;
          --blue-700: #1b70ca;
          --red-600: #cf2e40;
          --ink: #15283f;
          --muted: #6f7e91;
        }

        * { box-sizing: border-box; }
        html, body { margin: 0; min-height: 100%; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          color: var(--ink);
          background: #eef4fb;
        }
        button { font: inherit; }

        .download-page {
          position: relative;
          min-height: 100svh;
          overflow-x: hidden;
          overflow-y: auto;
          display: grid;
          place-items: center;
          padding: clamp(24px, 5vw, 72px);
          isolation: isolate;
        }

        .download-page::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -4;
          background:
            radial-gradient(circle at 78% 18%, rgba(27,112,202,.16), transparent 32%),
            radial-gradient(circle at 24% 76%, rgba(207,46,64,.08), transparent 30%),
            linear-gradient(135deg, #edf4ff 0%, #f9fbff 50%, #fceff2 100%);
        }

        .backdrop {
          position: absolute;
          inset: 0;
          z-index: -3;
          overflow: hidden;
        }

        .slide {
          position: absolute;
          inset: -2%;
          background-position: center;
          background-size: cover;
          opacity: 0;
          transform: scale(1.03);
          filter: saturate(.88) contrast(.96);
          transition: opacity 1.1s ease, transform 5.8s ease;
        }

        .slide.active {
          opacity: .24;
          transform: scale(1.08);
        }

        .backdrop::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 32% 42%, rgba(255,255,255,.96) 0 18%, rgba(255,255,255,.72) 38%, rgba(255,255,255,.20) 68%, rgba(255,255,255,.06) 100%),
            linear-gradient(90deg, rgba(247,250,255,.94), rgba(247,250,255,.52) 55%, rgba(247,250,255,.24));
        }

        .accent {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          display: flex;
          z-index: 10;
        }
        .accent-blue { flex: 1; background: var(--blue-800); }
        .accent-red { width: 18%; background: var(--red-600); }

        .download-content {
          position: relative;
          width: min(1220px, 100%);
          min-height: min(700px, calc(100svh - 90px));
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(330px, 430px);
          align-items: center;
          gap: clamp(46px, 7vw, 110px);
        }

        .hero-copy {
          max-width: 720px;
          padding-inline: clamp(6px, 2vw, 20px);
        }

        .brand-row {
          display: flex;
          align-items: center;
          gap: 18px;
          margin-bottom: 32px;
        }

        .logo-highlight {
          display: grid;
          place-items: center;
          width: clamp(74px, 7vw, 102px);
          height: clamp(74px, 7vw, 102px);
          flex: 0 0 auto;
          border-radius: 24px;
          background: rgba(255,255,255,.82);
          box-shadow:
            0 20px 42px rgba(22,65,112,.16),
            0 0 0 1px rgba(255,255,255,.92),
            inset 0 1px 0 rgba(255,255,255,.95);
          backdrop-filter: blur(10px);
        }

        .logo-highlight img {
          width: 82%;
          height: 82%;
          object-fit: contain;
          display: block;
        }

        .brand-name {
          color: var(--blue-800);
          font-size: clamp(22px, 2.5vw, 31px);
          line-height: 1;
          letter-spacing: -.05em;
          font-weight: 900;
        }

        .eyebrow {
          margin: 0 0 16px;
          color: var(--blue-800);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .title {
          margin: 0;
          max-width: 720px;
          color: var(--blue-950);
          font-size: clamp(62px, 8.5vw, 116px);
          line-height: .9;
          letter-spacing: -.075em;
          font-weight: 900;
        }

        .title span { color: var(--red-600); }

        .subtitle {
          max-width: 600px;
          margin: 28px 0 0;
          color: #5e7189;
          font-size: clamp(16px, 1.5vw, 19px);
          line-height: 1.55;
        }

        .install-area {
          justify-self: end;
          width: min(420px, 100%);
          display: grid;
          gap: 16px;
        }

        .install-label {
          color: var(--blue-950);
          font-size: clamp(24px, 2.8vw, 34px);
          font-weight: 900;
          letter-spacing: -.045em;
        }

        .install-meta {
          color: var(--muted);
          font-size: 14px;
          line-height: 1.5;
          margin-top: -7px;
        }

        .install-button {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 68px;
          padding: 0 28px;
          border: 0;
          border-radius: 20px;
          overflow: hidden;
          color: #fff;
          background: linear-gradient(135deg, #0b4c99 0%, #176bc1 55%, #287ed3 100%);
          box-shadow:
            0 20px 42px rgba(18,85,170,.27),
            inset 0 1px 0 rgba(255,255,255,.26),
            inset 0 -1px 0 rgba(0,0,0,.08);
          cursor: pointer;
          font-size: 17px;
          font-weight: 900;
          transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
        }

        .install-button::before {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          left: -36%;
          width: 24%;
          transform: skewX(-18deg);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.40), transparent);
          transition: left .6s ease;
        }

        .install-button:hover {
          transform: translateY(-3px);
          filter: brightness(1.05);
          box-shadow:
            0 26px 52px rgba(18,85,170,.32),
            inset 0 1px 0 rgba(255,255,255,.30);
        }

        .install-button:hover::before { left: 120%; }
        .install-button:active { transform: translateY(-1px); }
        .install-button:focus-visible {
          outline: 3px solid rgba(207,46,64,.32);
          outline-offset: 5px;
        }

        .install-button:disabled {
          cursor: default;
        }

        .install-button.installed {
          background: linear-gradient(135deg, #147146, #19945b);
          box-shadow: 0 18px 40px rgba(20,113,70,.22);
        }

        .button-icon {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          margin-right: 12px;
          border-radius: 12px;
          background: rgba(255,255,255,.16);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.18);
          font-size: 20px;
        }

        .device-note {
          color: #8291a3;
          font-size: 11px;
          text-align: center;
        }

        @media (max-width: 900px) {
          .download-page { padding: 28px 20px 44px; }
          .download-content {
            min-height: calc(100svh - 70px);
            grid-template-columns: 1fr;
            align-content: center;
            gap: 48px;
          }
          .hero-copy { margin: 0 auto; text-align: center; }
          .brand-row { justify-content: center; }
          .subtitle { margin-inline: auto; }
          .install-area { justify-self: center; width: min(520px, 100%); text-align: center; }
        }

        @media (max-width: 560px) {
          .download-page { padding: 22px 16px 34px; }
          .download-content { gap: 36px; }
          .brand-row { gap: 13px; margin-bottom: 23px; }
          .logo-highlight {
            width: 66px;
            height: 66px;
            border-radius: 19px;
          }
          .brand-name { font-size: 22px; }
          .eyebrow { font-size: 9px; }
          .title { font-size: clamp(50px, 17vw, 76px); }
          .subtitle { font-size: 14px; margin-top: 20px; }
          .install-area { gap: 13px; }
          .install-label { font-size: 25px; }
          .install-meta { font-size: 12px; }
          .install-button { min-height: 62px; border-radius: 18px; font-size: 16px; }
          .device-note { font-size: 10px; }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .01ms !important;
          }
        }
      `}</style>

      <div className="accent" aria-hidden="true">
        <div className="accent-blue" />
        <div className="accent-red" />
      </div>

      <div className="backdrop" aria-hidden="true">
        {SLIDES.map((src, index) => (
          <div
            key={src}
            className={`slide ${index === slide ? "active" : ""}`}
            style={{ backgroundImage: `url("${src}")` }}
          />
        ))}
      </div>

      <section className="download-content">
        <div className="hero-copy">
          <div className="brand-row">
            <div className="logo-highlight">
              <img src="/crl-app-logo.png" alt="CRL-App" />
            </div>
            <div className="brand-name">CRL-App Learner</div>
          </div>

          <p className="eyebrow">Reading assessment. Made clear.</p>
          <h1 className="title">
            Learn.
            <br />
            Read.
            <br />
            <span>Grow.</span>
          </h1>
          <p className="subtitle">Install the learner app on this device.</p>
        </div>

        <aside className="install-area" aria-label="Install CRL-App Learner">
          <div className="install-label">CRL-App Learner</div>
          <div className="install-meta">Your classroom assessment app.</div>

          <button
            type="button"
            className={`install-button ${installed ? "installed" : ""}`}
            onClick={installApp}
            disabled={installed || installing}
          >
            <span className="button-icon" aria-hidden="true">
              {installed ? "✓" : installing ? "…" : "⇩"}
            </span>
            {installed ? "App Installed" : installing ? "Installing…" : "Install App"}
          </button>

          <span className="device-note">Phone • tablet • PC</span>
        </aside>
      </section>
    </main>
  );
}
