"use client";

import { useEffect, useMemo, useState } from "react";

const SLIDES = [
  {
    src: "/login-slides/classroom-1.png",
    alt: "Filipino learners working together in a classroom",
  },
  {
    src: "/login-slides/classroom-2.png",
    alt: "Young Filipino learners completing reading activities",
  },
  {
    src: "/login-slides/classroom-3.png",
    alt: "Filipino learners participating in a classroom activity",
  },
];

export default function LearnerDownloadPage() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const isStandalone = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true
    );
  }, [installed]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (SLIDES.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % SLIDES.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverscroll: html.style.overscrollBehaviorY,
      bodyOverscroll: body.style.overscrollBehaviorY,
      bodyOverflow: body.style.overflow,
    };

    html.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";
    body.style.overflow = "hidden";

    return () => {
      html.style.overscrollBehaviorY = previous.htmlOverscroll;
      body.style.overscrollBehaviorY = previous.bodyOverscroll;
      body.style.overflow = previous.bodyOverflow;
    };
  }, []);

  async function handleInstall() {
    if (installEvent) {
      try {
        await installEvent.prompt();
        await installEvent.userChoice;
      } finally {
        setInstallEvent(null);
      }
      return;
    }

    if (isStandalone || installed) return;
    setShowHelp(true);
  }

  return (
    <>
      <style jsx global>{`
        :root {
          --learner-blue-950: #072758;
          --learner-blue-900: #0b3477;
          --learner-blue-800: #1255aa;
          --learner-blue-700: #1768c6;
          --learner-blue-100: #eaf3ff;
          --learner-blue-050: #f5f9ff;
          --learner-red-700: #b51f31;
          --learner-red-600: #c92b3d;
          --learner-red-500: #df4052;
          --learner-ink: #14253d;
          --learner-muted: #6c7b90;
          --learner-white: #ffffff;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          width: 100%;
          min-height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
          background: #edf4fb;
        }

        body {
          font-family:
            Arial,
            Helvetica,
            sans-serif;
          color: var(--learner-ink);
          overscroll-behavior-y: none;
        }

        button {
          font: inherit;
        }

        .download-page {
          position: relative;
          width: 100%;
          height: 100svh;
          min-height: 560px;
          overflow: hidden;
          background:
            radial-gradient(circle at 7% 18%, rgba(23, 104, 198, 0.14), transparent 24%),
            radial-gradient(circle at 94% 82%, rgba(201, 43, 61, 0.11), transparent 20%),
            linear-gradient(135deg, #f7faff 0%, #edf4fb 52%, #f9fbff 100%);
          isolation: isolate;
        }

        .top-accent {
          position: absolute;
          z-index: 20;
          top: 0;
          left: 0;
          right: 0;
          display: flex;
          height: 4px;
        }

        .top-accent-blue {
          flex: 1;
          background: var(--learner-blue-800);
        }

        .top-accent-red {
          width: 28%;
          background: var(--learner-red-600);
        }

        .backdrop {
          position: absolute;
          inset: 0;
          z-index: 0;
          overflow: hidden;
        }

        .slide {
          position: absolute;
          inset: 0;
          background-position: center;
          background-repeat: no-repeat;
          background-size: cover;
          opacity: 0;
          transform: scale(1.035);
          transition: opacity 1.1s ease, transform 6s ease;
        }

        .slide.active {
          opacity: 1;
          transform: scale(1.06);
        }

        .backdrop::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, rgba(247, 250, 255, 0.97) 0%, rgba(247, 250, 255, 0.9) 34%, rgba(247, 250, 255, 0.38) 64%, rgba(7, 39, 88, 0.18) 100%),
            linear-gradient(0deg, rgba(7, 39, 88, 0.1), transparent 32%);
        }

        .shell {
          position: relative;
          z-index: 2;
          width: min(1180px, 100%);
          height: 100%;
          margin: 0 auto;
          padding: clamp(28px, 5vw, 64px);
          display: grid;
          grid-template-columns: minmax(0, 1.12fr) minmax(360px, 0.88fr);
          align-items: center;
          gap: clamp(36px, 7vw, 96px);
        }

        .copy {
          max-width: 590px;
        }

        .brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 24px;
          color: var(--learner-blue-800);
          font-size: clamp(22px, 2.3vw, 30px);
          font-weight: 900;
          letter-spacing: -0.7px;
        }

        .brand-mark {
          position: relative;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--learner-blue-800);
          box-shadow: 18px 0 0 var(--learner-red-600);
        }

        .title {
          margin: 0;
          max-width: 610px;
          font-size: clamp(48px, 7vw, 88px);
          line-height: 0.94;
          letter-spacing: -0.055em;
          font-weight: 900;
          color: var(--learner-blue-950);
        }

        .title span {
          color: var(--learner-red-600);
        }

        .subtitle {
          max-width: 520px;
          margin: 22px 0 0;
          color: var(--learner-muted);
          font-size: clamp(14px, 1.6vw, 18px);
          line-height: 1.55;
        }

        .actions {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-top: 0;
          flex-wrap: wrap;
        }

        .install-zone {
          justify-self: end;
          width: min(430px, 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: clamp(28px, 4vw, 42px);
          border: 1px solid rgba(255, 255, 255, 0.78);
          border-radius: 30px;
          background: rgba(255, 255, 255, 0.5);
          box-shadow: 0 30px 76px rgba(20, 50, 90, 0.16);
          backdrop-filter: blur(16px);
        }

        .install-label {
          margin: 0 0 16px;
          color: var(--learner-blue-900);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .install-button {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 11px;
          width: min(330px, 100%);
          min-height: 64px;
          padding: 15px 24px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.26);
          border-radius: 18px;
          background: linear-gradient(135deg, #0f55aa 0%, #1c73d0 58%, #1762b8 100%);
          color: #fff;
          box-shadow: 0 18px 38px rgba(18, 85, 170, 0.26), inset 0 1px 0 rgba(255,255,255,0.24);
          font-size: 15px;
          font-weight: 900;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
        }

        .install-button::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent 20%, rgba(255,255,255,0.18) 48%, transparent 72%);
          transform: translateX(-120%);
          transition: transform 0.65s ease;
        }

        .install-button:hover {
          transform: translateY(-3px);
          filter: saturate(1.05);
          box-shadow: 0 22px 44px rgba(18, 85, 170, 0.31), inset 0 1px 0 rgba(255,255,255,0.28);
        }

        .install-button:hover::before {
          transform: translateX(120%);
        }

        .install-button:active {
          transform: translateY(-1px);
        }

        .install-button:focus-visible {
          outline: 3px solid rgba(201, 43, 61, 0.3);
          outline-offset: 4px;
        }

        .install-button.installed {
          background: linear-gradient(135deg, #0f6b43, #158552);
          box-shadow: 0 18px 38px rgba(15, 107, 67, 0.2), inset 0 1px 0 rgba(255,255,255,0.2);
          cursor: default;
        }

        .button-icon {
          position: relative;
          z-index: 1;
          display: grid;
          place-items: center;
          width: 30px;
          height: 30px;
          border-radius: 10px;
          background: rgba(255,255,255,0.14);
          font-size: 18px;
          line-height: 1;
        }

        .button-label {
          position: relative;
          z-index: 1;
        }

        .micro-note {
          margin: 12px 0 0;
          color: #7c8ea5;
          font-size: 11px;
          text-align: center;
        }

        .install-helper {
          margin: 16px 0 0;
          max-width: 290px;
          color: #7b8ba0;
          font-size: 11px;
          line-height: 1.55;
          text-align: center;
        }

        .footer {
          position: absolute;
          z-index: 3;
          left: clamp(24px, 4vw, 54px);
          bottom: 18px;
          color: rgba(20, 37, 61, 0.54);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .help-backdrop {
          position: fixed;
          inset: 0;
          z-index: 30;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(7, 39, 88, 0.32);
          backdrop-filter: blur(7px);
        }

        .help-card {
          width: min(410px, 100%);
          padding: 24px;
          border: 1px solid #dfe7f1;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 24px 60px rgba(20, 50, 90, 0.2);
        }

        .help-card h2 {
          margin: 0;
          color: var(--learner-blue-950);
          font-size: 20px;
        }

        .help-card p {
          margin: 10px 0 0;
          color: var(--learner-muted);
          font-size: 13px;
          line-height: 1.6;
        }

        .help-close {
          margin-top: 18px;
          min-height: 44px;
          width: 100%;
          border: 0;
          border-radius: 12px;
          background: var(--learner-blue-100);
          color: var(--learner-blue-900);
          font-weight: 800;
          cursor: pointer;
        }

        @media (max-width: 900px) {
          .shell {
            grid-template-columns: 1fr;
            align-content: center;
            gap: 26px;
            padding: 34px 24px 56px;
          }

          .copy {
            max-width: 680px;
            margin: 0 auto;
            text-align: center;
          }

          .brand {
            justify-content: center;
          }

          .subtitle {
            margin-left: auto;
            margin-right: auto;
          }

          .actions {
            justify-content: center;
          }

          .install-zone {
            width: min(430px, 100%);
            justify-self: center;
          }
        }

        @media (max-width: 560px) {
          .download-page {
            min-height: 100svh;
          }

          .shell {
            gap: 22px;
            padding: 28px 17px 48px;
          }

          .brand {
            margin-bottom: 17px;
            font-size: 23px;
          }

          .title {
            font-size: clamp(43px, 15vw, 66px);
          }

          .subtitle {
            margin-top: 16px;
            font-size: 13px;
          }

          .actions {
            width: 100%;
          }

          .install-zone {
            width: min(350px, 100%);
            padding: 24px 18px 22px;
            border-radius: 24px;
          }

          .install-button {
            width: 100%;
          }

          .footer {
            left: 0;
            right: 0;
            bottom: 10px;
            text-align: center;
            font-size: 8px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>

      <main className="download-page">
        <div className="top-accent">
          <div className="top-accent-blue" />
          <div className="top-accent-red" />
        </div>

        <div className="backdrop" aria-hidden="true">
          {SLIDES.map((slide, index) => (
            <div
              key={slide.src}
              className={`slide ${index === activeSlide ? "active" : ""}`}
              style={{ backgroundImage: `url("${slide.src}")` }}
            />
          ))}
        </div>

        <section className="shell">
          <div className="copy">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true" />
              <span>CRL-App Learner</span>
            </div>

            <h1 className="title">
              Learn.
              <br />
              Read.
              <br />
              <span>Grow.</span>
            </h1>

            <p className="subtitle">
              A focused learner space for classroom reading and literacy assessment.
            </p>
          </div>

          <aside className="install-zone" aria-label="Install CRL-App Learner">
            <p className="install-label">Learner App</p>
            <div className="actions">
              <button
                type="button"
                className={`install-button ${installed || isStandalone ? "installed" : ""}`}
                onClick={handleInstall}
                disabled={installed || isStandalone}
                aria-label={installed || isStandalone ? "CRL-App Learner is installed" : "Install CRL-App Learner"}
              >
                <span className="button-icon" aria-hidden="true">
                  {installed || isStandalone ? "✓" : "⇩"}
                </span>
                <span className="button-label">
                  {installed || isStandalone ? "App Installed" : "Install App"}
                </span>
              </button>
            </div>
            <p className="micro-note">Free • Phone, tablet, or PC</p>
            <p className="install-helper">Install once, then open the app directly from your device.</p>
          </aside>
        </section>

        <div className="footer">Comprehensive Rapid Literacy Assessment</div>
      </main>

      {showHelp ? (
        <div className="help-backdrop" role="presentation" onClick={() => setShowHelp(false)}>
          <section className="help-card" role="dialog" aria-modal="true" aria-labelledby="install-help-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="install-help-title">Install CRL-App Learner</h2>
            <p>
              Use your browser&apos;s menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
            </p>
            <button type="button" className="help-close" onClick={() => setShowHelp(false)}>
              Got it
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
