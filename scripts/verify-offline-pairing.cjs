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
      this.channel.readyState = learner.channel.readyState = "open";
      this.channel.listeners.get("open")();
      learner.channel.listeners.get("open")();
    }
  }
}
function device(compressed = true, sharedWindow, hubFetch) {
  const context = vm.createContext({
    console, URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array, btoa, atob,
    Blob, Response, AbortController, setTimeout, clearTimeout, ...(compressed ? { CompressionStream, DecompressionStream } : {}),
    crypto: globalThis.crypto, performance, RTCPeerConnection: Peer,
    navigator: { userAgent: "Test learner", platform: "Test device" },
    window: sharedWindow || { location: { origin: "https://crl.test" }, setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout },
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
  return call;
}
const { verifyHubRoundTrip } = require("./verify-offline-hub.cjs");
const wrap = (text) => text.match(/.{1,61}/g).join("\n ");

(async () => {
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
  const renderPairing = (target, role) => {
    Object.assign(target.context, { React, qrcode, jsQR, useCallback: React.useCallback, useEffect: React.useEffect, useId: React.useId, useMemo: React.useMemo, useRef: React.useRef, useState: React.useState });
    vm.runInContext(ui.code, target.context);
    return renderToStaticMarkup(React.createElement(target.context.PairingView, { code: "ABC123", role, offline: true }));
  };
  const teacherUi = renderPairing(teacher, "teacher");
  assert.ok(teacherUi.includes('aria-label="Teacher pairing QR"'));
  assert.ok(teacherUi.includes("Teacher offline connection"));
  assert.ok(teacherUi.includes("Scan or enter a code from the other device"));
  assert.ok(teacherUi.includes("Scan learner QR"));
  assert.ok(teacherUi.includes("Show full screen"));
  /*
   * Camera-free classrooms: the very string the QR encodes is also plain text
   * that can be copied off one device and pasted into the other, so no hub,
   * server or short code is needed to carry it across.
   */
  assert.ok(teacherUi.includes("No camera? Connect with codes"));
  assert.ok(teacherUi.includes("Copy code"));
  assert.ok(teacherUi.includes("Connect to learner"));
  assert.ok(teacherUi.includes("local-pair-long"));
  assert.ok(teacherUi.includes(offer));
  assert.ok(!teacherUi.includes("Hub address"));
  assert.ok(!teacherUi.includes("One-time offline setup"));
  /*
   * Scanning is the whole flow when no hub is configured, so the typed-code
   * field is not rendered at all rather than sitting there unusable.
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
  assert.ok(noSetupUi.includes("No camera? Connect with codes"));
  // A camera-less learner has nothing to show yet, but must still be able to paste.
  assert.ok(noSetupUi.includes("Paste the teacher"));
  assert.ok(noSetupUi.includes("Connect to teacher"));
  assert.ok(!noSetupUi.includes("Copy code"));
  assert.ok(!noSetupUi.includes('maxLength="6"'));
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
    vm.runInContext(learnerSource.slice(learnerSource.indexOf("function normalizeCode("), learnerSource.indexOf("export default function LearnerPage()")), runtime);
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
    if (body && String(body.packet).startsWith("CRL3.")) return new Response(JSON.stringify({ error: "Invalid pairing packet." }), { status: 400 });
    return new Response(JSON.stringify({ code: "ZZZ234", expiresInMs: 900000 }), { status: 200 });
  });
  const oldHubAddress = "http://192.168.1.9:8787";
  assert.equal(await oldHub("checkPairingHub", oldHubAddress), oldHubAddress);
  const oldHubOffer = await oldHub("startTeacherAssessmentPairing", "OLD234");
  const oldHubEntry = await oldHub("registerPairingCode", oldHubAddress, "OLD234", "o", oldHubOffer);
  assert.equal(oldHubEntry.code, "ZZZ234");
  assert.equal(published.length, 2);
  assert.ok(published[0].startsWith("CRL3."));
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
  assert.equal(reverseTeacher("getTeacherDevicePairingCode"), learnerSetupCode);
  const reverseCount = peerNumber;
  assert.equal(await reverseTeacher("claimAssessmentPeerLink", "REV234"), true);
  const reverseStates = [];
  reverseLearner("subscribeAssessmentPeerMessages", "REV234", message => reverseStates.push(message));
  reverseTeacher("publishAssessmentPeerState", "REV234", { code: "REV234", learner_id: 408, stage: "letter", current_content: "A" });
  assert.equal(reverseStates.at(-1).session.learner_id, 408);
  assert.equal(peerNumber, reverseCount);
  console.log("PASS learner-first invitations connect both device roles without an assessment join and retain the link until a teacher-confirmed learner assessment");

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
})().catch(error => { console.error(error); process.exitCode = 1; });
