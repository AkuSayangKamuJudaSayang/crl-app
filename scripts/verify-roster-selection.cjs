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

  // Run the actual component effect: only a breakpoint change may move the
  // single action group into the desktop toolbar. Swipes have no JS handlers.
  const swc = require('next/dist/build/swc');
  const source = fs.readFileSync('components/RosterSelectionActions.jsx', 'utf8');
  const compiled = await swc.transform(source, { filename: 'Actions.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } });
  let state = null, effect, mobile = true, sync, portalTarget = null;
  const inlineTargetRef = { current: { id: 'original-toolbar' } };
  const media = { get matches() { return mobile; }, addEventListener: (type, fn) => { assert.equal(type, 'change'); sync = fn; }, removeEventListener: (type, fn) => { assert.equal(fn, sync); sync = null; } };
  const ctx = { module: { exports: {} }, window: { matchMedia: () => media }, require: name => {
    if (name === 'react') return { useState: () => [state, next => { state = next; }], useLayoutEffect: fn => { effect = fn; } };
    if (name === 'react-dom') return { createPortal: (node, target) => { portalTarget = target; return node; } };
    if (name.endsWith('.css')) return { slot: 'slot', bar: 'bar', active: 'active' };
    return require(name);
  } };
  ctx.exports = ctx.module.exports; vm.runInNewContext(compiled.code, ctx);
  const View = ctx.module.exports.default, props = { inlineTargetRef, selectionCount: 2, children: 'Three real action buttons' };
  let view = View(props); const cleanup = effect(); assert.equal(state, null); assert.equal(view.props.className, 'slot active');
  for (const selectionCount of [1, 20, 3]) { view = View({ ...props, selectionCount }); assert.equal(view.props.className, 'slot active'); }
  view = View({ ...props, selectionCount: 0 }); assert.equal(view.props.className, 'slot');
  view = View({ ...props, suspended: true }); assert.equal(view.props.className, 'slot');
  mobile = false; sync(); View(props); assert.equal(portalTarget, inlineTargetRef.current);
  mobile = true; sync(); assert.equal(state, null); assert.equal(View(props).props.className, 'slot active');
  cleanup(); assert.equal(sync, null);
  assert.ok(!/requestAnimationFrame|getBoundingClientRect|ResizeObserver|visualViewport|addEventListener\(["']scroll/.test(source));
  const css = fs.readFileSync('components/RosterSelectionActions.module.css', 'utf8');
  assert.ok(css.includes('position:sticky')); assert.ok(css.includes('top:env(safe-area-inset-top,0px)')); assert.ok(!css.includes('position:fixed'));
  const page = fs.readFileSync('app/teacher/page.jsx', 'utf8');
  assert.ok(page.includes('selectionCount={selectedLearnerIds.length}'));
  assert.ok(page.includes('onClick={() => void bulkDeleteLearners()}'));
  assert.ok(page.includes('.learnerRoster tbody tr:hover td{background:transparent!important'));
  assert.ok(page.includes('.learnerRoster tbody tr.selectedRow:hover td{background:var(--crl-surface-2'));
  assert.ok(page.includes('hasConductRoster'));
  assert.ok(page.includes('.teacherShell.hasConductRoster .conductLearnerPanel{overflow:visible}'));
  assert.ok(page.indexOf('ref={rosterSelectionInlineRef} className="rosterSelectionInline"') < page.indexOf('<RosterSelectionActions inlineTargetRef='));
  console.log('PASS native sticky mobile actions stay in roster flow with no JS scroll/position tracking; actual component keeps one group, preserves desktop toolbar placement, disables sticking on deselect/suspension and cleans breakpoint listeners');
})().catch(error => { console.error(error); process.exitCode = 1; });
