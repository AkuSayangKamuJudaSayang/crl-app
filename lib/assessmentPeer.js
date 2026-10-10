"use client";

import { resolvePairingValue } from "./assessmentPairingHub";
import { decodeCompactPairingCode, encodeCompactPairingCode, isCompactPairingCode, rememberLegacyPacket } from "./assessmentPairingCodec";
import { Inflate as PairingInflate } from "pako/lib/inflate.js";

const PAIRING_PREFIX = "CRL1.";
/* Deflated payloads get their own prefix so both forms stay readable. */
const PAIRING_COMPRESSED_PREFIX = "CRL1z.";
const PAIRING_ZLIB_PREFIX = "CRL2z.";
// Zlib-compressed compact bytes, with the invitation id still readable by hubs.
const PAIRING_COMPACT_ZLIB_PREFIX = "CRL3z.";
const ICE_WAIT_MS = 8000;
const HEARTBEAT_MS = 1800;

// Cached bundle versions in one window must retain the same live teacher peer.
const peerStore = typeof window === "undefined" ? {} : (window.__crlAssessmentPeerStoreV1 ||= {});
const sessions = peerStore.sessions ||= new Map();
const roleGenerations = peerStore.roleGenerations ||= { teacher: 0, learner: 0 };
const messageListeners = peerStore.messageListeners ||= new Map();
const statusListeners = peerStore.statusListeners ||= new Map();
const lastTeacherStates = peerStore.lastTeacherStates ||= new Map();
const linkListeners = peerStore.linkListeners ||= new Set();
/*
 * Assessments whose packets have arrived over a direct link. This is a property
 * of the run, not of the link's momentary state: a connection that reports
 * itself reconnecting for a moment must not hand the run back to a slower
 * transport that is still describing an earlier item.
 */
const peerDeliveredCodes = peerStore.peerDeliveredCodes ||= new Set();

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
 * roughly four fifths, and describing the lines as fields instead of prose
 * (see assessmentPairingCodec) takes another half off that. Browsers without
 * the streams API simply keep using the uncompressed form, and the reader
 * accepts every form the app has ever sent.
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

async function expandCompactPairingCode(text) {
  const split = text.indexOf(".", PAIRING_COMPACT_ZLIB_PREFIX.length);
  const token = text.slice(PAIRING_COMPACT_ZLIB_PREFIX.length, split);
  if (split < 0 || !/^[NTL]_[A-Za-z0-9_-]{1,64}$/.test(token)) throw new Error("The pairing code is incomplete or invalid.");
  const pairingId = `${token[0] === "L" ? "device_learner_" : token[0] === "T" ? "device_" : ""}${token.slice(2)}`;
  if (pairingId.length > 64) throw new Error("The pairing code is incomplete or invalid.");
  // Decode on devices that predate browser compression streams as well. Bound
  // output while inflating, before a corrupt packet can allocate a large body.
  const decoder = new PairingInflate({ chunkSize: 4096, windowBits: 15 });
  const chunks = [];
  let size = 0;
  decoder.onData = value => {
    size += value.length;
    if (size > 24000) throw new Error("The connection code is too long.");
    chunks.push(value);
  };
  decoder.push(base64UrlToBytes(text.slice(split + 1)), true);
  if (decoder.err || !decoder.ended) throw new Error("The pairing code is incomplete or invalid.");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return `CRL3.${pairingId}.${bytesToBase64Url(bytes)}`;
}

async function encodePairingPacket(packet) {
  const legacy = await encodeLegacyPairingPacket(packet);
  /*
   * The compact form is only taken when it is genuinely shorter and the codec
   * has proved it reproduces the description exactly, so a code can never grow
   * or carry a value the browser did not produce.
   */
  let compact = encodeCompactPairingCode(packet);
  if (compact && pairingCompressionAvailable()) {
    try {
      const split = compact.indexOf(".", "CRL3.".length);
      const id = packet.t;
      const token = id.startsWith("device_learner_") ? `L_${id.slice(14)}` : id.startsWith("device_") ? `T_${id.slice(7)}` : `N_${id}`;
      const compressed = `${PAIRING_COMPACT_ZLIB_PREFIX}${token}.${await deflateToBase64Url(base64UrlToBytes(compact.slice(split + 1)), "deflate")}`;
      // Prove the same exact SDP and metadata survive before shortening either
      // device's displayed code. Browsers without streams retain plain CRL3.
      if (compressed.length < compact.length && await expandCompactPairingCode(compressed) === compact) compact = compressed;
    } catch {
      // The synchronous lossless compact form remains usable on older devices.
    }
  }
  if (compact && compact.length < legacy.length) return rememberLegacyPacket(compact, legacy);
  return legacy;
}

async function encodeLegacyPairingPacket(packet) {
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

  if (text.startsWith(PAIRING_COMPACT_ZLIB_PREFIX)) {
    try { text = await expandCompactPairingCode(text); }
    catch { throw new Error("The pairing code could not be read. Scan or enter it again."); }
  }

  if (isCompactPairingCode(text)) {
    const compact = decodeCompactPairingCode(text);
    if (invitationCode && invitationCode !== compact.c) {
      throw new Error("This connection code belongs to a different assessment.");
    }
    return { ...compact, c: compact.c };
  }

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

/*
 * The pairing id only has to be unique among the sessions running in one
 * classroom, and it rides in every code, so it is a short random string rather
 * than a full UUID. It stays dot-free: the hub and the compact code both read
 * it as the part before the first dot.
 */
export function createPairingId() {
  try {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  } catch {
    return `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
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

// A setup identifier is never sent to host_start and owns no learner record.
export function getTeacherDevicePairingCode(role = "teacher") {
  const linked = findLinkedAssessmentPeerSession(role);
  if (linked) return linked.code;
  for (const [code, session] of sessions) {
    if (session.role === role && session.deviceOnly && !session.closing) return code;
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    code = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
  } while (sessions.has(code));
  return code;
}

function notifyStatusListeners(code, status) {
  for (const listener of Array.from(statusListeners.get(code) || [])) {
    try { listener(status); } catch {}
  }
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
  notifyStatusListeners(key, session.status);
}

export function subscribeAssessmentPeerStatus(code, listener) {
  const key = normalizeCode(code);
  if (!key || typeof listener !== "function") return () => {};
  if (!statusListeners.has(key)) statusListeners.set(key, new Set());
  statusListeners.get(key).add(listener);
  listener(getAssessmentPeerStatus(key));
  return () => statusListeners.get(key)?.delete(listener);
}

/*
 * The link between the two devices is not tied to one assessment.
 *
 * A session is created for an assessment code and then belongs to that code,
 * which is why a new assessment used to mean a new QR scan or a new code to
 * copy. The connection itself does not care: it carries tagged messages, and
 * every one of them already names the assessment it belongs to. So when the
 * teacher starts the next assessment on a device that is still linked, the two
 * ends simply agree to call the same open channel by the new code.
 *
 * Nothing here invents a link. A claim is only made over a channel that is
 * open right now, it has to be answered by the other device before anything
 * moves. An unanswered readiness check leaves both ends unchanged; an
 * unconfirmed move closes the link so mismatched runs cannot keep talking.
 */
export function subscribeAssessmentLink(listener) {
  if (typeof listener !== "function") return () => {};
  linkListeners.add(listener);
  return () => linkListeners.delete(listener);
}

function notifyLinkListeners(event) {
  for (const listener of Array.from(linkListeners)) {
    try { listener(event); } catch {}
  }
}

export function findLinkedAssessmentPeerSession(role = "") {
  for (const [code, session] of sessions) {
    if (session.closing || !session.status.connected) continue;
    if (session.channel?.readyState !== "open") continue;
    if (role && session.role !== role) continue;
    return { code, role: session.role, deviceOnly: Boolean(session.deviceOnly), deviceName: session.status.remoteDeviceName || "" };
  }
  return null;
}

// A six-character assessment code is valid on a paired learner only after the
// teacher has confirmed that run. Device invitations and other learners do not match.
export function getLinkedLearnerAssessment(code) {
  const key = normalizeCode(code);
  const linked = findLinkedAssessmentPeerSession("learner");
  if (!linked || linked.deviceOnly || linked.code !== key) return null;
  return { code: key, session: sessions.get(key)?.lastReceivedState?.session || null };
}

/* Moves a live link to the next assessment code without renegotiating it. */
export function rekeyAssessmentPeerSession(fromCode, toCode) {
  const from = normalizeCode(fromCode);
  const to = normalizeCode(toCode);
  if (!from || from === to || !/^[A-Z0-9]{6}$/.test(to)) return false;
  const session = sessions.get(from);
  if (!session || session.closing || sessions.has(to)) return false;
  sessions.delete(from);
  sessions.set(to, session);
  session.code = to;
  session.deviceOnly = false;
  session.lastReceivedState = null;
  session.receivedStateSequence = 0;
  session.status = { ...session.status, code: to, deviceOnly: false };
  lastTeacherStates.delete(from);
  lastTeacherStates.delete(to);
  peerDeliveredCodes.delete(to);
  notifyStatusListeners(from, {
    ...defaultStatus(from),
    role: session.role,
    state: "disconnected",
    connected: false,
    detail: "This link moved to the next assessment",
  });
  emitStatus(to, {
    ...session.status,
    code: to,
    state: "connected",
    connected: true,
    detail: "Direct local link active",
  });
  notifyLinkListeners({ type: "link_rekey", from, code: to, role: session.role });
  return true;
}

/*
 * Teacher side: ask the linked learner device whether it is still there, then
 * move this link to the new assessment code and tell it to follow.
 *
 * The order matters. The learner only moves once this device has moved, so a
 * readiness check that cannot be completed leaves both devices unchanged.
 * After moving, the learner must confirm the new code or the link is closed.
 */
export async function claimAssessmentPeerLink(code, { timeoutMs = 2500 } = {}) {
  const to = normalizeCode(code);
  if (!/^[A-Z0-9]{6}$/.test(to)) return false;
  const linked = findLinkedAssessmentPeerSession("teacher");
  if (!linked || linked.code === to) return false;
  const session = sessions.get(linked.code);
  if (!session) return false;
  if (session.linkClaim) return session.linkClaim.code === to ? session.linkClaim.promise : false;
  const claim = { code: to, from: linked.code, id: createPairingId() };
  session.linkClaim = claim;
  claim.promise = (async () => {
    let timer;
    const wait = promise => Promise.race([promise, new Promise(resolve => {
      timer = window.setTimeout(() => resolve(false), timeoutMs);
    })]).finally(() => window.clearTimeout(timer));
    try {
      const answered = new Promise(resolve => { claim.resolve = resolve; });
      if (!sendRaw(session, { type: "link_claim", from: claim.from, code: to, id: claim.id })) return false;
      const ready = await wait(answered);
      if (!ready || session.closing) return false;
      const target = sessions.get(to);
      if (target) {
        if (!target.closing && target.status.connected && target.channel?.readyState === "open") return false;
        if (!target.closing) closeSession(target, "Preparing a new local link");
        sessions.delete(to);
      }
      const moved = new Promise(resolve => { claim.resolveMoved = resolve; });
      if (!rekeyAssessmentPeerSession(claim.from, to)) return false;
      const sent = sendRaw(sessions.get(to), { type: "link_move", from: claim.from, code: to, id: claim.id });
      const confirmed = sent && await wait(moved);
      if (!confirmed) closeSession(session, "Device handoff was interrupted. Reconnect in Offline Mode Settings.");
      return Boolean(confirmed);
    } finally {
      if (session.linkClaim === claim) session.linkClaim = null;
    }
  })();
  return claim.promise;
}

export function subscribeAssessmentPeerMessages(code, listener) {
  const key = normalizeCode(code);
  if (!key || typeof listener !== "function") return () => {};
  if (!messageListeners.has(key)) messageListeners.set(key, new Set());
  messageListeners.get(key).add(listener);
  const session = sessions.get(key);
  if (session?.role === "learner" && !session.closing && session.lastReceivedState) {
    try { listener(session.lastReceivedState); } catch {}
  }
  return () => messageListeners.get(key)?.delete(listener);
}

function dispatchMessage(code, message) {
  const key = normalizeCode(code);
  /* This run is being carried by the direct link from here on. */
  if (key) peerDeliveredCodes.add(key);
  for (const listener of Array.from(messageListeners.get(key) || [])) {
    try { listener(message); } catch {}
  }
}

export function hasAssessmentPeerDelivered(code) {
  const key = normalizeCode(code);
  return Boolean(key) && peerDeliveredCodes.has(key);
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
  /*
   * A code can be run more than once - a teacher resumes an unfinished
   * assessment, or corrects a learner and starts again. The state cached for
   * that code belongs to the run that ended, and replaying it on the next
   * channel would drop the learner onto an item the teacher has not reached.
   */
  lastTeacherStates.delete(key);

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
    if (sessions.get(session.code) !== session || session.closing) return;
    const state = session.peer?.connectionState;
    if (state === "failed" || state === "closed") {
      closeSession(session, state === "failed" ? "Local link failed" : "Local link closed");
    } else if (state === "disconnected") {
      emitStatus(session.code, { state: "reconnecting", connected: false, detail: "Restoring local link" });
    } else if (state === "connecting") {
      emitStatus(session.code, { state: "connecting", connected: false, detail: "Connecting devices" });
    } else if (state === "connected" && session.channel?.readyState === "open") {
      emitStatus(session.code, { state: "connected", connected: true, detail: "Direct local link active" });
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
    if (session.role === "learner" && !session.deviceOnly && session.heartbeatCount % 3 === 0) {
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
    if (session.role === "learner" && !session.deviceOnly) {
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
    if (message?.type === "link_claim") {
      if (session.role !== "learner") return;
      const to = normalizeCode(message.code);
      const target = sessions.get(to);
      const accepted = /^[A-Z0-9]{6}$/.test(to) && message.from === session.code &&
        typeof message.id === "string" && message.id.length <= 64 &&
        (!target || target.closing || !target.status.connected);
      if (accepted) session.incomingClaim = { from: session.code, code: to, id: message.id, expiresAt: Date.now() + 10000 };
      sendRaw(session, { type: "link_ready", from: message.from, code: to, id: message.id, accepted });
      return;
    }
    if (message?.type === "link_ready") {
      const claim = session.linkClaim;
      if (session.role === "teacher" && claim?.id === message.id && claim.from === message.from && claim.code === normalizeCode(message.code)) claim.resolve(Boolean(message.accepted));
      return;
    }
    if (message?.type === "link_move") {
      if (session.role !== "learner") return;
      const claim = session.incomingClaim;
      if (!claim || claim.expiresAt < Date.now() || claim.id !== message.id || claim.from !== message.from || claim.code !== normalizeCode(message.code)) return;
      session.incomingClaim = null;
      const target = sessions.get(claim.code);
      if (target && (target.closing || !target.status.connected)) {
        if (!target.closing) closeSession(target, "Preparing a new local link");
        sessions.delete(claim.code);
      }
      const moved = rekeyAssessmentPeerSession(session.code, claim.code);
      sendRaw(session, { type: "link_moved", from: claim.from, code: claim.code, id: claim.id, moved });
      return;
    }
    if (message?.type === "link_moved") {
      const claim = session.linkClaim;
      if (session.role === "teacher" && claim?.id === message.id && claim.from === message.from && claim.code === normalizeCode(message.code)) claim.resolveMoved?.(Boolean(message.moved));
      return;
    }
    // Late packets from an earlier learner must never enter the new run.
    const messageCode = normalizeCode(message?.session?.code || message?.code);
    if (messageCode !== session.code || session.deviceOnly) return;
    if (message.type === "assessment_state" && (session.role !== "learner" || message.source !== "teacher")) return;
    if (message.type === "assessment_control" && (session.role !== "teacher" || message.source !== "learner")) return;
    if (message.type === "assessment_state") {
      const sequence = Number(message.sequence);
      if (Number.isSafeInteger(sequence) && sequence > 0) {
        if (sequence <= (session.receivedStateSequence || 0)) return;
        session.receivedStateSequence = sequence;
      }
      session.lastReceivedState = message;
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

export async function startTeacherAssessmentPairing(code, { restart = false, deviceOnly = false, role = "teacher" } = {}) {
  if (!["teacher", "learner"].includes(role) || (role === "learner" && !deviceOnly)) throw new Error("Invalid device pairing role.");
  const key = normalizeCode(code);
  if (key.length !== 6) throw new Error("A valid assessment code is required.");
  const current = sessions.get(key);
  if (!restart && current?.role === role && !current.closing && current.offerPromise) {
    return current.offerPromise;
  }
  if (current?.status.connected) throw new Error("The learner is already connected.");
  const session = createSession(key, role);
  session.deviceOnly = deviceOnly;
  session.status.deviceOnly = deviceOnly;
  session.pairingId = `${deviceOnly ? role === "learner" ? "device_learner_" : "device_" : ""}${createPairingId()}`;
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

export async function startLearnerDevicePairing(code, options = {}) {
  return startTeacherAssessmentPairing(code, { ...options, role: "learner", deviceOnly: true });
}

export async function acceptLearnerAssessmentOffer(value, expectedCode, { role = "learner" } = {}) {
  const generation = roleGenerations[role];
  const packet = await readAssessmentPairingPacket(value, normalizeCode(expectedCode), "o");
  if (roleGenerations[role] !== generation) throw new Error("Device pairing was closed.");
  if (packet.k !== "o") throw new Error("Scan the connection invitation first.");
  const learnerOffer = String(packet.t || "").startsWith("device_learner_");
  if ((role === "teacher") !== learnerOffer) throw new Error("This invitation belongs to the same device role.");
  const linked = findLinkedAssessmentPeerSession(role);
  if (String(packet.t || "").startsWith("device_") && linked && linked.code !== packet.c) throw new Error("Disconnect the current device before pairing another.");
  const expected = normalizeCode(expectedCode);
  if (expected && packet.c !== expected) throw new Error("This connection code belongs to a different assessment.");
  const current = sessions.get(packet.c);
  if (current?.role === role && !current.closing && current.offerSdp === packet.s && current.pairingId === packet.t && current.answerPromise) {
    return current.answerPromise;
  }
  if (current?.status.connected) throw new Error("This device is already connected to the assessment.");
  const session = createSession(packet.c, role);
  session.deviceOnly = String(packet.t || "").startsWith("device_");
  session.status.deviceOnly = session.deviceOnly;
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

export async function acceptTeacherDeviceOffer(value) {
  return acceptLearnerAssessmentOffer(value, "", { role: "teacher" });
}

export async function completeTeacherAssessmentPairing(code, value, { role = "teacher" } = {}) {
  const key = normalizeCode(code);
  const packet = await readAssessmentPairingPacket(value, key, "a");
  if (packet.k !== "a") throw new Error("Scan the learner response code.");
  if (packet.c !== key) throw new Error("This response belongs to a different assessment.");
  const session = sessions.get(key);
  if (!session?.peer || session.role !== role) {
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

export async function completeLearnerDevicePairing(code, value) {
  return completeTeacherAssessmentPairing(code, value, { role: "learner" });
}

export function publishAssessmentPeerState(code, sessionState) {
  const key = normalizeCode(code || sessionState?.code);
  if (!key || !sessionState) return false;
  const previous = lastTeacherStates.get(key);
  const message = {
    type: "assessment_state",
    version: Math.max(Date.now(), (previous?.version || 0) + 1),
    sequence: (previous?.sequence || 0) + 1,
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

// Closing a learner window must release live links and pending invitations,
// while a teacher running in this same JS realm retains its own peer.
export function disconnectAssessmentPeers(role) {
  if (!["teacher", "learner"].includes(role)) throw new Error("Invalid device role.");
  roleGenerations[role] += 1;
  for (const [code, session] of Array.from(sessions)) {
    if (session.role === role) disconnectAssessmentPeer(code);
  }
}

export const __assessmentPeerTestUtils = {
  encodePairingPacket,
  normalizeCode,
};
