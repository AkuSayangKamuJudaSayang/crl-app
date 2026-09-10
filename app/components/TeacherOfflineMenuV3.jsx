"use client";

import { useEffect } from "react";
import TeacherOfflineMenuV2 from "./TeacherOfflineMenuV2";

const HARMONY_ICON = "data:image/png;base64,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";

export default function TeacherOfflineMenuV3() {
  useEffect(() => {
    const patchHarmony = () => {
      document.querySelectorAll(".crl-platform-button").forEach((button) => {
        if (String(button.textContent || "").replace(/\s+/g, " ").trim() !== "HarmonyOS") return;
        const image = button.querySelector(".crl-platform-icon");
        if (image) image.src = HARMONY_ICON;
      });
    };
    patchHarmony();
    const observer = new MutationObserver(patchHarmony);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <TeacherOfflineMenuV2 />;
}
