"use client";

import { useEffect, useState } from "react";

// Retain only the outgoing presentation for the CSS exit transition.
// The caller still owns all open/close decisions and assessment state.
export default function MotionPresence({ children }) {
  const [retained, setRetained] = useState(children);
  useEffect(() => {
    if (children) {
      setRetained(children);
      return;
    }
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200;
    const timer = setTimeout(() => setRetained(null), delay);
    return () => clearTimeout(timer);
  }, [children]);
  const visible = children || retained;
  if (!visible) return null;
  return <div className="crl-presence" data-exiting={!children} inert={!children ? true : undefined} aria-hidden={!children ? true : undefined}>{visible}</div>;
}
