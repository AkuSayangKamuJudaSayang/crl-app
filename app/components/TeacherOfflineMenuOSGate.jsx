"use client";

import { useEffect, useState } from "react";
import TeacherOfflineMenuCompactV3 from "./TeacherOfflineMenuCompactV3";

const INSTALL_STATE_KEY = "crl_app_pwa_installed_v1";

function detectOperatingSystem() {
  if (typeof navigator === "undefined") return "unknown";

  const ua = String(navigator.userAgent || "").toLowerCase();
  const platform = String(navigator.platform || "").toLowerCase();
  const uaPlatform = String(navigator.userAgentData?.platform || "").toLowerCase();
  const combined = `${ua} ${platform} ${uaPlatform}`;

  if (/harmonyos|openharmony|hmos/.test(combined)) return "harmony";
  if (/iphone|ipad|ipod/.test(ua) || ((/macintosh|mac os|macintel/.test(combined)) && Number(navigator.maxTouchPoints || 0) > 1)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/windows|win32|win64/.test(combined)) return "windows";
  if (/macintosh|mac os|macintel/.test(combined)) return "mac";
  return "unknown";
}

const OS_LABELS = {
  mac: "macOS",
  windows: "Windows",
  android: "Android",
  ios: "iOS",
  harmony: "HarmonyOS",
};

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches === true || navigator.standalone === true;
}

export default function TeacherOfflineMenuOSGate() {
  const [operatingSystem, setOperatingSystem] = useState("unknown");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = isStandalonePwa();
    setOperatingSystem(detectOperatingSystem());
    setInstalled(standalone);

    if (standalone) {
      try { window.localStorage.setItem(INSTALL_STATE_KEY, "1"); } catch {}
    }

    const onInstalled = () => {
      try { window.localStorage.setItem(INSTALL_STATE_KEY, "1"); } catch {}
      setInstalled(true);
    };

    const onDisplayModeChange = () => {
      if (isStandalonePwa()) {
        try { window.localStorage.setItem(INSTALL_STATE_KEY, "1"); } catch {}
        setInstalled(true);
      }
    };

    window.addEventListener("appinstalled", onInstalled);
    const mediaQuery = window.matchMedia?.("(display-mode: standalone)");
    mediaQuery?.addEventListener?.("change", onDisplayModeChange);
    return () => {
      window.removeEventListener("appinstalled", onInstalled);
      mediaQuery?.removeEventListener?.("change", onDisplayModeChange);
    };
  }, []);

  useEffect(() => {
    const enforceRules = () => {
      const navButton = document.querySelector(".crl-download-nav-button");
      if (navButton) navButton.style.display = isStandalonePwa() || installed ? "none" : "";

      document.querySelectorAll(".crl-platform-button").forEach((button) => {
        const label = String(button.textContent || "").replace(/\s+/g, " ").trim();
        const match = Object.entries(OS_LABELS).find(([, name]) => name === label);
        const platformId = match?.[0] || null;
        const allowed = platformId !== null && platformId === operatingSystem;
        button.disabled = !allowed;
        button.setAttribute("aria-disabled", String(!allowed));
        button.dataset.crlOsAllowed = allowed ? "true" : "false";
        button.classList.toggle("crl-os-disabled", !allowed);
        button.title = allowed ? `Install for ${label}` : `${label} installation is unavailable on this device.`;
      });

      const correctButton = Array.from(document.querySelectorAll(".crl-platform-button")).find((button) => button.dataset.crlOsAllowed === "true");
      if (correctButton && !correctButton.classList.contains("active")) correctButton.click();

      const installButton = document.querySelector(".crl-install-button");
      if (installButton) {
        const ready = operatingSystem !== "unknown" && correctButton?.dataset.crlOsAllowed === "true";
        installButton.dataset.crlOsReady = ready ? "true" : "false";
        installButton.setAttribute("aria-disabled", String(!ready));
        installButton.classList.toggle("crl-install-os-blocked", !ready);
        installButton.title = ready ? `Install CRL-App for ${OS_LABELS[operatingSystem]}` : "CRL-App could not verify a supported device OS.";
      }
    };

    enforceRules();
    const observer = new MutationObserver(enforceRules);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    const guardInstall = (event) => {
      const target = event.target instanceof Element ? event.target.closest(".crl-install-button") : null;
      if (!target || target.dataset.crlOsReady === "true") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };
    document.addEventListener("click", guardInstall, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", guardInstall, true);
    };
  }, [installed, operatingSystem]);

  return (
    <>
      <TeacherOfflineMenuCompactV3 />
      <style jsx global>{`
        .crl-download-backdrop .crl-platform-button.crl-os-disabled {
          opacity: .42 !important;
          filter: grayscale(.22) !important;
          cursor: not-allowed !important;
          transform: none !important;
          box-shadow: none !important;
        }
        .crl-download-backdrop .crl-platform-button.crl-os-disabled:hover {
          transform: none !important;
          border-color: #d9e4ef !important;
          box-shadow: none !important;
        }
        .crl-download-backdrop .crl-platform-button:disabled { pointer-events: none !important; }
        .crl-download-backdrop .crl-install-button.crl-install-os-blocked {
          opacity: .52 !important;
          cursor: not-allowed !important;
        }
      `}</style>
    </>
  );
}
