"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./ClassWorkspace.module.css";
export default function ClassDialog({
  title,
  onClose,
  busy = false,
  children
}) {
  const ref = useRef(null),
    id = useId(),
    closeRef = useRef(onClose),
    busyRef = useRef(busy);
  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  }, [onClose, busy]);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const handle = e => {
      if (e.key === 'Escape' && !busyRef.current) {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const nodes = [...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')];
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    ref.current?.addEventListener('keydown', handle);
    const el = ref.current;
    return () => {
      el?.removeEventListener('keydown', handle);
      previous?.focus?.();
    };
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(<div className={styles.shade}><div className={styles.dialog} tabIndex={-1} ref={ref} role="dialog" aria-modal="true" aria-labelledby={id}><h2 id={id}>{title}</h2>{children}</div></div>, document.body);
}
