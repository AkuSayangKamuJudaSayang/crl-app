"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptLearnerAssessmentOffer,
  completeTeacherAssessmentPairing,
  getAssessmentPeerStatus,
  startTeacherAssessmentPairing,
  subscribeAssessmentPeerStatus,
} from "../lib/assessmentPeer";
import {
  publishAssessmentPairingAnswer,
  publishAssessmentPairingOffer,
  subscribeAssessmentPairingAnswer,
  subscribeAssessmentPairingOffer,
} from "../lib/assessmentChannel";

function normalizeCode(code) {
  return String(code || "").replace(/\s+/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/*
 * Two ways to put both devices on one network. They are confirmers only: the
 * assessment code and its QR in the assessment code card are the single thing
 * the learner connects with, and the local link is negotiated over the relay
 * without either side scanning a second code.
 */
const METHODS = [
  {
    id: "hotspot",
    title: "Hotspot Setup",
    copy: "Turn on this device's hotspot, then join the learner device to it.",
  },
  {
    id: "usb",
    title: "USB Tethering",
    copy: "Connect the learner device by USB, then turn on USB tethering.",
  },
];

/* Re-announce the offer so a learner that arrives late still receives it. */
const OFFER_REPEAT_MS = 4000;

export default function LocalAssessmentPairing({ code, role, offline, onCodeResolved, onConnected }) {
  const [resolvedCode, setResolvedCode] = useState(normalizeCode(code));
  const [status, setStatus] = useState(() => getAssessmentPeerStatus(code));
  const [relayUnavailable, setRelayUnavailable] = useState(false);
  const offerRef = useRef("");
  const answeredRef = useRef(false);

  useEffect(() => {
    const next = normalizeCode(code);
    if (next) setResolvedCode(next);
  }, [code]);

  useEffect(() => {
    if (!resolvedCode) return undefined;
    return subscribeAssessmentPeerStatus(resolvedCode, setStatus);
  }, [resolvedCode]);

  const connected = status.connected;

  /*
   * Teacher: announce the offer and wait for the learner's answer. The offer is
   * repeated, because the relay does not retain messages and the learner may
   * subscribe after the first announcement.
   */
  useEffect(() => {
    if (!offline || role !== "teacher" || connected || resolvedCode.length !== 6) return undefined;

    let cancelled = false;
    let timer = 0;

    const announce = async () => {
      try {
        if (!offerRef.current) {
          offerRef.current = await startTeacherAssessmentPairing(resolvedCode);
        }
        if (cancelled) return;
        const sent = await publishAssessmentPairingOffer(resolvedCode, offerRef.current);
        if (!cancelled) setRelayUnavailable(!sent);
      } catch {
        if (!cancelled) setRelayUnavailable(true);
      }
    };

    void announce();
    timer = window.setInterval(announce, OFFER_REPEAT_MS);

    const subscription = subscribeAssessmentPairingAnswer(resolvedCode, (packet) => {
      void (async () => {
        try {
          await completeTeacherAssessmentPairing(resolvedCode, packet);
        } catch {
          /* A malformed answer must not stop the announcements. */
        }
      })();
    });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      subscription.unsubscribe();
    };
  }, [offline, role, connected, resolvedCode]);

  /*
   * Learner: collect the teacher's offer and answer it. No scanning is
   * involved - the assessment code is the only thing needed.
   */
  useEffect(() => {
    if (!offline || role !== "learner" || connected || resolvedCode.length !== 6) return undefined;

    answeredRef.current = false;
    const subscription = subscribeAssessmentPairingOffer(resolvedCode, (packet) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      void (async () => {
        try {
          const result = await acceptLearnerAssessmentOffer(packet);
          onCodeResolved?.(result.code);
          const sent = await publishAssessmentPairingAnswer(result.code, result.answer);
          if (!sent) setRelayUnavailable(true);
        } catch {
          answeredRef.current = false;
        }
      })();
    });

    subscription.ready.then((ready) => setRelayUnavailable(!ready));

    return () => {
      answeredRef.current = false;
      subscription.unsubscribe();
    };
  }, [offline, role, connected, resolvedCode, onCodeResolved]);

  /* Hold the confirmation briefly, then let the overlay close itself. */
  const onConnectedRef = useRef(onConnected);
  useEffect(() => {
    onConnectedRef.current = onConnected;
  }, [onConnected]);

  useEffect(() => {
    if (!connected) return undefined;
    const timer = window.setTimeout(() => onConnectedRef.current?.(), 1100);
    return () => window.clearTimeout(timer);
  }, [connected]);

  const close = useCallback(() => {
    onConnectedRef.current?.();
  }, []);

  /* Only meaningful without a working internet connection. */
  if (!offline) return null;

  const stateLabel = connected
    ? "Learner connected"
    : relayUnavailable
      ? "Cannot reach the pairing service"
      : role === "teacher"
        ? "Waiting for learner"
        : "Looking for the teacher";

  return (
    <section className="local-pair-section" aria-label="Offline pairing">
      <style>{`
        .local-pair-section{margin-top:16px;padding:16px;border:1px solid #d8e0e8;border-radius:14px;background:#fff;color:#1a2b4c;font-family:Arial,Helvetica,sans-serif}
        .local-pair-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}
        .local-pair-title{margin:0;font-size:15px;font-weight:800}
        .local-pair-methods{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px;align-items:stretch}
        @media (max-width:560px){.local-pair-methods{grid-template-columns:1fr}}
        .local-pair-method{display:flex;flex-direction:column;padding:15px;border:1px solid #e3e8ee;border-radius:14px;background:#fbfcfe}
        .local-pair-method-title{margin:0;font-size:14px;font-weight:800}
        .local-pair-method-copy{margin:6px 0 0;color:#66758a;font-size:12.5px;line-height:1.5}
        .local-pair-state{display:flex;align-items:center;gap:9px;margin-top:auto;padding-top:13px;font-size:13px;font-weight:700;color:#526176}
        .local-pair-dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:#b37934}
        .local-pair-dot.connected{background:#31745a}
        .local-pair-dot.failed{background:#9b3a35}
        .local-pair-spinner{width:16px;height:16px;flex:0 0 16px;border:2px solid #cfd8e2;border-top-color:#1a2b4c;border-radius:50%;animation:localPairSpin .8s linear infinite}
        .local-pair-note{margin:14px 0 0;padding:11px 13px;border:1px solid #f0cdc8;border-radius:11px;background:#fff0f2;color:#9b2e22;font-size:12.5px;line-height:1.5}
        .local-pair-actions{display:flex;justify-content:flex-end;margin-top:14px}
        .local-pair-button{min-height:44px;padding:0 16px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:11px;background:#1a2b4c;color:#fff;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:transform .16s ease,background .16s ease}
        .local-pair-button:hover{background:#243b66}
        .local-pair-button:active{transform:scale(.98)}
        @keyframes localPairSpin{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion:reduce){.local-pair-spinner{animation:none}}
      `}</style>

      <div className="local-pair-heading">
        <h3 className="local-pair-title">Offline pairing</h3>
      </div>

      <div className="local-pair-methods">
        {METHODS.map((entry) => (
          <section key={entry.id} className="local-pair-method" aria-label={entry.title}>
            <h4 className="local-pair-method-title">{entry.title}</h4>
            <p className="local-pair-method-copy">{entry.copy}</p>
            <div className="local-pair-state" role="status">
              {connected ? (
                <span className="local-pair-dot connected" aria-hidden="true" />
              ) : relayUnavailable ? (
                <span className="local-pair-dot failed" aria-hidden="true" />
              ) : (
                <span className="local-pair-spinner" aria-hidden="true" />
              )}
              {stateLabel}
            </div>
          </section>
        ))}
      </div>

      {relayUnavailable && !connected && (
        <p className="local-pair-note" role="alert">
          The local link needs both devices online to be negotiated. Check the internet connection on both devices.
        </p>
      )}

      {connected && (
        <div className="local-pair-actions">
          <button type="button" className="local-pair-button" onClick={close}>Continue</button>
        </div>
      )}
    </section>
  );
}
