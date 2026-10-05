const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const origin = "https://crl.test";
const normalize = (input) => new URL(typeof input === "string" ? input : input.url, origin).href;
const stores = new Map();
const caches = {
  async open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      async match(input) { return entries.get(normalize(input))?.clone(); },
      async put(input, response) { entries.set(normalize(input), response.clone()); },
      async keys() { return [...entries.keys()].map((url) => new Request(url)); },
    };
  },
  async keys() { return [...stores.keys()]; },
  async delete(name) { return stores.delete(name); },
  async match(input) {
    for (const name of await this.keys()) {
      const result = await (await this.open(name)).match(input);
      if (result) return result;
    }
  },
};
const listeners = new Map();
const resources = new Map();
const fetched = [];
let offline = false;
class WorkerRequest extends Request {
  constructor(input, options) { super(normalize(input), options); }
}
const context = vm.createContext({
  caches, URL, Request: WorkerRequest, Response, console,
  fetch: async (input) => {
    const url = normalize(input);
    fetched.push(url);
    if (offline || !resources.has(url)) throw new TypeError("Network unavailable");
    return resources.get(url).clone();
  },
  self: {
    location: { origin },
    addEventListener(type, listener) { listeners.set(type, listener); },
    skipWaiting() {},
    clients: { async claim() {} },
  },
});
vm.runInContext(fs.readFileSync("public/sw.js", "utf8"), context);
const run = (source) => vm.runInContext(source, context);
function resource(path, body, type = "text/javascript") {
  resources.set(normalize(path), new Response(body, { headers: { "content-type": type } }));
}
async function dispatch(type, request, data) {
  const pending = [];
  let response;
  listeners.get(type)({ request, data,
    waitUntil(promise) { pending.push(promise); },
    respondWith(promise) { response = promise; },
  });
  const result = response ? await response : undefined;
  await Promise.all(pending);
  return result;
}

(async () => {
  const currentName = run("CACHE_NAME");
  const html = '<script src="/_next/static/chunks/assessment.js"></script><link href="/_next/static/css/app.css" rel="stylesheet"><script src="https://other.test/ignore.js"></script>';
  resource("/teacher/assessment", html, "text/html");
  resource("/_next/static/chunks/assessment.js", "assessment bundle");
  resource("/_next/static/css/app.css", "body {}", "text/css");
  await run('cacheUrls(["/teacher/assessment", "/unavailable-optional-asset"])');
  const current = await caches.open(currentName);
  assert.ok(await current.match("/teacher/assessment"));
  assert.equal(await (await current.match("/_next/static/chunks/assessment.js")).text(), "assessment bundle");
  assert.ok(await current.match("/_next/static/css/app.css"));
  assert.ok(!fetched.some((url) => url.startsWith("https://other.test")));
  console.log("PASS cached assessment document includes its scripts and styles despite optional failures");

  const previous = await caches.open("crla-pwa-v22");
  await previous.put("/_next/static/chunks/previous-build.js", new Response("old tab bundle"));
  await previous.put("/teacher", new Response("old dashboard"));
  const learner = await caches.open("learner-private-cache");
  await learner.put("/learner", new Response("learner shell"));
  await dispatch("activate");
  assert.equal(await (await current.match("/_next/static/chunks/previous-build.js")).text(), "old tab bundle");
  assert.equal(await current.match("/teacher"), undefined);
  assert.ok(!stores.has("crla-pwa-v22"));
  assert.ok(stores.has("learner-private-cache"));
  console.log("PASS worker upgrade preserves open-tab chunks without retaining old documents or removing learner caches");

  offline = true;
  const url = `${origin}/teacher/assessment?code=ABC123&learner_id=406&period=BoSY`;
  const response = await dispatch("fetch", { url, method: "GET", mode: "navigate" });
  assert.equal(await response.text(), html);
  const asset = await dispatch("fetch", { url: normalize("/_next/static/chunks/previous-build.js"), method: "GET" });
  assert.equal(await asset.text(), "old tab bundle");
  await assert.rejects(dispatch("fetch", { url: normalize("/api/assessment?action=host_get"), method: "GET" }), /Network unavailable/);
  console.log("PASS offline assessment navigation serves its own shell and cached builds; API stays network-only");

  offline = false;
  resource("/_next/static/chunks/reconnected.js", "reconnected bundle");
  resource("/teacher/assessment", '<script src="/_next/static/chunks/reconnected.js"></script>', "text/html");
  await dispatch("message", undefined, { type: "WARM_CRLA_APP" });
  assert.ok(await current.match("/_next/static/chunks/reconnected.js"));
  console.log("PASS reconnection warm-up retries dependencies that were previously unavailable");

  resource("/teacher", '<script src="/_next/static/chunks/navigation.js"></script>', "text/html");
  resource("/_next/static/chunks/navigation.js", "navigation bundle");
  await dispatch("fetch", { url: normalize("/teacher"), method: "GET", mode: "navigate" });
  assert.ok(await current.match("/_next/static/chunks/navigation.js"));
  console.log("PASS document dependency caching completes within the fetch event lifetime");
})().catch((error) => { console.error(error); process.exitCode = 1; });
