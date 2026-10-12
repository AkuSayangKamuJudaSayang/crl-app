const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

(async () => {
  const source = fs.readFileSync('app/teacher/assessment/AssessmentClient.jsx', 'utf8');
  const state = { selection: null, selectedWord: null, count: 0, selecting: true, stage: 'passage' };
  const listeners = new Map();
  let cleanup, queued = [], published = [], persisted = [], finishCalls = 0;
  const context = vm.createContext({
    console, Date, Math, Number, String,
    useCallback: callback => callback,
    useEffect: callback => { cleanup = callback(); },
    code: 'ABC123', session: {}, passageSeconds: 120, passageWordsRead: 0, passageMiscues: [],
    passageFinalizingRef: { current: false }, passageClockRef: { current: { frozenSeconds: 100 } }, passageTimerRef: { current: null },
    latestSessionRef: { current: { stage: 'passage', code: 'ABC123' } }, latestActiveStageRef: { current: 'passage' }, latestSessionVersionRef: { current: 0 }, assessmentChannelRef: { current: null },
    activeStage: 'passage', timeUpSelecting: false, pendingMiscueType: null,
    PASSAGE_MISCUE_HOTKEYS: [{ key: '1', type: 'Omission' }, { key: '2', type: 'Insertion' }],
    setPendingMiscueType: value => { context.pendingMiscueType = typeof value === 'function' ? value(context.pendingMiscueType) : value; },
    window: { addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name) },
    setPassageWordsRead: value => { context.passageWordsRead = value; state.count = value; },
    setTimeUpSelectedWord: value => { context.timeUpSelectedWord = value; state.selection = value; },
    setSelectedPassageWord: value => { state.selectedWord = value; },
    setTimeUpSelecting: value => { state.selecting = value; },
    setActiveStage: value => { state.stage = value; },
    persistPassageDraft: async value => { persisted.push(value); },
    publishAssessmentState: (_, packet) => { published.push(packet); }, publishAssessmentRealtimeState: async () => {},
    getComprehensionQuestions: () => [{ text: 'First question' }],
    fetch: async (_, request) => { finishCalls++; assert.equal(JSON.parse(request.body).words_read, 28); throw Error('Offline'); },
    putMutation: async entry => queued.push(entry), flushAnswerQueue() {},
  });
  for (const setter of ['setBusy', 'setError', 'setPassageSeconds', 'setTimeUpReviewConfirmed', 'setMiscueDrawerOpen', 'setMiscueReviewMode', 'setReversionSelecting', 'setReversionSourceWord', 'setSelectedMiscueType', 'setSubstitutionInputRequested', 'setMisreadWord', 'setQuestionIndex', 'setSession']) context[setter] = () => {};
  const begin = source.indexOf('  const finishPassageReading =');
  const end = source.indexOf('  const removePassageMiscue =', begin);
  vm.runInContext(source.slice(begin, end) + '\nglobalThis.finish = finishPassageReading;', context);
  const selectBegin = source.indexOf('                    setPassageWordsRead(', source.indexOf('timeUpSelecting &&\n                    timeUpReviewConfirmed'));
  const selectEnd = source.indexOf('                    return;', selectBegin);
  const select = vm.runInContext(`number => { ${source.slice(selectBegin, selectEnd)} }`, context);
  select(54);
  assert.equal(state.selection, 54); assert.equal(state.selectedWord, 54); assert.equal(state.selecting, true);
  select(28);
  assert.equal(state.selection, 28); assert.equal(state.selectedWord, 28); assert.equal(finishCalls, 0, 'Selection alone must not save or advance');
  await Promise.all([context.finish(120, state.selection), context.finish(120, state.selection)]);
  await new Promise(setImmediate);
  assert.equal(state.stage, 'comprehension'); assert.equal(finishCalls, 1, 'Double confirmation must save once');
  assert.equal(persisted[0].wordsRead, 28); assert.equal(persisted[0].timerSeconds, 120);
  assert.equal(published[0].session.current_content, 'First question');
  assert.equal(queued.length, 1); assert.equal(queued[0].payload.words_read, 28, 'Offline retry preserves the confirmed last word');
  assert.equal(state.selecting, false);
  console.log('PASS last-word changes replace the highlight; only confirmation advances once, journals the chosen count, broadcasts comprehension and queues offline retry');

  const hotkeyBegin = source.indexOf('  useEffect(() => {', source.indexOf(' * Passage miscue hotkeys. Active'));
  const hotkeyEnd = source.indexOf('\n\n  useEffect(', hotkeyBegin);
  const install = () => vm.runInContext(source.slice(hotkeyBegin, hotkeyEnd), context);
  context.passageSeconds = 100; install();
  const key = (value, target = {}) => listeners.get('keydown')?.({ key: value, target, preventDefault() {} });
  key('1'); assert.equal(context.pendingMiscueType, 'Omission');
  key('1'); assert.equal(context.pendingMiscueType, null);
  key('2', { tagName: 'INPUT' }); assert.equal(context.pendingMiscueType, null);
  key('2'); cleanup(); install();
  let prevented = false;
  listeners.get('contextmenu')({ target: {}, preventDefault() { prevented = true; } });
  assert.equal(context.pendingMiscueType, null); assert.ok(prevented);
  context.passageClockRef.current.frozenSeconds = 120; key('1'); assert.equal(context.pendingMiscueType, null);
  cleanup(); context.passageSeconds = 120; context.timeUpSelecting = true; install();
  assert.equal(listeners.size, 0, 'No hotkey or cancellation listeners survive timeout');
  console.log('PASS same-key and right-click-anywhere cancellation; editable fields are safe; number keys stop at timeout');

  const items = await import('../lib/assessmentLearnerItems.js');
  const learner = fs.readFileSync('app/learner/LearnerAssessmentPage.jsx', 'utf8');
  const progressSource = learner.slice(learner.indexOf('  const livePosition = useMemo('), learner.indexOf('  const passageWords ='));
  for (const serverStage of ['waiting', 'connected', 'letter']) {
    for (const custom of [false, true]) {
      const letters = custom ? ['Z','Y','X','W','V','U','T','S','R','Q'] : [...items.FALLBACK_LETTERS];
      const ctx = vm.createContext({ ...items, Number, stage: 'letter', session: { stage: serverStage, ...(custom ? { assessment_content: { letters } } : {}) }, liveContent: '', currentQuestions: [], useMemo: fn => fn(), isWaitingContent: value => !value || /^waiting/i.test(value) });
      vm.runInContext(progressSource + '\nglobalThis.progress = liveProgress;', ctx);
      assert.equal(ctx.progress, 'Letter 1 of 10');
      ctx.session = { stage: 'letter', assessment_content: { letters }, current_content: letters[1], item_index: 1 }; ctx.liveContent = letters[1];
      vm.runInContext(`{ ${progressSource} globalThis.progress = liveProgress; }`, ctx);
      assert.equal(ctx.progress, 'Letter 2 of 10');
      ctx.liveContent = '';
      vm.runInContext(`{ ${progressSource} globalThis.progress = liveProgress; }`, ctx);
      assert.equal(ctx.progress, 'Letter 2 of 10', 'Missing content must still honor a stated later item');
    }
  }
  console.log('PASS first-letter progress during connection and empty first-item packets with default and custom item orders; later progress stays correct');
})().catch(error => { console.error(error); process.exitCode = 1; });
