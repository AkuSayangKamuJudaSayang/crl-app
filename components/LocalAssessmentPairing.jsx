"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "../lib/vendor/qrcode.mjs";
import {
  acceptLearnerAssessmentOffer,
  completeTeacherAssessmentPairing,
  getAssessmentPeerStatus,
  readAssessmentPairingPacket,
  startTeacherAssessmentPairing,
  subscribeAssessmentPeerStatus,
} from "../lib/assessmentPeer";

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

function PairingScanner({ expectedKind, onCancel, onScan }) {
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

export default function LocalAssessmentPairing({ code, role, onCodeResolved }) {
  const [resolvedCode, setResolvedCode] = useState(normalizeCode(code));
  const [status, setStatus] = useState(() => getAssessmentPeerStatus(code));
  const [offer, setOffer] = useState("");
  const [answer, setAnswer] = useState("");
  const [scanning, setScanning] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const next = normalizeCode(code);
    if (next) setResolvedCode(next);
  }, [code]);

  useEffect(() => {
    if (!resolvedCode) return undefined;
    return subscribeAssessmentPeerStatus(resolvedCode, setStatus);
  }, [resolvedCode]);

  useEffect(() => {
    if (status.connected) {
      setScanning(false);
      setError("");
    }
  }, [status.connected]);

  const startTeacher = async () => {
    setWorking(true);
    setError("");
    try {
      const nextOffer = await startTeacherAssessmentPairing(resolvedCode);
      setOffer(nextOffer);
      setAnswer("");
    } catch (nextError) {
      setError(nextError?.message || "Unable to start local pairing.");
    } finally {
      setWorking(false);
    }
  };

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
      }
    } catch (nextError) {
      setError(nextError?.message || "Unable to pair these devices.");
    } finally {
      setWorking(false);
    }
  };

  const connected = status.connected;
  return (
    <section className="local-pair-section" aria-label="Offline local connection">
      <style>{`
        .local-pair-section{margin-top:16px;padding:16px;border:1px solid #d8e0e8;border-radius:14px;background:#fff;color:#1a2b4c}.local-pair-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.local-pair-title{margin:0;font-size:14px;line-height:1.25;font-weight:900}.local-pair-copy{margin:5px 0 0;color:#607086;font-size:11px;line-height:1.55}.local-pair-status{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;font-size:10px;font-weight:850}.local-pair-dot{width:8px;height:8px;border-radius:50%;background:#b37934}.local-pair-dot.connected{background:#31745a}.local-pair-dot.failed{background:#9b3a35}.local-pair-metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.local-pair-metric{padding:10px;border:1px solid #e3e8ee;border-radius:10px;background:#fffdf8}.local-pair-label{color:#738094;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.07em}.local-pair-value{margin-top:4px;font-size:12px;font-weight:900}.local-pair-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.local-pair-button{min-height:42px;padding:0 14px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:10px;background:#1a2b4c;color:#fff;font:inherit;font-size:11px;font-weight:900;cursor:pointer;transition:transform .16s ease,background .16s ease,border-color .16s ease}.local-pair-button:hover{background:#243b66}.local-pair-button:active{transform:scale(.98)}.local-pair-button:disabled{cursor:wait;opacity:.65}.local-pair-button.secondary{border:1px solid #cfd8e2;background:#fff;color:#1a2b4c}.local-pair-button.quiet{border:1px solid #e0e5eb;background:#fffdf8;color:#5c6878}.local-pair-qr{width:min(100%,330px);margin:14px auto 0;padding:10px;border:1px solid #d8e0e8;border-radius:12px;background:#fff}.local-pair-qr svg{display:block;width:100%;height:auto}.local-pair-instruction{margin:10px auto 0;max-width:360px;color:#526176;font-size:11px;line-height:1.55;text-align:center}.local-pair-error{margin-top:10px;padding:9px 10px;border:1px solid #e4c5bf;border-radius:9px;background:#fff7f3;color:#87352f;font-size:10px;line-height:1.45}.local-scanner{margin-top:12px}.local-scanner-frame{position:relative;overflow:hidden;aspect-ratio:4/3;border-radius:12px;background:#14213a}.local-scanner-frame video{width:100%;height:100%;object-fit:cover}.local-scanner-frame span{position:absolute;inset:16%;border:2px solid rgba(255,255,255,.9);border-radius:12px;box-shadow:0 0 0 999px rgba(8,18,35,.25)}@media(max-width:560px){.local-pair-heading{display:block}.local-pair-status{margin-top:9px}.local-pair-metrics{grid-template-columns:1fr}.local-pair-button{flex:1;min-width:130px}}@media(prefers-reduced-motion:reduce){.local-pair-button{transition:none}}
      `}</style>
      <div className="local-pair-heading">
        <div>
          <h3 className="local-pair-title">Hotspot or USB tethering</h3>
          <p className="local-pair-copy">Connect both devices to the same local network, then pair them once.</p>
        </div>
        <div className="local-pair-status" aria-live="polite">
          <span className={`local-pair-dot ${connected ? "connected" : status.state === "failed" ? "failed" : ""}`} />
          {connected ? "Local link active" : status.detail || "Not paired"}
        </div>
      </div>

      <div className="local-pair-metrics">
        <div className="local-pair-metric"><div className="local-pair-label">Local link</div><div className="local-pair-value">{connected ? "Connected" : "Not connected"}</div></div>
        <div className="local-pair-metric"><div className="local-pair-label">Local latency</div><div className="local-pair-value">{Number.isFinite(status.latencyMs) ? `${status.latencyMs} ms` : "—"}</div></div>
      </div>

      {role === "teacher" && !offer && !connected && (
        <div className="local-pair-actions"><button type="button" className="local-pair-button" onClick={startTeacher} disabled={working || resolvedCode.length !== 6}>{working ? "Preparing…" : "Start Local Pairing"}</button></div>
      )}
      {role === "teacher" && offer && !connected && !scanning && (
        <>
          <PairingQr value={offer} label="Teacher local pairing QR" />
          <p className="local-pair-instruction">On the learner device, open Connection Settings and scan this QR. Then scan the learner response.</p>
          <div className="local-pair-actions">
            <button type="button" className="local-pair-button" onClick={() => setScanning(true)} disabled={working}>{working ? "Connecting…" : "Scan Learner Response"}</button>
            <button type="button" className="local-pair-button secondary" onClick={startTeacher} disabled={working}>Restart</button>
          </div>
        </>
      )}
      {role === "learner" && !answer && !connected && !scanning && (
        <div className="local-pair-actions"><button type="button" className="local-pair-button" onClick={() => setScanning(true)} disabled={working}>{working ? "Preparing…" : "Scan Teacher QR"}</button></div>
      )}
      {role === "learner" && answer && !connected && !scanning && (
        <>
          <PairingQr value={answer} label="Learner local pairing response QR" />
          <p className="local-pair-instruction">Show this response to the teacher device. The link activates as soon as the teacher scans it.</p>
          <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" onClick={() => { setAnswer(""); setScanning(true); }}>Scan Again</button></div>
        </>
      )}
      {scanning && <PairingScanner expectedKind={role === "teacher" ? "a" : "o"} onCancel={() => setScanning(false)} onScan={processScan} />}
      {error && <div className="local-pair-error" role="alert">{error}</div>}
    </section>
  );
}
