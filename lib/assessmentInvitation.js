"use client";

import { readAssessmentPairingPacket } from "./assessmentPeer";
import { resolvePairingValue } from "./assessmentPairingHub";

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
  if (/^CRL[12](?:z)?\./.test(raw)) offer = raw;
  else {
    try {
      const url = new URL(raw);
      offer = new URLSearchParams(url.hash.slice(1)).get("pair") || "";
      const hash = new URLSearchParams(url.hash.slice(1));
      if (hash.has("link") || hash.has("response")) offer = raw;
    } catch {}
  }
  if (offer) {
    const resolved = await resolvePairingValue(raw);
    const packet = await readAssessmentPairingPacket(resolved);
    const invitationCode = readAssessmentCodeQr(raw);
    if (invitationCode && invitationCode !== packet.c) throw new Error("This connection code belongs to a different assessment.");
    if (packet.k !== "o") throw new Error("Use the teacher connection QR, not the learner response.");
    return { code: packet.c, offer: offer === raw ? resolved : offer };
  }
  const code = readAssessmentCodeQr(raw);
  if (!code) throw new Error("Scan the assessment QR or teacher connection QR.");
  return { code, offer: "" };
}
