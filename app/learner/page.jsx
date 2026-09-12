"use client";

import { useEffect, useState } from "react";
import LearnerAssessmentPage from "./LearnerAssessmentPage";

export default function LearnerPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <main
        aria-live="polite"
        aria-label="Loading CRL-App Learner"
        style={{
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "radial-gradient(circle at 50% 25%, #1d73d1 0%, #0c3d83 42%, #061c3e 100%)",
          color: "#fff",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            width: "min(360px, 100%)",
            textAlign: "center",
            padding: "34px 28px",
            borderRadius: 28,
            background: "rgba(255,255,255,.10)",
            border: "1px solid rgba(255,255,255,.16)",
            boxShadow: "0 30px 80px rgba(0,0,0,.22)",
          }}
        >
          <img
            src="/crl-app-logo.png"
            alt=""
            style={{
              width: 76,
              height: 76,
              margin: "0 auto 18px",
              objectFit: "contain",
              borderRadius: 22,
              background: "rgba(255,255,255,.96)",
              padding: 11,
              boxShadow: "0 16px 34px rgba(0,0,0,.18)",
            }}
          />
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: "-.03em" }}>
            CRL-App Learner
          </h1>
          <p style={{ margin: "8px 0 22px", fontSize: 12, color: "rgba(255,255,255,.72)" }}>
            Preparing your assessment workspace…
          </p>
          <div
            aria-hidden="true"
            style={{
              width: 34,
              height: 34,
              margin: "0 auto",
              borderRadius: "50%",
              border: "3px solid rgba(255,255,255,.22)",
              borderTopColor: "#fff",
              animation: "learnerRouteSpin .72s linear infinite",
            }}
          />
        </div>
        <style>{`@keyframes learnerRouteSpin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  return <LearnerAssessmentPage />;
}
