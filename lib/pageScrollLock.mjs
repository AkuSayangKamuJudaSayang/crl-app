// Dialogs and dashboard transitions may overlap or unmount in either order.
// Only the final owner restores the original page styles and scroll position.
const locks = new WeakMap();

export function acquirePageScrollLock(doc = document) {
  const existing = locks.get(doc);
  if (existing) existing.owners += 1;
  else {
    const body = doc.body, html = doc.documentElement, view = doc.defaultView;
    const properties = ["overflow", "position", "top", "left", "right", "width"];
    const snapshot = element => properties.map(property => [
      property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property),
    ]);
    const state = {
      owners: 1, body, html, view,
      bodyStyles: snapshot(body),
      htmlOverflow: [html.style.getPropertyValue("overflow"), html.style.getPropertyPriority("overflow")],
      x: view.scrollX, y: view.scrollY,
    };
    locks.set(doc, state);
    html.style.setProperty("overflow", "hidden");
    body.style.setProperty("overflow", "hidden");
    body.style.setProperty("position", "fixed");
    body.style.setProperty("top", `-${state.y}px`);
    body.style.setProperty("left", `-${state.x}px`);
    body.style.setProperty("right", "0");
    body.style.setProperty("width", "100%");
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const state = locks.get(doc);
    if (--state.owners) return;
    locks.delete(doc);
    const restore = (element, property, value, priority) => {
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    };
    restore(state.html, "overflow", ...state.htmlOverflow);
    state.bodyStyles.forEach(([property, value, priority]) => restore(state.body, property, value, priority));
    state.view.scrollTo(state.x, state.y);
  };
}
