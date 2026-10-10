const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const os = require("node:os");
const { randomInt } = require("node:crypto");
const { inflateRawSync, inflateSync } = require("node:zlib");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 5000;
const DEFAULT_ORIGINS = ["https://crl-app-tau.vercel.app", "https://crl-app-crl-app.vercel.app", "http://localhost:3000", "http://127.0.0.1:3000"];
function pairingId(value) {
  try {
    /*
     * A compact packet states its pairing id ahead of the body, so the hub can
     * match a reply to its invitation without decoding the description.
     */
    if (value.startsWith("CRL3.") || value.startsWith("CRL3z.")) {
      const candidate = value.split(".")[1] || "";
      if (value.startsWith("CRL3z.")) {
        if (!/^[NTL]_[A-Za-z0-9_-]{1,64}$/.test(candidate)) return "";
        const id = `${candidate[0] === "L" ? "device_learner_" : candidate[0] === "T" ? "device_" : ""}${candidate.slice(2)}`;
        return id.length <= 64 ? id : "";
      }
      return /^[A-Za-z0-9_-]{1,64}$/.test(candidate) ? candidate : "";
    }
    const body = Buffer.from(value.slice(value.indexOf(".") + 1), "base64url");
    const json = value.startsWith("CRL1z.") ? inflateRawSync(body, { maxOutputLength: 24000 }) : value.startsWith("CRL2z.") ? inflateSync(body, { maxOutputLength: 24000 }) : body;
    const packet = JSON.parse(json.toString());
    return typeof packet.t === "string" && packet.t.length <= 100 ? packet.t : "";
  } catch { return ""; }
}

function createPairingHub({ now = Date.now, origins = DEFAULT_ORIGINS, publicAddress = "" } = {}) {
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
  function put({ assessment, kind, packet, replyTo = "" }) {
    prune();
    if (!/^[A-Z0-9]{6}$/.test(assessment || "") || !["o", "a"].includes(kind) || typeof packet !== "string" || packet.length > 24000 || !/^CRL[123](?:z)?\./.test(packet)) {
      throw Object.assign(new Error("Invalid pairing packet."), { status: 400 });
    }
    const packetId = pairingId(packet);
    if (kind === "a") {
      // A QR-only invitation can still use automatic return once the hub is found.
      const matching = [...entries].filter(([, entry]) => entry.kind === "o" && entry.assessment === assessment && packetId && entry.pairingId === packetId).at(-1);
      replyTo = matching?.[0] || replyTo;
    }
    if (replyTo) {
      const invitation = entries.get(replyTo);
      if (kind !== "a" || invitation?.kind !== "o" || invitation.assessment !== assessment || !packetId || packetId !== invitation.pairingId) {
        throw Object.assign(new Error("Teacher invitation expired. Use the latest code."), { status: 404 });
      }
    }
    // Retries reuse the same live token and never overwrite another invitation.
    for (const [code, entry] of entries) if (entry.assessment === assessment && entry.kind === kind && entry.packet === packet) { if (replyTo) entry.replyTo = replyTo; return { code, expiresAt: entry.expiresAt, expiresInMs: entry.expiresAt - now() }; }
    if (entries.size >= MAX_ENTRIES) throw Object.assign(new Error("Hub is busy. Try again shortly."), { status: 503 });
    let code;
    do { code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(""); } while (code === assessment || entries.has(code));
    const entry = { assessment, kind, packet, pairingId: packetId, replyTo, expiresAt: now() + TTL_MS };
    entries.set(code, entry);
    return { code, expiresAt: entry.expiresAt, expiresInMs: entry.expiresAt - now() };
  }
  function offer(assessment) {
    prune();
    const candidates = [...entries].filter(([, entry]) => entry.assessment === assessment && entry.kind === "o");
    const latest = candidates.at(-1);
    if (!latest) throw Object.assign(new Error("Teacher is not ready yet."), { status: 404 });
    return { code: latest[0], packet: latest[1].packet };
  }
  function response(code, assessment) {
    get(code, assessment, "o");
    const answer = [...entries.values()].filter(entry => entry.replyTo === code && entry.assessment === assessment && entry.kind === "a").at(-1);
    return { packet: answer?.packet || "" };
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
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { service: "crl-offline-pairing", version: 1, publicAddress });
      if (req.method === "GET" && /^\/assessment\/[A-Z0-9]{6}\/offer$/.test(url.pathname)) return send(res, 200, offer(url.pathname.split("/")[2]));
      if (req.method === "GET" && /^\/pairing\/[A-Z0-9]{6}\/response$/.test(url.pathname)) return send(res, 200, response(url.pathname.split("/")[2], url.searchParams.get("assessment")));
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
  return { handler, put, get, offer, response, entries };
}

module.exports = { createPairingHub, DEFAULT_ORIGINS };
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
