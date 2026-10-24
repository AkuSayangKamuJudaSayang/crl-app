const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  const {periodEligibility} = await import("../lib/classWorkspace.mjs");
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
    classReadonly:false, periodEligibility, assessments: [], learners: [], assessmentStartPendingRef: { current: false },
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
  assert.match(notices.at(-1), /Offline Mode Settings/);
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
  mode = "online";
  context.assessments = [{ learner_id: 409, assessment_period: "BoSY", is_completed: true }];
  await context.runStart(409, "MoSY");
  assert.equal(apiCalls.at(-1).body.connection_mode, "online", "Paired devices must still create cloud sessions while reachable");
  assert.equal(overlays.at(-1).learnerId, 409, "Keep the paired window alive for sudden connection loss");
  assert.equal(navigations.length, 1, "A cloud run with an existing direct link must not navigate away from it");
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
    joined: true, completed: false, codeInput: "OLD234", localPairingRequested: false, isInstalledApp: true,
    getLinkedLearnerAssessment: () => null, findLinkedAssessmentPeerSession: () => null,
    networkSnapshot: { online: true }, localSessionKeyRef: { current: "learner:OLD234" },
    preparationKeyRef: { current: "" }, assessmentJoinRequestsRef: { current: new Set() },
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
  // Preparing an offline device link while online must preserve the normal
  // cloud assessment path until the teacher confirms a local assessment code.
  learnerContext.localPairingRequested = true;
  learnerContext.findLinkedAssessmentPeerSession = () => ({ code: "DEV234", deviceOnly: true });
  Object.assign(learnerContext, {
    mergeLearnerSession: value => value, sessionRef: { current: null }, lastAppliedStageRef: { current: "" },
    assessmentStartedRef: { current: false }, countdownTimerRef: { current: null },
  });
  for (const key of ["CodeInput", "Session", "Joined", "Countdown", "ShowStartOverlay", "Completed", "ShowConnectionSettings", "LocalPairingRequested", "LocalOffer", "NetworkSnapshot"]) {
    learnerContext[`set${key}`] = value => updates.push([key, value]);
  }
  updates.length = 0;
  const onlineJoin = learnerContext.run_joinAssessment("OLD234");
  release({ ok: true, json: async () => ({ code: "OLD234", learner_id: 406, stage: "waiting", connected: false }) });
  await onlineJoin;
  assert.ok(updates.some(([key, value]) => key === "Joined" && value === true));
  assert.ok(!updates.some(([key, value]) => key === "ShowConnectionSettings" && value === true));
  console.log("PASS pairing devices while online leaves online assessment joining available without an offline-mode override");

  // Exercise the real join callback, not a reimplementation of its branches.
  const joinStart=learner.indexOf("  const joinAssessment ="),joinEnd=learner.indexOf("  const handleAssessmentCodeScan",joinStart);
  const scanEnd=learner.indexOf("  const receiveTeacherPresence",joinEnd);
  function joinHarness({online=true,snapshotOnline=true,installed=true,fetchImpl,reachable=false}={}) {
    const changes=[],requests=[],state={};
    const ctx=vm.createContext({isProbablyOnline:async()=>({ok:reachable}),TypeError,URL,URLSearchParams,navigator:{onLine:online},window:{clearInterval(){}},
      useCallback:fn=>fn,normalizeCode:value=>String(value||'').replace(/\s+/g,'').toUpperCase(),codeInput:'ABC123',
      networkSnapshot:{online:snapshotOnline,quality:'Offline'},isInstalledApp:installed,
      assessmentJoinRequestsRef:{current:new Set()},localSessionKeyRef:{current:''},preparationKeyRef:{current:''},
      sessionRef:{current:null},lastAppliedStageRef:{current:''},assessmentStartedRef:{current:false},countdownTimerRef:{current:null},
      getLinkedLearnerAssessment:()=>null,findLinkedAssessmentPeerSession:()=>null,mergeLearnerSession:x=>x,
      persistLocalLearnerSession:x=>{state.persisted=x;},getAssessmentState:async()=>null,
      fetch:async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});return fetchImpl?fetchImpl(url,init):{ok:true,json:async()=>({connected:true,stage:'letter',current_content:'A'})};}
    });
    for(const key of ['CodeInput','Loading','Error','StatusMessage','LocalPairingRequested','LocalOffer','ShowConnectionSettings','Session','Joined','Connected','Completed','Countdown','ShowStartOverlay','NetworkSnapshot','TeacherInterrupted','ShowCodeScanner'])ctx['set'+key]=value=>{
      const next=typeof value==='function'?value(state[key]||ctx.networkSnapshot):value;state[key]=next;changes.push([key,next]);
    };
    vm.runInContext(learner.slice(joinStart,scanEnd)+'\nglobalThis.join=joinAssessment;globalThis.scan=handleAssessmentCodeScan;',ctx);
    return {ctx,state,changes,requests};
  }
  for(const snapshotOnline of [true,false])for(const installed of [true,false])for(const input of ['typed','qr','invitation']) {
    const h=joinHarness({snapshotOnline,installed});
    if(input==='qr'){h.ctx.scan('abc123','teacher-offer');await new Promise(resolve=>setImmediate(resolve));}
    else await h.ctx.join('ABC123',input==='invitation'?'teacher-offer':'');
    assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/assessment/join');assert.equal(h.requests[0].body.action,'host_join');assert.equal(h.requests[0].body.code,'ABC123');
    assert.equal(h.state.Joined,true);assert.equal(h.state.Session.stage,'letter');assert.equal(h.state.Session.current_content,'A');
    assert.equal(h.state.persisted.stage,'letter');assert.equal(h.state.NetworkSnapshot.online,true);
    assert.equal(h.state.LocalPairingRequested,false);assert.equal(h.state.ShowConnectionSettings,false);
    assert.ok(!h.changes.some(([key,value])=>key==='ShowConnectionSettings'&&value===true));
  }
  console.log('PASS actual QR callback, typed code and URL invitation join online directly in installed/browser modes, including stale offline probes and offers; first task persists without offline overlay');
  for(const status of [404,410,429]){
    const h=joinHarness({snapshotOnline:false,fetchImpl:async()=>({ok:false,status,json:async()=>({error:status===410?'Assessment code already used':'Assessment unavailable'})})});
    await h.ctx.join('ABC123','teacher-offer');assert.equal(h.state.Joined,false);assert.ok(h.state.Error);assert.ok(!h.changes.some(([key,value])=>key==='ShowConnectionSettings'&&value===true));
  }
  const slowOnline=joinHarness({reachable:true,fetchImpl:async()=>{throw new TypeError('Assessment connection timed out');}});await slowOnline.ctx.join('ABC123','teacher-offer');assert.match(slowOnline.state.Error,/online assessment/);assert.ok(!slowOnline.changes.some(([key,value])=>key==='ShowConnectionSettings'&&value===true));
  const cachedJoin=joinHarness({fetchImpl:async()=>({ok:true,json:async()=>({offline:true,connected:true,stage:'letter',current_content:'A'})})});
  await cachedJoin.ctx.join('ABC123','teacher-offer');assert.equal(cachedJoin.state.Joined,true);assert.equal(cachedJoin.state.NetworkSnapshot.online,false);assert.equal(cachedJoin.state.LocalPairingRequested,true);assert.equal(cachedJoin.state.LocalOffer,'teacher-offer');
  const deadWifi=joinHarness({snapshotOnline:false,fetchImpl:async()=>{throw new TypeError('Failed to fetch');}});
  await deadWifi.ctx.join('ABC123','teacher-offer');assert.equal(deadWifi.requests.length,1);assert.equal(deadWifi.state.ShowConnectionSettings,true);assert.equal(deadWifi.state.LocalOffer,'teacher-offer');assert.ok(!deadWifi.state.Joined);
  const offline=joinHarness({online:false,fetchImpl:async()=>{throw Error('Known offline must not call the cloud');}});
  await offline.ctx.join('ABC123','teacher-offer');assert.equal(offline.requests.length,0);assert.equal(offline.state.LocalOffer,'teacher-offer');assert.equal(offline.state.ShowConnectionSettings,true);
  const browserOffline=joinHarness({online:false,installed:false});await browserOffline.ctx.join('ABC123');assert.equal(browserOffline.requests.length,0);assert.match(browserOffline.state.Error,/installed learner app/);assert.ok(!browserOffline.state.ShowConnectionSettings);
  let finishJoin;const pending=joinHarness({fetchImpl:()=>new Promise(resolve=>{finishJoin=resolve;})});const first=pending.ctx.join('ABC123');await pending.ctx.join('ABC123');assert.equal(pending.requests.length,1);
  finishJoin({ok:true,json:async()=>({connected:true,stage:'letter',current_content:'A'})});await first;assert.equal(pending.state.Joined,true);assert.equal(pending.ctx.assessmentJoinRequestsRef.current.size,0);
  console.log('PASS invalid/used/rate-limited invitations stay errors; dead Wi-Fi and known-offline offers fall back safely; simultaneous submissions claim the single-use code once');

})().catch(error => { console.error(error); process.exitCode = 1; });
