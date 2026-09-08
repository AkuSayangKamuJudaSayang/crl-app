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
            CRL-App runtime diagnostic
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
            A client-side exception was detected. The runtime details below are provided to diagnose the exact failure instead of hiding it behind a generic message.
          </p>
          <pre
            style={{
              marginTop: "14px",
              padding: "14px",
              maxHeight: "280px",
              overflow: "auto",
              borderRadius: "12px",
              background: "#16283a",
              color: "#eaf3fb",
              fontSize: "11px",
              lineHeight: 1.55,
              textAlign: "left",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {String(
              error?.message ||
                error ||
                "Unknown client-side exception."
            )}
            {"\n\nDigest: "}
            {String(
              error?.digest ||
                "none"
            )}
            {"\n\nURL: "}
            {typeof window !== "undefined"
              ? window.location.href
              : "unknown"}
            {"\n\nStack:\n"}
            {String(
              error?.stack ||
                "No stack available."
            ).slice(0, 6000)}
          </pre>

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
