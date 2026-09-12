"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

const INSTALL_PROMPT_GLOBAL = "__crlLearnerInstallPrompt";
const INSTALL_PROMPT_EVENT = "crl-learner-install-prompt-ready";
const INSTALL_LISTENER_GLOBAL = "__crlLearnerInstallListenerInstalled";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.(
      "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen), (display-mode: window-controls-overlay)"
    )?.matches || window.navigator.standalone === true
  );
}

function getBrowserName() {
  if (typeof navigator === "undefined") return "your browser";
  const ua = navigator.userAgent || "";
  if (/Brave/i.test(ua)) return "Brave";
  if (/Edg\//i.test(ua)) return "Microsoft Edge";
  if (/Chrome\//i.test(ua)) return "Google Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  return "your browser";
}

function findJoinAssessmentCard() {
  const cards = Array.from(document.querySelectorAll(".card"));
  return cards.find((card) => {
    const title = card.querySelector(".title")?.textContent?.trim();
    const joinButton = card.querySelector("button.primary");
    return title === "Join Assessment" && !!joinButton;
  }) || null;
}

function getStoredInstallPrompt() {
  if (typeof window === "undefined") return null;
  return window[INSTALL_PROMPT_GLOBAL] || null;
}

function clearStoredInstallPrompt() {
  if (typeof window === "undefined") return;
  window[INSTALL_PROMPT_GLOBAL] = null;
}

/*
 * Capture beforeinstallprompt at module evaluation time so the browser cannot
 * fire it before the React effect installs its listener. The actual prompt is
 * still only triggered by the learner's button click.
 */
if (
  typeof window !== "undefined" &&
  !window[INSTALL_LISTENER_GLOBAL]
) {
  window[INSTALL_LISTENER_GLOBAL] = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window[INSTALL_PROMPT_GLOBAL] = event;
    window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT));
  });

  window.addEventListener("appinstalled", () => {
    clearStoredInstallPrompt();
    window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT));
  });
}

export default function LearnerInstallButton() {
  const [ready, setReady] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [mountNode, setMountNode] = useState(null);

  useEffect(() => {
    const standalone = isStandalone();
    setInstalled(standalone);
    setReady(true);
    setDeferredPrompt(getStoredInstallPrompt());

    const handlePromptReady = () => {
      setDeferredPrompt(getStoredInstallPrompt());
      if (isStandalone()) {
        setInstalled(true);
        setShowHelp(false);
      }
    };

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      window[INSTALL_PROMPT_GLOBAL] = event;
      setDeferredPrompt(event);
    };

    const handleAppInstalled = () => {
      clearStoredInstallPrompt();
      setDeferredPrompt(null);
      setInstalled(true);
      setShowHelp(false);
    };

    window.addEventListener(INSTALL_PROMPT_EVENT, handlePromptReady);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(INSTALL_PROMPT_EVENT, handlePromptReady);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!ready || installed) {
      setMountNode(null);
      return undefined;
    }

    let cancelled = false;
    let observer = null;
    let createdNode = null;

    const syncMount = () => {
      if (cancelled) return;

      const card = findJoinAssessmentCard();

      if (!card) {
        if (createdNode && !createdNode.isConnected) {
          createdNode = null;
        }
        setMountNode(null);
        return;
      }

      let node = card.nextElementSibling;
      if (!node || !node.classList.contains("learner-install-mount")) {
        node = document.createElement("div");
        node.className = "learner-install-mount";
        card.insertAdjacentElement("afterend", node);
        createdNode = node;
      }

      setMountNode(node);
    };

    syncMount();
    observer = new MutationObserver(syncMount);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (createdNode?.parentNode) {
        createdNode.parentNode.removeChild(createdNode);
      }
      setMountNode(null);
    };
  }, [ready, installed]);

  async function waitForInstallPrompt(timeoutMs = 2500) {
    const existing = deferredPrompt || getStoredInstallPrompt();
    if (existing) return existing;

    try {
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.ready;
      }
    } catch {
      // Continue; the prompt may still already be available.
    }

    const readyPrompt = deferredPrompt || getStoredInstallPrompt();
    if (readyPrompt) return readyPrompt;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (prompt) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        window.removeEventListener(INSTALL_PROMPT_EVENT, onReady);
        resolve(prompt || null);
      };
      const onReady = () => {
        finish(getStoredInstallPrompt());
      };
      const timer = window.setTimeout(() => finish(getStoredInstallPrompt()), timeoutMs);
      window.addEventListener(INSTALL_PROMPT_EVENT, onReady, { once: true });
    });
  }

  async function handleInstall() {
    const prompt = await waitForInstallPrompt();

    if (prompt) {
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch {
        // The browser may dismiss or reject the native install prompt.
      } finally {
        clearStoredInstallPrompt();
        setDeferredPrompt(null);
      }
      return;
    }

    setShowHelp(true);
  }

  if (!ready || installed || !mountNode) return null;

  return createPortal(
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
            <div className="learner-install-eyebrow">INSTALL CRL-APP LEARNER</div>
            <h2 id="learner-install-title">Install from {getBrowserName()}</h2>
            <p>
              The browser did not make its install prompt available on this page.
              Open the browser menu and choose the app installation option.
            </p>
            <ol>
              <li>Open the browser menu.</li>
              <li>Choose <strong>Install CRL-App Learner</strong> or <strong>Install app</strong>.</li>
              <li>Confirm the installation.</li>
            </ol>
            <button
              type="button"
              className="learner-install-close"
              onClick={() => setShowHelp(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .learner-install-mount {
          width: 100%;
        }

        .learner-install-wrap {
          width: 100%;
          display: flex;
          justify-content: center;
          margin-top: 12px;
          padding: 0 2px 2px;
        }

        .learner-install-button {
          appearance: none;
          border: 1px solid rgba(21, 89, 166, 0.22);
          border-radius: 12px;
          padding: 10px 16px;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          background: #eef5ff;
          color: #1559a6;
          font-weight: 850;
          font-size: 13px;
          cursor: pointer;
          box-shadow: 0 8px 20px rgba(21, 89, 166, 0.10);
          transition: transform .16s ease, box-shadow .16s ease, background .16s ease;
        }

        .learner-install-button:hover {
          transform: translateY(-1px);
          background: #e7f0ff;
          box-shadow: 0 12px 26px rgba(21, 89, 166, 0.15);
        }

        .learner-install-button:active {
          transform: translateY(1px) scale(.99);
        }

        .learner-install-overlay {
          position: fixed;
          inset: 0;
          z-index: 12000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(8, 20, 34, 0.55);
          backdrop-filter: blur(8px);
        }

        .learner-install-dialog {
          width: min(100%, 440px);
          border-radius: 22px;
          background: #fff;
          color: #18324f;
          padding: 26px;
          box-shadow: 0 26px 80px rgba(0, 0, 0, 0.24);
        }

        .learner-install-icon {
          width: 52px;
          height: 52px;
          border-radius: 15px;
          display: grid;
          place-items: center;
          background: #eef5ff;
          font-size: 25px;
          margin-bottom: 12px;
        }

        .learner-install-eyebrow {
          color: #1559a6;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.13em;
        }

        .learner-install-dialog h2 {
          margin: 7px 0 10px;
          font-size: 23px;
          line-height: 1.12;
        }

        .learner-install-dialog p,
        .learner-install-dialog ol {
          margin: 0;
          line-height: 1.55;
          font-size: 13px;
        }

        .learner-install-dialog p { color: #65778d; }
        .learner-install-dialog ol { margin-top: 14px; padding-left: 19px; color: #334960; }
        .learner-install-dialog li + li { margin-top: 5px; }

        .learner-install-close {
          margin-top: 18px;
          width: 100%;
          min-height: 44px;
          border: 0;
          border-radius: 11px;
          background: #1559a6;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }

        @media (max-width: 680px) {
          .learner-install-wrap {
            margin-top: 10px;
            padding-bottom: 0;
          }

          .learner-install-button {
            width: min(100%, 360px);
            min-height: 46px;
            font-size: 13px;
          }
        }
      `}</style>
    </>,
    mountNode
  );
}
