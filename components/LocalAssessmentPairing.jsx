"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import qrcode from "../lib/vendor/qrcode.mjs";
import {
  acceptLearnerAssessmentOffer,
  completeTeacherAssessmentPairing,
  getAssessmentPeerStatus,
  readAssessmentPairingPacket,
  startTeacherAssessmentPairing,
  subscribeAssessmentPeerStatus,
} from "../lib/assessmentPeer";
import {
  publishAssessmentPairingAnswer,
  subscribeAssessmentPairingAnswer,
} from "../lib/assessmentChannel";

function normalizeCode(code) {
  return String(code || "").replace(/\s+/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function PairingQr({ value, label }) {
  const markup = useMemo(() => {
    if (!value) return "";
    try {
      const code = qrcode(0, "L");
      code.addData(value);
      code.make();
      return code.createSvgTag({ cellSize: 3, margin: 3, scalable: true });
    } catch {
      return "";
    }
  }, [value]);

  if (!markup) return <div className="local-pair-error">Unable to create the pairing QR. Restart pairing and try again.</div>;
  return (
    <div className="local-pair-qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: markup }} />
  );
}

async function decodeImage(file) {
  let bitmap;
  let objectUrl = "";
  if (typeof createImageBitmap === "function") {
    bitmap = await createImageBitmap(file);
  } else {
    objectUrl = URL.createObjectURL(file);
    bitmap = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The QR image could not be opened."));
      image.src = objectUrl;
    });
  }
  const max = 1400;
  const sourceWidth = bitmap.width || bitmap.naturalWidth;
  const sourceHeight = bitmap.height || bitmap.naturalHeight;
  const scale = Math.min(1, max / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const imported = await import("../lib/vendor/jsQR.js");
  const jsQR = imported.default?.default || imported.default || imported;
  return jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })?.data || "";
}

function PairingScanner({ expectedKind, onCancel, onScan, hint }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraError, setCameraError] = useState("");
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    let stopped = false;
    let stream = null;
    let animationFrame = 0;
    let lastScan = 0;

    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const imported = await import("../lib/vendor/jsQR.js");
        const jsQR = imported.default?.default || imported.default || imported;

        const scan = (now) => {
          if (stopped) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video && canvas && video.readyState >= 2 && now - lastScan > 130) {
            lastScan = now;
            const width = Math.min(960, video.videoWidth || 960);
            const ratio = width / (video.videoWidth || width);
            const height = Math.max(1, Math.round((video.videoHeight || 540) * ratio));
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            context.drawImage(video, 0, 0, width, height);
            const image = context.getImageData(0, 0, width, height);
            const result = jsQR(image.data, width, height, { inversionAttempts: "attemptBoth" });
            if (result?.data) {
              try {
                const packet = readAssessmentPairingPacket(result.data);
                if (packet.k !== expectedKind) throw new Error("Scan the QR shown on the other device.");
                stopped = true;
                onScan(result.data);
                return;
              } catch (error) {
                setScanError(error?.message || "That QR is not a valid CRL-App pairing code.");
              }
            }
          }
          animationFrame = window.requestAnimationFrame(scan);
        };
        animationFrame = window.requestAnimationFrame(scan);
      } catch {
        setCameraError("Camera access is unavailable. Use a saved QR image instead.");
      }
    };

    void run();
    return () => {
      stopped = true;
      window.cancelAnimationFrame(animationFrame);
      for (const track of stream?.getTracks?.() || []) track.stop();
    };
  }, [expectedKind, onScan]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setScanError("");
    try {
      const value = await decodeImage(file);
      if (!value) throw new Error("No QR code was found in that image.");
      const packet = readAssessmentPairingPacket(value);
      if (packet.k !== expectedKind) throw new Error("Use the QR shown on the other device.");
      onScan(value);
    } catch (error) {
      setScanError(error?.message || "The QR image could not be read.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="local-scanner">
      <div className="local-scanner-frame">
        <video ref={videoRef} muted playsInline aria-label="Pairing QR camera" />
        <span aria-hidden="true" />
      </div>
      <canvas ref={canvasRef} hidden />
      {hint && <p className="local-pair-hint">{hint}</p>}
      {(cameraError || scanError) && <div className="local-pair-error" role="alert">{scanError || cameraError}</div>}
      <div className="local-pair-actions">
        <label className="local-pair-button secondary">
          Use QR image
          <input type="file" accept="image/*" capture="environment" onChange={handleFile} hidden />
        </label>
        <button type="button" className="local-pair-button quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function LocalAssessmentPairing({ code, role, onCodeResolved, onConnected }) {
  const [resolvedCode, setResolvedCode] = useState(normalizeCode(code));
  const [status, setStatus] = useState(() => getAssessmentPeerStatus(code));
  const [offer, setOffer] = useState("");
  const [answer, setAnswer] = useState("");
  const [scanning, setScanning] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  /*
   * null while the relay is still settling, true when it is listening, false
   * when it is unreachable and the offline camera fallback should take over.
   */
  const [relayReady, setRelayReady] = useState(null);
  /* Set when the teacher dismisses the offline fallback, so it stays closed. */
  const [fallbackDismissed, setFallbackDismissed] = useState(false);
  /* True once waiting on the relay has gone on long enough to stop trusting it. */
  const [relayStalled, setRelayStalled] = useState(false);

  useEffect(() => {
    const next = normalizeCode(code);
    if (next) setResolvedCode(next);
  }, [code]);

  useEffect(() => {
    if (!resolvedCode) return undefined;
    return subscribeAssessmentPeerStatus(resolvedCode, setStatus);
  }, [resolvedCode]);

  const connected = status.connected;

  useEffect(() => {
    if (connected) {
      setScanning(false);
      setError("");
    }
  }, [connected]);

  const startTeacher = useCallback(async () => {
    setWorking(true);
    setError("");
    setFallbackDismissed(false);
    setRelayReady(null);
    try {
      const nextOffer = await startTeacherAssessmentPairing(resolvedCode);
      setOffer(nextOffer);
      setAnswer("");
    } catch (nextError) {
      setError(nextError?.message || "Unable to start local pairing.");
    } finally {
      setWorking(false);
    }
  }, [resolvedCode]);

  /*
   * Teacher: as soon as an offer is out, listen for the learner's answer on the
   * pairing relay. The learner publishes it right after scanning, so the link
   * completes without the teacher scanning anything.
   */
  useEffect(() => {
    if (role !== "teacher" || !offer || connected) return undefined;

    let cancelled = false;
    const subscription = subscribeAssessmentPairingAnswer(resolvedCode, (packet) => {
      void (async () => {
        try {
          await completeTeacherAssessmentPairing(resolvedCode, packet);
        } catch (nextError) {
          if (!cancelled) setError(nextError?.message || "Unable to complete local pairing.");
        }
      })();
    });

    subscription.ready.then((ready) => {
      if (!cancelled) setRelayReady(ready);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [role, offer, connected, resolvedCode]);

  /*
   * Offline fallback. Pairing must never dead-end: the teacher reads the
   * learner's response code directly when the relay is unreachable, and also
   * when the relay is up but no answer has arrived in time. The scan opens on
   * its own so there is no second button to press, and stays closed once the
   * teacher dismisses it.
   */
  useEffect(() => {
    setRelayStalled(false);
    if (role !== "teacher" || !offer || connected) return undefined;
    const timer = window.setTimeout(() => setRelayStalled(true), 20000);
    return () => window.clearTimeout(timer);
  }, [role, offer, connected]);

  const fallbackWanted =
    role === "teacher" &&
    Boolean(offer) &&
    !connected &&
    !fallbackDismissed &&
    (relayReady === false || relayStalled);

  useEffect(() => {
    if (!fallbackWanted || scanning) return;
    setScanning(true);
  }, [fallbackWanted, scanning]);

  useEffect(() => {
    if (role === "teacher" && !offer) {
      setRelayReady(null);
      setFallbackDismissed(false);
      setRelayStalled(false);
    }
  }, [role, offer]);

  const processScan = async (value) => {
    setScanning(false);
    setWorking(true);
    setError("");
    try {
      if (role === "teacher") {
        await completeTeacherAssessmentPairing(resolvedCode, value);
      } else {
        const result = await acceptLearnerAssessmentOffer(value);
        setResolvedCode(result.code);
        setAnswer(result.answer);
        onCodeResolved?.(result.code);
        /* Best effort: lets the teacher finish without a second scan. */
        void publishAssessmentPairingAnswer(result.code, result.answer);
      }
    } catch (nextError) {
      setError(nextError?.message || "Unable to pair these devices.");
    } finally {
      setWorking(false);
    }
  };

  /*
   * Hold the confirmation briefly, then let the overlay close itself. The
   * callback is held in a ref so a re-render - the peer heartbeat updates
   * status every 1.8s - cannot restart the timer and stall the close.
   */
  const onConnectedRef = useRef(onConnected);
  useEffect(() => {
    onConnectedRef.current = onConnected;
  }, [onConnected]);

  useEffect(() => {
    if (!connected) return undefined;
    const timer = window.setTimeout(() => onConnectedRef.current?.(), 1100);
    return () => window.clearTimeout(timer);
  }, [connected]);

  const relayPending = role === "teacher" && Boolean(offer) && !connected && !fallbackWanted;

  return (
    <section className="local-pair-section" aria-label="Offline local connection">
      <style>{`
        .local-pair-section{margin-top:14px;padding:14px;border:1px solid #d8e0e8;border-radius:14px;background:#fff;color:#1a2b4c}
        .local-pair-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}
        .local-pair-title{margin:0;font-size:13px;font-weight:900}
        .local-pair-status{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;font-size:11px;font-weight:850}
        .local-pair-setup-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
        .local-pair-setup{padding:12px;border:1px solid #e3e8ee;border-radius:12px;background:#fbfcfe}
        .local-pair-setup-title{margin:0;font-size:12px;font-weight:900}
        .local-pair-setup-copy{margin:5px 0 0;color:#66758a;font-size:10.5px;line-height:1.5}
        @media (max-width:520px){.local-pair-setup-grid{grid-template-columns:1fr}}
        .local-pair-dot{width:8px;height:8px;border-radius:50%;background:#b37934}
        .local-pair-dot.connected{background:#31745a}
        .local-pair-dot.failed{background:#9b3a35}
        .local-pair-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
        .local-pair-button{min-height:42px;padding:0 14px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:10px;background:#1a2b4c;color:#fff;font:inherit;font-size:11px;font-weight:900;cursor:pointer;transition:transform .16s ease,background .16s ease,border-color .16s ease}
        .local-pair-button:hover{background:#243b66}
        .local-pair-button:active{transform:scale(.98)}
        .local-pair-button:disabled{cursor:wait;opacity:.65}
        .local-pair-button.secondary{border:1px solid #cfd8e2;background:#fff;color:#1a2b4c}
        .local-pair-button.secondary:hover{background:#f3f6fa}
        .local-pair-button.quiet{border:1px solid #e0e5eb;background:#fffdf8;color:#5c6878}
        .local-pair-qr{width:min(100%,300px);margin:14px auto 0;padding:10px;border:1px solid #d8e0e8;border-radius:12px;background:#fff}
        .local-pair-qr svg{display:block;width:100%;height:auto}
        .local-pair-hint{margin:10px 0 0;color:#526176;font-size:11px;line-height:1.5;text-align:center}
        .local-pair-error{margin-top:10px;padding:10px 12px;border:1px solid #f0cdc8;border-radius:10px;background:#fff0f2;color:#9b2e22;font-size:11px;line-height:1.5}
        .local-pair-connected{display:flex;align-items:center;gap:9px;margin-top:12px;padding:12px 14px;border:1px solid #cfe6d8;border-radius:12px;background:#f2faf5;color:#2f6a4f;font-size:12px;font-weight:900}
        .local-pair-spinner{width:15px;height:15px;flex:0 0 15px;border:2px solid #cfd8e2;border-top-color:#1a2b4c;border-radius:50%;animation:localPairSpin .8s linear infinite}
        .local-scanner{margin-top:14px}
        .local-scanner-frame{position:relative;overflow:hidden;border:1px solid #d8e0e8;border-radius:12px;background:#0f1a2c}
        .local-scanner-frame video{display:block;width:100%;max-height:260px;object-fit:cover}
        .local-scanner-frame span{position:absolute;inset:14%;border:2px solid rgba(255,255,255,.85);border-radius:12px;pointer-events:none}
        @keyframes localPairSpin{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion:reduce){.local-pair-spinner{animation:none}}
      `}</style>

      <div className="local-pair-heading">
        <h3 className="local-pair-title">Offline pairing</h3>
        <div className="local-pair-status" aria-live="polite">
          <span className={`local-pair-dot ${connected ? "connected" : status.state === "failed" ? "failed" : ""}`} />
          {connected ? "Connected" : status.detail || "Not paired"}
        </div>
      </div>

      {!connected && (
        <div className="local-pair-setup-grid">
          <section className="local-pair-setup" aria-label="Hotspot setup">
            <h4 className="local-pair-setup-title">Hotspot Setup</h4>
            <p className="local-pair-setup-copy">
              Turn on the teacher device&apos;s hotspot, then join the learner device to it.
            </p>
          </section>
          <section className="local-pair-setup" aria-label="USB tethering">
            <h4 className="local-pair-setup-title">USB Tethering</h4>
            <p className="local-pair-setup-copy">
              Connect the learner device by USB, then turn on USB tethering.
            </p>
          </section>
        </div>
      )}

      {connected && (
        <div className="local-pair-connected" role="status">
          <span className="local-pair-dot connected" />
          Learner connected
        </div>
      )}

      {!connected && role === "teacher" && !offer && (
        <div className="local-pair-actions">
          <button type="button" className="local-pair-button" onClick={startTeacher} disabled={working || resolvedCode.length !== 6}>
            {working ? "Preparing…" : "Start Pairing"}
          </button>
        </div>
      )}

      {!connected && role === "teacher" && offer && (
        <>
          <PairingQr value={offer} label="Teacher local pairing QR" />
          <p className="local-pair-hint">Scan this on the learner device.</p>
          {relayPending && (
            <div className="local-pair-connected" role="status">
              <span className="local-pair-spinner" aria-hidden="true" />
              Connecting…
            </div>
          )}
          {!scanning && (
            <div className="local-pair-actions">
              <button type="button" className="local-pair-button secondary" onClick={startTeacher} disabled={working}>Restart</button>
            </div>
          )}
        </>
      )}

      {!connected && role === "learner" && !answer && !scanning && (
        <div className="local-pair-actions">
          <button type="button" className="local-pair-button" onClick={() => setScanning(true)} disabled={working}>
            {working ? "Preparing…" : "Scan Teacher QR"}
          </button>
        </div>
      )}

      {!connected && role === "learner" && answer && !scanning && (
        <>
          <PairingQr value={answer} label="Learner local pairing response QR" />
          <p className="local-pair-hint">Keep this on screen. The teacher side connects automatically.</p>
          <div className="local-pair-actions">
            <button type="button" className="local-pair-button secondary" onClick={() => { setAnswer(""); setScanning(true); }}>Scan Again</button>
          </div>
        </>
      )}

      {!connected && scanning && (
        <PairingScanner
          expectedKind={role === "teacher" ? "a" : "o"}
          hint={role === "teacher" ? "Point the camera at the learner's response code." : undefined}
          onCancel={() => { setScanning(false); setFallbackDismissed(true); }}
          onScan={processScan}
        />
      )}

      {error && <div className="local-pair-error" role="alert">{error}</div>}
    </section>
  );
}
