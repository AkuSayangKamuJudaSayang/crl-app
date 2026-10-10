const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('lib/learnerClipboard.js', 'utf8').replace(/^export /gm, ''), context);
const listeners = new Map(), attributes = new Map();
const field = { closest() { return this; }, selectionStart: 0, selectionEnd: 6 };
const other = { closest() { return null; } };
let selection = null;
const doc = {
  activeElement: other,
  getSelection: () => selection,
  documentElement: {
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
  },
  addEventListener: (name, handler, capture) => { assert.equal(capture, true); listeners.set(name, handler); },
  removeEventListener: (name, handler, capture) => { assert.equal(capture, true); assert.equal(listeners.get(name), handler); listeners.delete(name); },
};
function dispatch(type, target, extra = {}) {
  const event = { target, key: '', prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
  listeners.get(type)?.(event);
  assert.equal(event.prevented, event.stopped);
  return event.prevented;
}
const release = context.installLearnerClipboardGuard(doc);
assert.equal(attributes.has('data-crl-learner-restricted'), true);
for (const event of ['cut', 'paste', 'drop', 'dragstart', 'selectstart', 'contextmenu']) {
  assert.equal(dispatch(event, other), true);
  assert.equal(dispatch(event, field), false);
}
for (const inputType of ['insertFromPaste', 'insertFromDrop', 'deleteByCut']) {
  assert.equal(dispatch('beforeinput', other, { inputType }), true);
  assert.equal(dispatch('beforeinput', field, { inputType }), false);
}
assert.equal(dispatch('beforeinput', other, { inputType: 'insertText' }), false);
for (const extra of [{key:'c',ctrlKey:true},{key:'v',metaKey:true},{key:'a',ctrlKey:true},{key:'X',metaKey:true},{key:'Insert',shiftKey:true},{key:'Insert',ctrlKey:true},{key:'Delete',shiftKey:true}]) {
  assert.equal(dispatch('keydown', other, extra), true);
  assert.equal(dispatch('keydown', field, extra), false);
}
assert.equal(dispatch('keydown', other, { key:'Tab' }), false);
assert.equal(dispatch('copy', other), true);
doc.activeElement = field;
assert.equal(dispatch('copy', field), false);
field.selectionEnd = 0;
assert.equal(dispatch('copy', field), true);
doc.activeElement = other;
selection = { rangeCount: 1, isCollapsed: false, getRangeAt: () => ({ startContainer: field, endContainer: field }) };
assert.equal(dispatch('copy', field), false);
selection.getRangeAt = () => ({ startContainer: field, endContainer: other });
assert.equal(dispatch('copy', field), true);
selection.getRangeAt = () => ({ startContainer: other, endContainer: other });
assert.equal(dispatch('copy', other), true);
release();
assert.equal(listeners.size, 0);
assert.equal(attributes.has('data-crl-learner-restricted'), false);
assert.equal(dispatch('paste', other), false);
attributes.set('data-crl-learner-restricted', 'existing');
context.installLearnerClipboardGuard(doc)();
assert.equal(attributes.get('data-crl-learner-restricted'), 'existing');
console.log('PASS installed learner clipboard blocks passage/text copying, pasting, dragging and shortcuts; code fields remain usable and cleanup restores normal controls');

// A modal/textarea consumes a swipe before the root refresh guard sees it.
const touch = vm.createContext({});
vm.runInContext(fs.readFileSync('lib/touchScroll.js', 'utf8').replace(/^export /gm, ''), touch);
const surface = (parent, top, height, client, overflow = 'auto', overscroll = 'contain') => ({ nodeType: 1, parentElement: parent, scrollTop: top, scrollHeight: height, clientHeight: client, style: { overflowY: overflow, overscrollBehaviorY: overscroll } });
const root = surface(null, 0, 1000, 500, 'hidden', 'none');
const modal = surface(root, 150, 800, 400);
const child = surface(modal, 0, 50, 50, 'visible', 'auto');
const consume = (target, delta) => touch.canConsumeVerticalTouch(target, delta, el => el.style);
assert.equal(consume(child, 30), true, 'a downwards finger swipe scrolls the modal upwards');
assert.equal(consume(child, -30), true, 'an upwards finger swipe scrolls the modal downwards');
modal.scrollTop = 0;
assert.equal(consume(child, 30), false, 'the modal top cannot pull-refresh the app');
assert.equal(consume(child, -30), true);
modal.scrollTop = 400;
assert.equal(consume(child, -30), false, 'the modal bottom cannot scroll the background');
assert.equal(consume(child, 30), true, 'reversing the gesture at the bottom immediately works');
const textarea = surface(modal, 5, 100, 50, 'auto', 'auto');
assert.equal(consume(textarea, 20), true, 'a code textarea may consume its own swipe');
textarea.scrollTop = 0;
assert.equal(consume(textarea, 20), true, 'a textarea edge can scroll its modal');
assert.equal(consume({nodeType:3,parentElement:child}, 20), true, 'text nodes find their scroller');
assert.equal(consume(null, 20), false);
assert.equal(consume(child, 0), false);
assert.equal(consume(root, 20), false, 'hidden root overflow is not a scroller');
console.log('PASS installed-app refresh protection allows modal and code-field scrolling in both directions, including reversals, while containing edge gestures');
