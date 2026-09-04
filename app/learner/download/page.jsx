"use client";

import { useEffect, useMemo, useState } from "react";

const SLIDES = [
  "/login-slides/classroom-1.png",
  "/login-slides/classroom-2.png",
  "/login-slides/classroom-3.png",
];

export default function LearnerEntryPage() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [mounted, setMounted] = useState(false);

  const isStandalone = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true
    );
  }, [installed]);

  useEffect(() => {
    setMounted(true);

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
    if (!installEvent) return;

    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } finally {
      setInstallEvent(null);
    }
  }

  return (
    <>
      <style jsx global>{`
        :root {
          --blue-950: #072758;
          --blue-900: #0b3477;
          --blue-800: #1255aa;
          --blue-700: #1768c6;
          --red-600: #c92b3d;
          --ink: #14253d;
          --muted: #6c7b90;
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
          font-family: Arial, Helvetica, sans-serif;
          color: var(--ink);
          overscroll-behavior-y: none;
        }

        button {
          font: inherit;
        }

        .page {
          position: relative;
          width: 100%;
          height: 100svh;
          min-height: 560px;
          overflow: hidden;
          isolation: isolate;
        }

        .accent {
          position: absolute;
          z-index: 10;
          inset: 0 0 auto;
          display: flex;
          height: 4px;
        }

        .accent-blue {
          flex: 1;
          background: var(--blue-800);
        }

        .accent-red {
          width: 28%;
          background: var(--red-600);
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
          background-size: cover;
          opacity: 0;
          transform: scale(1.04);
          transition: opacity 1s ease, transform 6s ease;
        }

        .slide.active {
          opacity: 1;
          transform: scale(1.07);
        }

        .backdrop::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, rgba(247, 250, 255, 0.97) 0%, rgba(247, 250, 255, 0.9) 36%, rgba(247, 250, 255, 0.52) 67%, rgba(7, 39, 88, 0.2) 100%),
            linear-gradient(0deg, rgba(7, 39, 88, 0.12), transparent 34%);
        }

        .content {
          position: relative;
          z-index: 2;
          width: min(1180px, 100%);
          height: 100%;
          margin: 0 auto;
          padding: clamp(30px, 5vw, 64px);
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 0.72fr);
          align-items: center;
          gap: clamp(32px, 7vw, 100px);
        }

        .brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 28px;
          color: var(--blue-800);
          font-size: clamp(22px, 2.3vw, 30px);
          font-weight: 900;
          letter-spacing: -0.7px;
        }

        .brand-mark {
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: var(--blue-800);
          box-shadow: 17px 0 0 var(--red-600);
        }

        .title {
          margin: 0;
          max-width: 640px;
          font-size: clamp(48px, 7vw, 90px);
          line-height: 0.94;
          letter-spacing: -0.055em;
          font-weight: 900;
          color: var(--blue-950);
        }

        .title span {
          color: var(--red-600);
        }

        .subtitle {
          max-width: 510px;
          margin: 24px 0 0;
          color: var(--muted);
          font-size: clamp(14px, 1.5vw, 18px);
          line-height: 1.55;
        }

        .install-panel {
          width: min(390px, 100%);
          justify-self: end;
          padding: 30px;
          border: 1px solid rgba(255, 255, 255, 0.8);
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.72);
          box-shadow: 0 26px 70px rgba(20, 50, 90, 0.15);
          backdrop-filter: blur(18px);
        }

        .install-title {
          margin: 0;
          color: var(--blue-950);
          font-size: 22px;
          font-weight: 900;
          letter-spacing: -0.03em;
        }

        .install-note {
          margin: 8px 0 22px;
          color: var(--muted);
          font-size: 12px;
          line-height: 1.55;
        }

        .install-button {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 60px;
          padding: 15px 22px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          border-radius: 17px;
          overflow: hidden;
          background: linear-gradient(135deg, #0e5db4 0%, #1768c6 55%, #1d72d1 100%);
          color: #fff;
          box-shadow: 0 18px 34px rgba(18, 85, 170, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.22);
          font-size: 15px;
          font-weight: 900;
          cursor: pointer;
          transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
        }

        .install-button::before {
          content: "";
          position: absolute;
          top: 0;
          left: -40%;
          width: 28%;
          height: 100%;
          transform: skewX(-18deg);
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.28), transparent);
          transition: left 0.55s ease;
        }

        .install-button:hover {
          transform: translateY(-2px);
          filter: brightness(1.04);
          box-shadow: 0 22px 42px rgba(18, 85, 170, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.25);
        }

        .install-button:hover::before {
          left: 120%;
        }

        .install-button:active {
          transform: translateY(0);
        }

        .install-button:focus-visible {
          outline: 3px solid rgba(201, 43, 61, 0.28);
          outline-offset: 3px;
        }

        .install-button.installed {
          background: linear-gradient(135deg, #0f6b43, #158552);
          box-shadow: 0 18px 34px rgba(15, 107, 67, 0.2);
          cursor: default;
        }

        .button-icon {
          display: inline-grid;
          place-items: center;
          width: 29px;
          height: 29px;
          margin-right: 10px;
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.16);
          font-size: 18px;
          line-height: 1;
        }

        .device-note {
          display: block;
          margin-top: 12px;
          color: #8796a9;
          font-size: 10px;
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

        @media (max-width: 900px) {
          .content {
            grid-template-columns: 1fr;
            align-content: center;
            gap: 28px;
            padding: 34px 24px 54px;
          }

          .copy {
            text-align: center;
          }

          .brand {
            justify-content: center;
          }

          .subtitle {
            margin-left: auto;
            margin-right: auto;
          }

          .install-panel {
            width: min(420px, 100%);
            justify-self: center;
          }

          .install-button {
            width: 100%;
          }

          .footer {
            left: 0;
            right: 0;
            text-align: center;
          }
        }

        @media (max-width: 560px) {
          .page {
            min-height: 100svh;
          }

          .content {
            gap: 22px;
            padding: 26px 17px 48px;
          }

          .brand {
            margin-bottom: 18px;
            font-size: 22px;
          }

          .title {
            font-size: clamp(42px, 15vw, 64px);
          }

          .subtitle {
            margin-top: 15px;
            font-size: 13px;
          }

          .install-panel {
            padding: 20px;
            border-radius: 22px;
          }

          .install-title {
            font-size: 19px;
          }

          .install-note {
            margin-bottom: 18px;
          }

          .install-button {
            min-height: 58px;
          }

          .footer {
            bottom: 10px;
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

      <main className="page">
        <div className="accent" aria-hidden="true">
          <div className="accent-blue" />
          <div className="accent-red" />
        </div>

        <div className="backdrop" aria-hidden="true">
          {SLIDES.map((src, index) => (
            <div
              key={src}
              className={`slide ${index === activeSlide ? "active" : ""}`}
              style={{ backgroundImage: `url("${src}")` }}
            />
          ))}
        </div>

        <section className="content">
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
              A focused learner app for classroom reading and literacy assessment.
            </p>
          </div>

          <aside className="install-panel" aria-label="CRL-App Learner installation">
            <h2 className="install-title">Ready to learn?</h2>
            <p className="install-note">Install CRL-App Learner on this device.</p>

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
            <span className="device-note">Free • Phone, tablet, or PC</span>
          </aside>
        </section>

        <div className="footer">Comprehensive Rapid Literacy Assessment</div>
      </main>
    </>
  );
}
