// HTTP is a live fallback when realtime is unavailable. These calls are never
// satisfied by a saved host, cached API response or queued mutation.
async function presenceRequest(init, code) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`/api/assessment/presence?code=${encodeURIComponent(code)}`, {
      cache: "no-store", ...init, signal: controller.signal,
    });
    return response.ok ? await response.json() : null;
  } catch { return null; }
  finally { clearTimeout(timeout); }
}

export async function sendTeacherHttpPresence(code, packet) {
  return presenceRequest({ method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "teacher", code, nonce: packet.nonce, status: packet.status, recovering: Boolean(packet.recovering) }),
  }, code);
}

export async function receiveTeacherHttpPresence(code, receive) {
  const packet = await presenceRequest({ method: "GET", credentials: "omit" }, code);
  if (!packet?.nonce || packet.code !== code || receive(packet) === null) return;
  await presenceRequest({ method: "POST", credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "learner", code, nonce: packet.nonce }),
  }, code);
}
