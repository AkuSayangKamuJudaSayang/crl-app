// Code controls and explicitly marked code displays remain selectable.
export function codeFieldFrom(target) {
  const element = target?.nodeType === 3 ? target.parentElement : target;
  const field = element?.closest?.("input[data-crl-code-field], textarea[data-crl-code-field], [data-crl-copyable-code]");
  return field || null;
}

export function installLearnerClipboardGuard(doc, { allowEditing = false, attribute = "data-crl-learner-restricted" } = {}) {
  const html = doc.documentElement;
  const previous = html.getAttribute(attribute);
  html.setAttribute(attribute, "");
  const allowedFrom = target => {
    const element = target?.nodeType === 3 ? target.parentElement : target;
    return codeFieldFrom(element) || (allowEditing ? element?.closest?.('input:not([readonly]):not([disabled]),textarea:not([readonly]):not([disabled]),[contenteditable="true"],[contenteditable=""]') : null);
  };
  const codeSelection = () => {
    const selection = doc.getSelection();
    if (selection?.rangeCount && !selection.isCollapsed) {
      for (let index = 0; index < selection.rangeCount; index++) {
        const range = selection.getRangeAt(index);
        const start = allowedFrom(range.startContainer);
        if (!start || start !== allowedFrom(range.endContainer)) return false;
      }
      return true;
    }
    const field = allowedFrom(doc.activeElement);
    return Boolean(field && typeof field.selectionStart === "number" && field.selectionStart !== field.selectionEnd);
  };
  const block = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const copy = event => { if (!codeSelection()) block(event); };
  const edit = event => { if (!allowedFrom(event.target)) block(event); };
  const beforeInput = event => {
    if (["insertFromPaste", "insertFromDrop", "deleteByCut"].includes(event.inputType)) edit(event);
  };
  const key = event => {
    const letter = event.key.toLowerCase();
    const clipboardShortcut = ((event.ctrlKey || event.metaKey) && ["a", "c", "v", "x"].includes(letter))
      || (event.key === "Insert" && (event.ctrlKey || event.shiftKey))
      || (event.key === "Delete" && event.shiftKey);
    const copying = ((event.ctrlKey || event.metaKey) && letter === "c") || (event.key === "Insert" && event.ctrlKey);
    const pasting = ((event.ctrlKey || event.metaKey) && letter === "v") || (event.key === "Insert" && event.shiftKey);
    if (clipboardShortcut && !allowedFrom(event.target) && !(copying && codeSelection()) && !(allowEditing && pasting)) block(event);
  };
  // Normal file drop/import and paste stay untouched in the shared app policy.
  // The legacy strict option is retained for explicit code-only consumers.
  const handlers = { copy, cut: edit, keydown: key, selectstart: edit, dragstart: edit,
    ...(allowEditing ? {} : { paste: edit, beforeinput: beforeInput, drop: edit, contextmenu: edit }) };
  Object.entries(handlers).forEach(([type, handler]) => doc.addEventListener(type, handler, true));
  return () => {
    Object.entries(handlers).forEach(([type, handler]) => doc.removeEventListener(type, handler, true));
    if (previous === null) html.removeAttribute(attribute);
    else html.setAttribute(attribute, previous);
  };
}

const appGuards = new WeakMap();
export function installAppClipboardGuard(doc) {
  let state = appGuards.get(doc);
  if (!state) {
    state = { owners: 0, release: installLearnerClipboardGuard(doc, { allowEditing: true, attribute: "data-crl-text-protected" }) };
    appGuards.set(doc, state);
  }
  state.owners++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--state.owners === 0) { state.release(); appGuards.delete(doc); }
  };
}
