"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getPwaInstallPrompt, subscribePwaInstallPrompt } from "../../lib/pwaInstall";

const ICONS = {
  download: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAACFUlEQVR42u2ZQU7DMBBFX9KmUGCBWPRegARUgl6ANafgMBwHWCEkVNggsUBCApKw+UZDiNtS4uKgjDSK5cT2/zNjexxDJzMlkbZSUk+5NZYHWJPSJk84a+8BN9K9tnjCxfw6MAVK6VR1jc+JEBYpgU0BLqTrqiubHqwfyBOlgDsDFSHAh47JxFNuDYGVr9UdgY5AR6Aj0BFYGYGmc5ql+0uXbOOStF4D4HumvzQ0gUR5zVAJWv5LEj31MTTJXxKKgLP8PnAJXANjAVgmKeyr7Ri4ku4v64lFE7MN4MG4vARO9C4z3+0Aj+abR9W5vjKVTyp9PWiMxhNAN8k2gHtZ7lVPS2KwAIFBBbzt6z4UAUysH5mB3w2JYxNqPgIuNI49fRxVxiIUiYkHgPPEqIbAqAZ8btpOQoOvnuJ8JA71/skQeFLdgafNJPAJ8ZtkHhKFyqfAnSFwp7pc39SBz1a9i2c1kzE3oN885TwG8LM8kZtDvNUiNvDzSFQJRAl+VjgVNdaPEvw8T+RtAO8jYTV68NV9YgzcSserXueb2rGH0mA7bPLD+p+SeK+kzr+Vhf6vxnxOThe19ADYEuO/vllxGJ6VdnsJpFqvd4FzYJt4roVcQngGXBis3w4sQ77erMSmU2H8/IvR+v9CfeOiFHhR2mtDKIY5YEPoxYZQUjMnysokjkHsJE7m4foXy2isl9IlnXTSrHwA8LL35MdEVT0AAAAASUVORK5CYII=",
  mac: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAEXUlEQVR42u2ZTWhUVxTHf+/NZEgToya1taVNq+BSmn4s3PgBUrQtpTTaLrpRF2INhbpQqbTQkioIWRQLLS104UKF0i5cCKUU+0GlYLT2QzeCGAM2wSBJ2kg+ZzKvi/5vOVzz3swk5r0guXCZy3vv3Hs+/+fcM7A4sh1Blc/SHlECX1EcUQ4IF6CSE/lyUoVAWetGoJAk6Tx7xLBZB4avJuDOTASO+W3Am0Ab8EAG7lQWL73AJuBvKXEbsBd4CrgEtANFp+C8CDuB97XRNDCWkfatR0TAEeA9880GeceUvo0C4DXga2AcOAScBkYzcKFITN0BSsCr4uUvoB94DvgZ2Oy5PJdE/PYCQ8YfJUg3cFM8vmIC+/9RlPYf1oucMWfaMzQBOyKm3Txs3Osu0w0CzRnmAV+QAvANcAv4ToF8l+atAEMZCRB6Gg0FLM4ay2PyQkCcOVJOUGXNRqBB65KUWhaUum+XGpR0AU8+Q+anhSzvCB4D4Ipc5nsltDZgK7AeeBToA04CxxS7YRYu5Px4FzBptF3ygtaf42Z9DngwixhwzL9gmPkIWA20Cvs/kyV6ZY2DstRK4EXBagScBZakKYBDmCYxF3lZ1h91Mc+Py2KRknBqArh426MzfzLPQ52b8+LSoZITpsu4UxfQkqYADvG+NcVjkAAkgUfXCkyI+efTzgNuz4LKgmngySqh3AnYLl7PmL2CtPNAg/B8TKUCNRSN7o4yYpWStgCTcoF6zWrvCQCX9btF1nMQnCoKAZzXmeuS6puY+PlKtFeBN1SApo5CH0urB73nlYQPhTrnTA7pS1MAp+mtOvMPr4Su1oJ1UkJR+ST1RFYPXNe5WxLcKEhIbqdFf8AK0GI0Ml8XFsfAPp170SSr0Kyt1XIe7cui7Xf1kBOgKcXLSyNwTWd3JsCmP1YCN0TX4TaLVHc/o99gni/0rsbfrLIZYD9wAngIeAl4Xdq9AJxSvLQAXwi9ziqWgsBE9Hx3Ilzf51dVlZPAW8Anej+RkBuKxoX+VCkxCARZXWgi+fanapscAtZo3Q18qaLvMWXeteoFnQHelcuHQNlZYBh4NmUX8luaTSoxpmdoLS4xXoLPY1GELRl1IPJeLnDls4PWVXEXer+xtY+FNzqk3N1xpXceOKrW4lEJMpvWYlzvvmJPP2avBmC7Li0F4LYBmxkPmGtztxRT15RqqHesbzcYF/oQ+MDvh1qfCtWHvKJyYqk5MKjy0GX815IvVvG8EjoB/AP8olLh8zjm/WtbrX9wOJrHhc39QrKiyaS/AY+ov9OXxIjH05RBnESavEkyOQNVozW4zxM6ZEC+aseAsDznwWe1d+jAwGriRcH5fnkWhdkm/f4+w/7u2UZTTVa7f7kS83O9WaH6qUeH7VAMrdBsBnbqXQ/wdIVSOdUkVFDg29bfSMy03/zgugn3Soi51kLDgspcQidtSK6Qn0VOqMkdZjOaY2Awbv9hFse9tUCt9NGiyu+38S+EFz/rHoglhwAAAABJRU5ErkJggg==",
  windows: "data:image/png;base64,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",
  android: "data:image/png;base64,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",
  harmony: "data:image/png;base64,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",
  ios: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAADwElEQVR42s2aS2gUQRCGv5lNTKKGoCAa3wdFI4gHEXMQQjzEi4IoIngSCT4OHr1E0LOn4EVFQT2KB8UQRBEPKviARAURFeMjIRolURQh0d2ZHQ+phmLo3cxkk+0ZaGY3uz37/11/VVdVB6p75dTrduAyMAKcl7/VkOHLgN8I9ABFIJJxLusEDLCDwIQC/hcIgZNZJmBW/pACXpB7KPcOi8QyBX6zgA4U6FBkNALMl+95WSPgiyz6BHRgscKprMrHANptAW9efwQahaiXVfncEKkUFPgikAdalaUydZnVrAMGFYG80v9el47ryarl1PBi2gdYJqEyUmMI2KEI1sjIVcMS/hTO5iswACuB38AvoB84DSxO6D9+GlMnXfFQ3s8B1gLLgVpgFPgAjMV8IAc0i3RG1Gdm/jpgkUjsK/AOGIg9I5yJVTdXC9ANvI+lAhHwA7gNdJZYZQ9oA84CbyzzIyH6XELrCjXPqxR8PXAmlgYYZwwsYMaAS8AeYDvQBbywAA7EuQuxMBsBP4ETlZAw4JcAj2MbUGgBXRQQgQWo/k6p+ebzUIXcCLiufMpLG2UWAK+UeYtlwNmABgpQmHCufkZekahPE6UM414FPnIwjCUGJSR7SUjEs0dX4I0Ue4GmpBIyztIIfFGadAW+R614IvmYTarTkoBVaxgHfwvMTSqbeOR5oKKKCwKRSjdq0oJfCoyrSOBCOn1JZeNb0opNQIOAr3aOHsn9ZiUE1sm96DAN748RSkTAXM0ZKIK+VUKgLgMFUTCdTDNtij2bPjAvKRYbgXGHBIzfraqEwEgGLNBaiYQ+O5SSwbNLNrApQ7lvMd+AvM45IhACa4B9aXEYpg3AcGxbd5ELDUk9Urb14sf0l5Oy8WXSODxLVoikJr4mTYOwVE7kl7DCfYcEtJQ6gDtS1gZpnKilRLHuqi4YBg6IvL2kvvDUYUptIxEBx+Mptl8mH7makY5xTjUGHiZJNE1Z2SRJlauyMop1s+/ZFj1XprSckJykXQi4aoFH8ttHmDxP8JMEF2OFhcB3IeCyuH+UtjbW1jkW69G4ILB1OmcJnuowP3HQpTALdqGSgxBjsg1yUFGtvcHI9RMzcIZmmB+eZqeumJK06asWpR0/7dW3Nbwuyo/8mwJAoEDYOtPlCJhnd6XtCyXxBx+4pfwhtJwV2ADly8T3otprzPwrMwk+HlprlSVs4480ZI8CW5g8J1sNbJNVfTaFpLqV/814JqAfuF/AFMTBzSHe+gTPaWPyP1ReM3kAOArcBXamPZH5D38CIxwdnhhvAAAAAElFTkSuQmCC",
};

const PLATFORMS = [
  {
    id: "mac",
    name: "macOS",
    icon: ICONS.mac,
    title: "Install on Mac",
    steps: ["Open CRL-App in Safari or Chrome.", "Use the browser Install/Add to Dock option when available.", "Keep CRL-App installed so the teacher workspace and saved local data remain available offline."],
  },
  {
    id: "windows",
    name: "Windows",
    icon: ICONS.windows,
    title: "Install on Windows",
    steps: ["Open CRL-App in Edge or Chrome.", "Choose Install CRL-App from the browser address bar or menu.", "Launch CRL-App from the desktop or Start menu even when the internet is unavailable."],
  },
  {
    id: "android",
    name: "Android",
    icon: ICONS.android,
    title: "Install on Android",
    steps: ["Open CRL-App in Chrome.", "Choose Install app or Add to Home screen.", "Open CRL-App from the home screen for the offline teacher workspace."],
  },
  {
    id: "ios",
    name: "iOS",
    icon: ICONS.ios,
    title: "Install on iPhone / iPad",
    steps: ["Open CRL-App in Safari.", "Tap Share, then Add to Home Screen.", "Open the CRL-App icon from the Home Screen to use the installed PWA offline."],
  },
  {
    id: "harmony",
    name: "HarmonyOS",
    icon: ICONS.harmony,
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
  const [installEvent, setInstallEvent] = useState(() => getPwaInstallPrompt());
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

    const unsubscribeInstallPrompt = subscribePwaInstallPrompt((event) => {
      setInstallEvent(event);
    });
    const existingInstallPrompt = getPwaInstallPrompt();
    if (existingInstallPrompt) {
      setInstallEvent(existingInstallPrompt);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      unsubscribeInstallPrompt();
    };
  }, []);

  useEffect(() => {
    const platform = String(navigator?.userAgent || "").toLowerCase();
    if (/iphone|ipad|ipod/.test(platform)) setSelected("ios");
    else if (/harmonyos|openharmony/.test(platform)) setSelected("harmony");
    else if (/android/.test(platform)) setSelected("android");
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
      const availableInstallEvent = installEvent || getPwaInstallPrompt();
      if (availableInstallEvent) {
        availableInstallEvent.prompt();
        await availableInstallEvent.userChoice.catch(() => null);
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
        .crl-download-nav-button { width: 100%; min-height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 15px; border: 0; border-radius: 16px; background: linear-gradient(135deg, #1255a6 0%, #2f82d8 100%); color: #fff; box-shadow: 7px 7px 16px rgba(104,139,176,.32), -7px -7px 16px rgba(255,255,255,.90), inset 0 1px 0 rgba(255,255,255,.15); font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; text-align: left; transition: transform .18s ease, box-shadow .20s ease, filter .20s ease, background .20s ease; }
        .crl-download-nav-button:hover { background: linear-gradient(135deg, #155fae 0%, #3790e3 100%); color: #fff; transform: translateY(-1px); box-shadow: 10px 10px 21px rgba(104,139,176,.34), -8px -8px 18px rgba(255,255,255,.96), inset 0 1px 0 rgba(255,255,255,.17); }
        .crl-download-nav-button:active { transform: translateY(1px) scale(.995); box-shadow: inset 5px 5px 12px rgba(5,48,102,.26), inset -5px -5px 12px rgba(255,255,255,.18); }
        .crl-download-nav-button .crl-download-nav-icon { flex: 0 0 22px; width: 22px; height: 22px; display: block; object-fit: contain; filter: brightness(0) invert(1); }
        .crl-download-backdrop { position: fixed; inset: 0; z-index: 10050; display: grid; place-items: center; padding: 20px; background: rgba(7,23,42,.54); backdrop-filter: blur(5px); }
        .crl-download-dialog { width: min(920px, 100%); max-height: min(760px, 92vh); overflow: auto; background: #fff; border-radius: 24px; box-shadow: 0 30px 90px rgba(0,0,0,.25); padding: 24px; color: #193b5f; }
        .crl-download-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
        .crl-download-head h2 { margin: 5px 0 7px; font-size: 28px; }
        .crl-download-head p { margin: 0; color: #64768a; line-height: 1.55; }
        .crl-download-close { border: 0; background: #edf3fa; width: 38px; height: 38px; border-radius: 11px; cursor: pointer; font-size: 20px; }
        .crl-platform-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin: 22px 0; }
        .crl-platform-button { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 105px; border: 1px solid #d9e4ef; background: #fff; border-radius: 15px; padding: 11px 10px; cursor: pointer; color: #244664; font: inherit; font-weight: 800; transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease, background .16s ease; }
        .crl-platform-button:hover { transform: translateY(-1px); border-color: #b8cde2; box-shadow: 0 8px 18px rgba(33,76,112,.08); }
        .crl-platform-button.active { border-color: #1559a6; background: #eef6ff; color: #1559a6; box-shadow: 0 0 0 3px rgba(21,89,166,.09); }
        .crl-platform-icon-wrap { width: 48px; height: 48px; display: grid; place-items: center; margin-bottom: 7px; border-radius: 13px; background: #f0f5fa; }
        .crl-platform-button.active .crl-platform-icon-wrap { background: #e1efff; }
        .crl-platform-icon { width: 34px; height: 34px; display: block; object-fit: contain; }
        .crl-download-body { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .crl-download-card { border: 1px solid #dce7f1; border-radius: 18px; padding: 19px; background: #fbfdff; }
        .crl-download-card h3 { margin: 0 0 10px; font-size: 19px; }
        .crl-download-card p { color: #66798d; line-height: 1.55; margin: 0 0 13px; }
        .crl-download-card ol { margin: 0; padding-left: 21px; color: #4f647a; line-height: 1.7; }
        .crl-install-button { width: 100%; border: 0; border-radius: 13px; padding: 13px 16px; background: linear-gradient(135deg,#1559a6,#2e83d7); color: #fff; font: inherit; font-weight: 800; cursor: pointer; box-shadow: 0 8px 18px rgba(21,89,166,.15); }
        .crl-install-button:hover:not(:disabled) { filter: brightness(1.03); }
        .crl-install-button:disabled { opacity: .62; cursor: wait; }
        .crl-download-note { margin-top: 15px; padding: 12px 14px; border-radius: 12px; background: #f0f6fc; color: #4d6a84; font-size: 13px; line-height: 1.5; }
        @media (max-width: 760px) { .crl-platform-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .crl-download-body { grid-template-columns: 1fr; } }
      `}</style>
      <button type="button" className="navButton crl-download-nav-button" onClick={() => { warmOfflineApp(); setOpen(true); }}>
        <img className="crl-download-nav-icon" src={ICONS.download} alt="" aria-hidden="true" />
        <span className="navLabel">Download CRL-App</span>
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
                  <span className="crl-platform-icon-wrap">
                    <img className="crl-platform-icon" src={platform.icon} alt="" aria-hidden="true" />
                  </span>
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
