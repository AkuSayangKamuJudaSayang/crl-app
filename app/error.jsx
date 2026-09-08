"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}) {
  useEffect(() => {
    console.error(
      "CRL-App client error:",
      error
    );

    const message =
      String(
        error?.message ||
          error ||
          ""
      ).toLowerCase();

    const isChunkFailure =
      message.includes(
        "chunkloaderror"
      ) ||
      message.includes(
        "loading chunk"
      ) ||
      message.includes(
        "dynamically imported module"
      ) ||
      message.includes(
        "failed to fetch dynamically imported module"
      );

    if (
      isChunkFailure &&
      typeof window !== "undefined"
    ) {
      const recoveryKey =
        "crla_chunk_recovery_v1";

      if (
        sessionStorage.getItem(
          recoveryKey
        ) !== "1"
      ) {
        sessionStorage.setItem(
          recoveryKey,
          "1"
        );

        void (async () => {
          try {
            if (
              "serviceWorker" in
              navigator
            ) {
              const registrations =
                await navigator.serviceWorker.getRegistrations();

              await Promise.all(
                registrations.map(
                  (registration) =>
                    registration.unregister()
                )
              );
            }

            if (
              "caches" in
              window
            ) {
              const keys =
                await caches.keys();

              await Promise.all(
                keys
                  .filter((key) =>
                    key.startsWith(
                      "crla-pwa-"
                    )
                  )
                  .map((key) =>
                    caches.delete(key)
                  )
              );
            }
          } catch {
            /* Recovery is best-effort. */
          } finally {
            window.location.reload();
          }
        })();
      }
    }
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background:
          "linear-gradient(145deg,#f7fbff,#e8f1f8)",
        color: "#193b5b",
        fontFamily:
          "var(--font-outfit), Arial, sans-serif",
      }}
    >
      <section
        style={{
          width: "min(560px,94vw)",
          padding: "32px",
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
            fontWeight: 950,
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
          Your account is still signed in. Reloading the
          current page should restore the assessment workspace.
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => reset()}
            style={{
              minHeight: "48px",
              padding: "0 20px",
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
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            style={{
              minHeight: "48px",
              padding: "0 20px",
              border: "1px solid #cfdeea",
              borderRadius: "12px",
              background: "#eef5fa",
              color: "#2b5d88",
              fontSize: "14px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Reload App
          </button>
        </div>
      </section>
    </main>
  );
}
