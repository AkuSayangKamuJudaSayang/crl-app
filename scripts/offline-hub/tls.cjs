const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { generateKeyPairSync, randomBytes, X509Certificate } = require("node:crypto");
const forge = require("node-forge");

const HOST = "crl-offline.local";
function privateAddresses() {
  return [...new Set(Object.values(os.networkInterfaces()).flat().filter(item => item && item.family === "IPv4" && !item.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address)).map(item => item.address))].sort();
}
function keyPair() {
  return generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
}
function writePrivate(file, value) { fs.writeFileSync(file, value, { mode: 0o600 }); fs.chmodSync(file, 0o600); }
function certificate(keys, subject, issuer, days) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(keys.publicKey);
  cert.serialNumber = "01" + randomBytes(16).toString("hex");
  cert.validity.notBefore = new Date(Date.now() - 5 * 60000);
  cert.validity.notAfter = new Date(Date.now() + days * 86400000);
  cert.setSubject([{ name: "commonName", value: subject }]);
  cert.setIssuer(issuer || cert.subject.attributes);
  return cert;
}
function ensureTls(directory, { addresses = privateAddresses() } = {}) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const rootFile = path.join(directory, "CRL-Offline-Root.crt");
  const rootKey = path.join(directory, "root-key.pem");
  const certFile = path.join(directory, "server-cert.pem");
  const keyFile = path.join(directory, "server-key.pem");
  if (!fs.existsSync(rootFile) || !fs.existsSync(rootKey)) {
    if (fs.existsSync(rootFile) || fs.existsSync(rootKey)) throw new Error("Incomplete hub certificate. Restore the existing certificate files before reinstalling.");
    const keys = keyPair();
    const cert = certificate(keys, "CRL Offline Hub - " + randomBytes(4).toString("hex"), null, 3650);
    cert.setExtensions([{ name: "basicConstraints", cA: true, pathLenConstraint: 0, critical: true }, { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true }, { name: "subjectKeyIdentifier" }]);
    cert.sign(forge.pki.privateKeyFromPem(keys.privateKey), forge.md.sha256.create());
    writePrivate(rootKey, keys.privateKey);
    fs.writeFileSync(rootFile, forge.pki.certificateToPem(cert));
  }
  let renew = !fs.existsSync(certFile) || !fs.existsSync(keyFile);
  if (!renew) {
    const cert = new X509Certificate(fs.readFileSync(certFile));
    renew = Date.parse(cert.validTo) < Date.now() + 7 * 86400000 || addresses.some(address => !cert.checkIP(address));
  }
  if (renew) {
    const root = forge.pki.certificateFromPem(fs.readFileSync(rootFile, "utf8"));
    const keys = keyPair();
    const cert = certificate(keys, HOST, root.subject.attributes, 90);
    cert.setExtensions([{ name: "basicConstraints", cA: false, critical: true }, { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true }, { name: "extKeyUsage", serverAuth: true }, { name: "subjectAltName", altNames: [{ type: 2, value: HOST }, { type: 2, value: "localhost" }, ...["127.0.0.1", ...addresses].map(ip => ({ type: 7, ip }))] }, { name: "subjectKeyIdentifier" }]);
    cert.sign(forge.pki.privateKeyFromPem(fs.readFileSync(rootKey, "utf8")), forge.md.sha256.create());
    writePrivate(keyFile, keys.privateKey);
    fs.writeFileSync(certFile, forge.pki.certificateToPem(cert));
  }
  return { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile), root: fs.readFileSync(rootFile), addresses, renewed: renew };
}
module.exports = { ensureTls, HOST, privateAddresses };
