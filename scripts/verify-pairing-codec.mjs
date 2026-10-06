/*
 * Guards the compact pairing code.
 *
 * A pairing code is the only thing that crosses between the two devices, and it
 * is carried by a QR that has to be read from a phone at arm's length. Writing
 * the session description out as prose costs around seven hundred characters;
 * describing its lines as fields costs roughly a third of that. The whole
 * bargain rests on one promise, checked here: whatever the codec produces must
 * rebuild the description character for character, or the codec must refuse and
 * leave the older encoding in charge. A round trip that loses a byte of the
 * DTLS fingerprint would not fail loudly - it would fail as a connection that
 * never comes up in a classroom.
 */
import { deflateRawSync } from "node:zlib";
import assert from "node:assert/strict";
import qrcode from "../lib/vendor/qrcode.mjs";
import jsQR from "../lib/vendor/jsQR.js";
import { decodeCompactPairingCode, encodeCompactPairingCode, isCompactPairingCode, isPairingPacketText, legacyPairingPacket, rememberLegacyPacket } from "../lib/assessmentPairingCodec.js";

const fingerprint = (seed) =>
  Array.from({ length: 32 }, (_, index) => (index * 37 + seed * 11) % 256)
    .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
    .join(":");
const mdnsHost = (seed) => {
  const hex = Array.from({ length: 32 }, (_, index) => "0123456789abcdef"[(index * 7 + seed * 13) % 16]).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}.local`;
};

const chrome = ({ candidates = 1, seed = 3, port = 9 } = {}) =>
  [
    "v=0",
    `o=- ${8114309606661923858n + BigInt(seed)} 2 IN IP4 127.0.0.1`,
    "s=-",
    "t=0 0",
    "a=group:BUNDLE 0",
    "a=extmap-allow-mixed",
    "a=msid-semantic: WMS",
    `m=application ${port} UDP/DTLS/SCTP webrtc-datachannel`,
    "c=IN IP4 0.0.0.0",
    ...Array.from(
      { length: candidates },
      (_, index) =>
        `a=candidate:${3202828350 + index * 7919} 1 udp ${index ? 1686052607 : 2122260223} ${mdnsHost(seed + index)} ${50000 + index} typ host generation 0 network-id 1 network-cost 10`
    ),
    "a=ice-ufrag:8kD2",
    "a=ice-pwd:K1vQ7cHn2pRfTn5jWxYb4ZmA",
    "a=ice-options:trickle",
    `a=fingerprint:sha-256 ${fingerprint(seed)}`,
    "a=setup:actpass",
    "a=mid:0",
    "a=sctp-port:5000",
    "a=max-message-size:262144",
    "",
  ].join("\r\n");

const answer = chrome({ seed: 9 }).replace("a=setup:actpass", "a=setup:active");

const firefox = [
  "v=0",
  "o=mozilla...THIS_IS_SDPARTA-99.0 1234567890123456789 0 IN IP4 0.0.0.0",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0",
  "a=msid-semantic: WMS",
  "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 0.0.0.0",
  "a=ice-ufrag:1a2b3c4d",
  "a=ice-pwd:0123456789abcdef0123456789abcdef",
  "a=ice-options:trickle",
  `a=fingerprint:sha-256 ${fingerprint(5).toLowerCase()}`,
  "a=setup:actpass",
  "a=mid:0",
  "a=sctp-port:5000",
  "a=max-message-size:1073741823",
  `a=candidate:0 1 UDP 2122252543 ${mdnsHost(4)} 51234 typ host`,
  "a=end-of-candidates",
  "",
].join("\r\n");

const safari = [
  "v=0",
  "o=- 1 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0",
  "a=msid-semantic: WMS",
  "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 0.0.0.0",
  "a=candidate:1 1 udp 2113937151 192.168.0.14 52345 typ host generation 0",
  "a=candidate:2 1 udp 1677729535 203.0.113.9 52345 typ srflx raddr 192.168.0.14 rport 52345 generation 0",
  "a=ice-ufrag:abcd",
  "a=ice-pwd:abcdefghijklmnopqrstuvwx",
  "a=ice-options:trickle",
  `a=fingerprint:sha-256 ${fingerprint(7)}`,
  "a=setup:actpass",
  "a=mid:0",
  "a=sctp-port:5000",
  "a=max-message-size:65536",
  "",
].join("\r\n");

/* What the same session costs in the form the app shipped before this one. */
function legacyLength(sdp) {
  const packet = { v: 1, k: "o", c: "ABC123", t: "aB3dE9fGxY", s: sdp };
  return 7 + deflateRawSync(Buffer.from(JSON.stringify(packet), "utf8")).toString("base64url").length;
}

const corpus = [
  ["chrome phone, one candidate", chrome({ candidates: 1 }), 300],
  ["chrome laptop, two candidates", chrome({ candidates: 2 }), 340],
  ["chrome laptop, three candidates", chrome({ candidates: 3 }), 400],
  ["learner answer", answer, 300],
  ["firefox desktop", firefox, 400],
  ["safari with srflx", safari, 320],
  ["ipv6 candidate", chrome().replace(/a=candidate:[^\r\n]+/, "a=candidate:1 1 udp 2122260223 2001:db8::1 50000 typ host generation 0"), 300],
  ["lf-only line endings", chrome({ candidates: 2 }).replace(/\r\n/g, "\n"), 340],
  ["unknown trailing line", chrome().replace("a=max-message-size:262144", "a=some-future-extension:yes"), 320],
  ["no candidates", chrome().replace(/a=candidate:[^\r\n]*\r\n/g, ""), 240],
];

let shortest = Infinity;
for (const [label, sdp, ceiling] of corpus) {
  const code = encodeCompactPairingCode({ v: 1, k: "o", c: "ABC123", t: "aB3dE9fGxY", s: sdp });
  assert.ok(code, `${label}: the codec must handle an ordinary description`);
  assert.ok(isCompactPairingCode(code), `${label}: the code carries its own prefix`);
  const decoded = decodeCompactPairingCode(code);
  assert.equal(decoded.s, sdp, `${label}: the description must come back character for character`);
  assert.equal(decoded.c, "ABC123", `${label}: the assessment code survives`);
  assert.equal(decoded.t, "aB3dE9fGxY", `${label}: the pairing id survives`);
  assert.equal(decoded.k, "o");
  assert.ok(code.length <= ceiling, `${label}: expected at most ${ceiling} characters, got ${code.length}`);
  assert.ok(code.length < legacyLength(sdp) * 0.75, `${label}: the compact code must be worth taking, ${code.length} vs ${legacyLength(sdp)}`);
  shortest = Math.min(shortest, code.length);
}
assert.ok(shortest <= 240, `an ordinary phone code must be about two hundred characters, got ${shortest}`);
console.log(`PASS compact pairing codes rebuild every description exactly and cost ${shortest}-${Math.max(...corpus.map(([, sdp]) => encodeCompactPairingCode({ v: 1, k: "o", c: "ABC123", t: "aB3dE9fGxY", s: sdp }).length))} characters instead of ${legacyLength(corpus[0][1])}`);

/*
 * A description the codec does not fully understand must still cross, so every
 * oddity is either refused outright or reproduced exactly - never quietly
 * rewritten into something the browser did not say.
 */
const oddities = [
  ["empty description", ""],
  ["no line separator", "v=0"],
  ["no version line", "s=-\r\n"],
  ["one-character code", chrome(), { c: "ABC12" }],
  ["unknown role", chrome(), { k: "x" }],
  ["pairing id with a dot", chrome(), { t: "a.b" }],
  ["missing pairing id", chrome(), { t: "" }],
  ["fingerprint with a stray letter", chrome().replace(/a=fingerprint:sha-256 \S+/, "a=fingerprint:sha-256 zz"), {}],
  ["mixed-case fingerprint", chrome().replace(/a=fingerprint:sha-256 (\S+)/, (match, hex) => `a=fingerprint:sha-256 ${hex.slice(0, 4).toLowerCase()}${hex.slice(4)}`), {}],
  ["ipv4 with a leading zero", chrome().replace("c=IN IP4 0.0.0.0", "c=IN IP4 010.0.0.0"), {}],
  ["foundation beyond a word", chrome().replace(/a=candidate:\d+/, "a=candidate:99999999999"), {}],
  ["blank line in the middle", chrome().replace("a=mid:0", "\r\na=mid:0"), {}],
  ["duplicate candidate lines", chrome({ candidates: 1 }).replace(/(a=candidate:[^\r\n]*\r\n)/, "$1$1"), {}],
  ["trailing spaces", chrome().replace("s=-", "s=-  "), {}],
  ["no trailing separator", chrome().replace(/\r\n$/, ""), {}],
];
for (const [label, sdp, overrides = {}] of oddities) {
  const code = encodeCompactPairingCode({ v: 1, k: "o", c: "ABC123", t: "aB3dE9fGxY", s: sdp, ...overrides });
  if (!code) continue;
  assert.equal(decodeCompactPairingCode(code).s, sdp, `${label}: a code that is produced must be exact`);
}
console.log("PASS odd or unfamiliar descriptions are either refused or reproduced exactly, never rewritten");

/* A tampered or truncated code must be refused, not decoded into nonsense. */
const sample = encodeCompactPairingCode({ v: 1, k: "o", c: "ABC123", t: "aB3dE9fGxY", s: chrome() });
for (const broken of [sample.slice(0, sample.length - 4), sample.replace(".", ""), `CRL3.${"a".repeat(300)}`, `${sample}A`, "CRL3.", "CRL3.a.", "CRL3.a.!!!!"]) {
  assert.throws(() => decodeCompactPairingCode(broken), /pairing code|newer app/, `a damaged code must be refused: ${broken.slice(0, 24)}`);
}
/* A code from the future says so instead of half-decoding into the past. */
const bodyStart = sample.indexOf(".", sample.indexOf(".") + 1) + 1;
assert.throws(() => decodeCompactPairingCode(`${sample.slice(0, bodyStart)}Q${sample.slice(bodyStart + 1)}`), /newer app/);
assert.equal(isCompactPairingCode("CRL3.a.b"), true);
assert.equal(isCompactPairingCode("CRL1z.a"), false);
console.log("PASS truncated, padded and version-bumped codes are refused rather than half-read");

/* The older forms stay recognised by the one pattern that guards them all. */
for (const value of ["CRL1.abc", "CRL1z.abc", "CRL2z.abc", "CRL3.a.abc"]) assert.ok(isPairingPacketText(value), `${value} is a packet the app has sent`);
for (const value of ["", "crl3.a.b", "CRL4.a.b", "x".repeat(24001), "CRL1"]) assert.equal(isPairingPacketText(value), false);

/* An older hub is handed the older form of the very same session. */
assert.equal(legacyPairingPacket(sample), "");
rememberLegacyPacket(sample, "CRL1z.twin");
assert.equal(legacyPairingPacket(sample), "CRL1z.twin");
for (let index = 0; index < 80; index += 1) rememberLegacyPacket(`CRL3.pairingId${index}.body`, `CRL1z.twin${index}`);
assert.equal(legacyPairingPacket("CRL3.pairingId0.body"), "", "the twin table must not grow without bound");
console.log("PASS every packet form stays readable and an older hub can still be given one it understands");

/*
 * The point of the shorter code is the teacher's QR, so the whole journey is
 * exercised once on a description the size a real phone produces: invitation
 * URL, rendered QR, camera decode, and the exact description back. The module
 * count is pinned because that is what decides whether a phone can read the
 * code from across a desk.
 */
const shown = encodeCompactPairingCode({ v: 1, k: "o", c: "ABC123", t: "aB3dE9fGxY", s: chrome({ candidates: 2 }) });
const invitation = `https://crl-app-tau.vercel.app/learner?code=ABC123#pair=${encodeURIComponent(shown)}`;
const qr = qrcode(0, "L");
qr.addData(invitation);
qr.make();
assert.ok(qr.getModuleCount() <= 81, `a teacher's code must stay printable, got ${qr.getModuleCount()} modules`);
const scale = 5;
const border = 4;
const size = (qr.getModuleCount() + 2 * border) * scale;
const pixels = new Uint8ClampedArray(size * size * 4);
for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const row = Math.floor(y / scale) - border;
    const column = Math.floor(x / scale) - border;
    const dark = row >= 0 && column >= 0 && row < qr.getModuleCount() && column < qr.getModuleCount() && qr.isDark(row, column);
    const offset = (y * size + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = dark ? 0 : 255;
    pixels[offset + 3] = 255;
  }
}
const scanned = jsQR(pixels, size, size);
assert.equal(scanned?.data, invitation, "the rendered teacher QR must decode back to the invitation");
const recovered = new URL(scanned.data).hash.slice(1).split("=").slice(1).join("=");
assert.equal(decodeCompactPairingCode(decodeURIComponent(recovered)).s, chrome({ candidates: 2 }), "the scanned code must rebuild the teacher description");
console.log(`PASS a teacher's QR renders at ${qr.getModuleCount()} modules, decodes from a camera image, and rebuilds the description exactly`);

/*
 * The corpus above is what browsers are known to emit. This sweep is what they
 * might: thousands of mangled, duplicated, truncated and invented lines, driven
 * by a fixed sequence so the build checks the same examples every time. Every
 * description the codec accepts must come back character for character - the
 * failure mode this guards against is a code that looks fine and quietly
 * corrupts the fingerprint, which would surface only as a link that never
 * connects.
 */
const scrambles = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.:=-+/ \u00e9\u2026\t".split("");
let state = 4242;
const next = () => {
  state = (state * 25173 + 13849) % 65536;
  return state / 65536;
};
const choose = (list) => list[Math.floor(next() * list.length)];
const scramble = (text) => {
  const separator = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(separator);
  const edits = 1 + Math.floor(next() * 4);
  for (let edit = 0; edit < edits; edit += 1) {
    const index = Math.floor(next() * lines.length);
    const choice = Math.floor(next() * 6);
    if (choice === 0) {
      const line = lines[index];
      const at = Math.floor(next() * line.length);
      lines[index] = line.slice(0, at) + choose(scrambles) + line.slice(at + 1);
    } else if (choice === 1 && lines.length > 2) lines.splice(index, 1);
    else if (choice === 2) lines.splice(index, 0, lines[index]);
    else if (choice === 3) lines[index] = `${lines[index]} `;
    else if (choice === 4) lines.splice(index, 0, `a=unknown-extension:${"x".repeat(Math.floor(next() * 40))}`);
    else lines[index] = "";
  }
  return lines.join(choose(["\r\n", "\n", "\r"]));
};
let swept = 0;
let kept = 0;
for (let round = 0; round < 1200; round += 1) {
  const sdp = round % 7 === 0 ? chrome({ candidates: 2 }) : scramble(chrome({ candidates: 2 }));
  const packet = { v: 1, k: round % 2 ? "a" : "o", c: "ABC123", t: "aB3dE9fGxY", s: sdp };
  const code = encodeCompactPairingCode(packet);
  swept += 1;
  if (!code) continue;
  kept += 1;
  const decoded = decodeCompactPairingCode(code);
  assert.equal(decoded.s, sdp, `a scrambled description must come back exactly, round ${round}`);
  assert.equal(decoded.k, packet.k, `the role survives, round ${round}`);
}
assert.ok(kept > swept * 0.5, `most real-world descriptions must still shorten, got ${kept} of ${swept}`);
console.log(`PASS ${kept} of ${swept} scrambled descriptions still shorten, and every one of them rebuilds exactly`);
