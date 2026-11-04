const STATE_KEY = '__crlPwaInstallV2';
const READY_EVENT = 'crl-pwa-install-prompt-ready';
const CHOICE_TIMEOUT = 45000;

function state() {
  if (typeof window === 'undefined') return null;
  return window[STATE_KEY] ||= {prompt:null,used:new WeakSet(),pending:{},listening:false};
}
function currentApp() {
  if (typeof window === 'undefined') return null;
  const href = document.querySelector('link[rel~="manifest"]')?.href;
  if (href) {
    const path = new URL(href, window.location.href).pathname;
    if (path === '/learner-manifest.webmanifest') return 'learner';
    if (['/manifest.webmanifest','/teacher-manifest.webmanifest'].includes(path)) return 'teacher';
    return null;
  }
  return window.location.pathname.startsWith('/learner') ? 'learner' : 'teacher';
}
function notify() { window.dispatchEvent(new Event(READY_EVENT)); }

export function isStandalonePwa() {
  return typeof window !== 'undefined' && Boolean(window.navigator.standalone ||
    window.matchMedia?.('(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)')?.matches);
}
export function getPwaInstallPrompt(app = currentApp()) {
  const s = state(), saved = s?.prompt;
  return saved && saved.app === app && currentApp() === app && !s.used.has(saved.event) ? saved.event : null;
}
export function clearPwaInstallPrompt(app = currentApp()) {
  const s = state();
  if (s?.prompt?.app === app) {s.prompt=null;notify();}
}
export function subscribePwaInstallPrompt(listener, app) {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  ensurePwaInstallPromptCapture();
  const sync = () => listener(getPwaInstallPrompt(app));
  window.addEventListener(READY_EVENT,sync);
  sync();
  return () => window.removeEventListener(READY_EVENT,sync);
}
export function ensurePwaInstallPromptCapture() {
  const s=state();if (!s || s.listening) return;
  s.listening=true;
  window.addEventListener('beforeinstallprompt',event=>{
    const app=currentApp();if (!app) return;
    event.preventDefault();
    if (s.used.has(event)) return;
    s.prompt={event,app};notify();
  });
  window.addEventListener('appinstalled',()=>{
    const app=currentApp();
    clearPwaInstallPrompt(app);
    s.pending[app]?.confirm('accepted');
    // An install event is not proof that a mobile launcher has placed an icon.
    // Keep browser-tab help available; only standalone mode hides install UI.
    notify();
  });
}

// Intentionally synchronous until prompt(): browsers require a live user gesture.
// Never await service-worker readiness, a network request, or cache warming first.
export function requestPwaInstall(app) {
  ensurePwaInstallPromptCapture();
  const s=state();if (!s) return Promise.resolve('unavailable');
  if (isStandalonePwa()) return Promise.resolve('standalone');
  if (s.pending[app]) return s.pending[app].promise || Promise.resolve('pending');
  const event=getPwaInstallPrompt(app);
  if (!event) return Promise.resolve('unavailable');
  s.used.add(event);s.prompt=null;notify();
  let confirm;
  const installed=new Promise(resolve=>{confirm=resolve;});
  const job={confirm,promise:null};s.pending[app]=job;
  let prompted;
  try {prompted=event.prompt();} catch {delete s.pending[app];return Promise.resolve('failed');}
  let timer;
  const choice=Promise.resolve(prompted).then(()=>event.userChoice).then(value=>
    ['accepted','dismissed'].includes(value?.outcome)?value.outcome:'pending',()=> 'failed');
  const timeout=new Promise(resolve=>{timer=window.setTimeout(()=>resolve('pending'),CHOICE_TIMEOUT);});
  job.promise=Promise.race([choice,installed,timeout]).finally(()=>{
    window.clearTimeout(timer);
    if (s.pending[app]===job) delete s.pending[app];
    // Do not clear a newer beforeinstallprompt that arrived during this attempt.
    notify();
  });
  return job.promise;
}

export function installationHelp(app, nav = typeof navigator === 'undefined' ? {} : navigator) {
  const name=app==='learner'?'CRL-App Learner':'CRL-App Teacher';
  const ua=String(nav.userAgent||''),ios=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&nav.maxTouchPoints>1);
  const embedded=/FBAN|FBAV|Instagram|MicroMessenger|\bwv\b|Line\//i.test(ua);
  if (ios) return {name,platform:'iPhone / iPad',embedded,steps:[
    'Open this app page in Safari.',
    'Tap Share, then Add to Home Screen.',
    'Turn on Open as Web App if shown, then tap Add.'
  ],find:`Look for ${name} on your Home Screen or search in App Library.`,url:app==='learner'?'/learner':'/teacher'};
  if (/Android|HarmonyOS|OpenHarmony|HMOS/i.test(ua)) return {name,platform:'mobile',embedded,steps:[
    'Open this app page in your regular browser, such as Chrome or Edge.',
    'Open the browser menu and choose Install app or Add to Home screen.',
    'Confirm Install or Add and allow the browser to finish.'
  ],find:`Search your apps list for ${name}. If its icon is there, touch and hold it, then add or drag it to your Home screen.`,url:app==='learner'?'/learner':'/teacher'};
  return {name,platform:'computer',embedded,steps:[
    'Open this app page in Chrome or Edge, or Safari on a Mac.',
    'Choose Install app in the browser menu or address bar. In Safari, choose File, then Add to Dock.',
    'Confirm the installation.'
  ],find:`Search your device's apps, Start menu or Launchpad for ${name}.`,url:app==='learner'?'/learner':'/teacher'};
}

ensurePwaInstallPromptCapture();
