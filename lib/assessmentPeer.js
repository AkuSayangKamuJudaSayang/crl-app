"use client";

const PAIRING_PREFIX = "CRL1.";
/* Deflated payloads get their own prefix so both forms stay readable. */
const PAIRING_COMPRESSED_PREFIX = "CRL1z.";
const ICE_WAIT_MS = 2400;
const HEARTBEAT_MS = 1800;

const sessions = new Map();
const messageListeners = new Map();
const statusListeners = new Map();
const lastTeacherStates = new Map();

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

async function deflateToBase64Url(text) {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();
  return bytesToBase64Url(new Uint8Array(buffer));
}

async function inflateFromBase64Url(value) {
  const stream = new Blob([base64UrlToBytes(value)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}

async function encodePairingPacket(packet) {
  const json = JSON.stringify(packet);
  if (pairingCompressionAvailable()) {
    try {
      return `${PAIRING_COMPRESSED_PREFIX}${await deflateToBase64Url(json)}`;
    } catch {
      /* Fall through to the plain form. */
    }
  }
  return `${PAIRING_PREFIX}${utf8ToBase64Url(json)}`;
}

export async function readAssessmentPairingPacket(value) {
  const text = String(value || "").trim();

  let json;
  if (text.startsWith(PAIRING_COMPRESSED_PREFIX)) {
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

  return { ...packet, c: normalizeCode(packet.c) };
}

function defaultStatus(code) {
  return {
    code: normalizeCode(code),
    state: "idle",
    connected: false,
    role: null,
    latencyMs: null,
    updatedAt: Date.now(),
    detail: "Local link is not paired",
  };
}

export function getAssessmentPeerStatus(code) {
  const key = normalizeCode(code);
  return sessions.get(key)?.status || defaultStatus(key);
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
  emitStatus(session.code, {
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
  session.channel = channel;
  channel.binaryType = "arraybuffer";
  channel.addEventListener("open", () => {
    emitStatus(session.code, {
      state: "connected",
      connected: true,
      detail: "Direct local link active",
    });
    sendRaw(session, { type: "peer_hello", code: session.code, role: session.role });
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
    emitStatus(session.code, { state: "reconnecting", connected: false, detail: "Restoring local link" });
  });
  channel.addEventListener("message", (event) => {
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
    if (message?.type === "peer_hello") return;
    dispatchMessage(session.code, message);
  });
}

function waitForIceGathering(peer) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      peer.removeEventListener("icegatheringstatechange", check);
      window.clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const timer = window.setTimeout(finish, ICE_WAIT_MS);
    peer.addEventListener("icegatheringstatechange", check);
  });
}

export async function startTeacherAssessmentPairing(code) {
  const key = normalizeCode(code);
  if (key.length !== 6) throw new Error("A valid assessment code is required.");
  const session = createSession(key, "teacher");
  const channel = session.peer.createDataChannel("crl-assessment", { ordered: true });
  attachDataChannel(session, channel);
  const offer = await session.peer.createOffer();
  await session.peer.setLocalDescription(offer);
  await waitForIceGathering(session.peer);
  emitStatus(key, { state: "pairing", detail: "Waiting for learner scan" });
  return encodePairingPacket({ v: 1, k: "o", c: key, s: session.peer.localDescription.sdp });
}

export async function acceptLearnerAssessmentOffer(value) {
  const packet = await readAssessmentPairingPacket(value);
  if (packet.k !== "o") throw new Error("Scan the teacher pairing code first.");
  const session = createSession(packet.c, "learner");
  session.peer.addEventListener("datachannel", (event) => attachDataChannel(session, event.channel), { once: true });
  await session.peer.setRemoteDescription({ type: "offer", sdp: packet.s });
  const answer = await session.peer.createAnswer();
  await session.peer.setLocalDescription(answer);
  await waitForIceGathering(session.peer);
  emitStatus(packet.c, { state: "pairing", detail: "Waiting for teacher scan" });
  return {
    code: packet.c,
    answer: encodePairingPacket({ v: 1, k: "a", c: packet.c, s: session.peer.localDescription.sdp }),
  };
}

export async function completeTeacherAssessmentPairing(code, value) {
  const key = normalizeCode(code);
  const packet = await readAssessmentPairingPacket(value);
  if (packet.k !== "a") throw new Error("Scan the learner response code.");
  if (packet.c !== key) throw new Error("This response belongs to a different assessment.");
  const session = sessions.get(key);
  if (!session?.peer || session.role !== "teacher") {
    throw new Error("Start local pairing before scanning the learner response.");
  }
  await session.peer.setRemoteDescription({ type: "answer", sdp: packet.s });
  emitStatus(key, { state: "connecting", connected: false, detail: "Connecting devices" });
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
