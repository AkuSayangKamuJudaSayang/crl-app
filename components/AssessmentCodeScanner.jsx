"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "../lib/vendor/jsQR.js";

function normalizeCode(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

export function readAssessmentCodeQr(value) {
  const raw = String(value || "").trim();
  const direct = normalizeCode(raw);
  if (/^[A-Z0-9]{6}$/.test(direct)) return direct;

  try {
    const base =
      typeof window === "undefined"
        ? "https://crl-app.invalid"
        : window.location.origin;
    const url = new URL(raw, base);
    const code = normalizeCode(url.searchParams.get("code") || "");
    return /^[A-Z0-9]{6}$/.test(code) ? code : "";
  } catch {
    return "";
  }
}

export default function AssessmentCodeScanner({ active, onScan, onCancel }) {
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
            const code = readAssessmentCodeQr(result.data);
            if (code) {
              stop();
              onScan?.(code);
              return;
            }
            setError("Scan the assessment QR shown above the teacher's code.");
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
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        frame = window.requestAnimationFrame(scanFrame);
      } catch {
        setError("Allow camera access to scan the assessment QR.");
      }
    })();

    return stop;
  }, [active, onScan]);

  if (!active) return null;

  return (
    <div className="assessment-code-scanner" role="group" aria-label="Scan assessment QR code">
      <video
        ref={videoRef}
        className="assessment-code-scanner-video"
        playsInline
        muted
        aria-label="Camera preview for assessment QR code"
      />
      <canvas ref={canvasRef} hidden />
      {error && (
        <p className="assessment-code-scanner-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="assessment-code-scanner-cancel"
        onClick={onCancel}
      >
        Cancel scan
      </button>
    </div>
  );
}
