"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./RosterSelectionActions.module.css";

// Keep a real slot in the toolbar. A portal avoids transformed/clipped dashboard
// ancestors and follows that slot until it reaches the mobile viewport's top.
export default function RosterSelectionActions({ selectionCount, suspended = false, children }) {
  const slot = useRef(null), bar = useRef(null);
  const [placement, setPlacement] = useState(null);
  const floating = placement !== null;
  useLayoutEffect(() => {
    if (!selectionCount || suspended) { setPlacement(null); return; }
    const media = window.matchMedia("(max-width: 768px)");
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!media.matches || !slot.current || !bar.current) { setPlacement(null); return; }
      const rect = slot.current.getBoundingClientRect();
      const next = { top: Math.max(0, rect.top), left: rect.left, width: rect.width, height: bar.current.getBoundingClientRect().height };
      setPlacement(previous => previous && Object.keys(next).every(key => previous[key] === next[key]) ? previous : next);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(slot.current);
    if (bar.current) observer?.observe(bar.current);
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    media.addEventListener?.("change", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      media.removeEventListener?.("change", schedule);
    };
  }, [selectionCount, suspended, floating]);

  const actions = <div ref={bar} className={`${styles.bar}${placement ? ` ${styles.floating}` : ""}`} role="group" aria-label="Learner selection actions"
    style={placement ? { "--roster-actions-top": `${placement.top}px`, left: placement.left, width: placement.width } : undefined}>{children}</div>;
  return <div ref={slot} className={styles.slot} style={placement ? { height: placement.height } : undefined}>
    {placement ? createPortal(actions, document.body) : actions}
  </div>;
}
