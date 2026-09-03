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

        .kicker {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 10px;
          color: var(--learner-red-600);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .kicker-line {
          width: 28px;
          height: 3px;
          border-radius: 999px;
          background: var(--learner-red-600);
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
          max-width: 470px;
          margin: 22px 0 0;
          color: var(--learner-muted);
          font-size: clamp(14px, 1.6vw, 18px);
          line-height: 1.55;
        }

        .actions {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 30px;
          flex-wrap: wrap;
        }

        .install-button {
          position: relative;
          min-width: 205px;
          min-height: 54px;
          padding: 14px 20px;
          border: 0;
          border-radius: 15px;
          background: linear-gradient(135deg, var(--learner-blue-800), var(--learner-blue-700));
          color: #fff;
          box-shadow: 0 14px 34px rgba(18, 85, 170, 0.24);
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }

        .install-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 38px rgba(18, 85, 170, 0.3);
        }

        .install-button:active {
          transform: translateY(0);
        }

        .install-button:focus-visible {
          outline: 3px solid rgba(201, 43, 61, 0.3);
          outline-offset: 3px;
        }

        .install-button.installed {
          background: linear-gradient(135deg, #0f6b43, #158552);
          box-shadow: 0 14px 34px rgba(15, 107, 67, 0.2);
          cursor: default;
        }

        .button-icon {
          margin-right: 8px;
          font-size: 18px;
          vertical-align: -2px;
        }

        .micro-note {
          color: #8b98aa;
          font-size: 11px;
        }

        .visual-card {
          position: relative;
          width: min(440px, 100%);
          justify-self: end;
          padding: 12px;
          border: 1px solid rgba(255, 255, 255, 0.72);
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.58);
          box-shadow: 0 28px 70px rgba(20, 50, 90, 0.16);
          backdrop-filter: blur(14px);
        }

        .visual-frame {
          position: relative;
          aspect-ratio: 4 / 5;
          overflow: hidden;
          border-radius: 20px;
          background: #dfe9f5;
        }

        .visual-frame img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          object-position: center;
        }

        .visual-overlay {
          position: absolute;
          inset: auto 14px 14px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 13px 14px;
          border: 1px solid rgba(255, 255, 255, 0.54);
          border-radius: 15px;
          background: rgba(7, 39, 88, 0.66);
          color: #fff;
          backdrop-filter: blur(10px);
        }

        .visual-caption {
          min-width: 0;
        }

        .visual-caption strong {
          display: block;
          font-size: 12px;
          font-weight: 800;
        }

        .visual-caption span {
          display: block;
          margin-top: 2px;
          color: rgba(255, 255, 255, 0.7);
          font-size: 9px;
        }

        .dots {
          display: flex;
          gap: 5px;
          flex: 0 0 auto;
        }

        .dot {
          width: 6px;
          height: 6px;
          padding: 0;
          border: 0;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.38);
          cursor: pointer;
        }

        .dot.active {
          width: 18px;
          border-radius: 999px;
          background: #fff;
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

          .brand,
          .kicker {
            justify-content: center;
          }

          .subtitle {
            margin-left: auto;
            margin-right: auto;
          }

          .actions {
            justify-content: center;
          }

          .visual-card {
            width: min(330px, 72vw);
            justify-self: center;
          }

          .visual-overlay {
            padding: 10px 11px;
          }

          .visual-caption strong {
            font-size: 10px;
          }

          .visual-caption span {
            font-size: 8px;
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
            margin-top: 22px;
          }

          .install-button {
            width: 100%;
            min-width: 0;
          }

          .micro-note {
            width: 100%;
            text-align: center;
          }

          .visual-card {
            width: min(260px, 61vw);
            padding: 8px;
            border-radius: 22px;
          }

          .visual-frame {
            border-radius: 16px;
          }

          .visual-overlay {
            inset: auto 9px 9px 9px;
            border-radius: 12px;
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

            <div className="kicker">
              <span className="kicker-line" />
              Learner Access
            </div>

            <h1 className="title">
              Learn.
              <br />
              Read.
              <br />
              <span>Grow.</span>
            </h1>

            <p className="subtitle">
              Install the learner app for a faster, focused classroom experience.
            </p>

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
                {installed || isStandalone ? "App Installed" : "Install App"}
              </button>
              <span className="micro-note">Free • Works on phone, tablet, or PC</span>
            </div>
          </div>

          <aside className="visual-card" aria-label="Learner app preview">
            <div className="visual-frame">
              <img src={SLIDES[activeSlide].src} alt={SLIDES[activeSlide].alt} />
              <div className="visual-overlay">
                <div className="visual-caption">
                  <strong>CRL-App Learner</strong>
                  <span>Ready when you are</span>
                </div>
                <div className="dots" aria-label="Slide navigation">
                  {SLIDES.map((slide, index) => (
                    <button
                      key={slide.src}
                      type="button"
                      className={`dot ${index === activeSlide ? "active" : ""}`}
                      onClick={() => setActiveSlide(index)}
                      aria-label={`Show slide ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>
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
