"use client";

import { useEffect, useState } from "react";

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export default function LearnerInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return undefined;
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
      setShowHelp(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (installed) {
    return null;
  }

  const handleInstall = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } catch {
        // The browser can reject the prompt when the install flow is unavailable.
      } finally {
        setDeferredPrompt(null);
      }
      return;
    }

    setShowHelp(true);
  };

  return (
    <>
      <div className="learner-install-wrap">
        <button
          type="button"
          className="learner-install-button"
          onClick={handleInstall}
          aria-label="Install CRL-App Learner"
        >
          <span aria-hidden="true">📲</span>
          <span>Install CRL-App Learner</span>
        </button>
      </div>

      {showHelp && (
        <div
          className="learner-install-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="learner-install-title"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="learner-install-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="learner-install-icon" aria-hidden="true">
              📲
            </div>
            <h2 id="learner-install-title">Install CRL-App Learner</h2>
            <p>
              Your browser has not exposed its direct install prompt yet.
              Use the browser menu and choose <strong>Install app</strong> or
              <strong> Add to Home screen</strong> while you are on this
              learner page.
            </p>
            <p className="learner-install-url">
              https://crl-app-tau.vercel.app/learner
            </p>
            <button
              type="button"
              className="learner-install-close"
              onClick={() => setShowHelp(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .learner-install-wrap {
          display: flex;
          justify-content: center;
          margin-top: 12px;
        }

        .learner-install-button {
          appearance: none;
          border: 1px solid rgba(21, 89, 166, 0.28);
          border-radius: 12px;
          padding: 10px 16px;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          background: #eef5ff;
          color: #1559a6;
          font-weight: 800;
          font-size: 14px;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(21, 89, 166, 0.08);
        }

        .learner-install-button:hover {
          background: #e7f0ff;
        }

        .learner-install-button:active {
          transform: translateY(1px);
        }

        .learner-install-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(8, 20, 34, 0.55);
        }

        .learner-install-dialog {
          width: min(100%, 420px);
          border-radius: 20px;
          background: #ffffff;
          color: #18324f;
          padding: 24px;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.24);
        }

        .learner-install-icon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: #eef5ff;
          font-size: 26px;
          margin-bottom: 14px;
        }

        .learner-install-dialog h2 {
          margin: 0 0 10px;
          font-size: 22px;
        }

        .learner-install-dialog p {
          margin: 0 0 12px;
          line-height: 1.55;
        }

        .learner-install-url {
          word-break: break-word;
          font-size: 13px;
          color: #1559a6;
        }

        .learner-install-close {
          margin-top: 8px;
          width: 100%;
          min-height: 44px;
          border: 0;
          border-radius: 12px;
          background: #1559a6;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }
      `}</style>
    </>
  );
}
