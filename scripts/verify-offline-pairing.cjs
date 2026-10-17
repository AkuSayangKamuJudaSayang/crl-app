const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Separate JS globals represent separate devices. The RTC double exchanges SDP
// and delivers data-channel events; no cloud API or signalling relay is present.
let peerNumber = 0;
const peers = new Map();
class Channel {
  constructor() { this.readyState = "connecting"; this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  close() { if (this.readyState === "closed") return; this.readyState = "closed"; this.listeners.get("close")?.(); this.remote?.close(); }
  send(value) {
    assert.equal(this.readyState, "open");
    if (this.blocked) return;
    this.remote.listeners.get("message")?.({ data: value });
  }
}
class Peer {
  constructor(config) {
    assert.equal(config.iceServers.length, 0);
    this.id = ++peerNumber;
    peers.set(this.id, this);
    this.listeners = new Map();
    this.iceGatheringState = "complete";
    this.connectionState = "new";
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener() {}
  close() { this.connectionState = "closed"; }
  createDataChannel(name, config) { assert.equal(name, "crl-assessment"); assert.equal(config.ordered, true); return this.channel = new Channel(); }
  async createOffer() {
    if (Peer.failNextOffer) { Peer.failNextOffer = false; throw new Error("RTC setup failed"); }
    return { type: "offer", sdp: `v=0\r\no=teacher ${this.id}\r\na=candidate:1 1 UDP 2122260223 192.168.1.2 5000 typ host\r\n` };
  }
  async createAnswer() { return { type: "answer", sdp: `v=0\r\no=learner ${this.id}\r\na=candidate:1 1 UDP 2122260223 192.168.1.3 5001 typ host\r\n` }; }
  async setLocalDescription(description) { this.localDescription = description; }
  async setRemoteDescription(description) {
    this.remoteDescription = description;
    if (description.type === "answer") {
      this.answerCalls = (this.answerCalls || 0) + 1;
      const learner = peers.get(Number(description.sdp.match(/learner (\d+)/)[1]));
      assert.equal(learner.remoteDescription.sdp, this.localDescription.sdp);
      learner.channel = new Channel();
      learner.listeners.get("datachannel")({ channel: learner.channel });
      this.channel.remote = learner.channel;
      learner.channel.remote = this.channel;
      const open = () => {
        this.channel.readyState = learner.channel.readyState = "open";
        this.channel.listeners.get("open")();
        learner.channel.listeners.get("open")();
      };
      if (Peer.deferOpen) this.openPendingChannel = open;
      else open();
    }
  }
}
// Load the actual answer-stripping helpers into each independent device context.
const storyComprehensionReady = import("../lib/storyComprehension.mjs");
let storyComprehension;
function device(compressed = true, sharedWindow, hubFetch) {
  const intervals = new Map(); let intervalId = 0;
  const context = vm.createContext({
    ...storyComprehension, console, URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array, btoa, atob,
    Blob, Response, AbortController, setTimeout, clearTimeout, ...(compressed ? { CompressionStream, DecompressionStream } : {}),
    crypto: globalThis.crypto, performance, RTCPeerConnection: Peer, PairingInflate: require("pako/lib/inflate.js").Inflate,
    navigator: { userAgent: "Test learner", platform: "Test device" },
    window: sharedWindow || { location: { origin: "https://crl.test" }, setInterval: callback => { const id = ++intervalId; intervals.set(id, callback); return id; }, clearInterval: id => intervals.delete(id), setTimeout, clearTimeout },
    fetch: hubFetch || (() => { throw new Error("QR-only pairing must not use the network"); }),
  });
  /*
   * These modules are evaluated as classic scripts, so their imports and
   * exports are stripped first. The trailing \s* (not \n) keeps that working on
   * a Windows checkout, where git materialises the tracked LF blobs as CRLF.
   */
  vm.runInContext(fs.readFileSync("lib/assessmentPairingCodec.js", "utf8").replace(/^export /gm, ""), context);
  vm.runInContext(fs.readFileSync("lib/assessmentPairingHub.js", "utf8").replace(/^import .*;\s*/gm, "").replace(/^export /gm, ""), context);
  vm.runInContext(fs.readFileSync("lib/assessmentPeer.js", "utf8").replace(/^import .*;\s*/gm, "").replace(/^export /gm, ""), context);
  vm.runInContext(fs.readFileSync("lib/assessmentInvitation.js", "utf8").replace(/^import .*;\s*/gm, "").replace(/^export /gm, ""), context);
  const call = (name, ...args) => context[name](...args);
  call.context = context;
  call.intervals = intervals;
  return call;
}
const { verifyHubRoundTrip } = require("./verify-offline-hub.cjs");
const wrap = (text) => text.match(/.{1,61}/g).join("\n ");

// Keep Node alive until all asynchronous RTC/codec checks finish. A pending
// promise alone cannot prevent an apparently successful early process exit.
const completionGuard = setTimeout(() => {
  console.error("Offline pairing verification did not complete within 60 seconds");
  process.exit(1);
}, 60000);
(async () => {
  storyComprehension = await storyComprehensionReady;
  const teacher = device();
  const learner = device();
  const priorCount = peerNumber;
  const [offer, replayed] = await Promise.all([
    teacher("startTeacherAssessmentPairing", "ABC123"),
    teacher("startTeacherAssessmentPairing", "ABC123"),
  ]);
  assert.equal(offer, replayed);
  assert.equal(peerNumber, priorCount + 1);
  assert.equal(teacher("getAssessmentPairingCodes", "ABC123").offer, offer);
  assert.equal(await teacher("startTeacherAssessmentPairing", "ABC123"), offer);
  console.log("PASS reopening connection settings and repeated effects reuse one valid teacher offer");

  const url = teacher("assessmentPairingInvitation", "ABC123", offer, "https://crl.test");
  const invitation = await learner("readAssessmentInvitation", url);
  assert.equal(invitation.code, "ABC123");
  assert.equal(invitation.offer, offer);
  const rawInvitation = await learner("readAssessmentInvitation", offer);
  assert.equal(rawInvitation.code, "ABC123");
  const qrcode = (await import("../lib/vendor/qrcode.mjs")).default;
  const jsQR = (await import("../lib/vendor/jsQR.js")).default;
  const qr = qrcode(0, "L"); qr.addData(url); qr.make();
  const scale = 5, border = 4, size = (qr.getModuleCount() + 2 * border) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor(y / scale) - border, col = Math.floor(x / scale) - border;
    const dark = row >= 0 && col >= 0 && row < qr.getModuleCount() && col < qr.getModuleCount() && qr.isDark(row, col);
    const offset = (y * size + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = dark ? 0 : 255;
    pixels[offset + 3] = 255;
  }
  assert.equal(jsQR(pixels, size, size).data, url);
  await assert.rejects(learner("readAssessmentInvitation", url.replace("code=ABC123", "code=DEF456")), /different assessment/);
  assert.equal((await learner("readAssessmentInvitation", "abc123")).offer, "");
  console.log("PASS actual generated QR decodes to the same peer offer as the text code; the first scan carries all teacher connection details");

  await assert.rejects(learner("acceptLearnerAssessmentOffer", offer, "DEF456"), /different assessment/);
  assert.equal(learner("getAssessmentPeerStatus", "ABC123").state, "idle");
  const countBeforeLearner = peerNumber;
  const [response, duplicateResponse] = await Promise.all([
    learner("acceptLearnerAssessmentOffer", wrap(offer), "ABC123"),
    learner("acceptLearnerAssessmentOffer", url, "ABC123"),
  ]);
  assert.equal(response.answer, duplicateResponse.answer);
  assert.equal(peerNumber, countBeforeLearner + 1);
  assert.equal(learner("getAssessmentPairingCodes", "ABC123").answer, response.answer);
  assert.equal(learner("getAssessmentPeerStatus", "ABC123").connected, false);
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { transform } = require("next/dist/build/swc");
  const uiSource = fs.readFileSync("components/LocalAssessmentPairing.jsx", "utf8")
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, "")
    .replace("export default function", "function") + "\nglobalThis.PairingView = LocalAssessmentPairing;";
  const ui = await transform(uiSource, { filename: "pairing-test.jsx", jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "classic" } } } });
  const notice = await transform(fs.readFileSync("components/PairingConnectedNotice.jsx", "utf8").replace("export default function", "function"), { filename: "notice-test.jsx", jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "classic" } } } });
  const dialog = await transform(fs.readFileSync("components/PairingSettingsDialog.jsx", "utf8").replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, "").replace("export default function", "function"), { filename: "pairing-dialog-test.jsx", jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "classic" } } } });
  const scannerSource = fs.readFileSync("components/AssessmentCodeScanner.jsx", "utf8")
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, "")
    .replace(/^export \{[^}]+\} from [^;]+;\s*/gm, "")
    .replace("export default function", "function");
  const scanner = await transform(scannerSource, { filename: "scanner-test.jsx", jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "classic" } } } });
  const renderPairing = (target, role, options = {}) => {
    target.pairingCallbacks = [];
    Object.assign(target.context, { React, qrcode, jsQR, useCallback: callback => { target.pairingCallbacks.push(callback); return callback; }, useEffect: React.useEffect, useId: React.useId, useMemo: React.useMemo, useRef: React.useRef, useState: React.useState });
    vm.runInContext(scanner.code, target.context);
    vm.runInContext(notice.code, target.context);
    vm.runInContext(dialog.code, target.context);
    vm.runInContext(ui.code, target.context);
    return renderToStaticMarkup(React.createElement(target.context.PairingView, { code: "ABC123", role, offline: true, ...options }));
  };
  const teacherUi = renderPairing(teacher, "teacher");
  assert.ok(teacherUi.includes('aria-label="Teacher pairing QR"'));
  assert.ok(teacherUi.includes("Teacher offline connection"));
  assert.ok(teacherUi.includes("Scan or enter a code from the other device"));
  assert.ok(teacherUi.includes("Scan learner QR"));
  assert.ok(!teacherUi.includes("Show full screen"));
  assert.ok(teacherUi.indexOf("Scan learner QR") < teacherUi.indexOf('aria-label="Learner connection code"'));
  assert.ok(teacherUi.indexOf("Scan learner QR") > teacherUi.indexOf("Copy code"));
  assert.ok(!fs.readFileSync("components/TeacherOfflineSettings.jsx", "utf8").includes("Pair a different device"));
  /*
   * Camera-free classrooms: the very string the QR encodes is also plain text
   * that can be copied off one device and pasted into the other, so no hub,
   * server or short code is needed to carry it across.
   */
  assert.ok(teacherUi.includes('aria-label="Learner connection code"'));
  assert.ok(teacherUi.includes("Copy code"));
  assert.ok(teacherUi.includes("Connect to learner"));
  assert.ok(teacherUi.includes("local-pair-long"));
  assert.ok(teacherUi.includes(offer));
  assert.ok(!teacherUi.includes("Hub address"));
  assert.ok(!teacherUi.includes("One-time offline setup"));
  /*
   * A hub-free connection carries the full pairing packet; six-character
   * assessment codes select an assessment after the devices are connected.
   */
  assert.ok(!teacherUi.includes('maxLength="6"'));
  const waitingLearnerUi = renderPairing(learner, "learner");
  assert.ok(waitingLearnerUi.includes("Learner response QR"));
  assert.ok(waitingLearnerUi.includes("Show this response to the other device"));
  // The reply travels as the same text the QR carries, ready to hand back.
  assert.ok(waitingLearnerUi.includes(response.answer));
  assert.ok(waitingLearnerUi.includes("Copy code"));
  assert.ok(!waitingLearnerUi.includes("Scan teacher QR</button>"));
  const noSetupUi = renderPairing(device(), "learner");
  assert.ok(noSetupUi.includes("Scan teacher QR"));
  assert.ok(noSetupUi.includes("Preparing the connection code…"));
  assert.ok(noSetupUi.includes('aria-label="Teacher connection code"'));
  // A camera-less learner has nothing to show yet, but must still be able to paste.
  assert.ok(noSetupUi.includes("Teacher connection code"));
  assert.ok(noSetupUi.includes("Connect to teacher"));
  assert.ok(!noSetupUi.includes("Copy code"));
  assert.ok(!noSetupUi.includes('maxLength="6"'));
  for (const online of [true, false]) {
    for (const role of ["teacher", "learner"]) {
      const setupUi = renderPairing(device(), role, { deviceOnly: true, offline: !online });
      assert.ok(setupUi.includes(role === "teacher" ? "Scan learner QR" : "Scan teacher QR"));
      assert.ok(setupUi.includes(role === "teacher" ? 'aria-label="Enter learner connection or response code"' : 'aria-label="Enter teacher connection or response code"'));
      assert.ok(setupUi.includes(role === "teacher" ? "Connect to learner" : "Connect to teacher"));
      assert.ok(!setupUi.includes('<details'), "Code entry must be visible without opening a disclosure");
    }
  }
  console.log("PASS teacher and learner settings expose scanning and visible code entry online and offline");
  const settingsLearner = device();
  const peersBeforeSettingsScan = peerNumber;
  renderPairing(settingsLearner, "learner", { deviceOnly: true });
  assert.equal(await settingsLearner.pairingCallbacks[0](offer), false, "Device-only settings must reject an assessment invitation");
  assert.equal(peerNumber, peersBeforeSettingsScan, "A rejected assessment QR must not create an assessment peer");
  assert.equal(settingsLearner("getAssessmentPeerStatus", "ABC123").state, "idle");
  console.log("PASS Offline Mode Settings rejects an assessment invitation before accepting a peer or joining a run");
  console.log("PASS both devices offer the same code as a QR and as copyable text, so no camera is required on either side");
  const teacherMessages = [], learnerMessages = [];
  teacher("subscribeAssessmentPeerMessages", "ABC123", message => teacherMessages.push(message));
  learner("subscribeAssessmentPeerMessages", "ABC123", message => learnerMessages.push(message));
  teacher("publishAssessmentPeerState", "ABC123", { code: "ABC123", stage: "waiting" });
  const resumedTeacher = device(true, teacher.context.window);
  await resumedTeacher("completeTeacherAssessmentPairing", "ABC123", wrap(response.answer));
  assert.equal(resumedTeacher("getAssessmentPeerStatus", "ABC123").connected, true);
  console.log("PASS separately loaded teacher bundles share the live invitation and accept the scanned learner response");
  assert.equal(teacher("getAssessmentPeerStatus", "ABC123").connected, true);
  assert.equal(learner("getAssessmentPeerStatus", "ABC123").connected, true);
  assert.ok(teacherMessages.some(message => message.action === "peer_joined"));
  assert.ok(learnerMessages.some(message => message.session?.stage === "waiting"));
  teacher("publishAssessmentPeerState", "ABC123", { code: "ABC123", stage: "letter", current_content: "M" });
  learner("publishAssessmentPeerControl", "ABC123", { action: "learner_ready", code: "ABC123" });
  assert.equal(learnerMessages.at(-1).session.current_content, "M");
  assert.equal(teacherMessages.at(-1).action, "learner_ready");
  await teacher("completeTeacherAssessmentPairing", "ABC123", response.answer);
  assert.equal(teacher("getAssessmentPeerStatus", "ABC123").connected, true);
  assert.equal(peers.get(priorCount + 1).answerCalls, 1);
  await assert.rejects(teacher("startTeacherAssessmentPairing", "ABC123", { restart: true }), /already connected/);
  console.log("PASS camera-free text exchange establishes the link, sends learner join and assessment messages, and duplicate answers preserve the active connection");

  // Run the production learner state handler behind the peer transport. A
  // fixed clock deliberately puts every update in the same millisecond.
  const items = await import("../lib/assessmentLearnerItems.js");
  const { selectAssessmentContentForRun } = await import("../lib/assessmentContent.js");
  const learnerSource = fs.readFileSync("app/learner/LearnerAssessmentPage.jsx", "utf8");
  const applyStart = learnerSource.indexOf("  const applyIncomingSession =");
  const applyEnd = learnerSource.indexOf("  const joinAssessment =", applyStart);
  const pool = { letters: "ABCDEFGHIJKLMNOP".split(""), words: Array.from({ length: 16 }, (_, i) => `word${i}`), stories: [] };
  const transportTeacher = device(), transportLearner = device();
  const transportOffer = await transportTeacher("startTeacherAssessmentPairing", "RUN000");
  const transportAnswer = await transportLearner("acceptLearnerAssessmentOffer", transportOffer, "RUN000");
  await transportTeacher("completeTeacherAssessmentPairing", "RUN000", transportAnswer.answer);
  vm.runInContext("Date.now = () => 1000", transportTeacher.context);
  const connectionCount = peerNumber;
  for (const [index, mode] of ["fixed", "random", "fixed", "random"].entries()) {
    const code = `RUN00${index + 1}`;
    assert.equal(await transportTeacher("claimAssessmentPeerLink", code), true);
    const content = selectAssessmentContentForRun(pool, mode, code);
    const rendered = [];
    const ref = value => ({ current: value });
    const runtime = vm.createContext({ ...items, console, Date,
      LETTERS: items.FALLBACK_LETTERS, WORDS: items.FALLBACK_WORDS,
      useCallback: callback => callback, codeInput: code,
      localSessionKeyRef: ref(`learner:${code}`), sessionRef: ref(null),
      zeroScoreRedirectingRef: ref(false), sessionEndRedirectingRef: ref(false), completionRedirectingRef: ref(false),
      lastAppliedStageRef: ref(""), lastRealtimeVersionRef: ref(9999999999999),
      itemProgressRef: ref({ code: "", stage: "", items: [], lastIndex: null }), preparationKeyRef: ref(""),
      getAssessmentWordGateKey: () => code, triggerWordPreparation() {},
      hasAssessmentPeerDelivered: value => transportLearner("hasAssessmentPeerDelivered", value),
      setSession: value => rendered.push(value), setError() {}, setConnected() {},
      persistLocalLearnerSession() {}, resetToCodeEntry() {}, showWellDoneAndReset() {},
    });
    vm.runInContext(learnerSource.slice(learnerSource.indexOf("function normalizeCode("), learnerSource.indexOf("export default function LearnerPage(")), runtime);
    vm.runInContext(learnerSource.slice(applyStart, applyEnd) + "\nglobalThis.apply = applyIncomingSession;", runtime);
    const state = (stage, itemIndex) => ({ code, learner_id: index + 406, stage, connected: true, assessment_content: content,
      current_content: content[stage === "letter" ? "letters" : "words"][itemIndex], current_item_index: itemIndex });
    const first = state("letter", 0);
    assert.equal(transportTeacher("publishAssessmentPeerState", code, first), true);
    const received = [];
    const off = transportLearner("subscribeAssessmentPeerMessages", code, message => {
      if (message.type !== "assessment_state") return;
      received.push(message);
      runtime.apply({ ...message.session, __realtimeVersion: message.version }, "peer");
    });
    assert.equal(rendered.at(-1).current_content, first.current_content, "A late listener must immediately see the latest state");
    for (const stage of ["letter", "word"]) for (let itemIndex = stage === "letter" ? 1 : 0; itemIndex < 10; itemIndex++) {
      const next = state(stage, itemIndex);
      transportTeacher("publishAssessmentPeerState", code, next);
      assert.equal(rendered.at(-1).current_content, next.current_content, `${mode} ${stage} ${itemIndex} must arrive directly`);
      const before = rendered.length;
      runtime.apply({ ...state(stage, Math.max(0, itemIndex - 1)), __realtimeVersion: 10000000000000 }, "broadcast");
      runtime.apply(state(stage, Math.max(0, itemIndex - 1)), "server");
      if (itemIndex > 0) assert.equal(rendered.length, before, "Trailing cloud and local polls cannot rewind the direct run");
    }
    for (let i = 1; i < received.length; i++) assert.ok(received[i].version > received[i - 1].version, "Rapid updates need distinct ordered versions");
    const beforeReplay = rendered.length;
    transportTeacher.context.window.__crlAssessmentPeerStoreV1.sessions.get(code).channel.send(JSON.stringify(received[0]));
    assert.equal(rendered.length, beforeReplay, "An old or duplicate peer sequence must be discarded");
    off();
    const repeated = [];
    const stop = transportLearner("subscribeAssessmentPeerMessages", code, message => repeated.push(message));
    assert.equal(repeated.length, 1);
    assert.equal(repeated[0].session.current_item_index, 9);
    stop();
  }
  assert.equal(peerNumber, connectionCount, "All learners reuse the original RTC connection");
  console.log("PASS fixed/random peer runs deliver every item with a fixed clock, replay the latest state for late listeners, reject stale polls and sequences, and reuse one connection across learners");


  // Compress only losslessly and only when the complete enterable code shrinks.
  // Keep both secure ICE/DTLS fields and all candidates, even without a hub.
  const { encodeCompactPairingCode } = await import('../lib/assessmentPairingCodec.js');
  const codecFixture = fs.readFileSync('scripts/verify-pairing-codec.mjs', 'utf8');
  const fixture = vm.createContext({ Buffer, deflateRawSync: require('node:zlib').deflateRawSync });
  vm.runInContext(codecFixture.slice(codecFixture.indexOf('const fingerprint'), codecFixture.indexOf('let shortest')) + ';globalThis.corpus = corpus', fixture);
  const noStreams = device(false);
  let reductions = [];
  for (const [label, sdp] of fixture.corpus) for (const prefix of ['', 'device_', 'device_learner_']) for (const kind of ['o', 'a']) {
    const packet = { v: 1, k: kind, c: 'ABC123', t: prefix + 'aB3dE9fGxY', s: sdp };
    const old = encodeCompactPairingCode(packet);
    const next = await teacher.context.encodePairingPacket(packet);
    assert.ok(next.length <= old.length, 'compression must never grow the code');
    for (const reader of [teacher, learner, noStreams]) {
      const result = await reader('readAssessmentPairingPacket', wrap(next));
      assert.equal(JSON.stringify(result), JSON.stringify(packet), `${label}: every security field and pairing fact survives`);
      assert.equal(JSON.stringify(await reader('readAssessmentPairingPacket', old)), JSON.stringify(packet), 'existing compact codes remain readable');
    }
    if (next.startsWith('CRL3z.')) reductions.push(1 - next.length / old.length);
  }
  assert.ok(reductions.length > 20, 'ordinary device descriptions should benefit');
  assert.ok(Math.max(...reductions) > 0.15, 'multi-candidate codes should shrink substantially');
  const zlib = require('node:zlib');
  for (const broken of ['CRL3z.N_id.!!!!', 'CRL3z.X_id.abc', 'CRL3z.L_.abc', 'CRL3z.N_id.' + zlib.deflateSync(Buffer.alloc(25000)).toString('base64url')]) {
    for (const reader of [teacher, noStreams]) await assert.rejects(reader('readAssessmentPairingPacket', broken), /pairing code/);
  }
  console.log(`PASS lossless compressed compact codes shorten ${reductions.length} browser/role fixtures by up to ${Math.round(Math.max(...reductions) * 100)}%, keep older codes readable, and refuse corrupt or oversized compressed bodies`);

  const retryTeacher = device(false), retryLearner = device(false);
  const oldOffer = await retryTeacher("startTeacherAssessmentPairing", "DEF456");
  /*
   * The compact code needs no streams API, so a browser without one still gets
   * the short code, and every older form stays readable.
   */
  assert.ok(oldOffer.startsWith("CRL3."));
  assert.equal((await retryTeacher("readAssessmentPairingPacket", oldOffer)).c, "DEF456");
  assert.equal((await retryTeacher("readAssessmentPairingPacket", `https://crl.test/learner?code=DEF456#pair=${encodeURIComponent(oldOffer)}`)).c, "DEF456");
  const compactSdp = (await retryTeacher("readAssessmentPairingPacket", oldOffer)).s;
  assert.ok(compactSdp.includes("v=0"), "the compact code rebuilds a session description");
  const twin = retryTeacher("legacyPairingPacket", oldOffer);
  assert.ok(twin.startsWith("CRL1."), "the same session is available in the form every hub reads");
  assert.ok(twin.length > oldOffer.length, "the compact code is the shorter of the two");
  const oldResponse = await retryLearner("acceptLearnerAssessmentOffer", oldOffer, "DEF456");
  const freshOffer = await retryTeacher("startTeacherAssessmentPairing", "DEF456", { restart: true });
  await assert.rejects(retryTeacher("completeTeacherAssessmentPairing", "DEF456", oldResponse.answer), /older connection/);
  const freshResponse = await retryLearner("acceptLearnerAssessmentOffer", freshOffer, "DEF456");
  await retryTeacher("completeTeacherAssessmentPairing", "DEF456", freshResponse.answer);
  assert.equal(retryTeacher("getAssessmentPeerStatus", "DEF456").connected, true);
  await assert.rejects(retryTeacher("completeTeacherAssessmentPairing", "ZZZ999", freshResponse.answer), /different assessment/);
  await assert.rejects(retryLearner("readAssessmentInvitation", freshResponse.answer), /teacher connection QR/);
  await assert.rejects(retryLearner("readAssessmentPairingPacket", "invalid"), /not a CRL-App/);
  await assert.rejects(retryLearner("readAssessmentPairingPacket", "x".repeat(25000)), /too long/);
  // Cached previous clients can still read the original uncompressed packets.
  const legacy = "CRL1." + Buffer.from(JSON.stringify({ v: 1, k: "o", c: "GHI789", s: "v=0\r\no=legacy 1\r\n" })).toString("base64url");
  assert.ok((await device(false)("acceptLearnerAssessmentOffer", legacy, "GHI789")).answer);
  const lostTeacher = device();
  await assert.rejects(lostTeacher("completeTeacherAssessmentPairing", "DEF456", freshResponse.answer), error => error.code === "PAIRING_EXPIRED");
  const routeLessTeacher = device();
  const createOffer = Peer.prototype.createOffer;
  Peer.prototype.createOffer = async () => ({ type: "offer", sdp: "v=0\r\n" });
  await assert.rejects(routeLessTeacher("startTeacherAssessmentPairing", "MNO345"), /No local network route/);
  Peer.prototype.createOffer = createOffer;
  assert.ok(await routeLessTeacher("startTeacherAssessmentPairing", "MNO345"));
  const failedTeacher = device();
  Peer.failNextOffer = true;
  await assert.rejects(failedTeacher("startTeacherAssessmentPairing", "JKL234"), /RTC setup failed/);
  assert.ok(await failedTeacher("startTeacherAssessmentPairing", "JKL234"));
  console.log("PASS expired and wrong-session codes are rejected without damaging valid links; retries and legacy packets work without compression or cloud access");

  /*
   * A hub installed before the compact code existed refuses it. The same
   * session has to reach that hub in the form it understands, or a school that
   * has not updated its hub would silently lose the six-character shortcut.
   */
  const published = [];
  const oldHub = device(true, undefined, async (target, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    if (body) published.push(body.packet);
    if (String(target).endsWith("/health")) return new Response(JSON.stringify({ service: "crl-offline-pairing", version: 1 }), { status: 200 });
    if (body && /^CRL3z?\./.test(String(body.packet))) return new Response(JSON.stringify({ error: "Invalid pairing packet." }), { status: 400 });
    return new Response(JSON.stringify({ code: "ZZZ234", expiresInMs: 900000 }), { status: 200 });
  });
  const oldHubAddress = "http://192.168.1.9:8787";
  assert.equal(await oldHub("checkPairingHub", oldHubAddress), oldHubAddress);
  const oldHubOffer = await oldHub("startTeacherAssessmentPairing", "OLD234");
  const oldHubEntry = await oldHub("registerPairingCode", oldHubAddress, "OLD234", "o", oldHubOffer);
  assert.equal(oldHubEntry.code, "ZZZ234");
  assert.equal(published.length, 2);
  assert.ok(/^CRL3z?\./.test(published[0]));
  assert.ok(published[1].startsWith("CRL1z."), "the hub that refused the compact code is offered the older form");
  assert.equal((await oldHub("readAssessmentPairingPacket", published[1])).c, "OLD234");
  console.log("PASS a hub that predates the compact code is still handed a packet it understands, with no setup from the teacher");

  /*
   * One pairing should cover a whole sitting. The teacher carries the open link
   * into the next assessment instead of asking for another code, and the
   * learner follows it. Nothing is renegotiated, so the connection count must
   * not move.
   */
  const linkTeacher = device(), linkLearner = device();
  const beforeLink = peerNumber;
  const linkOffer = await linkTeacher("startTeacherAssessmentPairing", "LNK234");
  const linkResponse = await linkLearner("acceptLearnerAssessmentOffer", linkOffer, "LNK234");
  await linkTeacher("completeTeacherAssessmentPairing", "LNK234", linkResponse.answer);
  assert.equal(peerNumber, beforeLink + 2, "a pairing opens one connection per device");
  const linkEvents = [];
  linkLearner("subscribeAssessmentLink", (event) => linkEvents.push(event));
  const carried = [];
  linkLearner("subscribeAssessmentPeerMessages", "NXT234", (message) => carried.push(message));
  linkLearner("subscribeAssessmentPeerMessages", "TRD234", (message) => carried.push(message));
  assert.equal(linkTeacher("findLinkedAssessmentPeerSession", "teacher").code, "LNK234");
  assert.equal(await linkTeacher("claimAssessmentPeerLink", "NXT234"), true);
  assert.equal(peerNumber, beforeLink + 2, "the next assessment must not open a second connection");
  assert.equal(linkTeacher("getAssessmentPeerStatus", "NXT234").connected, true);
  assert.equal(linkLearner("getAssessmentPeerStatus", "NXT234").connected, true);
  assert.equal(linkTeacher("getAssessmentPeerStatus", "LNK234").connected, false);
  assert.equal(linkLearner("getAssessmentPeerStatus", "LNK234").connected, false);
  assert.deepEqual(linkEvents.map((event) => `${event.type}:${event.from}:${event.code}`), ["link_rekey:LNK234:NXT234"]);
  assert.equal(linkTeacher("publishAssessmentPeerState", "NXT234", { code: "NXT234", stage: "letter", current_content: "M" }), true);
  assert.equal(carried.at(-1).session.current_content, "M");
  // The same link carries the assessment after that, and refuses a stale code.
  assert.equal(await linkTeacher("claimAssessmentPeerLink", "NXT234"), false);
  assert.equal(await linkTeacher("claimAssessmentPeerLink", "TRD234"), true);
  assert.equal(linkLearner("getAssessmentPeerStatus", "TRD234").connected, true);
  assert.equal(linkTeacher("publishAssessmentPeerState", "TRD234", { code: "TRD234", stage: "word", current_content: "read" }), true);
  assert.equal(carried.at(-1).session.current_content, "read");
  await linkTeacher("startTeacherAssessmentPairing", "OWN234");
  assert.equal(linkTeacher("rekeyAssessmentPeerSession", "TRD234", "OWN234"), false, "a link must never take over a code another assessment owns");
  assert.equal(linkTeacher("rekeyAssessmentPeerSession", "TRD234", "SHORT"), false);
  /*
   * A code left over from an abandoned attempt in the same sitting must not
   * block the link: the stale session is cleared and the link still moves.
   */
  await linkTeacher("startTeacherAssessmentPairing", "STL234");
  assert.equal(linkTeacher("getAssessmentPeerStatus", "STL234").connected, false);
  assert.equal(await linkTeacher("claimAssessmentPeerLink", "STL234"), true);
  assert.equal(linkLearner("getAssessmentPeerStatus", "STL234").connected, true);
  assert.equal(linkTeacher("getAssessmentPeerStatus", "TRD234").connected, false);
  console.log("PASS one pairing carries the same link through several assessments without another code");

  /*
   * A claim nobody answers must leave both ends exactly where they were: a
   * learner device that has been closed, or is on a stale connection, must
   * never quietly become the device for the next assessment.
   */
  const deafTeacher = device(), deafLearner = device();
  const deafOffer = await deafTeacher("startTeacherAssessmentPairing", "DEF234");
  const deafResponse = await deafLearner("acceptLearnerAssessmentOffer", deafOffer, "DEF234");
  await deafTeacher("completeTeacherAssessmentPairing", "DEF234", deafResponse.answer);
  deafLearner.context.window.__crlAssessmentPeerStoreV1.sessions.get("DEF234").channel.listeners.clear();
  assert.equal(await deafTeacher("claimAssessmentPeerLink", "GHI234", { timeoutMs: 30 }), false);
  assert.equal(deafTeacher("getAssessmentPeerStatus", "DEF234").connected, true, "an unanswered claim must leave the link alone");
  assert.equal(deafTeacher("getAssessmentPeerStatus", "GHI234").connected, false);
  assert.equal(deafLearner("getAssessmentPeerStatus", "DEF234").connected, true);
  assert.equal(await deafTeacher("findLinkedAssessmentPeerSession", "learner"), null, "only a teacher claims a link");
  console.log("PASS an unanswered claim changes nothing on either device");

  const reverseTeacher = device(), reverseLearner = device();
  const learnerSetupCode = reverseLearner("getTeacherDevicePairingCode", "learner");
  const learnerSetupOffer = await reverseLearner("startLearnerDevicePairing", learnerSetupCode);
  assert.ok((await reverseTeacher("readAssessmentPairingPacket", learnerSetupOffer)).t.startsWith("device_learner_"));
  await assert.rejects(reverseLearner("acceptLearnerAssessmentOffer", learnerSetupOffer, ""), /same device role/);
  const teacherReply = await reverseTeacher("acceptTeacherDeviceOffer", learnerSetupOffer);
  const setupTraffic = [];
  reverseTeacher("subscribeAssessmentPeerMessages", learnerSetupCode, message => setupTraffic.push(message));
  reverseLearner("subscribeAssessmentPeerMessages", learnerSetupCode, message => setupTraffic.push(message));
  await reverseLearner("completeLearnerDevicePairing", learnerSetupCode, teacherReply.answer);
  for (const side of [reverseTeacher, reverseLearner]) {
    assert.equal(side("getAssessmentPeerStatus", learnerSetupCode).connected, true);
    assert.equal(side("getAssessmentPeerStatus", learnerSetupCode).deviceOnly, true);
  }
  assert.equal(setupTraffic.length, 0, "Learner-first pairing must not start or join any assessment");
  assert.notEqual(reverseTeacher("getTeacherDevicePairingCode"), learnerSetupCode, "The teacher keeps its own device identity after accepting a learner invitation");
  const reverseCount = peerNumber;
  assert.equal(await reverseTeacher("claimAssessmentPeerLink", "REV234"), true);
  const reverseStates = [];
  reverseLearner("subscribeAssessmentPeerMessages", "REV234", message => reverseStates.push(message));
  reverseTeacher("publishAssessmentPeerState", "REV234", { code: "REV234", learner_id: 408, stage: "letter", current_content: "A" });
  assert.equal(reverseStates.at(-1).session.learner_id, 408);
  assert.equal(peerNumber, reverseCount);
  console.log("PASS learner-first invitations connect both device roles without an assessment join and retain the link until a teacher-confirmed learner assessment");

  // Reproduce the recording on both sides: each device already has its own
  // invitation when the other device's invitation is pasted or scanned.
  const crossedTeacher = device(), crossedLearner = device();
  const teacherOwnCode = crossedTeacher("getTeacherDevicePairingCode");
  const learnerOwnCode = crossedLearner("getTeacherDevicePairingCode", "learner");
  const teacherOwnOffer = await crossedTeacher("startTeacherAssessmentPairing", teacherOwnCode, { deviceOnly: true });
  const learnerOwnOffer = await crossedLearner("startLearnerDevicePairing", learnerOwnCode);
  const mountPairing = (target, role, options = {}) => {
    const slots = [], effects = []; let slot = 0, effectSlot = 0, pending = [], dirty = false;
    const props = { role, deviceOnly: true, offline: true, ...options.props };
    Object.assign(target.context, { React, qrcode, AssessmentCodeScanner: () => null,
      useState(initial) {
        const index = slot++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
        return [slots[index], value => { const next = typeof value === "function" ? value(slots[index]) : value; if (!Object.is(next, slots[index])) dirty = true; slots[index] = next; }];
      },
      useRef(initial) { const index = slot++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
      useMemo: callback => callback(), useCallback: callback => callback,
      useEffect(callback, deps) {
        if (!options.effects) return;
        const index = effectSlot++, previous = effects[index];
        if (previous && deps && deps.every((value, i) => Object.is(value, previous.deps?.[i]))) return;
        pending.push(() => { previous?.cleanup?.(); effects[index] = { deps, cleanup: callback() }; });
      },
    });
    vm.runInContext(ui.code, target.context);
    vm.runInContext(notice.code, target.context);
    vm.runInContext(dialog.code, target.context);
    const walk = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(walk) : [tree, ...walk(tree.props?.children)];
    const view = { nodes: [] };
    view.render = updates => {
      Object.assign(props, updates); slot = 0; effectSlot = 0; pending = []; dirty = false;
      view.nodes = walk(target.context.PairingView(props));
      for (const effect of pending) effect();
    };
    view.flush = async () => { for (let i = 0; i < 30; i++) { await new Promise(setImmediate); if (!dirty) return; view.render(); } throw new Error("Pairing effects did not settle"); };
    view.unmount = () => { for (const effect of effects) effect?.cleanup?.(); };
    view.field = label => view.nodes.find(node => node.type === "textarea" && node.props["aria-label"] === label);
    view.button = label => view.nodes.find(node => node.type === "button" && node.props.children === label);
    view.dialog = () => view.nodes.find(node => node.type?.name === "PairingSettingsDialog");
    view.showCode = label => { view.button(label).props.onClick(); view.render(); };
    view.closeCode = () => { view.dialog().props.onClose(); view.render(); };
    view.render(); return view;
  };
  const teacherView = mountPairing(crossedTeacher, "teacher");
  const learnerView = mountPairing(crossedLearner, "learner");
  assert.equal(teacherView.field("Teacher connection code"), undefined);
  assert.equal(learnerView.field("Learner connection code"), undefined);
  assert.equal(teacherView.nodes.some(node => node.props?.dangerouslySetInnerHTML), false, "The main settings must not display the device QR");
  teacherView.showCode("Show my QR and connection code");
  assert.equal(teacherView.field("Teacher connection code").props.value, teacherOwnOffer);
  teacherView.closeCode();
  learnerView.showCode("Show my QR and connection code");
  assert.equal(learnerView.field("Learner connection code").props.value, learnerOwnOffer);
  learnerView.closeCode();
  const beforeInvalid = peerNumber;
  assert.equal(await teacherView.nodes.find(node => node.props?.mode === "pairing").props.onScan(teacherOwnOffer), false);
  teacherView.render();
  teacherView.showCode("Show my QR and connection code");
  assert.equal(teacherView.field("Teacher connection code").props.value, teacherOwnOffer);
  teacherView.closeCode();
  assert.equal(peerNumber, beforeInvalid, "Wrong-role invitations cannot replace a valid local invitation");
  teacherView.field("Enter learner connection or response code").props.onChange({ target: { value: wrap(learnerOwnOffer) } });
  teacherView.render(); teacherView.button("Connect to learner").props.onClick();
  for (let attempt = 0; attempt < 100 && !crossedTeacher("getDevicePairingState", "teacher").answer; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  await new Promise(resolve => setImmediate(resolve)); teacherView.render();
  const teacherReplyToLearner = crossedTeacher("getDevicePairingState", "teacher").answer;
  assert.ok(teacherReplyToLearner);
  assert.equal(teacherView.field("Teacher connection code"), undefined);
  assert.equal(teacherView.field("Teacher response code").props.value, teacherReplyToLearner);
  assert.equal(teacherView.button("Show my QR and connection code"), undefined);
  assert.equal(teacherView.button("Show response QR and code"), undefined);
  assert.equal(teacherView.field("Enter learner connection or response code"), undefined);
  assert.ok(teacherView.nodes.some(node => node.type === "h4" && node.props.children === "Finish connection"));
  assert.ok(teacherView.nodes.some(node => Array.isArray(node.props?.children) && node.props.children.includes("Learner code received. Finish connection below.")));
  assert.equal(teacherView.nodes.some(node => node.type?.name === "PairingConnectedNotice"), false, "Receiving an invitation is not a successful connection");
  teacherView.button("Back").props.onClick(); teacherView.render();
  assert.equal(teacherView.field("Enter learner connection or response code"), undefined);
  assert.ok(teacherView.button("Confirm"));
  assert.equal(teacherView.dialog(), undefined, "Back confirmation is inline, not another overlay");
  teacherView.button("Cancel").props.onClick(); teacherView.render();
  assert.equal(teacherView.field("Teacher response code").props.value, teacherReplyToLearner);
  assert.equal(crossedTeacher("getTeacherDevicePairingCode"), teacherOwnCode);
  assert.equal(crossedTeacher("getAssessmentPairingCodes", teacherOwnCode).offer, teacherOwnOffer);
  // The QR callback uses the exact same handler as manual entry.
  await learnerView.nodes.find(node => node.props?.mode === "pairing").props.onScan(teacherOwnOffer);
  for (let attempt = 0; attempt < 100 && !crossedLearner("getDevicePairingState", "learner").answer; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  await new Promise(resolve => setImmediate(resolve)); learnerView.render();
  const learnerReplyToTeacher = crossedLearner("getDevicePairingState", "learner").answer;
  assert.ok(learnerReplyToTeacher);
  assert.equal(learnerView.field("Learner connection code"), undefined);
  assert.equal(learnerView.field("Learner response code").props.value, learnerReplyToTeacher);
  assert.equal(learnerView.button("Show my QR and connection code"), undefined);
  assert.equal(learnerView.button("Show response QR and code"), undefined);
  assert.equal(learnerView.field("Enter teacher connection or response code"), undefined);
  assert.ok(learnerView.nodes.some(node => Array.isArray(node.props?.children) && node.props.children.includes("Teacher code received. Finish connection below.")));
  assert.equal(learnerView.nodes.some(node => node.type?.name === "PairingConnectedNotice"), false);
  learnerView.button("Back").props.onClick(); learnerView.render();
  assert.ok(learnerView.button("Confirm"));
  learnerView.button("Cancel").props.onClick(); learnerView.render();
  assert.equal(learnerView.field("Learner response code").props.value, learnerReplyToTeacher);
  const teacherReopened = renderPairing(crossedTeacher, "teacher", { deviceOnly: true, code: learnerOwnCode });
  const learnerReopened = renderPairing(crossedLearner, "learner", { deviceOnly: true, code: teacherOwnCode });
  assert.ok(!teacherReopened.includes(teacherOwnOffer) && teacherReopened.includes(teacherReplyToLearner));
  assert.ok(!learnerReopened.includes(learnerOwnOffer) && learnerReopened.includes(learnerReplyToTeacher));
  assert.ok(teacherReopened.includes("Finish connection") && learnerReopened.includes("Finish connection"));
  assert.equal(await crossedTeacher.pairingCallbacks[1](wrap(learnerReplyToTeacher)), true);
  assert.equal(await crossedLearner.pairingCallbacks[0](wrap(teacherReplyToLearner)), true);
  for (const [side, role, expected] of [[crossedTeacher, "teacher", "Learner device"], [crossedLearner, "learner", "Teacher device"]]) {
    const connectedUi = renderPairing(side, role, { deviceOnly: true });
    assert.ok(connectedUi.includes(`${expected} successfully connected`));
    assert.ok(connectedUi.includes('aria-live="polite"'));
    assert.ok(!connectedUi.includes('role="alertdialog"'));
    assert.ok(!connectedUi.includes("Finish connection</summary>"));
    assert.ok(!connectedUi.includes('aria-label="Learner connection code"') && !connectedUi.includes('aria-label="Teacher connection code"'));
    assert.ok(connectedUi.indexOf("successfully connected") > connectedUi.indexOf("Devices connected"), "The green prompt belongs at the bottom of the pairing overlay");
  }
  for (const side of [crossedTeacher, crossedLearner]) assert.equal(side("findLinkedAssessmentPeerSession").code, teacherOwnCode);
  const crossedPeerCount = peerNumber;
  assert.equal(await crossedTeacher("claimAssessmentPeerLink", "CRS234"), true);
  for (const [side, role] of [[crossedTeacher, "teacher"], [crossedLearner, "learner"]]) {
    assert.equal(side("findLinkedAssessmentPeerSession", role).code, "CRS234");
    assert.equal(side("getTeacherDevicePairingCode", role), role === "teacher" ? teacherOwnCode : learnerOwnCode);
    const live = [...side.context.window.__crlAssessmentPeerStoreV1.sessions.values()].filter(session => !session.closing && session.channel?.readyState === "open");
    assert.equal(live.length, 1);
  }
  const crossedStates = [], crossedControls = [];
  crossedLearner("subscribeAssessmentPeerMessages", "CRS234", message => crossedStates.push(message));
  crossedTeacher("subscribeAssessmentPeerMessages", "CRS234", message => crossedControls.push(message));
  for (const stage of ["letter", "word", "passage", "comprehension", "completed"]) crossedTeacher("publishAssessmentPeerState", "CRS234", { code: "CRS234", learner_id: 409, stage, current_content: stage });
  crossedLearner("publishAssessmentPeerControl", "CRS234", { code: "CRS234", action: "learner_ready" });
  assert.deepEqual(crossedStates.map(message => message.session.stage), ["letter", "word", "passage", "comprehension", "completed"]);
  assert.equal(crossedControls.at(-1).action, "learner_ready"); assert.equal(peerNumber, crossedPeerCount);
  console.log("PASS both devices reveal only the full response at Finish connection, preserve invitations when Back is canceled; only confirmed channels show green success");
  console.log("PASS crossed invitations select the same live link, retire spare setup peers at confirmed handoff and carry every assessment stage without internet");

  // Exercise the actual Back controls in both apps, including a response
  // completing while confirmation is open. No browser storage is reset.
  for (const role of ["teacher", "learner"]) {
    for (const finishDuringConfirmation of [false, true]) {
      const side = device(), partner = device(), stalePartner = device();
      const otherRole = role === "teacher" ? "learner" : "teacher";
      const oldCode = side("getTeacherDevicePairingCode", role);
      const oldOffer = await (role === "teacher"
        ? side("startTeacherAssessmentPairing", oldCode, { deviceOnly: true })
        : side("startLearnerDevicePairing", oldCode));
      const view = mountPairing(side, role, { effects: true });
      await view.flush();
      const staleReply = await (role === "teacher"
        ? stalePartner("acceptLearnerAssessmentOffer", oldOffer, "")
        : stalePartner("acceptTeacherDeviceOffer", oldOffer));
      const partnerCode = partner("getTeacherDevicePairingCode", otherRole);
      const invitation = await (otherRole === "teacher"
        ? partner("startTeacherAssessmentPairing", partnerCode, { deviceOnly: true })
        : partner("startLearnerDevicePairing", partnerCode));
      view.field(`Enter ${otherRole} connection or response code`).props.onChange({ target: { value: invitation } });
      view.render();
      view.button(role === "teacher" ? "Connect to learner" : "Connect to teacher").props.onClick();
      for (let attempt = 0; attempt < 100 && !side("getDevicePairingState", role).answer; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
      await view.flush();
      const response = side("getDevicePairingState", role).answer;
      assert.ok(response);
      const pendingSession = side.context.window.__crlAssessmentPeerStoreV1.sessions.get(partnerCode);
      view.button("Back").props.onClick(); view.render(); await view.flush();
      const back = view.button("Back");
      assert.equal(back.props["aria-expanded"], true);
      const prompt = view.nodes.find(node => node.props?.id === back.props["aria-controls"]);
      assert.equal(prompt.props.role, "group");
      assert.equal(view.dialog(), undefined);
      assert.equal(side("getDevicePairingState", role).answer, response);
      let prevented = false, stopped = false;
      prompt.props.onKeyDown({ key: "Escape", preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
      view.render();
      assert.ok(prevented && stopped, "Escape cancels only the inline prompt");
      assert.equal(view.button("Confirm"), undefined);
      assert.equal(side("getDevicePairingState", role).answer, response);
      view.button("Back").props.onClick(); view.render();
      view.button("Cancel").props.onClick(); view.render();
      assert.equal(side("getTeacherDevicePairingCode", role), oldCode);
      assert.equal(side("getDevicePairingState", role).answer, response);
      assert.equal(pendingSession.closing, false);
      view.button("Back").props.onClick(); view.render();
      const confirm = view.button("Confirm").props.onClick;
      if (finishDuringConfirmation) {
        await partner(otherRole === "teacher" ? "completeTeacherAssessmentPairing" : "completeLearnerDevicePairing", partnerCode, response);
        confirm(); await view.flush();
        assert.equal(side("getTeacherDevicePairingCode", role), oldCode);
        assert.equal(side("getAssessmentPeerStatus", partnerCode).connected, true);
        assert.equal(pendingSession.closing, false, "A stale Back confirmation must preserve a newly connected peer");
        assert.equal(view.button("Confirm"), undefined);
        assert.ok(view.button("Disconnect device"));
      } else {
        confirm(); view.render(); await view.flush();
        const freshCode = side("getTeacherDevicePairingCode", role);
        assert.ok(side.context.window.__crlAssessmentPeerStoreV1.sessions.has(freshCode), "The settings effect starts the new invitation without another action");
        await (role === "teacher" ? side("startTeacherAssessmentPairing", freshCode, { deviceOnly: true }) : side("startLearnerDevicePairing", freshCode));
        await view.flush();
        const fresh = side("getDevicePairingState", role);
        assert.notEqual(fresh.code, oldCode);
        assert.ok(fresh.offer && fresh.offer !== oldOffer, "Reset prepares a fresh invitation automatically");
        assert.equal(fresh.answer, "");
        assert.equal(pendingSession.closing, true);
        assert.equal(view.field(`Enter ${otherRole} connection or response code`).props.value, "");
        assert.equal(view.button("Back"), undefined);
        assert.equal(view.button("Confirm"), undefined);
        assert.equal(view.field(`${role === "teacher" ? "Teacher" : "Learner"} response code`), undefined);
        await assert.rejects(side(role === "teacher" ? "completeTeacherAssessmentPairing" : "completeLearnerDevicePairing", oldCode, staleReply.answer));
        const newPartner = device();
        const freshReply = await (role === "teacher"
          ? newPartner("acceptLearnerAssessmentOffer", fresh.offer, "")
          : newPartner("acceptTeacherDeviceOffer", fresh.offer));
        await side(role === "teacher" ? "completeTeacherAssessmentPairing" : "completeLearnerDevicePairing", fresh.code, freshReply.answer);
        await view.flush();
        assert.equal(side("getAssessmentPeerStatus", fresh.code).connected, true);
      }
      view.unmount();
    }
  }
  console.log("PASS Back on both devices confirms inline; Cancel/Escape preserve progress, Confirm rotates pending codes and rejects stale responses, and a racing successful connection is retained");

  // A valid SDP answer can precede a usable channel. Neither app may announce
  // success during that gap, or continue announcing it after a disconnection.
  for (const initiatingRole of ["teacher", "learner"]) {
    const initiator = device(), responder = device();
    const respondingRole = initiatingRole === "teacher" ? "learner" : "teacher";
    const own = initiator("getTeacherDevicePairingCode", initiatingRole);
    const invitation = await (initiatingRole === "teacher"
      ? initiator("startTeacherAssessmentPairing", own, { deviceOnly: true })
      : initiator("startLearnerDevicePairing", own));
    const reply = await (respondingRole === "teacher"
      ? responder("acceptTeacherDeviceOffer", invitation)
      : responder("acceptLearnerAssessmentOffer", invitation, ""));
    const receivingSession = responder.context.window.__crlAssessmentPeerStoreV1.sessions.get(own);
    receivingSession.peer.connectionState = "connecting";
    receivingSession.peer.listeners.get("connectionstatechange")();
    const replyUi = renderPairing(responder, respondingRole, { deviceOnly: true });
    assert.ok(replyUi.includes("code received. Finish connection below."), "Local ICE checking must not imply the other device has received the response");
    assert.ok(!replyUi.includes("Response accepted."));
    Peer.deferOpen = true;
    try {
      await initiator(initiatingRole === "teacher" ? "completeTeacherAssessmentPairing" : "completeLearnerDevicePairing", own, reply.answer);
    } finally { Peer.deferOpen = false; }
    const waitingUi = renderPairing(initiator, initiatingRole, { deviceOnly: true });
    assert.ok(waitingUi.includes(`Response accepted. Connecting to the ${respondingRole}…`));
    for (const [side, role] of [[initiator, initiatingRole], [responder, respondingRole]]) {
      assert.ok(!renderPairing(side, role, { deviceOnly: true }).includes("successfully connected"));
    }
    const session = initiator.context.window.__crlAssessmentPeerStoreV1.sessions.get(own);
    session.peer.openPendingChannel();
    for (const [side, role] of [[initiator, initiatingRole], [responder, respondingRole]]) {
      assert.ok(renderPairing(side, role, { deviceOnly: true }).includes("successfully connected"));
    }
    session.channel.close();
    for (const [side, role] of [[initiator, initiatingRole], [responder, respondingRole]]) {
      assert.ok(!renderPairing(side, role, { deviceOnly: true }).includes("successfully connected"));
    }
  }
  console.log("PASS teacher-first and learner-first delayed channels show connecting until open and remove success on disconnection");

  for (const learnerFirst of [false, true]) {
    const host = device(), guest = device();
    const initiating = learnerFirst ? guest : host;
    const setupCode = initiating("getTeacherDevicePairingCode", learnerFirst ? "learner" : "teacher");
    const invitation = await (learnerFirst ? guest("startLearnerDevicePairing", setupCode) : host("startTeacherAssessmentPairing", setupCode, { deviceOnly: true }));
    const response = await (learnerFirst ? host("acceptTeacherDeviceOffer", invitation) : guest("acceptLearnerAssessmentOffer", invitation, ""));
    let hostNotices = 0, guestNotices = 0;
    const hostView = mountPairing(host, "teacher", { effects: true, props: { offline: false, onPeerConnected: () => hostNotices++ } });
    const guestView = mountPairing(guest, "learner", { effects: true, props: { offline: false, onPeerConnected: () => guestNotices++ } });
    await (learnerFirst ? guest("completeLearnerDevicePairing", setupCode, response.answer) : host("completeTeacherAssessmentPairing", setupCode, response.answer));
    await hostView.flush(); await guestView.flush();
    assert.equal(hostNotices, 1); assert.equal(guestNotices, 1);
    const setupSessions = [host, guest].map(side => side.context.window.__crlAssessmentPeerStoreV1.sessions.get(setupCode));
    const countBeforeOutage = peerNumber;
    for (const [side, view] of [[host, hostView], [guest, guestView]]) {
      side.context.navigator.onLine = false;
      view.render({ offline: true }); await view.flush();
      assert.equal(side("getAssessmentPeerStatus", setupCode).connected, true, "Internet status alone must not disconnect the local channel");
    }
    assert.equal(peerNumber, countBeforeOutage);
    for (const [side, view, role] of [[host, hostView, "teacher"], [guest, guestView, "learner"]]) {
      const setup = side.context.window.__crlAssessmentPeerStoreV1.sessions.get(setupCode);
      setup.peer.connectionState = "failed"; setup.peer.listeners.get("connectionstatechange")();
      await view.flush();
      assert.equal(setup.closing, false);
      assert.equal(side("getDevicePairingState", role).peerCode, setupCode);
      assert.equal(view.button("Show my QR and connection code"), undefined);
      setup.channel.listeners.get("message")({ data: JSON.stringify({ type: "peer_pong", id: "not-an-outstanding-ping" }) });
      assert.equal(side("getAssessmentPeerStatus", setupCode).connected, false, "An unsolicited pong cannot announce recovery");
    }
    for (const side of [host, guest]) for (const tick of side.intervals.values()) tick();
    await hostView.flush(); await guestView.flush();
    assert.equal(hostNotices, 1); assert.equal(guestNotices, 1);
    // Keep both settings mounted across a confirmed assessment handoff.
    assert.equal(await host("claimAssessmentPeerLink", "NET234"), true);
    await hostView.flush(); await guestView.flush();
    const received = [];
    guest("subscribeAssessmentPeerMessages", "NET234", message => received.push(message));
    host("publishAssessmentPeerState", "NET234", { code: "NET234", learner_id: 420, stage: "letter", current_content: "A" });
    for (const session of setupSessions) session.channel.blocked = true;
    for (const [side, view, role] of [[host, hostView, "teacher"], [guest, guestView, "learner"]]) {
      const retained = side.context.window.__crlAssessmentPeerStoreV1.sessions.get("NET234");
      for (const state of ["disconnected", "failed", "connecting"]) {
        retained.peer.connectionState = state; retained.peer.listeners.get("connectionstatechange")();
        await view.flush();
        assert.equal(retained.closing, false, "Transient RTC states cannot close an established open data channel");
        assert.equal(side("getDevicePairingState", role).peerCode, "NET234", "Recovery must retain the assessment transport, not switch to a setup invite");
        assert.equal(side("getDevicePairingState", role).retained, true);
        assert.equal(view.button("Show my QR and connection code"), undefined);
        assert.ok(view.button("Disconnect device"));
        assert.equal(view.nodes.some(node => node.type?.name === "PairingConnectedNotice"), false, "An unconfirmed recovery cannot show success");
      }
      await assert.rejects(side(role === "teacher" ? "startTeacherAssessmentPairing" : "startLearnerDevicePairing", side("getTeacherDevicePairingCode", role), { restart: true, deviceOnly: true }), /already paired|already connected/);
    }
    host("publishAssessmentPeerState", "NET234", { code: "NET234", learner_id: 420, stage: "word", current_content: "read" });
    assert.equal(received.at(-1).session.stage, "letter");
    assert.equal(peerNumber, countBeforeOutage, "Mounted settings and network changes cannot allocate replacement peers");
    for (const session of setupSessions) session.channel.blocked = false;
    // A fresh matched heartbeat restores the retained channel even before a
    // browser delivers its next connectionstatechange event.
    for (const side of [host, guest]) for (const tick of side.intervals.values()) tick();
    await hostView.flush(); await guestView.flush();
    for (const [side, role] of [[host, "teacher"], [guest, "learner"]]) {
      assert.equal(side("findLinkedAssessmentPeerSession", role).code, "NET234");
      assert.equal(side("getAssessmentPeerStatus", "NET234").connected, true);
    }
    assert.equal(received.at(-1).session.current_content, "read", "Recovery must replay the latest teacher state lost during the interruption");
    assert.equal(hostNotices, 1); assert.equal(guestNotices, 1, "Recovery must not repeat the learner-join callback and reset its screen");
    for (const stage of ["passage", "comprehension", "completed"]) host("publishAssessmentPeerState", "NET234", { code: "NET234", learner_id: 420, stage });
    assert.equal(received.at(-1).session.stage, "completed");
    for (const [side, view] of [[host, hostView], [guest, guestView]]) {
      side.context.navigator.onLine = true; view.render({ offline: false }); await view.flush();
    }
    assert.equal(peerNumber, countBeforeOutage);
    hostView.unmount(); guestView.unmount();
  }
  console.log("PASS mounted teacher/learner settings preserve both pairing orders through internet loss, RTC disconnection/failure, assessment handoff, matched-heartbeat recovery and return online without new peers or duplicate joins; latest state replays");

  for (const disconnectingRole of ["teacher", "learner"]) {
    const host = device(), guest = device();
    const oldCode = host("getTeacherDevicePairingCode", "teacher");
    const oldInvitation = await host("startTeacherAssessmentPairing", oldCode, { deviceOnly: true });
    const guestOwn = guest("getTeacherDevicePairingCode", "learner");
    await guest("startLearnerDevicePairing", guestOwn);
    const reply = await guest("acceptLearnerAssessmentOffer", oldInvitation, "");
    await host("completeTeacherAssessmentPairing", oldCode, reply.answer);
    assert.equal(await host("claimAssessmentPeerLink", "RST234"), true);
    host("publishAssessmentPeerState", "RST234", { code: "RST234", learner_id: 412, stage: "word", current_content: "read" });
    const side = disconnectingRole === "teacher" ? host : guest;
    const otherRole = disconnectingRole === "teacher" ? "learner" : "teacher";
    const ownBefore = side("getTeacherDevicePairingCode", disconnectingRole);
    // A second role in the same browser must not be reset. Neither persisted
    // records nor pending sync work is owned by the transport reset action.
    const preservedCode = side("getTeacherDevicePairingCode", otherRole);
    const preservedOffer = await (otherRole === "teacher"
      ? side("startTeacherAssessmentPairing", preservedCode, { deviceOnly: true })
      : side("startLearnerDevicePairing", preservedCode));
    Object.assign(side.context.window, {
      localStorage: { getItem() { throw new Error("Pairing reset must not read persisted assessment data"); }, setItem() { throw new Error("Pairing reset must not change persisted assessment data"); }, removeItem() { throw new Error("Pairing reset must not remove persisted assessment data"); }, clear() { throw new Error("Pairing reset must not clear persisted assessment data"); } },
      indexedDB: { open() { throw new Error("Pairing reset must not touch the assessment database"); }, deleteDatabase() { throw new Error("Pairing reset must not delete the assessment database"); } },
    });
    const mounted = mountPairing(side, disconnectingRole);
    assert.ok(mounted.button("Disconnect device"));
    assert.equal(mounted.dialog(), undefined);
    mounted.button("Disconnect device").props.onClick(); mounted.render();
    assert.equal(mounted.dialog().props.title, "Disconnect device?");
    assert.ok(mounted.dialog().props.description.includes("assessment using this offline link will be interrupted"));
    assert.ok(mounted.dialog().props.description.includes("Saved assessments and pending sync items will stay"));
    assert.equal(side("findLinkedAssessmentPeerSession", disconnectingRole).code, "RST234", "Opening confirmation must keep the assessment link alive");
    mounted.button("Cancel").props.onClick(); mounted.render();
    assert.equal(side("findLinkedAssessmentPeerSession", disconnectingRole).code, "RST234");
    assert.equal(side("getTeacherDevicePairingCode", disconnectingRole), ownBefore);
    mounted.button("Disconnect device").props.onClick(); mounted.render();
    mounted.button("Disconnect and start new").props.onClick(); mounted.render();
    const fresh = side("getTeacherDevicePairingCode", disconnectingRole);
    assert.notEqual(fresh, ownBefore);
    assert.equal(side("findLinkedAssessmentPeerSession", disconnectingRole), null);
    assert.equal(host("getAssessmentPeerStatus", "RST234").connected, false);
    assert.equal(guest("getAssessmentPeerStatus", "RST234").connected, false);
    assert.equal([...side.context.window.__crlAssessmentPeerStoreV1.sessions.values()].some(session => session.role === disconnectingRole), false);
    assert.equal(side("getAssessmentPairingCodes", preservedCode).offer, preservedOffer);
    assert.equal(mounted.dialog(), undefined);
    assert.ok(mounted.field(`Enter ${otherRole} connection or response code`));
    if (disconnectingRole === "teacher") await assert.rejects(side("completeTeacherAssessmentPairing", oldCode, reply.answer), error => error.code === "PAIRING_EXPIRED");
    const freshOffer = await (disconnectingRole === "teacher"
      ? side("startTeacherAssessmentPairing", fresh, { deviceOnly: true })
      : side("startLearnerDevicePairing", fresh));
    const newPartner = device();
    const freshReply = await (disconnectingRole === "teacher"
      ? newPartner("acceptLearnerAssessmentOffer", freshOffer, "")
      : newPartner("acceptTeacherDeviceOffer", freshOffer));
    await side(disconnectingRole === "teacher" ? "completeTeacherAssessmentPairing" : "completeLearnerDevicePairing", fresh, freshReply.answer);
    assert.equal(side("getAssessmentPeerStatus", fresh).connected, true);
    assert.equal(newPartner("getAssessmentPeerStatus", fresh).connected, true);
  }
  console.log("PASS Cancel preserves the live assessment link; confirmed disconnect on either role retires old peers, preserves other roles and persisted stores, and pairs with a new device offline");

  const exitTeacher = device(), exitLearner = device();
  const exitOffer = await exitTeacher("startTeacherAssessmentPairing", "EXT234", { deviceOnly: true });
  const exitReply = await exitLearner("acceptLearnerAssessmentOffer", exitOffer, "");
  await exitTeacher("completeTeacherAssessmentPairing", "EXT234", exitReply.answer);
  await exitLearner("startLearnerDevicePairing", "PND234");
  const otherRoleOffer = await exitLearner("startTeacherAssessmentPairing", "TCH234", { deviceOnly: true });
  const lateOffer = await exitTeacher("startTeacherAssessmentPairing", "LAT234", { deviceOnly: true });
  const lateAcceptance = exitLearner("acceptLearnerAssessmentOffer", lateOffer, "");
  exitLearner("disconnectAssessmentPeers", "learner");
  await assert.rejects(lateAcceptance, /closed/);
  for (const code of ["EXT234", "PND234", "LAT234"]) {
    assert.equal(exitLearner.context.window.__crlAssessmentPeerStoreV1.sessions.has(code), false);
  }
  assert.equal(exitTeacher("getAssessmentPeerStatus", "EXT234").connected, false);
  assert.equal(exitLearner("getAssessmentPairingCodes", "TCH234").offer, otherRoleOffer);
  assert.throws(() => exitLearner("disconnectAssessmentPeers", "invalid"), /Invalid device role/);
  console.log("PASS learner exit releases connected and pending peers, cancels late scans, and preserves teacher peers");

  const entryTeacher = device(), entryLearner = device();
  const entryOffer = await entryTeacher("startTeacherAssessmentPairing", "DEV567", { deviceOnly: true });
  const entryReply = await entryLearner("acceptLearnerAssessmentOffer", entryOffer, "");
  await entryTeacher("completeTeacherAssessmentPairing", "DEV567", entryReply.answer);
  assert.equal(entryLearner("getLinkedLearnerAssessment", "DEV567"), null, "A device invitation must never be an assessment");
  const entryPeers = peerNumber;
  assert.equal(await entryTeacher("claimAssessmentPeerLink", "ASD234"), true);
  entryTeacher("publishAssessmentPeerState", "ASD234", { code: "ASD234", learner_id: 406, stage: "waiting", connected: true });
  const entryUiSource = fs.readFileSync("app/learner/LearnerAssessmentPage.jsx", "utf8");
  const entryStart = entryUiSource.indexOf("  const joinAssessment =");
  const entryEnd = entryUiSource.indexOf("  const handleAssessmentCodeScan", entryStart);
  const entryUpdates = [];
  const entryContext = entryLearner.context;
  Object.assign(entryContext, {
    useCallback: callback => callback, codeInput: "ASD234", networkSnapshot: { online: false }, isInstalledApp: true,
    localPairingRequested: true, preparationKeyRef: { current: "" }, localSessionKeyRef: { current: "" },
    sessionRef: { current: null }, lastAppliedStageRef: { current: "" }, persistLocalLearnerSession() {},
    fetch: () => { throw new Error("A paired offline assessment must never create a cloud join"); },
  });
  for (const key of ["Loading", "Error", "StatusMessage", "CodeInput", "PairedDeviceCode", "LocalPairingRequested", "LocalOffer", "ShowConnectionSettings", "Session", "Joined", "Connected", "Completed"]) {
    entryContext[`set${key}`] = value => entryUpdates.push([key, value]);
  }
  vm.runInContext(entryUiSource.slice(entryStart, entryEnd) + "\nglobalThis.enterAssessment = joinAssessment;", entryContext);
  for (const input of ["asd234", "https://crl.test/learner?code=ASD234"]) {
    const decoded = await entryLearner("readAssessmentInvitation", input);
    entryUpdates.length = 0;
    await entryContext.enterAssessment(decoded.code, decoded.offer);
    assert.equal(entryUpdates.find(([key]) => key === "Session")[1].learner_id, 406);
    assert.ok(entryUpdates.some(([key, value]) => key === "Joined" && value === true));
    assert.ok(!entryUpdates.some(([key, value]) => key === "ShowConnectionSettings" && value === true));
    assert.equal(peerNumber, entryPeers, "Joining a code or QR must reuse the one-time device connection");
  }
  entryUpdates.length = 0;
  await entryContext.enterAssessment("BAD234");
  assert.ok(entryUpdates.some(([key, value]) => key === "Error" && /Check the assessment code/.test(value)));
  assert.ok(!entryUpdates.some(([key]) => key === "Session" || key === "Joined"));
  assert.equal(entryLearner("getAssessmentPeerStatus", "ASD234").connected, true);
  entryTeacher("publishAssessmentPeerState", "ASD234", { code: "ASD234", learner_id: 406, stage: "completed" });
  entryUpdates.length = 0;
  await entryContext.enterAssessment("ASD234");
  assert.ok(entryUpdates.some(([key, value]) => key === "Error" && /has ended/.test(value)));
  assert.ok(!entryUpdates.some(([key]) => key === "Joined"));
  assert.equal(await entryTeacher("claimAssessmentPeerLink", "ASD345"), true);
  entryTeacher("publishAssessmentPeerState", "ASD345", { code: "ASD345", learner_id: 407, stage: "waiting", connected: true });
  entryUpdates.length = 0;
  await entryContext.enterAssessment("ASD345");
  assert.equal(entryUpdates.find(([key]) => key === "Session")[1].learner_id, 407);
  assert.equal(entryLearner("getLinkedLearnerAssessment", "ASD234"), null);
  assert.equal(peerNumber, entryPeers);
  console.log("PASS six-character assessment codes and QR invitations reuse the confirmed link without pairing or cloud calls; wrong, completed and previous-learner codes cannot enter a different run");

  const setupTeacher = device(), setupLearner = device();
  const setupCode = setupTeacher("getTeacherDevicePairingCode");
  const setupOffer = await setupTeacher("startTeacherAssessmentPairing", setupCode, { deviceOnly: true });
  assert.ok((await setupLearner("readAssessmentPairingPacket", setupOffer)).t.startsWith("device_"));
  const setupAnswer = await setupLearner("acceptLearnerAssessmentOffer", setupOffer, "");
  const setupControls = [];
  setupTeacher("subscribeAssessmentPeerMessages", setupCode, message => setupControls.push(message));
  await setupTeacher("completeTeacherAssessmentPairing", setupCode, setupAnswer.answer);
  assert.equal(setupTeacher("getAssessmentPeerStatus", setupCode).deviceOnly, true);
  assert.equal(setupLearner("getAssessmentPeerStatus", setupCode).deviceOnly, true);
  assert.equal(setupTeacher("getTeacherDevicePairingCode"), setupCode);
  assert.equal(setupControls.length, 0, "Device setup must not announce an assessment join");
  setupLearner("publishAssessmentPeerControl", setupCode, { action: "peer_joined", code: setupCode });
  assert.equal(setupControls.length, 0, "A setup link must carry no assessment controls");
  const setupPeerCount = peerNumber;
  const [firstClaim, competingClaim] = await Promise.all([
    setupTeacher("claimAssessmentPeerLink", "RUN234"),
    setupTeacher("claimAssessmentPeerLink", "BAD234"),
  ]);
  assert.equal(firstClaim, true);
  assert.equal(competingClaim, false);
  assert.equal(setupLearner("getAssessmentPeerStatus", "RUN234").deviceOnly, false);
  const isolated = [];
  setupLearner("subscribeAssessmentPeerMessages", "RUN234", message => isolated.push(message));
  const setupChannel = setupTeacher.context.window.__crlAssessmentPeerStoreV1.sessions.get("RUN234").channel;
  setupChannel.send(JSON.stringify({ type: "assessment_state", source: "teacher", session: { code: setupCode, learner_id: 406, stage: "completed" } }));
  assert.equal(isolated.length, 0, "A late packet from a previous code must be dropped");
  setupTeacher("publishAssessmentPeerState", "RUN234", { code: "RUN234", learner_id: 406, stage: "letter", current_content: "A" });
  assert.equal(isolated.length, 1);
  assert.equal(await setupTeacher("claimAssessmentPeerLink", "RUN345"), true);
  const reusedSession = setupTeacher.context.window.__crlAssessmentPeerStoreV1.sessions.get("RUN345");
  reusedSession.peer.connectionState = "disconnected";
  reusedSession.peer.listeners.get("connectionstatechange")();
  assert.equal(setupTeacher("getAssessmentPeerStatus", "RUN345").connected, false, "Network changes must update the new run after rekeying");
  reusedSession.peer.connectionState = "connected";
  reusedSession.peer.listeners.get("connectionstatechange")();
  assert.equal(setupTeacher("getAssessmentPeerStatus", "RUN345").connected, true, "A recovered open channel must remain reusable");
  assert.equal(peerNumber, setupPeerCount, "Starting another learner must reuse the two existing peers");
  const second = [];
  setupLearner("subscribeAssessmentPeerMessages", "RUN345", message => second.push(message));
  setupChannel.send(JSON.stringify({ type: "assessment_state", source: "teacher", session: { code: "RUN234", learner_id: 406, stage: "completed" } }));
  setupTeacher("publishAssessmentPeerState", "RUN345", { code: "RUN345", learner_id: 407, stage: "letter", current_content: "B" });
  assert.equal(second.length, 1);
  assert.equal(second[0].session.learner_id, 407);
  setupChannel.send(JSON.stringify({ type: "link_move", from: "RUN345", code: "BAD234", id: "unrequested" }));
  assert.equal(setupLearner("getAssessmentPeerStatus", "RUN345").connected, true);
  const occupiedTeacher = device();
  const occupiedOffer = await occupiedTeacher("startTeacherAssessmentPairing", "OWN345");
  const occupiedAnswer = await setupLearner("acceptLearnerAssessmentOffer", occupiedOffer, "OWN345");
  await occupiedTeacher("completeTeacherAssessmentPairing", "OWN345", occupiedAnswer.answer);
  assert.equal(await setupTeacher("claimAssessmentPeerLink", "OWN345"), false, "A learner must refuse a code already owned by another live link");
  assert.equal(setupTeacher("getAssessmentPeerStatus", "RUN345").connected, true);
  console.log("PASS roster device pairing creates no assessment join; confirmed handoffs reuse one link and reject concurrent, stale, unsolicited and occupied-session messages");

  const lostAckTeacher = device(), lostAckLearner = device();
  const lostAckOffer = await lostAckTeacher("startTeacherAssessmentPairing", "ACK234");
  const lostAckAnswer = await lostAckLearner("acceptLearnerAssessmentOffer", lostAckOffer, "ACK234");
  await lostAckTeacher("completeTeacherAssessmentPairing", "ACK234", lostAckAnswer.answer);
  const ackChannel = lostAckLearner.context.window.__crlAssessmentPeerStoreV1.sessions.get("ACK234").channel;
  const sendAck = ackChannel.send.bind(ackChannel);
  ackChannel.send = value => { if (JSON.parse(value).type !== "link_moved") sendAck(value); };
  assert.equal(await lostAckTeacher("claimAssessmentPeerLink", "ACK345", { timeoutMs: 30 }), false);
  assert.equal(lostAckTeacher("getAssessmentPeerStatus", "ACK345").connected, false);
  assert.equal(lostAckLearner("getAssessmentPeerStatus", "ACK345").connected, false);
  console.log("PASS an unconfirmed handoff closes the link on both ends instead of running mismatched assessments");

  await verifyHubRoundTrip(device);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(completionGuard));
