"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import jsQR from "../lib/vendor/jsQR.js";
import { readAssessmentInvitation } from "../lib/assessmentInvitation";
export { readAssessmentCodeQr } from "../lib/assessmentInvitation";

export default function AssessmentCodeScanner({ active, onScan, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const overlayRef = useRef(null);
  const cameraButtonRef = useRef(null);
  const focusMessageTimerRef = useRef(null);
  const [error, setError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [focusMessage, setFocusMessage] = useState("");

  const focusCamera = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track || !cameraReady) {
      setFocusMessage("Starting camera...");
      return;
    }

    if (focusMessageTimerRef.current) {
      window.clearTimeout(focusMessageTimerRef.current);
    }

    try {
      const capabilities = track.getCapabilities?.() || {};
      const focusModes = Array.isArray(capabilities.focusMode)
        ? capabilities.focusMode
        : [];
      const focusMode = focusModes.includes("single-shot")
        ? "single-shot"
        : focusModes.includes("continuous")
          ? "continuous"
          : "";

      if (focusMode && track.applyConstraints) {
        await track.applyConstraints({ advanced: [{ focusMode }] });
        setFocusMessage("Camera focused");
      } else {
        // iOS and some Android WebViews expose autofocus but not manual focus
        // constraints. Keeping the live rear-camera stream active lets the
        // device continue its native continuous autofocus.
        await videoRef.current?.play?.();
        setFocusMessage("Camera is focusing automatically");
      }
    } catch {
      setFocusMessage("Camera is focusing automatically");
    }

    focusMessageTimerRef.current = window.setTimeout(() => {
      setFocusMessage("");
    }, 2200);
  }, [cameraReady]);

  useEffect(() => {
    if (!active) return undefined;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onCancel?.();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(
        overlayRef.current?.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => cameraButtonRef.current?.focus());

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [active, onCancel]);

  useEffect(() => {
    if (!active) return undefined;

    let stopped = false;
    let stream = null;
    let frame = 0;

    setError("");
    setCameraReady(false);
    setFocusMessage("");

    const stop = () => {
      stopped = true;
      if (frame) window.cancelAnimationFrame(frame);
      for (const track of stream?.getTracks?.() || []) track.stop();
      if (streamRef.current === stream) streamRef.current = null;
      if (focusMessageTimerRef.current) {
        window.clearTimeout(focusMessageTimerRef.current);
        focusMessageTimerRef.current = null;
      }
    };

    const scanFrame = async () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video?.readyState >= 2 && canvas) {
        const sourceWidth = video.videoWidth || 0;
        const sourceHeight = video.videoHeight || 0;

        if (sourceWidth && sourceHeight) {
          const width = Math.min(720, sourceWidth);
          const height = Math.max(
            1,
            Math.round(sourceHeight * (width / sourceWidth))
          );
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", {
            willReadFrequently: true,
          });
          context?.drawImage(video, 0, 0, width, height);
          const pixels = context?.getImageData(0, 0, width, height);
          const result = pixels
            ? jsQR(pixels.data, width, height, {
                inversionAttempts: "attemptBoth",
              })
            : null;

          if (result?.data) {
            try {
              const invitation = await readAssessmentInvitation(result.data);
              if (stopped) return;
              stop();
              onScan?.(invitation.code, invitation.offer);
              return;
            } catch (scanError) {
              if (stopped) return;
              setError(scanError?.message || "Scan the assessment QR shown on the teacher device.");
            }
          }
        }
      }

      frame = window.requestAnimationFrame(scanFrame);
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
          },
        });
        if (stopped) {
          stop();
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
        frame = window.requestAnimationFrame(scanFrame);
      } catch {
        setError("Allow camera access to scan the assessment QR.");
      }
    })();

    return stop;
  }, [active, onScan]);

  if (!active) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="qr-scanner-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-title"
      aria-describedby="qr-scanner-instruction"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel?.();
      }}
    >
      <section className="qr-scanner-dialog">
        <header className="qr-scanner-header">
          <div>
            <h2 id="qr-scanner-title" className="qr-scanner-title">
              Scan Assessment Code
            </h2>
            <p id="qr-scanner-instruction" className="qr-scanner-instruction">
              Place the QR code inside the frame.
            </p>
          </div>
        </header>

        <button
          ref={cameraButtonRef}
          type="button"
          className="qr-scanner-camera"
          aria-label="Camera preview. Press to focus the camera."
          onClick={focusCamera}
        >
          <video
            ref={videoRef}
            className="qr-scanner-video"
            playsInline
            muted
            aria-hidden="true"
          />
          <span className="qr-scanner-frame" aria-hidden="true">
            <span className="qr-scanner-corner qr-scanner-corner-top-left" />
            <span className="qr-scanner-corner qr-scanner-corner-top-right" />
            <span className="qr-scanner-corner qr-scanner-corner-bottom-left" />
            <span className="qr-scanner-corner qr-scanner-corner-bottom-right" />
          </span>
          {!cameraReady && !error && (
            <span className="qr-scanner-starting">Starting camera...</span>
          )}
        </button>

        <canvas ref={canvasRef} hidden />

        <div className="qr-scanner-status" aria-live="polite">
          {error ? (
            <p className="qr-scanner-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="qr-scanner-focus-message">
              {focusMessage || "Hold steady while the code is scanned."}
            </p>
          )}
        </div>

        <div className="qr-scanner-actions">
          <button
            type="button"
            className="qr-scanner-focus"
            disabled={!cameraReady}
            onClick={focusCamera}
          >
            Focus Camera
          </button>
          <button
            type="button"
            className="qr-scanner-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </section>

      <style jsx global>{`
        .qr-scanner-overlay {
          position: fixed;
          inset: 0;
          z-index: 8000;
          display: grid;
          place-items: center;
          padding: max(16px, env(safe-area-inset-top))
            max(16px, env(safe-area-inset-right))
            max(16px, env(safe-area-inset-bottom))
            max(16px, env(safe-area-inset-left));
          overflow-y: auto;
          background: rgba(12, 30, 54, 0.76);
          backdrop-filter: blur(7px);
          animation: qrScannerFade 180ms ease-out;
        }

        .qr-scanner-dialog {
          width: min(100%, 520px);
          padding: clamp(16px, 3vw, 22px);
          border: 1px solid #c7d2e0;
          border-radius: 18px;
          background: #fffdf8;
          color: #1a2b4c;
          animation: qrScannerEnter 220ms ease-out;
        }

        .qr-scanner-header {
          display: flex;
          align-items: flex-start;
          margin-bottom: 14px;
        }

        .qr-scanner-title {
          margin: 0;
          color: #1a2b4c;
          font-family: Arial, Helvetica, sans-serif;
          font-size: clamp(18px, 4vw, 22px);
          font-weight: 900;
          line-height: 1.15;
        }

        .qr-scanner-instruction {
          margin: 5px 0 0;
          color: #56657a;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 12px;
          line-height: 1.45;
        }

        .qr-scanner-camera {
          position: relative;
          display: block;
          width: 100%;
          aspect-ratio: 4 / 3;
          min-height: 230px;
          max-height: min(58svh, 440px);
          padding: 0;
          overflow: hidden;
          border: 1px solid #718096;
          border-radius: 13px;
          background: #10213c;
          cursor: crosshair;
          -webkit-tap-highlight-color: transparent;
        }

        .qr-scanner-video {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .qr-scanner-frame {
          position: absolute;
          top: 50%;
          left: 50%;
          width: min(64%, 260px);
          aspect-ratio: 1;
          transform: translate(-50%, -50%);
          border: 1px solid rgba(255, 253, 248, 0.62);
          border-radius: 10px;
          box-shadow: 0 0 0 999px rgba(8, 22, 40, 0.32);
          pointer-events: none;
        }

        .qr-scanner-corner {
          position: absolute;
          width: 26px;
          height: 26px;
          border-color: #fffdf8;
          border-style: solid;
        }

        .qr-scanner-corner-top-left {
          top: -2px;
          left: -2px;
          border-width: 3px 0 0 3px;
          border-radius: 9px 0 0;
        }

        .qr-scanner-corner-top-right {
          top: -2px;
          right: -2px;
          border-width: 3px 3px 0 0;
          border-radius: 0 9px 0 0;
        }

        .qr-scanner-corner-bottom-left {
          bottom: -2px;
          left: -2px;
          border-width: 0 0 3px 3px;
          border-radius: 0 0 0 9px;
        }

        .qr-scanner-corner-bottom-right {
          right: -2px;
          bottom: -2px;
          border-width: 0 3px 3px 0;
          border-radius: 0 0 9px;
        }

        .qr-scanner-starting {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          color: #fffdf8;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 12px;
          font-weight: 800;
          pointer-events: none;
        }

        .qr-scanner-status {
          min-height: 37px;
          display: grid;
          align-items: center;
        }

        .qr-scanner-error,
        .qr-scanner-focus-message {
          margin: 9px 1px 0;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          line-height: 1.45;
        }

        .qr-scanner-error {
          color: #9b2e22;
        }

        .qr-scanner-focus-message {
          color: #56657a;
        }

        .qr-scanner-actions {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 0.72fr);
          gap: 9px;
          margin-top: 10px;
        }

        .qr-scanner-focus,
        .qr-scanner-cancel {
          min-height: 46px;
          border-radius: 9px;
          cursor: pointer;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          font-weight: 900;
          transition: transform 150ms ease, background 150ms ease,
            border-color 150ms ease, opacity 150ms ease;
          -webkit-tap-highlight-color: transparent;
        }

        .qr-scanner-focus {
          border: 1px solid #1a2b4c;
          background: #1a2b4c;
          color: #ffffff;
        }

        .qr-scanner-cancel {
          border: 1px solid #c7d2e0;
          background: #fffdf8;
          color: #1a2b4c;
        }

        .qr-scanner-cancel:hover {
          border-color: #8fa0b5;
          background: #f8f5ed;
        }

        .qr-scanner-focus:hover {
          background: #263b5f;
        }

        .qr-scanner-focus:active,
        .qr-scanner-cancel:active {
          transform: scale(0.985);
        }

        .qr-scanner-camera:focus-visible,
        .qr-scanner-focus:focus-visible,
        .qr-scanner-cancel:focus-visible {
          outline: 3px solid #8ba8c4;
          outline-offset: 3px;
        }

        .qr-scanner-focus:disabled {
          cursor: wait;
          opacity: 0.52;
        }

        @keyframes qrScannerFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes qrScannerEnter {
          from { opacity: 0; transform: scale(0.975); }
          to { opacity: 1; transform: scale(1); }
        }

        @media (max-width: 520px) {
          .qr-scanner-overlay {
            align-items: safe center;
            padding: 10px 10px max(10px, env(safe-area-inset-bottom));
          }

          .qr-scanner-dialog {
            padding: 15px;
            border-radius: 16px;
          }

          .qr-scanner-camera {
            min-height: 220px;
            max-height: 52svh;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .qr-scanner-overlay,
          .qr-scanner-dialog {
            animation: none;
          }

          .qr-scanner-focus,
          .qr-scanner-cancel {
            transition: none;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
