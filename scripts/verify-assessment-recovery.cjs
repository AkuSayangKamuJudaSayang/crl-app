// Synthetic attempts only. Exercise the persisted format across fresh module
// instances (a killed JS runtime), the authenticated API, and presence timeout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
  const storage = new Map();
  const disk = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const before = await import('../lib/assessmentRecovery.mjs?before');
  before.activateRecoveryOwner(901); before.activateRecoveryRun('TST234');
  const start = Date.now() - 600000;
  const session = { code: 'TST234', teacher_id: 901, learner_id: 406, period: 'MoSY', stage: 'passage', current_content: 'Synthetic reading passage.',
    passage_started_at: new Date(start).toISOString(), passage_paused_seconds: 9, task1Results: [{ index: 0, isCorrect: true }], task2Results: [], comprehensionResults: [] };
  assert.equal(before.checkpointTeacherSession(session, { passageSeconds: 37, passageMiscues: [{ wordIndex: 3, type: 'Omission' }] }, disk), true);
  // No unload callback or asynchronous DB completion is required for this copy.
  const after = await import('../lib/assessmentRecovery.mjs?after');
  const draft = after.readTeacherRecovery(901, disk);
  assert.equal(after.recoveryWindowOpen({savedAt:Date.now()-86400001}),false);
  assert.equal(after.recoveryEligible({...draft,savedAt:Date.now()-86400001},{teacherId:901,host:session}),false);
  assert.equal(after.recoveryWindowOpen({savedAt:Date.now()-86399000}),true);
  assert.equal(draft.session.period, 'MoSY'); assert.equal(draft.session.task1Results[0].isCorrect, true);
  assert.equal(draft.ui.passageMiscues[0].wordIndex, 3);
  assert.equal(after.readTeacherRecovery(902, disk), null);
  assert.equal(after.recoveryEligible({ ...draft, session: { ...session, learner_id: -406 } }, { teacherId: 901, host: { ...session, learner_id: -406 } }), true, 'Offline-created learners remain recoverable');
  const merged = after.mergeRecoverySession({ ...session, stage: 'letter', current_content: 'B', item_index: 1 }, { ...session, stage: 'letter', current_content: 'A', item_index: 0, task1Results: [] });
  assert.equal(merged.current_content, 'B'); assert.equal(merged.task1Results.length, 1);
  assert.equal(after.recoveryEligible(draft, { teacherId: 901, host: session }), true);
  for (const opts of [{ teacherId: 902, host: session }, { teacherId: 901, host: { ...session, deleted: true } },
    { teacherId: 901, host: session, tombstones: [{ id: 406 }] }, { teacherId: 901, host: session, saved: true },
    { teacherId: 901, host: { ...session, ended: true, stage: 'ended' } }]) assert.equal(after.recoveryEligible(draft, opts), false);
  const frozen = after.freezeRecoveredSession(draft.session, draft.ui.passageSeconds);
  assert.equal(new Date(frozen.passage_paused_at).getTime() - start - 9000, 37000, 'Closure time must not count as reading time');
  assert.equal(frozen.connected, false, 'A persisted connected flag is not live connection proof');
  assert.equal(after.freezeRecoveredSession(frozen, 99).passage_paused_at, frozen.passage_paused_at, 'An already paused checkpoint retains its exact pause timestamp');
  const endedReview = { ...draft, ui: { showTerminationObservation: true } };
  assert.equal(after.recoveryEligible(endedReview, { teacherId: 901, host: { ...session, stage: 'completed', ended: true } }), true, 'Unsaved final review remains recoverable');
  after.activateRecoveryOwner(901); after.activateRecoveryRun(session.code);
  after.resolveTeacherRecovery(session.code, disk);
  after.checkpointTeacherSession(session, {}, disk);
  assert.equal(after.readTeacherRecovery(901, disk), null, 'A late callback must not revive an acknowledged End/Save');
  after.activateRecoveryRun('NEW234');
  assert.equal(after.checkpointTeacherSession(session, {}, disk), false, 'Old controller cannot replace a newer run');
  const fresh = { ...session, code: 'NEW234' };
  after.checkpointTeacherSession(fresh, {}, disk); after.discardRecoveryCodes(901, ['NEW234'], disk);
  assert.equal(after.readTeacherRecovery(901, disk), null);
  after.checkpointTeacherSession(fresh, {}, disk); assert.equal(after.readTeacherRecovery(901, disk), null, 'Late callbacks cannot recreate deleted learner recovery data');
  after.activateRecoveryRun('QUO234');
  assert.equal(after.checkpointTeacherSession({ ...fresh, code: 'QUO234' }, {}, { getItem: () => null, setItem: () => { throw Error('quota'); } }), false);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('SecurityError'); } });
  assert.equal(after.checkpointTeacherSession({ ...fresh, code: 'QUO234' }), false, 'Blocked storage must not throw inside answer/publish handlers');
  assert.equal(after.readTeacherRecovery(901), null);
  after.rememberLearnerRecovery(fresh);
  delete globalThis.localStorage;
  console.log('PASS abrupt-runtime-loss recovery preserves answers, miscues, period and elapsed time; ownership/deletion/final-save/late-callback guards and quota failures');

  const body = { code: session.code, learner_id: 406, stage: 'passage', currentContent: session.current_content, elapsed_seconds: 37, checkpoint_at: Date.now() };
  let host = { id: 1, code: session.code, teacherId: 901, learnerId: 406, learner: { id: 406, teacherId: 901 }, stage: 'passage', currentContent: session.current_content,
    ended: false, updatedAt: new Date(start), passageStartedAt: new Date(start), passagePausedAt: null, passagePausedSeconds: 9 };
  const content = await import('../lib/assessmentContent.js');
  const stories = await import('../lib/storyComprehension.mjs');
  const context = vm.createContext({getCurrentTeacher:async()=>null,withSchoolScope:async(_,work)=>work(), ...content, ...stories, ...after, console, process, URL, Response, Headers,
    expireInactiveAssessments:async()=>{},NextResponse: { json: (data, options) => Response.json(data, options) },
    prisma: { hostSession: {
      findFirst: async ({ where }) => where.teacherId === host.teacherId && where.code === host.code ? structuredClone(host) : null,
      updateMany: async ({ where, data }) => {
        if (where.updatedAt.getTime() !== host.updatedAt.getTime() || where.teacherId !== host.teacherId || host.ended) return { count: 0 };
        host = { ...host, ...data, updatedAt: new Date() }; return { count: 1 };
      },
    } },
  });
  const api = fs.readFileSync('app/api/assessment/route.js', 'utf8').replace(/\r\n/g, '\n').replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, '').replace(/^export /gm, '');
  Object.assign(context, await import("../lib/classWorkspace.mjs"));
  vm.runInContext(api, context);
  vm.runInContext('requireTeacher = async () => ({ userId: 901 });', context);
  const call = data => context.POST({ nextUrl: new URL('https://crl.test/api/assessment?action=host_recover'), json: async () => data });
  assert.equal((await call(body)).status, 200);
  const paused = host.passagePausedAt.getTime();
  assert.equal(paused - start - 9000, 37000);
  assert.equal((await call(body)).status, 200); assert.equal(host.passagePausedAt.getTime(), paused, 'Replay never moves the pause point');
  host.stage = 'teacher_review'; host.currentContent = 'TEACHER_REVIEW';
  assert.equal((await (await call(body)).json()).stale, true); assert.equal(host.stage, 'teacher_review');
  assert.equal((await call({ ...body, learner_id: 407 })).status, 404);
  vm.runInContext('requireTeacher = async () => ({ userId: 902 });', context);
  assert.equal((await call(body)).status, 404);
  vm.runInContext('requireTeacher = async () => ({ error: Response.json({ error: "Sign in" }, { status: 401 }) });', context);
  assert.equal((await call(body)).status, 401);
  console.log('PASS authenticated recovery endpoint freezes the exact timer once, rejects wrong learner/teacher and unauthenticated requests, and cannot rewind later stages');

  const learner = fs.readFileSync('app/learner/LearnerAssessmentPage.jsx', 'utf8').replace(/\r\n/g, '\n');
  const a = learner.indexOf('  const receiveTeacherPresence =');
  const b = learner.indexOf('  useEffect(() => {', a);
  let now = 0, interrupted = false, poll, acks = [];
  const ctx = vm.createContext({ normalizeCode: x => String(x || '').toUpperCase(), useCallback: fn => fn,
    networkSnapshot: { online: true }, localSessionKeyRef: { current: 'learner:TST234' }, assessmentChannelRef: { current: null },
    teacherPresenceSeenRef: { current: new Set() }, teacherPresenceRef: { current: { seenAt: 0, nonce: '', code: 'TST234' } }, performance: { now: () => now },
    setTeacherInterrupted: value => { interrupted = value; }, publishAssessmentControl: (_, packet) => acks.push(packet), publishAssessmentRealtimeControl: async () => {},
    joined: true, codeInput: 'TST234', session, sessionRef:{current:session}, PRESENCE_TIMEOUT_MS: after.PRESENCE_TIMEOUT_MS,
    assessmentPeerLeaseExpired:()=>false, recordAssessmentPeerSeen:()=>true, resetToCodeEntry:()=>{},
    useEffect: fn => fn(), window: { setInterval: fn => { poll = fn; return 1; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
  });
  vm.runInContext(learner.slice(a, b) + '\nglobalThis.receive = receiveTeacherPresence;', ctx);
  const end = learner.indexOf('\n\n  useEffect', b);
  vm.runInContext(learner.slice(b, end), ctx);
  now = after.PRESENCE_TIMEOUT_MS + 1; poll(); assert.equal(interrupted, true);
  assert.equal(ctx.receive({ type: 'assessment_presence', source: 'teacher', code: 'OTHER1', nonce: 'bad' }), false);
  assert.equal(interrupted, true);
  const packet = { type: 'assessment_presence', source: 'teacher', code: 'TST234', nonce: 'fresh-1', status: 'active' };
  assert.equal(ctx.receive(packet), true); assert.equal(interrupted, false); assert.equal(acks.length, 1);
  now += after.PRESENCE_TIMEOUT_MS + 1; poll(); assert.equal(interrupted, true);
  ctx.receive(packet); assert.equal(interrupted, true, 'Cached/replayed presence cannot pretend a crashed teacher is still running');
  ctx.receive({ ...packet, nonce: 'fresh-2', recovering: true }); assert.equal(interrupted, true);
  ctx.receive({ ...packet, nonce: 'fresh-3' }); assert.equal(interrupted, false);
  ctx.receive({ ...packet, nonce: 'fresh-4', status: 'interrupted' }); assert.equal(interrupted, true);
  console.log('PASS learner detects silent teacher loss, ignores wrong-code/replayed presence, waits through recovery, and reconnects on fresh live packets');
  const teacher = fs.readFileSync('app/teacher/assessment/AssessmentClient.jsx', 'utf8').replace(/\r\n/g, '\n');
  const controlsStart = teacher.indexOf('  const handleLearnerAssessmentControl =');
  const controlsEnd = teacher.indexOf('\n  useEffect(', controlsStart);
  const accepted = { current: new Set(['challenge']) }, waiting = { current: true };
  let markCount = 0;
  const teacherCtx = vm.createContext({ useCallback: fn => fn, code: 'TST234', performance: { now: () => 500 },
    presenceNoncesRef: accepted, learnerPresenceRef: { current: 0 }, recoveryWaitingRef: waiting,
    isTerminalAssessmentSession: after.isTerminalAssessmentSession,
    assessmentPeerLeaseExpired:()=>false,recordAssessmentPeerSeen:()=>true,
    setRecoveryNeedsLearner() {}, markLearnerConnected: () => { markCount++; }, fetchSession() {}, markLearnerPassageRendered() {},
    getAssessmentPassageGateKey() {}, markLearnerWordRendered() {}, getAssessmentWordGateKey() {}, latestSessionRef: { current: session },
  });
  // Dependencies of useCallback are also evaluated, so derive their identifiers
  // from the actual callback tail and supply inert functions for unrelated gates.
  const callbackSource = teacher.slice(controlsStart, controlsEnd);
  const deps = callbackSource.match(/\[([^\[\]]+)\]\s*\);\s*$/s)?.[1] || '';
  for (const key of deps.split(',').map(x => x.trim()).filter(x => /^\w+$/.test(x))) if (!(key in teacherCtx)) teacherCtx[key] = () => {};
  vm.runInContext(callbackSource + '\nglobalThis.handle = handleLearnerAssessmentControl;', teacherCtx);
  teacherCtx.handle({ action: 'learner_presence', code: 'OTHER1', nonce: 'challenge' }); assert.equal(waiting.current, true);
  teacherCtx.handle({ action: 'learner_presence', code: 'TST234', nonce: 'old' }); assert.equal(waiting.current, true);
  teacherCtx.handle({ action: 'learner_presence', code: 'TST234', nonce: 'challenge' }); assert.equal(waiting.current, false); assert.equal(markCount, 1);
  waiting.current = true; teacherCtx.handle({ action: 'learner_presence', code: 'TST234', nonce: 'challenge' }); assert.equal(waiting.current, true);

  // Completion is terminal from the teacher's perspective even though the
  // learner intentionally leaves the assessment app before Final Save.
  for(const stage of ['teacher_review','terminated','completed','ended']) {
    assert.equal(after.isTerminalAssessmentSession({...session,stage}),true);
    assert.equal(after.assessmentNeedsLearnerPresence({...session,stage}),false);
  }
  assert.equal(after.isTerminalAssessmentSession({...session,stage:'letter',ended:true}),true,
    'An ended run cannot ask for a learner again regardless of stage');
  for(const stage of ['letter','word','story_choice','passage','comprehension','learner_experience'])
    assert.equal(after.assessmentNeedsLearnerPresence({...session,stage,ended:false}),true);
  assert.equal(after.assessmentNeedsLearnerPresence({...session,stage:'waiting'}),false);

  const presenceStart = teacher.indexOf('  pauseOnInterruptionRef.current = () => controlPassageTimer("pause");');
  const presenceEnd = teacher.indexOf('\n\n  const handleLearnerAssessmentControl =',presenceStart);
  assert(presenceStart>=0 && presenceEnd>presenceStart,
    'Find the real teacher presence/tabs handler that raised the unwanted overlay');
  const presenceEffect = teacher.slice(presenceStart,presenceEnd);
  const activeStages = [
    ['letter','STARTED'],['passage','PASSAGE'],
  ];
  const terminalStages = [
    ['teacher_review','TEACHER_REVIEW'],
    ['terminated','ZERO_SCORE_PART1_TASK1'],
    ['terminated','PART1_TOTAL_LOW'],
    ['completed','Assessment completed.'],
    ['ended','Assessment session ended by teacher.'],
  ];
  function evaluatePresence(stage,currentContent,ended=false) {
    let now=1, warnings=[], pauses=0, packets=[], closingPackets=[], pulse=null, visibility=null, pagehide=null;
    const host={...session,stage,ended,current_content:currentContent};
    const teacherSession={current:host};
    const context=vm.createContext({
      code:'TST234',latestSessionRef:teacherSession,
      learnerPresenceRef:{current:0},recoveryWaitingRef:{current:false},
      presenceNoncesRef:{current:new Set()}, presenceOnlineRef:{current:false},
      assessmentChannelRef:{current:null},pauseOnInterruptionRef:{current:null},
      automaticEndPendingRef:{current:false},automaticEndRef:{current:null}, initialRecovery:null,
      assessmentPeerLeaseExpired:()=>false,
      controlPassageTimer:()=>{pauses++;},
      setRecoveryNeedsLearner:value=>{warnings.push(value);},
      assessmentNeedsLearnerPresence:after.assessmentNeedsLearnerPresence,
      isTerminalAssessmentSession:after.isTerminalAssessmentSession,
      PRESENCE_TIMEOUT_MS:after.PRESENCE_TIMEOUT_MS,
      performance:{now:()=>now},crypto:{randomUUID:()=>String(packets.length+1)+'-unique'},
      publishAssessmentPresence:(_,code,payload)=>packets.push(payload),
      publishAssessmentRealtimePresence:async()=>{},
      sendTeacherHttpPresence:async(_,value)=>{closingPackets.push(value);},
      useEffect:fn=>{fn();},
      document:{hidden:false,
        addEventListener:(name,fn)=>{if(name==='visibilitychange')visibility=fn;},
        removeEventListener(){}},
      window:{setInterval:fn=>{pulse=fn;return 1;},clearInterval(){},
        addEventListener:(name,fn)=>{if(name==='pagehide')pagehide=fn;},
        removeEventListener(){}},
    });
    vm.runInContext(presenceEffect,context);
    now=after.PRESENCE_TIMEOUT_MS+100;
    pulse();
    context.document.hidden=true;
    visibility();
    pagehide();
    return {warnings,pauses,packets,closingPackets};
  }
  for(const [stage,content] of terminalStages){
    const result=evaluatePresence(stage,content,stage==='completed'||stage==='ended');
    assert.deepEqual(result.warnings,[],stage+' must not raise reconnect after learner goes home');
    assert.equal(result.pauses,0,stage+' must not pause a completed reading timer');
    assert.equal(result.packets.length,0,stage+' must not publish new learner-presence pings');
    assert.equal(result.closingPackets.length,0,stage+' must not send an interrupted status after completion');
  }
  for(const [stage,content] of activeStages){
    const result=evaluatePresence(stage,content);
    assert(result.warnings.includes(true),stage+' still requires recovery if the learner disappears');
    assert(result.pauses>0,stage+' preserves timer-safe interruption recovery');
    assert(result.packets.length>0,stage+' continues ordinary active-session presence checks');
  }
  const endedWithoutStage=evaluatePresence('letter','Letter A',true);
  assert.equal(endedWithoutStage.warnings.length,0,
    'An ended session cannot be reopened by a delayed or stale stage');
  assert(teacher.includes('recoveryNeedsLearner && !isTerminalAssessmentSession(latestSessionRef.current || session)') &&
    teacher.includes('inert={recoveryNeedsLearner && !isTerminalAssessmentSession('),
    'Render and interaction guards must both hide the reconnect overlay during final review');
  assert(teacher.includes('isTerminalAssessmentSession(latestSessionRef.current)) return;'),
    'Delayed online presence and leave events must be ignored after terminal state');
  console.log('PASS completed, teacher-review, Part 1 zero and low-score stops suppress late reconnect in online/offline presence; active recovery remains intact');

  console.log('PASS teacher recovery requires a fresh matched learner acknowledgement; wrong-code, stale and replayed acknowledgements cannot release controls');

})().catch(error => { console.error(error); process.exitCode = 1; });
