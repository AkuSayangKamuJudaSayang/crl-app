"use client";

const CHANNEL_PREFIX = "crl-assessment-v1:";

export function createAssessmentChannel(code, onMessage) {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined" || !code) return null;
  const channel = new BroadcastChannel(`${CHANNEL_PREFIX}${String(code).toUpperCase()}`);
  if (onMessage) channel.addEventListener("message", onMessage);
  return channel;
}

export function closeAssessmentChannel(channel, onMessage) {
  if (!channel) return;
  try {
    if (onMessage) channel.removeEventListener("message", onMessage);
    channel.close();
  } catch {}
}

export function publishAssessmentState(channel, payload) {
  if (!channel) return false;
  try {
    channel.postMessage({ type: "assessment_state", version: Date.now(), ...payload });
    return true;
  } catch {
    return false;
  }
}
