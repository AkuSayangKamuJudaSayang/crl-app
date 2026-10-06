/*
 * A pairing code is a session description plus four small facts, and it has to
 * travel by QR, by clipboard and through the optional hub. Written out as text
 * a description costs around seven hundred characters, almost all of it fixed
 * wording: the same "a=ice-options:trickle", the same "typ host generation 0",
 * the same sixty-four hexadecimal digits of DTLS fingerprint. Describing those
 * lines as fields instead of prose costs roughly a third as much, which is the
 * difference between a code that scans from across a classroom and one that has
 * to be held at arm's length, still, in good light.
 *
 * Nothing here rewrites the description. Every line is rebuilt from a template
 * into exactly the text that was read, or carried through verbatim, and the
 * encoder proves that by decoding its own output and comparing before it
 * returns. A description that cannot be reproduced exactly is left to the older
 * encoding, so a code can never carry a value the browser did not produce.
 */

export const COMPACT_PREFIX = "CRL3.";

const SEPARATORS = ["\r\n", "\n", "\r"];
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SETUPS = ["actpass", "active", "passive"];
const CANDIDATE_TYPES = ["host", "srflx", "prflx", "relay"];
const TRANSPORTS = ["udp", "tcp"];
const CANDIDATE_ATTRS = ["generation", "network-id", "network-cost", "raddr", "rport", "tcptype", "ufrag"];
const FINGERPRINT_ALGORITHMS = ["sha-256", "sha-384", "sha-512"];
const UNKNOWN = 0x7f;

function isUint(value, limit) {
  return Number.isInteger(value) && value >= 0 && value <= limit;
}

function codeToNumber(code) {
  let value = 0;
  for (const character of code) {
    const index = CODE_ALPHABET.indexOf(character);
    if (index < 0) return -1;
    value = value * 36 + index;
  }
  return value;
}

function numberToCode(value) {
  let rest = value;
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code = CODE_ALPHABET[rest % 36] + code;
    rest = Math.floor(rest / 36);
  }
  return code;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes, lowerCase) {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return lowerCase ? hex : hex.toUpperCase();
}

function base64UrlFromBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("The pairing code is incomplete or invalid.");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  let binary;
  try {
    binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  } catch {
    throw new Error("The pairing code is incomplete or invalid.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function createWriter() {
  const bytes = [];
  return {
    u8(value) {
      if (!isUint(value, 0xff)) throw new Error("out of range");
      bytes.push(value);
    },
    u16(value) {
      if (!isUint(value, 0xffff)) throw new Error("out of range");
      bytes.push((value >>> 8) & 0xff, value & 0xff);
    },
    u32(value) {
      if (!isUint(value, 0xffffffff)) throw new Error("out of range");
      bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
    },
    u64(value) {
      for (let shift = 56n; shift >= 0n; shift -= 8n) bytes.push(Number((value >> shift) & 0xffn));
    },
    varint(value) {
      if (!isUint(value, 0xffffffff)) throw new Error("out of range");
      let rest = value;
      while (rest >= 0x80) {
        bytes.push((rest & 0x7f) | 0x80);
        rest = Math.floor(rest / 128);
      }
      bytes.push(rest);
    },
    text(value) {
      const encoded = new TextEncoder().encode(String(value));
      this.varint(encoded.length);
      for (const byte of encoded) bytes.push(byte);
    },
    append(other) {
      for (const byte of other) bytes.push(byte);
    },
    finish() {
      return Uint8Array.from(bytes);
    },
  };
}

function createReader(data) {
  let offset = 0;
  const reader = {
    u8() {
      if (offset >= data.length) throw new Error("truncated pairing code");
      return data[offset++];
    },
    u16() {
      const first = reader.u8();
      return first * 0x100 + reader.u8();
    },
    u32() {
      return reader.u16() * 0x10000 + reader.u16();
    },
    u64() {
      let value = 0n;
      for (let index = 0; index < 8; index += 1) value = (value << 8n) | BigInt(reader.u8());
      return value;
    },
    varint() {
      let value = 0;
      let factor = 1;
      for (let index = 0; index < 5; index += 1) {
        const byte = reader.u8();
        value += (byte & 0x7f) * factor;
        if ((byte & 0x80) === 0) return value;
        factor *= 128;
      }
      throw new Error("malformed pairing code");
    },
    bytes(count) {
      if (offset + count > data.length) throw new Error("truncated pairing code");
      const value = data.subarray(offset, offset + count);
      offset += count;
      return value;
    },
    text() {
      return new TextDecoder().decode(reader.bytes(reader.varint()));
    },
    done() {
      return offset >= data.length;
    },
  };
  return reader;
}

/*
 * Addresses repeat down every candidate line, so the two shapes browsers use
 * are stored as bytes and anything else - a host name, an IPv6 literal - as
 * text. A value the browser wrote differently is refused rather than normalised.
 */
function writeAddress(writer, address) {
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (parts) {
    const octets = parts.slice(1).map((part) => Number(part));
    for (let index = 0; index < 4; index += 1) if (String(octets[index]) !== parts[index + 1]) return false;
    if (!octets.every((octet) => octet <= 255)) return false;
    writer.u8(0);
    for (const octet of octets) writer.u8(octet);
    return true;
  }
  const uuid = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/.exec(address);
  if (uuid) {
    writer.u8(1);
    writer.append(hexToBytes(uuid.slice(1).join("")));
    return true;
  }
  if (address.length > 96) return false;
  writer.u8(2);
  writer.text(address);
  return true;
}

function readAddress(reader) {
  const kind = reader.u8();
  if (kind === 0) return [reader.u8(), reader.u8(), reader.u8(), reader.u8()].join(".");
  if (kind === 1) {
    const hex = bytesToHex(reader.bytes(16), true);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}.local`;
  }
  if (kind === 2) return reader.text();
  throw new Error("malformed pairing code");
}

function writeCandidate(writer, line) {
  const tokens = line.split(" ");
  if (tokens.length < 8 || (tokens.length - 8) % 2 !== 0) return false;
  const foundation = tokens[0].slice("a=candidate:".length);
  const transport = TRANSPORTS.indexOf(tokens[2]);
  const type = CANDIDATE_TYPES.indexOf(tokens[7]);
  if (tokens[6] !== "typ" || transport < 0 || type < 0) return false;
  if (!/^\d{1,10}$/.test(foundation) || Number(foundation) > 0xffffffff) return false;
  if (!/^[1-9]\d{0,2}$/.test(tokens[1])) return false;
  if (!/^\d{1,10}$/.test(tokens[3]) || Number(tokens[3]) > 0xffffffff) return false;
  if (!/^\d{1,5}$/.test(tokens[5]) || Number(tokens[5]) > 0xffff) return false;
  const attributes = [];
  for (let index = 8; index < tokens.length; index += 2) {
    const key = CANDIDATE_ATTRS.indexOf(tokens[index]);
    if (key < 0) return false;
    const numeric = /^\d{1,10}$/.test(tokens[index + 1]) && Number(tokens[index + 1]) <= 0xffffffff;
    attributes.push({ key, numeric, value: tokens[index + 1] });
  }
  writer.u8(attributes.length);
  writer.u32(Number(foundation));
  writer.u8(Number(tokens[1]));
  writer.u8(transport);
  writer.u32(Number(tokens[3]));
  if (!writeAddress(writer, tokens[4])) return false;
  writer.u16(Number(tokens[5]));
  writer.u8(type);
  for (const attribute of attributes) {
    writer.u8(attribute.numeric ? attribute.key | 0x80 : attribute.key);
    if (attribute.numeric) writer.u32(Number(attribute.value));
    else writer.text(attribute.value);
  }
  return true;
}

function readCandidate(reader) {
  const count = reader.u8();
  if (count > CANDIDATE_ATTRS.length) throw new Error("malformed pairing code");
  const tokens = [
    `a=candidate:${reader.u32()}`,
    String(reader.u8()),
    TRANSPORTS[reader.u8()],
    String(reader.u32()),
    readAddress(reader),
    String(reader.u16()),
    "typ",
    CANDIDATE_TYPES[reader.u8()],
  ];
  if (!tokens[2] || !tokens[7]) throw new Error("malformed pairing code");
  for (let index = 0; index < count; index += 1) {
    const key = reader.u8();
    const name = CANDIDATE_ATTRS[key & 0x7f];
    if (!name) throw new Error("malformed pairing code");
    tokens.push(name, (key & 0x80) === 0 ? reader.text() : String(reader.u32()));
  }
  return tokens.join(" ");
}

const LINE_TEMPLATES = [
  { id: 1, match: (line) => (line === "v=0" ? {} : null), read: () => "v=0" },
  {
    id: 2,
    match: (line) => {
      const parts = /^o=(\S+) (\d{1,20}) (\d{1,10}) IN IP4 (\S+)$/.exec(line);
      if (!parts) return null;
      const session = BigInt(parts[2]);
      if (session > 0xffffffffffffffffn) return null;
      return { username: parts[1], session, version: Number(parts[3]), address: parts[4] };
    },
    write: (writer, value) => {
      writer.text(value.username);
      writer.u64(value.session);
      writer.u32(value.version);
      if (!writeAddress(writer, value.address)) throw new Error("unusable address");
    },
    read: (reader) => `o=${reader.text()} ${reader.u64()} ${reader.u32()} IN IP4 ${readAddress(reader)}`,
  },
  {
    id: 3,
    match: (line) => (line.startsWith("s=") ? { value: line.slice(2) } : null),
    write: (writer, value) => writer.text(value.value),
    read: (reader) => `s=${reader.text()}`,
  },
  { id: 4, match: (line) => (line === "t=0 0" ? {} : null), read: () => "t=0 0" },
  {
    id: 5,
    match: (line) => (line.startsWith("a=group:BUNDLE ") ? { value: line.slice(15) } : null),
    write: (writer, value) => writer.text(value.value),
    read: (reader) => `a=group:BUNDLE ${reader.text()}`,
  },
  { id: 6, match: (line) => (line === "a=extmap-allow-mixed" ? {} : null), read: () => "a=extmap-allow-mixed" },
  {
    id: 7,
    match: (line) => (line.startsWith("a=msid-semantic: ") ? { value: line.slice(17) } : null),
    write: (writer, value) => writer.text(value.value),
    read: (reader) => `a=msid-semantic: ${reader.text()}`,
  },
  {
    id: 8,
    match: (line) => {
      const parts = /^m=application (\d{1,5}) UDP\/DTLS\/SCTP webrtc-datachannel$/.exec(line);
      return parts && Number(parts[1]) <= 0xffff ? { port: Number(parts[1]) } : null;
    },
    write: (writer, value) => writer.u16(value.port),
    read: (reader) => `m=application ${reader.u16()} UDP/DTLS/SCTP webrtc-datachannel`,
  },
  {
    id: 9,
    match: (line) => (line.startsWith("c=IN IP4 ") ? { address: line.slice(9) } : null),
    write: (writer, value) => {
      if (!writeAddress(writer, value.address)) throw new Error("unusable address");
    },
    read: (reader) => `c=IN IP4 ${readAddress(reader)}`,
  },
  {
    id: 10,
    match: (line) => (/^a=ice-ufrag:\S+$/.test(line) ? { value: line.slice(12) } : null),
    write: (writer, value) => writer.text(value.value),
    read: (reader) => `a=ice-ufrag:${reader.text()}`,
  },
  {
    id: 11,
    /*
     * The ICE alphabet is base64's, so a password of a base64 length travels as
     * its bytes. Anything that would not come back out character for character
     * is refused here and written out as text instead.
     */
    match: (line) => {
      const parts = /^a=ice-pwd:([A-Za-z0-9+/]{16,64})$/.exec(line);
      if (!parts || parts[1].length % 4 !== 0) return null;
      const standard = parts[1].replace(/\+/g, "-").replace(/\//g, "_");
      const bytes = bytesFromBase64Url(standard);
      if (base64UrlFromBytes(bytes) !== standard) return null;
      return { bytes };
    },
    write: (writer, value) => {
      writer.varint(value.bytes.length);
      writer.append(value.bytes);
    },
    read: (reader) => `a=ice-pwd:${base64UrlFromBytes(reader.bytes(reader.varint())).replace(/-/g, "+").replace(/_/g, "/")}`,
  },
  { id: 12, match: (line) => (line === "a=ice-options:trickle" ? {} : null), read: () => "a=ice-options:trickle" },
  {
    id: 13,
    match: (line) => {
      const parts = /^a=fingerprint:(\S+) ([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2})*)$/.exec(line);
      if (!parts) return null;
      const hex = parts[2].replace(/:/g, "");
      if (hex.length % 2 !== 0 || hex.length > 128) return null;
      const lowerCase = hex === hex.toLowerCase();
      if (!lowerCase && hex !== hex.toUpperCase()) return null;
      return { algorithm: FINGERPRINT_ALGORITHMS.indexOf(parts[1]), name: parts[1], bytes: hexToBytes(hex), lowerCase };
    },
    write: (writer, value) => {
      writer.u8(value.algorithm < 0 ? UNKNOWN : value.algorithm);
      if (value.algorithm < 0) writer.text(value.name);
      writer.u8(value.lowerCase ? 1 : 0);
      writer.varint(value.bytes.length);
      writer.append(value.bytes);
    },
    read: (reader) => {
      const algorithm = reader.u8();
      const name = algorithm === UNKNOWN ? reader.text() : FINGERPRINT_ALGORITHMS[algorithm];
      if (!name) throw new Error("malformed pairing code");
      const lowerCase = reader.u8() === 1;
      const hex = bytesToHex(reader.bytes(reader.varint()), lowerCase);
      return `a=fingerprint:${name} ${hex.replace(/(..)(?=.)/g, "$1:")}`;
    },
  },
  {
    id: 14,
    match: (line) => {
      if (!line.startsWith("a=setup:")) return null;
      const setup = SETUPS.indexOf(line.slice(8));
      return setup < 0 ? null : { setup };
    },
    write: (writer, value) => writer.u8(value.setup),
    read: (reader) => `a=setup:${SETUPS[reader.u8()]}`,
  },
  {
    id: 15,
    match: (line) => (/^a=mid:\S+$/.test(line) ? { value: line.slice(6) } : null),
    write: (writer, value) => writer.text(value.value),
    read: (reader) => `a=mid:${reader.text()}`,
  },
  {
    id: 16,
    match: (line) => {
      const parts = /^a=sctp-port:(\d{1,5})$/.exec(line);
      return parts && Number(parts[1]) <= 0xffff ? { port: Number(parts[1]) } : null;
    },
    write: (writer, value) => writer.u16(value.port),
    read: (reader) => `a=sctp-port:${reader.u16()}`,
  },
  {
    id: 17,
    match: (line) => {
      const parts = /^a=max-message-size:(\d{1,10})$/.exec(line);
      return parts && Number(parts[1]) <= 0xffffffff ? { size: Number(parts[1]) } : null;
    },
    write: (writer, value) => writer.u32(value.size),
    read: (reader) => `a=max-message-size:${reader.u32()}`,
  },
  {
    id: 18,
    match: (line) => (line.startsWith("a=candidate:") ? { line } : null),
    write: (writer, value) => {
      if (!writeCandidate(writer, value.line)) throw new Error("unusable candidate");
    },
    read: (reader) => readCandidate(reader),
  },
  { id: 19, match: (line) => (line === "a=end-of-candidates" ? {} : null), read: () => "a=end-of-candidates" },
  { id: 20, match: (line) => (line === "" ? {} : null), read: () => "" },
];

function writeLine(writer, line) {
  for (const template of LINE_TEMPLATES) {
    const value = template.match(line);
    if (!value) continue;
    if (!template.write) {
      writer.u8(template.id);
      return;
    }
    /* A template only earns its token once it has written the whole line. */
    const scratch = createWriter();
    try {
      template.write(scratch, value);
    } catch {
      break;
    }
    writer.u8(template.id);
    writer.append(scratch.finish());
    return;
  }
  writer.u8(0);
  writer.text(line);
}

function readLine(reader) {
  const id = reader.u8();
  if (id === 0) return reader.text();
  const template = LINE_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new Error("malformed pairing code");
  return template.read(reader);
}

function encodeDescription(writer, sdp) {
  const separator = SEPARATORS.find((candidate) => sdp.includes(candidate));
  if (!separator) return false;
  const lines = sdp.split(separator);
  if (lines.length > 0xffff) return false;
  writer.u8(SEPARATORS.indexOf(separator));
  writer.varint(lines.length);
  for (const line of lines) writeLine(writer, line);
  return true;
}

function decodeDescription(reader) {
  const separator = SEPARATORS[reader.u8()];
  if (!separator) throw new Error("malformed pairing code");
  const count = reader.varint();
  if (count > 0xffff) throw new Error("malformed pairing code");
  const lines = [];
  for (let index = 0; index < count; index += 1) lines.push(readLine(reader));
  return lines.join(separator);
}

export function isCompactPairingCode(value) {
  return typeof value === "string" && value.startsWith(COMPACT_PREFIX);
}

/* Every packet form the app has ever sent, so one pattern guards them all. */
export function isPairingPacketText(value) {
  return typeof value === "string" && value.length <= 24000 && /^CRL[123](?:z)?\./.test(value);
}

/*
 * Both forms describe the same session, and a hub installed before the compact
 * code existed only accepts the older one. Remembering the pair lets the same
 * session be handed to that hub in the form it understands, without the reader
 * or the peer ever having to care which form is in flight.
 */
const legacyTwins = new Map();

export function rememberLegacyPacket(compact, legacy) {
  legacyTwins.set(compact, legacy);
  if (legacyTwins.size > 64) legacyTwins.delete(legacyTwins.keys().next().value);
  return compact;
}

export function legacyPairingPacket(value) {
  return legacyTwins.get(value) || "";
}

/*
 * Returns an empty string whenever the description cannot be reproduced
 * character for character, which leaves the caller free to fall back to the
 * older encoding rather than risk sending something the browser did not say.
 */
export function encodeCompactPairingCode(packet) {
  try {
    if (packet?.v !== 1 || !["o", "a"].includes(packet.k)) return "";
    if (!/^[A-Z0-9]{6}$/.test(String(packet.c || ""))) return "";
    if (typeof packet.s !== "string" || !packet.s) return "";
    /*
     * The pairing id rides in clear text ahead of the body so the optional hub
     * can match a reply to its invitation without understanding the layout.
     */
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(packet.t || ""))) return "";
    const writer = createWriter();
    writer.u8(1);
    writer.u8(packet.k === "o" ? 0 : 1);
    writer.u32(codeToNumber(packet.c));
    if (!encodeDescription(writer, packet.s)) return "";
    const encoded = `${COMPACT_PREFIX}${packet.t}.${base64UrlFromBytes(writer.finish())}`;
    const check = decodeCompactPairingCode(encoded);
    if (check.k !== packet.k || check.c !== packet.c || check.t !== packet.t || check.s !== packet.s) return "";
    return encoded;
  } catch {
    return "";
  }
}

export function decodeCompactPairingCode(value) {
  if (!isCompactPairingCode(value)) throw new Error("This is not a CRL-App pairing code.");
  const rest = value.slice(COMPACT_PREFIX.length);
  const split = rest.indexOf(".");
  if (split <= 0) throw new Error("The pairing code is incomplete or invalid.");
  const pairingId = rest.slice(0, split);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(pairingId)) throw new Error("The pairing code is incomplete or invalid.");
  const reader = createReader(bytesFromBase64Url(rest.slice(split + 1)));
  if (reader.u8() !== 1) throw new Error("This pairing code was made by a newer app version.");
  const kind = reader.u8();
  if (kind > 1) throw new Error("The pairing code is incomplete or invalid.");
  const code = numberToCode(reader.u32());
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("The pairing code is incomplete or invalid.");
  const sdp = decodeDescription(reader);
  if (!reader.done() || !sdp.includes("v=0")) throw new Error("The pairing code is incomplete or invalid.");
  return { v: 1, k: kind === 0 ? "o" : "a", c: code, t: pairingId, s: sdp };
}
