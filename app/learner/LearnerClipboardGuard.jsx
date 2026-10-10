"use client";

import { useEffect } from "react";
import { installLearnerClipboardGuard } from "../../lib/learnerClipboard";

export default function LearnerClipboardGuard() {
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen), (display-mode: window-controls-overlay)");
    let release;
    const follow = () => {
      const installed = media.matches || navigator.standalone === true || document.referrer.startsWith("android-app://");
      if (installed && !release) release = installLearnerClipboardGuard(document);
      if (!installed && release) { release(); release = undefined; }
    };
    follow();
    media.addEventListener?.("change", follow);
    window.addEventListener("appinstalled", follow);
    return () => { media.removeEventListener?.("change", follow); window.removeEventListener("appinstalled", follow); release?.(); };
  }, []);
  return <style>{`
    html[data-crl-learner-restricted] *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
    html[data-crl-learner-restricted] img{-webkit-user-drag:none}
    html[data-crl-learner-restricted] input[data-crl-code-field],html[data-crl-learner-restricted] textarea[data-crl-code-field]{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}
  `}</style>;
}
