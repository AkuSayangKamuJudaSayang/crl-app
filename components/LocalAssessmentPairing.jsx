"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import jsQR from "../lib/vendor/jsQR.js";
import qrcode from "../lib/vendor/qrcode.mjs";
import {
  acceptLearnerAssessmentOffer,
  assessmentPairingInvitation,
  completeTeacherAssessmentPairing,
  getAssessmentPeerStatus,
  getAssessmentPairingCodes,
  startTeacherAssessmentPairing,
  subscribeAssessmentPeerStatus,
} from "../lib/assessmentPeer";

function normalizeCode(code) {
  return String(code || "").replace(/\s+/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function createQrMarkup(value) {
  if (!value) return "";
  try {
    const qr = qrcode(0, "L");
    qr.addData(value);
    qr.make();
    return qr.createSvgTag(3, 3, "Offline pairing QR");
  } catch {
    return "";
  }
}

function QrScanner({ active, label, onScan, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;
    let stream = null;
    let frame = 0;

    const stop = () => {
      stopped = true;
      if (frame) window.cancelAnimationFrame(frame);
      for (const track of stream?.getTracks?.() || []) track.stop();
    };

    const scanFrame = () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video?.readyState >= 2 && canvas) {
        const sourceWidth = video.videoWidth || 0;
        const sourceHeight = video.videoHeight || 0;
        if (sourceWidth && sourceHeight) {
          const width = Math.min(720, sourceWidth);
          const height = Math.max(1, Math.round(sourceHeight * (width / sourceWidth)));
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context?.drawImage(video, 0, 0, width, height);
          const pixels = context?.getImageData(0, 0, width, height);
          const result = pixels ? jsQR(pixels.data, width, height, { inversionAttempts: "attemptBoth" }) : null;
          if (result?.data) {
            stop();
            onScan(result.data);
            return;
          }
        }
      }
      frame = window.requestAnimationFrame(scanFrame);
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        });
        if (stopped) return stop();
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        frame = window.requestAnimationFrame(scanFrame);
      } catch {
        setError("Camera unavailable. Cancel the scan and enter the connection code below instead.");
      }
    })();

    return stop;
  }, [active, onScan]);

  if (!active) return null;
  return (
    <div className="local-pair-scanner" role="group" aria-label={label}>
      <video ref={videoRef} className="local-pair-video" playsInline muted aria-label={label} />
      <canvas ref={canvasRef} hidden />
      {error && <p className="local-pair-error" role="alert">{error}</p>}
      <button type="button" className="local-pair-button secondary" onClick={onCancel}>Cancel scan</button>
    </div>
  );
}

export default function LocalAssessmentPairing({
  code,
  role,
  offline,
  onCodeResolved,
  onConnected,
  onPeerConnected,
  initialOffer = "",
  hideWhenConnected = false,
}) {
  const [resolvedCode, setResolvedCode] = useState(normalizeCode(code));
  const [status, setStatus] = useState(() => getAssessmentPeerStatus(code));
  const [offerPacket, setOfferPacket] = useState(() => getAssessmentPairingCodes(code).offer);
  const [answerPacket, setAnswerPacket] = useState(() => getAssessmentPairingCodes(code).answer);
  const [scanning, setScanning] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [inputPacket, setInputPacket] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const outgoingRef = useRef(null);
  const busyRef = useRef(false);
  const consumedOfferRef = useRef("");
  const offerRequestRef = useRef(0);
  const scopeRef = useRef("");
  scopeRef.current = `${role}:${resolvedCode}`;
  const inputId = useId();
  const outgoingId = useId();
  const onConnectedRef = useRef(onConnected);
  const onPeerConnectedRef = useRef(onPeerConnected);
  const notifiedConnectionRef = useRef("");

  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);
  useEffect(() => { onPeerConnectedRef.current = onPeerConnected; }, [onPeerConnected]);
  useEffect(() => {
    const next = normalizeCode(code);
    if (next && next !== resolvedCode) {
      setResolvedCode(next);
      setOfferPacket("");
      setAnswerPacket("");
      setInputPacket("");
      setPairingError("");
      consumedOfferRef.current = "";
    }
  }, [code, resolvedCode]);

  useEffect(() => {
    if (!resolvedCode) return undefined;
    return subscribeAssessmentPeerStatus(resolvedCode, setStatus);
  }, [resolvedCode]);

  useEffect(() => {
    if (!offline) {
      setScanning(false);
      setPairingError("");
      return undefined;
    }
    if (role !== "teacher" || resolvedCode.length !== 6 || getAssessmentPeerStatus(resolvedCode).connected) return undefined;
    let cancelled = false;
    const request = ++offerRequestRef.current;
    setPairingError("");
    // The shared offer survives closing the settings and React effect replays.
    void startTeacherAssessmentPairing(resolvedCode)
      .then((packet) => { if (!cancelled && request === offerRequestRef.current) setOfferPacket(packet); })
      .catch((error) => {
        if (!cancelled && request === offerRequestRef.current) setPairingError(error?.message || "Local connection setup failed.");
      });
    return () => { cancelled = true; };
  }, [offline, role, resolvedCode]);

  const handleLearnerScan = useCallback(async (packet) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    const scope = scopeRef.current;
    setScanning(false);
    setPairingError("");
    try {
      const result = await acceptLearnerAssessmentOffer(packet, resolvedCode);
      if (scopeRef.current !== scope) return;
      setResolvedCode(result.code);
      setAnswerPacket(result.answer);
      setCopyStatus("");
      setInputPacket("");
      onCodeResolved?.(result.code);
    } catch (error) {
      if (scopeRef.current === scope) setPairingError(error?.message || "The teacher connection code could not be read.");
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }, [onCodeResolved, resolvedCode]);

  useEffect(() => {
    if (!offline || role !== "learner" || !initialOffer || consumedOfferRef.current === initialOffer) return;
    consumedOfferRef.current = initialOffer;
    void handleLearnerScan(initialOffer);
  }, [offline, role, initialOffer, handleLearnerScan]);

  const handleTeacherScan = useCallback(async (packet) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    const scope = scopeRef.current;
    setScanning(false);
    setPairingError("");
    try {
      await completeTeacherAssessmentPairing(resolvedCode, packet);
      if (scopeRef.current === scope) setInputPacket("");
    } catch (error) {
      if (scopeRef.current === scope) setPairingError(error?.message || "The learner response code could not be read.");
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }, [resolvedCode]);

  const regenerateOffer = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setScanning(false);
    setPairingError("");
    setOfferPacket("");
    setCopyStatus("");
    const scope = scopeRef.current;
    const request = ++offerRequestRef.current;
    try {
      const packet = await startTeacherAssessmentPairing(resolvedCode, { restart: true });
      if (scopeRef.current === scope && request === offerRequestRef.current) setOfferPacket(packet);
    } catch (error) {
      if (scopeRef.current === scope && request === offerRequestRef.current) setPairingError(error?.message || "Local connection setup failed.");
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  const connected = Boolean(status.connected);
  useEffect(() => {
    if (!connected) {
      notifiedConnectionRef.current = "";
      return;
    }
    const notificationKey = `${role}:${resolvedCode}`;
    if (notifiedConnectionRef.current === notificationKey) return;
    notifiedConnectionRef.current = notificationKey;
    onPeerConnectedRef.current?.({ code: resolvedCode, role, status });
  }, [connected, resolvedCode, role, status]);

  const blocked = !offline;
  const outgoingPacket = role === "teacher" ? offerPacket : answerPacket;
  const qrMarkup = useMemo(
    () => createQrMarkup(role === "teacher" && offerPacket && typeof window !== "undefined"
      ? assessmentPairingInvitation(resolvedCode, offerPacket, window.location.origin)
      : outgoingPacket),
    [role, resolvedCode, offerPacket, outgoingPacket]
  );
  const copyConnectionCode = async () => {
    try {
      await navigator.clipboard.writeText(outgoingPacket);
      setCopyStatus("Connection code copied.");
    } catch {
      outgoingRef.current?.focus();
      outgoingRef.current?.select();
      setCopyStatus("Code selected. Use your device’s Copy command.");
    }
  };
  const canReceive = role === "teacher" ? Boolean(offerPacket) : !answerPacket;
  const incomingLabel = role === "teacher" ? "Learner response code" : "Teacher connection code";
  const outgoingLabel = role === "teacher" ? "Teacher connection code" : "Learner response code";
  const stateLabel = blocked ? "Available when offline" : connected ? "Devices connected"
    : submitting ? "Preparing connection…"
    : role === "teacher" ? offerPacket ? "Ready for learner" : "Preparing teacher connection code…"
    : answerPacket ? "Give your response to the teacher" : "Scan the teacher QR or enter its connection code";

  if (hideWhenConnected && connected) return null;
  return (
    <section className={`local-pair-section${blocked ? " is-blocked" : ""}`} aria-label="Offline hotspot pairing">
      <style>{`
        .local-pair-section{box-sizing:border-box;width:100%;min-width:0;margin:16px 0;padding:16px;border:1px solid #d8e0e8;border-radius:14px;background:#fff;color:#1a2b4c;font-family:Arial,Helvetica,sans-serif;text-align:left}
        .local-pair-section.is-blocked{background:#f6f6f4;border-color:#e2e2dd}
        .local-pair-title{margin:0;font-size:18px;font-weight:800}.local-pair-copy{margin:6px 0 0;color:#526176;font-size:12.5px;line-height:1.5}
        .local-pair-content{margin-top:14px;padding:15px;border:1px solid #e3e8ee;border-radius:14px;background:#fbfcfe}
        .local-pair-state{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:700;color:#526176}
        .local-pair-dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:#31745a}
        .local-pair-spinner{width:16px;height:16px;flex:0 0 16px;border:2px solid #cfd8e2;border-top-color:#1a2b4c;border-radius:50%;animation:localPairSpin .8s linear infinite}
        .local-pair-qr{width:min(100%,300px);box-sizing:border-box;margin:14px auto 0;padding:10px;border:1px solid #d8e0e8;border-radius:12px;background:#fff}.local-pair-qr svg{display:block;width:100%;height:auto}
        .local-pair-device{margin:12px 0 0;font-size:13px;font-weight:800;color:#2e5d49}.local-pair-error{margin:12px 0 0;color:#9b2e22;font-size:12.5px;line-height:1.45}
        .local-pair-code-field{display:grid;gap:8px;margin-top:16px;font-size:13px;font-weight:800}
        .local-pair-code-field textarea{box-sizing:border-box;width:100%;min-width:0;min-height:110px;padding:10px;border:1px solid #aab8cb;border-radius:9px;background:#fff;color:#1a2b4c;font:12px/1.5 monospace;overflow-wrap:anywhere;word-break:break-all;resize:vertical}
        .local-pair-code-field textarea:focus{outline:2px solid #4a6fa5;outline-offset:2px}
        .local-pair-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px}.local-pair-button{min-height:44px;padding:8px 16px;border:0;border-radius:11px;background:#1a2b4c;color:#fff;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:transform .16s ease,background .16s ease}.local-pair-button:hover:not(:disabled){background:#243b66}.local-pair-button:active:not(:disabled){transform:scale(.98)}.local-pair-button.secondary{border:1px solid #cfd8e2;background:#fff;color:#1a2b4c}.local-pair-button:disabled{opacity:.6;cursor:wait}
        .local-pair-scanner{margin-top:14px;padding:10px;border:1px solid #d8e0e8;border-radius:12px;background:#fff}.local-pair-video{display:block;width:100%;max-height:300px;object-fit:cover;border-radius:9px;background:#10213c}.local-pair-scanner .local-pair-button{width:100%;margin-top:10px}
        @keyframes localPairSpin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.local-pair-spinner{animation:none}.local-pair-button{transition:none}}
      `}</style>
      <h3 className="local-pair-title">{role === "teacher" ? "Teacher offline connection" : "Connect to teacher offline"}</h3>
      <p className="local-pair-copy">Connect both devices to the same hotspot or Wi-Fi network.</p>
      <p className="local-pair-copy">Assessment {resolvedCode || "code"}: scan the QR or enter the matching long connection code. Use text codes if either device has no camera. No internet is needed. The 6-character assessment code identifies the session; the connection code links the devices.</p>
      <div className="local-pair-content">
        <div className="local-pair-state" role="status">
          {!blocked && !connected ? <span className="local-pair-spinner" aria-hidden="true" /> : connected ? <span className="local-pair-dot" aria-hidden="true" /> : null}
          {stateLabel}
        </div>
        {!blocked && !connected && qrMarkup ? <div className="local-pair-qr" role="img" aria-label={role === "teacher" ? "Teacher pairing QR" : "Learner response QR"} dangerouslySetInnerHTML={{ __html: qrMarkup }} /> : null}
        {!blocked && !connected && outgoingPacket ? (
          <>
            <label className="local-pair-code-field" htmlFor={outgoingId}>
              {outgoingLabel}
              <textarea ref={outgoingRef} id={outgoingId} value={outgoingPacket} readOnly spellCheck={false} autoCapitalize="off" autoComplete="off" onFocus={(event) => event.target.select()} />
            </label>
            <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" onClick={copyConnectionCode}>Copy connection code</button></div>
            <p className="local-pair-copy" role="status">{copyStatus}</p>
            <p className="local-pair-copy">{role === "teacher" ? "1. Let the learner scan this QR or enter the teacher connection code. 2. Scan the learner response or enter its response code below." : "Give this response code or QR to the teacher. Keep this page open while the teacher accepts it."}</p>
          </>
        ) : null}
        {!blocked && !connected && canReceive ? (
          <>
            <label className="local-pair-code-field" htmlFor={inputId}>
              Enter {incomingLabel.toLowerCase()}
              <textarea id={inputId} value={inputPacket} onChange={(event) => { setInputPacket(event.target.value); setPairingError(""); }} maxLength={24000} placeholder={role === "teacher" ? "Paste or type the full learner response code" : "Paste or type the full teacher connection code"} spellCheck={false} autoCapitalize="off" autoCorrect="off" autoComplete="off" disabled={submitting} />
            </label>
            <div className="local-pair-actions">
              <button type="button" className="local-pair-button" disabled={submitting || !inputPacket.trim()} onClick={() => void (role === "teacher" ? handleTeacherScan(inputPacket) : handleLearnerScan(inputPacket))}>{submitting ? "Connecting…" : role === "teacher" ? "Accept learner response" : "Use teacher connection code"}</button>
              {!scanning ? <button type="button" className="local-pair-button secondary" disabled={submitting} onClick={() => setScanning(true)}>{role === "teacher" ? "Scan learner response" : "Scan teacher QR"}</button> : null}
            </div>
          </>
        ) : null}
        {!blocked && !connected && role === "learner" && answerPacket ? <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" disabled={submitting} onClick={() => { setAnswerPacket(""); setInputPacket(""); setScanning(false); setPairingError(""); }}>Use a new teacher code</button></div> : null}
        <QrScanner active={!blocked && !connected && scanning} label={role === "teacher" ? "Scan learner response QR" : "Scan teacher pairing QR"} onScan={role === "teacher" ? handleTeacherScan : handleLearnerScan} onCancel={() => setScanning(false)} />
        {pairingError ? <p className="local-pair-error" role="alert">{pairingError}</p> : null}
        {!blocked && !connected && role === "teacher" ? <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" disabled={submitting} onClick={regenerateOffer}>Create new connection code</button></div> : null}
        {connected && role === "teacher" ? <p className="local-pair-device">Connected device: {status.remoteDeviceName || "Learner device"}</p> : null}
        {!blocked && connected && onConnected ? <div className="local-pair-actions"><button type="button" className="local-pair-button" onClick={() => onConnectedRef.current?.()}>Continue</button></div> : null}
      </div>
    </section>
  );
}
