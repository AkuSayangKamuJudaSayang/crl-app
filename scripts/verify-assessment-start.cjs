const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

(async () => {
  const { periodEligibility } = await import('../lib/classWorkspace.mjs');
  const page = fs.readFileSync('app/teacher/page.jsx', 'utf8');
  const start = page.indexOf('  const startAssessment =');
  const end = page.indexOf('  const blankLearnerRow =', start);
  assert.ok(start > 0 && end > start);
  const periods = ['BoSY', 'MoSY', 'EoSY'];
  const compile = await require('next/dist/build/swc').transform(fs.readFileSync('components/AssessmentStartConfirmation.jsx', 'utf8'), {
    filename: 'AssessmentStartConfirmation.jsx',
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  });
  let selection, props, calls = [], cancelled = 0;
  const ctx = { module: { exports: {} }, require: name => {
    if (name === 'react') return { useState: initial => {
      if (selection === undefined) selection = initial;
      return [selection, value => { selection = value; }];
    } };
    if (name === './ClassDialog') return { __esModule: true, default: 'Dialog' };
    if (name.endsWith('.css')) return {};
    return require(name);
  } };
  ctx.exports = ctx.module.exports;
  vm.runInNewContext(compile.code, ctx);
  const render = () => ctx.module.exports.default(props);
  const buttons = tree => {
    const result = [];
    const visit = node => { if (!node || typeof node !== 'object') return;
      if (node.type === 'button') result.push(node);
      for (const child of [node.props?.children].flat(Infinity)) visit(child);
    };
    visit(tree); return result;
  };
  const button = label => buttons(render()).find(n => n.props.children === label);
  for (let completed = 0; completed < 3; completed++) {
    selection = undefined;
    const assessments = periods.slice(0, completed).map(assessment_period => ({ learner_id: 406, assessment_period, is_completed: true }));
    props = { learnerName: 'SYNTHETIC LEARNER', periodOptions: periods.map(period => ({ period, reason: periodEligibility(assessments, 406, period) })),
      onConfirm: period => calls.push(period), onCancel: () => cancelled++ };
    assert.equal(button('Start Assessment').props.disabled, true, 'Opening the chooser cannot start a preselected period');
    button('Start Assessment').props.onClick();
    assert.equal(calls.length, completed);
    for (const period of periods) assert.equal(button(period).props.disabled, Boolean(periodEligibility(assessments, 406, period)));
    button(periods[completed]).props.onClick();
    assert.equal(button('Start Assessment').props.disabled, false);
    props.busy = true;
    assert.equal(render().props.busy, true);
    assert.ok(buttons(render()).every(n => n.props.disabled));
    button('Cancel').props.onClick();
    assert.equal(cancelled, 0);
    props.busy = false;
    button('Start Assessment').props.onClick();
  }
  assert.deepEqual(calls, periods);
  props.periodOptions = [];
  assert.equal(button('Start Assessment').props.disabled, true, 'Missing eligibility data fails closed');
  console.log('PASS actual chooser requires an explicit eligible period, preserves prerequisites, and blocks all actions while starting');

  const cancelStart = page.indexOf('  const cancelAssessmentStart =');
  const cancelEnd = page.indexOf('  const [learnerValidationAttempted', cancelStart);
  const cancelling = vm.createContext({ useCallback: fn => fn, assessmentStartPendingRef: {current:true}, setAssessmentStartConfirmation: () => cancelled++ });
  vm.runInContext(page.slice(cancelStart, cancelEnd) + '\nglobalThis.cancel = cancelAssessmentStart;', cancelling);
  cancelling.cancel();
  assert.equal(cancelled, 0, 'Escape or PWA Back cannot close a start whose write is already pending');
  cancelling.assessmentStartPendingRef.current = false;
  cancelling.cancel();
  assert.equal(cancelled, 1);

  function fixture(mode, linked) {
    const events = [], notices = [], requests = [], learner = { id: 406 };
    let release;
    const env = vm.createContext({ classReadonly: false, assessmentStartPendingRef: { current: false }, assessmentStartConfirmation: { learner },
      assessments: [], learners: [learner], periodEligibility, detectAssessmentConnectionMode: async () => mode,
      setIsOffline: value => events.push(['offline', value]), setStartingAssessment: value => events.push(['busy', value]),
      findLinkedAssessmentPeerSession: () => linked ? { code: 'PAIR234' } : null,
      api: async (action, request) => { requests.push({ action, body: request.body }); return { code: 'TST234', offline: mode === 'offline' }; },
      localStorage: { setItem: (key, value) => events.push(['checkpoint', JSON.parse(value)]) },
      setActiveHostSession: value => events.push(['host', value]),
      setOfflineAssessment: value => events.push(['screen', value]),
      router: { push: value => events.push(['route', value]) },
      setAssessmentStartConfirmation: value => { env.assessmentStartConfirmation = value; },
      showToast: value => notices.push(value),
    });
    vm.runInContext(page.slice(start, end) + '\nglobalThis.start = startAssessment;', env);
    return { env, events, notices, requests, hold: () => { env.detectAssessmentConnectionMode = () => new Promise(resolve => { release = resolve; }); }, release: () => release(mode) };
  }
  for (const [mode, linked] of [['offline', true], ['online', true], ['online', false]]) {
    for (let completed = 0; completed < 3; completed++) {
      const f = fixture(mode, linked);
      f.env.assessments = periods.slice(0, completed).map(assessment_period => ({ learner_id: 406, assessment_period, is_completed: true }));
      await f.env.start(406, ''); await f.env.start(407, periods[completed]);
      assert.equal(f.requests.length, 0, 'Unchosen periods and mismatched learners cannot create an assessment');
      f.hold();
      const pending = f.env.start(406, periods[completed]);
      await f.env.start(406, periods[completed]);
      assert.equal(f.requests.length, 0);
      assert.ok(f.env.assessmentStartConfirmation, 'Do not remove the chooser while startup is pending');
      f.release(); await pending;
      assert.equal(f.requests.length, 1);
      assert.equal(f.requests[0].body.period, periods[completed]);
      assert.equal(f.requests[0].body.connection_mode, mode);
      assert.equal(f.env.assessmentStartConfirmation, null);
      const screen = f.events.find(e => e[0] === (linked ? 'screen' : 'route'));
      assert.ok(screen);
      if (linked) assert.equal(screen[1].period, periods[completed]);
    }
  }
  const failure = fixture('offline', true);
  failure.env.api = async () => { throw Error('Local write failed'); };
  await failure.env.start(406, 'BoSY');
  assert.ok(failure.env.assessmentStartConfirmation);
  assert.equal(failure.env.assessmentStartPendingRef.current, false);
  assert.equal(failure.events.some(e => ['screen', 'route', 'checkpoint'].includes(e[0])), false);
  failure.env.api = async () => ({ code: 'TST234', offline: true });
  await failure.env.start(406, 'BoSY');
  assert.equal(failure.env.assessmentStartConfirmation, null);
  const expired = fixture('offline', true);
  expired.env.assessments.push({ learner_id: 406, assessment_period: 'BoSY', is_completed: true });
  await expired.env.start(406, 'BoSY');
  assert.equal(expired.requests.length, 0);
  expired.env.assessmentStartConfirmation = null;
  await expired.env.start(406, 'MoSY');
  assert.equal(expired.requests.length, 0);
  console.log('PASS actual dashboard start validates the open learner/period, retains chooser on failure, rejects duplicate/cancelled/stale starts and preserves selected timeline online and offline');
})().catch(error => { console.error(error); process.exitCode = 1; });
