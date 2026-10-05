"use client";

import { resolvePairingValue } from "./assessmentPairingHub";

const PAIRING_PREFIX = "CRL1.";
/* Deflated payloads get their own prefix so both forms stay readable. */
const PAIRING_COMPRESSED_PREFIX = "CRL1z.";
const PAIRING_ZLIB_PREFIX = "CRL2z.";
const ICE_WAIT_MS = 8000;
const HEARTBEAT_MS = 1800;

// Cached bundle versions in one window must retain the same live teacher peer.
const peerStore = typeof window === "undefined" ? {} : (window.__crlAssessmentPeerStoreV1 ||= {});
const sessions = peerStore.sessions ||= new Map();
const messageListeners = peerStore.messageListeners ||= new Map();
const statusListeners = peerStore.statusListeners ||= new Map();
const lastTeacherStates = peerStore.lastTeacherStates ||= new Map();

function normalizeCode(code) {
  return String(code || "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

function utf8ToBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToUtf8(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/*
 * A session description is around a kilobyte of very repetitive text, and the
 * QR has to carry it plus base64 overhead. Deflating first cuts the payload by
 * roughly four fifths, which is the difference between a dense, noisy code and
 * one that reads as cleanly as the short assessment-code QR. Browsers without
 * the streams API simply keep using the uncompressed form, and the reader
 * accepts either.
 */
function pairingCompressionAvailable() {
  return (
    typeof CompressionStream === "function" &&
    typeof DecompressionStream === "function" &&
    typeof Blob === "function" &&
    typeof Response === "function"
  );
}

async function deflateToBase64Url(text, format = "deflate-raw") {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream(format));
  const buffer = await new Response(stream).arrayBuffer();
  return bytesToBase64Url(new Uint8Array(buffer));
}

async function inflateFromBase64Url(value, format = "deflate-raw") {
  const stream = new Blob([base64UrlToBytes(value)])
    .stream()
    .pipeThrough(new DecompressionStream(format));
  return await new Response(stream).text();
}

async function encodePairingPacket(packet) {
  const json = JSON.stringify(packet);
  if (pairingCompressionAvailable()) {
    try {
      return `${PAIRING_COMPRESSED_PREFIX}${await deflateToBase64Url(json)}`;
    } catch {
      // Some browsers support zlib deflate but not deflate-raw.
      try { return `${PAIRING_ZLIB_PREFIX}${await deflateToBase64Url(json, "deflate")}`; } catch {}
    }
  }
  return `${PAIRING_PREFIX}${utf8ToBase64Url(json)}`;
}

export async function readAssessmentPairingPacket(value, expectedCode = "", kind = "") {
  let text = await resolvePairingValue(value, expectedCode, kind);
  let invitationCode = "";
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      invitationCode = normalizeCode(url.searchParams.get("code"));
      text = new URLSearchParams(url.hash.slice(1)).get("pair") || "";
    } catch {
      throw new Error("The connection QR could not be read. Scan it again.");
    }
  }
  // Pasted or manually wrapped connection codes must retain case and punctuation.
  text = text.replace(/\s+/g, "");
  if (text.length > 24000) throw new Error("The connection code is too long.");

  let json;
  if (text.startsWith(PAIRING_ZLIB_PREFIX)) {
    try { json = await inflateFromBase64Url(text.slice(PAIRING_ZLIB_PREFIX.length), "deflate"); }
    catch { throw new Error("The pairing QR could not be read. Scan it again."); }
  } else if (text.startsWith(PAIRING_COMPRESSED_PREFIX)) {
    try {
      json = await inflateFromBase64Url(text.slice(PAIRING_COMPRESSED_PREFIX.length));
    } catch {
      throw new Error("The pairing code could not be read. Please scan it again.");
    }
  } else if (text.startsWith(PAIRING_PREFIX)) {
    try {
      json = base64UrlToUtf8(text.slice(PAIRING_PREFIX.length));
    } catch {
      throw new Error("The pairing code could not be read. Please scan it again.");
    }
  } else {
    throw new Error("This is not a CRL-App pairing code.");
  }

  let packet;
  if (json.length > 24000) throw new Error("The connection code is too long.");
  try {
    packet = JSON.parse(json);
  } catch {
    throw new Error("The pairing code could not be read. Please scan it again.");
  }

  if (
    packet?.v !== 1 ||
    !["o", "a"].includes(packet?.k) ||
    normalizeCode(packet?.c).length !== 6 ||
    typeof packet?.s !== "string" ||
    !packet.s.includes("v=0")
  ) {
    throw new Error("The pairing code is incomplete or invalid.");
  }

  const code = normalizeCode(packet.c);
  if (invitationCode && invitationCode !== code) {
    throw new Error("This connection code belongs to a different assessment.");
  }
  return { ...packet, c: code };
}

export function assessmentPairingInvitation(code, packet, origin) {
  return `${origin}/learner?code=${encodeURIComponent(normalizeCode(code))}#pair=${encodeURIComponent(packet)}`;
}

function defaultStatus(code) {
  return {
    code: normalizeCode(code),
    state: "idle",
    connected: false,
    role: null,
    latencyMs: null,
    remoteDeviceName: null,
    updatedAt: Date.now(),
    detail: "Local link is not paired",
  };
}

function fallbackDeviceName() {
  if (typeof navigator === "undefined") return "Learner device";
  const ua = String(navigator.userAgent || "");
  const platform = String(navigator.userAgentData?.platform || navigator.platform || "").trim();
  const androidModel = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|;|\))/i)?.[1]?.trim();
  if (androidModel) return androidModel;
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android device";
  if (platform) return platform;
  return "Learner device";
}

async function sendPeerHello(session) {
  const send = (deviceName) => sendRaw(session, {
    type: "peer_hello",
    code: session.code,
    role: session.role,
    deviceName: String(deviceName || fallbackDeviceName()).slice(0, 80),
  });

  send(fallbackDeviceName());
  try {
    const details = await navigator.userAgentData?.getHighEntropyValues?.(["model", "platform"]);
    const richerName = String(details?.model || details?.platform || "").trim();
    if (richerName && session?.channel?.readyState === "open") send(richerName);
  } catch {
    /* The fallback label already identifies the connected learner device. */
  }
}

export function getAssessmentPeerStatus(code) {
  const key = normalizeCode(code);
  return sessions.get(key)?.status || defaultStatus(key);
}

export function getAssessmentPairingCodes(code) {
  const session = sessions.get(normalizeCode(code));
  return {
    offer: session?.closing ? "" : session?.offerPacket || "",
    answer: session?.closing ? "" : session?.answerPacket || "",
  };
}

function emitStatus(code, patch) {
  const key = normalizeCode(code);
  const session = sessions.get(key);
  if (!session) return;
  session.status = {
    ...session.status,
    ...patch,
    code: key,
    updatedAt: Date.now(),
  };
  for (const listener of Array.from(statusListeners.get(key) || [])) {
    try { listener(session.status); } catch {}
  }
}

export function subscribeAssessmentPeerStatus(code, listener) {
  const key = normalizeCode(code);
  if (!key || typeof listener !== "function") return () => {};
  if (!statusListeners.has(key)) statusListeners.set(key, new Set());
  statusListeners.get(key).add(listener);
  listener(getAssessmentPeerStatus(key));
  return () => statusListeners.get(key)?.delete(listener);
}

export function subscribeAssessmentPeerMessages(code, listener) {
  const key = normalizeCode(code);
  if (!key || typeof listener !== "function") return () => {};
  if (!messageListeners.has(key)) messageListeners.set(key, new Set());
  messageListeners.get(key).add(listener);
  return () => messageListeners.get(key)?.delete(listener);
}

function dispatchMessage(code, message) {
  for (const listener of Array.from(messageListeners.get(normalizeCode(code)) || [])) {
    try { listener(message); } catch {}
  }
}

function stopHeartbeat(session) {
  if (session.heartbeatTimer) window.clearInterval(session.heartbeatTimer);
  session.heartbeatTimer = null;
  session.pendingPings.clear();
}

function closeSession(session, detail = "Local link disconnected") {
  if (!session || session.closing) return;
  session.closing = true;
  stopHeartbeat(session);
  try { session.channel?.close(); } catch {}
  try { session.peer?.close(); } catch {}
  session.channel = null;
  session.peer = null;
  if (sessions.get(session.code) === session) emitStatus(session.code, {
    state: "disconnected",
    connected: false,
    latencyMs: null,
    detail,
  });
}

function createSession(code, role) {
  const key = normalizeCode(code);
  if (typeof window === "undefined" || typeof RTCPeerConnection === "undefined") {
    throw new Error("Local device pairing is not supported by this browser.");
  }

  const current = sessions.get(key);
  if (current) closeSession(current, "Preparing a new local link");

  const session = {
    code: key,
    role,
    peer: new RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 0 }),
    channel: null,
    heartbeatTimer: null,
    heartbeatCount: 0,
    pendingPings: new Map(),
    closing: false,
    status: {
      ...defaultStatus(key),
      role,
      state: "pairing",
      detail: "Preparing local link",
    },
  };
  sessions.set(key, session);

  session.peer.addEventListener("connectionstatechange", () => {
    if (sessions.get(key) !== session || session.closing) return;
    const state = session.peer?.connectionState;
    if (state === "failed" || state === "closed") {
      closeSession(session, state === "failed" ? "Local link failed" : "Local link closed");
    } else if (state === "disconnected") {
      emitStatus(key, { state: "reconnecting", connected: false, detail: "Restoring local link" });
    } else if (state === "connecting") {
      emitStatus(key, { state: "connecting", connected: false, detail: "Connecting devices" });
    }
  });

  return session;
}

function sendRaw(session, message) {
  if (session?.channel?.readyState !== "open") return false;
  try {
    session.channel.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

function startHeartbeat(session) {
  stopHeartbeat(session);
  const ping = () => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    session.pendingPings.set(id, performance.now());
    sendRaw(session, { type: "peer_ping", id });
    session.heartbeatCount += 1;
    if (session.role === "learner" && session.heartbeatCount % 3 === 0) {
      sendRaw(session, {
        type: "assessment_control",
        version: Date.now(),
        source: "learner",
        action: "peer_joined",
        code: session.code,
      });
    }
    if (session.pendingPings.size > 6) {
      const oldest = session.pendingPings.keys().next().value;
      session.pendingPings.delete(oldest);
    }
  };
  ping();
  session.heartbeatTimer = window.setInterval(ping, HEARTBEAT_MS);
}

function attachDataChannel(session, channel) {
  if (sessions.get(session.code) !== session || session.closing) {
    try { channel.close(); } catch {}
    return;
  }
  session.channel = channel;
  channel.binaryType = "arraybuffer";
  channel.addEventListener("open", () => {
    if (sessions.get(session.code) !== session || session.closing) return;
    emitStatus(session.code, {
      state: "connected",
      connected: true,
      detail: "Direct local link active",
    });
    void sendPeerHello(session);
    if (session.role === "learner") {
      sendRaw(session, {
        type: "assessment_control",
        version: Date.now(),
        source: "learner",
        action: "peer_joined",
        code: session.code,
      });
    } else {
      const latest = lastTeacherStates.get(session.code);
      if (latest) sendRaw(session, latest);
    }
    startHeartbeat(session);
  });
  channel.addEventListener("close", () => closeSession(session));
  channel.addEventListener("error", () => {
    if (sessions.get(session.code) !== session || session.closing) return;
    emitStatus(session.code, { state: "reconnecting", connected: false, detail: "Restoring local link" });
  });
  channel.addEventListener("message", (event) => {
    if (sessions.get(session.code) !== session || session.closing) return;
    let message;
    try { message = JSON.parse(String(event.data || "")); } catch { return; }
    if (message?.type === "peer_ping") {
      sendRaw(session, { type: "peer_pong", id: message.id });
      return;
    }
    if (message?.type === "peer_pong") {
      const sentAt = session.pendingPings.get(message.id);
      if (Number.isFinite(sentAt)) {
        session.pendingPings.delete(message.id);
        emitStatus(session.code, { latencyMs: Math.max(0, Math.round(performance.now() - sentAt)) });
      }
      return;
    }
    if (message?.type === "peer_hello") {
      emitStatus(session.code, {
        remoteDeviceName: String(message?.deviceName || "Learner device").slice(0, 80),
      });
      return;
    }
    dispatchMessage(session.code, message);
  });
}

function waitForIceGathering(peer) {
  const hasCandidate = () => /(?:^|\r?\n)a=candidate:/.test(peer.localDescription?.sdp || "");
  if (peer.iceGatheringState === "complete") {
    return hasCandidate() ? Promise.resolve() : Promise.reject(new Error("No local network route found. Connect to Wi-Fi and allow local network access."));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      peer.removeEventListener("icegatheringstatechange", check);
      window.clearTimeout(timer);
      if (hasCandidate()) resolve();
      else reject(new Error("No local network route found. Connect to Wi-Fi and allow local network access."));
    };
    const check = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const timer = window.setTimeout(finish, ICE_WAIT_MS);
    peer.addEventListener("icegatheringstatechange", check);
  });
}

export async function startTeacherAssessmentPairing(code, { restart = false } = {}) {
  const key = normalizeCode(code);
  if (key.length !== 6) throw new Error("A valid assessment code is required.");
  const current = sessions.get(key);
  if (!restart && current?.role === "teacher" && !current.closing && current.offerPromise) {
    return current.offerPromise;
  }
  if (current?.status.connected) throw new Error("The learner is already connected.");
  const session = createSession(key, "teacher");
  session.pairingId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  session.offerPromise = (async () => {
    const channel = session.peer.createDataChannel("crl-assessment", { ordered: true });
    attachDataChannel(session, channel);
    const offer = await session.peer.createOffer();
    await session.peer.setLocalDescription(offer);
    await waitForIceGathering(session.peer);
    if (sessions.get(key) !== session || session.closing) throw new Error("This connection code has been replaced. Use the new code.");
    emitStatus(key, { state: "pairing", detail: "Waiting for learner QR scan or connection code" });
    const packet = await encodePairingPacket({ v: 1, k: "o", c: key, t: session.pairingId, s: session.peer.localDescription.sdp });
    if (sessions.get(key) !== session || session.closing) throw new Error("This connection code has been replaced. Use the new code.");
    session.offerPacket = packet;
    return packet;
  })().catch((error) => {
    if (sessions.get(key) === session) closeSession(session, "Local connection setup failed. Please retry.");
    throw error;
  });
  return session.offerPromise;
}

export async function acceptLearnerAssessmentOffer(value, expectedCode) {
  const packet = await readAssessmentPairingPacket(value, normalizeCode(expectedCode), "o");
  if (packet.k !== "o") throw new Error("Scan the teacher pairing code first.");
  const expected = normalizeCode(expectedCode);
  if (expected && packet.c !== expected) throw new Error("This connection code belongs to a different assessment.");
  const current = sessions.get(packet.c);
  if (current?.role === "learner" && !current.closing && current.offerSdp === packet.s && current.pairingId === packet.t && current.answerPromise) {
    return current.answerPromise;
  }
  if (current?.status.connected) throw new Error("This device is already connected to the assessment.");
  const session = createSession(packet.c, "learner");
  session.offerSdp = packet.s;
  session.pairingId = packet.t;
  session.answerPromise = (async () => {
    session.peer.addEventListener("datachannel", (event) => attachDataChannel(session, event.channel), { once: true });
    await session.peer.setRemoteDescription({ type: "offer", sdp: packet.s });
    const answer = await session.peer.createAnswer();
    await session.peer.setLocalDescription(answer);
    await waitForIceGathering(session.peer);
    if (sessions.get(packet.c) !== session || session.closing) throw new Error("This connection has been replaced. Use the latest teacher code.");
    emitStatus(packet.c, { state: "pairing", detail: "Waiting for teacher QR scan or response code" });
    const result = {
      code: packet.c,
      answer: await encodePairingPacket({ v: 1, k: "a", c: packet.c, t: packet.t, s: session.peer.localDescription.sdp }),
    };
    if (sessions.get(packet.c) !== session || session.closing) throw new Error("This connection has been replaced. Use the latest teacher code.");
    session.answerPacket = result.answer;
    return result;
  })().catch((error) => {
    if (sessions.get(packet.c) === session) closeSession(session, "Local connection setup failed. Please retry.");
    throw error;
  });
  return session.answerPromise;
}

export async function completeTeacherAssessmentPairing(code, value) {
  const key = normalizeCode(code);
  const packet = await readAssessmentPairingPacket(value, key, "a");
  if (packet.k !== "a") throw new Error("Scan the learner response code.");
  if (packet.c !== key) throw new Error("This response belongs to a different assessment.");
  const session = sessions.get(key);
  if (!session?.peer || session.role !== "teacher") {
    throw Object.assign(new Error("The teacher invitation expired. Use the new teacher QR to connect again."), { code: "PAIRING_EXPIRED" });
  }
  if (session.closing) throw Object.assign(new Error("The teacher invitation expired. Use a new teacher QR."), { code: "PAIRING_EXPIRED" });
  if (packet.t && packet.t !== session.pairingId) throw new Error("This response is for an older connection code. Use the latest teacher code.");
  if (session.remoteAnswerSdp === packet.s) return true;
  if (session.status.connected || session.answerAcceptancePromise) {
    if (session.pendingAnswerSdp === packet.s) return session.answerAcceptancePromise;
    throw new Error("A learner response has already been accepted.");
  }
  session.pendingAnswerSdp = packet.s;
  session.answerAcceptancePromise = session.peer.setRemoteDescription({ type: "answer", sdp: packet.s }).then(() => {
    if (sessions.get(key) !== session || session.closing) throw new Error("This connection code has been replaced. Use the new code.");
    session.remoteAnswerSdp = packet.s;
    if (!session.status.connected) emitStatus(key, { state: "connecting", connected: false, detail: "Connecting devices" });
    return true;
  }).catch((error) => {
    session.answerAcceptancePromise = null;
    session.pendingAnswerSdp = null;
    throw error;
  });
  await session.answerAcceptancePromise;
  return true;
}

export function publishAssessmentPeerState(code, sessionState) {
  const key = normalizeCode(code || sessionState?.code);
  if (!key || !sessionState) return false;
  const message = {
    type: "assessment_state",
    version: Date.now(),
    source: "teacher",
    session: sessionState,
  };
  lastTeacherStates.set(key, message);
  return sendRaw(sessions.get(key), message);
}

export function publishAssessmentPeerControl(code, payload) {
  const key = normalizeCode(code || payload?.code);
  if (!key) return false;
  return sendRaw(sessions.get(key), {
    type: "assessment_control",
    version: Date.now(),
    source: "learner",
    ...(payload || {}),
  });
}

export function disconnectAssessmentPeer(code) {
  const key = normalizeCode(code);
  const session = sessions.get(key);
  if (!session) return;
  closeSession(session, "Local link closed");
  sessions.delete(key);
}

export const __assessmentPeerTestUtils = {
  encodePairingPacket,
  normalizeCode,
};
