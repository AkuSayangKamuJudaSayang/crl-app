"use client";

import { warmAssessmentRealtime } from "./assessmentChannel";

// The original QR exchange already shares both SDP descriptions. Derive
// separate room and encryption keys from that high-entropy pairing material.
// Only encrypted ICE signalling travels here; never assessment or learner data.
export async function openPeerRecoveryRelay({ material, role, onMessage, onReady }) {
  if (!globalThis.crypto?.subtle || typeof window === "undefined" || navigator.onLine === false) return null;
  const encoder = new TextEncoder();
  const digest = async domain => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`${domain}\n${material}`)));
  const topicBytes = await digest("crl-recovery-room-v1");
  const topic = `crl-recovery:${Array.from(topicBytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
  const key = await crypto.subtle.importKey("raw", await digest("crl-recovery-key-v1"), "AES-GCM", false, ["encrypt", "decrypt"]);
  const client = await warmAssessmentRealtime();
  if (!client) return null;
  let closed = false, ready = false, sendSequence = 0, highestReceived = 0;
  const seen = new Set();
  const toBase64 = bytes => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
  const fromBase64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const channel = client.channel(topic, { config: { broadcast: { self: false, ack: true } } });
  const relay = {
    get ready() { return ready && !closed; },
    async send(message) {
      if (!relay.ready) return false;
      if (!["ready", "request", "offer", "answer"].includes(message.kind)) return false;
      const safeMessage = { kind: message.kind, code: message.code };
      if (message.kind === "offer" || message.kind === "answer") {
        safeMessage.exchange = message.exchange; safeMessage.sdp = message.sdp; safeMessage.generation = message.generation;
      }
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const id = toBase64(crypto.getRandomValues(new Uint8Array(16)));
      const plain = encoder.encode(JSON.stringify({ ...safeMessage, role, id, sequence: ++sendSequence, v: 1 }));
      if (plain.length > 40000) return false;
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(topic) }, key, plain);
      if (!relay.ready) return false;
      try {
        return await channel.send({ type: "broadcast", event: "ice_recovery", payload: { iv: toBase64(iv), box: toBase64(new Uint8Array(encrypted)) } }) === "ok";
      } catch { return false; }
    },
    close() {
      if (closed) return;
      closed = true; ready = false;
      void Promise.resolve(client.removeChannel(channel)).catch(() => {});
    },
  };
  channel.on("broadcast", { event: "ice_recovery" }, async event => {
    if (closed) return;
    const payload = event?.payload;
    if (typeof payload?.iv !== "string" || payload.iv.length > 24 || typeof payload.box !== "string" || payload.box.length > 56000) return;
    try {
      const iv = fromBase64(payload.iv);
      if (iv.length !== 12) return;
      const decoded = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(topic) }, key, fromBase64(payload.box));
      const message = JSON.parse(new TextDecoder().decode(decoded));
      if (closed || message.v !== 1 || message.role !== (role === "teacher" ? "learner" : "teacher") || typeof message.id !== "string" || !Number.isSafeInteger(message.sequence) || message.sequence <= 0 || message.sequence <= highestReceived - 512 || seen.has(message.sequence)) return;
      // A new envelope is used on retries. Replaying an old encrypted envelope
      // must never trigger renegotiation a second time.
      highestReceived = Math.max(highestReceived, message.sequence);
      for (const sequence of seen) if (sequence <= highestReceived - 512) seen.delete(sequence);
      seen.add(message.sequence);
      await onMessage(message);
    } catch { /* Invalid ciphertext or a retired link is ignored. */ }
  }).subscribe(status => {
    ready = status === "SUBSCRIBED";
    if (ready && !closed) void Promise.resolve(onReady(relay)).catch(() => {});
  });
  return relay;
}
