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
    /*
     * Control messages travel learner -> teacher and the teacher only accepts
     * packets tagged "learner", so the source must be set here. Without it the
     * readiness signal was silently discarded on the same-device path.
     */
    channel.postMessage({ type: "assessment_control", version: Date.now(), source: "learner", ...payload });
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

function normalizeRealtimeCode(code) {
  return String(code || "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .trim()
    .toUpperCase();
}

function getRealtimeTopic(code) {
  return `crl-assessment:${normalizeRealtimeCode(code)}`;
}

/*
 * RealtimeChannel.subscribe() returns the channel itself so calls can be
 * chained; the subscription status is only delivered to the callback. Awaiting
 * the returned value and comparing it to "SUBSCRIBED" was therefore always
 * false, which silently unsubscribed and disabled cross-device realtime in
 * BOTH directions (the teacher never published, the learner never listened),
 * leaving the learner dependent on polling alone.
 *
 * Resolve the actual status delivered to the subscribe callback instead.
 */
const REALTIME_SUBSCRIBE_TIMEOUT_MS = 10000;

function subscribeToChannel(channel) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (state) => {
      if (settled) return;
      settled = true;
      resolve(state);
    };

    const timer = setTimeout(
      () => finish("TIMED_OUT"),
      REALTIME_SUBSCRIBE_TIMEOUT_MS
    );

    try {
      channel.subscribe((state) => {
        if (
          state === "SUBSCRIBED" ||
          state === "CHANNEL_ERROR" ||
          state === "TIMED_OUT" ||
          state === "CLOSED"
        ) {
          clearTimeout(timer);
          finish(state);
        }
      });
    } catch {
      clearTimeout(timer);
      finish("CHANNEL_ERROR");
    }
  });
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

  const status = await subscribeToChannel(channel);
  if (status !== "SUBSCRIBED") {
    try {
      channel.unsubscribe();
    } catch {}
    return null;
  }

  return channel;
}

/*
 * Publisher channels are cached per topic. The cache holds the in-flight
 * subscribe promise rather than the channel so concurrent publishes share one
 * subscription instead of racing to create several.
 */
async function getPublisherChannel(topic) {
  const pending = realtimePublisherChannels.get(topic);
  if (pending) return pending;

  const promise = (async () => {
    const client = await getSupabaseClient();
    if (!client) return null;

    const channel = client.channel(topic, {
      config: { broadcast: { self: false } },
    });

    const status = await subscribeToChannel(channel);
    if (status !== "SUBSCRIBED") {
      try {
        channel.unsubscribe();
      } catch {}
      return null;
    }

    return channel;
  })();

  realtimePublisherChannels.set(topic, promise);

  const channel = await promise;
  if (!channel) {
    // Allow a later publish to retry a fresh subscription.
    realtimePublisherChannels.delete(topic);
  }
  return channel;
}

async function sendRealtimeEvent(code, event, source, payload) {
  if (!code) return false;

  const channel = await getPublisherChannel(getRealtimeTopic(code));
  if (!channel) return false;

  try {
    const result = await channel.send({
      type: "broadcast",
      event,
      payload: {
        type: event,
        version: Date.now(),
        source,
        ...payload,
      },
    });
    return result === "ok";
  } catch {
    return false;
  }
}

export async function publishAssessmentRealtimeState(code, session) {
  if (!session) return false;
  return sendRealtimeEvent(code, "assessment_state", "teacher", { session });
}

/*
 * Control messages travel learner -> teacher, so they must be tagged
 * "learner": the teacher ignores any control payload that is not from a
 * learner. This previously sent "teacher" and was silently dropped.
 */
export async function publishAssessmentRealtimeControl(code, payload) {
  return sendRealtimeEvent(code, "assessment_control", "learner", payload || {});
}

export async function closeAssessmentRealtimeChannel(channel) {
  if (!channel) return;
  try {
    await channel.unsubscribe();
  } catch {}
}
