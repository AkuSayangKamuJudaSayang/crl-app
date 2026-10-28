const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');

(async () => {
  const source = fs.readFileSync('components/TeacherAssessmentRecovery.jsx', 'utf8');
  const start = source.indexOf('  useEffect(() => {\n    let cancelled = false;');
  const end = source.indexOf('\n\n  const recover', start);
  assert.ok(start > 0 && end > start);
  const effect = source.slice(start, end);
  const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
  const flush = async () => { for (let i = 0; i < 64; i++) await Promise.resolve(); };
  const reply = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
  const user = { id: 901, role: 'teacher' };
  const cached = { user, offlineToken: 'synthetic-local-session', expiresAt: Date.now() + 60000 };
  const session = { code: 'TST234', teacher_id: 901, learner_id: 406, stage: 'passage' };
  function run(options = {}) {
    const local = deferred(), auth = deferred(), host = deferred(), cloud = deferred();
    const state = { checked: false, candidate: null, progress: [{ completed: 0 }], calls: [], resolved: [] };
    const ctx = {
      Date, encodeURIComponent, AbortSignal: { timeout: ms => { assert.equal(ms, 6000); return 'network-deadline'; } },
      useEffect: fn => { state.cancel = fn(); },
      getOfflineTeacherSession: () => local.promise,
      fetch: url => { state.calls.push(url); return url.startsWith('/api/auth') ? auth.promise : cloud.promise; },
      activateRecoveryOwner: id => { assert.equal(id, 901); },
      readTeacherRecovery: () => options.noDraft ? null : { session: { ...session } },
      getOfflineHostSession: () => host.promise,
      getAssessmentState: async key => key.startsWith('deleted-session:') ? { deleted: Boolean(options.deleted) } : { saved: false },
      getOfflineTeacherSnapshot: async () => ({}), recoveryEligible: () => true,
      resolveTeacherRecovery: code => state.resolved.push(code), mergeRecoverySession: (a, b) => ({ ...a, ...b }),
      setStartup: value => state.progress.push(value), setCandidate: value => { state.candidate = value; }, setChecked: value => { state.checked = value; },
    };
    vm.runInNewContext(effect, ctx);
    return { local, auth, host, cloud, state };
  }
  const full = run(); await flush();
  assert.equal(full.state.progress.at(-1).completed, 0); assert.equal(full.state.checked, false);
  full.local.resolve(cached); await flush();
  assert.equal(full.state.progress.at(-1).completed, 1);
  await flush(); assert.equal(full.state.progress.at(-1).completed, 1); assert.equal(full.state.checked, false);
  full.auth.resolve(reply({ valid: true, user })); await flush();
  assert.equal(full.state.progress.at(-1).completed, 2); assert.equal(full.state.checked, false);
  full.host.resolve(session); await flush();
  assert.equal(full.state.progress.at(-1).completed, 3); assert.equal(full.state.checked, false);
  await flush(); assert.equal(full.state.progress.at(-1).completed, 3);
  full.cloud.resolve(reply({ session })); await flush();
  assert.equal(full.state.checked, true); assert.ok(full.state.candidate); assert.equal(full.state.progress.at(-1).completed, 4);
  assert.deepEqual(full.state.progress.map(x => x.completed), [0, 1, 2, 3, 4]);
  const fast = run({ noDraft: true }); fast.local.resolve(cached); fast.auth.resolve(reply({ valid: true, user })); await flush();
  assert.equal(fast.state.checked, true); assert.equal(fast.state.calls.length, 1); assert.equal(fast.state.candidate, null);
  for (const status of [401, 403]) {
    const invalid = run(); invalid.local.resolve(cached); invalid.auth.resolve(reply({}, status)); await flush();
    assert.equal(invalid.state.checked, true); assert.equal(invalid.state.calls.length, 1); assert.equal(invalid.state.candidate, null);
  }
  const offline = run(); offline.local.resolve(cached); offline.auth.reject(Error('offline')); offline.host.resolve(session); offline.cloud.reject(Error('offline')); await flush();
  assert.equal(offline.state.checked, true); assert.ok(offline.state.candidate);
  for (const invalidCache of [{ ...cached, signedOut: true }, { ...cached, expiresAt: 0 }, null]) {
    const expired = run(); expired.local.resolve(invalidCache); expired.auth.reject(Error('offline')); await flush();
    assert.equal(expired.state.checked, true); assert.equal(expired.state.candidate, null); assert.equal(expired.state.calls.length, 1);
  }
  const deleted = run({ deleted: true }); deleted.local.resolve(cached); deleted.auth.resolve(reply({ valid: true, user })); deleted.host.resolve(session); await flush();
  assert.equal(deleted.state.checked, true); assert.equal(deleted.state.candidate, null); assert.equal(deleted.state.calls.length, 1); assert.deepEqual(deleted.state.resolved, ['TST234']);
  const gone = run(); gone.local.resolve(cached); gone.auth.resolve(reply({ valid: true, user })); gone.host.resolve(session); gone.cloud.resolve(reply({}, 404)); await flush();
  assert.equal(gone.state.checked, true); assert.equal(gone.state.candidate, null); assert.deepEqual(gone.state.resolved, ['TST234']);
  const cancelled = run(); cancelled.state.cancel(); cancelled.local.resolve(cached); cancelled.auth.resolve(reply({ valid: true, user })); cancelled.host.resolve(session); cancelled.cloud.resolve(reply({ session })); await flush();
  assert.equal(cancelled.state.checked, false); assert.equal(cancelled.state.progress.length, 1); assert.equal(cancelled.state.candidate, null);
  const failedStorage = run({ noDraft: true }); failedStorage.local.reject(Error('storage blocked')); failedStorage.auth.resolve(reply({ valid: true, user })); await flush(); assert.equal(failedStorage.state.checked, true);
  assert.ok(!/setTimeout|setInterval|requestAnimationFrame/.test(effect));
  console.log('PASS actual startup check effect advances only after real work, holds during deferred storage/network checks, exits immediately when ready, preserves offline/expired/signed-out/deleted/cloud-ended guards and ignores post-unmount UI updates');

  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const swc = require('next/dist/build/swc');
  const loaderSource = fs.readFileSync('app/components/AppLoadingScreen.jsx', 'utf8');
  const compiled = await swc.transform(loaderSource, { filename: 'Loader.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } });
  const ctx = { module: { exports: {} }, require }; ctx.exports = ctx.module.exports; vm.runInNewContext(compiled.code, ctx);
  const Loader = ctx.module.exports.default;
  for (const count of [0, 1, 2, 3, 4]) {
    const html = renderToStaticMarkup(React.createElement(Loader, { completed: count, message: 'Actual check in progress' }));
    assert.ok(html.includes('src="/crl-app-logo.png"')); assert.ok(html.includes('role="progressbar"')); assert.ok(html.includes(`aria-valuenow="${count}"`)); assert.ok(html.includes(`scaleX(${count / 4})`)); assert.ok(html.includes('Actual check in progress'));
  }
  const navigation = renderToStaticMarkup(React.createElement(Loader, { completed: null }));
  assert.ok(!navigation.includes('aria-valuenow=')); assert.ok(navigation.includes('crlAppLoaderIndeterminate'));
  assert.ok(!/setTimeout|setInterval|window\.addEventListener/.test(loaderSource));
  assert.ok(loaderSource.includes('prefers-reduced-motion')); assert.ok(loaderSource.includes('crla_theme'));
  assert.ok(loaderSource.includes('user-select: none'));assert.ok(loaderSource.includes('draggable={false}'));
  assert.ok(!fs.readFileSync('app/teacher/layout.jsx', 'utf8').includes('<AppLoadingScreen'));
  console.log('PASS server-visible logo/loading bar has accessible real milestone values, indeterminate navigation, dark/reduced-motion styling and no duplicate window-load splash or fixed minimum duration');

  // The consent boundary must show the public loader in initial teacher HTML,
  // while continuing to withhold every protected child until consent is valid.
  const consentCode = await swc.transform(fs.readFileSync('app/components/PolicyConsentGate.jsx','utf8'), { filename:'Consent.jsx',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'} });
  let pathname='/teacher',allowed=false,decision={pathname:'',allowed:false},consentEffect,redirected='';
  const c={module:{exports:{}},window:{location:{replace:value=>{redirected=value;}}},require:name=>{
    if(name==='react')return{useState:()=>[decision,value=>{decision=typeof value==='function'?value(decision):value;}],useEffect:fn=>{consentEffect=fn;}};
    if(name==='next/navigation')return{usePathname:()=>pathname};
    if(name.includes('policyConsent'))return{hasPolicyConsent:()=>allowed};
    if(name.includes('AppLoadingScreen'))return{__esModule:true,default:Loader};
    return require(name);
  }};c.exports=c.module.exports;vm.runInNewContext(consentCode.code,c);const Consent=c.module.exports.default;
  const props={children:'PROTECTED_WORKSPACE'};
  let pending=Consent(props);const initial=renderToStaticMarkup(pending);
  assert.ok(initial.includes('src="/crl-app-logo.png"'));assert.ok(initial.includes('Checking your privacy preferences'));assert.ok(!initial.includes('PROTECTED_WORKSPACE'));
  consentEffect();assert.equal(redirected,'/');assert.notEqual(Consent(props),'PROTECTED_WORKSPACE');
  allowed=true;consentEffect();assert.equal(Consent(props),'PROTECTED_WORKSPACE');
  pathname='/teacher/assessment';decision={pathname:'',allowed:false};allowed=false;redirected='';
  assert.ok(renderToStaticMarkup(Consent(props)).includes('crlAppLoader'));consentEffect();assert.equal(redirected,'/');
  pathname='/learner';decision={pathname:'',allowed:false};assert.equal(Consent(props).type,'main');
  console.log('PASS actual consent boundary serves branded initial teacher HTML, preserves denied-consent redirects and protected-child gating, and leaves learner consent presentation unchanged');
})().catch(error => { console.error(error); process.exitCode = 1; });
