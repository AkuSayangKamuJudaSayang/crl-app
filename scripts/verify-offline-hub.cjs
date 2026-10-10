const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { createPairingHub } = require("./offline-pairing-hub.cjs");

// Exercise the real HTTP handler without binding a port in deployment builds.
function hubTransport(hub, address = "192.168.1.2", origin = "https://crl-app-tau.vercel.app") {
  return async (value, options = {}) => {
    const url = new URL(value);
    assert.ok(["192.168.1.9", "crl-offline.local", "127.0.0.1"].includes(url.hostname), "Pairing must stay on the local network");
    const req = Readable.from([Buffer.from(options.body || "")]);
    Object.assign(req, { url: url.pathname + url.search, method: options.method || "GET", socket: { remoteAddress: address }, headers: { origin, "content-type": options.headers?.["Content-Type"] || "" } });
    let status = 200;
    const headers = {};
    let body = "";
    const res = {
      setHeader(key, value) { headers[key] = value; },
      writeHead(value, more = {}) { status = value; Object.assign(headers, more); },
      end(value = "") { body += value; },
    };
    await hub.handler(req, res);
    return new Response(body || null, { status, headers });
  };
}

async function verifyHubRoundTrip(device) {
  let time = Date.now();
  const hub = createPairingHub({ now: () => time });
  const teacher = device(true, undefined, hubTransport(hub));
  const learner = device(true, undefined, hubTransport(hub, "192.168.1.3"));
  const cameraFree = device(true, undefined, hubTransport(hub, "192.168.1.4"));
  for (const target of [teacher, learner, cameraFree]) {
    const values = new Map();
    target.context.window.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  }
  const hubAddress = "http://192.168.1.9:8787";
  await teacher("checkPairingHub", hubAddress);
  await cameraFree("checkPairingHub", hubAddress);
  for (const address of ["https://10.evil.com", "http://192.168.evil.com", "http://172.15.1.1", "https://example.com", "http://192.168.1.9/path", "http://name:password@192.168.1.9"]) {
    assert.throws(() => teacher("normalizePairingHub", address));
  }
  for (const address of ["http://10.0.0.1:8787", "https://172.31.1.9", "https://hub.local", "http://[fd00::1]:8787"]) assert.ok(teacher("normalizePairingHub", address));
  const offer = await teacher("startTeacherAssessmentPairing", "HUB234");
  const entry = await teacher("registerPairingCode", hubAddress, "HUB234", "o", offer);
  assert.match(entry.code, /^[A-Z0-9]{6}$/);
  assert.notEqual(entry.code, "HUB234");
  assert.equal(entry.expiresInMs, 900000);
  assert.equal((await teacher("registerPairingCode", hubAddress, "HUB234", "o", offer)).code, entry.code);
  const invitationUrl = teacher("shortPairingInvitation", "HUB234", "o", entry.code, hubAddress, "https://crl-app-tau.vercel.app");
  assert.ok(invitationUrl.length < 160, "Compact QR should contain a short reference");
  const invitation = await learner("readAssessmentInvitation", invitationUrl);
  assert.equal(invitation.code, "HUB234");
  assert.equal(invitation.offer, offer);
  assert.equal(learner("getPairingHub"), hubAddress, "Scanning the QR configures the learner automatically");
  await assert.rejects(learner("resolvePairingValue", entry.code, "HUB234", "a"), /not found or expired/);
  await assert.rejects(learner("resolvePairingValue", entry.code, "WRG234", "o"), /not found or expired/);
  await assert.rejects(learner("resolvePairingValue", invitationUrl, "WRG234", "o"), /different assessment/);
  await assert.rejects(learner("resolvePairingValue", invitationUrl, "HUB234", "a"), /matching teacher or learner/);
  const response = await learner("acceptLearnerAssessmentOffer", entry.code, "HUB234");
  const answerEntry = await learner("registerPairingCode", hubAddress, "HUB234", "a", response.answer);
  assert.match(answerEntry.code, /^[A-Z0-9]{6}$/);
  assert.notEqual(answerEntry.code, entry.code);
  assert.notEqual(answerEntry.code, "HUB234");
  const teacherMessages = [], learnerMessages = [];
  teacher("subscribeAssessmentPeerMessages", "HUB234", message => teacherMessages.push(message));
  learner("subscribeAssessmentPeerMessages", "HUB234", message => learnerMessages.push(message));
  await teacher("completeTeacherAssessmentPairing", "HUB234", answerEntry.code);
  assert.equal(teacher("getAssessmentPeerStatus", "HUB234").connected, true);
  teacher("publishAssessmentPeerState", "HUB234", { code: "HUB234", stage: "word", current_content: "read" });
  learner("publishAssessmentPeerControl", "HUB234", { action: "learner_ready", code: "HUB234" });
  assert.equal(learnerMessages.at(-1).session.current_content, "read");
  assert.equal(teacherMessages.at(-1).action, "learner_ready");

  // A second assessment uses manual codes for both directions with no camera.
  const manualOffer = await teacher("startTeacherAssessmentPairing", "TXT234");
  const manualEntry = await teacher("registerPairingCode", hubAddress, "TXT234", "o", manualOffer);
  const manualResponse = await cameraFree("acceptLearnerAssessmentOffer", manualEntry.code.toLowerCase(), "TXT234");
  const manualAnswer = await cameraFree("registerPairingCode", hubAddress, "TXT234", "a", manualResponse.answer);
  await teacher("completeTeacherAssessmentPairing", "TXT234", manualAnswer.code);
  assert.equal(cameraFree("getAssessmentPeerStatus", "TXT234").connected, true);

  // New compressed invitations and older plain responses retain the SAME id.
  // This also preserves the optional hub for installations that still use it.
  const zlib = require('node:zlib');
  for (const [index, prefix] of ['', 'device_', 'device_learner_'].entries()) {
    const assessment = `CMP23${index}`;
    const packet = { v: 1, k: 'o', c: assessment, t: prefix + 'abc123', s: 'v=0\r\na=unknown-extension:' + 'x'.repeat(400) + '\r\n' };
    const plain = teacher.context.encodeCompactPairingCode(packet);
    const token = `${index === 0 ? 'N' : index === 1 ? 'T' : 'L'}_abc123`;
    const compressed = `CRL3z.${token}.${zlib.deflateSync(Buffer.from(plain.split('.')[2], 'base64url')).toString('base64url')}`;
    const invitation = await teacher('registerPairingCode', hubAddress, assessment, 'o', compressed);
    assert.equal(await cameraFree('resolvePairingValue', invitation.code, assessment, 'o'), compressed);
    const reply = cameraFree.context.encodeCompactPairingCode({ ...packet, k: 'a' });
    await cameraFree('registerPairingCode', hubAddress, assessment, 'a', reply);
    assert.equal(await teacher('getHubLearnerResponse', hubAddress, assessment, invitation.code), reply);
  }
  console.log('PASS optional hub matches compressed invitations with plain responses for assessment, teacher-device and learner-device ids');
  time += 900001;
  await assert.rejects(learner("resolvePairingValue", entry.code, "HUB234", "o"), /not found or expired/);
  assert.equal(teacher("getAssessmentPeerStatus", "HUB234").connected, true, "Expired hub tokens cannot interrupt an established peer");
  assert.equal(learner("getAssessmentPeerStatus", "HUB234").connected, true);
  assert.equal((await teacher("registerPairingCode", hubAddress, "TXT234", "o", manualOffer)).expiresInMs, 900000);

  const denied = await hubTransport(hub, "192.168.1.5", "https://evil.example")(`${hubAddress}/health`);
  assert.equal(denied.status, 403);
  const preflight = await hubTransport(hub)(`${hubAddress}/pairing`, { method: "OPTIONS" });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Private-Network"), "true");
  const large = await hubTransport(hub)(`${hubAddress}/pairing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(26001) });
  assert.equal(large.status, 413);
  const invalid = await hubTransport(hub)(`${hubAddress}/pairing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(invalid.status, 400);
  const limited = hubTransport(hub, "192.168.1.99");
  for (let i = 0; i < 120; i++) assert.equal((await limited(`${hubAddress}/health`)).status, 200);
  assert.equal((await limited(`${hubAddress}/health`)).status, 429);
  const secureHub = createPairingHub({ publicAddress: "https://crl-offline.local:8787" });
  const secureFetch = hubTransport(secureHub, "192.168.1.20");
  const automaticTeacher = device(true, undefined, secureFetch);
  const iosLearner = device(true, undefined, secureFetch);
  const harmonyLearner = device(true, undefined, secureFetch);
  for (const target of [automaticTeacher, iosLearner, harmonyLearner]) {
    const values = new Map();
    target.context.window.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  }
  iosLearner.context.navigator.userAgent = "iPhone Safari";
  harmonyLearner.context.navigator.userAgent = "HarmonyOS Tablet";
  const [discovered, duplicate] = await Promise.all([automaticTeacher("discoverPairingHub"), automaticTeacher("discoverPairingHub")]);
  assert.equal(discovered, "https://crl-offline.local:8787");
  assert.equal(duplicate, discovered);
  for (const target of [iosLearner, harmonyLearner]) {
    assert.equal(await target("discoverPairingHub"), discovered);
    const code = target === iosLearner ? "IOS234" : "HAR234";
    const autoOffer = await automaticTeacher("startTeacherAssessmentPairing", code);
    const autoEntry = await automaticTeacher("registerPairingCode", discovered, code, "o", autoOffer);
    assert.equal(await automaticTeacher("getHubLearnerResponse", discovered, code, autoEntry.code), "");
    const received = await target("getHubAssessmentOffer", discovered, code);
    const prepared = await target("acceptLearnerAssessmentOffer", received, code);
    await target("registerPairingCode", discovered, code, "a", prepared.answer);
    const returned = await automaticTeacher("getHubLearnerResponse", discovered, code, autoEntry.code);
    assert.equal(returned, prepared.answer);
    await automaticTeacher("completeTeacherAssessmentPairing", code, returned);
    assert.equal(target("getAssessmentPeerStatus", code).connected, true);
  }
  await assert.rejects(automaticTeacher("getHubAssessmentOffer", discovered, "ZZZ234"), /not ready/);
  await assert.rejects(automaticTeacher("getHubLearnerResponse", discovered, "IOS234", "ZZZ234"), /not found/);
  console.log("PASS automatic HTTPS discovery and assessment-code-only pairing return responses without a camera or manual hub address (browser API doubles)");
  console.log("PASS local hub: compact QR, camera-free six-character exchange, assessment/role checks, expiry, CORS, limits and uninterrupted peer messages");
}

module.exports = { verifyHubRoundTrip };
