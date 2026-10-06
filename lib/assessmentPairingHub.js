"use client";

import { isPairingPacketText, legacyPairingPacket } from "./assessmentPairingCodec";

const HUB_KEY = "crl-pairing-hub-v1";
const codePattern = /^[A-Z0-9]{6}$/;
const hubClient = typeof window === "undefined" ? {} : (window.__crlPairingHubClientV2 ||= {});
const offerReferences = hubClient.offerReferences ||= new Map();

export function normalizePairingHub(value) {
  if (!String(value || "").trim()) return "";
  const url = new URL(String(value).trim());
  const host = url.hostname.toLowerCase();
  const octets = host.split(".");
  const ipv4 = octets.length === 4 && octets.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  const [a, b] = octets.map(Number);
  const privateHost = host === "localhost" || host.endsWith(".local") || (ipv4 && (a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31))) || /^\[(?:f[cd][0-9a-f]{2}:|fe80:)/.test(host);
  if (!privateHost || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) throw new Error("Enter the local hub address shown on its computer.");
  return url.origin;
}

export function getPairingHub() {
  try { return normalizePairingHub(window.localStorage.getItem(HUB_KEY)); } catch { return ""; }
}
export function savePairingHub(value) {
  const hub = normalizePairingHub(value);
  try { if (hub) window.localStorage.setItem(HUB_KEY, hub); else window.localStorage.removeItem(HUB_KEY); } catch {}
  if (typeof window !== "undefined") window.dispatchEvent?.(new CustomEvent("crl-pairing-hub-change", { detail: hub }));
  return hub;
}

async function requestHub(hub, path, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${normalizePairingHub(hub)}${path}`, { ...options, credentials: "omit", cache: "no-store", signal: controller.signal, targetAddressSpace: "local" });
    const data = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error(data.error || "The offline hub could not complete this request."), { status: response.status });
    }
    return data;
  } catch (error) {
    if (error instanceof TypeError || error.name === "AbortError") throw new Error("Hub unavailable. Check its address, Wi-Fi and local network permission.");
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function checkPairingHub(value, timeoutMs = 6000) {
  const hub = normalizePairingHub(value);
  if (!hub) throw new Error("Enter the hub address first.");
  const data = await requestHub(hub, "/health", {}, timeoutMs);
  if (data.service !== "crl-offline-pairing" || data.version !== 1) throw new Error("This is not a CRL offline hub.");
  // A localhost probe must produce a LAN address that phones can also use.
  const localHost = new URL(hub).hostname;
  const address = data.publicAddress && (localHost === "localhost" || /^127\./.test(localHost)) ? normalizePairingHub(data.publicAddress) : hub;
  return savePairingHub(address);
}

export async function discoverPairingHub() {
  if (hubClient.discovery) return hubClient.discovery;
  hubClient.discovery = (async () => {
    const saved = getPairingHub();
    const candidates = [saved, "https://crl-offline.local:8787", "http://crl-offline.local:8787"];
    // Only the host computer needs the loopback fallback. It is not a LAN scan.
    if (typeof navigator !== "undefined" && !/Android|iPhone|iPad|iPod|Harmony|Mobile/i.test(navigator.userAgent || "") && !(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) candidates.push("https://127.0.0.1:8787");
    let lastError;
    for (const address of [...new Set(candidates.filter(Boolean))]) {
      try { return await checkPairingHub(address, 2000); }
      catch (error) { lastError = error; }
    }
    throw new Error("Offline hub unavailable. Check Wi-Fi or complete setup.", { cause: lastError });
  })();
  try { return await hubClient.discovery; } finally { hubClient.discovery = null; }
}

export async function registerPairingCode(hub, assessment, kind, packet) {
  const reference = offerReferences.get(assessment);
  const replyTo = kind === "a" && reference?.hub === hub ? reference.token : "";
  const publish = (value) => requestHub(hub, "/pairing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessment, kind, packet: value, replyTo }) });
  let data;
  try {
    data = await publish(packet);
  } catch (error) {
    /*
     * A hub installed before the compact code existed refuses it. The same
     * session in the older form is understood by every hub, old or new.
     */
    const legacy = error?.status === 400 ? legacyPairingPacket(packet) : "";
    if (!legacy) throw error;
    data = await publish(legacy);
  }
  if (!codePattern.test(data.code) || data.code === assessment || !Number.isFinite(data.expiresInMs) || data.expiresInMs <= 0 || data.expiresInMs > 900000) throw new Error("The hub returned an invalid connection code.");
  return data;
}

export async function getHubAssessmentOffer(hub, assessment) {
  if (!codePattern.test(assessment)) throw new Error("Enter the assessment code first.");
  const data = await requestHub(hub, `/assessment/${assessment}/offer`);
  if (!codePattern.test(data.code) || !isPairingPacket(data.packet)) throw new Error("Invalid teacher invitation.");
  offerReferences.set(assessment, { hub, token: data.code, packet: data.packet });
  return data.packet;
}

export async function getHubLearnerResponse(hub, assessment, token) {
  if (!codePattern.test(assessment) || !codePattern.test(token)) throw new Error("Invalid connection code.");
  const data = await requestHub(hub, `/pairing/${token}/response?assessment=${assessment}`);
  if (data.packet && !isPairingPacket(data.packet)) throw new Error("Invalid learner response.");
  return data.packet || "";
}

function isPairingPacket(value) {
  return isPairingPacketText(value);
}

export async function resolvePairingValue(value, expectedCode = "", kind = "") {
  let raw = String(value || "").trim();
  let hub = getPairingHub();
  let assessment = expectedCode;
  let token = "";
  let packetKind = kind;
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    const hash = new URLSearchParams(url.hash.slice(1));
    if (hash.has("link") || hash.has("response")) {
      hub = normalizePairingHub(hash.get("hub"));
      assessment = url.searchParams.get("code") || "";
      packetKind = hash.has("link") ? "o" : "a";
      token = hash.get("link") || hash.get("response") || "";
      if (expectedCode && assessment !== expectedCode) throw new Error("This code belongs to a different assessment.");
      if (kind && kind !== packetKind) throw new Error("Use the matching teacher or learner response QR.");
    }
  } else if (codePattern.test(raw.toUpperCase())) token = raw.toUpperCase();
  if (!token) return raw;
  if (!hub) throw new Error("Set the offline hub address to use a 6-character connection code.");
  if (!codePattern.test(token) || !codePattern.test(assessment) || !["o", "a"].includes(packetKind)) throw new Error("The connection code is incomplete.");
  const data = await requestHub(hub, `/pairing/${token}?assessment=${assessment}&kind=${packetKind}`);
  if (!isPairingPacket(data.packet)) throw new Error("The hub returned an invalid pairing packet.");
  if (packetKind === "o") offerReferences.set(assessment, { hub, token, packet: data.packet });
  savePairingHub(hub);
  return data.packet;
}

export function shortPairingInvitation(assessment, kind, code, hub, origin) {
  const url = new URL("/learner", origin);
  url.searchParams.set("code", assessment);
  url.hash = new URLSearchParams({ [kind === "o" ? "link" : "response"]: code, hub: normalizePairingHub(hub) }).toString();
  return url.href;
}
