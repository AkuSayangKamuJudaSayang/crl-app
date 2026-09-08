"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}) {
  useEffect(() => {
    console.error(
      "CRL-App global client error:",
      error
    );
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background:
            "linear-gradient(145deg,#f7fbff,#e8f1f8)",
          color: "#193b5b",
          fontFamily:
            "Arial, Helvetica, sans-serif",
        }}
      >
        <main
          style={{
            width: "min(560px,94vw)",
            padding: "34px",
            borderRadius: "24px",
            background: "#f6faff",
            border: "1px solid #d9e6ef",
            boxShadow:
              "12px 14px 30px rgba(92,122,148,.18),-9px -9px 20px rgba(255,255,255,.92)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "58px",
              height: "58px",
              margin: "0 auto 16px",
              display: "grid",
              placeItems: "center",
              borderRadius: "50%",
              background: "#fff0f2",
              color: "#c92335",
              fontSize: "28px",
              fontWeight: 900,
            }}
          >
            !
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "28px",
              fontWeight: 900,
            }}
          >
            CRL-App encountered a loading problem
          </h1>
          <p
            style={{
              margin: "12px auto 22px",
              maxWidth: "450px",
              color: "#71869a",
              fontSize: "15px",
              lineHeight: 1.6,
            }}
          >
            Your sign-in is still active. Please retry the current page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              minHeight: "48px",
              padding: "0 22px",
              border: 0,
              borderRadius: "12px",
              background:
                "linear-gradient(145deg,#2e74c8,#1559a6)",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </main>
      </body>
    </html>
  );
}
