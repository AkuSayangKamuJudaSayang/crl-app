const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const os = require("node:os");
const { randomInt } = require("node:crypto");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 5000;
const DEFAULT_ORIGINS = ["https://crl-app-tau.vercel.app", "https://crl-app-crl-app.vercel.app", "http://localhost:3000", "http://127.0.0.1:3000"];

function createPairingHub({ now = Date.now, origins = DEFAULT_ORIGINS } = {}) {
  const entries = new Map();
  const rates = new Map();
  const allowedOrigins = new Set(origins);
  function prune() {
    const time = now();
    for (const [key, entry] of entries) if (entry.expiresAt <= time) entries.delete(key);
    for (const [key, rate] of rates) if (rate.until <= time) rates.delete(key);
  }
  function limit(address, publishing) {
    prune();
    const key = `${address}:${publishing ? "publish" : "read"}`;
    const rate = rates.get(key) || { count: 0, until: now() + 60000 };
    rate.count++;
    rates.set(key, rate);
    return rate.count <= (publishing ? 30 : 120);
  }
  function put({ assessment, kind, packet }) {
    prune();
    if (!/^[A-Z0-9]{6}$/.test(assessment || "") || !["o", "a"].includes(kind) || typeof packet !== "string" || packet.length > 24000 || !/^CRL[12](?:z)?\./.test(packet)) {
      throw Object.assign(new Error("Invalid pairing packet."), { status: 400 });
    }
    // Retries reuse the same live token and never overwrite another invitation.
    for (const [code, entry] of entries) if (entry.assessment === assessment && entry.kind === kind && entry.packet === packet) return { code, expiresAt: entry.expiresAt, expiresInMs: entry.expiresAt - now() };
    if (entries.size >= MAX_ENTRIES) throw Object.assign(new Error("Hub is busy. Try again shortly."), { status: 503 });
    let code;
    do { code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(""); } while (code === assessment || entries.has(code));
    const entry = { assessment, kind, packet, expiresAt: now() + TTL_MS };
    entries.set(code, entry);
    return { code, expiresAt: entry.expiresAt, expiresInMs: entry.expiresAt - now() };
  }
  function get(code, assessment, kind) {
    prune();
    const entry = entries.get(code);
    if (!entry || entry.assessment !== assessment || entry.kind !== kind) throw Object.assign(new Error("Code not found or expired. Use the latest code."), { status: 404 });
    return { packet: entry.packet, expiresAt: entry.expiresAt };
  }
  function send(res, status, value) {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(value));
  }
  async function handler(req, res) {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) return send(res, 403, { error: "Origin not allowed." });
    if (origin) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, "http://hub.local");
    const publishing = req.method === "POST";
    if (!limit(req.socket?.remoteAddress || "unknown", publishing)) return send(res, 429, { error: "Too many requests. Try again shortly." });
    try {
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { service: "crl-offline-pairing", version: 1 });
      if (req.method === "GET" && /^\/pairing\/[A-Z0-9]{6}$/.test(url.pathname)) return send(res, 200, get(url.pathname.split("/").pop(), url.searchParams.get("assessment"), url.searchParams.get("kind")));
      if (req.method === "POST" && url.pathname === "/pairing") {
        if (!String(req.headers["content-type"] || "").startsWith("application/json")) return send(res, 415, { error: "JSON required." });
        let body = "";
        let bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 26000) { send(res, 413, { error: "Packet too large." }); return; } body += chunk.toString(); }
        return send(res, 201, put(JSON.parse(body)));
      }
      return send(res, 404, { error: "Not found." });
    } catch (error) { return send(res, error.status || 400, { error: error.status ? error.message : "Invalid request." }); }
  }
  return { handler, put, get, entries };
}

module.exports = { createPairingHub };
if (require.main === module) {
  const port = Number(process.env.CRL_PAIRING_HUB_PORT || 8787);
  const origins = [...DEFAULT_ORIGINS, ...(process.env.CRL_PAIRING_HUB_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean)];
  const hub = createPairingHub({ origins });
  const tls = process.env.CRL_PAIRING_HUB_CERT && process.env.CRL_PAIRING_HUB_KEY;
  const server = tls ? https.createServer({ cert: fs.readFileSync(process.env.CRL_PAIRING_HUB_CERT), key: fs.readFileSync(process.env.CRL_PAIRING_HUB_KEY) }, hub.handler) : http.createServer(hub.handler);
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.listen(port, "0.0.0.0", () => {
    console.log("CRL offline pairing hub is running. No internet connection is required.");
    console.log("Enter one of these hub addresses on BOTH devices:");
    for (const interfaces of Object.values(os.networkInterfaces())) for (const item of interfaces || []) if (item.family === "IPv4" && !item.internal) console.log(`${tls ? "https" : "http"}://${item.address}:${port}`);
    console.log("Keep this terminal open. Connection codes expire after 15 minutes.");
  });
  server.on("error", error => { console.error(error.message); process.exitCode = 1; });
}
