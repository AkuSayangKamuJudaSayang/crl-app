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

export function publishAssessmentControl(channel, payload) {
  if (!channel) return false;
  try {
    channel.postMessage({ type: "assessment_control", version: Date.now(), ...payload });
    return true;
  } catch {
    return false;
  }
}

/*
 * Cross-device assessment realtime.
 * BroadcastChannel only works between contexts on the same device.
 * Supabase Realtime Broadcast carries lightweight assessment state between
 * the teacher laptop and learner phone. Polling remains the fallback.
 */
let supabaseClientPromise = null;
const realtimePublisherChannels = new Map();

async function getSupabaseClient() {
  if (typeof window === "undefined") return null;

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://yzmvacgteadehhqrcvwo.supabase.co";

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "sb_publishable_MRu-Oea82hJTkg_aB_A86g_37f9ESqa";

  if (!url || !key) return null;

  if (!supabaseClientPromise) {
    supabaseClientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    );
  }

  return supabaseClientPromise;
}

function getRealtimeTopic(code) {
  return `crl-assessment:${String(code).toUpperCase()}`;
}

export function getAssessmentWordGateKey(code, session) {
  const normalizedCode = String(code || session?.code || "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .trim()
    .toUpperCase();
  return `${normalizedCode}:${String(session?.id || "session").trim()}:letter-word`;
}

export async function createAssessmentRealtimeChannel(code, onMessage) {
  const client = await getSupabaseClient();
  if (!client || !code) return null;

  const channel = client.channel(getRealtimeTopic(code), {
    config: { broadcast: { self: false } },
  });

  if (onMessage) {
    channel.on(
      "broadcast",
      { event: "assessment_state" },
      (payload) => onMessage(payload?.payload ?? payload)
    );
    channel.on(
      "broadcast",
      { event: "assessment_control" },
      (payload) => onMessage(payload?.payload ?? payload)
    );
  }

  const status = await channel.subscribe();
  if (status !== "SUBSCRIBED") {
    try {
      channel.unsubscribe();
    } catch {}
    return null;
  }

  return channel;
}

export async function publishAssessmentRealtimeState(code, session) {
  const client = await getSupabaseClient();
  if (!client || !code || !session) return false;

  const topic = getRealtimeTopic(code);
  let channel = realtimePublisherChannels.get(topic);

  if (!channel) {
    channel = client.channel(topic, {
      config: { broadcast: { self: false } },
    });
    realtimePublisherChannels.set(topic, channel);

    const status = await channel.subscribe();
    if (status !== "SUBSCRIBED") {
      realtimePublisherChannels.delete(topic);
      try {
        channel.unsubscribe();
      } catch {}
      return false;
    }
  }

  try {
    const result = await channel.send({
      type: "broadcast",
      event: "assessment_state",
      payload: {
        type: "assessment_state",
        version: Date.now(),
        source: "teacher",
        session,
      },
    });
    return result === "ok";
  } catch {
    return false;
  }
}

export async function publishAssessmentRealtimeControl(code, payload) {
  const client = await getSupabaseClient();
  if (!client || !code) return false;

  const topic = getRealtimeTopic(code);
  let channel = realtimePublisherChannels.get(topic);

  if (!channel) {
    channel = client.channel(topic, {
      config: { broadcast: { self: false } },
    });
    realtimePublisherChannels.set(topic, channel);

    const status = await channel.subscribe();
    if (status !== "SUBSCRIBED") {
      realtimePublisherChannels.delete(topic);
      try {
        channel.unsubscribe();
      } catch {}
      return false;
    }
  }

  try {
    const result = await channel.send({
      type: "broadcast",
      event: "assessment_control",
      payload: {
        type: "assessment_control",
        version: Date.now(),
        source: "teacher",
        ...payload,
      },
    });
    return result === "ok";
  } catch {
    return false;
  }
}

export async function closeAssessmentRealtimeChannel(channel) {
  if (!channel) return;
  try {
    await channel.unsubscribe();
  } catch {}
}
