"use client";

import { useEffect, useRef, useState } from "react";
import { getPwaInstallPrompt } from "../../lib/pwaInstall";
import styles from "./TeacherDownloadButton.module.css";

function installationHint() {
  if (typeof navigator === "undefined") return "Choose Install app or Add to home screen in your browser menu.";
  const agent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(agent) || (/macintosh/.test(agent) && navigator.maxTouchPoints > 1)) {
    return "In Safari, tap Share, then Add to Home Screen.";
  }
  if (/harmonyos|openharmony|hmos/.test(agent)) {
    return "In your browser menu, choose Install app or Add to home screen.";
  }
  if (/android/.test(agent)) return "In your browser menu, choose Install app or Add to home screen.";
  if (/macintosh/.test(agent)) return "In Safari or Chrome, choose Add to Dock or Install app.";
  return "In Edge or Chrome, choose Install app in the address bar or browser menu.";
}

export default function TeacherDownloadButton({ className }) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [hint, setHint] = useState("");
  const timer = useRef(null);
  const opener = useRef(null);
  const closeButton = useRef(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (visible && !closing) closeButton.current?.focus({ preventScroll: true });
  }, [visible, closing]);

  const close = () => {
    setClosing(true);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200;
    timer.current = window.setTimeout(() => {
      setVisible(false);
      setClosing(false);
      opener.current?.focus({ preventScroll: true });
    }, delay);
  };

  const download = () => {
    const prompt = getPwaInstallPrompt();
    if (prompt) {
      try {
        Promise.resolve(prompt.prompt()).catch(() => {
          setHint(installationHint());
          setVisible(true);
        });
        return;
      } catch {
        // A previously handled prompt can only be displayed once.
      }
    }
    setHint(installationHint());
    setVisible(true);
  };

  return (
    <>
      <button ref={opener} className={className} type="button" onClick={download}
        aria-haspopup="dialog" aria-expanded={visible}>
        Download
      </button>
      {visible && (
        <div className={`${styles.overlay} ${closing ? styles.closing : ""}`}
          role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div className={styles.dialog} role="dialog" aria-modal="true"
            aria-labelledby="teacher-install-title" aria-describedby="teacher-install-text"
            onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
            <h2 id="teacher-install-title">Install teacher dashboard</h2>
            <p id="teacher-install-text">{hint}</p>
            <button ref={closeButton} type="button" onClick={close}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
