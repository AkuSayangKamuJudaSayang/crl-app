"use client";

import { useCallback, useEffect, useState } from "react";

const SW_URL = "/learner-pwa-sw.js";
const PWA_SCOPE = "/learner";
const LEARNER_URL = "/learner";

export default function LearnerDownloadPage() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [slide, setSlide] = useState(0);

  const registerLearnerWorker = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return null;
    try {
      const registration = await navigator.serviceWorker.register(SW_URL, {
        scope: PWA_SCOPE,
        updateViaCache: "none",
      });
      try {
        await registration.update();
      } catch {
        // The browser may reject an immediate update while offline.
      }
      return registration;
    } catch (error) {
      console.error("Learner PWA service worker registration failed:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    registerLearnerWorker();

    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true;

    setInstalled(standalone);

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setInstalling(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    const media = window.matchMedia?.("(display-mode: standalone)");
    const handleModeChange = (event) => setInstalled(event.matches);
    media?.addEventListener?.("change", handleModeChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      media?.removeEventListener?.("change", handleModeChange);
    };
  }, [registerLearnerWorker]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlide((current) => (current + 1) % 3);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const handleInstall = async () => {
    if (installed) {
      window.location.assign(LEARNER_URL);
      return;
    }

    if (!installPrompt) {
      // There is no standard API that can force-install a PWA. Keep this
      // button useful by taking the user to the actual learner entry point
      // rather than displaying a misleading manual-install overlay.
      window.location.assign(LEARNER_URL);
      return;
    }

    setInstalling(true);
    try {
      const result = await installPrompt.prompt();
      if (result?.outcome === "accepted") {
        setInstalled(true);
      }
    } catch (error) {
      console.error("Learner PWA install prompt failed:", error);
    } finally {
      setInstallPrompt(null);
      setInstalling(false);
    }
  };

  const slides = [
    "/login-slides/classroom-1.png",
    "/login-slides/classroom-2.png",
    "/login-slides/classroom-3.png",
  ];

  return (
    <main className="learnerDownloadPage">
      <div className="photoLayer" aria-hidden="true">
        {slides.map((src, index) => (
          <div
            key={src}
            className={`photoSlide ${index === slide ? "active" : ""}`}
            style={{ backgroundImage: `url(${src})` }}
          />
        ))}
      </div>
      <div className="photoWash" aria-hidden="true" />
      <div className="blueGlow" aria-hidden="true" />

      <section className="downloadShell">
        <div className="brandRow">
          <div className="brandHighlight">
            <img src="/crl-app-logo.png" alt="CRL-App" />
          </div>
          <div className="brandName">
            <span className="brandBlue">CRL-App</span>
            <span className="brandRed"> Learner</span>
          </div>
        </div>

        <div className="contentGrid">
          <div className="copyBlock">
            <div className="eyebrow">READING ASSESSMENT. MADE CLEAR.</div>
            <h1>
              Learn.
              <br />
              Read.
              <br />
              <span>Grow.</span>
            </h1>
            <p>Install the learner app on this device.</p>
          </div>

          <div className="installCard">
            <div className="installTitle">CRL-App Learner</div>
            <div className="installSubtitle">Your classroom assessment app.</div>

            <button
              type="button"
              className={`installButton ${installed ? "installed" : ""}`}
              onClick={handleInstall}
              disabled={installing}
            >
              <span className="installIcon" aria-hidden="true">
                {installed ? "✓" : "↓"}
              </span>
              <span>
                {installing ? "Installing…" : installed ? "Open Learner App" : "Install App"}
              </span>
            </button>

            <div className="deviceNote">Phone · tablet · PC</div>
          </div>
        </div>
      </section>

      <style jsx>{`
        :global(html),
        :global(body) {
          margin: 0;
          min-height: 100%;
          background: #f7faff;
        }

        :global(body) {
          overflow-x: hidden;
        }

        .learnerDownloadPage {
          position: relative;
          min-height: 100svh;
          isolation: isolate;
          overflow: hidden;
          display: grid;
          place-items: center;
          padding: clamp(18px, 4vw, 52px);
          color: #0c2f62;
          font-family: Arial, Helvetica, sans-serif;
          background: #f7faff;
        }

        .photoLayer,
        .photoWash,
        .blueGlow {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .photoLayer {
          z-index: -3;
        }

        .photoSlide {
          position: absolute;
          inset: -5%;
          background-position: center;
          background-size: cover;
          opacity: 0;
          filter: saturate(.86) blur(1px);
          transform: scale(1.06);
          transition: opacity 900ms ease;
        }

        .photoSlide.active {
          opacity: .48;
        }

        .photoWash {
          z-index: -2;
          background:
            radial-gradient(circle at 28% 48%, rgba(255, 255, 255, .98) 0 17%, rgba(255, 255, 255, .92) 31%, rgba(255, 255, 255, .74) 48%, rgba(255, 255, 255, .25) 72%, rgba(255, 255, 255, .08) 100%),
            linear-gradient(90deg, rgba(246, 250, 255, .98) 0%, rgba(246, 250, 255, .88) 36%, rgba(246, 250, 255, .24) 72%, rgba(246, 250, 255, .05) 100%);
          backdrop-filter: blur(4px);
        }

        .blueGlow {
          z-index: -1;
          background:
            radial-gradient(circle at 8% 12%, rgba(21, 89, 166, .13), transparent 28%),
            radial-gradient(circle at 89% 88%, rgba(201, 35, 53, .08), transparent 27%);
        }

        .downloadShell {
          width: min(1180px, 100%);
          min-height: min(760px, calc(100svh - 36px));
          display: grid;
          align-content: center;
          gap: clamp(44px, 7vw, 86px);
        }

        .brandRow {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          justify-self: start;
        }

        .brandHighlight {
          width: 68px;
          height: 68px;
          display: grid;
          place-items: center;
          border-radius: 18px;
          background: rgba(255, 255, 255, .82);
          box-shadow: 0 15px 34px rgba(16, 58, 103, .14);
          backdrop-filter: blur(10px);
        }

        .brandHighlight img {
          width: 54px;
          height: 54px;
          object-fit: contain;
        }

        .brandName {
          font-size: clamp(25px, 3.1vw, 37px);
          font-weight: 900;
          letter-spacing: -.9px;
        }

        .brandBlue { color: #1459a6; }
        .brandRed { color: #c92335; }

        .contentGrid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 450px);
          align-items: center;
          gap: clamp(42px, 7vw, 110px);
        }

        .copyBlock {
          max-width: 650px;
        }

        .eyebrow {
          margin-bottom: 20px;
          color: #19599d;
          font-size: clamp(12px, 1.2vw, 15px);
          font-weight: 900;
          letter-spacing: 2px;
        }

        h1 {
          margin: 0;
          color: #0b2d5f;
          font-size: clamp(66px, 9vw, 124px);
          line-height: .86;
          letter-spacing: -5px;
          font-weight: 950;
        }

        h1 span { color: #d52c40; }

        .copyBlock p {
          margin: 30px 0 0;
          max-width: 520px;
          color: #5c7390;
          font-size: clamp(16px, 1.55vw, 20px);
          line-height: 1.55;
        }

        .installCard {
          width: 100%;
          padding: 30px;
          border-radius: 24px;
          background: rgba(255,255,255,.84);
          border: 1px solid rgba(255,255,255,.8);
          box-shadow: 0 26px 70px rgba(34,72,112,.14);
          backdrop-filter: blur(18px);
        }

        .installTitle {
          color: #102f5b;
          font-size: clamp(25px, 2.4vw, 34px);
          font-weight: 900;
          letter-spacing: -.7px;
        }

        .installSubtitle {
          margin-top: 7px;
          color: #7488a0;
          font-size: 14px;
        }

        .installButton {
          width: 100%;
          min-height: 68px;
          margin-top: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          border: 0;
          border-radius: 17px;
          background: linear-gradient(135deg, #1459a6, #2579d9);
          color: #fff;
          font-size: 18px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 16px 28px rgba(20,89,166,.24);
          transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
        }

        .installButton:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 20px 34px rgba(20,89,166,.29);
          filter: brightness(1.03);
        }

        .installButton:active:not(:disabled) {
          transform: translateY(0);
        }

        .installButton:disabled {
          cursor: wait;
          opacity: .84;
        }

        .installButton.installed {
          background: linear-gradient(135deg, #12824d, #1aa969);
          box-shadow: 0 16px 28px rgba(18,130,77,.2);
        }

        .installIcon {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: rgba(255,255,255,.18);
          font-size: 22px;
          line-height: 1;
        }

        .deviceNote {
          margin-top: 14px;
          text-align: center;
          color: #8497ab;
          font-size: 12px;
          font-weight: 700;
        }

        @media (max-width: 850px) {
          .downloadShell {
            min-height: auto;
            padding: 20px 0;
          }

          .contentGrid {
            grid-template-columns: 1fr;
          }

          .copyBlock {
            max-width: 620px;
          }

          .installCard {
            max-width: 520px;
            justify-self: start;
          }
        }

        @media (max-width: 560px) {
          .learnerDownloadPage {
            padding: 18px;
          }

          .brandHighlight {
            width: 56px;
            height: 56px;
            border-radius: 15px;
          }

          .brandHighlight img {
            width: 44px;
            height: 44px;
          }

          h1 {
            font-size: clamp(59px, 18vw, 84px);
            letter-spacing: -3px;
          }

          .copyBlock p {
            margin-top: 22px;
          }

          .installCard {
            padding: 22px;
            border-radius: 19px;
          }
        }
      `}</style>
    </main>
  );
}
