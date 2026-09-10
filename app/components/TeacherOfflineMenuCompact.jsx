"use client";

import { useEffect } from "react";
import TeacherOfflineMenuV2 from "./TeacherOfflineMenuV2";

const HD_HARMONY_ICON = "data:image/webp;base64,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";

export default function TeacherOfflineMenuCompact() {
  useEffect(() => {
    const applyCompactMenu = () => {
      document.querySelectorAll(".crl-platform-button").forEach((button) => {
        const label = String(button.textContent || "").replace(/\s+/g, " ").trim();
        if (label === "HarmonyOS") {
          const image = button.querySelector(".crl-platform-icon");
          if (image && image.src !== HD_HARMONY_ICON) image.src = HD_HARMONY_ICON;
        }
      });

      document.querySelectorAll(".crl-install-button").forEach((button) => {
        button.textContent = "Install CRL-App";
      });
    };

    applyCompactMenu();
    const observer = new MutationObserver(applyCompactMenu);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <TeacherOfflineMenuV2 />
      <style jsx global>{`
        .crl-download-backdrop .crl-download-dialog {
          width: min(720px, calc(100vw - 32px)) !important;
          max-height: min(430px, calc(100vh - 32px)) !important;
          overflow: hidden !important;
          padding: 18px !important;
          border-radius: 20px !important;
        }

        .crl-download-backdrop .crl-download-head {
          margin-bottom: 10px !important;
          align-items: center !important;
        }

        .crl-download-backdrop .crl-download-head p {
          display: none !important;
        }

        .crl-download-backdrop .crl-download-head h2 {
          margin: 2px 0 0 !important;
          font-size: 24px !important;
        }

        .crl-download-backdrop .crl-download-head > div > div:first-child {
          margin-bottom: 2px !important;
          font-size: 10px !important;
        }

        .crl-download-backdrop .crl-download-close {
          width: 34px !important;
          height: 34px !important;
          flex: 0 0 auto !important;
        }

        .crl-download-backdrop .crl-platform-grid {
          grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
          gap: 8px !important;
          margin: 8px 0 12px !important;
        }

        .crl-download-backdrop .crl-platform-button {
          min-height: 86px !important;
          padding: 8px 6px !important;
          border-radius: 13px !important;
        }

        .crl-download-backdrop .crl-platform-icon-wrap {
          width: 40px !important;
          height: 40px !important;
          margin-bottom: 5px !important;
          border-radius: 11px !important;
        }

        .crl-download-backdrop .crl-platform-icon {
          width: 30px !important;
          height: 30px !important;
        }

        .crl-download-backdrop .crl-download-body {
          display: block !important;
        }

        .crl-download-backdrop .crl-download-body > .crl-download-card {
          display: none !important;
        }

        .crl-download-backdrop .crl-download-body > .crl-download-card:first-child {
          display: block !important;
          border: 0 !important;
          padding: 0 !important;
          background: transparent !important;
        }

        .crl-download-backdrop .crl-download-body > .crl-download-card:first-child h3,
        .crl-download-backdrop .crl-download-body > .crl-download-card:first-child ol,
        .crl-download-backdrop .crl-download-body > .crl-download-card:first-child .crl-download-note {
          display: none !important;
        }

        .crl-download-backdrop .crl-install-button {
          margin-top: 0 !important;
          min-height: 46px !important;
          padding: 10px 16px !important;
          border-radius: 12px !important;
          font-size: 13px !important;
        }

        @media (max-width: 620px) {
          .crl-download-backdrop .crl-download-dialog {
            width: min(520px, calc(100vw - 24px)) !important;
            max-height: min(360px, calc(100vh - 24px)) !important;
            padding: 14px !important;
          }

          .crl-download-backdrop .crl-download-head h2 {
            font-size: 21px !important;
          }

          .crl-download-backdrop .crl-platform-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
      `}</style>
    </>
  );
}
