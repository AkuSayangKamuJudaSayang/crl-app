"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import jsQR from "../lib/vendor/jsQR.js";
import qrcode from "../lib/vendor/qrcode.mjs";
import {
  acceptLearnerAssessmentOffer,
  completeTeacherAssessmentPairing,
  getAssessmentPeerStatus,
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
        setError("Camera access is needed to scan the pairing QR.");
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

export default function LocalAssessmentPairing({ code, role, offline, onCodeResolved, onConnected }) {
  const [resolvedCode, setResolvedCode] = useState(normalizeCode(code));
  const [status, setStatus] = useState(() => getAssessmentPeerStatus(code));
  const [offerPacket, setOfferPacket] = useState("");
  const [answerPacket, setAnswerPacket] = useState("");
  const [scanning, setScanning] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [pairingAttempt, setPairingAttempt] = useState(0);
  const offerCodeRef = useRef("");
  const onConnectedRef = useRef(onConnected);

  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);
  useEffect(() => {
    const next = normalizeCode(code);
    if (next) setResolvedCode(next);
  }, [code]);

  useEffect(() => {
    if (!resolvedCode) return undefined;
    return subscribeAssessmentPeerStatus(resolvedCode, setStatus);
  }, [resolvedCode]);

  useEffect(() => {
    if (!offline) {
      setScanning(false);
      setPairingError("");
      if (role === "teacher" && !getAssessmentPeerStatus(resolvedCode).connected) {
        offerCodeRef.current = "";
        setOfferPacket("");
      }
      return undefined;
    }
    if (
      role !== "teacher" ||
      resolvedCode.length !== 6 ||
      getAssessmentPeerStatus(resolvedCode).connected
    ) return undefined;
    if (offerCodeRef.current === resolvedCode) return undefined;

    let cancelled = false;
    offerCodeRef.current = resolvedCode;
    setOfferPacket("");
    setPairingError("");
    void startTeacherAssessmentPairing(resolvedCode)
      .then((packet) => { if (!cancelled) setOfferPacket(packet); })
      .catch((error) => {
        if (!cancelled) setPairingError(error?.message || "Local pairing could not start.");
      });
    return () => { cancelled = true; };
  }, [offline, role, resolvedCode, pairingAttempt]); // status updates must not cancel ICE gathering

  const handleLearnerScan = useCallback(async (packet) => {
    setScanning(false);
    setPairingError("");
    try {
      const result = await acceptLearnerAssessmentOffer(packet);
      setResolvedCode(result.code);
      setAnswerPacket(result.answer);
      onCodeResolved?.(result.code);
    } catch (error) {
      setPairingError(error?.message || "The teacher pairing QR could not be read.");
    }
  }, [onCodeResolved]);

  const handleTeacherScan = useCallback(async (packet) => {
    setScanning(false);
    setPairingError("");
    try {
      await completeTeacherAssessmentPairing(resolvedCode, packet);
    } catch (error) {
      setPairingError(error?.message || "The learner response QR could not be read.");
    }
  }, [resolvedCode]);

  const connected = Boolean(status.connected);
  const blocked = !offline;
  const qrMarkup = useMemo(
    () => createQrMarkup(role === "teacher" ? offerPacket : answerPacket),
    [role, offerPacket, answerPacket]
  );
  const stateLabel = blocked
    ? "Blocked while online"
    : connected
      ? "Learner connected"
      : role === "teacher"
        ? offerPacket ? "Ready to pair" : "Preparing pairing QR"
        : answerPacket ? "Waiting for teacher scan" : "Ready to scan";

  return (
    <section className={`local-pair-section${blocked ? " is-blocked" : ""}`} aria-label="Offline hotspot pairing">
      <style>{`
        .local-pair-section{margin-top:16px;padding:16px;border:1px solid #d8e0e8;border-radius:14px;background:#fff;color:#1a2b4c;font-family:Arial,Helvetica,sans-serif}
        .local-pair-section.is-blocked{background:#f6f6f4;border-color:#e2e2dd}
        .local-pair-section.is-blocked .local-pair-content{opacity:.58;pointer-events:none;user-select:none}
        .local-pair-title{margin:0;font-size:15px;font-weight:800}.local-pair-copy{margin:6px 0 0;color:#66758a;font-size:12.5px;line-height:1.5}
        .local-pair-content{margin-top:14px;padding:15px;border:1px solid #e3e8ee;border-radius:14px;background:#fbfcfe}
        .local-pair-method-title{margin:0;font-size:14px;font-weight:800}.local-pair-state{display:flex;align-items:center;gap:9px;margin-top:12px;font-size:13px;font-weight:700;color:#526176}
        .local-pair-dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:#b37934}.local-pair-dot.connected{background:#31745a}.local-pair-dot.blocked{background:#7d8785}
        .local-pair-spinner{width:16px;height:16px;flex:0 0 16px;border:2px solid #cfd8e2;border-top-color:#1a2b4c;border-radius:50%;animation:localPairSpin .8s linear infinite}
        .local-pair-qr{width:min(100%,260px);margin:14px auto 0;padding:10px;border:1px solid #d8e0e8;border-radius:12px;background:#fff}.local-pair-qr svg{display:block;width:100%;height:auto}
        .local-pair-device{margin:12px 0 0;font-size:13px;font-weight:800;color:#2e5d49}.local-pair-error{margin:12px 0 0;color:#9b2e22;font-size:12.5px;line-height:1.45}
        .local-pair-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:9px;margin-top:14px}.local-pair-button{min-height:44px;padding:0 16px;border:0;border-radius:11px;background:#1a2b4c;color:#fff;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:transform .16s ease,background .16s ease}.local-pair-button:hover{background:#243b66}.local-pair-button:active{transform:scale(.98)}.local-pair-button.secondary{border:1px solid #cfd8e2;background:#fff;color:#1a2b4c}
        .local-pair-scanner{margin-top:14px;padding:10px;border:1px solid #d8e0e8;border-radius:12px;background:#fff}.local-pair-video{display:block;width:100%;max-height:300px;object-fit:cover;border-radius:9px;background:#10213c}.local-pair-scanner .local-pair-button{width:100%;margin-top:10px}
        @keyframes localPairSpin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.local-pair-spinner{animation:none}.local-pair-button{transition:none}}
      `}</style>

      <h3 className="local-pair-title">Offline pair</h3>
      <p className="local-pair-copy">Connect both devices to the teacher device’s hotspot.</p>
      <div className="local-pair-content" aria-disabled={blocked}>
        <h4 className="local-pair-method-title">Hotspot</h4>
        <div className="local-pair-state" role="status">
          {blocked ? <span className="local-pair-dot blocked" aria-hidden="true" /> : connected ? <span className="local-pair-dot connected" aria-hidden="true" /> : <span className="local-pair-spinner" aria-hidden="true" />}
          {stateLabel}
        </div>

        {!blocked && !connected && qrMarkup && <div className="local-pair-qr" role="img" aria-label={role === "teacher" ? "Teacher pairing QR" : "Learner response QR"} dangerouslySetInnerHTML={{ __html: qrMarkup }} />}
        {!blocked && !connected && role === "teacher" && offerPacket && <p className="local-pair-copy">Let the learner scan this QR, then scan the learner response.</p>}
        {!blocked && !connected && role === "learner" && !answerPacket && <p className="local-pair-copy">Scan the pairing QR shown on the teacher device.</p>}
        {!blocked && !connected && role === "learner" && answerPacket && <p className="local-pair-copy">Show this response QR to the teacher.</p>}

        <QrScanner active={!blocked && scanning} label={role === "teacher" ? "Scan learner response QR" : "Scan teacher pairing QR"} onScan={role === "teacher" ? handleTeacherScan : handleLearnerScan} onCancel={() => setScanning(false)} />
        {pairingError && <p className="local-pair-error" role="alert">{pairingError}</p>}
        {connected && role === "teacher" && <p className="local-pair-device">Connected device: {status.remoteDeviceName || "Learner device"}</p>}

        {!blocked && !connected && !scanning && <div className="local-pair-actions">
          {pairingError && role === "teacher" && <button type="button" className="local-pair-button secondary" onClick={() => { offerCodeRef.current = ""; setPairingError(""); setPairingAttempt((value) => value + 1); }}>Retry</button>}
          {role === "learner" && !answerPacket && <button type="button" className="local-pair-button" onClick={() => setScanning(true)}>Scan teacher QR</button>}
          {role === "teacher" && offerPacket && <button type="button" className="local-pair-button" onClick={() => setScanning(true)}>Scan learner response</button>}
        </div>}
        {!blocked && connected && <div className="local-pair-actions"><button type="button" className="local-pair-button" onClick={() => onConnectedRef.current?.()}>Continue</button></div>}
      </div>
    </section>
  );
}
