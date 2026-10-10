// Only the native code controls are clipboard destinations in the installed app.
export function codeFieldFrom(target) {
  const element = target?.nodeType === 3 ? target.parentElement : target;
  const field = element?.closest?.("input[data-crl-code-field], textarea[data-crl-code-field]");
  return field || null;
}

export function installLearnerClipboardGuard(doc) {
  const html = doc.documentElement;
  const previous = html.getAttribute("data-crl-learner-restricted");
  html.setAttribute("data-crl-learner-restricted", "");
  const codeSelection = () => {
    const field = codeFieldFrom(doc.activeElement);
    if (field && field.selectionStart !== field.selectionEnd) return true;
    const selection = doc.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return false;
    for (let index = 0; index < selection.rangeCount; index++) {
      const range = selection.getRangeAt(index);
      const start = codeFieldFrom(range.startContainer);
      if (!start || start !== codeFieldFrom(range.endContainer)) return false;
    }
    return true;
  };
  const block = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const copy = event => { if (!codeSelection()) block(event); };
  const edit = event => { if (!codeFieldFrom(event.target)) block(event); };
  const beforeInput = event => {
    if (["insertFromPaste", "insertFromDrop", "deleteByCut"].includes(event.inputType)) edit(event);
  };
  const key = event => {
    const letter = event.key.toLowerCase();
    const clipboardShortcut = ((event.ctrlKey || event.metaKey) && ["a", "c", "v", "x"].includes(letter))
      || (event.key === "Insert" && (event.ctrlKey || event.shiftKey))
      || (event.key === "Delete" && event.shiftKey);
    if (clipboardShortcut && !codeFieldFrom(event.target)) block(event);
  };
  const handlers = { copy, cut: edit, paste: edit, beforeinput: beforeInput, keydown: key, contextmenu: edit, selectstart: edit, dragstart: edit, drop: edit };
  Object.entries(handlers).forEach(([type, handler]) => doc.addEventListener(type, handler, true));
  return () => {
    Object.entries(handlers).forEach(([type, handler]) => doc.removeEventListener(type, handler, true));
    if (previous === null) html.removeAttribute("data-crl-learner-restricted");
    else html.setAttribute("data-crl-learner-restricted", previous);
  };
}
