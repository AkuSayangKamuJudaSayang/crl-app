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
