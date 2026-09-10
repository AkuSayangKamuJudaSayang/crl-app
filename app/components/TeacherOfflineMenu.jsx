"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const PLATFORMS = [
  {
    id: "mac",
    name: "Mac",
    icon: "",
    title: "Install on Mac",
    steps: ["Open CRL-App in Safari or Chrome.", "Use the browser Install/Add to Dock option when available.", "Keep CRL-App installed so the teacher workspace and saved local data remain available offline."],
  },
  {
    id: "windows",
    name: "Windows",
    icon: "⊞",
    title: "Install on Windows",
    steps: ["Open CRL-App in Edge or Chrome.", "Choose Install CRL-App from the browser address bar or menu.", "Launch CRL-App from the desktop or Start menu even when the internet is unavailable."],
  },
  {
    id: "android",
    name: "Android",
    icon: "◉",
    title: "Install on Android",
    steps: ["Open CRL-App in Chrome.", "Choose Install app or Add to Home screen.", "Open CRL-App from the home screen for the offline teacher workspace."],
  },
  {
    id: "ios",
    name: "iOS",
    icon: "▣",
    title: "Install on iPhone / iPad",
    steps: ["Open CRL-App in Safari.", "Tap Share, then Add to Home Screen.", "Open the CRL-App icon from the Home Screen to use the installed PWA offline."],
  },
  {
    id: "harmony",
    name: "HarmonyOS",
    icon: "◇",
    title: "Install on HarmonyOS",
    steps: ["Open CRL-App in the supported browser on the device.", "Use Add to Home screen / Install app when offered by the browser.", "Open the saved CRL-App from the device launcher while offline."],
  },
];

function warmOfflineApp() {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  const worker = navigator.serviceWorker.controller;
  if (worker) worker.postMessage({ type: "WARM_CRLA_APP" });
}

export default function TeacherOfflineMenu() {
  const [mount, setMount] = useState(null);
  const [open, setOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState(null);
  const [selected, setSelected] = useState("windows");
  const [warming, setWarming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let observer;

    const findMenu = () => {
      const nav = document.querySelector(".nav");
      if (!nav) return false;
      let node = nav.querySelector(".crl-download-nav-mount");
      if (!node) {
        node = document.createElement("div");
        node.className = "crl-download-nav-mount";
        node.style.width = "100%";
        nav.appendChild(node);
      }
      if (!cancelled) setMount(node);
      return true;
    };

    if (!findMenu()) {
      observer = new MutationObserver(() => {
        if (findMenu()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    const onInstallAvailable = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener("beforeinstallprompt", onInstallAvailable);

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener("beforeinstallprompt", onInstallAvailable);
    };
  }, []);

  useEffect(() => {
    const platform = String(navigator?.userAgent || "").toLowerCase();
    if (/iphone|ipad|ipod/.test(platform)) setSelected("ios");
    else if (/android/.test(platform)) setSelected("android");
    else if (/harmonyos|openharmony/.test(platform)) setSelected("harmony");
    else if (/mac os/.test(platform)) setSelected("mac");
    else setSelected("windows");
  }, []);

  const current = useMemo(
    () => PLATFORMS.find((item) => item.id === selected) || PLATFORMS[1],
    [selected]
  );

  async function install() {
    warmOfflineApp();
    setWarming(true);
    try {
      if (installEvent) {
        installEvent.prompt();
        await installEvent.userChoice.catch(() => null);
        setInstallEvent(null);
      } else if (navigator.serviceWorker?.ready) {
        const registration = await navigator.serviceWorker.ready.catch(() => null);
        registration?.active?.postMessage({ type: "WARM_CRLA_APP" });
      }
    } finally {
      window.setTimeout(() => setWarming(false), 900);
    }
  }

  if (!mount) return null;

  return createPortal(
    <>
      <style>{`
        .crl-download-nav-button { width: 100%; display: flex; align-items: center; gap: 10px; border: 0; background: transparent; color: inherit; padding: 11px 12px; border-radius: 12px; font: inherit; font-weight: 700; cursor: pointer; text-align: left; }
        .crl-download-nav-button:hover { background: rgba(21,89,166,.08); }
        .crl-download-nav-icon { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 9px; background: rgba(21,89,166,.1); color: #1559a6; font-size: 15px; }
        .crl-download-backdrop { position: fixed; inset: 0; z-index: 10050; display: grid; place-items: center; padding: 20px; background: rgba(7,23,42,.54); backdrop-filter: blur(5px); }
        .crl-download-dialog { width: min(920px, 100%); max-height: min(760px, 92vh); overflow: auto; background: #fff; border-radius: 24px; box-shadow: 0 30px 90px rgba(0,0,0,.25); padding: 24px; color: #193b5f; }
        .crl-download-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
        .crl-download-head h2 { margin: 5px 0 7px; font-size: 28px; }
        .crl-download-head p { margin: 0; color: #64768a; line-height: 1.55; }
        .crl-download-close { border: 0; background: #edf3fa; width: 38px; height: 38px; border-radius: 11px; cursor: pointer; font-size: 20px; }
        .crl-platform-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin: 22px 0; }
        .crl-platform-button { border: 1px solid #d9e4ef; background: #fff; border-radius: 15px; padding: 13px 10px; cursor: pointer; color: #244664; font: inherit; font-weight: 800; }
        .crl-platform-button.active { border-color: #1559a6; background: #eef6ff; color: #1559a6; box-shadow: 0 0 0 3px rgba(21,89,166,.09); }
        .crl-platform-icon { display: block; font-size: 22px; margin-bottom: 5px; }
        .crl-download-body { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .crl-download-card { border: 1px solid #dce7f1; border-radius: 18px; padding: 19px; background: #fbfdff; }
        .crl-download-card h3 { margin: 0 0 10px; font-size: 19px; }
        .crl-download-card p { color: #66798d; line-height: 1.55; margin: 0 0 13px; }
        .crl-download-card ol { margin: 0; padding-left: 21px; color: #4f647a; line-height: 1.7; }
        .crl-install-button { width: 100%; border: 0; border-radius: 13px; padding: 13px 16px; background: #1559a6; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
        .crl-install-button:disabled { opacity: .62; cursor: wait; }
        .crl-download-note { margin-top: 15px; padding: 12px 14px; border-radius: 12px; background: #f0f6fc; color: #4d6a84; font-size: 13px; line-height: 1.5; }
        @media (max-width: 760px) { .crl-platform-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .crl-download-body { grid-template-columns: 1fr; } }
      `}</style>
      <button type="button" className="navButton crl-download-nav-button" onClick={() => { warmOfflineApp(); setOpen(true); }}>
        <span className="crl-download-nav-icon">⇩</span>
        <span>Download CRL-App</span>
      </button>
      {open && (
        <div className="crl-download-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="crl-download-dialog" role="dialog" aria-modal="true" aria-labelledby="crl-download-title">
            <div className="crl-download-head">
              <div>
                <div style={{ color: "#1559a6", fontWeight: 800, letterSpacing: ".12em", fontSize: 11 }}>OFFLINE WORKSPACE</div>
                <h2 id="crl-download-title">Download CRL-App</h2>
                <p>Install the CRL-App PWA on this device. Your teacher account and the locally saved teacher workspace are kept on this device for offline use.</p>
              </div>
              <button className="crl-download-close" type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
            </div>

            <div className="crl-platform-grid">
              {PLATFORMS.map((platform) => (
                <button key={platform.id} type="button" className={`crl-platform-button ${selected === platform.id ? "active" : ""}`} onClick={() => setSelected(platform.id)}>
                  <span className="crl-platform-icon">{platform.icon}</span>
                  {platform.name}
                </button>
              ))}
            </div>

            <div className="crl-download-body">
              <div className="crl-download-card">
                <h3>{current.title}</h3>
                <ol>
                  {current.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <button type="button" className="crl-install-button" style={{ marginTop: 17 }} onClick={() => void install()} disabled={warming}>
                  {warming ? "Preparing offline app..." : installEvent ? "Install CRL-App" : "Prepare Offline CRL-App"}
                </button>
                <div className="crl-download-note">The CRL-App download is a web app installation, not a separate copy of your server database. Your teacher account and working data are mirrored into the device&apos;s local database and synchronized back to the cloud when the connection returns.</div>
              </div>

              <div className="crl-download-card">
                <h3>What gets prepared</h3>
                <p>The installed PWA keeps the teacher interface available offline and uses the local database for the teacher account, learners, assessments, activities, and queued changes.</p>
                <ol>
                  <li>Sign in once while connected.</li>
                  <li>Open this menu and prepare the offline app.</li>
                  <li>Keep using the same installed CRL-App on this device.</li>
                  <li>Reconnect later to synchronize pending changes to the cloud.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </>,
    mount
  );
}
