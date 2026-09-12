const PROMPT_KEY = "__crlPwaInstallPrompt";
const READY_EVENT = "crl-pwa-install-prompt-ready";
const LISTENER_KEY = "__crlPwaInstallListenerInstalled";

function getWindow() {
  return typeof window === "undefined" ? null : window;
}

export function getPwaInstallPrompt() {
  const win = getWindow();
  return win?.[PROMPT_KEY] || null;
}

export function clearPwaInstallPrompt() {
  const win = getWindow();
  if (!win) return;
  win[PROMPT_KEY] = null;
}

export function subscribePwaInstallPrompt(listener) {
  const win = getWindow();
  if (!win || typeof listener !== "function") return () => {};

  const handler = () => listener(getPwaInstallPrompt());
  win.addEventListener(READY_EVENT, handler);

  const current = getPwaInstallPrompt();
  if (current) {
    queueMicrotask(() => listener(current));
  }

  return () => win.removeEventListener(READY_EVENT, handler);
}

export function ensurePwaInstallPromptCapture() {
  const win = getWindow();
  if (!win || win[LISTENER_KEY]) return;

  win[LISTENER_KEY] = true;

  win.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    win[PROMPT_KEY] = event;
    win.dispatchEvent(new Event(READY_EVENT));
  });

  win.addEventListener("appinstalled", () => {
    clearPwaInstallPrompt();
    win.dispatchEvent(new Event(READY_EVENT));
  });
}

ensurePwaInstallPromptCapture();
