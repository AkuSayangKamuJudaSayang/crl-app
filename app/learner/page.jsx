"use client";

import { useEffect, useState } from "react";
import LearnerAssessmentPage from "./LearnerAssessmentPage";

function isInstalledDisplayMode() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.(
      "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen), (display-mode: window-controls-overlay)"
    )?.matches || window.navigator.standalone === true
  );
}

function LearnerRouteBootScreen() {
  return (
    <>
      <style jsx global>{`
        html, body { margin: 0; min-height: 100%; background: #071f45; }
        .learner-route-boot {
          min-height: 100svh; display: grid; place-items: center; padding: 24px;
          background: radial-gradient(circle at 50% 25%, #1d73d1 0%, #0c3d83 42%, #061c3e 100%);
          color: #fff; font-family: Arial, Helvetica, sans-serif;
        }
        .learner-route-boot-card {
          width: min(360px, 100%); text-align: center; padding: 34px 28px;
          border-radius: 28px; background: rgba(255,255,255,.10);
          border: 1px solid rgba(255,255,255,.16); backdrop-filter: blur(16px);
          box-shadow: 0 30px 80px rgba(0,0,0,.22);
        }
        .learner-route-boot-logo {
          width: 76px; height: 76px; margin: 0 auto 18px; object-fit: contain;
          border-radius: 22px; background: rgba(255,255,255,.96); padding: 11px;
          box-shadow: 0 16px 34px rgba(0,0,0,.18);
        }
        .learner-route-boot-title { margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -.03em; }
        .learner-route-boot-text { margin: 8px 0 22px; font-size: 12px; color: rgba(255,255,255,.72); }
        .learner-route-boot-spinner {
          width: 34px; height: 34px; margin: 0 auto; border-radius: 50%;
          border: 3px solid rgba(255,255,255,.22); border-top-color: #fff;
          animation: learnerRouteSpin .72s linear infinite;
        }
        @keyframes learnerRouteSpin { to { transform: rotate(360deg); } }
      `}</style>
      <main className="learner-route-boot" aria-live="polite" aria-label="Loading CRL-App Learner">
        <div className="learner-route-boot-card">
          <img className="learner-route-boot-logo" src="/crl-app-logo.png" alt="" />
          <h1 className="learner-route-boot-title">CRL-App Learner</h1>
          <p className="learner-route-boot-text">Preparing your assessment workspace…</p>
          <div className="learner-route-boot-spinner" aria-hidden="true" />
        </div>
      </main>
    </>
  );
}

export default function LearnerPage() {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = isInstalledDisplayMode();
    setInstalled(standalone);
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && !installed) {
      window.location.replace("/learner/download");
    }
  }, [ready, installed]);

  if (!ready || !installed) return <LearnerRouteBootScreen />;
  return <LearnerAssessmentPage />;
}
