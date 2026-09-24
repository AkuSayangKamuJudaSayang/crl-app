"use client";

/*
 * Imported statically rather than with a lazy dynamic import(): the dynamic
 * import pushed a chunk fetch onto the first subscribe, which delayed the
 * realtime channel by seconds on a cold learner device and made the first few
 * teacher marks arrive only through the slower polling fallback.
 */
import { createClient } from "@supabase/supabase-js";

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
    /*
     * Teacher state carries a fresh monotonic timestamp. The learner keeps the
     * newest state it has seen and ignores an older one, and an optimistic
     * broadcast copies its timestamp from the last server snapshot it was built
     * on - so without this stamp the learner could reject the very packet that
     * advances the item and only update on a slower poll.
     */
    const nextPayload =
      payload?.source === "teacher" && payload?.session
        ? { ...payload, session: withOptimisticStamp(payload.session) }
        : payload;

    channel.postMessage({ type: "assessment_state", version: Date.now(), ...nextPayload });
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
 * Monotonic timestamp for outbound teacher state.
 *
 * Every optimistic publish is built by spreading the last server snapshot, so
 * it inherits that snapshot's `updated_at`. The learner treats an older
 * timestamp as stale, which meant a forward-moving item could be discarded and
 * only arrive on the next poll. Stamping here fixes every publish site at once,
 * including same-device BroadcastChannel and cross-device Realtime.
 */
let optimisticStateStamp = 0;

function withOptimisticStamp(session) {
  if (!session || typeof session !== "object") return session;

  const next = Math.max(Date.now(), optimisticStateStamp + 1);
  optimisticStateStamp = next;
  const isoTimestamp = new Date(next).toISOString();

  return {
    ...session,
    updated_at: isoTimestamp,
    updatedAt: isoTimestamp,
  };
}

/*
 * Cross-device assessment realtime.
 * BroadcastChannel only works between contexts on the same device.
 * Supabase Realtime Broadcast carries lightweight assessment state between
 * the teacher laptop and learner phone. Polling remains the fallback.
 */
let supabaseClientPromise = null;
/*
 * One Supabase channel per assessment topic and browser context.
 *
 * RealtimeClient only keeps one joined channel for a given topic. The teacher
 * previously created one channel for publishing and a second channel for
 * learner control packets. Joining the second channel closed the first, so
 * state sends silently fell back to the REST broadcast endpoint and passage
 * readiness packets could be displaced. Sharing the joined channel keeps both
 * directions on the already-open WebSocket.
 */
const realtimeChannelEntries = new Map();

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
    supabaseClientPromise = Promise.resolve(
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

/*
 * Create the realtime client ahead of time and open its websocket so the
 * socket handshake is already done and the later channel join is fast. Without
 * this the whole connect + join happened after the assessment started, so the
 * first few teacher marks had no live channel and were only visible through the
 * slower polling fallback. Callers may ignore the result; a failure simply
 * leaves polling as the transport.
 */
export async function warmAssessmentRealtime() {
  const client = await getSupabaseClient();
  if (!client) return null;

  try {
    client.realtime?.connect?.();
  } catch {
    /* A failed warm-up must never disturb the assessment. */
  }

  return client;
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

/*
 * Passage readiness gate.
 *
 * The reading timer must only run once the learner device has actually laid the
 * full passage out on screen. The learner confirms with this key, and the
 * teacher waits for it before starting the clock. The story title is part of
 * the key so re-selecting a different passage produces a new gate instead of
 * inheriting a stale confirmation.
 */
export function getAssessmentPassageGateKey(code, session) {
  const normalizedCode = String(code || session?.code || "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .trim()
    .toUpperCase();
  const story = String(
    session?.story_title ?? session?.storyTitle ?? ""
  )
    .trim()
    .toLowerCase();

  return `${normalizedCode}:${String(session?.id || "session").trim()}:passage:${story}`;
}

export async function createAssessmentRealtimeChannel(code, onMessage) {
  if (!code) return null;

  const topic = getRealtimeTopic(code);
  const entry = getRealtimeChannelEntry(topic);
  if (onMessage) entry.listeners.add(onMessage);

  const channel = await entry.promise;
  if (!channel) {
    if (onMessage) entry.listeners.delete(onMessage);
    return null;
  }

  let released = false;
  return {
    unsubscribe: async () => {
      if (released) return "ok";
      released = true;
      if (onMessage) entry.listeners.delete(onMessage);
      return "ok";
    },
  };
}

/*
 * Channel entries are cached per topic. The entry owns the single Supabase
 * channel plus a listener set, so publishing and receiving never compete by
 * joining duplicate channels with the same topic.
 */
function getRealtimeChannelEntry(topic) {
  const existing = realtimeChannelEntries.get(topic);
  if (existing) return existing;

  const entry = {
    channel: null,
    listeners: new Set(),
    promise: null,
  };

  entry.promise = (async () => {
    const client = await getSupabaseClient();
    if (!client) return null;

    const channel = client.channel(topic, {
      config: { broadcast: { self: false } },
    });

    const dispatch = (payload) => {
      const message = payload?.payload ?? payload;
      for (const listener of Array.from(entry.listeners)) {
        try {
          listener(message);
        } catch {
          /* One consumer must never prevent the other consumers receiving. */
        }
      }
    };

    channel.on(
      "broadcast",
      { event: "assessment_state" },
      dispatch
    );
    channel.on(
      "broadcast",
      { event: "assessment_control" },
      dispatch
    );

    const status = await subscribeToChannel(channel);
    if (status !== "SUBSCRIBED") {
      try {
        channel.unsubscribe();
      } catch {}
      if (realtimeChannelEntries.get(topic) === entry) {
        realtimeChannelEntries.delete(topic);
      }
      return null;
    }

    entry.channel = channel;
    return channel;
  })();

  realtimeChannelEntries.set(topic, entry);
  return entry;
}

async function getPublisherChannel(topic) {
  const entry = getRealtimeChannelEntry(topic);
  const channel = await entry.promise;
  if (!channel) {
    // Allow a later publish to retry a fresh subscription.
    if (realtimeChannelEntries.get(topic) === entry) {
      realtimeChannelEntries.delete(topic);
    }
  }
  return channel;
}

async function sendRealtimeEvent(code, event, source, payload) {
  if (!code) return false;

  const topic = getRealtimeTopic(code);
  const channel = await getPublisherChannel(topic);
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

    if (result === "ok") {
      return true;
    }

    /*
     * Keep the shared entry intact. RealtimeChannel automatically rejoins a
     * dropped socket, and removing it here would also discard the learner
     * control listeners. Polling remains the safety net until it reconnects.
     */
    return false;
  } catch {
    return false;
  }
}

export async function publishAssessmentRealtimeState(code, session) {
  if (!session) return false;
  return sendRealtimeEvent(code, "assessment_state", "teacher", {
    session: withOptimisticStamp(session),
  });
}

/*
 * Control messages travel learner -> teacher, so they must be tagged
 * "learner": the teacher ignores any control payload that is not from a
 * learner. This previously sent "teacher" and was silently dropped.
 */
export async function publishAssessmentRealtimeControl(code, payload) {
  return sendRealtimeEvent(code, "assessment_control", "learner", payload || {});
}

/*
 * Pre-subscribe the teacher's publisher channel for a known code so the very
 * first mark does not pay the channel-join latency. getPublisherChannel caches
 * the in-flight subscribe promise, so this warm-up is shared with the real
 * publishes that follow. A failure is harmless: publishes fall back to lazy
 * subscription (and the learner polling remains the final safety net).
 */
export async function warmAssessmentPublisher(code) {
  if (!code) return null;
  try {
    return await getPublisherChannel(getRealtimeTopic(code));
  } catch {
    return null;
  }
}

export async function closeAssessmentRealtimeChannel(channel) {
  if (!channel) return;
  try {
    await channel.unsubscribe();
  } catch {}
}
