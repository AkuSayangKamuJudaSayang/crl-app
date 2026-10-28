const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');

(async () => {
  // Execute the shared guard used by both real app layouts, including native
  // clipboard events and portal text/code endpoints, without learner data.
  const clipboard = vm.createContext({});
  vm.runInContext(fs.readFileSync('lib/learnerClipboard.js', 'utf8').replace(/^export /gm, ''), clipboard);
  const listeners = new Map(), attributes = new Map();
  const field = kind => ({ selectionStart: 0, selectionEnd: 6, closest(selector) {
    if (selector.includes('data-crl-code-field')) return ['code', 'code-display'].includes(kind) ? this : null;
    return kind === 'editable' ? this : null;
  } });
  const code = field('code'), display = field('code-display'), input = field('editable'), passage = field('passage'), readonly = field('readonly');
  let selection = null;
  const doc = { activeElement: passage, getSelection: () => selection, documentElement: {
    getAttribute: key => attributes.get(key) ?? null, setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key),
  }, addEventListener: (key, fn) => { assert.ok(!listeners.has(key)); listeners.set(key, fn); }, removeEventListener: (key, fn) => { assert.equal(listeners.get(key), fn); listeners.delete(key); } };
  const event = (type, target, extra = {}) => {
    const e = { key: '', target, prevented: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {}, ...extra };
    listeners.get(type)?.(e); return e.prevented;
  };
  const teacher = clipboard.installAppClipboardGuard(doc), learner = clipboard.installAppClipboardGuard(doc);
  assert.equal(attributes.has('data-crl-text-protected'), true);
  for (const target of [passage, readonly]) {
    assert.equal(event('selectstart', target), true); assert.equal(event('copy', target), true);
    assert.equal(event('keydown', target, { key: 'a', ctrlKey: true }), true);
  }
  for (const target of [code, display, input]) {
    doc.activeElement = target;
    assert.equal(event('selectstart', target), false); assert.equal(event('copy', target), false);
    assert.equal(event('keydown', target, { key: 'a', metaKey: true }), false);
    assert.equal(event('cut', target), false); assert.equal(event('paste', target), false);
  }
  // A selection that includes a name/passage cannot piggyback on an active
  // editable/code field. Display codes can be copied with the keyboard too.
  selection = { rangeCount: 1, isCollapsed: false, getRangeAt: () => ({ startContainer: display, endContainer: passage }) };
  assert.equal(event('copy', display), true);
  selection.getRangeAt = () => ({ startContainer: { nodeType: 3, parentElement: display }, endContainer: display });
  doc.activeElement = passage;
  assert.equal(event('copy', passage), false); assert.equal(event('keydown', passage, { key: 'c', ctrlKey: true }), false);
  selection = null;
  for (const type of ['click', 'pointerdown', 'contextmenu', 'change', 'drop', 'paste', 'beforeinput']) assert.equal(event(type, passage, { inputType: 'insertFromDrop' }), false);
  assert.equal(event('keydown', passage, { key: 'Tab' }), false);
  teacher(); teacher(); assert.ok(listeners.size); learner(); assert.equal(listeners.size, 0); assert.equal(attributes.size, 0);
  assert.ok(fs.readFileSync('app/teacher/layout.jsx', 'utf8').includes('<AppTextSelectionGuard />'));
  const learnerGuard = fs.readFileSync('app/learner/LearnerClipboardGuard.jsx', 'utf8');
  assert.ok(learnerGuard.includes('<AppTextSelectionGuard />')); assert.ok(!learnerGuard.includes('matchMedia'));
  assert.ok(fs.readFileSync('app/teacher/assessment/AssessmentClient.jsx', 'utf8').includes('data-crl-copyable-code'));
  console.log('PASS shared browser/PWA text policy blocks view-text selection/copy, preserves editable fields and assessment/offline codes, rejects mixed selections, leaves clicks/import drops/paste untouched and cleans overlapping route owners safely');

  // Run the actual action-bar component's layout effect against scroll/resize
  // geometry. The same children stay in one toolbar slot or one body portal.
  const swc = require('next/dist/build/swc');
  const source = fs.readFileSync('components/RosterSelectionActions.jsx', 'utf8');
  const compiled = await swc.transform(source, { filename: 'Actions.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } });
  let state = null, effect, rect = { top: 280, left: 16, width: 288 }, mobile = true, portals = 0, disconnected = false;
  const scrollListeners = new Map(), frames = new Map(); let nextFrame = 0;
  const slot = { getBoundingClientRect: () => rect }, bar = { getBoundingClientRect: () => ({ height: 110 }) };
  let refIndex = 0;
  const window = { matchMedia: () => ({ get matches() { return mobile; }, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; }, cancelAnimationFrame: id => frames.delete(id),
    addEventListener: (key, fn, options) => { if (key === 'scroll') assert.ok(options.passive && options.capture); scrollListeners.set(key, fn); },
    removeEventListener: (key, fn) => { assert.equal(scrollListeners.get(key), fn); scrollListeners.delete(key); } };
  const ctx = { module: { exports: {} }, window, document: { body: {} }, ResizeObserver: class { observe() {} disconnect() { disconnected = true; } }, require: name => {
    if (name === 'react') return { useRef: () => ({ current: refIndex++ % 2 === 0 ? slot : bar }), useState: () => [state, next => { state = typeof next === 'function' ? next(state) : next; }], useLayoutEffect: fn => { effect = fn; } };
    if (name === 'react-dom') return { createPortal: node => { portals++; return node; } };
    if (name.endsWith('.css')) return { slot: 'slot', bar: 'bar', floating: 'floating' };
    return require(name);
  } };
  ctx.exports = ctx.module.exports; vm.runInNewContext(compiled.code, ctx);
  const View = ctx.module.exports.default, props = { selectionCount: 2, children: 'Three real action buttons' };
  View(props); const cleanup = effect(); assert.equal(state.top, 280); assert.equal(state.width, 288);
  View(props); assert.equal(portals, 1);
  const scroll = top => { rect = { ...rect, top }; scrollListeners.get('scroll')(); for (const [id, fn] of frames) { frames.delete(id); fn(); } };
  scroll(-500); assert.equal(state.top, 0); assert.equal(state.height, 110);
  scroll(40); assert.equal(state.top, 40); // follows the slot back without jumping
  mobile = false; scroll(100); assert.equal(state, null);
  cleanup(); assert.equal(scrollListeners.size, 0); assert.equal(frames.size, 0); assert.ok(disconnected);
  for (const overrides of [{ selectionCount: 0 }, { suspended: true }]) { View({ ...props, ...overrides }); effect(); assert.equal(state, null); assert.equal(scrollListeners.size, 0); }
  const page = fs.readFileSync('app/teacher/page.jsx', 'utf8');
  assert.ok(page.includes('selectionCount={selectedLearnerIds.length}'));
  assert.ok(page.includes('onClick={() => void bulkDeleteLearners()}'));
  assert.ok(page.includes('.learnerRoster tbody tr:hover td{background:transparent!important'));
  assert.ok(page.includes('.learnerRoster tbody tr.selectedRow:hover td{background:var(--crl-surface-2'));
  console.log('PASS actual mobile action-bar geometry follows its original slot, stays at the viewport top during scrolling, returns continuously, preserves desktop flow and releases listeners on deselection, modal suspension or unmount; roster hover preserves explicit selection and button callbacks');
})().catch(error => { console.error(error); process.exitCode = 1; });
