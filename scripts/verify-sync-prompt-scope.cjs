const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

(async () => {
  const source = fs.readFileSync("app/components/OfflineSyncPrompt.jsx", "utf8")
    .replace(/^import[^;]+;\s*/gm, "")
    .replace("export default function", "function")
    .replace("<style jsx>", "<style>");
  const { code } = await require("next/dist/build/swc").transform(source, {
    filename: "sync-prompt-scope.jsx", jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "classic" } } },
  });
  const context = vm.createContext({ React, useEffect() {}, useState: () => [context.status, () => {}], usePathname: () => context.pathname });
  vm.runInContext(code, context);
  for (const phase of ["syncing", "waiting", "blocked", "success"]) {
    context.status = { phase, total: 5, completed: 0, current: { title: "End assessment", details: ["Private learner test fixture", "BoSY"] }, message: "Test synchronization state." };
    for (const path of ["/", "/login", "/login/verify", "/learner", "/admin", "/teacher-extra", undefined]) {
      context.pathname = path;
      assert.equal(renderToStaticMarkup(React.createElement(context.OfflineSyncPrompt)), "", `${phase} status must not reveal assessment details on ${path}`);
    }
    for (const path of ["/teacher", "/teacher/assessment"]) {
      context.pathname = path;
      const markup = renderToStaticMarkup(React.createElement(context.OfflineSyncPrompt));
      assert.ok(markup.includes('aria-label="Offline synchronization"'));
      assert.ok(markup.includes("Private learner test fixture"));
      if (phase === "blocked") assert.ok(markup.includes("Sync needs attention"));
    }
  }
  assert.ok(!fs.readFileSync("app/layout.jsx", "utf8").includes("OfflineSyncPrompt"), "The public root layout must not mount the teacher prompt");
  assert.ok(fs.readFileSync("app/teacher/layout.jsx", "utf8").includes("<OfflineSyncPrompt />"));
  console.log("PASS every sync state is teacher-only; landing, login, learner and admin pages cannot display queued learner details");
})().catch(error => { console.error(error); process.exitCode = 1; });
