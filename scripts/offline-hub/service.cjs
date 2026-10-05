const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { Bonjour } = require("bonjour-service");
const { createPairingHub, DEFAULT_ORIGINS } = require("../offline-pairing-hub.cjs");
const { ensureTls, HOST } = require("./tls.cjs");

async function startService(directory = path.resolve(__dirname, "../.."), { addresses, advertise: enableDiscovery = true } = {}) {
  const configFile = path.join(directory, "config.json");
  const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, "utf8")) : {};
  const port = Number(config.port || 8787);
  const setupPort = Number(config.setupPort || 8788);
  if (![port, setupPort].every(value => Number.isInteger(value) && value > 1024 && value <= 65535) || port === setupPort) throw new Error("Invalid hub ports.");
  const publicAddress = `https://${HOST}:${port}`;
  const origins = [...DEFAULT_ORIGINS, ...(config.origins || [])];
  let tls = ensureTls(path.join(directory, "certificates"), { addresses });
  const hub = createPairingHub({ origins, publicAddress });
  const server = https.createServer({ ...tls, minVersion: "TLSv1.2" }, hub.handler);
  server.requestTimeout = server.headersTimeout = 10000;
  // HTTP is used only for initial certificate download, never for pairing.
  const setup = http.createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.url === "/CRL-Offline-Root.crt") {
      res.writeHead(200, { "Content-Type": "application/x-x509-ca-cert", "Content-Disposition": 'attachment; filename="CRL-Offline-Root.crt"' });
      res.end(tls.root); return;
    }
    if (!["/", "/setup"].includes(req.url)) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CRL Offline Setup</title><style>body{font:17px/1.6 system-ui;max-width:550px;margin:40px auto;padding:20px;color:#1a2b4c}a{display:block;margin:15px 0;padding:12px;border-radius:12px;background:#1a2b4c;color:white;text-align:center}small{display:block}</style><h1>CRL Offline Setup</h1><p>One-time setup on each device.</p><a href="/CRL-Offline-Root.crt">Download hub certificate</a><p>Your school administrator should verify this certificate and install it as trusted for this hub.</p><small>iPhone/iPad: Settings → General → About → Certificate Trust Settings.</small><small>Android/HarmonyOS: Settings → Security → Install certificate → CA certificate. Names vary by device.</small><p>Allow local network access when asked.</p><a href="${publicAddress}/health">Check secure connection</a><a href="https://crl-app-tau.vercel.app/teacher">Open teacher app</a><a href="https://crl-app-tau.vercel.app/learner">Open learner app</a></html>`);
  });
  setup.requestTimeout = setup.headersTimeout = 10000;
  const listen = (target, targetPort) => new Promise((resolve, reject) => { target.once("error", reject); target.listen(targetPort, "0.0.0.0", resolve); });
  try { await listen(server, port); await listen(setup, setupPort); }
  catch (error) { server.close(); setup.close(); throw error; }
  let bonjour = null;
  try { if (enableDiscovery) bonjour = new Bonjour({}, error => console.error("Local discovery:", error.message)); }
  catch (error) { console.error("Local discovery unavailable; use the hub's LAN address:", error.message); }
  const advertise = () => {
    try { return bonjour?.publish({ name: "CRL Offline Hub", type: "https", port, host: HOST, txt: { service: "crl-offline-pairing", version: "1" } }); }
    catch (error) { console.error("Local discovery unavailable:", error.message); return null; }
  };
  let advertisement = advertise();
  const renewal = setInterval(() => {
    try {
      const next = ensureTls(path.join(directory, "certificates"), { addresses });
      if (next.renewed) server.setSecureContext(next);
      if (next.addresses.join() !== tls.addresses.join()) {
        advertisement?.stop(() => { advertisement = advertise(); });
      }
      tls = next;
    } catch (error) { console.error("Certificate renewal:", error.message); }
  }, 60000);
  const close = () => { clearInterval(renewal); bonjour?.destroy(); server.close(); setup.close(); };
  return { close, publicAddress, addresses: tls.addresses, setupPort };
}
module.exports = { startService };
if (require.main === module) {
  startService().then(service => {
    console.log(`CRL offline hub ready: ${service.publicAddress}`);
    for (const address of service.addresses) console.log(`Device setup: http://${address}:${service.setupPort}/setup`);
    process.on("SIGTERM", service.close);
    process.on("SIGINT", service.close);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
