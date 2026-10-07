const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  let reachable = true;
  let probes = 0;
  const context = vm.createContext({ navigator: { onLine: true }, isProbablyOnline: async () => { probes++; return { ok: reachable }; } });
  vm.runInContext(fs.readFileSync("lib/assessmentConnectivity.js", "utf8").replace(/^import .*;\s*/gm, "").replace(/^export /gm, ""), context);
  assert.equal(await context.detectAssessmentConnectionMode(), "online");
  reachable = false;
  assert.equal(await context.detectAssessmentConnectionMode(), "offline", "A dead Wi-Fi connection is offline even if the browser reports online");
  context.navigator.onLine = false;
  const previousProbes = probes;
  assert.equal(await context.detectAssessmentConnectionMode(), "offline");
  assert.equal(probes, previousProbes, "A known offline device must not wait for a probe");
  const page = fs.readFileSync("app/teacher/page.jsx", "utf8");
  const begin = page.indexOf("  const startAssessment =");
  const end = page.indexOf("  const blankLearnerRow", begin);
  const apiCalls = [], overlays = [], navigations = [], notices = [];
  let mode = "online", linked = null;
  Object.assign(context, {
    assessments: [], learners: [], assessmentStartPendingRef: { current: false },
    showToast: message => notices.push(message), setStartingAssessment() {}, setIsOffline() {},
    detectAssessmentConnectionMode: async () => mode,
    findLinkedAssessmentPeerSession: () => linked,
    api: async (action, request) => { apiCalls.push({ action, body: request.body }); return { code: `RUN00${apiCalls.length}`, offline: mode === "offline" }; },
    localStorage: { setItem() {} }, setActiveHostSession() {},
    setOfflineAssessment: assessment => overlays.push(assessment), router: { push: url => navigations.push(url) },
  });
  vm.runInContext(page.slice(begin, end) + "\nglobalThis.runStart = startAssessment;", context);
  await context.runStart(406, "BoSY");
  assert.equal(apiCalls[0].body.connection_mode, "online");
  assert.equal(navigations.length, 1);
  assert.equal(overlays.length, 0);
  context.assessmentStartPendingRef.current = false; // the online route has finished navigating
  context.learners = [{ id: -1, offline_pending: true }];
  await context.runStart(-1, "BoSY");
  assert.equal(apiCalls.length, 1, "An unsynced learner must not open an unreachable online invitation");
  assert.match(notices.at(-1), /still syncing/);
  mode = "offline";
  await context.runStart(407, "BoSY");
  assert.equal(apiCalls.length, 1, "An unpaired device must not create an offline learner session");
  assert.match(notices.at(-1), /Offline settings/);
  linked = { code: "DEV234", role: "teacher", deviceOnly: true };
  await Promise.all([context.runStart(407, "BoSY"), context.runStart(408, "BoSY")]);
  assert.equal(apiCalls.length, 2, "Double starts must create exactly one assessment");
  assert.equal(overlays[0].learnerId, 407);
  assert.equal(apiCalls[1].body.connection_mode, "offline");
  await context.runStart(408, "BoSY");
  assert.equal(overlays[1].learnerId, 408);
  assert.notEqual(overlays[0].code, overlays[1].code);
  assert.equal(navigations.length, 1, "Offline runs must keep the paired window alive");
  context.assessments = [{ learner_id: 408, assessment_period: "BoSY", is_completed: true }];
  await context.runStart(408, "BoSY");
  assert.equal(apiCalls.length, 3, "Completed assessments must retain their original start guard");
  console.log("PASS automatic mode detection, dead Wi-Fi fallback, pairing-before-start, duplicate-start protection, separate learner sessions and offline navigation continuity");

  // Run the actual async learner callbacks with a response held across the
  // device handoff. Neither a successful old response nor a failed old join
  // may change the new learner's screen.
  const learner = fs.readFileSync("app/learner/LearnerAssessmentPage.jsx", "utf8");
  const updates = [];
  let release;
  const learnerContext = vm.createContext({
    AbortController, window: { setTimeout, clearTimeout },
    useCallback: callback => callback, normalizeCode: value => String(value || "").toUpperCase(),
    joined: true, completed: false, codeInput: "OLD234", localPairingRequested: false,
    networkSnapshot: { online: true }, localSessionKeyRef: { current: "learner:OLD234" },
    preparationKeyRef: { current: "" },
    zeroScoreRedirectingRef: { current: false }, sessionEndRedirectingRef: { current: false },
    completionRedirectingRef: { current: false }, statusRequestRef: { current: false }, heartbeatRequestRef: { current: false },
    resetToCodeEntry() {}, persistLocalLearnerSession() {},
    applyIncomingSession: value => updates.push(["session", value]),
    setConnected: value => updates.push(["connected", value]),
    setError: value => updates.push(["error", value]),
    setLoading: value => updates.push(["loading", value]),
    setStatusMessage: value => updates.push(["status", value]),
    fetch: () => new Promise(resolve => { release = resolve; }),
  });
  for (const name of ["refreshStatus", "sendHeartbeat", "joinAssessment"]) {
    const start = learner.indexOf(`  const ${name} =`);
    const finish = name === "joinAssessment" ? learner.indexOf("  const handleAssessmentCodeScan", start) : learner.indexOf("  useEffect(() =>", start);
    assert.ok(start >= 0 && finish > start);
    vm.runInContext(learner.slice(start, finish) + `\nglobalThis.run_${name} = ${name};`, learnerContext);
    learnerContext.localSessionKeyRef.current = "learner:OLD234";
    updates.length = 0;
    const waiting = learnerContext[`run_${name}`]("OLD234");
    updates.length = 0;
    learnerContext.localSessionKeyRef.current = "learner:NEW345";
    release({ ok: true, json: async () => ({ stage: "learner_experience", connected: true, ended: false }) });
    await waiting;
    assert.equal(updates.filter(([kind]) => kind !== "loading").length, 0, `${name}: an old response must not change the next learner`);
  }
  // A current heartbeat still updates the screen, proving the check does not
  // suppress normal online updates.
  learnerContext.localSessionKeyRef.current = "learner:OLD234";
  updates.length = 0;
  const heartbeat = learnerContext.run_sendHeartbeat();
  release({ ok: true, json: async () => ({ connected: true, ended: false }) });
  await heartbeat;
  assert.equal(updates.filter(([kind]) => kind === "session").length, 1);
  console.log("PASS late learner join/status/heartbeat replies cannot affect the next learner; current online heartbeat remains active");
})().catch(error => { console.error(error); process.exitCode = 1; });
