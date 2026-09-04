"use client";

import { useEffect, useState } from "react";

const SLIDES = [
  "/login-slides/classroom-1.png",
  "/login-slides/classroom-2.png",
  "/login-slides/classroom-3.png",
];

const INSTALL_MANIFEST = "/learner/download/manifest.webmanifest?v=20260904-1";

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
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    // This route intentionally replaces any inherited/root manifest link.
    // The install prompt opened from this page must resolve to the learner manifest.
    const existing = Array.from(document.querySelectorAll('link[rel="manifest"]'));
    existing.forEach((link) => link.remove());

    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = INSTALL_MANIFEST;
    document.head.appendChild(link);

    return () => {
      if (link.parentNode) link.parentNode.removeChild(link);
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowFallback(false);
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
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function installApp() {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } finally {
        setDeferredPrompt(null);
      }
      return;
    }

    if (!isStandaloneMode()) {
      setShowFallback(true);
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
          overflow: hidden;
          display: grid;
          place-items: center;
          padding: clamp(22px, 4vw, 52px);
          isolation: isolate;
        }

        .download-page::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -3;
          background: linear-gradient(135deg, #edf4ff 0%, #f7fbff 45%, #fceff2 100%);
        }

        .backdrop {
          position: absolute;
          inset: 0;
          z-index: -2;
          overflow: hidden;
          opacity: .42;
        }

        .slide {
          position: absolute;
          inset: -3%;
          background-position: center;
          background-size: cover;
          opacity: 0;
          transform: scale(1.04);
          transition: opacity 1s ease, transform 5.5s ease;
        }

        .slide.active {
          opacity: 1;
          transform: scale(1.08);
        }

        .backdrop::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 18% 50%, rgba(255,255,255,.95) 0 16%, rgba(255,255,255,.60) 34%, rgba(255,255,255,.05) 65%),
            linear-gradient(90deg, rgba(247,250,255,.96) 0%, rgba(247,250,255,.84) 42%, rgba(247,250,255,.40) 78%, rgba(247,250,255,.16) 100%),
            linear-gradient(0deg, rgba(6,38,83,.14), transparent 38%);
        }

        .accent {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          display: flex;
          z-index: 4;
        }
        .accent-blue { flex: 1; background: var(--blue-800); }
        .accent-red { width: 20%; background: var(--red-600); }

        .shell {
          position: relative;
          width: min(1120px, 100%);
          min-height: min(700px, calc(100svh - 64px));
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(330px, .72fr);
          align-items: center;
          gap: clamp(38px, 7vw, 96px);
          padding: clamp(28px, 5vw, 64px);
          border-radius: 34px;
          background: rgba(255,255,255,.68);
          border: 1px solid rgba(255,255,255,.82);
          box-shadow: 0 28px 90px rgba(28,60,100,.16), inset 0 1px 0 rgba(255,255,255,.7);
          backdrop-filter: blur(16px);
          overflow: hidden;
        }

        .shell::after {
          content: "";
          position: absolute;
          width: 330px;
          height: 330px;
          right: -160px;
          top: -170px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(27,112,202,.15), transparent 68%);
          pointer-events: none;
        }

        .copy { max-width: 600px; }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--blue-800);
          font-weight: 900;
          font-size: clamp(22px, 2.3vw, 30px);
          letter-spacing: -.04em;
          margin-bottom: 30px;
        }

        .brand-mark {
          position: relative;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--blue-800);
          box-shadow: 16px 0 0 var(--red-600);
        }

        .eyebrow {
          margin: 0 0 12px;
          color: var(--blue-800);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .title {
          margin: 0;
          max-width: 610px;
          color: var(--blue-950);
          font-size: clamp(54px, 7.3vw, 92px);
          line-height: .92;
          letter-spacing: -.065em;
          font-weight: 900;
        }

        .title span { color: var(--red-600); }

        .subtitle {
          max-width: 520px;
          margin: 22px 0 0;
          color: #63738a;
          font-size: clamp(15px, 1.55vw, 18px);
          line-height: 1.55;
        }

        .install-card {
          width: min(390px, 100%);
          justify-self: end;
          padding: 30px;
          border-radius: 26px;
          background: rgba(255,255,255,.88);
          border: 1px solid rgba(255,255,255,.92);
          box-shadow: 0 22px 58px rgba(20,52,93,.16);
        }

        .install-card-title {
          margin: 0;
          color: var(--blue-950);
          font-size: 24px;
          font-weight: 900;
          letter-spacing: -.04em;
        }

        .install-card-note {
          margin: 8px 0 22px;
          color: var(--muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .install-button {
          position: relative;
          width: 100%;
          min-height: 62px;
          border: 0;
          border-radius: 17px;
          overflow: hidden;
          color: white;
          background: linear-gradient(135deg, #0f58ac 0%, #176ec8 58%, #227dd8 100%);
          box-shadow: 0 16px 34px rgba(18,85,170,.28), inset 0 1px 0 rgba(255,255,255,.28);
          cursor: pointer;
          font-size: 16px;
          font-weight: 900;
          transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
        }

        .install-button::before {
          content: "";
          position: absolute;
          inset: 0 auto 0 -45%;
          width: 30%;
          transform: skewX(-18deg);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.30), transparent);
          transition: left .55s ease;
        }

        .install-button:hover {
          transform: translateY(-2px);
          filter: brightness(1.04);
          box-shadow: 0 22px 44px rgba(18,85,170,.34), inset 0 1px 0 rgba(255,255,255,.30);
        }
        .install-button:hover::before { left: 120%; }
        .install-button:active { transform: translateY(0); }
        .install-button:focus-visible { outline: 3px solid rgba(207,46,64,.30); outline-offset: 4px; }

        .install-button.installed {
          background: linear-gradient(135deg, #147146, #19945b);
          box-shadow: 0 16px 34px rgba(20,113,70,.20);
          cursor: default;
        }

        .install-icon {
          display: inline-grid;
          place-items: center;
          width: 30px;
          height: 30px;
          margin-right: 10px;
          border-radius: 9px;
          background: rgba(255,255,255,.16);
          font-size: 18px;
        }

        .fallback {
          margin-top: 14px;
          padding: 11px 12px;
          border-radius: 12px;
          background: #f1f6fc;
          color: #58708c;
          font-size: 11px;
          line-height: 1.45;
        }

        .device-note {
          display: block;
          margin-top: 12px;
          color: #8795a8;
          text-align: center;
          font-size: 10px;
        }

        .copyright {
          position: absolute;
          bottom: 16px;
          left: clamp(22px, 4vw, 54px);
          color: rgba(21,40,63,.48);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .09em;
          text-transform: uppercase;
        }

        @media (max-width: 900px) {
          .download-page { padding: 18px; }
          .shell {
            min-height: calc(100svh - 36px);
            grid-template-columns: 1fr;
            align-content: center;
            gap: 28px;
            padding: 30px 22px 56px;
          }
          .copy { text-align: center; margin: 0 auto; }
          .brand { justify-content: center; }
          .subtitle { margin-inline: auto; }
          .install-card { justify-self: center; }
          .copyright { left: 0; right: 0; text-align: center; }
        }

        @media (max-width: 560px) {
          .download-page { padding: 0; }
          .shell {
            min-height: 100svh;
            border-radius: 0;
            border-left: 0;
            border-right: 0;
            padding: 28px 18px 46px;
            background: rgba(255,255,255,.73);
          }
          .brand { font-size: 21px; margin-bottom: 21px; }
          .eyebrow { font-size: 10px; }
          .title { font-size: clamp(48px, 17vw, 70px); }
          .subtitle { font-size: 13px; }
          .install-card { padding: 22px; border-radius: 21px; }
          .install-card-title { font-size: 20px; }
          .install-button { min-height: 58px; }
          .copyright { bottom: 10px; font-size: 8px; }
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

      <section className="shell">
        <div className="copy">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span>CRL-App Learner</span>
          </div>

          <p className="eyebrow">Reading assessment. Made clear.</p>
          <h1 className="title">
            Learn.
            <br />
            Read.
            <br />
            <span>Grow.</span>
          </h1>
          <p className="subtitle">
            Install the learner app on this device.
          </p>
        </div>

        <aside className="install-card" aria-label="Install CRL-App Learner">
          <h2 className="install-card-title">CRL-App Learner</h2>
          <p className="install-card-note">Your classroom assessment app.</p>

          <button
            type="button"
            className={`install-button ${installed ? "installed" : ""}`}
            onClick={installApp}
            disabled={installed}
          >
            <span className="install-icon" aria-hidden="true">
              {installed ? "✓" : "⇩"}
            </span>
            {installed ? "App Installed" : "Install App"}
          </button>

          {showFallback && !installed ? (
            <div className="fallback">
              Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
            </div>
          ) : null}

          <span className="device-note">Phone • tablet • PC</span>
        </aside>
      </section>

      <div className="copyright">Comprehensive Rapid Literacy Assessment</div>
    </main>
  );
}
