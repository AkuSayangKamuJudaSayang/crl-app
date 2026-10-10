// Finger movement is opposite to scroll movement. Allow a nested scroller to
// consume the gesture before suppressing the installed app's pull-to-refresh.
export function canConsumeVerticalTouch(target, fingerDelta, getStyle = getComputedStyle) {
  if (!fingerDelta) return false;
  let element = target?.nodeType === 1 ? target : target?.parentElement;
  for (; element; element = element.parentElement) {
    const style = getStyle(element);
    if (!/^(auto|scroll|overlay)$/.test(style.overflowY)) continue;
    const maximum = element.scrollHeight - element.clientHeight;
    if (maximum <= 0) continue;
    if (fingerDelta > 0 && element.scrollTop > 0) return true;
    if (fingerDelta < 0 && element.scrollTop < maximum - 1) return true;
    // A contained modal must not pass an edge gesture into the background.
    if (/^(contain|none)$/.test(style.overscrollBehaviorY)) return false;
  }
  return false;
}
