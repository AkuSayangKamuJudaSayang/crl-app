const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { X509Certificate } = require("node:crypto");
const JSZip = require("jszip");
const { ensureTls } = require("./offline-hub/tls.cjs");
const { autostartPlan } = require("./offline-hub/install.cjs");
const { startService } = require("./offline-hub/service.cjs");

const freePort = () => new Promise((resolve, reject) => {
  const server = http.createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
});
const request = (url, options = {}) => new Promise((resolve, reject) => {
  const transport = url.startsWith("https:") ? https : http;
  const req = transport.get(url, options, res => {
    let text = "";
    res.on("data", chunk => { text += chunk; });
    res.on("end", () => resolve({ status: res.statusCode, text }));
  });
  req.on("error", reject);
  req.setTimeout(5000, () => req.destroy(new Error("Timed out")));
});

async function verify() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crl-hub-verify-"));
  const certs = path.join(directory, "certificates");
  const tls = ensureTls(certs, { addresses: ["192.168.1.9"] });
  const root = new X509Certificate(tls.root);
  const leaf = new X509Certificate(tls.cert);
  assert.equal(root.ca, true);
  assert.equal(leaf.ca, false);
  assert.equal(leaf.verify(root.publicKey), true);
  assert.equal(leaf.checkHost("crl-offline.local"), "crl-offline.local");
  assert.equal(leaf.checkIP("127.0.0.1"), "127.0.0.1");
  const second = ensureTls(certs, { addresses: ["192.168.1.9"] });
  assert.equal(second.root.toString(), tls.root.toString(), "Reinstall must preserve already-trusted root");
  assert.equal(second.renewed, false);
  if (process.platform !== "win32") assert.equal(fs.statSync(path.join(certs, "root-key.pem")).mode & 0o777, 0o600);
  const windows = autostartPlan("win32", "C:\\School Files\\O'Brien\\hub", "C:\\Node\\node.exe", "C:\\School Files", 0);
  // The inner PowerShell path is quoted again inside the task's Argument string.
  const argument = windows.args.at(-1).match(/-Argument '((?:[^']|'')*)'; \$trigger/)[1].replace(/''/g, "'");
  assert.ok(argument.includes("O''Brien"));
  assert.ok(windows.args.at(-1).includes("-AtLogOn"));
  assert.ok(windows.args.at(-1).includes("-RunLevel Limited"));
  assert.ok(!windows.args.at(-1).includes("ExecutionPolicy"));
  const mac = autostartPlan("darwin", "/School & Class/hub", "/Node/node", "/School & Class", 501);
  assert.ok(mac.contents.includes("School &amp; Class"));
  assert.ok(mac.contents.includes("<key>KeepAlive</key><true/>"));
  const linux = autostartPlan("linux", "/School % $Files/hub", "/Node/node", "/School", 1000);
  assert.ok(linux.contents.includes("%% $$Files"));
  assert.ok(linux.contents.includes("Restart=on-failure"));
  assert.throws(() => autostartPlan("android", "/hub", "/node", "/user"), /Phones and tablets connect/);
  console.log("PASS hub certificates preserve trust, verify hostname and signatures; Windows/macOS/Linux autostart plans quote paths safely");

  const port = await freePort();
  let setupPort = await freePort();
  while (setupPort === port) setupPort = await freePort();
  fs.writeFileSync(path.join(directory, "config.json"), JSON.stringify({ port, setupPort }));
  const service = await startService(directory, { addresses: ["192.168.1.9"], advertise: false });
  try {
    const health = await request(`https://127.0.0.1:${port}/health`, { ca: tls.root });
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.text).publicAddress, `https://crl-offline.local:${port}`);
    await assert.rejects(request(`https://127.0.0.1:${port}/health`), /certificate|self-signed|issuer/i);
    const certificate = await request(`http://127.0.0.1:${setupPort}/CRL-Offline-Root.crt`);
    assert.equal(certificate.text, tls.root.toString());
    assert.equal((await request(`http://127.0.0.1:${setupPort}/root-key.pem`)).status, 404);
    assert.equal((await request(`http://127.0.0.1:${setupPort}/pairing`)).status, 404);
    assert.ok((await request(`http://127.0.0.1:${setupPort}/setup`)).text.includes("Check secure connection"));
    console.log("PASS actual HTTPS service accepts its trusted root and rejects untrusted clients; setup exposes only the public certificate");
  } finally { service.close(); }
  const zipPath = "public/offline-hub/CRL-Offline-Setup.zip";
  if (fs.existsSync(zipPath)) {
    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
    const names = Object.keys(zip.files);
    for (const file of ["Install-Windows.cmd", "Install-macOS.command", "Install-Linux.sh", "scripts/offline-hub/service.cjs", "node_modules/node-forge/package.json", "node_modules/bonjour-service/package.json"]) assert.ok(names.includes(`CRL-Offline-Setup/${file}`));
    assert.ok(!names.some(name => /root-key|server-key|\/\.env|prisma|supabase/.test(name)));
    const unpacked = path.join(directory, "unpacked");
    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const target = path.join(unpacked, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, await file.async("nodebuffer"));
    }
    const base = path.join(unpacked, "CRL-Offline-Setup", "scripts", "offline-hub");
    assert.equal(typeof require(path.join(base, "service.cjs")).startService, "function");
    assert.equal(typeof require(path.join(base, "install.cjs")).install, "function");
    console.log("PASS downloadable setup extracts with all runtime dependencies and no private keys, app credentials or database files");
  }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
