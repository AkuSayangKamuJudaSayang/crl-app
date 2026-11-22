const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

(async () => {
  const { hasVisibleOfflineSyncWork } = await import("../lib/offlineSyncNotice.mjs");
  const layout = fs.readFileSync("app/teacher/layout.jsx", "utf8");
  const settings = fs.readFileSync("components/TeacherOfflineSettings.jsx", "utf8");
  const runtime = fs.readFileSync("app/components/OfflineRuntime.jsx", "utf8");

  const page = fs.readFileSync("app/teacher/page.jsx", "utf8");
  assert.match(page, /user && !offlineAssessment && <TeacherOfflineSyncNotice/);
  assert(!layout.includes("TeacherOfflineSyncNotice"), "Standalone live assessments must remain free from sync prompts");
  assert(!fs.readFileSync("app/layout.jsx", "utf8").includes("TeacherOfflineSyncNotice"), "No public-page leak");
  // Keep durable writes, retry and authentication; hiding UI cannot delete work.
  assert(runtime.includes("window.__crlOfflineSyncStatus = status"));
  assert(runtime.includes("crl-offline-sync-status"));
  assert(runtime.includes("crl-offline-sync-retry"));
  assert(runtime.includes("getOfflineOutbox"));
  assert(runtime.includes("await removeOfflineMutation(entry.id)"));
  assert(settings.includes("PendingDeletionPasswordDialog"));
  assert(settings.includes("crl-offline-sync-retry"));
  assert(settings.includes("DELETION_AUTH_REQUIRED"));

  const source = settings
    .replace(/^import[^;]+;\s*/gm, "")
    .replace("export default function", "function");
  const { code } = await require("next/dist/build/swc").transform(source, {
    filename: "TeacherOfflineSettings.jsx",
    jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "classic" } } },
  });
  const context = vm.createContext({
    React,
    document: { body: {} },
    createPortal: content => content,
    useEffect() {},
    useRef: () => ({ current: null }),
    useState(initial) {
      const index = context.hookIndex++;
      const value = index < context.hookValues.length ? context.hookValues[index] : initial;
      return [value, () => {}];
    },
    LocalAssessmentPairing: () => React.createElement("p", null, "Device pairing controls"),
    PendingDeletionPasswordDialog: () => React.createElement("section", { role: "dialog" }, "Confirm pending deletions"),
    hasVisibleOfflineSyncWork,
    findLinkedAssessmentPeerSession: () => null,
    getTeacherDevicePairingCode: () => "ABC123",
    subscribeAssessmentLink: () => () => {},
  });
  vm.runInContext(code + "\nglobalThis.Settings=TeacherOfflineSettings;", context);
  const render = (open, syncStatus, confirmDeletion = false) => {
    context.hookIndex = 0;
    context.hookValues = [open, "ABC123", syncStatus, confirmDeletion];
    return renderToStaticMarkup(React.createElement(context.Settings, { offline: false }));
  };
  const pending = { phase: "waiting", completed: 0, total: 38,
    current: { title: "End assessment", details: ["Synthetic learner"] },
    message: "Saved on this device. Sync resumes automatically when connected." };

  assert(!render(false, pending).includes("38 pending"),
    "38 pending changes never create an intrusive dashboard banner");
  assert(!render(false, pending).includes("End assessment"),
    "Sync details stay private inside Offline Mode Settings");
  const insideSettings = render(true, pending);
  assert(insideSettings.includes("Saved offline changes: 38 pending"),
    "The pending count stays accessible in settings");
  assert(insideSettings.includes("Retry sync"), "Manual retry is preserved");
  assert(insideSettings.includes("Device pairing controls"), "Pairing is not removed");
  assert(!insideSettings.includes("Synthetic learner"),
    "Pending entries should not expose learner names unnecessarily");

  const blocked = { ...pending, phase: "blocked", code: "DELETION_AUTH_REQUIRED",
    message: "Pending learner deletions require password confirmation." };
  assert(render(true, blocked).includes("Confirm pending deletions"),
    "Deletion password recovery stays accessible inside settings");
  assert(!render(false, blocked).includes("Confirm pending deletions"),
    "No unrelated floating deletion UI appears over the roster");
  assert(render(true, { phase: "idle" }).includes("Device pairing controls"),
    "Empty queue must not affect existing pairing controls");
  assert(!render(true, { phase: "idle" }).includes("Saved offline changes:"),
    "No ghost pending work appears in settings");

  for (const status of [
    { phase: "waiting", message: "Unable to read or synchronize saved changes." },
    { phase: "blocked", total: 0, completed: 0, message: "Unknown local error." },
    { phase: "syncing", total: 0, completed: 0, message: "Stale sync check." },
  ]) {
    assert.equal(hasVisibleOfflineSyncWork(status), false,
      "An unverified queue must never be displayed as real pending work");
    assert(!render(true, status).includes("Saved offline changes:"));
  }
  const notice = fs.readFileSync("components/TeacherOfflineSyncNotice.jsx", "utf8")
    .replace("<style jsx>", "<style>")
    .replace(/^import[^;]+;\s*/gm, "")
    .replace("export default function", "function");
  const compiled = await require("next/dist/build/swc").transform(notice, {
    filename: "TeacherOfflineSyncNotice.jsx",
    jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "classic" } } },
  });
  vm.runInContext(compiled.code + "\nglobalThis.Notice=TeacherOfflineSyncNotice;", context);
  const renderNotice = (status, userId = 901) => {
    context.hookIndex = 0;
    context.hookValues = [status];
    return renderToStaticMarkup(React.createElement(context.Notice, { userId }));
  };
  const progress = { ...pending, userId: 901, phase: "syncing", current: { ...pending.current, finishedAssessment: true } };
  assert.match(renderNotice(progress), /Syncing offline assessment records to the cloud/);
  assert.doesNotMatch(renderNotice(progress), /Synthetic learner/);
  assert.equal(renderNotice(progress, 902), "");
  assert.equal(renderNotice({ ...progress, current: { finishedAssessment: false } }), "");
  assert.equal(renderNotice({ ...progress, phase: "waiting" }), "");
  assert.equal(renderNotice({ ...progress, phase: "blocked" }), "");
  assert.match(renderNotice({ ...progress, phase: "success", assessmentRecordsSynced: true }), /Offline assessment records synced/);
  assert(!render(true, { ...progress, phase: "success", completed: progress.total }).includes("Saved offline changes:"));
  console.log("PASS green prompts only cover completed assessment uploads, with pending and deletion actions confined to settings");
})().catch(error => { console.error(error); process.exitCode = 1; });
