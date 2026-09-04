"use client";

import { useEffect, useRef, useState } from "react";

const SLIDES = [
  "/login-slides/classroom-1.png",
  "/login-slides/classroom-2.png",
  "/login-slides/classroom-3.png",
];

const INSTALL_EVENT_KEY = "crl-learner-install-event";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.(
      "(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui), (display-mode: window-controls-overlay)"
    )?.matches || window.navigator.standalone === true
  );
}

export default function LearnerDownloadPage() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [installAvailable, setInstallAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [ready, setReady] = useState(false);
  const deferredPromptRef = useRef(null);
  const promptWaitersRef = useRef([]);

  useEffect(() => {
    setInstalled(isStandalone());

    let registration;
    let cancelled = false;

    const resolvePromptWaiters = (event) => {
      const waiters = promptWaitersRef.current.splice(0);
      for (const resolve of waiters) resolve(event);
    };

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      deferredPromptRef.current = event;
      setInstallAvailable(true);
      resolvePromptWaiters(event);
    };

    const onAppInstalled = () => {
      deferredPromptRef.current = null;
      setInstallAvailable(false);
      setInstalled(true);
      setInstalling(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    const register = async () => {
      if (!("serviceWorker" in navigator)) return;
      try {
        registration = await navigator.serviceWorker.register(
          "/learner-pwa-sw.js",
          {
            scope: "/learner",
            updateViaCache: "none",
          }
        );
        await registration.update().catch(() => {});
        await navigator.serviceWorker.ready;
      } catch (error) {
        console.warn("Learner PWA service worker registration failed:", error);
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    register();

    // Some Chromium builds dispatch beforeinstallprompt shortly after the
    // service worker becomes ready. Keep a pending listener for a few seconds
    // so the button can invoke the native prompt instead of doing anything
    // that resembles navigation or a page refresh.
    const fallbackReadyTimer = window.setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 3500);

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackReadyTimer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      promptWaitersRef.current.splice(0);
      void registration;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % SLIDES.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, []);

  async function waitForInstallPrompt(timeoutMs = 4500) {
    if (deferredPromptRef.current) return deferredPromptRef.current;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (event) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(event || null);
      };
      const timer = window.setTimeout(() => finish(null), timeoutMs);
      promptWaitersRef.current.push(finish);
    });
  }

  async function handleInstall() {
    if (installed || isStandalone() || installing) {
      if (installed || isStandalone()) {
        window.location.assign("/learner");
      }
      return;
    }

    setInstalling(true);

    try {
      // If the event arrived early, use it immediately. Otherwise wait for
      // the browser to expose its genuine installation prompt.
      const promptEvent =
        deferredPromptRef.current || (await waitForInstallPrompt());

      if (!promptEvent) {
        // There is no standards-compliant way for a web page to force an OS
        // PWA installation when the browser does not expose the native
        // install-prompt event. Do not reload the page; simply open the real
        // learner route instead.
        window.location.assign("/learner");
        return;
      }

      deferredPromptRef.current = null;
      setInstallAvailable(false);

      await promptEvent.prompt();
      await promptEvent.userChoice.catch(() => null);
    } catch (error) {
      console.error("Learner PWA installation failed:", error);
    } finally {
      setInstalling(false);
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

        * { box-sizing: border-box; }
        html, body {
          width: 100%;
          min-height: 100%;
          margin: 0;
          padding: 0;
          background: #edf4fb;
        }
        body { font-family: Arial, Helvetica, sans-serif; color: var(--ink); }
        button { font: inherit; }

        .page {
          position: relative;
          width: 100%;
          min-height: 100svh;
          overflow: hidden;
          isolation: isolate;
        }
        .accent { position: absolute; inset: 0 0 auto; z-index: 10; display: flex; height: 4px; }
        .accent-blue { flex: 1; background: var(--blue-800); }
        .accent-red { width: 28%; background: var(--red-600); }
        .backdrop { position: absolute; inset: 0; z-index: 0; overflow: hidden; }
        .slide {
          position: absolute;
          inset: 0;
          background-position: center;
          background-size: cover;
          opacity: 0;
          transform: scale(1.035);
          transition: opacity 1s ease, transform 6s ease;
        }
        .slide.active { opacity: 1; transform: scale(1.065); }
        .backdrop::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, rgba(247,250,255,.97) 0%, rgba(247,250,255,.90) 36%, rgba(247,250,255,.52) 67%, rgba(7,39,88,.20) 100%),
            linear-gradient(0deg, rgba(7,39,88,.12), transparent 34%);
        }

        .content {
          position: relative;
          z-index: 2;
          width: min(1180px, 100%);
          min-height: 100svh;
          margin: 0 auto;
          padding: clamp(28px, 5vw, 64px);
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(300px, .62fr);
          align-items: center;
          gap: clamp(32px, 7vw, 96px);
        }
        .brand { display: inline-flex; align-items: center; gap: 12px; margin-bottom: 26px; }
        .logo-wrap {
          width: 54px;
          height: 54px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          background: rgba(255,255,255,.84);
          box-shadow: 0 12px 32px rgba(9,42,86,.14);
          backdrop-filter: blur(8px);
        }
        .logo-wrap img { width: 42px; height: 42px; object-fit: contain; }
        .brand-name { color: var(--blue-800); font-size: clamp(21px, 2vw, 28px); font-weight: 900; letter-spacing: -.7px; }
        .brand-name span { color: var(--red-600); }
        .title { margin: 0; max-width: 620px; color: var(--blue-950); font-size: clamp(46px, 6.8vw, 86px); line-height: .94; letter-spacing: -.055em; font-weight: 900; }
        .title span { color: var(--red-600); }
        .subtitle { max-width: 500px; margin: 22px 0 0; color: var(--muted); font-size: clamp(14px, 1.4vw, 17px); line-height: 1.55; }

        .install-panel {
          width: min(390px, 100%);
          justify-self: end;
          padding: clamp(24px, 3vw, 34px);
          border-radius: 28px;
          background: rgba(255,255,255,.88);
          border: 1px solid rgba(255,255,255,.78);
          box-shadow: 0 28px 80px rgba(9,42,86,.18);
          backdrop-filter: blur(16px);
        }
        .eyebrow { margin: 0 0 9px; color: var(--blue-800); font-size: 11px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
        .panel-title { margin: 0; color: var(--ink); font-size: clamp(24px, 3vw, 34px); font-weight: 900; letter-spacing: -.04em; }
        .panel-sub { margin: 10px 0 22px; color: var(--muted); font-size: 13px; line-height: 1.5; }
        .install-button {
          position: relative;
          width: 100%;
          min-height: 58px;
          border: 0;
          border-radius: 16px;
          padding: 0 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          cursor: pointer;
          color: #fff;
          background: linear-gradient(135deg, #1559a6 0%, #0d3f85 100%);
          box-shadow: 0 15px 30px rgba(21,89,166,.26);
          font-size: 15px;
          font-weight: 900;
          transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
          overflow: hidden;
        }
        .install-button::after {
          content: "";
          position: absolute;
          top: 0;
          left: -40%;
          width: 30%;
          height: 100%;
          transform: skewX(-20deg);
          background: rgba(255,255,255,.22);
          transition: left .55s ease;
        }
        .install-button:hover { transform: translateY(-2px); box-shadow: 0 19px 36px rgba(21,89,166,.30); filter: saturate(1.05); }
        .install-button:hover::after { left: 130%; }
        .install-button:active { transform: translateY(0); }
        .install-button:focus-visible { outline: 3px solid rgba(21,89,166,.24); outline-offset: 3px; }
        .install-button:disabled { cursor: wait; opacity: .86; transform: none; }
        .icon { font-size: 21px; line-height: 1; }
        .status { min-height: 18px; margin-top: 12px; text-align: center; color: #718096; font-size: 11px; }
        .status:empty { visibility: hidden; }

        .footer-note {
          margin-top: 18px;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: #8090a3;
          font-size: 10px;
        }
        .dots { position: absolute; left: 50%; bottom: 22px; z-index: 3; transform: translateX(-50%); display: flex; gap: 6px; }
        .dot { width: 6px; height: 6px; border-radius: 999px; background: rgba(255,255,255,.52); box-shadow: 0 1px 5px rgba(0,0,0,.16); }
        .dot.active { width: 20px; background: rgba(255,255,255,.92); }

        @media (max-width: 860px) {
          .page { overflow-y: auto; }
          .content { min-height: 100svh; padding: 34px 22px 70px; grid-template-columns: 1fr; gap: 28px; align-content: center; }
          .install-panel { justify-self: stretch; width: 100%; max-width: 520px; }
          .title { max-width: 720px; }
        }
        @media (max-width: 520px) {
          .content { padding: 25px 16px 54px; gap: 22px; }
          .brand { margin-bottom: 18px; }
          .logo-wrap { width: 46px; height: 46px; border-radius: 14px; }
          .logo-wrap img { width: 36px; height: 36px; }
          .title { font-size: clamp(42px, 15vw, 62px); }
          .subtitle { margin-top: 16px; font-size: 13px; }
          .install-panel { border-radius: 22px; padding: 20px; }
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
              style={{ backgroundImage: `url(${src})` }}
            />
          ))}
        </div>

        <div className="content">
          <section>
            <div className="brand">
              <div className="logo-wrap">
                <img src="/crl-app-logo.png" alt="" />
              </div>
              <div className="brand-name">CRL<span>-App</span></div>
            </div>

            <h1 className="title">
              CRL-App <span>Learner</span>
            </h1>
            <p className="subtitle">A focused learner app for classroom reading assessment.</p>
          </section>

          <aside className="install-panel" aria-label="Install CRL-App Learner">
            <p className="eyebrow">Learner app</p>
            <h2 className="panel-title">Ready to begin?</h2>
            <p className="panel-sub">Install once, then open CRL-App Learner from your device.</p>

            <button
              type="button"
              className="install-button"
              onClick={handleInstall}
              disabled={installing}
              aria-label="Install CRL-App Learner"
            >
              <span className="icon" aria-hidden="true">⇩</span>
              {installing ? "Preparing…" : installed ? "Open Learner App" : "Install App"}
            </button>

            <div className="status" aria-live="polite">
              {!ready ? "" : installAvailable ? "" : ""}
            </div>

            <div className="footer-note">
              <span>CRL-App Learner</span>
              <span>Private assessment app</span>
            </div>
          </aside>
        </div>

        <div className="dots" aria-hidden="true">
          {SLIDES.map((src, index) => (
            <span key={src} className={`dot ${index === activeSlide ? "active" : ""}`} />
          ))}
        </div>
      </main>
    </>
  );
}
