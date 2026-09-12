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

  const subscribed = await new Promise((resolve) => {
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") finish(true);
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        finish(false);
      }
    });

    window.setTimeout(() => finish(false), 5000);
  });

  if (!subscribed) {
    try {
      await client.removeChannel(channel);
    } catch {}
    return null;
  }

  return channel;
}

export async function publishAssessmentRealtimeState(code, session) {
  const client = await getSupabaseClient();
  if (!client || !code || !session) return false;

  const normalizedCode = String(code).toUpperCase();
  let channel = realtimePublisherChannels.get(normalizedCode);

  if (!channel) {
    channel = client.channel(getRealtimeTopic(normalizedCode), {
      config: { broadcast: { self: false } },
    });

    const subscribed = await new Promise((resolve) => {
      let settled = false;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") finish(true);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          finish(false);
        }
      });

      window.setTimeout(() => finish(false), 5000);
    });

    if (!subscribed) {
      try {
        await client.removeChannel(channel);
      } catch {}
      return false;
    }

    realtimePublisherChannels.set(normalizedCode, channel);
  }

  const safeSession = {
    id: session.id,
    code: session.code,
    stage: session.stage,
    current_content: session.current_content ?? session.currentContent ?? "",
    currentContent: session.currentContent ?? session.current_content ?? "",
    story_title: session.story_title ?? session.storyTitle ?? "",
    storyTitle: session.storyTitle ?? session.story_title ?? "",
    ended: Boolean(session.ended),
    connected: session.connected !== false,
    linked_at: session.linked_at ?? session.linkedAt ?? null,
    updated_at: session.updated_at ?? session.updatedAt ?? new Date().toISOString(),
    passage_started_at: session.passage_started_at ?? session.passageStartedAt ?? null,
    passage_paused_at: session.passage_paused_at ?? session.passagePausedAt ?? null,
    passage_paused_seconds: session.passage_paused_seconds ?? session.passagePausedSeconds ?? 0,
    early_termination: session.early_termination ?? null,
    metrics: session.metrics
      ? {
          task1Score: session.metrics.task1Score ?? null,
          task2Score: session.metrics.task2Score ?? null,
          comprehensionScore: session.metrics.comprehensionScore ?? null,
          classification: session.metrics.classification ?? session.metrics.classificationLabel ?? null,
          observationLevel: session.metrics.observationLevel ?? null,
          remarks: session.metrics.remarks ?? "",
        }
      : null,
  };

  const { error } = await channel.send({
    type: "broadcast",
    event: "assessment_state",
    payload: {
      version: Date.now(),
      source: "teacher",
      session: safeSession,
    },
  });

  return !error;
}

export async function publishAssessmentRealtimeControl(code, control) {
  const client = await getSupabaseClient();
  if (!client || !code || !control) return false;

  const normalizedCode = String(code).toUpperCase();
  let channel = realtimePublisherChannels.get(normalizedCode);

  if (!channel) {
    channel = client.channel(getRealtimeTopic(normalizedCode), {
      config: { broadcast: { self: false } },
    });

    const subscribed = await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") finish(true);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") finish(false);
      });
      window.setTimeout(() => finish(false), 5000);
    });

    if (!subscribed) {
      try { await client.removeChannel(channel); } catch {}
      return false;
    }

    realtimePublisherChannels.set(normalizedCode, channel);
  }

  const { error } = await channel.send({
    type: "broadcast",
    event: "assessment_control",
    payload: {
      version: Date.now(),
      source: "learner",
      control,
    },
  });

  return !error;
}
