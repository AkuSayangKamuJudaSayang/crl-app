"use client";

import { readAssessmentPairingPacket } from "./assessmentPeer";

export function readAssessmentCodeQr(value) {
  const raw = String(value || "").trim();
  const direct = raw.replace(/\s+/g, "").toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(direct)) return direct;
  try {
    const base = typeof window === "undefined" ? "https://crl-app.invalid" : window.location.origin;
    const url = new URL(raw, base);
    const code = String(url.searchParams.get("code") || "").trim().toUpperCase();
    return /^[A-Z0-9]{6}$/.test(code) ? code : "";
  } catch {
    return "";
  }
}

// A single offline invitation carries both the session identity and peer offer.
export async function readAssessmentInvitation(value) {
  const raw = String(value || "").trim();
  let offer = "";
  if (/^CRL1(?:z)?\./.test(raw)) offer = raw;
  else {
    try {
      const url = new URL(raw);
      offer = new URLSearchParams(url.hash.slice(1)).get("pair") || "";
    } catch {}
  }
  if (offer) {
    const packet = await readAssessmentPairingPacket(raw);
    if (packet.k !== "o") throw new Error("Use the teacher connection QR, not the learner response.");
    return { code: packet.c, offer };
  }
  const code = readAssessmentCodeQr(raw);
  if (!code) throw new Error("Scan the assessment QR or teacher connection QR.");
  return { code, offer: "" };
}
