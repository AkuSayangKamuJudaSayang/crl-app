"use client";

import { useEffect } from "react";
import TeacherOfflineMenuV2 from "./TeacherOfflineMenuV2";

const HD_HARMONY_ICON = "data:image/webp;base64,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";

export default function TeacherOfflineMenuCompactV3() {
  useEffect(() => {
    const patchHarmonyIcon = () => {
      document.querySelectorAll(".crl-platform-button").forEach((button) => {
        const label = String(button.textContent || "").replace(/\s+/g, " ").trim();
        if (label !== "HarmonyOS") return;
        const image = button.querySelector(".crl-platform-icon");
        if (image && image.src !== HD_HARMONY_ICON) image.src = HD_HARMONY_ICON;
      });
    };

    patchHarmonyIcon();
    const observer = new MutationObserver(patchHarmonyIcon);
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
        .crl-download-backdrop .crl-download-head { margin-bottom: 10px !important; align-items: center !important; }
        .crl-download-backdrop .crl-download-head p { display: none !important; }
        .crl-download-backdrop .crl-download-head h2 { margin: 2px 0 0 !important; font-size: 24px !important; }
        .crl-download-backdrop .crl-download-head > div > div:first-child { margin-bottom: 2px !important; font-size: 10px !important; }
        .crl-download-backdrop .crl-download-close { width: 34px !important; height: 34px !important; flex: 0 0 auto !important; }
        .crl-download-backdrop .crl-platform-grid { grid-template-columns: repeat(5, minmax(0,1fr)) !important; gap: 8px !important; margin: 8px 0 12px !important; }
        .crl-download-backdrop .crl-platform-button { min-height: 86px !important; padding: 8px 6px !important; border-radius: 13px !important; }
        .crl-download-backdrop .crl-platform-icon-wrap { width: 40px !important; height: 40px !important; margin-bottom: 5px !important; border-radius: 11px !important; }
        .crl-download-backdrop .crl-platform-icon { width: 30px !important; height: 30px !important; image-rendering: auto !important; }
        .crl-download-backdrop .crl-download-body { display: block !important; }
        .crl-download-backdrop .crl-download-body > .crl-download-card { display: none !important; }
        .crl-download-backdrop .crl-download-body > .crl-download-card:first-child { display: block !important; border: 0 !important; padding: 0 !important; background: transparent !important; }
        .crl-download-backdrop .crl-download-body > .crl-download-card:first-child h3,
        .crl-download-backdrop .crl-download-body > .crl-download-card:first-child ol,
        .crl-download-backdrop .crl-download-body > .crl-download-card:first-child .crl-download-note { display: none !important; }
        .crl-download-backdrop .crl-install-button { margin-top: 0 !important; min-height: 46px !important; padding: 10px 16px !important; border-radius: 12px !important; font-size: 13px !important; }
        @media (max-width: 620px) {
          .crl-download-backdrop .crl-download-dialog { width: min(520px, calc(100vw - 24px)) !important; max-height: min(360px, calc(100vh - 24px)) !important; padding: 14px !important; }
          .crl-download-backdrop .crl-download-head h2 { font-size: 21px !important; }
          .crl-download-backdrop .crl-platform-grid { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
        }
      `}</style>
    </>
  );
}
