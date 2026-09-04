const KEY = "crla-offline-teacher-auth-v1";

async function digest(value) {
  const data = new TextEncoder().encode(value);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function rememberOfflineCredential(username, password, user) {
  if (typeof window === "undefined" || !username || !password || !user) return;
  const salt = `${user.id || username}:crla-local-v1`;
  const passwordHash = await digest(`${salt}:${password}`);
  localStorage.setItem(KEY, JSON.stringify({ username: username.trim().toLowerCase(), passwordHash, user: { id: user.id, username: user.username, full_name: user.full_name, section: user.section, role: user.role }, savedAt: Date.now() }));
}

export async function verifyOfflineCredential(username, password) {
  if (typeof window === "undefined") return { valid: false };
  const raw = localStorage.getItem(KEY);
  if (!raw) return { valid: false };
  const stored = JSON.parse(raw);
  if (stored.username !== username.trim().toLowerCase()) return { valid: false };
  const salt = `${stored.user?.id || stored.username}:crla-local-v1`;
  const passwordHash = await digest(`${salt}:${password}`);
  return { valid: passwordHash === stored.passwordHash, user: stored.user };
}
