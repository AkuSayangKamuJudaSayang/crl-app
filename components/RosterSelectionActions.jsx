"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./RosterSelectionActions.module.css";

// Mobile stays in normal flow below the filters. Native sticky positioning is
// handled by the browser during momentum scrolling, with no JS scroll tracking.
// Desktop reuses its original inline toolbar target and the same action group.
export default function RosterSelectionActions({ inlineTargetRef, selectionCount, suspended = false, children }) {
  const [inlineTarget, setInlineTarget] = useState(null);
  useLayoutEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const sync = () => setInlineTarget(media.matches ? null : inlineTargetRef.current);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [inlineTargetRef]);

  const actions = <div className={styles.bar} role="group" aria-label="Learner selection actions">{children}</div>;
  if (inlineTarget) return createPortal(actions, inlineTarget);
  return <div className={`${styles.slot}${selectionCount && !suspended ? ` ${styles.active}` : ""}`}>{actions}</div>;
}
