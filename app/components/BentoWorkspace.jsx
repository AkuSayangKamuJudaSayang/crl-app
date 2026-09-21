"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./BentoWorkspace.module.css";

// Presentation-only shell: collapsing never unmounts the current workspace.
export default function BentoWorkspace({ items, activeId, onSelect, onLogout, tools, children, initialOpen = false }) {
  const [phase, setPhase] = useState(initialOpen ? "open" : "closed");
  const [origin, setOrigin] = useState({});
  const tiles = useRef({});
  const closeButton = useRef(null);
  const timer = useRef(null);
  const restoreFocus = useRef(false);
  const currentId = useRef(activeId);
  currentId.current = activeId;

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (initialOpen) setPhase("open");
  }, [initialOpen]);
  useEffect(() => {
    if (phase === "open") closeButton.current?.focus({ preventScroll: true });
    if (phase === "closed" && restoreFocus.current) {
      tiles.current[currentId.current]?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [phase]);

  const measure = (id) => {
    const rect = tiles.current[id]?.getBoundingClientRect();
    if (!rect) return;
    setOrigin({
      "--tile-x": `${rect.left}px`, "--tile-y": `${rect.top}px`,
      "--tile-sx": rect.width / window.innerWidth,
      "--tile-sy": rect.height / window.innerHeight,
    });
  };
  const open = (id) => {
    if (phase !== "closed") return;
    measure(id);
    onSelect(id);
    setPhase("opening");
    timer.current = setTimeout(() => setPhase("open"), 240);
  };
  const close = () => {
    if (phase !== "open") return;
    measure(currentId.current);
    restoreFocus.current = true;
    setPhase("closing");
    timer.current = setTimeout(() => {
      setPhase("closed");
    }, 240);
  };

  return (
    <div className={styles.workspace} data-bento-workspace>
      <div className={styles.launcher} style={{ visibility: phase === "closed" ? "visible" : "hidden" }} inert={phase !== "closed" ? true : undefined} aria-hidden={phase !== "closed"}>
        <header className={styles.masthead}>
          <span className={styles.wordmark}>CRL<span> / </span>App</span>
          <div className={styles.tools}>{tools}</div>
        </header>
        <nav className={styles.grid} aria-label="Main menu">
          {items.map((item, index) => (
            <button key={item.id} ref={(node) => { tiles.current[item.id] = node; }}
              type="button" className={styles.tile} data-wide={item.id === "activities" || item.id === "overview" || item.id === "invites"} data-tone={item.id === "conduct" ? "navy" : item.id === "profile" ? "red" : "ivory"}
              aria-controls="bento-page" aria-expanded={phase !== "closed" && activeId === item.id}
              onClick={() => open(item.id)}>
              <span className={styles.index} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <span className={styles.label}>{item.label}</span>
              <span className={styles.arrow} aria-hidden="true">↗</span>
            </button>
          ))}
          <button type="button" className={`${styles.tile} ${styles.logout}`} onClick={onLogout}>Sign out</button>
        </nav>
      </div>
      <div id="bento-page" className={styles.panel} data-phase={phase} style={origin}
        hidden={phase === "closed"} inert={phase === "closing" ? true : undefined}
        role="region" aria-label={items.find((item) => item.id === activeId)?.label}
        onKeyDown={(event) => {
          // Do not intercept Escape from a form or nested dialog.
          if (event.key === "Escape" && event.target === closeButton.current) close();
        }}>
        <div className={styles.pageBar}>
          <span>{items.find((item) => item.id === activeId)?.label}</span>
          <button ref={closeButton} type="button" onClick={close} aria-label="Close page and return to main menu">Close <span aria-hidden="true">×</span></button>
        </div>
        <div className={styles.pageContent}>{children}</div>
      </div>
    </div>
  );
}
