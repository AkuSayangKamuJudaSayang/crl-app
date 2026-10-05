"use client";

const HUB_KEY = "crl-pairing-hub-v1";
const codePattern = /^[A-Z0-9]{6}$/;

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

async function requestHub(hub, path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${normalizePairingHub(hub)}${path}`, { ...options, credentials: "omit", cache: "no-store", signal: controller.signal, targetAddressSpace: "local" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The offline hub could not complete this request.");
    return data;
  } catch (error) {
    if (error instanceof TypeError || error.name === "AbortError") throw new Error("Hub unavailable. Check its address, Wi-Fi and local network permission.");
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function checkPairingHub(value) {
  const hub = normalizePairingHub(value);
  if (!hub) throw new Error("Enter the hub address first.");
  const data = await requestHub(hub, "/health");
  if (data.service !== "crl-offline-pairing" || data.version !== 1) throw new Error("This is not a CRL offline hub.");
  return savePairingHub(hub);
}

export async function registerPairingCode(hub, assessment, kind, packet) {
  const data = await requestHub(hub, "/pairing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessment, kind, packet }) });
  if (!codePattern.test(data.code) || data.code === assessment || !Number.isFinite(data.expiresInMs) || data.expiresInMs <= 0 || data.expiresInMs > 900000) throw new Error("The hub returned an invalid connection code.");
  return data;
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
  if (typeof data.packet !== "string" || data.packet.length > 24000 || !/^CRL[12](?:z)?\./.test(data.packet)) throw new Error("The hub returned an invalid pairing packet.");
  savePairingHub(hub);
  return data.packet;
}

export function shortPairingInvitation(assessment, kind, code, hub, origin) {
  const url = new URL("/learner", origin);
  url.searchParams.set("code", assessment);
  url.hash = new URLSearchParams({ [kind === "o" ? "link" : "response"]: code, hub: normalizePairingHub(hub) }).toString();
  return url.href;
}
