"use client";

import { useEffect } from "react";

const LEARNER_MANIFEST = "/learner/manifest.webmanifest";

export default function LearnerPwaShell({ children }) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const previous = {
      htmlOverscrollY: html.style.overscrollBehaviorY,
      bodyOverscrollY: body.style.overscrollBehaviorY,
      htmlTouchAction: html.style.touchAction,
      bodyTouchAction: body.style.touchAction,
      manifestLinks: Array.from(
        document.querySelectorAll('link[rel="manifest"]')
      ).map((link) => ({
        link,
        href: link.getAttribute("href"),
      })),
    };

    const ensureLearnerManifest = () => {
      const links = Array.from(
        document.querySelectorAll('link[rel="manifest"]')
      );

      links.forEach((link) => {
        if (link.getAttribute("href") !== LEARNER_MANIFEST) {
          link.remove();
        }
      });

      let learnerLink = document.querySelector(
        `link[rel="manifest"][href="${LEARNER_MANIFEST}"]`
      );

      if (!learnerLink) {
        learnerLink = document.createElement("link");
        learnerLink.rel = "manifest";
        learnerLink.href = LEARNER_MANIFEST;
        document.head.appendChild(learnerLink);
      }
    };

    ensureLearnerManifest();

    html.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";
    html.style.touchAction = "pan-x pan-y";
    body.style.touchAction = "pan-x pan-y";

    let startY = 0;

    const handleTouchStart = (event) => {
      if (event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
    };

    const handleTouchMove = (event) => {
      if (event.touches.length !== 1) return;
      const currentY = event.touches[0].clientY;
      const pullingDown = currentY > startY;
      const atTop = window.scrollY <= 0;

      if (pullingDown && atTop) {
        event.preventDefault();
      }
    };

    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    document.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });

    let appInstalledMedia;
    const mediaQuery = window.matchMedia?.("(display-mode: standalone)");
    if (mediaQuery?.addEventListener) {
      appInstalledMedia = () => {
        ensureLearnerManifest();
      };
      mediaQuery.addEventListener("change", appInstalledMedia);
    }

    // Register a learner-only service worker when the browser supports it.
    // The scope stays under /learner and cannot take ownership of /teacher or /. 
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/learner-pwa-sw.js", { scope: "/learner/" })
        .catch(() => {});
    }

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      if (mediaQuery?.removeEventListener && appInstalledMedia) {
        mediaQuery.removeEventListener("change", appInstalledMedia);
      }

      html.style.overscrollBehaviorY = previous.htmlOverscrollY;
      body.style.overscrollBehaviorY = previous.bodyOverscrollY;
      html.style.touchAction = previous.htmlTouchAction;
      body.style.touchAction = previous.bodyTouchAction;

      const currentLinks = Array.from(
        document.querySelectorAll('link[rel="manifest"]')
      );
      currentLinks.forEach((link) => link.remove());

      const hadOriginalManifest = previous.manifestLinks.length > 0;
      if (hadOriginalManifest) {
        previous.manifestLinks.forEach(({ href }) => {
          const restored = document.createElement("link");
          restored.rel = "manifest";
          restored.href = href;
          document.head.appendChild(restored);
        });
      }
    };
  }, []);

  return <>{children}</>;
}
