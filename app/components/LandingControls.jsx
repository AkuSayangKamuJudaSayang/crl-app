"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "../landing.module.css";

export default function LandingControls() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const menuButton = useRef(null);
  const closeButton = useRef(null);
  const drawer = useRef(null);

  useEffect(() => {
    const update = () => setShowTop(window.scrollY > 300);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  /*
   * In-page anchors (the hero's "Get Started" -> #access) should glide rather
   * than teleport. Intercept the click, scroll smoothly and still update the
   * hash so the link stays shareable. Reduced-motion users jump instantly.
   */
  useEffect(() => {
    const onDocumentClick = (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target?.closest?.('a[href^="#"]');
      if (!anchor) return;

      const id = decodeURIComponent(String(anchor.getAttribute("href") || "").slice(1));
      if (!id || id === "#") return;

      const target = document.getElementById(id);
      if (!target) return;

      event.preventDefault();

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });

      try {
        window.history.pushState(null, "", `#${id}`);
      } catch {
        /* History may be unavailable in some embedded webviews. */
      }
    };

    /* Capture phase so this runs before next/link's own click handling. */
    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const trigger = menuButton.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, [menuOpen]);

  const onDrawerKeyDown = (event) => {
    if (event.key === "Escape") {
      setMenuOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(drawer.current?.querySelectorAll("button:not([disabled]), a[href]") || []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const scrollToTop = () => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  };

  return (
    <>
      <header className={styles.siteHeader}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="CRL-App home">
            <Image src="/crl-app-logo.png" alt="CRL-App" width={1883} height={755} priority />
          </Link>
          <button
            ref={menuButton}
            className={styles.menuToggle}
            type="button"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls="landing-menu"
            onClick={() => setMenuOpen(true)}
          >
            <span /><span /><span />
          </button>
        </div>
      </header>

      <div className={styles.drawerLayer} data-open={menuOpen} aria-hidden={!menuOpen} inert={!menuOpen}>
        <button className={styles.drawerBackdrop} type="button" aria-label="Close menu" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)} />
        <aside
          id="landing-menu"
          ref={drawer}
          className={styles.drawer}
          role="dialog"
          aria-modal={menuOpen ? "true" : undefined}
          aria-labelledby="landing-menu-title"
          onKeyDown={onDrawerKeyDown}
        >
          <div className={styles.drawerHeader}>
            <h2 id="landing-menu-title">Menu</h2>
            <button ref={closeButton} type="button" className={styles.drawerClose} aria-label="Close menu" onClick={() => setMenuOpen(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5 19 19M19 5 5 19" /></svg>
            </button>
          </div>
          <nav aria-label="More options" className={styles.drawerOptions}>
            <div><span>Report a Bug</span><small>Coming soon</small></div>
            <div><span>Feedback</span><small>Coming soon</small></div>
          </nav>
        </aside>
      </div>

      {showTop && (
        <button className={styles.backToTop} type="button" aria-label="Back to top" onClick={scrollToTop}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 14 7-7 7 7M12 7v12" /></svg>
        </button>
      )}
    </>
  );
}
