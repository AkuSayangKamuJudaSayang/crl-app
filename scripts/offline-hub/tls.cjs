/*
 * The hub's own certificate authority.
 *
 * The hub serves HTTPS under a name a browser can trust, so it needs a small
 * CA: one long-lived root the teacher installs once, and a 90-day server
 * certificate signed by it that is renewed whenever it ages out or the machine
 * picks up a new local address.
 *
 * Certificates are built here from the DER structures in RFC 5280 with
 * node:crypto alone - keys, hashing and signatures come from the platform and
 * only the encoding is local. That keeps the one-time setup download free of a
 * certificate library, and it leaves the encoding checkable against OpenSSL,
 * which node:crypto's X509Certificate is.
 *
 * The reading side understands a root this file did not write, so a hub set up
 * before a change here keeps its already-trusted root and only renews its
 * server certificate against it.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign: signWith,
  X509Certificate,
} = require("node:crypto");

const HOST = "crl-offline.local";

const OID = {
  commonName: "2.5.4.3",
  sha256WithRsa: "1.2.840.113549.1.1.11",
  basicConstraints: "2.5.29.19",
  keyUsage: "2.5.29.15",
  extendedKeyUsage: "2.5.29.37",
  subjectAltName: "2.5.29.17",
  subjectKeyIdentifier: "2.5.29.14",
  serverAuth: "1.3.6.1.5.5.7.3.1",
};

/* Key usage bits, numbered as RFC 5280 numbers them. */
const KEY_USAGE_BIT = {
  digitalSignature: 0,
  keyEncipherment: 2,
  keyCertSign: 5,
  cRLSign: 6,
};

/* ------------------------------------------------------------------ */
/* DER                                                                 */
/* ------------------------------------------------------------------ */

function lengthBytes(length) {
  if (length < 0x80) return Buffer.from([length]);
  const bytes = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function element(tag, content) {
  return Buffer.concat([Buffer.from([tag]), lengthBytes(content.length), content]);
}

const sequence = (...parts) => element(0x30, Buffer.concat(parts));
const setOf = (...parts) => element(0x31, Buffer.concat(parts));
const octetString = (content) => element(0x04, content);
const nullValue = () => Buffer.from([0x05, 0x00]);
const boolean = (value) => element(0x01, Buffer.from([value ? 0xff : 0x00]));
const utf8String = (text) => element(0x0c, Buffer.from(text, "utf8"));
const integer = (bytes) => element(0x02, bytes);
const bitString = (bytes) => element(0x03, Buffer.concat([Buffer.from([0x00]), bytes]));
const explicit = (number, content) => element(0xa0 | number, content);
const contextPrimitive = (number, content) => element(0x80 | number, content);

function oid(dotted) {
  const arcs = dotted.split(".").map(Number);
  const bytes = [arcs[0] * 40 + arcs[1]];
  for (const arc of arcs.slice(2)) {
    const chunk = [];
    let value = arc;
    do {
      chunk.unshift(value & 0x7f);
      value = Math.floor(value / 128);
    } while (value > 0);
    for (let index = 0; index < chunk.length - 1; index += 1) chunk[index] |= 0x80;
    bytes.push(...chunk);
  }
  return element(0x06, Buffer.from(bytes));
}

/* UTCTime through 2049 and GeneralizedTime beyond it, both in UTC. */
function time(value) {
  const pad = (number, width = 2) => String(number).padStart(width, "0");
  const year = value.getUTCFullYear();
  const rest = `${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}${pad(
    value.getUTCHours()
  )}${pad(value.getUTCMinutes())}${pad(value.getUTCSeconds())}Z`;
  return year >= 1950 && year <= 2049
    ? element(0x17, Buffer.from(`${pad(year % 100)}${rest}`, "ascii"))
    : element(0x18, Buffer.from(`${pad(year, 4)}${rest}`, "ascii"));
}

function directoryName(commonName) {
  return sequence(setOf(sequence(oid(OID.commonName), utf8String(commonName))));
}

function keyUsage(bitNames) {
  const bits = bitNames.map((name) => KEY_USAGE_BIT[name]);
  const highest = Math.max(...bits);
  const bytes = Buffer.alloc(Math.floor(highest / 8) + 1);
  for (const bit of bits) bytes[Math.floor(bit / 8)] |= 0x80 >> (bit % 8);
  const unused = bytes.length * 8 - (highest + 1);
  return element(0x03, Buffer.concat([Buffer.from([unused]), bytes]));
}

function extension(dotted, critical, value) {
  return sequence(
    oid(dotted),
    ...(critical ? [boolean(true)] : []),
    octetString(value)
  );
}

function readElement(buffer, offset) {
  const tag = buffer[offset];
  let cursor = offset + 1;
  let length = buffer[cursor];
  cursor += 1;
  if (length & 0x80) {
    const count = length & 0x7f;
    length = 0;
    for (let index = 0; index < count; index += 1) {
      length = length * 256 + buffer[cursor];
      cursor += 1;
    }
  }
  return { tag, start: offset, contentStart: cursor, end: cursor + length };
}

function pemToDer(pem) {
  return Buffer.from(
    String(pem)
      .replace(/-----BEGIN [^-]+-----/, "")
      .replace(/-----END [^-]+-----/, "")
      .replace(/\s+/g, ""),
    "base64"
  );
}

function derToPem(der) {
  const body = der.toString("base64").replace(/(.{64})/g, "$1\n").trimEnd();
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
}

/*
 * A signed certificate's issuer name must match the root's subject name byte
 * for byte, so it is copied out of the root rather than rebuilt from its
 * printed form. The walk steps over the version, serial number and signature
 * algorithm that precede the issuer inside TBSCertificate.
 */
function issuerNameFrom(certificatePem) {
  const der = pemToDer(certificatePem);
  const certificate = readElement(der, 0);
  const tbs = readElement(der, certificate.contentStart);
  let cursor = tbs.contentStart;
  const version = readElement(der, cursor);
  if (version.tag === 0xa0) cursor = version.end;
  cursor = readElement(der, cursor).end; // serialNumber
  cursor = readElement(der, cursor).end; // signature AlgorithmIdentifier
  const issuer = readElement(der, cursor);
  return der.subarray(issuer.start, issuer.end);
}

/* ------------------------------------------------------------------ */
/* Certificates                                                        */
/* ------------------------------------------------------------------ */

function privateAddresses() {
  return [
    ...new Set(
      Object.values(os.networkInterfaces())
        .flat()
        .filter(
          (item) =>
            item &&
            item.family === "IPv4" &&
            !item.internal &&
            /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address)
        )
        .map((item) => item.address)
    ),
  ].sort();
}

function keyPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function writePrivate(file, value) {
  fs.writeFileSync(file, value, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

/* The TBSCertificate and the algorithm identifier its signature is made under. */
function certificateBody({ publicKeyPem, subject, issuer, days, extensions }) {
  const publicKey = createPublicKey(publicKeyPem);
  const subjectKeyIdentifier = extension(
    OID.subjectKeyIdentifier,
    false,
    octetString(
      createHash("sha1")
        .update(publicKey.export({ type: "pkcs1", format: "der" }))
        .digest()
    )
  );
  const algorithm = sequence(oid(OID.sha256WithRsa), nullValue());

  return {
    algorithm,
    tbs: sequence(
      explicit(0, integer(Buffer.from([2]))),
      /* A leading 01 keeps the serial number positive. */
      integer(Buffer.from(`01${randomBytes(16).toString("hex")}`, "hex")),
      algorithm,
      issuer,
      sequence(
        time(new Date(Date.now() - 5 * 60000)),
        time(new Date(Date.now() + days * 86400000))
      ),
      subject,
      publicKey.export({ type: "spki", format: "der" }),
      explicit(3, sequence(...extensions, subjectKeyIdentifier))
    ),
  };
}

function complete(body, privateKeyPem) {
  const signature = signWith(
    "sha256",
    body.tbs,
    createPrivateKey(privateKeyPem)
  );
  return derToPem(sequence(body.tbs, body.algorithm, bitString(signature)));
}

function ensureTls(directory, { addresses = privateAddresses() } = {}) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const rootFile = path.join(directory, "CRL-Offline-Root.crt");
  const rootKey = path.join(directory, "root-key.pem");
  const certFile = path.join(directory, "server-cert.pem");
  const keyFile = path.join(directory, "server-key.pem");

  if (!fs.existsSync(rootFile) || !fs.existsSync(rootKey)) {
    if (fs.existsSync(rootFile) || fs.existsSync(rootKey)) {
      throw new Error(
        "Incomplete hub certificate. Restore the existing certificate files before reinstalling."
      );
    }

    const keys = keyPair();
    const name = directoryName(
      `CRL Offline Hub - ${randomBytes(4).toString("hex")}`
    );
    const body = certificateBody({
      publicKeyPem: keys.publicKey,
      subject: name,
      issuer: name,
      days: 3650,
      extensions: [
        extension(
          OID.basicConstraints,
          true,
          sequence(boolean(true), integer(Buffer.from([0])))
        ),
        extension(OID.keyUsage, true, keyUsage(["keyCertSign", "cRLSign"])),
      ],
    });

    writePrivate(rootKey, keys.privateKey);
    fs.writeFileSync(rootFile, complete(body, keys.privateKey));
  }

  let renew = !fs.existsSync(certFile) || !fs.existsSync(keyFile);
  if (!renew) {
    const certificate = new X509Certificate(fs.readFileSync(certFile));
    renew =
      Date.parse(certificate.validTo) < Date.now() + 7 * 86400000 ||
      addresses.some((address) => !certificate.checkIP(address));
  }

  if (renew) {
    const keys = keyPair();
    const addressesWithLocalhost = [...new Set(["127.0.0.1", ...addresses])];
    const body = certificateBody({
      publicKeyPem: keys.publicKey,
      subject: directoryName(HOST),
      issuer: issuerNameFrom(fs.readFileSync(rootFile, "utf8")),
      days: 90,
      extensions: [
        extension(OID.basicConstraints, true, sequence()),
        extension(
          OID.keyUsage,
          true,
          keyUsage(["digitalSignature", "keyEncipherment"])
        ),
        extension(OID.extendedKeyUsage, false, sequence(oid(OID.serverAuth))),
        extension(
          OID.subjectAltName,
          false,
          sequence(
            /*
             * GeneralName wraps its value in the choice tag, so a dNSName is
             * [2] holding IA5String bytes directly and an iPAddress is [7]
             * holding the four address bytes - neither nests a second string.
             */
            ...[HOST, "localhost"].map((name) =>
              contextPrimitive(2, Buffer.from(name, "ascii"))
            ),
            ...addressesWithLocalhost.map((address) =>
              contextPrimitive(
                7,
                Buffer.from(address.split(".").map((part) => Number(part)))
              )
            )
          )
        ),
      ],
    });

    writePrivate(keyFile, keys.privateKey);
    fs.writeFileSync(certFile, complete(body, fs.readFileSync(rootKey, "utf8")));
  }

  return {
    cert: fs.readFileSync(certFile),
    key: fs.readFileSync(keyFile),
    root: fs.readFileSync(rootFile),
    addresses,
    renewed: renew,
  };
}

module.exports = { ensureTls, HOST, privateAddresses };
