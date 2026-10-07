"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  claimAssessmentPeerLink,
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
 * A missing cached screen or an unanswered handoff leaves this dashboard
 * available for recovery without navigating away from the device link.
 */
export default function OfflineAssessmentOverlay({
  code,
  learnerId,
  period,
  url,
  onExit,
}) {
  const [AssessmentView, setAssessmentView] = useState(null);
  const [connectionError, setConnectionError] = useState("");
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const target = String(code || "").trim().toUpperCase();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      /*
       * A device that is already linked is asked to follow the link into this
       * assessment before the screen opens. An unanswered claim returns the
       * teacher to the roster settings instead of starting an unlinked run.
       */
      const linked = findLinkedAssessmentPeerSession("teacher");
      if (!linked) {
        setConnectionError("Connect the learner device in Offline settings first.");
        return;
      }
      if (linked.code !== target) {
        const claimed = await claimAssessmentPeerLink(target);
        if (cancelled) return;
        if (!claimed) {
          setConnectionError("The learner device did not respond. Reconnect in Offline settings.");
          return;
        }
      }

      try {
        const module = await import("../app/teacher/assessment/AssessmentClient");
        if (!cancelled) setAssessmentView(() => module.default);
      } catch {
        if (!cancelled) setConnectionError("The assessment screen is not available offline. Open your class online once to prepare it.");
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
      {connectionError ? <div className="crl-offline-assessment-wait"><div role="alert">{connectionError}<p><button type="button" onClick={() => exitRef.current?.()}>Back to enrolled learners</button></p></div></div> : AssessmentView ? (
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
