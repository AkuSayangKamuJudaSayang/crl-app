export async function registerLearnerServiceWorker() {
  if (!("serviceWorker" in navigator)) return undefined;

  try {
    /*
     * Older CRL-App builds registered learner-pwa-sw.js at the root scope.
     * That competed with the main /sw.js registration and could prevent the
     * learner manifest from becoming installable. Remove only that old learner
     * worker; never unregister the main application worker.
     */
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => {
          const scope = String(registration.scope || "");
          const scriptUrl = String(
            registration.active?.scriptURL ||
              registration.waiting?.scriptURL ||
              registration.installing?.scriptURL ||
              ""
          );

          return (
            scope === `${window.location.origin}/` &&
            scriptUrl.endsWith("/learner-pwa-sw.js")
          );
        })
        .map((registration) => registration.unregister())
    );

    const registration = await navigator.serviceWorker.register(
      "/learner-pwa-sw.js",
      { scope: "/learner" }
    );

    return registration;
  } catch {
    return undefined;
  }
}


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
