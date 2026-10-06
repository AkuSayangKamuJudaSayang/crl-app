"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  claimAssessmentPeerLink,
  disconnectAssessmentPeer,
  findLinkedAssessmentPeerSession,
} from "../lib/assessmentPeer";

/*
 * An offline assessment runs over the dashboard instead of on its own route.
 *
 * The link between the two devices lives in this window, so a real navigation
 * to the assessment route - which is how the teacher used to get there reloads
 * the page, drops that link, and makes every further assessment ask for another
 * QR scan or another code to copy. Showing the assessment over the dashboard
 * keeps the page, and therefore the link, alive: the teacher starts the next
 * learner exactly as before and the learner's device is carried across without
 * being asked for anything at all.
 *
 * The route is still the fallback. If the assessment screen cannot be loaded
 * from the offline cache, the teacher is sent there exactly as before, so a
 * device that was never prepared online keeps working the way it always did.
 */
export default function OfflineAssessmentOverlay({
  code,
  learnerId,
  period,
  url,
  onExit,
}) {
  const [AssessmentView, setAssessmentView] = useState(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const target = String(code || "").trim().toUpperCase();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      /*
       * A device that is already linked is asked to follow the link into this
       * assessment before the screen can offer a code for it. An unanswered
       * claim means there is no usable link after all, so the stale one is
       * released and the screen pairs from scratch.
       */
      const linked = findLinkedAssessmentPeerSession("teacher");
      if (linked && linked.code !== target) {
        const claimed = await claimAssessmentPeerLink(target);
        if (cancelled) return;
        if (!claimed) disconnectAssessmentPeer(linked.code);
      }

      try {
        const module = await import("../app/teacher/assessment/AssessmentClient");
        if (!cancelled) setAssessmentView(() => module.default);
      } catch {
        /* Nothing cached to show: use the route, exactly as before. */
        if (!cancelled) window.location.assign(url);
      }
    })();

    return () => { cancelled = true; };
  }, [target, url]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="crl-offline-assessment"
      role="dialog"
      aria-modal="true"
      aria-label="Offline assessment"
    >
      <style>{`
        .crl-offline-assessment{position:fixed;inset:0;z-index:12500;overflow:auto;overscroll-behavior:contain;background:#fafafa}
        .crl-offline-assessment-wait{display:grid;place-items:center;min-height:100vh;color:#1f2a3c;font:700 15px/1.5 Arial,Helvetica,sans-serif}
      `}</style>
      {AssessmentView ? (
        <AssessmentView
          key={target}
          initialCode={target}
          initialLearnerId={String(learnerId ?? "")}
          initialPeriod={period}
          onExit={() => exitRef.current?.()}
        />
      ) : (
        <div className="crl-offline-assessment-wait" role="status">
          Preparing the assessment…
        </div>
      )}
    </div>,
    document.body
  );
}
