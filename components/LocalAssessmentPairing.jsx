"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { discoverPairingHub, getHubAssessmentOffer, getHubLearnerResponse, getPairingHub, registerPairingCode, shortPairingInvitation } from "../lib/assessmentPairingHub";

function normalizeCode(code) {
  return String(code || "").replace(/\s+/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function createQrMarkup(value) {
  if (!value) return "";
  try {
    const qr = qrcode(0, "L");
    qr.addData(value);
    qr.make();
    return qr.createSvgTag(3, 12, "Offline pairing QR");
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
  const [hubAddress, setHubAddress] = useState("");
  const [codesError, setCodesError] = useState("");
  const [shortCode, setShortCode] = useState(null);
  const [fullscreenQr, setFullscreenQr] = useState(false);
  /* The hub-free text exchange: a copyable code out, a pasted code in. */
  const [codeCopied, setCodeCopied] = useState(false);
  const [typedCode, setTypedCode] = useState("");
  const busyRef = useRef(false);
  const consumedOfferRef = useRef("");
  const offerRequestRef = useRef(0);
  const scopeRef = useRef("");
  scopeRef.current = `${role}:${resolvedCode}`;
  const inputId = useId();
  const onConnectedRef = useRef(onConnected);
  const onPeerConnectedRef = useRef(onPeerConnected);
  const notifiedConnectionRef = useRef("");

  useEffect(() => {
    const updateHub = (event) => {
      const hub = typeof event?.detail === "string" ? event.detail : getPairingHub();
      setHubAddress(hub);
    };
    updateHub();
    window.addEventListener("crl-pairing-hub-change", updateHub);
    window.addEventListener("storage", updateHub);
    return () => {
      window.removeEventListener("crl-pairing-hub-change", updateHub);
      window.removeEventListener("storage", updateHub);
    };
  }, []);

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
      setInputPacket("");
      onCodeResolved?.(result.code);
      return true;
    } catch (error) {
      if (scopeRef.current === scope) setPairingError(error?.message || "The teacher connection code could not be read.");
      return false;
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
      return true;
    } catch (error) {
      if (scopeRef.current === scope) {
        if (error?.code === "PAIRING_EXPIRED") {
          try {
            const packet = await startTeacherAssessmentPairing(resolvedCode, { restart: true });
            if (scopeRef.current !== scope) return;
            setOfferPacket(packet);
            setPairingError("Invitation replaced. Let the learner scan the new teacher QR.");
            setInputPacket("");
          } catch (retryError) { if (scopeRef.current === scope) setPairingError(retryError?.message || "Create a new teacher QR."); }
        } else setPairingError(error?.message || "The learner response code could not be read.");
      }
      return false;
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
    if (status.state !== "disconnected" || getAssessmentPeerStatus(resolvedCode).state !== "disconnected") return;
    setOfferPacket("");
    setAnswerPacket("");
    setPairingError("Local link interrupted. Check Wi-Fi, then use a new teacher QR.");
  }, [status.state, resolvedCode]);
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
  /*
   * One hub on the school network is optional and only makes the connection
   * automatic. Discovery failure is silent: without a hub the QR and the text
   * codes below are the whole flow.
   */
  useEffect(() => {
    if (blocked || connected) return undefined;
    let cancelled = false;
    void discoverPairingHub()
      .then((hub) => { if (!cancelled) setHubAddress(hub); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [blocked, connected]);

  useEffect(() => {
    if (blocked || connected || role !== "learner" || !hubAddress || resolvedCode.length !== 6 || answerPacket || initialOffer) return undefined;
    let cancelled = false;
    let timer;
    const connect = async () => {
      try {
        const packet = await getHubAssessmentOffer(hubAddress, resolvedCode);
        if (cancelled) return;
        const accepted = await handleLearnerScan(packet);
        if (!cancelled && !accepted) timer = setTimeout(connect, 2000);
      } catch {
        if (!cancelled) timer = setTimeout(connect, 2000);
      }
    };
    void connect();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [blocked, connected, role, hubAddress, resolvedCode, answerPacket, initialOffer, handleLearnerScan]);
  useEffect(() => {
    setShortCode(null);
    if (blocked || connected || !hubAddress || !outgoingPacket) return undefined;
    let cancelled = false;
    setCodesError("");
    let expiryTimer;
    const register = async () => {
      try {
        const entry = await registerPairingCode(hubAddress, resolvedCode, role === "teacher" ? "o" : "a", outgoingPacket);
        if (cancelled) return;
        setShortCode({ ...entry, packet: outgoingPacket, hub: hubAddress });
        // Refresh only the hub reference; keep the live peer invitation intact.
        expiryTimer = setTimeout(() => { setShortCode(null); void register(); }, Math.max(1000, entry.expiresInMs + 100));
      } catch (error) { if (!cancelled) setCodesError(error?.message || "Offline hub unavailable."); }
    };
    void register();
    return () => { cancelled = true; clearTimeout(expiryTimer); };
  }, [blocked, connected, hubAddress, outgoingPacket, resolvedCode, role]);
  const displayCode = shortCode?.packet === outgoingPacket && shortCode?.hub === hubAddress ? shortCode.code : "";
  useEffect(() => {
    if (blocked || connected || role !== "teacher" || !hubAddress || !displayCode) return undefined;
    let cancelled = false;
    let timer;
    let lastResponse = "";
    const receive = async () => {
      try {
        const response = await getHubLearnerResponse(hubAddress, resolvedCode, displayCode);
        if (!cancelled && response && response !== lastResponse) {
          lastResponse = response;
          if (await handleTeacherScan(response)) return;
        }
      } catch {
        // Manual six-character entry and self-contained QR remain available.
      }
      if (!cancelled) timer = setTimeout(receive, 1000);
    };
    void receive();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [blocked, connected, role, hubAddress, resolvedCode, displayCode, handleTeacherScan]);
  /*
   * The exact text that travels in the QR. Both devices exchange this same
   * string, so the copy-and-paste route below and the camera route are the very
   * same packet - nothing extra to keep in step.
   */
  const pairingCode = useMemo(
    () => displayCode && typeof window !== "undefined"
      ? shortPairingInvitation(resolvedCode, role === "teacher" ? "o" : "a", displayCode, hubAddress, window.location.origin)
      : role === "teacher" && offerPacket && typeof window !== "undefined"
      ? assessmentPairingInvitation(resolvedCode, offerPacket, window.location.origin)
      : outgoingPacket,
    [role, resolvedCode, offerPacket, outgoingPacket, displayCode, hubAddress]
  );
  const qrMarkup = useMemo(() => createQrMarkup(pairingCode), [pairingCode]);
  const canReceive = role === "teacher" ? Boolean(offerPacket) : !answerPacket;
  const incomingLabel = role === "teacher" ? "Learner response code" : "Teacher connection code";
  const outgoingLabel = role === "teacher" ? "Teacher connection code" : "Learner response code";
  /*
   * Scanning is the path that needs no setup at all, so it is the one the two
   * devices are walked through step by step. The hub only ever adds the typed
   * alternative, and without one configured the typed field is not shown at
   * all rather than sitting there unusable.
   */
  const qrCaption = role === "teacher"
    ? displayCode ? "Teacher connection code" : "Show this to the learner"
    : "Show this to the teacher";
  /*
   * No camera on either device: the same code that would have been scanned is
   * copied out of one device and pasted into the other. Nothing here needs a
   * hub, and the pasted value goes through the same reader a scan does.
   */
  const copyPairingCode = async () => {
    setCodeCopied(false);
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 2500);
    } catch {
      setCodeCopied(false);
      setCodesError("Copy was blocked. Select the code and copy it by hand.");
    }
  };
  const submitTypedCode = async () => {
    const value = String(typedCode || "").trim();
    if (value.length < 20) {
      setPairingError("Paste the whole connection code from the other device.");
      return;
    }
    const accepted = await (role === "teacher" ? handleTeacherScan(value) : handleLearnerScan(value));
    if (accepted) setTypedCode("");
  };
  const stateLabel = blocked ? "Available when offline"
    : connected ? "Devices connected"
    : submitting ? "Connecting…"
    : role === "teacher"
      ? offerPacket
        ? displayCode ? "Ready. The learner enters the code shown below." : "Step 1 of 2 — the learner scans this"
        : "Preparing the connection code…"
    : answerPacket
      ? "Step 2 of 2 — the teacher scans this"
      : "Step 1 of 2 — scan the teacher's code";

  if (hideWhenConnected && connected) return null;
  return (
    <>
    <section className={`local-pair-section${blocked ? " is-blocked" : ""}`} aria-label="Offline hotspot pairing">
      <style>{`
        .local-pair-section{box-sizing:border-box;width:100%;min-width:0;margin:16px 0;padding:16px;border:1px solid #d8e0e8;border-radius:14px;background:#fff;color:#1a2b4c;font-family:Arial,Helvetica,sans-serif;text-align:left}
        .local-pair-section.is-blocked{background:#f6f6f4;border-color:#e2e2dd}
        .local-pair-title{margin:0;font-size:18px;font-weight:800}.local-pair-copy{margin:6px 0 0;color:#526176;font-size:12.5px;line-height:1.5}
        .local-pair-content{margin-top:14px;padding:15px;border:1px solid #e3e8ee;border-radius:14px;background:#fbfcfe}
        .local-pair-state{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:700;color:#526176}
        .local-pair-dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:#31745a}
        .local-pair-spinner{width:16px;height:16px;flex:0 0 16px;border:2px solid #cfd8e2;border-top-color:#1a2b4c;border-radius:50%;animation:localPairSpin .8s linear infinite}
        .local-pair-qr{display:block;width:min(100%,260px);box-sizing:border-box;margin:14px auto 0;padding:10px;border:1px solid #d8e0e8;border-radius:12px;background:#fff;cursor:zoom-in}.local-pair-qr.is-compact{width:min(100%,200px)}.local-pair-qr svg{display:block;width:100%;height:auto}
        .local-pair-device{margin:12px 0 0;font-size:13px;font-weight:800;color:#2e5d49}.local-pair-error{margin:12px 0 0;color:#9b2e22;font-size:12.5px;line-height:1.45}
        .local-pair-code-field{display:grid;gap:8px;margin-top:16px;font-size:13px;font-weight:800}
        .local-pair-code-field input{box-sizing:border-box;width:100%;min-width:0;min-height:46px;padding:10px;border:1px solid #aab8cb;border-radius:9px;background:#fff;color:#1a2b4c;font:12px/1.5 monospace;overflow-wrap:anywhere;word-break:break-all;letter-spacing:.15em}
        .local-pair-code-field input:focus{outline:2px solid #4a6fa5;outline-offset:2px}
        .local-pair-code{display:block;margin:10px 0;color:#1a2b4c;font:900 28px/1.3 monospace;letter-spacing:.18em;text-align:center}
        .local-pair-codes{margin-top:16px;padding:12px;border:1px solid #e3e8ee;border-radius:12px;background:#fff}
        .local-pair-codes summary{cursor:pointer;font-size:12.5px;font-weight:800}
        .local-pair-codes .local-pair-copy{margin-top:10px}
        .local-pair-long{box-sizing:border-box;width:100%;min-width:0;margin-top:8px;padding:9px;border:1px solid #aab8cb;border-radius:9px;background:#fbfcfe;color:#1a2b4c;font:11px/1.5 monospace;overflow-wrap:anywhere;word-break:break-all;resize:vertical}
        .local-pair-long:focus{outline:2px solid #4a6fa5;outline-offset:2px}
        .local-pair-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px}.local-pair-button{min-height:44px;padding:8px 16px;border:0;border-radius:11px;background:#1a2b4c;color:#fff;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:transform .16s ease,background .16s ease}.local-pair-button:hover:not(:disabled){background:#243b66}.local-pair-button:active:not(:disabled){transform:scale(.98)}.local-pair-button.secondary{border:1px solid #cfd8e2;background:#fff;color:#1a2b4c}.local-pair-button:disabled{opacity:.6;cursor:wait}
        .local-pair-actions .local-pair-button{flex:1 1 auto}
        .local-pair-scanner{margin-top:14px;padding:10px;border:1px solid #d8e0e8;border-radius:12px;background:#fff}.local-pair-video{display:block;width:100%;max-height:300px;object-fit:cover;border-radius:9px;background:#10213c}.local-pair-scanner .local-pair-button{width:100%;margin-top:10px}
        .local-pair-fullscreen{position:fixed;inset:0;z-index:13200;display:grid;place-items:center;padding:16px;background:rgba(10,20,36,.88);box-sizing:border-box}
        .local-pair-fullscreen-card{display:grid;gap:12px;justify-items:center;width:min(100%,560px)}
        .local-pair-fullscreen-caption{margin:0;color:#fff;font-size:15px;font-weight:800;text-align:center}
        .local-pair-fullscreen-qr{box-sizing:border-box;width:min(86vmin,520px);max-width:100%;padding:12px;border-radius:16px;background:#fff}
        .local-pair-fullscreen-qr svg{display:block;width:100%;height:auto}
        .local-pair-fullscreen .local-pair-button{min-width:150px}
        @keyframes localPairSpin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.local-pair-spinner{animation:none}.local-pair-button{transition:none}}
      `}</style>
      <h3 className="local-pair-title">{role === "teacher" ? "Teacher offline connection" : "Connect to teacher offline"}</h3>
      <div className="local-pair-content">
        <div className="local-pair-state" role="status">
          {!blocked && !connected ? <span className="local-pair-spinner" aria-hidden="true" /> : connected ? <span className="local-pair-dot" aria-hidden="true" /> : null}
          {stateLabel}
        </div>
        {!blocked && !connected && qrMarkup ? <>
          <button type="button" className={`local-pair-qr${displayCode ? " is-compact" : ""}`} aria-label={role === "teacher" ? "Teacher pairing QR" : "Learner response QR"} onClick={() => setFullscreenQr(true)} dangerouslySetInnerHTML={{ __html: qrMarkup }} />
          <p className="local-pair-copy">{qrCaption} · tap the code, or use Show full screen, to make it easier to scan.</p>
          <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" onClick={() => setFullscreenQr(true)}>Show full screen</button></div>
        </> : null}
        {!blocked && !connected && !hubAddress && canReceive ? <p className="local-pair-copy">{role === "teacher"
          ? "The learner scans this, or copies it into the camera-free step below."
          : "Scan the teacher's code, or paste it into the camera-free step below."}</p> : null}
        {!blocked && !connected && outgoingPacket ? <>
          {displayCode ? <><p className="local-pair-copy">{outgoingLabel}</p><output className="local-pair-code" aria-label={outgoingLabel}>{displayCode}</output></> : null}
          <p className="local-pair-copy">{role === "teacher"
            ? "The learner scans it, then their device shows a reply code to scan here."
            : "The teacher scans it to finish connecting."}</p>
        </> : null}
        {!blocked && !connected && canReceive ? <>
          {!scanning ? <div className="local-pair-actions"><button type="button" className="local-pair-button" disabled={submitting} onClick={() => setScanning(true)}>{role === "teacher" ? "Scan learner response" : "Scan teacher QR"}</button></div> : null}
          {hubAddress ? <>
            <label className="local-pair-code-field" htmlFor={inputId}>
              {incomingLabel}
              <input id={inputId} value={inputPacket} onChange={(event) => { setInputPacket(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase()); setPairingError(""); }} maxLength={6} placeholder="ABC234" spellCheck={false} autoCapitalize="characters" autoCorrect="off" autoComplete="off" disabled={submitting} onKeyDown={(event) => { if (event.key === "Enter" && inputPacket.length === 6 && !submitting) void (role === "teacher" ? handleTeacherScan(inputPacket) : handleLearnerScan(inputPacket)); }} />
            </label>
          </> : null}
          {hubAddress ? <div className="local-pair-actions">
            <button type="button" className="local-pair-button secondary" disabled={submitting || inputPacket.length !== 6} onClick={() => void (role === "teacher" ? handleTeacherScan(inputPacket) : handleLearnerScan(inputPacket))}>{submitting ? "Connecting…" : role === "teacher" ? "Accept learner response" : "Use teacher connection code"}</button>
          </div> : null}
        </> : null}
        {!blocked && !connected && role === "learner" && answerPacket ? <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" disabled={submitting} onClick={() => { setAnswerPacket(""); setInputPacket(""); setScanning(false); setPairingError(""); }}>Use a new teacher code</button></div> : null}
        <QrScanner active={!blocked && !connected && scanning} label={role === "teacher" ? "Scan learner response QR" : "Scan teacher pairing QR"} onScan={role === "teacher" ? handleTeacherScan : handleLearnerScan} onCancel={() => setScanning(false)} />
        {pairingError ? <p className="local-pair-error" role="alert">{pairingError}</p> : null}
        {!blocked && !connected && role === "teacher" ? <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" disabled={submitting} onClick={regenerateOffer}>New teacher QR</button></div> : null}
        {/*
          * No camera on either device. The code below is the very same text the
          * QR would have carried, so copying it out of one device and pasting
          * it into the other connects them with nothing installed on the
          * network - no hub, no certificate, no server.
          */}
        {!blocked && !connected && (pairingCode || canReceive) ? <details className="local-pair-codes">
          <summary>No camera? Connect with codes</summary>
          {pairingCode ? <>
            <p className="local-pair-copy">{role === "teacher"
              ? "Copy this and give it to the learner's device, then paste the reply code they send back."
              : "Copy this and give it to the teacher's device, then paste the reply code they send back."}</p>
            <textarea className="local-pair-long" readOnly value={pairingCode} rows={3} spellCheck={false} aria-label={outgoingLabel} onFocus={(event) => event.currentTarget.select()} />
            <div className="local-pair-actions">
              <button type="button" className="local-pair-button secondary" onClick={() => void copyPairingCode()}>{codeCopied ? "Copied" : "Copy code"}</button>
            </div>
          </> : null}
          {canReceive ? <>
            <p className="local-pair-copy">{role === "teacher" ? "Paste the learner's reply code here." : "Paste the teacher's code here."}</p>
            <textarea className="local-pair-long" value={typedCode} onChange={(event) => { setTypedCode(event.target.value); setPairingError(""); }} rows={3} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="Paste the code from the other device" aria-label={incomingLabel} />
            <div className="local-pair-actions">
              <button type="button" className="local-pair-button" disabled={submitting || typedCode.trim().length < 20} onClick={() => void submitTypedCode()}>{submitting ? "Connecting…" : role === "teacher" ? "Connect to learner" : "Connect to teacher"}</button>
            </div>
          </> : null}
        </details> : null}
        {codesError ? <p className="local-pair-error" role="alert">{codesError}</p> : null}
        {connected && role === "teacher" ? <p className="local-pair-device">Connected device: {status.remoteDeviceName || "Learner device"}</p> : null}
        {!blocked && connected && onConnected ? <div className="local-pair-actions"><button type="button" className="local-pair-button" onClick={() => onConnectedRef.current?.()}>Continue</button></div> : null}
      </div>
    </section>
    {fullscreenQr && qrMarkup && !connected && typeof document !== "undefined" ? createPortal(
      <div className="local-pair-fullscreen" role="dialog" aria-modal="true" aria-label={qrCaption} onClick={(event) => { if (event.target === event.currentTarget) setFullscreenQr(false); }}>
        <div className="local-pair-fullscreen-card">
          <p className="local-pair-fullscreen-caption">{qrCaption}</p>
          <div className="local-pair-fullscreen-qr" dangerouslySetInnerHTML={{ __html: qrMarkup }} />
          <button type="button" className="local-pair-button" onClick={() => setFullscreenQr(false)}>Close</button>
        </div>
      </div>,
      document.body
    ) : null}
    </>
  );
}
