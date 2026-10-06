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
import { checkPairingHub, discoverPairingHub, getHubAssessmentOffer, getHubLearnerResponse, getPairingHub, registerPairingCode, savePairingHub, shortPairingInvitation } from "../lib/assessmentPairingHub";

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
  const [hubInput, setHubInput] = useState("");
  const [hubError, setHubError] = useState("");
  const [checkingHub, setCheckingHub] = useState(false);
  const [shortCode, setShortCode] = useState(null);
  const [enlargedQr, setEnlargedQr] = useState(false);
  const [automaticAttempt, setAutomaticAttempt] = useState(0);
  const busyRef = useRef(false);
  const consumedOfferRef = useRef("");
  const offerRequestRef = useRef(0);
  const scopeRef = useRef("");
  scopeRef.current = `${role}:${resolvedCode}`;
  const inputId = useId();
  const hubId = useId();
  const onConnectedRef = useRef(onConnected);
  const onPeerConnectedRef = useRef(onPeerConnected);
  const notifiedConnectionRef = useRef("");

  useEffect(() => {
    const updateHub = (event) => {
      const hub = typeof event?.detail === "string" ? event.detail : getPairingHub();
      setHubAddress(hub);
      setHubInput(hub);
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
  useEffect(() => {
    if (blocked || connected) return undefined;
    let cancelled = false;
    void discoverPairingHub().then((hub) => { if (!cancelled) { setHubAddress(hub); setHubInput(hub); setHubError(""); } })
      .catch(() => { if (!cancelled && !getPairingHub()) setHubError("Hub unavailable. Use QR or complete setup."); });
    return () => { cancelled = true; };
  }, [blocked, connected, automaticAttempt]);

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
  }, [blocked, connected, role, hubAddress, resolvedCode, answerPacket, initialOffer, handleLearnerScan, automaticAttempt]);
  useEffect(() => {
    setShortCode(null);
    if (blocked || connected || !hubAddress || !outgoingPacket) return undefined;
    let cancelled = false;
    setHubError("");
    let expiryTimer;
    const register = async () => {
      try {
        const entry = await registerPairingCode(hubAddress, resolvedCode, role === "teacher" ? "o" : "a", outgoingPacket);
        if (cancelled) return;
        setShortCode({ ...entry, packet: outgoingPacket, hub: hubAddress });
        // Refresh only the hub reference; keep the live peer invitation intact.
        expiryTimer = setTimeout(() => { setShortCode(null); void register(); }, Math.max(1000, entry.expiresInMs + 100));
      } catch (error) { if (!cancelled) setHubError(error?.message || "Offline hub unavailable."); }
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
  const qrMarkup = useMemo(
    () => createQrMarkup(displayCode && typeof window !== "undefined"
      ? shortPairingInvitation(resolvedCode, role === "teacher" ? "o" : "a", displayCode, hubAddress, window.location.origin)
      : role === "teacher" && offerPacket && typeof window !== "undefined"
      ? assessmentPairingInvitation(resolvedCode, offerPacket, window.location.origin)
      : outgoingPacket),
    [role, resolvedCode, offerPacket, outgoingPacket, displayCode, hubAddress]
  );
  const useHub = async () => {
    setCheckingHub(true);
    setHubError("");
    try {
      setHubAddress(await checkPairingHub(hubInput));
    } catch (error) { setHubError(error?.message || "Offline hub unavailable."); }
    finally { setCheckingHub(false); }
  };
  const canReceive = role === "teacher" ? Boolean(offerPacket) : !answerPacket;
  const incomingLabel = role === "teacher" ? "Learner response code" : "Teacher connection code";
  const outgoingLabel = role === "teacher" ? "Teacher connection code" : "Learner response code";
  const stateLabel = blocked ? "Available when offline" : connected ? "Devices connected"
    : submitting ? "Preparing connection…"
    : role === "teacher" ? offerPacket ? "Ready for learner" : "Preparing teacher connection code…"
    : answerPacket ? "Show response to teacher" : "Scan teacher QR or enter its 6-character code";

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
        .local-pair-qr{width:min(100%,240px);box-sizing:border-box;margin:14px auto 0;padding:10px;border:1px solid #d8e0e8;border-radius:12px;background:#fff}.local-pair-qr.is-compact{width:min(100%,180px)}.local-pair-qr.is-enlarged{width:min(100%,420px)}.local-pair-qr svg{display:block;width:100%;height:auto}
        .local-pair-device{margin:12px 0 0;font-size:13px;font-weight:800;color:#2e5d49}.local-pair-error{margin:12px 0 0;color:#9b2e22;font-size:12.5px;line-height:1.45}
        .local-pair-code-field{display:grid;gap:8px;margin-top:16px;font-size:13px;font-weight:800}
        .local-pair-code-field input{box-sizing:border-box;width:100%;min-width:0;min-height:46px;padding:10px;border:1px solid #aab8cb;border-radius:9px;background:#fff;color:#1a2b4c;font:12px/1.5 monospace;overflow-wrap:anywhere;word-break:break-all;letter-spacing:.15em}
        .local-pair-code-field input:focus{outline:2px solid #4a6fa5;outline-offset:2px}
        .local-pair-code{display:block;margin:10px 0;color:#1a2b4c;font:900 28px/1.3 monospace;letter-spacing:.18em;text-align:center}.local-pair-hub{margin-top:16px;font-size:12px}.local-pair-hub summary{cursor:pointer;padding:8px 0;font-weight:800}
        .local-pair-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px}.local-pair-button{min-height:44px;padding:8px 16px;border:0;border-radius:11px;background:#1a2b4c;color:#fff;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:transform .16s ease,background .16s ease}.local-pair-button:hover:not(:disabled){background:#243b66}.local-pair-button:active:not(:disabled){transform:scale(.98)}.local-pair-button.secondary{border:1px solid #cfd8e2;background:#fff;color:#1a2b4c}.local-pair-button:disabled{opacity:.6;cursor:wait}
        .local-pair-scanner{margin-top:14px;padding:10px;border:1px solid #d8e0e8;border-radius:12px;background:#fff}.local-pair-video{display:block;width:100%;max-height:300px;object-fit:cover;border-radius:9px;background:#10213c}.local-pair-scanner .local-pair-button{width:100%;margin-top:10px}
        @keyframes localPairSpin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.local-pair-spinner{animation:none}.local-pair-button{transition:none}}
      `}</style>
      <h3 className="local-pair-title">{role === "teacher" ? "Teacher offline connection" : "Connect to teacher offline"}</h3>
      <div className="local-pair-content">
        <div className="local-pair-state" role="status">
          {!blocked && !connected ? <span className="local-pair-spinner" aria-hidden="true" /> : connected ? <span className="local-pair-dot" aria-hidden="true" /> : null}
          {stateLabel}
        </div>
        {!blocked && !connected && qrMarkup ? <>
          <div className={`local-pair-qr${displayCode ? " is-compact" : ""}${enlargedQr ? " is-enlarged" : ""}`} role="img" aria-label={role === "teacher" ? "Teacher pairing QR" : "Learner response QR"} dangerouslySetInnerHTML={{ __html: qrMarkup }} />
          <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" onClick={() => setEnlargedQr((value) => !value)}>{enlargedQr ? "Smaller QR" : "Enlarge QR"}</button></div>
        </> : null}
        {!blocked && !connected && outgoingPacket ? <>
          {displayCode ? <><p className="local-pair-copy">{outgoingLabel}</p><output className="local-pair-code" aria-label={outgoingLabel}>{displayCode}</output></> : null}
          <p className="local-pair-copy">{role === "teacher" ? "Learner scans first. Then accept the learner response." : "Teacher scans or enters this response."}</p>
        </> : null}
        {!blocked && !connected && canReceive ? <>
          <label className="local-pair-code-field" htmlFor={inputId}>
            {incomingLabel}
            <input id={inputId} value={inputPacket} onChange={(event) => { setInputPacket(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase()); setPairingError(""); }} maxLength={6} placeholder="ABC234" spellCheck={false} autoCapitalize="characters" autoCorrect="off" autoComplete="off" disabled={submitting || !hubAddress} onKeyDown={(event) => { if (event.key === "Enter" && inputPacket.length === 6 && !submitting) void (role === "teacher" ? handleTeacherScan(inputPacket) : handleLearnerScan(inputPacket)); }} />
          </label>
          <div className="local-pair-actions">
            <button type="button" className="local-pair-button" disabled={submitting || !hubAddress || inputPacket.length !== 6} onClick={() => void (role === "teacher" ? handleTeacherScan(inputPacket) : handleLearnerScan(inputPacket))}>{submitting ? "Connecting…" : role === "teacher" ? "Accept learner response" : "Use teacher connection code"}</button>
            {!scanning ? <button type="button" className="local-pair-button secondary" disabled={submitting} onClick={() => setScanning(true)}>{role === "teacher" ? "Scan learner response" : "Scan teacher QR"}</button> : null}
          </div>
        </> : null}
        {!blocked && !connected && role === "learner" && answerPacket ? <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" disabled={submitting} onClick={() => { setAnswerPacket(""); setInputPacket(""); setScanning(false); setPairingError(""); }}>Use a new teacher code</button></div> : null}
        <QrScanner active={!blocked && !connected && scanning} label={role === "teacher" ? "Scan learner response QR" : "Scan teacher pairing QR"} onScan={role === "teacher" ? handleTeacherScan : handleLearnerScan} onCancel={() => setScanning(false)} />
        {pairingError ? <p className="local-pair-error" role="alert">{pairingError}</p> : null}
        {!blocked && !connected && role === "teacher" ? <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" disabled={submitting} onClick={regenerateOffer}>New teacher QR</button></div> : null}
        {!blocked && !connected ? <details className="local-pair-hub">
          <summary>Offline setup</summary>
          <p className="local-pair-copy">One-time school setup.</p>
          <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" onClick={() => setAutomaticAttempt(value => value + 1)}>Find hub</button></div>
          {/*
            * A learner is never asked for a hub address: the teacher's QR
            * carries it, and a hub on the school network answers to its own
            * name. Typing one is a setup job, so only the teacher is offered
            * the field.
            */}
          {role === "teacher" ? <>
            <label className="local-pair-code-field" htmlFor={hubId}>Hub address<input id={hubId} type="url" value={hubInput} onChange={(event) => setHubInput(event.target.value)} placeholder="http://192.168.137.1:8787" autoCapitalize="off" spellCheck={false} /></label>
            <div className="local-pair-actions">
              <button type="button" className="local-pair-button secondary" disabled={checkingHub} onClick={useHub}>{checkingHub ? "Checking…" : "Use hub"}</button>
              {hubAddress ? <button type="button" className="local-pair-button secondary" onClick={() => { savePairingHub(""); setHubAddress(""); setHubInput(""); setHubError(""); }}>QR only</button> : null}
            </div>
          </> : null}
          <p className="local-pair-copy"><a href="/offline-hub/CRL-Offline-Setup.zip" download>Download setup · Windows / Mac / Linux</a></p>
          <p className="local-pair-copy"><a href="https://github.com/AkuSayangKamuJudaSayang/crl-app/blob/main/docs/offline-pairing-hub.md" target="_blank" rel="noreferrer">Device setup guide</a></p>
        </details> : null}
        {!blocked && !connected && !hubAddress ? <p className="local-pair-copy">{role === "teacher" ? "Use QR, or set up the offline hub for 6-character codes." : "Scan the teacher QR, or make sure the offline hub is running on the school network."}</p> : null}
        {hubError ? <p className="local-pair-error" role="alert">{hubError}</p> : null}
        {connected && role === "teacher" ? <p className="local-pair-device">Connected device: {status.remoteDeviceName || "Learner device"}</p> : null}
        {!blocked && connected && onConnected ? <div className="local-pair-actions"><button type="button" className="local-pair-button" onClick={() => onConnectedRef.current?.()}>Continue</button></div> : null}
      </div>
    </section>
  );
}
