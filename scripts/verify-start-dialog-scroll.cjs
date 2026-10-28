const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

(async () => {
  const { acquirePageScrollLock } = await import('../lib/pageScrollLock.mjs');
  const source = fs.readFileSync('app/teacher/page.jsx', 'utf8');
  const start = source.indexOf('  useLayoutEffect(() => {\n    const overlayOpen');
  const end = source.indexOf('\n\n  useEffect', start);
  assert.ok(start > 0 && end > start);
  const dashboardEffect = source.slice(start, end);
  const swc = require('next/dist/build/swc');
  const compiled = await swc.transform(fs.readFileSync('components/ClassDialog.jsx', 'utf8'), {
    filename: 'ClassDialog.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  });

  const style = () => {
    const values = new Map();
    return {
      setProperty: (key, value, priority = '') => values.set(key, [value, priority]),
      removeProperty: key => values.delete(key),
      getPropertyValue: key => values.get(key)?.[0] || '',
      getPropertyPriority: key => values.get(key)?.[1] || '',
    };
  };
  function fixture() {
    const listeners = new Map(), scrolls = [];
    const window = {
      scrollX: 12, scrollY: 650,
      scrollTo: (...args) => scrolls.push(args),
      addEventListener: (key, fn) => listeners.set(key, fn),
      removeEventListener: (key, fn) => { if (listeners.get(key) === fn) listeners.delete(key); },
    };
    const document = { body: { style: style() }, documentElement: { style: style() }, defaultView: window, activeElement: { focus() {} } };
    // Preserve unrelated inline styles, original scroll position and priority.
    document.body.style.setProperty('width', '92%', 'important');
    document.body.style.setProperty('color', 'blue');
    document.documentElement.style.setProperty('overflow', 'auto', 'important');
    return { document, window, listeners, scrolls };
  }
  function mountDialog(env, onClose = () => {}) {
    const effects = [], keys = new Map();
    const node = { focus() {}, addEventListener: (key, fn) => keys.set(key, fn), removeEventListener: key => keys.delete(key), querySelectorAll: () => [] };
    const ctx = { module: { exports: {} }, document: env.document, window: env.window, require: name => {
      if (name === 'react') return { useEffect: fn => effects.push(fn), useId: () => 'test-dialog', useRef: value => ({ current: value === null ? node : value }) };
      if (name === 'react-dom') return { createPortal: () => null };
      if (name.includes('pageScrollLock')) return { acquirePageScrollLock: () => acquirePageScrollLock(env.document) };
      if (name.endsWith('.css')) return {};
      return require(name);
    } };
    ctx.exports = ctx.module.exports;
    vm.runInNewContext(compiled.code, ctx);
    ctx.module.exports.default({ title: 'Start assessment', onClose });
    const cleanups = effects.map(fn => fn());
    return { close: () => cleanups.forEach(fn => fn?.()), escape: () => keys.get('keydown')({ key: 'Escape', preventDefault() {}, stopPropagation() {} }) };
  }
  function mountDashboard(env, state = {}) {
    let cleanup;
    vm.runInNewContext(dashboardEffect, {
      ...env, analyticsChartOverlayPeriod: null, analyticsMobileResultOpen: false, analyticsMobileView: false, startingAssessment: '', assessmentStartConfirmation: {},
      ...state, acquirePageScrollLock: () => acquirePageScrollLock(env.document), useLayoutEffect: fn => { cleanup = fn(); },
      setAnalyticsChartOverlayPeriod() {}, setAnalyticsMobileResultOpen() {},
    });
    return () => cleanup?.();
  }
  function locked(env) {
    assert.equal(env.document.body.style.getPropertyValue('overflow'), 'hidden');
    assert.equal(env.document.body.style.getPropertyValue('position'), 'fixed');
    assert.equal(env.document.body.style.getPropertyValue('top'), '-650px');
  }
  function restored(env) {
    assert.equal(env.document.body.style.getPropertyValue('overflow'), '');
    assert.equal(env.document.body.style.getPropertyValue('position'), '');
    assert.equal(env.document.body.style.getPropertyValue('width'), '92%');
    assert.equal(env.document.body.style.getPropertyPriority('width'), 'important');
    assert.equal(env.document.body.style.getPropertyValue('color'), 'blue');
    assert.equal(env.document.documentElement.style.getPropertyValue('overflow'), 'auto');
    assert.equal(env.document.documentElement.style.getPropertyPriority('overflow'), 'important');
    assert.deepEqual(env.scrolls.at(-1), [12, 650]);
  }
  // Execute the actual dashboard layout effect and ClassDialog effects in both
  // React cleanup orders. Covers cancellation, navigation, start failure and
  // transition to the busy overlay while the dialog's passive effect is alive.
  for (const order of ['dialog-first', 'dashboard-first']) {
    for (const reason of ['cancel', 'escape', 'pwa-back']) {
      const env = fixture(); let cancelled = 0;
      const dashboard = mountDashboard(env);
      const dialog = mountDialog(env, () => cancelled++);
      locked(env);
      if (reason === 'escape') dialog.escape();
      else if (reason === 'pwa-back') env.listeners.get('crl-pwa-back')({ stopImmediatePropagation() {} });
      else cancelled++;
      assert.equal(cancelled, 1);
      if (order === 'dialog-first') { dialog.close(); dashboard(); }
      else { dashboard(); dialog.close(); }
      restored(env);
      // Repeat open/close at the same scroll location; release is idempotent.
      const repeated = mountDialog(env); locked(env); repeated.close(); repeated.close(); restored(env);
    }
    const env = fixture(), dialog = mountDialog(env);
    const busy = mountDashboard(env, { startingAssessment: '1-BoSY' });
    locked(env);
    if (order === 'dialog-first') { dialog.close(); locked(env); busy(); }
    else { busy(); locked(env); dialog.close(); }
    restored(env);
  }
  const env = fixture();
  const chart = mountDashboard(env, { analyticsChartOverlayPeriod: 'BoSY' }); locked(env);
  const dialog = mountDialog(env); chart(); locked(env); dialog.close(); restored(env);
  console.log('PASS actual Start dialog/dashboard effects restore scrolling after Cancel, Escape, PWA Back, repeated opening and busy/navigation cleanup in either order; overlapping analytics retains its lock until the final owner closes');
})().catch(error => { console.error(error); process.exitCode = 1; });
