// Watch this registration, never serviceWorker.ready (which can resolve to the
// older root teacher worker while the scoped learner worker is activating).
export function watchLearnerWorker(registration) {
  let disposed=false,worker=null;
  const warm=()=>{
    if(!disposed&&registration.active?.state==='activated')registration.active.postMessage({type:'WARM_LEARNER_SHELL'});
  };
  const observe=()=>{
    worker?.removeEventListener('statechange',changed);
    worker=registration.installing||registration.waiting;
    worker?.addEventListener('statechange',changed);
    warm();
  };
  const changed=()=>{warm();};
  registration.addEventListener('updatefound',observe);
  window.addEventListener('online',warm);
  observe();
  // Update checks can hang on a weak connection. They must not hold warming or UI.
  void registration.update().catch(()=>{});
  return()=>{disposed=true;registration.removeEventListener('updatefound',observe);worker?.removeEventListener('statechange',changed);window.removeEventListener('online',warm);};
}
