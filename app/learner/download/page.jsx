"use client";

import { useEffect, useState } from "react";

const SLIDES = [
  "/login-slides/classroom-1.png",
  "/login-slides/classroom-2.png",
  "/login-slides/classroom-3.png",
];

function isStandalone() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen), (display-mode: window-controls-overlay)")?.matches ||
    window.navigator.standalone === true
  );
}

export default function LearnerDownloadPage() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [installReady, setInstallReady] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    let cancelled = false;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/learner-pwa-sw.js", { scope: "/" })
        .then(async (registration) => {
          try { await registration.update(); } catch {}
          try { await navigator.serviceWorker.ready; } catch {}
          return registration;
        })
        .catch(() => undefined);
    }

    const handleBeforeInstall = (event) => {
      event.preventDefault();
      if (!cancelled) {
        setDeferredPrompt(event);
        setInstallReady(true);
      }
    };

    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setInstallReady(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((value) => (value + 1) % SLIDES.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, []);

  async function handleDownload() {
    if (installed || isStandalone()) return;

    if (!deferredPrompt) {
      // Never submit or reload the page. Some browsers do not expose a
      // programmatic install prompt; the button simply remains inert there.
      return;
    }

    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {
      // Native prompt can be dismissed or rejected by the browser.
    } finally {
      setDeferredPrompt(null);
      setInstallReady(false);
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
        html, body { margin: 0; min-height: 100%; background: #edf4fb; }
        body { font-family: Arial, Helvetica, sans-serif; color: var(--ink); overflow: auto; }
        button { font: inherit; }
        .page { min-height: 100svh; position: relative; overflow: hidden; isolation: isolate; }
        .accent { position: absolute; inset: 0 0 auto; z-index: 5; height: 4px; display: flex; }
        .accent-blue { flex: 1; background: var(--blue-800); }
        .accent-red { width: 23%; background: var(--red-600); }
        .backdrop { position: fixed; inset: 0; z-index: 0; overflow: hidden; }
        .slide { position: absolute; inset: 0; background-position: center; background-size: cover; opacity: 0; transform: scale(1.04); transition: opacity 1.1s ease, transform 7s ease; }
        .slide.active { opacity: 1; transform: scale(1.08); }
        .backdrop::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(247,250,255,.98) 0%, rgba(247,250,255,.94) 34%, rgba(247,250,255,.74) 58%, rgba(7,39,88,.18) 100%), linear-gradient(0deg, rgba(7,39,88,.08), transparent 42%); }
        .content { position: relative; z-index: 2; min-height: 100svh; width: min(1120px, 100%); margin: 0 auto; padding: clamp(52px, 7vw, 90px) clamp(22px, 5vw, 64px); display: grid; grid-template-columns: minmax(0,1fr) minmax(330px,.64fr); align-items: center; gap: clamp(30px, 6vw, 90px); }
        .copy { max-width: 650px; }
        .eyebrow { color: var(--blue-800); font-size: 12px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; margin-bottom: 16px; }
        .title { margin: 0; font-size: clamp(54px, 7vw, 92px); line-height: .92; letter-spacing: -.06em; font-weight: 950; color: var(--blue-950); }
        .title span { color: var(--red-600); }
        .subtitle { max-width: 520px; margin: 22px 0 0; color: #667b94; font-size: clamp(14px, 1.45vw, 18px); line-height: 1.55; }
        .panel { width: min(390px,100%); justify-self: end; padding: clamp(24px, 3vw, 32px); border: 1px solid rgba(255,255,255,.82); border-radius: 28px; background: rgba(255,255,255,.78); box-shadow: 0 28px 80px rgba(17,56,105,.18); backdrop-filter: blur(20px); }
        .panel-kicker { margin: 0; color: #6480a0; font-size: 11px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
        .panel-title { margin: 8px 0 0; color: var(--blue-950); font-size: 28px; font-weight: 950; letter-spacing: -.04em; }
        .panel-text { margin: 8px 0 22px; color: #6d8197; font-size: 13px; line-height: 1.55; }
        .download { width: 100%; min-height: 62px; border: 0; border-radius: 18px; background: linear-gradient(135deg,#0f5db6,#1f77d6); color: #fff; font-size: 20px; font-weight: 950; cursor: pointer; box-shadow: 0 18px 34px rgba(20,90,173,.26), inset 0 1px 0 rgba(255,255,255,.22); transition: transform .18s ease, filter .18s ease, box-shadow .18s ease; }
        .download:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.04); box-shadow: 0 24px 42px rgba(20,90,173,.32), inset 0 1px 0 rgba(255,255,255,.22); }
        .download:active:not(:disabled) { transform: translateY(0); }
        .download:disabled { opacity: .58; cursor: default; }
        .status { min-height: 16px; margin-top: 13px; color: #7f91a6; font-size: 10px; text-align: center; }
        .legal { margin-top: 4px; color: rgba(20,37,61,.45); font-size: 10px; text-align: center; }
        @media (max-width: 900px) { .content { grid-template-columns: 1fr; align-content: center; text-align: center; } .copy { margin: 0 auto; } .subtitle { margin-left: auto; margin-right: auto; } .panel { justify-self: center; } }
        @media (max-width: 560px) { .content { padding: 50px 18px 30px; gap: 24px; } .title { font-size: clamp(48px, 17vw, 70px); } .subtitle { font-size: 13px; } .panel { padding: 22px; border-radius: 22px; } .panel-title { font-size: 23px; } .download { min-height: 60px; font-size: 19px; } }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; } }
      `}</style>

      <main className="page">
        <div className="accent" aria-hidden="true"><div className="accent-blue" /><div className="accent-red" /></div>
        <div className="backdrop" aria-hidden="true">
          {SLIDES.map((src, index) => <div key={src} className={`slide ${index === activeSlide ? "active" : ""}`} style={{ backgroundImage: `url("${src}")` }} />)}
        </div>

        <section className="content">
          <div className="copy">
            <h1 className="title">CRL-App<br /><span>Learner</span></h1>
            <p className="subtitle">A dedicated learner app to make the assessment easier</p>
          </div>

          <aside className="panel" aria-label="CRL-App Learner download">
            <p className="panel-kicker">Ready to begin?</p>
            <h2 className="panel-title">Get the learner app.</h2>
            <p className="panel-text">Install once, then open CRL-App Learner from your device.</p>
            <button
              type="button"
              className="download"
              onClick={handleDownload}
              disabled={installed || (!installReady && !deferredPrompt)}
            >
              {installed ? "Downloaded" : "Download"}
            </button>
            <div className="status" aria-live="polite">
              {installed ? "CRL-App Learner is ready" : installReady ? "Ready to install" : ""}
            </div>
            <div className="legal">Phone · tablet · PC</div>
          </aside>
        </section>
      </main>
    </>
  );
}
